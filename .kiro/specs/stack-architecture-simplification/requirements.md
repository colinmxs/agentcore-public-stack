# Requirements Document

## Introduction

This feature consolidates the current 7–8 stack CDK architecture into exactly two stacks — `PlatformStack` and `BackendStack` — grouped by change cadence rather than by service. The goal is to simplify deployment, reduce stack-ordering coordination, and make it easier to reason about what is being shipped on any given deploy.

The allocation principle is that the platform owns every resource that does not run application code, and the backend stack owns only the slivers it needs. PlatformStack owns the VPC, ALB, Cognito, every shared DynamoDB table (including OAuth tables), every data S3 bucket (file upload, RAG ingestion, fine-tuning), the Route53 hosted zone when a domain is configured, the SPA's S3 bucket, the CloudFront distribution that fronts both the SPA and the Platform ALB at `/api/*`, and the Route53 alias records that point the configured frontend domain at the CloudFront distribution. BackendStack owns the compute that runs application and AI code: AgentCore Runtime/Memory/Gateway, MCP Lambdas, the RAG ingestion Lambda, the two Fargate services, the SageMaker Fine-Tuning IAM roles, the ECR repositories, and the target group attachments on the Platform ALB.

The frontend is no longer a CDK stack. SPA deployment is a CI workflow that builds the Angular bundle, syncs the output to the Platform-owned SPA S3 bucket, and issues a CloudFront invalidation against the Platform-owned distribution.

A secondary goal is to make Docker image builds and pushes content-aware, so that the build pipeline only produces and uploads new images when source content has actually changed. Today the Fargate and Lambda container builds are the slowest segments of every deploy, and they run on every push regardless of whether the underlying code changed.

This is a greenfield rework on the `develop` branch. There is no production traffic to preserve and no backwards-compatibility surface to maintain. Existing stacks (`InfrastructureStack`, `AppApiStack`, `InferenceApiStack`, `GatewayStack`, `RagIngestionStack`, `SageMakerFineTuningStack`, `ArtifactsStack`, `McpSandboxStack`, and the original `FrontendStack`) and their per-service GitHub Actions workflows will be replaced wholesale.

## Glossary

- **Infrastructure_App**: The CDK application defined in `infrastructure/bin/infrastructure.ts` that instantiates and synthesizes stacks.
- **PlatformStack**: The new CDK stack that owns long-lived foundation resources: VPC, ALB with HTTPS listener and ACM certificate, Cognito, all shared DynamoDB tables (including OAuth tables), all data S3 buckets (file upload, RAG, fine-tuning), the Route53 hosted zone when a domain name is configured, the S3 bucket for the Angular static build artifacts, the CloudFront distribution with the SPA bucket as default origin and the platform Application Load Balancer as the `/api/*` origin, and Route53 alias records pointing the configured frontend domain at the CloudFront distribution when a domain name is configured.
- **BackendStack**: The new CDK stack that owns daily-changing application and AI compute: AgentCore Runtime, Memory, Gateway, MCP Lambdas, RAG ingestion Lambda, Fargate `app_api`, Fargate `inference_api`, SageMaker Fine-Tuning IAM roles, ECR repositories, and target group attachments on the Platform ALB.
- **Frontend_Deploy_Workflow**: The CI workflow that builds the Angular SPA, synchronizes the build artifacts to the Platform-owned SPA S3 bucket, and issues a CloudFront invalidation against the Platform-owned distribution.
- **Infrastructure_Source**: The TypeScript source directly under `infrastructure/lib/` that defines the two stacks and their reusable constructs.
- **Build_System**: The set of scripts under `scripts/` (and their CI invocations) that build, tag, and push Docker images for `app_api`, `inference_api`, and the MCP/RAG Lambdas.
- **CI_System**: The GitHub Actions workflows under `.github/workflows/` that orchestrate build and deploy pipelines.
- **Configuration_Loader**: The module at `infrastructure/lib/config.ts` that resolves configuration values from environment variables, CDK CLI context flags, `infrastructure/cdk.context.json`, and documented defaults (in that precedence order) and produces a validated typed configuration object consumed by both stacks.
- **Deployment_Procedure**: The documented sequence in `infrastructure/README.md` for performing a fresh deployment of the two stacks against a clean AWS account or region.
- **Content_Hash**: A deterministic SHA-256 hash, expressed as a 64-character lowercase hexadecimal string, computed over a Docker image's Dockerfile, source tree, and dependency manifests, used as the image tag and as the cache key for skip-build decisions.

