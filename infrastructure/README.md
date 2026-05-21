# Infrastructure

Two-stack CDK architecture for the AgentCore platform.

## Stacks

| Stack | Purpose |
|-------|---------|
| **PlatformStack** | VPC, ALB, Cognito, DynamoDB tables, S3 buckets, CloudFront distributions, Route53, Secrets Manager |
| **BackendStack** | App API Fargate service, AgentCore Runtime/Memory/Gateway, RAG ingestion Lambda, artifact render Lambda, SageMaker IAM |

The frontend is deployed separately via `scripts/frontend/` (S3 sync + CloudFront invalidation).

## Deploy Order

```
1. PlatformStack   → scripts/platform/deploy.sh
2. BackendStack    → scripts/backend/deploy.sh  (builds images first)
3. Frontend        → scripts/frontend/build.sh + scripts/frontend/deploy.sh
```

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 22+
- Docker (for container image builds)
- `CDK_PROJECT_PREFIX`, `CDK_AWS_REGION`, `CDK_AWS_ACCOUNT` environment variables set

## Commands

```bash
cd infrastructure

# Install dependencies
npm ci

# Synthesize both stacks
npx cdk synth

# List stacks
npx cdk list

# Deploy PlatformStack
npx cdk deploy {prefix}-PlatformStack

# Deploy BackendStack (after building images)
npx cdk deploy {prefix}-BackendStack

# Diff
npx cdk diff
```

## Content-Hash Docker Builds

Container images are tagged with a SHA-256 content hash of their source inputs. The build pipeline (`scripts/build/`) skips `docker build` + `docker push` when ECR already has an image with the computed tag.

```bash
# Build all images (skips unchanged)
scripts/build/build-all-images.sh

# Compute hash for a single service
scripts/build/compute-content-hash.sh \
  --dockerfile backend/Dockerfile.app-api \
  --source-dir backend/src \
  --manifest backend/pyproject.toml
```

## Feature Flags

Two optional features are gated by config:

- `config.artifacts.enabled` — provisions artifacts DDB + S3 + CloudFront + render Lambda
- `config.fineTuning.enabled` — provisions fine-tuning DDB + S3 + SageMaker IAM

All other resources are always provisioned.

## Legacy Stacks

If migrating from the previous 9-stack architecture, delete the old CloudFormation stacks before deploying the new two-stack architecture:

```bash
aws cloudformation delete-stack --stack-name {prefix}-InfrastructureStack
aws cloudformation delete-stack --stack-name {prefix}-AppApiStack
aws cloudformation delete-stack --stack-name {prefix}-InferenceApiStack
aws cloudformation delete-stack --stack-name {prefix}-GatewayStack
aws cloudformation delete-stack --stack-name {prefix}-RagIngestionStack
aws cloudformation delete-stack --stack-name {prefix}-SageMakerFineTuningStack
aws cloudformation delete-stack --stack-name {prefix}-ArtifactsStack
aws cloudformation delete-stack --stack-name {prefix}-McpSandboxStack
aws cloudformation delete-stack --stack-name {prefix}-FrontendStack
```

Back up data first using `scripts/backup-data/`.
