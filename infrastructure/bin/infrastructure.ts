#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import * as ssm from 'aws-cdk-lib/aws-ssm';

import { PlatformStack } from '../lib/platform-stack';
import { BackendStack } from '../lib/backend-stack';
import { loadConfig, getStackEnv } from '../lib/config';

const app = new cdk.App();

// Load configuration from cdk.context.json / env vars
const config = loadConfig(app);
const env = getStackEnv(config);

// ============================================================
// PlatformStack — every non-compute resource
//
// NOTE: The construct ID below is what `cdk deploy <name>` matches
// against (NOT the `stackName` prop). The deploy scripts in
// scripts/platform/ invoke `cdk deploy "${CDK_PROJECT_PREFIX}-PlatformStack"`,
// so the construct ID must be the prefixed name. CDK will use this
// same string as the CloudFormation stack name by default, which is
// also what we want — no `stackName` override needed.
// ============================================================
const platform = new PlatformStack(app, `${config.projectPrefix}-PlatformStack`, {
  config,
  env,
  description: `${config.projectPrefix} Platform Stack - VPC, ALB, DynamoDB, S3, Cognito, CloudFront`,
});

// The SPA CloudFront distribution needs the ALB URL (published by
// Platform's own AlbDnsConstruct) as the /api/* origin. Since both
// the publisher and consumer are in the same stack, we resolve the
// SSM token inline.
const appApiUrl = ssm.StringParameter.valueForStringParameter(
  platform,
  `/${config.projectPrefix}/network/alb-url`,
);
platform.wireSpaDistribution(appApiUrl);

// ============================================================
// BackendStack — all compute (Fargate, AgentCore, Lambdas)
//
// Same convention as PlatformStack above: the construct ID is the
// prefixed name so `cdk deploy "${CDK_PROJECT_PREFIX}-BackendStack"`
// from scripts/backend/deploy.sh resolves correctly, and CDK uses
// the same string as the CloudFormation stack name.
// ============================================================
const backend = new BackendStack(app, `${config.projectPrefix}-BackendStack`, {
  config,
  env,
  platform,
  description: `${config.projectPrefix} Backend Stack - Fargate, AgentCore Runtime, Gateway, Lambdas`,
});

// Wire the artifacts CloudFront distribution AFTER both stacks are
// constructed. This avoids a circular CDK dependency (Platform needs
// Backend's render Lambda Function URL; Backend needs Platform's RAG
// bucket). The distribution lives in Platform but its origin is in Backend.
if (backend.artifactRenderFunctionUrl) {
  // Artifacts distribution lives in BackendStack now (no cycle)
}

app.synth();