## Requirements

### Requirement 1: Two-Stack Consolidation

**User Story:** As a platform engineer, I want exactly two CDK stacks (Platform and Backend), so that deployment cognitive load and stack-ordering coordination are minimized.

#### Acceptance Criteria

1. THE Infrastructure_App SHALL define exactly two CDK stacks with construct ids `PlatformStack` and `BackendStack` and SHALL define no other CDK stacks.
2. WHEN `npx cdk list` is executed in the `infrastructure/` working directory against the Infrastructure_App, THE Infrastructure_App SHALL exit with status code 0 and SHALL emit exactly two stack names that case-sensitively match the construct ids defined in criterion 1, with no additional names.
3. THE Infrastructure_Source SHALL contain zero instantiations of the legacy stack classes `InfrastructureStack`, `AppApiStack`, `InferenceApiStack`, `GatewayStack`, `RagIngestionStack`, `SageMakerFineTuningStack`, `ArtifactsStack`, `McpSandboxStack`, and `FrontendStack` anywhere under `infrastructure/`.
4. IF `npx cdk list` emits a stack name that is not one of the two names defined in criterion 1, THEN THE Infrastructure_App SHALL be considered non-conforming and the verification step SHALL fail with a non-zero exit code.
5. WHEN `npx cdk synth` is executed in the `infrastructure/` working directory, THE Infrastructure_App SHALL produce exactly two CloudFormation templates under `infrastructure/cdk.out/`, one per stack.

### Requirement 2: PlatformStack Contents

**User Story:** As a platform engineer, I want every resource that does not run application code grouped into a single PlatformStack, so that monthly-cadence foundation changes do not disturb daily application deploys.

#### Acceptance Criteria

1. WHEN the PlatformStack is synthesized, THE PlatformStack SHALL provision a VPC containing public subnets, private subnets, route tables, NAT gateways, and the VPC endpoints required by application services.
2. WHEN the PlatformStack is synthesized, THE PlatformStack SHALL provision an Application Load Balancer with an HTTPS listener bound to an ACM certificate and a default rule that returns a fixed-response rejection for unmatched requests until other stacks register target groups.
3. WHEN the PlatformStack is synthesized, THE PlatformStack SHALL provision a Cognito User Pool, a Cognito Identity Pool, and one or more User Pool Clients.
4. WHEN the PlatformStack is synthesized, THE PlatformStack SHALL provision every DynamoDB table shared across application services, including the OAuth identity table and the OAuth provider table, with deletion protection enabled so that table data is retained across stack updates.
5. WHEN the PlatformStack is synthesized, THE PlatformStack SHALL provision every data S3 bucket owned by the platform: the file upload bucket, the RAG ingestion bucket, and the SageMaker Fine-Tuning bucket, with CORS rules built via the existing `buildCorsOrigins` helper from `infrastructure/lib/config.ts`.
6. WHERE a domain name is configured, THE PlatformStack SHALL provision a Route53 hosted zone for that domain.
7. WHERE no domain name is configured, THE PlatformStack SHALL provision no Route53 hosted zone, and the synthesized PlatformStack CloudFormation template SHALL contain zero `AWS::Route53::*` resources.
8. WHEN the PlatformStack is synthesized, THE PlatformStack SHALL provision the S3 bucket that holds the Angular static build artifacts.
9. WHEN the PlatformStack is synthesized, THE PlatformStack SHALL provision a CloudFront distribution with a default origin bound to the SPA S3 bucket from criterion 8 via Origin Access Control and a `/api/*` cache behavior whose origin is the Platform-owned Application Load Balancer.
10. WHEN the PlatformStack is synthesized, THE PlatformStack SHALL associate a CloudFront Function or Lambda@Edge with the `/api/*` cache behavior from criterion 9 that strips the `/api` prefix from the request path before the request reaches the Application Load Balancer.
11. WHERE a domain name is configured, THE PlatformStack SHALL provision a Route53 alias record in the Platform-owned hosted zone pointing the configured frontend domain at the CloudFront distribution from criterion 9.
12. WHERE no domain name is configured, THE PlatformStack SHALL provision no Route53 records.
13. WHEN the PlatformStack creates or updates a resource listed in criteria 1 through 11, THE PlatformStack SHALL publish a reference to that resource as an AWS Systems Manager Parameter Store parameter under the path prefix `/{projectPrefix}/platform/`, where `{projectPrefix}` is the configured project prefix value.
14. WHEN the PlatformStack creates the SPA S3 bucket from criterion 8 and the CloudFront distribution from criterion 9, THE PlatformStack SHALL publish their identifiers to Systems Manager Parameter Store under the path prefix `/{projectPrefix}/platform/` so that the Frontend_Deploy_Workflow can resolve them at deploy time.
15. IF provisioning of any resource in criteria 1 through 11 fails during deployment, THEN THE PlatformStack SHALL fail the deployment, SHALL not publish a Parameter Store entry for the failed resource, and SHALL preserve any previously deployed resources and their existing Parameter Store entries unchanged.
16. THE PlatformStack SHALL NOT provision a Secrets Manager secret named `{projectPrefix}-auth-provider-secrets` or any other Secrets Manager secret intended to hold OIDC auth provider client secrets, AND SHALL NOT publish a Systems Manager Parameter Store parameter at the path `/{projectPrefix}/auth/auth-provider-secrets-arn` or any equivalent parameter path that exposes such a secret's ARN, AND the synthesized PlatformStack CloudFormation template SHALL contain zero `AWS::SecretsManager::Secret` resources whose `Name` property begins with the literal `{projectPrefix}-auth-provider-secrets`.

