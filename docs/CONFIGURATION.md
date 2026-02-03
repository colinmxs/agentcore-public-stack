# Configuration Reference

This document provides a comprehensive reference for all environment variables used in the AgentCore Public Stack application. The application is fully configuration-driven, with all environment-specific behavior controlled through external configuration.

## Table of Contents

- [Overview](#overview)
- [Configuration Categories](#configuration-categories)
  - [CDK Core Configuration](#cdk-core-configuration)
  - [CDK Resource Behavior](#cdk-resource-behavior)
  - [CDK Service Scaling](#cdk-service-scaling)
  - [CDK CORS & File Upload](#cdk-cors--file-upload)
  - [CDK Authentication](#cdk-authentication)
  - [Frontend Configuration](#frontend-configuration)
- [Configuration by Deployment Type](#configuration-by-deployment-type)
- [Validation Rules](#validation-rules)
- [Resource Naming](#resource-naming)
- [Examples](#examples)

## Overview

All configuration is loaded from environment variables with specific prefixes:
- **CDK_*** - Infrastructure and backend configuration (used by AWS CDK)
- **APP_*** - Frontend application URLs
- **INFERENCE_*** - Inference API URLs
- **PRODUCTION** - Frontend production mode flag
- **ENABLE_AUTHENTICATION** - Frontend authentication flag
- **AWS_*** - AWS credentials and deployment configuration

Configuration can be set via:
- **GitHub Variables/Secrets** - For CI/CD deployments
- **Environment Variables** - For local development
- **GitHub Environments** - For multi-environment deployments (dev/staging/prod)

## Configuration Categories

### CDK Core Configuration

Core infrastructure identification and AWS account settings.

| Variable | Type | Required | Default | Description | Example |
|----------|------|----------|---------|-------------|---------|
| `CDK_PROJECT_PREFIX` | string | ✅ Yes | - | Resource name prefix for all AWS resources. Used to generate unique resource names. Include environment suffix if deploying multiple environments (e.g., "myapp-prod", "myapp-dev"). | `"mycompany-agentcore"` or `"mycompany-agentcore-prod"` |
| `CDK_AWS_ACCOUNT` | string (secret) | ✅ Yes | - | AWS account ID (12-digit number). Must be stored as a GitHub Secret for security. | `"123456789012"` |
| `CDK_AWS_REGION` | string | ✅ Yes | - | AWS region code where resources will be deployed. Must be a valid AWS region. | `"us-west-2"`, `"us-east-1"`, `"eu-west-1"` |
| `AWS_ROLE_ARN` | string (secret) | ✅ Yes | - | AWS IAM role ARN for GitHub Actions deployment. Used for OIDC authentication. Must be stored as a GitHub Secret. | `"arn:aws:iam::123456789012:role/github-deploy"` |

**Notes:**
- All four variables are required for deployment
- `CDK_AWS_ACCOUNT` and `AWS_ROLE_ARN` should be stored as GitHub Secrets, not Variables
- `CDK_PROJECT_PREFIX` determines all resource names - use different prefixes for multiple environments

### CDK Resource Behavior

Controls how AWS resources behave when stacks are deleted.

| Variable | Type | Required | Default | Description | Example |
|----------|------|----------|---------|-------------|---------|
| `CDK_RETAIN_DATA_ON_DELETE` | boolean | No | `"true"` | Controls data retention when CloudFormation stacks are deleted. When `"true"`, DynamoDB tables and S3 buckets use RETAIN removal policy and persist after stack deletion. When `"false"`, resources use DESTROY removal policy with `autoDeleteObjects` enabled for S3 buckets. | `"true"` (production), `"false"` (development) |

**Valid Values:** `"true"`, `"false"`, `"1"`, `"0"` (case-insensitive)

**Impact:**
- **`"true"`** (Recommended for production):
  - DynamoDB tables: `RemovalPolicy.RETAIN`
  - S3 buckets: `RemovalPolicy.RETAIN`, `autoDeleteObjects: false`
  - Resources persist after `cdk destroy`
  - Manual cleanup required
  
- **`"false"`** (Recommended for development):
  - DynamoDB tables: `RemovalPolicy.DESTROY`
  - S3 buckets: `RemovalPolicy.DESTROY`, `autoDeleteObjects: true`
  - All data deleted with `cdk destroy`
  - Automatic cleanup

**Affected Resources:**
- DynamoDB tables: user-quotas, user-sessions, user-costs, user-data, rbac-roles, rbac-permissions (15 tables total)
- S3 buckets: user-files, frontend-assets, cloudfront-logs

### CDK Service Scaling

Controls ECS task counts, CPU, and memory for App API and Inference API services.

#### App API Configuration

The App API is the main application backend handling authentication, sessions, messages, files, and admin operations.

| Variable | Type | Required | Default | Description | Example |
|----------|------|----------|---------|-------------|---------|
| `CDK_APP_API_DESIRED_COUNT` | number | No | `"2"` | Desired number of ECS tasks running for App API. Minimum recommended: 1 for dev, 2 for production. | `"3"` (production), `"1"` (development) |
| `CDK_APP_API_MAX_CAPACITY` | number | No | `"10"` | Maximum number of ECS tasks for auto-scaling. Should be higher than desired count to allow scaling under load. | `"20"` (production), `"5"` (development) |
| `CDK_APP_API_CPU` | number | No | `"1024"` | CPU units allocated per task (1024 = 1 vCPU). Valid values: 256, 512, 1024, 2048, 4096. | `"2048"` (production), `"1024"` (development) |
| `CDK_APP_API_MEMORY` | number | No | `"2048"` | Memory in MB allocated per task. Must be compatible with CPU value (see AWS Fargate task definitions). | `"4096"` (production), `"2048"` (development) |

**CPU/Memory Compatibility:**
- 256 CPU: 512, 1024, 2048 MB
- 512 CPU: 1024-4096 MB (1 GB increments)
- 1024 CPU: 2048-8192 MB (1 GB increments)
- 2048 CPU: 4096-16384 MB (1 GB increments)
- 4096 CPU: 8192-30720 MB (1 GB increments)

#### Inference API Configuration

The Inference API handles Bedrock model inference and agent orchestration.

| Variable | Type | Required | Default | Description | Example |
|----------|------|----------|---------|-------------|---------|
| `CDK_INFERENCE_API_DESIRED_COUNT` | number | No | `"2"` | Desired number of ECS tasks running for Inference API. Minimum recommended: 1 for dev, 2 for production. | `"3"` (production), `"1"` (development) |
| `CDK_INFERENCE_API_MAX_CAPACITY` | number | No | `"10"` | Maximum number of ECS tasks for auto-scaling. Should be higher than desired count to allow scaling under load. | `"20"` (production), `"5"` (development) |
| `CDK_INFERENCE_API_CPU` | number | No | `"1024"` | CPU units allocated per task (1024 = 1 vCPU). Valid values: 256, 512, 1024, 2048, 4096. | `"2048"` (production), `"1024"` (development) |
| `CDK_INFERENCE_API_MEMORY` | number | No | `"2048"` | Memory in MB allocated per task. Must be compatible with CPU value (see AWS Fargate task definitions). | `"4096"` (production), `"2048"` (development) |

**Scaling Recommendations:**
- **Development**: Minimal capacity (1 task, 1024 CPU, 2048 MB) to reduce costs
- **Staging**: Moderate capacity (2 tasks, 1024 CPU, 2048 MB) for testing
- **Production**: Higher capacity (3+ tasks, 2048+ CPU, 4096+ MB) for performance and availability

### CDK CORS & File Upload

Controls Cross-Origin Resource Sharing (CORS) and file upload limits.

| Variable | Type | Required | Default | Description | Example |
|----------|------|----------|---------|-------------|---------|
| `CDK_FILE_UPLOAD_CORS_ORIGINS` | string | No | `"http://localhost:4200"` | Comma-separated list of allowed CORS origins for file upload API. Each origin must be a valid URL. Whitespace around commas is trimmed. | `"https://app.example.com"` or `"https://app.example.com,https://staging.example.com"` |
| `CDK_FILE_UPLOAD_MAX_SIZE_MB` | number | No | `"10"` | Maximum file upload size in megabytes. Applied to S3 bucket policies and API Gateway limits. | `"50"` (production), `"10"` (development) |

**CORS Configuration Notes:**
- Each origin must include protocol (http:// or https://)
- Wildcards are supported: `"https://*.example.com"`
- Multiple origins: `"https://app.example.com,https://admin.example.com,http://localhost:4200"`
- Local development default: `"http://localhost:4200"`

**File Upload Limits:**
- API Gateway maximum: 10 MB (hard limit)
- S3 maximum: 5 TB per object
- Recommended: 10-50 MB for typical use cases

### CDK Authentication

Controls authentication requirements for the application.

| Variable | Type | Required | Default | Description | Example |
|----------|------|----------|---------|-------------|---------|
| `CDK_ENABLE_AUTHENTICATION` | boolean | No | `"true"` | Enable or disable authentication for the entire application. When `"false"`, authentication is bypassed (useful for development/testing). When `"true"`, AWS Cognito authentication is required. | `"true"` (production), `"false"` (local testing) |

**Valid Values:** `"true"`, `"false"`, `"1"`, `"0"` (case-insensitive)

**Impact:**
- **`"true"`**: Cognito authentication required, JWT validation enabled, RBAC enforced
- **`"false"`**: Authentication bypassed, all requests allowed (⚠️ **NOT recommended for production**)

### Frontend Configuration

Controls frontend application behavior and API endpoint URLs.

| Variable | Type | Required | Default | Description | Example |
|----------|------|----------|---------|-------------|---------|
| `APP_API_URL` | string | ✅ Yes* | `"http://localhost:8000"` | App API endpoint URL. Used by frontend to connect to backend services. Required for production builds. | `"https://api.mycompany.com"` (production), `"http://localhost:8000"` (local) |
| `INFERENCE_API_URL` | string | ✅ Yes* | `"http://localhost:8001"` | Inference API endpoint URL. Used by frontend to connect to AI inference services. Required for production builds. | `"https://inference.mycompany.com"` (production), `"http://localhost:8001"` (local) |
| `PRODUCTION` | boolean | No | `"false"` | Enable production mode in frontend. Affects error handling, logging, and optimizations. | `"true"` (production), `"false"` (development) |
| `ENABLE_AUTHENTICATION` | boolean | No | `"true"` | Enable or disable authentication in frontend UI. When `"false"`, login/logout UI is hidden. | `"true"` (production), `"false"` (local testing) |

*Required for production deployments, optional for local development (uses localhost defaults).

**Valid Values for Booleans:** `"true"`, `"false"`, `"1"`, `"0"` (case-insensitive)

**Frontend Build Process:**
- Local development: Uses defaults from `environment.ts` (localhost URLs)
- Production build: Environment variables injected at build time via `envsubst` or similar
- Runtime validation: Frontend validates required URLs are present and not localhost in production mode

## Configuration by Deployment Type

### Local Development

Minimal configuration required - uses localhost defaults.

```bash
# Backend (.env file)
AWS_REGION=us-east-1
AWS_PROFILE=default
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>

# Frontend (uses defaults from environment.ts)
# No configuration needed - automatically uses:
# - APP_API_URL: http://localhost:8000
# - INFERENCE_API_URL: http://localhost:8001
# - PRODUCTION: false
# - ENABLE_AUTHENTICATION: true
```

**Required:**
- AWS credentials for Bedrock access
- No CDK variables needed
- No frontend configuration needed

### Single-Environment Deployment

Deploy to AWS with minimal configuration.

**GitHub Variables:**
```bash
CDK_PROJECT_PREFIX="mycompany-agentcore"
CDK_AWS_REGION="us-west-2"
CDK_FILE_UPLOAD_CORS_ORIGINS="https://app.mycompany.com"
APP_API_URL="https://api.mycompany.com"
INFERENCE_API_URL="https://inference.mycompany.com"
```

**GitHub Secrets:**
```bash
AWS_ROLE_ARN="arn:aws:iam::123456789012:role/deploy-role"
CDK_AWS_ACCOUNT="123456789012"
```

**Optional Variables (uses defaults if not set):**
```bash
CDK_RETAIN_DATA_ON_DELETE="true"
CDK_ENABLE_AUTHENTICATION="true"
PRODUCTION="true"
ENABLE_AUTHENTICATION="true"
```

### Multi-Environment Deployment

Use GitHub Environments to manage separate configurations for dev/staging/prod.

#### Development Environment

**GitHub Environment:** `development`

**Variables:**
```bash
CDK_PROJECT_PREFIX="mycompany-agentcore-dev"
CDK_AWS_REGION="us-west-2"
CDK_RETAIN_DATA_ON_DELETE="false"  # Auto-delete for easy cleanup
CDK_FILE_UPLOAD_CORS_ORIGINS="https://dev-app.mycompany.com,http://localhost:4200"
CDK_APP_API_DESIRED_COUNT="1"
CDK_APP_API_MAX_CAPACITY="5"
CDK_INFERENCE_API_DESIRED_COUNT="1"
CDK_INFERENCE_API_MAX_CAPACITY="5"
APP_API_URL="https://dev-api.mycompany.com"
INFERENCE_API_URL="https://dev-inference.mycompany.com"
PRODUCTION="false"
```

**Secrets:**
```bash
AWS_ROLE_ARN="arn:aws:iam::111111111111:role/dev-deploy"
CDK_AWS_ACCOUNT="111111111111"
```

#### Staging Environment

**GitHub Environment:** `staging`

**Variables:**
```bash
CDK_PROJECT_PREFIX="mycompany-agentcore-staging"
CDK_AWS_REGION="us-west-2"
CDK_RETAIN_DATA_ON_DELETE="true"
CDK_FILE_UPLOAD_CORS_ORIGINS="https://staging-app.mycompany.com"
CDK_APP_API_DESIRED_COUNT="2"
CDK_APP_API_MAX_CAPACITY="10"
CDK_INFERENCE_API_DESIRED_COUNT="2"
CDK_INFERENCE_API_MAX_CAPACITY="10"
APP_API_URL="https://staging-api.mycompany.com"
INFERENCE_API_URL="https://staging-inference.mycompany.com"
PRODUCTION="true"
```

**Secrets:**
```bash
AWS_ROLE_ARN="arn:aws:iam::222222222222:role/staging-deploy"
CDK_AWS_ACCOUNT="222222222222"
```

#### Production Environment

**GitHub Environment:** `production`

**Variables:**
```bash
CDK_PROJECT_PREFIX="mycompany-agentcore-prod"
CDK_AWS_REGION="us-west-2"
CDK_RETAIN_DATA_ON_DELETE="true"  # Always retain production data
CDK_FILE_UPLOAD_CORS_ORIGINS="https://app.mycompany.com"
CDK_APP_API_DESIRED_COUNT="3"
CDK_APP_API_MAX_CAPACITY="20"
CDK_APP_API_CPU="2048"
CDK_APP_API_MEMORY="4096"
CDK_INFERENCE_API_DESIRED_COUNT="3"
CDK_INFERENCE_API_MAX_CAPACITY="20"
CDK_INFERENCE_API_CPU="2048"
CDK_INFERENCE_API_MEMORY="4096"
APP_API_URL="https://api.mycompany.com"
INFERENCE_API_URL="https://inference.mycompany.com"
PRODUCTION="true"
ENABLE_AUTHENTICATION="true"
```

**Secrets:**
```bash
AWS_ROLE_ARN="arn:aws:iam::333333333333:role/prod-deploy"
CDK_AWS_ACCOUNT="333333333333"
```

**Protection Rules:**
- Required reviewers: 2
- Wait timer: 5 minutes
- Restrict to protected branches

## Validation Rules

The application validates configuration at deployment time and provides clear error messages for invalid values.

### Required Variable Validation

**Missing Required Variables:**
```
Error: CDK_PROJECT_PREFIX is required.
Set this environment variable to your desired resource name prefix
(e.g., "mycompany-agentcore" or "mycompany-agentcore-prod")
```

**Validation Logic:**
```typescript
if (!projectPrefix) {
  throw new Error('CDK_PROJECT_PREFIX is required');
}
if (!awsAccount) {
  throw new Error('CDK_AWS_ACCOUNT is required');
}
if (!awsRegion) {
  throw new Error('CDK_AWS_REGION is required');
}
```

### Boolean Value Validation

**Valid Values:** `"true"`, `"false"`, `"1"`, `"0"` (case-insensitive)

**Invalid Values:**
```
Error: Invalid boolean value: "yes".
Expected "true", "false", "1", or "0".
```

**Validation Logic:**
```typescript
function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  
  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  
  throw new Error(`Invalid boolean value: "${value}". Expected "true", "false", "1", or "0".`);
}
```

### AWS Account ID Validation

**Valid Format:** 12-digit number

**Invalid Values:**
```
Error: Invalid AWS account ID: "12345".
Expected a 12-digit number.
```

**Validation Logic:**
```typescript
function validateAwsAccount(account: string): void {
  if (!/^\d{12}$/.test(account)) {
    throw new Error(`Invalid AWS account ID: "${account}". Expected a 12-digit number.`);
  }
}
```

### AWS Region Validation

**Valid Regions:** Standard AWS region codes

**Invalid Values:**
```
Error: Invalid AWS region: "invalid-region".
Expected one of: us-east-1, us-east-2, us-west-1, us-west-2, ...
```

**Validation Logic:**
```typescript
const VALID_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
  // ... other regions
];

function validateAwsRegion(region: string): void {
  if (!VALID_REGIONS.includes(region)) {
    throw new Error(`Invalid AWS region: "${region}". Expected one of: ${VALID_REGIONS.join(', ')}`);
  }
}
```

### CORS Origin Validation

**Valid Format:** Valid URL with protocol

**Invalid Values:**
```
Error: Invalid CORS origin: "example.com".
Expected a valid URL (e.g., "https://example.com")
```

**Validation Logic:**
```typescript
function validateCorsOrigins(origins: string): void {
  const originList = origins.split(',').map(o => o.trim());
  
  for (const origin of originList) {
    try {
      new URL(origin);
    } catch (e) {
      throw new Error(`Invalid CORS origin: "${origin}". Expected a valid URL (e.g., "https://example.com")`);
    }
  }
}
```

## Resource Naming

All AWS resources are named using the pattern: `{CDK_PROJECT_PREFIX}-{resource-type}`

### Naming Pattern

**Format:** `{projectPrefix}-{resource-name}`

**Examples:**
- VPC: `mycompany-agentcore-prod-vpc`
- DynamoDB Table: `mycompany-agentcore-prod-user-quotas`
- S3 Bucket: `mycompany-agentcore-prod-user-files`
- ECS Cluster: `mycompany-agentcore-prod-cluster`
- ALB: `mycompany-agentcore-prod-alb`

### Environment Suffixes

**Important:** The system does NOT automatically add environment suffixes (`-dev`, `-test`, `-prod`).

**To include environment in resource names:**
- Include environment in `CDK_PROJECT_PREFIX` value
- Example: `"mycompany-agentcore-prod"` instead of `"mycompany-agentcore"`

**Before (environment-aware):**
```typescript
// Old behavior - automatic suffix
projectPrefix: "mycompany-agentcore"
environment: "prod"
// Result: mycompany-agentcore-vpc (prod), mycompany-agentcore-dev-vpc (dev)
```

**After (environment-agnostic):**
```typescript
// New behavior - explicit prefix
projectPrefix: "mycompany-agentcore-prod"
// Result: mycompany-agentcore-prod-vpc
```

### Multiple Environments in Same Account

When deploying multiple environments to the same AWS account, use different `CDK_PROJECT_PREFIX` values:

```bash
# Development
CDK_PROJECT_PREFIX="mycompany-agentcore-dev"

# Staging
CDK_PROJECT_PREFIX="mycompany-agentcore-staging"

# Production
CDK_PROJECT_PREFIX="mycompany-agentcore-prod"
```

This prevents resource name conflicts and allows multiple environments to coexist.

## Examples

### Example 1: Production Deployment

**Scenario:** Deploy production application with high availability and data retention.

**Configuration:**
```bash
# Core (GitHub Variables)
CDK_PROJECT_PREFIX="acme-agentcore-prod"
CDK_AWS_REGION="us-west-2"

# Core (GitHub Secrets)
AWS_ROLE_ARN="arn:aws:iam::123456789012:role/prod-deploy"
CDK_AWS_ACCOUNT="123456789012"

# Behavior
CDK_RETAIN_DATA_ON_DELETE="true"

# Frontend
APP_API_URL="https://api.acme.com"
INFERENCE_API_URL="https://inference.acme.com"
PRODUCTION="true"
ENABLE_AUTHENTICATION="true"

# CORS
CDK_FILE_UPLOAD_CORS_ORIGINS="https://app.acme.com"

# Scaling
CDK_APP_API_DESIRED_COUNT="3"
CDK_APP_API_MAX_CAPACITY="20"
CDK_APP_API_CPU="2048"
CDK_APP_API_MEMORY="4096"
CDK_INFERENCE_API_DESIRED_COUNT="3"
CDK_INFERENCE_API_MAX_CAPACITY="20"
CDK_INFERENCE_API_CPU="2048"
CDK_INFERENCE_API_MEMORY="4096"
```

**Result:**
- Resources: `acme-agentcore-prod-vpc`, `acme-agentcore-prod-user-quotas`, etc.
- Data retained on stack deletion
- 3 tasks per service with auto-scaling to 20
- High CPU/memory allocation for performance

### Example 2: Development Deployment

**Scenario:** Deploy development environment with minimal resources and auto-cleanup.

**Configuration:**
```bash
# Core (GitHub Variables)
CDK_PROJECT_PREFIX="acme-agentcore-dev"
CDK_AWS_REGION="us-west-2"

# Core (GitHub Secrets)
AWS_ROLE_ARN="arn:aws:iam::987654321098:role/dev-deploy"
CDK_AWS_ACCOUNT="987654321098"

# Behavior
CDK_RETAIN_DATA_ON_DELETE="false"  # Auto-delete for easy cleanup

# Frontend
APP_API_URL="https://dev-api.acme.com"
INFERENCE_API_URL="https://dev-inference.acme.com"
PRODUCTION="false"
ENABLE_AUTHENTICATION="true"

# CORS (allow localhost for local testing)
CDK_FILE_UPLOAD_CORS_ORIGINS="https://dev-app.acme.com,http://localhost:4200"

# Scaling (minimal)
CDK_APP_API_DESIRED_COUNT="1"
CDK_APP_API_MAX_CAPACITY="5"
CDK_INFERENCE_API_DESIRED_COUNT="1"
CDK_INFERENCE_API_MAX_CAPACITY="5"
```

**Result:**
- Resources: `acme-agentcore-dev-vpc`, `acme-agentcore-dev-user-quotas`, etc.
- Data automatically deleted on stack deletion
- 1 task per service with auto-scaling to 5
- Default CPU/memory allocation (1024/2048)
- CORS allows both dev domain and localhost

### Example 3: Local Development

**Scenario:** Run application locally for development and testing.

**Configuration:**
```bash
# Backend (.env file)
AWS_REGION=us-east-1
AWS_PROFILE=default
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
AGENTCORE_MEMORY_ID=<memory-id>
AGENTCORE_RUNTIME_ID=<runtime-id>

# Frontend (no configuration needed - uses defaults)
# Automatically uses:
# - APP_API_URL: http://localhost:8000
# - INFERENCE_API_URL: http://localhost:8001
# - PRODUCTION: false
# - ENABLE_AUTHENTICATION: true
```

**Result:**
- No CDK deployment
- Frontend connects to localhost:8000 and localhost:8001
- No CORS configuration needed
- No scaling configuration needed

### Example 4: Multi-Environment with GitHub Environments

**Scenario:** Manage dev, staging, and prod environments using GitHub Environments.

**Setup:**
1. Create three GitHub Environments: `development`, `staging`, `production`
2. Configure variables and secrets for each environment
3. Add protection rules for production (required reviewers, wait timer)

**Development Environment:**
```bash
CDK_PROJECT_PREFIX="acme-agentcore-dev"
CDK_RETAIN_DATA_ON_DELETE="false"
CDK_APP_API_DESIRED_COUNT="1"
# ... other dev-specific values
```

**Staging Environment:**
```bash
CDK_PROJECT_PREFIX="acme-agentcore-staging"
CDK_RETAIN_DATA_ON_DELETE="true"
CDK_APP_API_DESIRED_COUNT="2"
# ... other staging-specific values
```

**Production Environment:**
```bash
CDK_PROJECT_PREFIX="acme-agentcore-prod"
CDK_RETAIN_DATA_ON_DELETE="true"
CDK_APP_API_DESIRED_COUNT="3"
CDK_APP_API_CPU="2048"
CDK_APP_API_MEMORY="4096"
# ... other prod-specific values
```

**Workflow:**
- Push to `develop` branch → deploys to `development` environment
- Push to `main` branch → deploys to `production` environment (with approval)
- Manual workflow dispatch → select environment

**Result:**
- Three separate deployments with different configurations
- No code changes needed to switch environments
- Production protected with approval workflow

## See Also

- [Migration Guide](MIGRATION_GUIDE.md) - Migrating from environment-aware to configuration-driven approach
- [GitHub Environments Setup](GITHUB_ENVIRONMENTS.md) - Setting up multi-environment deployments
- [README.md](../README.md) - Quick start and overview
