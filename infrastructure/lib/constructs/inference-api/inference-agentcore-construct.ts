import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as xray from 'aws-cdk-lib/aws-xray';
import * as bedrock from 'aws-cdk-lib/aws-bedrockagentcore';
import { Construct } from 'constructs';
import { AppConfig, getResourceName, getTruncatedResourceName, applyStandardTags, buildCorsOrigins } from '../../config';
import {
  createRuntimeExecutionRole,
  createMemoryExecutionRole,
  createCodeInterpreterExecutionRole,
  createBrowserExecutionRole,
} from './inference-api-iam-roles';

export interface InferenceAgentCoreConstructProps {
  config: AppConfig;
}

/**
 * InferenceAgentCoreConstruct — AgentCore Runtime + Memory + Tools.
 *
 * Provisions:
 *   - AgentCore Runtime (CfnRuntime) with Cognito JWT authorizer
 *   - AgentCore Memory (CfnMemory) for conversation context
 *   - Code Interpreter Custom (CfnCodeInterpreterCustom)
 *   - Browser Custom (CfnBrowserCustom)
 *   - Observability: vended log deliveries, X-Ray sampling/group,
 *     CloudWatch dashboard + alarms
 *   - SSM parameter exports for cross-stack consumption
 *
 * IAM roles are created via inference-api-iam-roles.ts (extracted).
 */
export class InferenceAgentCoreConstruct extends Construct {
  public readonly memory: bedrock.CfnMemory;
  public readonly codeInterpreter: bedrock.CfnCodeInterpreterCustom;
  public readonly browser: bedrock.CfnBrowserCustom;
  public readonly runtime: bedrock.CfnRuntime;
  /**
   * Full Bedrock AgentCore Runtime endpoint URL. Exposed so other
   * BackendStack constructs (notably the App API) can wire it via
   * direct construct refs instead of round-tripping through SSM,
   * which would chicken-and-egg on a same-stack first deploy.
   */
  public readonly runtimeEndpointUrl: string;