### Requirement 3: BackendStack Contents

**User Story:** As a platform engineer, I want the BackendStack to own only the compute that runs application and AI code, so that one deploy corresponds to one shipped feature and the stack does not churn long-lived data resources.

#### Acceptance Criteria

1. WHEN the BackendStack is synthesized, THE BackendStack SHALL provision a Bedrock AgentCore Runtime configuration, a Bedrock AgentCore Memory resource, and a Bedrock AgentCore Gateway with its target configurations.
2. WHEN the BackendStack is synthesized, THE BackendStack SHALL provision exactly five MCP Lambda functions with logical names corresponding to the legacy GatewayStack set: Wikipedia, ArXiv, Google, Tavily, and Finance.
3. WHEN the BackendStack is synthesized, THE BackendStack SHALL provision exactly one Fargate service and exactly one task definition for `app_api`.
4. WHEN the BackendStack is synthesized, THE BackendStack SHALL provision exactly one Fargate service and exactly one task definition for `inference_api`.
5. WHEN the BackendStack is synthesized, THE BackendStack SHALL provision the RAG ingestion Lambda with an IAM role granting access to the Platform-owned RAG ingestion S3 bucket and the Platform-owned RAG DynamoDB table, and SHALL declare those resource ARNs as construct dependencies of the Lambda construct.
6. WHEN the BackendStack is synthesized, THE BackendStack SHALL provision the IAM roles required by SageMaker Fine-Tuning jobs, and SHALL provision no DynamoDB tables and no S3 buckets for fine-tuning.
7. WHEN the BackendStack is synthesized, THE BackendStack SHALL provision exactly three ECR repositories: one for the `app_api` image, one for the `inference_api` image, and one shared repository for MCP Lambda container images.
8. WHEN the BackendStack is synthesized, THE BackendStack SHALL register the `app_api` Fargate service and the `inference_api` Fargate service as target groups attached to the Platform-owned Application Load Balancer; this target group attachment is sufficient to expose the services through the Platform CloudFront `/api/*` behavior, and the BackendStack SHALL not provision any DNS record for either service.
9. WHEN the BackendStack resolves a PlatformStack resource reference, THE BackendStack SHALL resolve it through Systems Manager Parameter Store and SHALL not use `Fn::ImportValue` or any PlatformStack `Export` declaration.
10. IF a Systems Manager Parameter Store parameter required by the BackendStack is missing or unreadable at synthesis time, THEN THE Infrastructure_App SHALL terminate synthesis with an error message that names the missing parameter and the BackendStack as the requiring stack.
11. THE synthesized BackendStack CloudFormation template SHALL contain zero `AWS::RDS::*` resources, and the BackendStack source files under `infrastructure/lib/` SHALL contain no comments referencing RDS, Aurora, or any other relational database as a persistence option.
12. THE synthesized BackendStack CloudFormation template SHALL contain zero `AWS::S3::Bucket` resources.
13. THE synthesized BackendStack CloudFormation template SHALL contain zero `AWS::DynamoDB::Table` resources.
14. THE synthesized BackendStack CloudFormation template SHALL contain zero `AWS::Route53::*` resources, and the BackendStack SHALL not provision an `api.{domain}` DNS record or any other DNS record.
15. THE BackendStack SHALL NOT inject an `AUTH_PROVIDER_SECRETS_ARN` environment variable into the `app_api` Fargate task container, the `inference_api` Fargate task container, or any AgentCore Runtime configuration, SHALL NOT grant `secretsmanager:GetSecretValue`, `secretsmanager:PutSecretValue`, or `secretsmanager:DescribeSecret` IAM actions against any Secrets Manager resource whose name begins with the literal `{projectPrefix}-auth-provider-secrets`, AND SHALL NOT read any Systems Manager Parameter Store parameter at the path `/{projectPrefix}/auth/auth-provider-secrets-arn`.

