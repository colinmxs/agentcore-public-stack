import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags } from './config';

// Backend constructs
import { AgentCoreGatewayConstruct } from './constructs/gateway/agentcore-gateway-construct';
import { AppApiServiceConstruct } from './constructs/app-api/app-api-service-construct';
import { InferenceAgentCoreConstruct } from './constructs/inference-api/inference-agentcore-construct';
import { RagIngestionLambdaConstruct } from './constructs/rag-ingestion/rag-ingestion-lambda-construct';
import { ArtifactRenderLambdaConstruct } from './constructs/artifacts/artifact-render-lambda-construct';
import { ArtifactsDistributionConstruct } from './constructs/artifacts/artifacts-distribution-construct';
import { SageMakerExecutionRoleConstruct } from './constructs/fine-tuning/sagemaker-execution-role-construct';

// Platform typed imports (explicit prop passing)
import { PlatformStack } from './platform-stack';

export interface BackendStackProps extends cdk.StackProps {
  config: AppConfig;
  platform: PlatformStack;
}

/**
 * BackendStack — every compute resource the application needs.
 *
 * Owns: app_api Fargate service + task def + target group attachment,
 * AgentCore Runtime + Memory + Code Interpreter + Browser (inference-api
 * compute), AgentCore Gateway + gateway role, RAG ingestion Lambda,
 * artifact render Lambda (gated), SageMaker Fine-Tuning IAM role +
 * security group (gated).
 *
 * Receives typed Platform inputs via `props.platform.*`. CDK
 * auto-generates the underlying CFN exports / Fn::ImportValue from
 * the typed cross-stack references.
 *
 */
export class BackendStack extends cdk.Stack {
  /** Exposed so bin/infrastructure.ts can wire the artifacts distribution. */
  public readonly artifactRenderFunctionUrl?: import('aws-cdk-lib/aws-lambda').IFunctionUrl;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const { config, platform } = props;

    applyStandardTags(this, config);

    // ============================================================
    // Inference API — AgentCore Runtime + Memory + Tools
    //
    // Constructed before App API so we can pass the AgentCore Memory
    // ARN, Memory ID, and runtime endpoint URL directly into App API.
    // App API used to read these from SSM, which deadlocked on first
    // deploy because both writer and reader live in BackendStack.
    // ============================================================
    const inferenceApi = new InferenceAgentCoreConstruct(this, 'InferenceApi', {
      config,
      // AgentCore Memory + Code Interpreter + Browser were hoisted
      // to PlatformStack in Phase 1 of the platform-as-bootstrap
      // refactor. Their ARNs and IDs flow in as typed cross-stack
      // refs. The Runtime continues to live in BackendStack until
      // Phase 5 (when it gets the bootstrap-container pattern and
      // also moves to Platform).
      memoryArn: platform.agentCoreMemoryArn,
      memoryId: platform.agentCoreMemoryId,
      codeInterpreterArn: platform.agentCoreCodeInterpreterArn,
      codeInterpreterId: platform.agentCoreCodeInterpreterId,
      browserArn: platform.agentCoreBrowserArn,
      browserId: platform.agentCoreBrowserId,
    });

    // ============================================================
    // Artifact Render Lambda + CloudFront Distribution
    //
    // Constructed before App API so the distribution's origin URL
    // can flow into App API as a direct prop. App API used to read
    // /{prefix}/artifacts/origin from SSM, which deadlocked on first
    // deploy (same-stack publisher and consumer). The artifacts data
    // (bucket, table, render-token-key-arn) still cross over from
    // PlatformStack and that path is fine to read via SSM.
    //
    // Both render Lambda and distribution live in BackendStack
    // because the distribution's origin IS the Lambda — putting the
    // distribution in PlatformStack would create a Platform → Backend
    // dependency cycle.
    // ============================================================
    const renderLambda = new ArtifactRenderLambdaConstruct(
      this,
      'ArtifactRender',
      {
        config,
        artifactsTable: platform.artifactsTable,
        artifactsBucket: platform.artifactsContentBucket,
        frameAncestors: platform.artifactsFrameAncestors,
      },
    );
    this.artifactRenderFunctionUrl = renderLambda.functionUrl;

    const artifactsDistribution = new ArtifactsDistributionConstruct(this, 'ArtifactsDistribution', {
      config,
      renderFunctionUrl: renderLambda.functionUrl,
      frameAncestors: platform.artifactsFrameAncestors,
    });

    // ============================================================
    // SageMaker Fine-Tuning IAM
    //
    // Constructed before App API so its execution role ARN, security
    // group ID, and the private subnet IDs flow into App API as direct
    // props. (App API used to read all three from SSM — same-stack
    // misuse.)
    // ============================================================
    const sagemakerPrivateSubnetIds = platform.vpc.privateSubnets
      .map((s) => s.subnetId)
      .join(',');
    const sagemaker = new SageMakerExecutionRoleConstruct(this, 'FineTuning', {
      config,
      dataBucket: platform.fineTuningDataBucket,
      jobsTable: platform.fineTuningJobsTable,
      vpc: platform.vpc,
      privateSubnetIdsString: sagemakerPrivateSubnetIds,
    });

    // ============================================================
    // App API Fargate service (the largest single construct)
    //
    // Receives every same-stack value via typed props above.
    // Cross-stack values from PlatformStack still flow via SSM
    // reads inside the construct (table names, bucket names, etc.) —
    // those are legitimate (Platform writes, Backend reads).
    // ============================================================
    new AppApiServiceConstruct(this, 'AppApi', {
      config,
      agentCoreMemoryArn: platform.agentCoreMemoryArn,
      agentCoreMemoryId: platform.agentCoreMemoryId,
      inferenceApiRuntimeEndpointUrl: inferenceApi.runtimeEndpointUrl,
      artifactsOrigin: artifactsDistribution.originUrl,
      sagemakerExecutionRoleArn: sagemaker.executionRole.roleArn,
      sagemakerSecurityGroupId: sagemaker.securityGroup.securityGroupId,
      sagemakerPrivateSubnetIds,
    });

    // ============================================================
    // AgentCore Gateway
    // ============================================================
    new AgentCoreGatewayConstruct(this, 'Gateway', { config });

    // ============================================================
    // RAG Ingestion Lambda
    // ============================================================
    const ragIngestion = new RagIngestionLambdaConstruct(this, 'RagIngestion', {
      config,
      documentsBucket: platform.ragDocumentsBucket,
      assistantsTable: platform.ragAssistantsTable,
      vectorBucketName: platform.ragVectorBucketName,
      vectorIndexName: platform.ragVectorIndexName,
    });

    // S3 event notification must be wired from the bucket's owning
    // stack (PlatformStack) to avoid a circular CDK dependency.
    // We use an imported bucket reference within THIS stack to add
    // the notification — CDK resolves it without a reverse cross-stack
    // reference because the bucket is imported by name (not by L2 ref).
    const ragDocsBucketImported = s3.Bucket.fromBucketName(
      this,
      'ImportedRagDocsBucket',
      platform.ragDocumentsBucket.bucketName,
    );
    ragDocsBucketImported.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(ragIngestion.lambda),
      { prefix: 'assistants/' },
    );
  }
}
