import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags } from './config';

// Backend constructs
import { AppApiServiceConstruct } from './constructs/app-api/app-api-service-construct';
import { InferenceAgentCoreConstruct } from './constructs/inference-api/inference-agentcore-construct';
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
    // Artifact Render Lambda + CloudFront Distribution moved to
    // PlatformStack in Phase 3 of the platform-as-bootstrap refactor.
    // The Lambda now lives in Platform with a stable bootstrap zip
    // asset, and the backend workflow's
    // `scripts/build/deploy-artifact-render-code.sh` ships the real
    // handler code via `aws lambda update-function-code` — no CFN
    // round-trip on artifact-code changes. The artifacts origin URL
    // flows back into AppApi here as `platform.artifactsOriginUrl`.
    // ============================================================
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
      artifactsOrigin: platform.artifactsOriginUrl,
      sagemakerExecutionRoleArn: sagemaker.executionRole.roleArn,
      sagemakerSecurityGroupId: sagemaker.securityGroup.securityGroupId,
      sagemakerPrivateSubnetIds,
    });

    // ============================================================
    // AgentCore Gateway moved to PlatformStack in Phase 2 of the
    // platform-as-bootstrap refactor. It's pure infrastructure (no
    // code), naturally fits the data-tier ownership.

    // ============================================================
    // RAG Ingestion Lambda moved to PlatformStack in Phase 4 of the
    // platform-as-bootstrap refactor. Lives there with a stable
    // bootstrap container image; the real image is shipped via
    // `aws lambda update-function-code --image-uri` from the
    // backend workflow's `deploy-rag-ingestion-code` job.
    //
    // The S3 ObjectCreated event subscription on the documents
    // bucket is wired in PlatformStack too, since both bucket and
    // Lambda now live there (no more cross-stack notification
    // dance).
    // ============================================================
  }
}