### Requirement 4: Stack Dependency Direction

**User Story:** As a developer, I want a one-way CDK stack-dependency graph between exactly two stacks, so that the BackendStack only depends on the PlatformStack.

#### Acceptance Criteria

1. THE BackendStack SHALL declare the PlatformStack as a CDK stack dependency via `Stack.addDependency`.
2. THE PlatformStack SHALL not declare a CDK stack dependency on the BackendStack, and the synthesized PlatformStack CloudFormation template SHALL contain zero references to BackendStack resources.
3. WHEN the Infrastructure_App creates a cross-stack reference between the PlatformStack and the BackendStack, THE Infrastructure_App SHALL resolve the reference through Systems Manager Parameter Store, and the synthesized templates SHALL contain zero `Outputs` entries with `Export` declarations and zero `Fn::ImportValue` references for cross-stack data sharing.
4. IF any of criteria 1 through 3 is violated, THEN `npx cdk synth` SHALL terminate with a non-zero exit code.

### Requirement 5: Content-Hash-Based Docker Image Build

**User Story:** As a developer, I want Docker images to be rebuilt and pushed only when their source content changes, so that deploys do not pay the 5–15 minute cost of redundant container builds.

#### Acceptance Criteria

1. THE Build_System SHALL compute a Content_Hash for each containerized service over the service's Dockerfile, all tracked source files under the service's source directory, and the dependency manifests `pyproject.toml` and `uv.lock`, using SHA-256 expressed as a 64-character lowercase hexadecimal string, and SHALL produce byte-identical Content_Hash values for identical inputs.
2. THE Build_System SHALL push the resulting image to ECR with an image tag whose value is the Content_Hash verbatim, with no prefix, suffix, or transformation applied.
3. IF an image already exists in ECR with a tag equal to the computed Content_Hash for a service, THEN THE Build_System SHALL skip the `docker build` step for that service.
4. IF an image already exists in ECR with a tag equal to the computed Content_Hash for a service, THEN THE Build_System SHALL skip the `docker push` step for that service.
5. IF no image exists in ECR with a tag equal to the computed Content_Hash for a service, THEN THE Build_System SHALL execute `docker build` for that service tagged with the Content_Hash.
6. IF no image exists in ECR with a tag equal to the computed Content_Hash for a service after the build in criterion 5, THEN THE Build_System SHALL execute `docker push` for that image to the corresponding ECR repository.
7. THE Build_System SHALL emit a named output for each service whose value is equal to the resolved Content_Hash and which is consumable as a deploy-time parameter by BackendStack synthesis.
8. IF the Content_Hash computation fails for a service, THEN THE Build_System SHALL fall back to executing `docker build` and `docker push` for that service.
9. IF the Content_Hash computation fails for a service, THEN THE Build_System SHALL log the failure reason.
10. IF the ECR existence-check call itself fails for a service, THEN THE Build_System SHALL fall back to executing `docker build` and `docker push` for that service and SHALL log the failure reason.

