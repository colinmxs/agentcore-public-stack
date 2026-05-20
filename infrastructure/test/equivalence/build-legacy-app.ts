/**
 * Synthesize the legacy 9-stack architecture for the equivalence test
 * baseline.
 *
 * Mirrors `bin/infrastructure.ts` exactly but receives a pre-built
 * AppConfig (so tests can synthesize against a deterministic mock
 * config) instead of reading from `cdk.context.json` / env vars.
 *
 * Used by:
 *   - test/equivalence/equivalence.test.ts  (Phase 1+ — the gate test)
 *   - the legacy-synth snapshot script during Task 1
 *
 * This file is a thin alternative entry point and does NOT replace
 * `bin/infrastructure.ts`. It will be deleted in Task 17 when the
 * equivalence harness is retired.
 */

import * as cdk from 'aws-cdk-lib';

import { AppConfig } from '../../lib/config';
import { AppApiStack } from '../../lib/app-api-stack';
import { ArtifactsStack } from '../../lib/artifacts-stack';
import { FrontendStack } from '../../lib/frontend-stack';
import { GatewayStack } from '../../lib/gateway-stack';
import { InferenceApiStack } from '../../lib/inference-api-stack';
import { InfrastructureStack } from '../../lib/infrastructure-stack';
import { McpSandboxStack } from '../../lib/mcp-sandbox-stack';
import { RagIngestionStack } from '../../lib/rag-ingestion-stack';
import { SageMakerFineTuningStack } from '../../lib/sagemaker-fine-tuning-stack';
import { mockSsmContext } from '../helpers/mock-config';

/** Synthesize the 9-stack legacy architecture. */
export function buildLegacyApp(config: AppConfig): cdk.App {
  const app = new cdk.App();
  const env: cdk.Environment = {
    account: config.awsAccount,
    region: config.awsRegion,
  };

  // Pre-populate every SSM lookup any of the 9 legacy stacks performs
  // so synthesis succeeds without AWS calls.
  mockSsmContext(app, config);

  new InfrastructureStack(app, 'InfrastructureStack', {
    config,
    env,
    stackName: `${config.projectPrefix}-InfrastructureStack`,
  });

  if (config.artifacts.enabled) {
    new ArtifactsStack(app, 'ArtifactsStack', {
      config,
      env,
      stackName: `${config.projectPrefix}-ArtifactsStack`,
    });
  }

  if (config.mcpSandbox.enabled) {
    new McpSandboxStack(app, 'McpSandboxStack', {
      config,
      env,
      stackName: `${config.projectPrefix}-McpSandboxStack`,
    });
  }

  if (config.frontend.enabled) {
    new FrontendStack(app, 'FrontendStack', {
      config,
      env,
      stackName: `${config.projectPrefix}-FrontendStack`,
    });
  }

  if (config.appApi.enabled) {
    new AppApiStack(app, 'AppApiStack', {
      config,
      env,
      stackName: `${config.projectPrefix}-AppApiStack`,
    });
  }

  if (config.inferenceApi.enabled) {
    new InferenceApiStack(app, 'InferenceApiStack', {
      config,
      env,
      stackName: `${config.projectPrefix}-InferenceApiStack`,
    });
  }

  if (config.gateway.enabled) {
    new GatewayStack(app, 'GatewayStack', {
      config,
      env,
      stackName: `${config.projectPrefix}-GatewayStack`,
    });
  }

  if (config.ragIngestion.enabled) {
    new RagIngestionStack(app, 'RagIngestionStack', {
      config,
      env,
      stackName: `${config.projectPrefix}-RagIngestionStack`,
    });
  }

  if (config.fineTuning.enabled) {
    new SageMakerFineTuningStack(app, 'SageMakerFineTuningStack', {
      config,
      env,
      stackName: `${config.projectPrefix}-SageMakerFineTuningStack`,
    });
  }

  return app;
}
