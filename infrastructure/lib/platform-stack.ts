import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrockagentcore';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { CfnResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags } from './config';

// Network
import { AlbConstruct } from './constructs/network/alb-construct';
import { EcsClusterConstruct } from './constructs/network/ecs-cluster-construct';
import { NetworkConstruct } from './constructs/network/network-construct';

// Identity
import { ArtifactRenderTokenSecretConstruct } from './constructs/identity/artifact-render-token-secret-construct';
import { AuthProvidersConstruct } from './constructs/identity/auth-providers-construct';
import { AuthSecretConstruct } from './constructs/identity/auth-secret-construct';
import { BffCookieKeyConstruct } from './constructs/identity/bff-cookie-key-construct';
import { CognitoConstruct } from './constructs/identity/cognito-construct';
import { OAuthTablesConstruct } from './constructs/identity/oauth-tables-construct';
import { PlatformIdentityConstruct } from './constructs/identity/platform-identity-construct';
import { VoiceTicketConstruct } from './constructs/identity/voice-ticket-construct';

// Data
import { AdminTablesConstruct } from './constructs/data/admin-tables-construct';
import { AssistantsTableConstruct } from './constructs/data/assistants-table-construct';
import { AuthTablesConstruct } from './constructs/data/auth-tables-construct';
import { CostTrackingTablesConstruct } from './constructs/data/cost-tracking-tables-construct';
import { FileUploadConstruct } from './constructs/data/file-upload-construct';
import { QuotaTablesConstruct } from './constructs/data/quota-tables-construct';
import { SharedConversationsConstruct } from './constructs/data/shared-conversations-construct';

// RAG (data half lives in Platform)
import { RagDataConstruct } from './constructs/rag/rag-data-construct';

// Artifacts (data + distribution; render Lambda lives in Backend)
import { ArtifactsDataConstruct } from './constructs/artifacts/artifacts-data-construct';
import { ArtifactsDistributionConstruct } from './constructs/artifacts/artifacts-distribution-construct';

// MCP sandbox (S3 + CloudFront — Platform edge surface)
import { McpSandboxBucketConstruct } from './constructs/mcp-sandbox/mcp-sandbox-bucket-construct';
import { McpSandboxDistributionConstruct } from './constructs/mcp-sandbox/mcp-sandbox-distribution-construct';

// Fine-tuning (data half lives in Platform)
import { FineTuningDataConstruct } from './constructs/fine-tuning/fine-tuning-data-construct';

// SPA (frontend bucket + CloudFront — Platform edge surface)
import { SpaBucketConstruct } from './constructs/spa/spa-bucket-construct';
import { SpaDistributionConstruct } from './constructs/spa/spa-distribution-construct';
import { RagCorsUpdaterConstruct } from './constructs/spa/rag-cors-updater-construct';

// Zones
import { AlbDnsConstruct } from './constructs/zones/alb-dns-construct';

import * as lambda from 'aws-cdk-lib/aws-lambda';

export interface PlatformStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * PlatformStack — every non-compute resource the application needs.
 *
 * Owns: VPC, ALB, ECS cluster, Cognito, every shared DynamoDB table,
 * every data S3 bucket (file upload, RAG, fine-tuning, SPA static,
 * artifacts content, mcp-sandbox shell), CloudFront distributions
 * (SPA, artifacts, mcp-sandbox), Route53 hosted zone + ACM cert +
 * alias records, Secrets Manager (auth secret, BFF cookie data key,
 * voice ticket signing, optional artifact render-token, OAuth client
 * secrets, auth provider secrets, Cognito BFF client secret),
 * shared `WorkloadIdentity`, KMS keys.
 *
 * Exposes typed `public readonly` properties so BackendStack can take
 * them as explicit construct props at instantiation time. CDK
 * auto-generates the underlying CFN exports / Fn::ImportValue from
 * the typed cross-stack reference.
 *
 * Two retained feature flags:
 *   - `config.artifacts.enabled`  → Artifacts data + distribution +
 *                                    render-token secret
 *   - `config.fineTuning.enabled` → Fine-tuning data
 *
 * The render Lambda lives in BackendStack (compute) and consumes
 * `artifactsContentBucket` + `artifactsTable` + `artifactRenderTokenSecret`
 * via typed prop passing.
 *
 * The artifacts CloudFront distribution needs the render Lambda's
 * Function URL as its origin. To keep the dependency direction
 * one-way (Backend → Platform) the distribution is parked behind a
 * `wireArtifactsDistribution(renderFunctionUrl)` method that
 * BackendStack calls **after** it has constructed the render Lambda
 * and forwarded the resulting Function URL back to Platform.
 *
 * The same two-step pattern wires the McpSandbox distribution and the
 * RAG-CORS updater (which depends on the SPA distribution domain).
 */