### Requirement 6: Image Tag Decoupling

**User Story:** As a CDK developer, I want stacks to consume pinned image tags from build inputs, so that image content and infrastructure deployments are decoupled.

#### Acceptance Criteria

1. THE BackendStack SHALL accept image tags for `app_api`, `inference_api`, and each MCP Lambda container as deploy-time parameters provided by the Build_System, where each tag is a string of 1 to 128 characters matching the pattern `^[a-zA-Z0-9._-]+$`.
2. WHEN the BackendStack receives an image tag matching the currently deployed value for a compute resource, THE BackendStack SHALL produce zero resource changes for that compute resource in `cdk diff`.
3. WHEN the BackendStack receives an image tag for `app_api` or `inference_api` differing from the currently deployed value, THE BackendStack SHALL update only that service's Fargate task definition to reference the new tag and SHALL produce zero changes for the other Fargate task definition or for any Lambda function.
4. WHEN the BackendStack receives an image tag for an MCP Lambda container differing from the currently deployed value AND every other image tag parameter received by the BackendStack matches its currently deployed value, THE BackendStack SHALL update only that Lambda function to reference the new tag and SHALL produce zero changes for any Fargate task definition or other Lambda function.
5. IF an image tag deploy-time parameter required by the BackendStack is absent at synthesis time, THEN THE Infrastructure_App SHALL terminate synthesis with an error indicating the missing tag parameter name and the requiring compute resource.
6. IF an image tag deploy-time parameter received by the BackendStack does not match the format defined in criterion 1, THEN THE Infrastructure_App SHALL terminate synthesis with an error indicating the malformed tag parameter name.

### Requirement 7: CI/CD Workflow Consolidation

**User Story:** As a developer, I want CI/CD workflows aligned with the two-stack model and a separate frontend-deploy workflow, so that workflow names map directly onto deployment boundaries and the pipeline stops paying for synthetic validation steps that never catch real issues.

#### Acceptance Criteria

1. THE CI_System SHALL contain exactly two stack-deploy workflow files under `.github/workflows/`, one each dedicated to PlatformStack and BackendStack, and SHALL contain exactly one frontend-deploy workflow file dedicated to the Frontend_Deploy_Workflow.
2. WHEN a CI run triggers a BackendStack deploy, THE CI_System SHALL execute the content-hash Docker build step before the BackendStack deploy step within the same workflow run.
3. IF the content-hash Docker build step fails during a BackendStack deploy run, THEN THE CI_System SHALL halt the workflow run without executing the BackendStack deploy step and SHALL report a failed run status.
4. WHEN the Frontend_Deploy_Workflow runs, THE Frontend_Deploy_Workflow SHALL build the Angular SPA, synchronize the resulting build artifacts to the Platform-owned SPA S3 bucket via `aws s3 sync`, and issue a CloudFront invalidation against the Platform-owned distribution via `aws cloudfront create-invalidation`.
5. WHEN the Frontend_Deploy_Workflow resolves the SPA S3 bucket name and the CloudFront distribution id, THE Frontend_Deploy_Workflow SHALL read both values from Systems Manager Parameter Store under the Platform path prefix `/{projectPrefix}/platform/`.
6. IF the SPA build fails during a Frontend_Deploy_Workflow run, THEN THE Frontend_Deploy_Workflow SHALL halt without invoking `aws s3 sync` or `aws cloudfront create-invalidation` and SHALL report a failed run status.
7. THE CI_System SHALL not contain the legacy per-service workflow files `app-api.yml`, `inference-api.yml`, `gateway.yml`, `infrastructure.yml`, `mcp-sandbox.yml`, `sagemaker-fine-tuning.yml`, `rag-ingestion.yml`, or `bootstrap-data-seeding.yml` under `.github/workflows/`.
8. THE CI_System SHALL replace the legacy `frontend.yml` workflow with the new frontend-deploy workflow file required by criterion 1, which is its sole replacement and which implements the Frontend_Deploy_Workflow.
9. THE CI_System SHALL retain the cross-cutting workflow files `codeql.yml`, `version-check.yml`, `release.yml`, `nightly.yml`, `nightly-deploy-pipeline.yml`, and `artifacts.yml` under `.github/workflows/`.
10. THE CI_System SHALL replace every reference to a legacy per-service stack name within the retained cross-cutting workflows with a reference to PlatformStack or BackendStack.
11. THE CI_System SHALL not contain any post-synth `Validate CloudFormation template` step or `Validate CloudFormation Template` job in any of the two stack-deploy workflows or the Frontend_Deploy_Workflow, and SHALL not invoke any `test-cdk.sh` script or equivalent intermediate validation step between `cdk synth` and `cdk deploy`.

