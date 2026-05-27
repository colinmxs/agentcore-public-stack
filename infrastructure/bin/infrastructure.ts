#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';

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

// The SPA distribution and the RAG-CORS updater both consume values
// (ALB URL, RAG documents bucket) published by sibling constructs in
// the same Platform stack. They're wired through direct construct
// references inside `wireSpaDistribution()`. The previous version of
// this code round-tripped via SSM, which deadlocked on first deploy:
// CFN resolves `AWS::SSM::Parameter::Value<String>` parameters before
// any of the stack's resources are created, so reading the same-stack
// SSM parameter that this stack would itself create is unsatisfiable.
platform.wireSpaDistribution();

// ============================================================
// BackendStack — all compute (Fargate, AgentCore, Lambdas)
//
// Same convention as PlatformStack above: the construct ID is the
// prefixed name so `cdk deploy "${CDK_PROJECT_PREFIX}-BackendStack"`
// from scripts/backend/deploy.sh resolves correctly, and CDK uses
// the same string as the CloudFormation stack name.
// ============================================================
new BackendStack(app, `${config.projectPrefix}-BackendStack`, {
  config,
  env,
  platform,
  description: `${config.projectPrefix} Backend Stack - Fargate, AgentCore Runtime, Lambdas (until Phases 4-6 of the platform-as-bootstrap refactor land)`,
});

app.synth();