export class PlatformStack extends cdk.Stack {
  // ── Network
  public readonly vpc: ec2.IVpc;
  public readonly alb: elbv2.IApplicationLoadBalancer;
  public readonly albListener: elbv2.IApplicationListener;
  public readonly albSecurityGroup: ec2.ISecurityGroup;
  public readonly ecsCluster: ecs.ICluster;

  // ── Identity / crypto
  public readonly authSecret: secretsmanager.ISecret;
  public readonly voiceTicketSigningSecret: secretsmanager.ISecret;
  public readonly voiceTicketReplayTable: dynamodb.ITable;
  public readonly bffCookieSigningKey: kms.IKey;
  public readonly bffCookieDataKeySecret: secretsmanager.ISecret;
  public readonly platformWorkloadIdentity: bedrock.CfnWorkloadIdentity;
  public readonly oauthProvidersTable: dynamodb.ITable;
  public readonly oauthUserTokensTable: dynamodb.ITable;
  public readonly oauthTokenEncryptionKey: kms.IKey;
  public readonly oauthClientSecretsSecret: secretsmanager.ISecret;
  public readonly authProvidersTable: dynamodb.ITable;
  public readonly authProviderSecretsSecret: secretsmanager.ISecret;
  public readonly userPool: cognito.IUserPool;
  public readonly bffAppClient: cognito.IUserPoolClient;
  public readonly bffAppClientSecret: secretsmanager.ISecret;
  public readonly cognitoDomain: cognito.UserPoolDomain;

  // ── Data tables
  public readonly oidcStateTable: dynamodb.ITable;
  public readonly bffSessionsTable: dynamodb.ITable;
  public readonly usersTable: dynamodb.ITable;
  public readonly appRolesTable: dynamodb.ITable;
  public readonly apiKeysTable: dynamodb.ITable;
  public readonly userQuotasTable: dynamodb.ITable;
  public readonly quotaEventsTable: dynamodb.ITable;
  public readonly sessionsMetadataTable: dynamodb.ITable;
  public readonly userCostSummaryTable: dynamodb.ITable;
  public readonly systemCostRollupTable: dynamodb.ITable;
  public readonly managedModelsTable: dynamodb.ITable;
  public readonly userSettingsTable: dynamodb.ITable;
  public readonly userMenuLinksTable: dynamodb.ITable;
  public readonly assistantsTable: dynamodb.ITable;
  public readonly sharedConversationsTable: dynamodb.ITable;
  public readonly fileUploadBucket: s3.IBucket;
  public readonly fileUploadTable: dynamodb.ITable;

  // ── RAG (data half)
  public readonly ragDocumentsBucket: s3.IBucket;
  public readonly ragAssistantsTable: dynamodb.ITable;
  public readonly ragVectorBucketName: string;
  public readonly ragVectorIndexName: string;
  public readonly ragVectorBucket: CfnResource;
  public readonly ragVectorIndex: CfnResource;

  // ── SPA edge
  public readonly spaBucket: s3.IBucket;
  public readonly spaDistribution: cloudfront.IDistribution;
  public readonly spaDistributionDomainName: string;

