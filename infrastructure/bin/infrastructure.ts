#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';

import { PlatformStack } from '../lib/platform-stack';
import { loadConfig, getStackEnv } from '../lib/config';

const app = new cdk.App();

const config = loadConfig(app);
const env = getStackEnv(config);

// ============================================================
// PlatformStack — every resource the application needs.
//
// As of Phase 7 of the platform-as-bootstrap refactor, this is
// the *only* stack. The previous BackendStack was absorbed:
// every compute resource (App API Fargate, Inference AgentCore
// Runtime, SageMaker IAM, plus the artifact-render and
// rag-ingestion Lambdas hoisted in Phases 3+4) lives here too.
//
// Application code is shipped via AWS APIs (workflow → ECR push →
// update-function-code / update-service / UpdateAgentRuntime),
// not via CFN deploys. CFN updates only when *infrastructure*
// changes — new tables, new IAM grants, etc. — which is a
// significantly less frequent event.
//
// Construction is split across the constructor (the data + edge +
// AgentCore Memory/CI/Browser/Gateway layer) and two `wire*`
// methods (`wireSpaDistribution`, `wireCompute`) which are called
// in deterministic order from this file. The split exists because:
//   - wireSpaDistribution depends on AlbDnsConstruct, which is
//     created by the constructor but ALSO consumes a domain name
//     resolved late.
//   - wireCompute uses every other typed ref the stack exposes,
//     so it has to be last.
// Both methods are pure CDK additions to the same stack — calling
// them does not produce a separate CFN stack.
// ============================================================
const platform = new PlatformStack(app, `${config.projectPrefix}-PlatformStack`, {
  config,
  env,
  description: `${config.projectPrefix} Platform Stack — VPC, ALB, DynamoDB, S3, Cognito, CloudFront, AgentCore, Fargate, Lambdas (single-stack architecture; backend code is shipped out-of-band via AWS APIs)`,
});

platform.wireSpaDistribution();
platform.wireCompute();

app.synth();