### Requirement 8: CDK Source Layout

**User Story:** As a developer, I want `infrastructure/lib/` to reflect the two-stack model, so that the file tree matches the deployment topology.

#### Acceptance Criteria

1. THE Infrastructure_Source SHALL contain exactly two top-level stack files directly under `infrastructure/lib/`: `platform-stack.ts` and `backend-stack.ts`.
2. THE Infrastructure_Source SHALL contain none of the legacy stack source files `infrastructure-stack.ts`, `app-api-stack.ts`, `inference-api-stack.ts`, `gateway-stack.ts`, `rag-ingestion-stack.ts`, `sagemaker-fine-tuning-stack.ts`, `artifacts-stack.ts`, `mcp-sandbox-stack.ts`, and `frontend-stack.ts`, and SHALL contain none of those files' compiled artifacts (`*.js`, `*.d.ts`).
3. WHERE reusable resource definitions are factored out, THE Infrastructure_Source SHALL place them under `infrastructure/lib/constructs/` and the two top-level stack files SHALL consume those definitions via TypeScript `import` statements rather than redeclaring construct logic inline.
4. THE Infrastructure_Source SHALL allow the two top-level stack files in criterion 1 to exist before the `infrastructure/lib/constructs/` directory is populated, AND SHALL allow each top-level stack file to mix `import` statements consuming definitions from `infrastructure/lib/constructs/` with inline construct logic, so that initial migration does not require all reusable constructs to be extracted up front.
5. THE Infrastructure_Source SHALL contain none of the stale compiled artifacts `platform-stack.js`, `platform-stack.d.ts`, `backend-stack.js`, `backend-stack.d.ts`, `config.js`, or `config.d.ts` when they are not produced by the standard `npm run build`.
6. THE file `infrastructure/bin/infrastructure.ts` SHALL import and instantiate only the two new stack classes from criterion 1 and SHALL contain zero imports referencing the legacy stack files in criterion 2.
7. WHEN `npm run build` is executed in the `infrastructure/` working directory, THE Infrastructure_Source SHALL compile with exit code 0 and zero TypeScript errors.

### Requirement 9: Greenfield Deployment

**User Story:** As a developer, I want a clean greenfield deployment path, so that the codebase does not pay a complexity tax on backwards compatibility.

#### Acceptance Criteria

1. THE Infrastructure_App SHALL contain zero CDK constructs, conditional branches, or runtime checks gated on the presence of any legacy stack resource.
2. THE Infrastructure_Source SHALL contain zero code paths labeled or commented as "migration", "legacy", or "backwards compatibility" handling for the legacy stacks named in Requirement 8.
3. THE Deployment_Procedure SHALL document a single fresh-deployment sequence in `infrastructure/README.md` that includes prerequisites, ordered `npx cdk deploy` commands for the two stacks (PlatformStack, then BackendStack), a separate Frontend_Deploy_Workflow invocation that builds the Angular SPA and syncs it to the Platform-owned SPA S3 bucket, and post-deployment verification steps.
4. WHERE legacy CloudFormation stacks are present in the target AWS account, THE Deployment_Procedure SHALL instruct the operator to identify them by CloudFormation stack name and delete them via CloudFormation before deploying the new two-stack architecture.
5. WHEN the Deployment_Procedure is executed end-to-end against a clean AWS account, THE Infrastructure_App SHALL result in both stacks reaching `CREATE_COMPLETE` status and the Frontend_Deploy_Workflow completing successfully.
6. IF either of the two stacks fails to reach `CREATE_COMPLETE` during the Deployment_Procedure, THEN the procedure SHALL surface the failing stack's CloudFormation status and stack events to the operator.
7. IF the PlatformStack fails to reach `CREATE_COMPLETE`, OR the BackendStack fails to reach `CREATE_COMPLETE`, OR the Frontend_Deploy_Workflow fails to complete successfully during the Deployment_Procedure, THEN the Deployment_Procedure SHALL be considered an overall failure.