  // ── MCP sandbox edge (always-on)
  public readonly mcpSandboxBucket: s3.IBucket;
  public readonly mcpSandboxDistribution: cloudfront.IDistribution;
  public readonly mcpSandboxProxyOrigin: string;

  // ── Artifacts (gated)
  public readonly artifactsContentBucket?: s3.IBucket;
  public readonly artifactsTable?: dynamodb.ITable;
  public readonly artifactRenderTokenSecret?: secretsmanager.ISecret;
  /**
   * The CSP `frame-ancestors` source list resolved for the artifacts
   * iframe origin (space-separated). Forwarded to BackendStack so the
   * render Lambda's `FRAME_ANCESTOR_ORIGIN` env var stays byte-
   * identical with the CloudFront response-headers-policy.
   */
  public readonly artifactsFrameAncestors?: string;

  // ── Fine-tuning (gated)
  public readonly fineTuningJobsTable?: dynamodb.ITable;
  public readonly fineTuningAccessTable?: dynamodb.ITable;
  public readonly fineTuningDataBucket?: s3.IBucket;

  // ── Internal handles for the two-step wiring methods
  private readonly _config: AppConfig;
  private readonly _spaBucketConstruct: SpaBucketConstruct;
  private readonly _mcpSandboxBucketConstruct: McpSandboxBucketConstruct;
  private readonly _artifactsDataConstruct?: ArtifactsDataConstruct;
  private _spaDistributionConstruct?: SpaDistributionConstruct;
  private _artifactsDistributionConstruct?: ArtifactsDistributionConstruct;

  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props);

    const { config } = props;
    this._config = config;
    applyStandardTags(this, config);

    // ============================================================
    // Network
    // ============================================================
    const network = new NetworkConstruct(this, 'Network', { config });
    this.vpc = network.vpc;

    const alb = new AlbConstruct(this, 'Alb', { config, vpc: this.vpc });
    this.alb = alb.alb;
    this.albListener = alb.albListener;
    this.albSecurityGroup = alb.albSecurityGroup;

    const ecsCluster = new EcsClusterConstruct(this, 'EcsCluster', {
      config,
      vpc: this.vpc,
    });
    this.ecsCluster = ecsCluster.ecsCluster;

    // ============================================================
    // Identity / crypto
    // ============================================================
    const authSecret = new AuthSecretConstruct(this, 'AuthSecret', { config });
    this.authSecret = authSecret.authSecret;

    const voice = new VoiceTicketConstruct(this, 'VoiceTicket', { config });
    this.voiceTicketSigningSecret = voice.signingSecret;
    this.voiceTicketReplayTable = voice.replayTable;

    const bffCookie = new BffCookieKeyConstruct(this, 'BffCookieKey', {
      config,
    });
    this.bffCookieSigningKey = bffCookie.signingKey;
    this.bffCookieDataKeySecret = bffCookie.dataKeySecret;

    const platformIdentity = new PlatformIdentityConstruct(
      this,
      'PlatformIdentity',
      { config },
    );
    this.platformWorkloadIdentity = platformIdentity.workloadIdentity;

    const oauth = new OAuthTablesConstruct(this, 'OAuthTables', { config });
    this.oauthProvidersTable = oauth.providersTable;
    this.oauthUserTokensTable = oauth.userTokensTable;
    this.oauthTokenEncryptionKey = oauth.tokenEncryptionKey;
    this.oauthClientSecretsSecret = oauth.clientSecretsSecret;

    const authProviders = new AuthProvidersConstruct(this, 'AuthProviders', {
      config,
    });
    this.authProvidersTable = authProviders.providersTable;
    this.authProviderSecretsSecret = authProviders.secretsSecret;

    const cognitoConstruct = new CognitoConstruct(this, 'Cognito', { config });
    this.userPool = cognitoConstruct.userPool;
    this.bffAppClient = cognitoConstruct.bffAppClient;
    this.bffAppClientSecret = cognitoConstruct.bffAppClientSecret;
    this.cognitoDomain = cognitoConstruct.cognitoDomain;

    if (config.artifacts.enabled) {
      const artifactRenderToken = new ArtifactRenderTokenSecretConstruct(
        this,
        'ArtifactRenderToken',
        { config },
      );
      this.artifactRenderTokenSecret = artifactRenderToken.secret;
    }

    // ============================================================
    // Data tables
    // ============================================================
    const authTables = new AuthTablesConstruct(this, 'AuthTables', { config });
    this.oidcStateTable = authTables.oidcStateTable;
    this.bffSessionsTable = authTables.bffSessionsTable;
    this.usersTable = authTables.usersTable;
    this.appRolesTable = authTables.appRolesTable;
    this.apiKeysTable = authTables.apiKeysTable;

    const quotaTables = new QuotaTablesConstruct(this, 'QuotaTables', {
      config,
    });
    this.userQuotasTable = quotaTables.userQuotasTable;
    this.quotaEventsTable = quotaTables.quotaEventsTable;

    const costTrackingTables = new CostTrackingTablesConstruct(
      this,
      'CostTrackingTables',
      { config },
    );
    this.sessionsMetadataTable = costTrackingTables.sessionsMetadataTable;
    this.userCostSummaryTable = costTrackingTables.userCostSummaryTable;
    this.systemCostRollupTable = costTrackingTables.systemCostRollupTable;
    this.managedModelsTable = costTrackingTables.managedModelsTable;

    const adminTables = new AdminTablesConstruct(this, 'AdminTables', {
      config,
    });
    this.userSettingsTable = adminTables.userSettingsTable;
    this.userMenuLinksTable = adminTables.userMenuLinksTable;

    const assistants = new AssistantsTableConstruct(this, 'AssistantsTable', {
      config,
    });
    this.assistantsTable = assistants.table;

    const fileUpload = new FileUploadConstruct(this, 'FileUpload', { config });
    this.fileUploadBucket = fileUpload.bucket;
    this.fileUploadTable = fileUpload.table;

    const sharedConversations = new SharedConversationsConstruct(
      this,
      'SharedConversations',
      { config },
    );
    this.sharedConversationsTable = sharedConversations.table;

    // ============================================================
    // RAG data
    // ============================================================
    const ragData = new RagDataConstruct(this, 'RagData', { config });
    this.ragDocumentsBucket = ragData.documentsBucket;
    this.ragAssistantsTable = ragData.assistantsTable;
    this.ragVectorBucketName = ragData.vectorBucketName;
    this.ragVectorIndexName = ragData.vectorIndexName;
    this.ragVectorBucket = ragData.vectorBucket;
    this.ragVectorIndex = ragData.vectorIndex;

    // ============================================================
    // Fine-tuning data (gated)
    // ============================================================
    if (config.fineTuning.enabled) {
      const fineTuningData = new FineTuningDataConstruct(
        this,
        'FineTuningData',
        { config },
      );
      this.fineTuningJobsTable = fineTuningData.jobsTable;
      this.fineTuningAccessTable = fineTuningData.accessTable;
      this.fineTuningDataBucket = fineTuningData.dataBucket;
    }

    // ============================================================
    // Artifacts data (gated; distribution wired in later via
    // `wireArtifactsDistribution`)
    // ============================================================
    if (config.artifacts.enabled) {
      this._artifactsDataConstruct = new ArtifactsDataConstruct(
        this,
        'ArtifactsData',
        { config },
      );
      this.artifactsContentBucket = this._artifactsDataConstruct.bucket;
      this.artifactsTable = this._artifactsDataConstruct.table;

      const domainName = config.domainName!;
      this.artifactsFrameAncestors = [
        `https://${domainName}`,
        ...config.artifacts.extraFrameAncestors,
      ].join(' ');
    }

    // ============================================================
    // MCP sandbox edge (always-on; bucket+dist; deployment is wired
    // up here because nothing else needs to be threaded back from
    // BackendStack — the shell is static)
    // ============================================================
    this._mcpSandboxBucketConstruct = new McpSandboxBucketConstruct(
      this,
      'McpSandboxBucket',
      { config },
    );
    this.mcpSandboxBucket = this._mcpSandboxBucketConstruct.bucket;

    const mcpSandboxDist = new McpSandboxDistributionConstruct(
      this,
      'McpSandboxDistribution',
      { config, bucket: this.mcpSandboxBucket },
    );
    this.mcpSandboxDistribution = mcpSandboxDist.distribution;
    this.mcpSandboxProxyOrigin = mcpSandboxDist.proxyOrigin;

    this._mcpSandboxBucketConstruct.deployShell(mcpSandboxDist.distribution);

    // ============================================================
    // SPA bucket (distribution wired in later via
    // `wireSpaDistribution(appApiUrl)` once Backend has resolved its
    // ALB target — Platform owns the ALB so the URL token is in scope
    // here, but we delay the construction until Backend has confirmed
    // the target group is registered. In practice both stacks
    // synthesize together so the call lands in `bin/infrastructure.ts`)
    // ============================================================
    this._spaBucketConstruct = new SpaBucketConstruct(this, 'SpaBucket', {
      config,
    });
    this.spaBucket = this._spaBucketConstruct.bucket;

    // ============================================================
    // ALB DNS / hosted zone (Route53 lookup + ALB URL export)
    // ============================================================
    new AlbDnsConstruct(this, 'AlbDns', { config, alb: this.alb });

    // Stub-fill the spa-distribution accessors until wireSpaDistribution()
    // is invoked. The downstream prop typing keeps these on the Stack
    // surface even if a caller forgets to wire — accessing them returns
    // `undefined` at synth time and CDK errors out cleanly.
    this.spaDistribution = undefined as unknown as cloudfront.IDistribution;
    this.spaDistributionDomainName =
      undefined as unknown as string;
  }

  /**
   * Wire the SPA CloudFront distribution. Must be called from
   * `bin/infrastructure.ts` after Platform has been constructed so
   * the absolute ALB URL token is resolved against the SSM
   * parameter the network stack publishes.
   *
   * Also wires the RAG-CORS updater Lambda when RAG is enabled (it
   * needs the resolved frontend URL to patch the bucket CORS).
   */
  public wireSpaDistribution(appApiUrl: string): void {
    if (this._spaDistributionConstruct) return;

    this._spaDistributionConstruct = new SpaDistributionConstruct(
      this,
      'SpaDistribution',
      {
        config: this._config,
        bucket: this.spaBucket,
        appApiUrl,
      },
    );

    (this as { spaDistribution: cloudfront.IDistribution }).spaDistribution =
      this._spaDistributionConstruct.distribution;
    (this as { spaDistributionDomainName: string }).spaDistributionDomainName =
      this._spaDistributionConstruct.distributionDomainName;

    // RAG CORS updater — patches the RAG documents bucket CORS to
    // accept the resolved frontend URL.
    const frontendUrl = this._config.domainName
      ? `https://${this._config.domainName}`
      : `https://${this.spaDistributionDomainName}`;
    new RagCorsUpdaterConstruct(this, 'RagCorsUpdater', {
      config: this._config,
      frontendUrl,
    });
  }

  /**
   * Wire the artifacts CloudFront distribution. Backend constructs
   * the render Lambda and passes the resulting Function URL back so
   * the distribution can use it as its origin.
   *
   * No-op when artifacts is disabled.
   */
  public wireArtifactsDistribution(
    renderFunctionUrl: lambda.IFunctionUrl,
  ): cloudfront.IDistribution | undefined {
    if (
      !this._config.artifacts.enabled ||
      this._artifactsDistributionConstruct
    ) {
      return this._artifactsDistributionConstruct?.distribution;
    }

    this._artifactsDistributionConstruct = new ArtifactsDistributionConstruct(
      this,
      'ArtifactsDistribution',
      {
        config: this._config,
        renderFunctionUrl,
        frameAncestors: this.artifactsFrameAncestors!,
      },
    );

    return this._artifactsDistributionConstruct.distribution;
  }
}
