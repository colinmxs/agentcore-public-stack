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
 * Two retained feature flags:
 *   - `config.artifacts.enabled`  → ArtifactRenderLambdaConstruct
 *   - `config.fineTuning.enabled` → SageMakerExecutionRoleConstruct
 */
export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const { config, platform } = props;

    applyStandardTags(this, config);

    // ============================================================
    // App API Fargate service (the largest single construct)
    // ============================================================
    // The construct still reads some values from SSM (table names,
    // inference-api endpoint URL, etc.) because those are runtime
    // reads that the Fargate task resolves at startup. The cross-stack
    // CDK references (VPC, ALB, ECS cluster) flow through the typed
    // Platform props via SSM reads inside the construct — these will
    // be replaced with direct typed prop passing in a follow-up
    // optimization pass.
    new AppApiServiceConstruct(this, 'AppApi', { config });

    // ============================================================
    // Inference API — AgentCore Runtime + Memory + Tools
    // ============================================================
    new InferenceAgentCoreConstruct(this, 'InferenceApi', { config });

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

    // ============================================================
    // Artifact Render Lambda
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

    // Wire the render Lambda's Function URL back to Platform so
    // the artifacts CloudFront distribution can use it as its origin.
    platform.wireArtifactsDistribution(renderLambda.functionUrl);

    // ============================================================
    // SageMaker Fine-Tuning IAM
    // ============================================================
    new SageMakerExecutionRoleConstruct(this, 'FineTuning', {
      config,
      dataBucket: platform.fineTuningDataBucket,
      jobsTable: platform.fineTuningJobsTable,
      vpc: platform.vpc,
      privateSubnetIdsString: platform.vpc.privateSubnets
        .map((s) => s.subnetId)
        .join(','),
    });
  }
}