### Requirement 10: Configuration Surface

**User Story:** As an operator, I want one configuration source driving both stacks, so that environment management remains centralized.

#### Acceptance Criteria

1. THE Configuration_Loader SHALL resolve each configuration value using the precedence chain "environment variable > CDK CLI context flag > `infrastructure/cdk.context.json` > documented default", in that order, where a value is considered set if it is non-empty.
2. THE Configuration_Loader SHALL accept sensitive and per-environment values, including but not limited to AWS account id, AWS region, ACM certificate ARNs, project prefix, domain name, hosted zone domain, and CORS origins, through environment variables prefixed `CDK_` that are populated by the GitHub Actions workflow → `scripts/common/load-env.sh` → CDK `--context` flag pipeline documented in `.kiro/steering/devops.md`, AND SHALL NOT require those values to be committed to `infrastructure/cdk.context.json`.
3. THE Configuration_Loader SHALL accept image tag values for `app_api`, `inference_api`, the five MCP Lambda containers, and the RAG ingestion Lambda through the same precedence chain (environment variable > CDK CLI context flag > `cdk.context.json` > default), populated by the Build_System through CDK `--context` flags whose names match those defined in Requirement 6.
4. THE Configuration_Loader SHALL validate the resolved configuration schema, covering required keys, value types, and allowed value ranges, before stack synthesis begins.
5. IF a required configuration value cannot be resolved through the precedence chain, THEN THE Configuration_Loader SHALL halt synthesis with an error message that names the missing key and the stack that requires it.
6. IF a configuration value fails type or range validation, THEN THE Configuration_Loader SHALL halt synthesis with an error message that names the offending key, the observed value, and the expected type or range.
7. IF `infrastructure/cdk.context.json` is present but unparseable, THEN THE Configuration_Loader SHALL halt synthesis with an error message that names the file and the parse-failure reason.
8. THE Configuration_Loader SHALL expose a typed configuration object consumed by both stack constructors, and the two stacks SHALL not read configuration from any other source after the Configuration_Loader has produced the configuration object.
9. THE Configuration_Loader SHALL treat the domain name configuration value as optional.
10. WHEN the domain name is absent across all sources in the precedence chain, THE Configuration_Loader SHALL produce a valid configuration object in which the Route53 hosted zone, the ACM certificate, and the Route53 alias records are disabled across the PlatformStack and the BackendStack, AND CDK synthesis SHALL proceed to completion with those components disabled.
11. WHEN the domain name is resolved as a non-empty value through the precedence chain, THE Configuration_Loader SHALL produce a configuration object in which the Route53 hosted zone, the ACM certificate, and the Route53 alias records are enabled across the PlatformStack and the BackendStack.
12. THE Configuration_Loader SHALL NOT introduce, define, or require the existence of any AWS Secrets Manager secret intended to hold OIDC auth provider client secrets, AND SHALL NOT consume `AUTH_PROVIDER_SECRETS_ARN` as a configuration input.

### Requirement 11: Stack Naming

**User Story:** As an operator, I want consistent stack naming that includes the project prefix, so that multiple environments can coexist in a single AWS account.

#### Acceptance Criteria

1. THE Infrastructure_App SHALL set each stack's CloudFormation stack name to `{projectPrefix}-PlatformStack` and `{projectPrefix}-BackendStack` respectively, where `projectPrefix` is a non-empty string of 1 to 100 characters containing only alphanumeric characters and hyphens and beginning with an alphabetic character.
2. THE Infrastructure_App SHALL set the CDK construct id of each stack to `PlatformStack` and `BackendStack` respectively.
3. IF `projectPrefix` is missing, empty, or violates the format constraints in criterion 1, THEN THE Infrastructure_App SHALL terminate CDK synthesis with an error indicating an invalid project prefix and SHALL emit no CloudFormation templates for either of the two stacks.

