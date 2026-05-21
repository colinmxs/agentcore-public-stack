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
// ============================================================
const platform = new PlatformStack(app, 'PlatformStack', {
  config,
  env,
  description: `${config.projectPrefix} Platform Stack - VPC, ALB, DynamoDB, S3, Cognito, CloudFront`,
  stackName: `${config.projectPrefix}-PlatformStack`,
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
// ============================================================
new BackendStack(app, 'BackendStack', {
  config,
  env,
  platform,
  description: `${config.projectPrefix} Backend Stack - Fargate, AgentCore Runtime, Gateway, Lambdas`,
  stackName: `${config.projectPrefix}-BackendStack`,
});

app.synth();