  constructor(scope: Construct, id: string, props: InferenceAgentCoreConstructProps) {
    super(scope, id);

    const { config } = props;

    applyStandardTags(cdk.Stack.of(this), config);

    // ── Image tag + ECR ──
    const imageTag = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/inference-api/image-tag`);
    const ecrRepository = ecr.Repository.fromRepositoryName(
      this, 'InferenceApiRepository', getResourceName(config, 'inference-api'));

    // ── IAM roles (extracted into inference-api-iam-roles.ts) ──
    const runtimeExecutionRole = createRuntimeExecutionRole(this, config);
    const memoryExecutionRole = createMemoryExecutionRole(this, config);
    const codeInterpreterExecutionRole = createCodeInterpreterExecutionRole(this, config);
    const browserExecutionRole = createBrowserExecutionRole(this, config);

    // ── Additional SSM reads needed by the runtime container env ──
    const _containerImageUri = `${ecrRepository.repositoryUri}:${imageTag}`;
    const authProviderSecretsArn = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/auth/auth-provider-secrets-arn`);
    const oauthTokenEncryptionKeyArn = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/oauth/token-encryption-key-arn`);
    const oauthClientSecretsArn = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/oauth/client-secrets-arn`);

    this.memory = new bedrock.CfnMemory(this, 'AgentCoreMemory', {
      name: getResourceName(config, 'agentcore_memory').replace(/-/g, '_'),
      eventExpiryDuration: 90, // 90 days (property expects days, not hours; max is 365, min is 7)
      memoryExecutionRoleArn: memoryExecutionRole.roleArn,
      description: 'AgentCore Memory for maintaining conversation context, user preferences, and semantic facts',
      memoryStrategies: [
        {
          semanticMemoryStrategy: {
            name: 'SemanticFactExtraction',
            description: 'Extracts and stores semantic facts from conversations',
          },
        },
        {
          summaryMemoryStrategy: {
            name: 'ConversationSummary',
            description: 'Generates and stores conversation summaries',
          },
        },
        {
          userPreferenceMemoryStrategy: {
            name: 'UserPreferenceExtraction',
            description: 'Identifies and stores user preferences',
          },
        },
      ],
    });

    // ============================================================
    // AgentCore Code Interpreter Custom
    // ============================================================
    
    this.codeInterpreter = new bedrock.CfnCodeInterpreterCustom(this, 'CodeInterpreterCustom', {
      name: getResourceName(config, 'code_interpreter').replace(/-/g, '_'),
      description: 'Custom Code Interpreter for Python code execution with advanced configuration',
      networkConfiguration: {
        networkMode: 'PUBLIC',
      },
      executionRoleArn: codeInterpreterExecutionRole.roleArn,
    });

    this.codeInterpreter.node.addDependency(codeInterpreterExecutionRole);

    // ============================================================
    // AgentCore Browser Custom
    // ============================================================
    
    this.browser = new bedrock.CfnBrowserCustom(this, 'BrowserCustom', {
      name: getResourceName(config, 'browser').replace(/-/g, '_'),
      description: 'Custom Browser for secure web interaction and data extraction',
      networkConfiguration: {
        networkMode: 'PUBLIC',
      },
      executionRoleArn: browserExecutionRole.roleArn,
    });

    this.browser.node.addDependency(browserExecutionRole);

    // ============================================================
    // AgentCore Runtime
    // ============================================================
    
    // Grant Runtime permission to access Memory
    runtimeExecutionRole.addToPolicy(new iam.PolicyStatement({
      sid: 'MemoryAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        // Memory configuration
        'bedrock-agentcore:GetMemory',
        'bedrock-agentcore:GetMemoryStrategies',
        // Event operations (create only - runtime doesn't delete)
        'bedrock-agentcore:CreateEvent',
        'bedrock-agentcore:ListEvents',
        // Memory retrieval
        'bedrock-agentcore:RetrieveMemory',
        'bedrock-agentcore:RetrieveMemoryRecords',
        'bedrock-agentcore:ListMemoryRecords',
        // Session operations (read only - runtime doesn't delete sessions)
        'bedrock-agentcore:ListMemorySessions',
        'bedrock-agentcore:GetMemorySession',
      ],
      resources: [this.memory.attrMemoryArn],
    }));

    // Grant Runtime permission to use the Custom Code Interpreter.
    // Action list matches AWS's documented policy for Code Interpreter access
    // (see docs.aws.amazon.com/bedrock-agentcore/latest/devguide/
    // code-interpreter-getting-started.html). Scoped to this stack's Custom
    // Code Interpreter only — we don't need account-wide discovery perms.
    runtimeExecutionRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CodeInterpreterAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-agentcore:StartCodeInterpreterSession',
        'bedrock-agentcore:InvokeCodeInterpreter',
        'bedrock-agentcore:StopCodeInterpreterSession',
        'bedrock-agentcore:GetCodeInterpreter',
        'bedrock-agentcore:GetCodeInterpreterSession',
        'bedrock-agentcore:ListCodeInterpreterSessions',
      ],
      resources: [this.codeInterpreter.attrCodeInterpreterArn],
    }));

    // Grant Runtime permission to use Browser
    runtimeExecutionRole.addToPolicy(new iam.PolicyStatement({
      sid: 'BrowserAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-agentcore:InvokeBrowser',
      ],
      resources: [this.browser.attrBrowserArn],
    }));

    // ============================================================
    // Import Cognito SSM Parameters for JWT Authorizer
    // ============================================================

    const cognitoUserPoolId = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/auth/cognito/user-pool-id`
    );
    // Phase 7 retired the public PKCE SPA client; the BFF confidential
    // client is the only one left. The runtime authorizer's allowed-clients
    // list now points at it so tokens minted via the BFF flow are accepted
    // when the chat proxy on app-api forwards them to /invocations.
    const cognitoAppClientId = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/auth/cognito/bff-app-client-id`
    );

    // Construct Cognito OIDC discovery URL
    const cognitoDiscoveryUrl = `https://cognito-idp.${config.awsRegion}.amazonaws.com/${cognitoUserPoolId}/.well-known/openid-configuration`;

    // ============================================================
    // Import SSM Parameters for Runtime Environment Variables
    // ============================================================

    // DynamoDB table names (the ARNs are already imported above for IAM)
    const usersTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/users/users-table-name`
    );
    const appRolesTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/rbac/app-roles-table-name`
    );
    const oidcStateTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/auth/oidc-state-table-name`
    );
    const apiKeysTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/auth/api-keys-table-name`
    );
    const oauthProvidersTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/oauth/providers-table-name`
    );
    const oauthUserTokensTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/oauth/user-tokens-table-name`
    );
    const assistantsTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/rag/assistants-table-name`
    );
    const userQuotasTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/quota/user-quotas-table-name`
    );
    const quotaEventsTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/quota/quota-events-table-name`
    );
    const sessionsMetadataTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/cost-tracking/sessions-metadata-table-name`
    );
    const userCostSummaryTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/cost-tracking/user-cost-summary-table-name`
    );
    const systemCostRollupTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/cost-tracking/system-cost-rollup-table-name`
    );
    const managedModelsTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/admin/managed-models-table-name`
    );
    const userSettingsTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/settings/user-settings-table-name`
    );
    const authProvidersTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/auth/auth-providers-table-name`
    );
    const userFilesTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/user-file-uploads/table-name`
    );

    // S3 / RAG
    const vectorBucketName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/rag/vector-bucket-name`
    );
    const vectorIndexName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/rag/vector-index-name`
    );

    // Frontend CORS origins — single source: buildCorsOrigins (from CDK_DOMAIN_NAME)
    const corsOrigins = buildCorsOrigins(config, config.inferenceApi.additionalCorsOrigins).join(',');

    // ============================================================
    // Single CDK-Managed AgentCore Runtime with Cognito JWT Authorizer
    // ============================================================

    this.runtime = new bedrock.CfnRuntime(this, 'AgentCoreRuntime', {
      agentRuntimeName: getResourceName(config, 'agentcore_runtime').replace(/-/g, '_'),
      agentRuntimeArtifact: {
        containerConfiguration: {
          containerUri: _containerImageUri,
        },
      },
      authorizerConfiguration: {
        customJwtAuthorizer: {
          discoveryUrl: cognitoDiscoveryUrl,
          allowedClients: [cognitoAppClientId],
        },
      },
      roleArn: runtimeExecutionRole.roleArn,
      networkConfiguration: {
        networkMode: 'PUBLIC',
      },
      // HTTP protocol supports both REST (/invocations) and WebSocket (/ws) endpoints
      protocolConfiguration: 'HTTP',
      requestHeaderConfiguration: {
        requestHeaderAllowlist: ['Authorization'],
      },
      environmentVariables: {
        // Basic configuration
        LOG_LEVEL: 'INFO',
        PROJECT_PREFIX: config.projectPrefix,
        AWS_DEFAULT_REGION: config.awsRegion,

        // DynamoDB tables
        DYNAMODB_USERS_TABLE_NAME: usersTableName,
        DYNAMODB_APP_ROLES_TABLE_NAME: appRolesTableName,
        DYNAMODB_OIDC_STATE_TABLE_NAME: oidcStateTableName,
        DYNAMODB_API_KEYS_TABLE_NAME: apiKeysTableName,
        DYNAMODB_OAUTH_PROVIDERS_TABLE_NAME: oauthProvidersTableName,
        DYNAMODB_OAUTH_USER_TOKENS_TABLE_NAME: oauthUserTokensTableName,
        DYNAMODB_ASSISTANTS_TABLE_NAME: assistantsTableName,

        // Quota & cost tracking tables
        DYNAMODB_QUOTA_TABLE: userQuotasTableName,
        DYNAMODB_QUOTA_EVENTS_TABLE: quotaEventsTableName,
        DYNAMODB_SESSIONS_METADATA_TABLE_NAME: sessionsMetadataTableName,
        DYNAMODB_COST_SUMMARY_TABLE_NAME: userCostSummaryTableName,
        DYNAMODB_SYSTEM_ROLLUP_TABLE_NAME: systemCostRollupTableName,
        DYNAMODB_MANAGED_MODELS_TABLE_NAME: managedModelsTableName,
        DYNAMODB_USER_SETTINGS_TABLE_NAME: userSettingsTableName,
        DYNAMODB_USER_FILES_TABLE_NAME: userFilesTableName,

        // Auth providers
        DYNAMODB_AUTH_PROVIDERS_TABLE_NAME: authProvidersTableName,
        AUTH_PROVIDER_SECRETS_ARN: authProviderSecretsArn,

        // OAuth configuration
        OAUTH_TOKEN_ENCRYPTION_KEY_ARN: oauthTokenEncryptionKeyArn,
        OAUTH_CLIENT_SECRETS_ARN: oauthClientSecretsArn,

        // AgentCore resources
        AGENTCORE_MEMORY_ID: this.memory.attrMemoryId,
        MEMORY_ARN: this.memory.attrMemoryArn,
        AGENTCORE_CODE_INTERPRETER_ID: this.codeInterpreter.attrCodeInterpreterId,
        BROWSER_ID: this.browser.attrBrowserId,

        // S3 storage
        S3_ASSISTANTS_VECTOR_STORE_BUCKET_NAME: vectorBucketName,
        S3_ASSISTANTS_VECTOR_STORE_INDEX_NAME: vectorIndexName,
        // Assistants KB documents bucket — needed by the agent's spreadsheet
        // analysis tool to download files from S3 before pushing them into
        // the Code Interpreter sandbox. Imported from RagIngestionStack via
        // SSM (same parameter app-api uses). Without this the agent fails
        // with "S3_ASSISTANTS_DOCUMENTS_BUCKET_NAME not configured".
        S3_ASSISTANTS_DOCUMENTS_BUCKET_NAME: ssm.StringParameter.valueForStringParameter(
          this,
          `/${config.projectPrefix}/rag/documents-bucket-name`
        ),

        // Authentication
        ENABLE_AUTHENTICATION: 'true',
        ENABLE_QUOTA_ENFORCEMENT: 'true',

        // Directories
        UPLOAD_DIR: '/tmp/uploads',
        OUTPUT_DIR: '/tmp/output',
        GENERATED_IMAGES_DIR: '/tmp/generated_images',

        // URLs
        FRONTEND_URL: config.domainName ? `https://${config.domainName}` : 'http://localhost:4200',
        CORS_ORIGINS: corsOrigins,

        // OAuth2 callback URL fallback for the agent loop's consent flow.
        // Frontends send `OAuth2CallbackUrl` on /invocations, but the
        // AgentCore Runtime gateway strips custom headers before they reach
        // the container, so `BedrockAgentCoreContext.get_oauth2_callback_url()`
        // is empty here. `_resolve_callback_url` falls back to this env var —
        // see apis/shared/oauth/agentcore_identity.py.
        AGENTCORE_LOCAL_OAUTH_CALLBACK_URL: config.domainName
          ? `https://${config.domainName}/oauth-complete`
          : 'http://localhost:4200/oauth-complete',

        // Shared platform workload identity (created in InfrastructureStack).
        // Both inference-api and app-api mint user-scoped workload tokens
        // against this identity so they share a single OAuth token vault.
        // The runtime auto-creates its own service-linked identity, but it
        // cannot be shared cross-service — see InfrastructureStack and
        // `_resolve_workload_token` in apis/shared/oauth/agentcore_identity.py.
        AGENTCORE_RUNTIME_WORKLOAD_NAME: ssm.StringParameter.valueForStringParameter(
          this,
          `/${config.projectPrefix}/oauth/platform-workload-identity-name`
        ),

        // MCP Apps sandbox-proxy origin (PR #7 of
        // docs/kaizen/scoping/mcp-apps-host-renderer.md). The agent emits
        // it on the `ui_resource` SSE event as `sandboxOrigin` — the
        // cross-origin shell the SPA frames a hosted App in. The
        // mcp-sandbox stack is always provisioned, so the SSM parameter
        // always exists. Without this var, AGENTCORE_MCP_APPS_SANDBOX_ORIGIN
        // would fall back to its empty Python default and the SPA would
        // have no origin to frame an App in — the host surface stays
        // dormant unless MCP_APPS_HOST_ENABLED is flipped on.
        AGENTCORE_MCP_APPS_SANDBOX_ORIGIN: ssm.StringParameter.valueForStringParameter(
          this,
          `/${config.projectPrefix}/mcp-sandbox/origin`
        ),
      },
    });
    this.runtime.node.addDependency(runtimeExecutionRole);

    // ============================================================
    // Observability: CloudWatch Log Group for Runtime
    // ============================================================

    const runtimeLogGroup = new logs.LogGroup(this, 'AgentCoreRuntimeLogGroup', {
      logGroupName: `/aws/bedrock-agentcore/runtimes/${config.projectPrefix}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // NOTE: X-Ray TransactionSearchConfig is an account-level singleton.
    // It cannot be created via CloudFormation if it already exists.
    // See 2d in .github/docs/deploy/step-02-aws-setup.md for more information

    // ============================================================
    // Observability: Vended Log Deliveries for AgentCore Resources
    // ============================================================
    // Uses CloudWatch Logs vended logs API (CfnDeliverySource/Destination/Delivery)
    // to configure APPLICATION_LOGS and TRACES for CDK-managed resources.

    // --- Memory: APPLICATION_LOGS ---
    const memoryLogsLogGroup = new logs.LogGroup(this, 'MemoryLogsLogGroup', {
      logGroupName: `/aws/vendedlogs/bedrock-agentcore/memory/${config.projectPrefix}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const memoryLogsSource = new logs.CfnDeliverySource(this, 'MemoryLogsSource', {
      name: `${config.projectPrefix}-memory-logs`,
      logType: 'APPLICATION_LOGS',
      resourceArn: this.memory.attrMemoryArn,
    });
    memoryLogsSource.node.addDependency(this.memory);

    const memoryLogsDestination = new logs.CfnDeliveryDestination(this, 'MemoryLogsDestination', {
      name: `${config.projectPrefix}-memory-logs-dest`,
      deliveryDestinationType: 'CWL',
      destinationResourceArn: memoryLogsLogGroup.logGroupArn,
    });

    const memoryLogsDelivery = new logs.CfnDelivery(this, 'MemoryLogsDelivery', {
      deliverySourceName: memoryLogsSource.name,
      deliveryDestinationArn: memoryLogsDestination.attrArn,
    });
    memoryLogsDelivery.node.addDependency(memoryLogsSource);
    memoryLogsDelivery.node.addDependency(memoryLogsDestination);

    // --- Memory: TRACES ---
    const memoryTracesSource = new logs.CfnDeliverySource(this, 'MemoryTracesSource', {
      name: `${config.projectPrefix}-memory-traces`,
      logType: 'TRACES',
      resourceArn: this.memory.attrMemoryArn,
    });
    memoryTracesSource.node.addDependency(this.memory);

    const memoryTracesDestination = new logs.CfnDeliveryDestination(this, 'MemoryTracesDestination', {
      name: `${config.projectPrefix}-memory-traces-dest`,
      deliveryDestinationType: 'XRAY',
    });

    const memoryTracesDelivery = new logs.CfnDelivery(this, 'MemoryTracesDelivery', {
      deliverySourceName: memoryTracesSource.name,
      deliveryDestinationArn: memoryTracesDestination.attrArn,
    });
    memoryTracesDelivery.node.addDependency(memoryTracesSource);
    memoryTracesDelivery.node.addDependency(memoryTracesDestination);

    // NOTE: Code Interpreter and Browser do NOT need vended log delivery right now.
    // Valid resource types are: code-interpreter, memory, workload-identity,
    // code-interpreter-custom, runtime, gateway.

    // ============================================================
    // Observability: X-Ray Sampling Rule for AgentCore
    // ============================================================

    new xray.CfnSamplingRule(this, 'AgentCoreSamplingRule', {
      samplingRule: {
        ruleName: getTruncatedResourceName(config, 32, 'ac-sampling'),
        priority: 100,
        fixedRate: config.production ? 0.05 : 1.0,
        reservoirSize: config.production ? 5 : 50,
        serviceName: '*',
        serviceType: '*',
        host: '*',
        httpMethod: '*',
        urlPath: '/invocations',
        resourceArn: '*',
        version: 1,
      },
    });

    // ============================================================
    // Observability: X-Ray Group for AgentCore Traces
    // ============================================================

    new xray.CfnGroup(this, 'AgentCoreXRayGroup', {
      groupName: getTruncatedResourceName(config, 32, 'ac-traces'),
      filterExpression: 'annotation.gen_ai_system = "strands-agents" OR service(id(name: "bedrock-agentcore", type: "AWS::BedrockAgentCore"))',
      insightsConfiguration: {
        insightsEnabled: true,
        notificationsEnabled: config.production,
      },
    });

    // ============================================================
    // Observability: CloudWatch Dashboard
    // ============================================================

    const dashboard = new cloudwatch.Dashboard(this, 'AgentCoreObservabilityDashboard', {
      dashboardName: getResourceName(config, 'agentcore-observability'),
      defaultInterval: cdk.Duration.hours(3),
    });

    const agentCoreNamespace = 'bedrock-agentcore';

    const invocationCountMetric = new cloudwatch.Metric({
      namespace: agentCoreNamespace,
      metricName: 'InvocationCount',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const invocationErrorMetric = new cloudwatch.Metric({
      namespace: agentCoreNamespace,
      metricName: 'InvocationErrors',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const latencyP50Metric = new cloudwatch.Metric({
      namespace: agentCoreNamespace,
      metricName: 'InvocationLatency',
      statistic: 'p50',
      period: cdk.Duration.minutes(5),
    });

    const latencyP90Metric = new cloudwatch.Metric({
      namespace: agentCoreNamespace,
      metricName: 'InvocationLatency',
      statistic: 'p90',
      period: cdk.Duration.minutes(5),
    });

    const latencyP99Metric = new cloudwatch.Metric({
      namespace: agentCoreNamespace,
      metricName: 'InvocationLatency',
      statistic: 'p99',
      period: cdk.Duration.minutes(5),
    });

    const inputTokensMetric = new cloudwatch.Metric({
      namespace: agentCoreNamespace,
      metricName: 'InputTokens',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const outputTokensMetric = new cloudwatch.Metric({
      namespace: agentCoreNamespace,
      metricName: 'OutputTokens',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# AgentCore Runtime Observability\n**Project:** ${config.projectPrefix} | **Region:** ${config.awsRegion}`,
        width: 24,
        height: 1,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Invocation Count & Errors',
        left: [invocationCountMetric],
        right: [invocationErrorMetric],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Invocation Latency (p50 / p90 / p99)',
        left: [latencyP50Metric, latencyP90Metric, latencyP99Metric],
        width: 12,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Token Usage (Input / Output)',
        left: [inputTokensMetric, outputTokensMetric],
        width: 12,
        height: 6,
      }),
      new cloudwatch.LogQueryWidget({
        title: 'Recent Runtime Errors',
        logGroupNames: [runtimeLogGroup.logGroupName],
        queryLines: [
          'fields @timestamp, @message',
          'filter @message like /(?i)error|exception|traceback/',
          'sort @timestamp desc',
          'limit 20',
        ],
        width: 12,
        height: 6,
      }),
    );

    // ============================================================
    // Observability: CloudWatch Alarms
    // ============================================================

    new cloudwatch.Alarm(this, 'AgentCoreHighErrorRateAlarm', {
      alarmName: getResourceName(config, 'agentcore-high-error-rate'),
      alarmDescription: 'AgentCore Runtime invocation error rate exceeded threshold',
      metric: invocationErrorMetric,
      threshold: config.production ? 10 : 50,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'AgentCoreHighLatencyAlarm', {
      alarmName: getResourceName(config, 'agentcore-high-latency'),
      alarmDescription: 'AgentCore Runtime p99 latency exceeded threshold',
      metric: latencyP99Metric,
      threshold: 30000, // 30 seconds
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ============================================================
    // SSM Parameters for Cross-Stack References
    // ============================================================
    
    // Export runtime execution role ARN for Lambda-created runtimes
    new ssm.StringParameter(this, 'RuntimeExecutionRoleArnParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/runtime-execution-role-arn`,
      stringValue: runtimeExecutionRole.roleArn,
      description: 'Runtime execution role ARN for Lambda-created AgentCore Runtimes',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'RuntimeArnParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/runtime-arn`,
      stringValue: this.runtime.attrAgentRuntimeArn,
      description: 'AgentCore Runtime ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'RuntimeIdParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/runtime-id`,
      stringValue: this.runtime.attrAgentRuntimeId,
      description: 'AgentCore Runtime ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    // The runtime auto-creates its own service-linked workload identity, but
    // we don't surface it: it's only mintable from inside the runtime
    // container, so cross-service callers can't use it. Both APIs share the
    // platform workload identity defined in InfrastructureStack instead.

    // Construct the full runtime endpoint URL for frontend consumption
    const runtimeEndpointUrl = cdk.Fn.sub(
      'https://bedrock-agentcore.${AWS::Region}.amazonaws.com/runtimes/${RuntimeArn}',
      { RuntimeArn: this.runtime.attrAgentRuntimeArn }
    );
    this.runtimeEndpointUrl = runtimeEndpointUrl;

    new ssm.StringParameter(this, 'InferenceApiRuntimeEndpointUrlParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/runtime-endpoint-url`,
      stringValue: runtimeEndpointUrl,
      description: 'Inference API AgentCore Runtime Endpoint URL',
      tier: ssm.ParameterTier.STANDARD,
    });
    
    new ssm.StringParameter(this, 'InferenceApiMemoryArnParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/memory-arn`,
      stringValue: this.memory.attrMemoryArn,
      description: 'Inference API AgentCore Memory ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'InferenceApiMemoryIdParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/memory-id`,
      stringValue: this.memory.attrMemoryId,
      description: 'Inference API AgentCore Memory ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'InferenceApiCodeInterpreterIdParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/code-interpreter-id`,
      stringValue: this.codeInterpreter.attrCodeInterpreterId,
      description: 'Inference API AgentCore Code Interpreter ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'InferenceApiCodeInterpreterArnParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/code-interpreter-arn`,
      stringValue: this.codeInterpreter.attrCodeInterpreterArn,
      description: 'Inference API AgentCore Code Interpreter ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'InferenceApiBrowserIdParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/browser-id`,
      stringValue: this.browser.attrBrowserId,
      description: 'Inference API AgentCore Browser ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'InferenceApiBrowserArnParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/browser-arn`,
      stringValue: this.browser.attrBrowserArn,
      description: 'Inference API AgentCore Browser ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export ECR repository URI for Lambda-created runtimes
    new ssm.StringParameter(this, 'EcrRepositoryUriParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/ecr-repository-uri`,
      stringValue: ecrRepository.repositoryUri,
      description: 'Inference API ECR Repository URI for runtime container images',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export observability log group name
    new ssm.StringParameter(this, 'RuntimeLogGroupNameParameter', {
      parameterName: `/${config.projectPrefix}/inference-api/runtime-log-group-name`,
      stringValue: runtimeLogGroup.logGroupName,
      description: 'CloudWatch Log Group name for AgentCore Runtime observability',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // CloudFormation Outputs
    // ============================================================
    

    new cdk.CfnOutput(this, 'InferenceApiMemoryArn', {
      value: this.memory.attrMemoryArn,
      description: 'Inference API AgentCore Memory ARN',
      exportName: `${config.projectPrefix}-InferenceApiMemoryArn`,
    });

    new cdk.CfnOutput(this, 'AgentCoreRuntimeArn', {
      value: this.runtime.attrAgentRuntimeArn,
      description: 'AgentCore Runtime ARN',
      exportName: `${config.projectPrefix}-AgentCoreRuntimeArn`,
    });

    new cdk.CfnOutput(this, 'AgentCoreRuntimeId', {
      value: this.runtime.attrAgentRuntimeId,
      description: 'AgentCore Runtime ID',
      exportName: `${config.projectPrefix}-AgentCoreRuntimeId`,
    });

    new cdk.CfnOutput(this, 'InferenceApiMemoryId', {
      value: this.memory.attrMemoryId,
      description: 'Inference API AgentCore Memory ID',
      exportName: `${config.projectPrefix}-InferenceApiMemoryId`,
    });

    new cdk.CfnOutput(this, 'InferenceApiCodeInterpreterId', {
      value: this.codeInterpreter.attrCodeInterpreterId,
      description: 'Inference API AgentCore Code Interpreter ID',
      exportName: `${config.projectPrefix}-InferenceApiCodeInterpreterId`,
    });

    new cdk.CfnOutput(this, 'InferenceApiBrowserId', {
      value: this.browser.attrBrowserId,
      description: 'Inference API AgentCore Browser ID',
      exportName: `${config.projectPrefix}-InferenceApiBrowserId`,
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: ecrRepository.repositoryUri,
      description: 'Inference API ECR Repository URI',
      exportName: `${config.projectPrefix}-InferenceApiEcrRepositoryUri`,
    });

    new cdk.CfnOutput(this, 'ObservabilityDashboardName', {
      value: dashboard.dashboardName,
      description: 'CloudWatch Dashboard for AgentCore observability',
      exportName: `${config.projectPrefix}-AgentCoreObservabilityDashboard`,
    });

    new cdk.CfnOutput(this, 'RuntimeLogGroupName', {
      value: runtimeLogGroup.logGroupName,
      description: 'CloudWatch Log Group for AgentCore Runtime',
      exportName: `${config.projectPrefix}-AgentCoreRuntimeLogGroup`,
    });
   }
}