### Requirement 12: Synthesis and Diff Verification

**User Story:** As a developer, I want a fast feedback loop on stack composition, so that I can verify the consolidation produces the expected resources before deploying.

#### Acceptance Criteria

1. WHEN `npx cdk synth` is executed in the `infrastructure/` working directory, THE Infrastructure_App SHALL exit with status code 0, emit no errors to stderr, and produce two CloudFormation templates under `infrastructure/cdk.out/` corresponding to the PlatformStack and the BackendStack.
2. WHEN `npx cdk diff {projectPrefix}-PlatformStack` is executed against an empty target environment, THE Infrastructure_App SHALL report all VPC subnets, NAT gateways, VPC endpoints, the Application Load Balancer with its HTTPS listener and ACM certificate, the Cognito User Pool, the Cognito Identity Pool, the User Pool Clients, every shared DynamoDB table, the file upload S3 bucket, the RAG ingestion S3 bucket, the SageMaker Fine-Tuning S3 bucket, the SPA S3 bucket, the CloudFront distribution with its default SPA S3 origin and its `/api/*` Platform-ALB origin, (when a domain name is configured) the Route53 hosted zone, and (when a domain name is configured) the Route53 alias record pointing the configured frontend domain at the CloudFront distribution as resources prefixed with `[+]`, with zero modifications and zero removals.
3. WHEN `npx cdk diff {projectPrefix}-BackendStack` is executed against an empty target environment with all required image tag context values supplied, THE Infrastructure_App SHALL report the Bedrock AgentCore Runtime, AgentCore Memory, AgentCore Gateway, the two Fargate services and task definitions, the five MCP Lambda functions, the RAG ingestion Lambda, the SageMaker Fine-Tuning IAM roles, the three ECR repositories, and the target group attachments on the Platform-owned ALB as resources prefixed with `[+]`, with zero `AWS::DynamoDB::Table` resources, zero `AWS::S3::Bucket` resources, zero modifications, and zero removals.
4. IF synthesis produces any error, THEN THE Infrastructure_App SHALL exit with a non-zero status code and SHALL emit an error message to stderr identifying the failing stack and the cause.
5. IF any required image tag context value is missing during a BackendStack diff, THEN THE Infrastructure_App SHALL exit with a non-zero status code and SHALL emit an error message naming the missing image tag parameter.

### Requirement 13: BFF and API Routing Topology

**User Story:** As a frontend developer, I want the SPA to reach the App API via a same-origin path, so that browser requests use the BFF cookie pattern with no CORS preflight.

#### Acceptance Criteria

1. THE PlatformStack CloudFront distribution SHALL define a `/api/*` cache behavior whose origin is the Platform-owned Application Load Balancer DNS name read from Systems Manager Parameter Store under the Platform path prefix `/{projectPrefix}/platform/`.
2. THE `/api/*` cache behavior defined in criterion 1 SHALL include a CloudFront Function or Lambda@Edge association that strips the `/api` prefix from the request path before the request reaches the Application Load Balancer.
3. THE Angular production environment file `frontend/ai.client/src/environments/environment.production.ts` SHALL ship with `appApiUrl` equal to the string `/api`, and the synthesized frontend bundle under `frontend/ai.client/dist/` SHALL contain no absolute URL pointing at the Application Load Balancer or at a separate API subdomain.
4. WHEN the BackendStack is synthesized, THE BackendStack SHALL register the `app_api` Fargate service as a target group attached to the Platform-owned Application Load Balancer, and the Platform Application Load Balancer listener SHALL route requests to that target group based on a path or host condition configured by the BackendStack.
5. WHEN the BackendStack registers a target group on the Platform-owned Application Load Balancer, THE BackendStack SHALL read the Application Load Balancer ARN and the listener ARN from Systems Manager Parameter Store under the Platform path prefix `/{projectPrefix}/platform/`.
6. THE synthesized BackendStack CloudFormation template SHALL contain zero `AWS::ElasticLoadBalancingV2::LoadBalancer` resources and zero `AWS::ElasticLoadBalancingV2::Listener` resources, and SHALL contain only target groups and listener rules attached to the Platform-owned Application Load Balancer.
