# Implementation Plan: Stack Architecture Simplification

## Overview

Convert the design into incremental, code-only steps that produce two CDK stacks (PlatformStack, BackendStack) wired through SSM, a content-hash Docker build pipeline, three new CI workflows, and an Angular SPA configured for same-origin BFF routing under `/api`. Each step builds on the previous one and ends with the CDK app entry, build pipeline, and CI/CD wiring fully integrated. Languages: TypeScript (CDK + tests), bash (build scripts), JavaScript (CloudFront Function), YAML (workflows).

## Tasks

- [ ] 1. Reset CDK source layout
  - [ ] 1.1 Remove legacy stack files, compiled artifacts, and per-service workflow files
    - Delete `infrastructure/lib/{infrastructure-stack,app-api-stack,inference-api-stack,gateway-stack,rag-ingestion-stack,sagemaker-fine-tuning-stack,artifacts-stack,mcp-sandbox-stack,frontend-stack}.ts` and any `.js`/`.d.ts` peers
    - Delete stale compiled artifacts `platform-stack.js`, `platform-stack.d.ts`, `backend-stack.js`, `backend-stack.d.ts`, `config.js`, `config.d.ts` if present
    - Delete `.github/workflows/{app-api,inference-api,gateway,infrastructure,mcp-sandbox,sagemaker-fine-tuning,rag-ingestion,bootstrap-data-seeding,frontend}.yml`
    - Delete legacy per-service script directories that bind to deleted stacks (`scripts/stack-app-api/`, `scripts/stack-inference-api/`, `scripts/stack-frontend/`, `scripts/stack-gateway/`, `scripts/stack-infrastructure/` — keep `scripts/common/`)
    - Reset `infrastructure/bin/infrastructure.ts` to a minimal placeholder that still compiles (final wiring happens in 7.2)
    - _Requirements: 7.7, 7.8, 8.2, 8.5, 9.1, 9.2_

  - [ ] 1.2 Create stub `PlatformStack` and `BackendStack` class files
    - Create `infrastructure/lib/platform-stack.ts` exporting an empty `PlatformStack extends cdk.Stack` class accepting `PlatformStackProps { config: AppConfig }`
    - Create `infrastructure/lib/backend-stack.ts` exporting an empty `BackendStack extends cdk.Stack` class accepting `BackendStackProps { config: AppConfig; imageTags: ImageTagsConfig }`
    - Verify `npm run build` exits 0 with zero TypeScript errors after the stubs land
    - _Requirements: 8.1, 8.4, 8.7_

- [ ] 2. Implement Configuration_Loader (`infrastructure/lib/config.ts`)
  - [ ] 2.1 Implement `validateProjectPrefix` and `loadImageTags`
    - Add `PROJECT_PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9-]{0,99}$/` and `validateProjectPrefix` assertion that throws naming the invalid value
    - Add `IMAGE_TAG_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/`, `ImageTagsConfig` interface, and `loadImageTags(scope: cdk.App): ImageTagsConfig` reading the eight `*ImageTag` context keys, throwing on missing or malformed values with messages naming the offending key
    - _Requirements: 6.1, 6.5, 6.6, 10.3, 11.1, 11.3, 12.5_

  - [ ]* 2.2 Write property test for project prefix validation
    - **Property 5: Project prefix validation**
    - **Validates: Requirements 11.1, 11.3**
    - File `infrastructure/test/properties/project-prefix.property.test.ts`; use `fast-check` with both conforming and non-conforming string generators; minimum 100 iterations per direction; include `// Feature: stack-architecture-simplification, Property 5: Project prefix validation` header

  - [ ]* 2.3 Write property test for image tag format validation
    - **Property 4: Image tag format validation**
    - **Validates: Requirements 6.1, 6.6**
    - File `infrastructure/test/properties/image-tag.property.test.ts`; use `fast-check` with regex-conforming and non-conforming string generators; minimum 100 iterations; include `// Feature: stack-architecture-simplification, Property 4: Image tag format validation` header

  - [ ] 2.4 Refactor `loadConfig` for the two-stack model
    - Read all inputs via `scope.node.tryGetContext(...)`; remove legacy `process.env.CDK_*` fallbacks
    - Make `domainName` optional; derive a single `routing.domainEnabled: boolean` flag from its presence so PlatformStack can gate Route53/ACM/alias wiring uniformly
    - Remove legacy fields (`frontend.*`, `gateway.enabled`, `mcpSandbox.*`, `artifacts.*`, per-service `imageTag` fields, `AUTH_PROVIDER_SECRETS_ARN`)
    - Run schema validation before synthesis with errors that name the offending key, observed value, and expected type/range
    - Surface a typed `AppConfig` consumed by both stack constructors
    - _Requirements: 9.1, 9.2, 10.1, 10.2, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12_

  - [ ]* 2.5 Write unit tests for `loadConfig` validation errors
    - Cover missing required keys, type mismatches, range violations, malformed `cdk.context.json`, domain-absent path producing a valid disabled-routing config, and domain-present path producing an enabled-routing config
    - _Requirements: 10.4, 10.5, 10.6, 10.7, 10.10, 10.11_

- [ ] 3. Implement Platform reusable constructs (`infrastructure/lib/constructs/`)
  - [ ] 3.1 Implement `NetworkConstruct`
    - Provision VPC, public/private subnets, NAT gateways, route tables, VPC endpoints, ECS cluster
    - Publish SSM parameters under `/{projectPrefix}/platform/network/*` and `/{projectPrefix}/platform/ecs/*`
    - _Requirements: 2.1, 2.13_

  - [ ] 3.2 Implement `LoadBalancerConstruct`
    - Provision ALB, HTTPS listener bound to ACM certificate, default fixed-response 404 rule until target groups attach
    - Publish `/{projectPrefix}/platform/alb/{arn,dns-name,listener-arn,security-group-id}`
    - _Requirements: 2.2, 2.13_

  - [ ] 3.3 Implement `CognitoConstruct`
    - Provision User Pool, Identity Pool, app clients, federated IdP wiring; provision NO Secrets Manager secret named `{projectPrefix}-auth-provider-secrets` and publish NO `/{projectPrefix}/auth/auth-provider-secrets-arn` parameter
    - Publish `/{projectPrefix}/platform/cognito/{user-pool-id,user-pool-client-id,identity-pool-id}`
    - _Requirements: 2.3, 2.13, 2.16_

  - [ ] 3.4 Implement `DataTablesConstruct`
    - Provision every shared DynamoDB table including OAuth identity and OAuth provider tables with deletion protection
    - Publish `/{projectPrefix}/platform/dynamodb/{logicalName}-name` and `.../{logicalName}-arn` for each table
    - _Requirements: 2.4, 2.13_

  - [ ] 3.5 Implement `DataBucketsConstruct`
    - Provision file-upload, RAG documents, RAG vector, and SageMaker Fine-Tuning S3 buckets with CORS via `buildCorsOrigins`
    - Publish bucket-name and bucket-arn parameters under `/{projectPrefix}/platform/s3/*`
    - _Requirements: 2.5, 2.13_

  - [ ] 3.6 Implement `SpaDistributionConstruct` with `/api/*` URL-rewrite CloudFront Function
    - Provision SPA S3 bucket, Origin Access Control, CloudFront distribution with default SPA origin and `/api/*` cache behavior pointing at the Platform ALB
    - Embed inline CloudFront Function (`cloudfront-js-2.0`) `function handler(event)` that rewrites `/api` → `/` and `/api/<rest>` → `/<rest>`, leaving other URIs unchanged; associate at viewer-request stage of the `/api/*` behavior
    - Publish `/{projectPrefix}/platform/s3/spa-bucket-name`, `.../cloudfront/distribution-id`, `.../cloudfront/distribution-domain-name`
    - _Requirements: 2.8, 2.9, 2.10, 2.13, 2.14, 13.1, 13.2_

  - [ ]* 3.7 Write property test for CloudFront `/api/*` URL rewrite
    - **Property 6: CloudFront `/api/*` prefix stripping**
    - **Validates: Requirements 2.10, 13.2**
    - File `infrastructure/test/properties/api-rewrite.property.test.ts`; load the rewrite function as plain JS, generate arbitrary URI strings biased toward `/api`-prefixed inputs; assert path-stripping invariants; minimum 100 iterations; include `// Feature: stack-architecture-simplification, Property 6: CloudFront /api/* prefix stripping` header

  - [ ] 3.8 Implement `Route53Construct` (gated by `config.routing.domainEnabled`)
    - Provision Route53 hosted zone, ACM certificate (us-east-1 for CloudFront), and Route53 alias record pointing the configured frontend domain at the CloudFront distribution
    - Publish `/{projectPrefix}/platform/route53/hosted-zone-id`
    - When domain is absent, do NOT instantiate this construct so PlatformStack contains zero `AWS::Route53::*` resources and zero ACM cert references
    - _Requirements: 2.6, 2.7, 2.11, 2.12, 2.13, 10.10, 10.11_

- [ ] 4. Assemble PlatformStack
  - [ ] 4.1 Wire all Platform constructs into `infrastructure/lib/platform-stack.ts`
    - Instantiate `NetworkConstruct`, `LoadBalancerConstruct`, `CognitoConstruct`, `DataTablesConstruct`, `DataBucketsConstruct`, `SpaDistributionConstruct`; conditionally instantiate `Route53Construct` only when `config.routing.domainEnabled`
    - Apply standard tags via `applyStandardTags(this, props.config)`
    - Set CloudFormation stack name `{projectPrefix}-PlatformStack`
    - _Requirements: 1.1, 1.5, 2.15, 8.3, 8.4, 11.1, 11.2_

  - [ ]* 4.2 Write CDK assertion tests for PlatformStack contents
    - One assertion per resource type in Requirement 2: VPC, ALB + listener, Cognito user/identity pools, every shared DynamoDB table with deletion protection, every data S3 bucket, SPA bucket, CloudFront distribution with default SPA origin and `/api/*` ALB origin, CloudFront Function association on `/api/*`, hosted zone + alias record (with-domain config), zero `AWS::Route53::*` (without-domain config), zero `AWS::SecretsManager::Secret` whose `Name` begins with `{projectPrefix}-auth-provider-secrets`, SSM parameter publication under `/{projectPrefix}/platform/`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.16, 12.2_

  - [ ]* 4.3 Write CDK snapshot tests for PlatformStack
    - One snapshot per representative config (with-domain, without-domain) of `Template.fromStack(stack).toJSON()`

- [ ] 5. Checkpoint - PlatformStack synthesises cleanly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Backend reusable constructs (`infrastructure/lib/constructs/`)
  - [ ] 6.1 Implement `PlatformImports`
    - Eagerly resolve VPC, ECS cluster, Cognito, DynamoDB tables, and S3 buckets from SSM at construction
    - Defer ALB ARN, listener ARN, and ALB security group ID reads until `attachTargetGroup(...)` or `addListenerRule(...)` is called by a downstream construct, satisfying Requirement 13.5/13.6
    - Centralize the SSM parameter naming convention `/{projectPrefix}/platform/...` in this construct only
    - _Requirements: 3.9, 3.10, 4.3, 13.5, 13.6_

  - [ ] 6.2 Implement `EcrRepositoriesConstruct`
    - Provision exactly three ECR repositories: `app-api`, `inference-api`, `mcp-shared`
    - _Requirements: 3.7_

  - [ ] 6.3 Implement `McpLambdasConstruct`
    - Provision exactly five container-image MCP Lambda functions (Wikipedia, ArXiv, Google, Tavily, Finance) sharing the `mcp-shared` ECR repository
    - Each Lambda consumes its own per-function image tag context value (`mcpWikipediaImageTag`, `mcpArxivImageTag`, `mcpGoogleImageTag`, `mcpTavilyImageTag`, `mcpFinanceImageTag`) so a single-tag change isolates the diff to that Lambda's `Code.ImageUri`
    - _Requirements: 3.2, 6.2, 6.3, 6.4_

  - [ ] 6.4 Implement `AgentCoreConstruct`
    - Provision Bedrock AgentCore Runtime, Memory, Gateway with target configurations; do NOT inject `AUTH_PROVIDER_SECRETS_ARN`; do NOT grant `secretsmanager:*` against any `{projectPrefix}-auth-provider-secrets` ARN; do NOT read `/{projectPrefix}/auth/auth-provider-secrets-arn`
    - _Requirements: 3.1, 3.15_

  - [ ] 6.5 Implement `AppApiServiceConstruct`
    - Provision exactly one `app_api` Fargate task definition + service pinned to `props.imageTag` from the `app-api` ECR repo; do NOT inject `AUTH_PROVIDER_SECRETS_ARN` env var
    - Register the service's target group via `PlatformImports.attachTargetGroup(...)` so ALB ARN, listener ARN, and ALB SG are read lazily at registration time only
    - _Requirements: 3.3, 3.8, 3.15, 6.1, 6.2, 6.3, 13.4, 13.5, 13.6_

  - [ ] 6.6 Implement `InferenceApiServiceConstruct`
    - Provision exactly one `inference_api` Fargate task definition + service pinned to `props.imageTag` from the `inference-api` ECR repo; do NOT inject `AUTH_PROVIDER_SECRETS_ARN` env var
    - Register the service's target group via `PlatformImports.attachTargetGroup(...)` (same lazy SSM-read flow as 6.5)
    - _Requirements: 3.4, 3.8, 3.15, 6.1, 6.2, 6.3, 13.4, 13.5, 13.6_

  - [ ] 6.7 Implement `RagIngestionLambdaConstruct`
    - Provision the RAG ingestion container-image Lambda with IAM granting access to the Platform-owned RAG ingestion bucket and RAG DynamoDB table; declare those resource ARNs as construct dependencies of the Lambda construct; subscribe to the bucket's S3 notifications
    - _Requirements: 3.5, 6.1, 6.2_

  - [ ] 6.8 Implement `FineTuningRolesConstruct`
    - Provision the IAM role(s) required by SageMaker Fine-Tuning jobs with inline policy referencing the Platform-owned fine-tuning S3 bucket; provision NO DynamoDB tables, NO S3 buckets; do NOT grant `secretsmanager:*` against any `{projectPrefix}-auth-provider-secrets` ARN
    - _Requirements: 3.6, 3.12, 3.13, 3.15_

- [ ] 7. Assemble BackendStack and wire CDK app entry
  - [ ] 7.1 Wire all Backend constructs into `infrastructure/lib/backend-stack.ts`
    - Instantiate `PlatformImports`, `EcrRepositoriesConstruct`, `McpLambdasConstruct`, `AgentCoreConstruct`, `AppApiServiceConstruct`, `InferenceApiServiceConstruct`, `RagIngestionLambdaConstruct`, `FineTuningRolesConstruct`
    - Apply standard tags; set CloudFormation stack name `{projectPrefix}-BackendStack`
    - Ensure synthesised template contains zero `AWS::S3::Bucket`, zero `AWS::DynamoDB::Table`, zero `AWS::Route53::*`, zero `AWS::RDS::*`, zero `AWS::ElasticLoadBalancingV2::LoadBalancer`, zero `AWS::ElasticLoadBalancingV2::Listener`, zero `Fn::ImportValue` against PlatformStack
    - _Requirements: 1.1, 1.5, 3.7, 3.8, 3.9, 3.11, 3.12, 3.13, 3.14, 8.3, 8.4, 11.1, 11.2, 13.6_

  - [ ] 7.2 Wire `infrastructure/bin/infrastructure.ts` with both stacks
    - Import `PlatformStack`, `BackendStack`, `loadConfig`, `loadImageTags`, `getStackEnv`, `validateProjectPrefix`
    - Call `validateProjectPrefix` BEFORE instantiating any stack; instantiate `PlatformStack` then `BackendStack` with `backend.addDependency(platform)`
    - Set descriptions and stack names per Requirement 11.1; ensure no conditional `if (config.x.enabled)` blocks
    - Ensure `npx cdk list` returns exactly `PlatformStack` and `BackendStack`
    - _Requirements: 1.1, 1.2, 1.4, 4.1, 4.2, 4.3, 4.4, 8.6, 9.1, 11.1, 11.2, 11.3, 12.1, 12.4_

  - [ ]* 7.3 Write CDK assertion tests for BackendStack contents
    - Assert AgentCore Runtime + Memory + Gateway, exactly five MCP Lambdas, exactly one `app_api` Fargate service + task def, exactly one `inference_api` Fargate service + task def, RAG ingestion Lambda with proper IAM, SageMaker Fine-Tuning IAM roles, exactly three ECR repositories, target group attachments on the Platform ALB
    - Assert zero `AWS::S3::Bucket`, zero `AWS::DynamoDB::Table`, zero `AWS::Route53::*`, zero `AWS::RDS::*`, zero `AWS::ElasticLoadBalancingV2::LoadBalancer`, zero `AWS::ElasticLoadBalancingV2::Listener`
    - Assert no `AUTH_PROVIDER_SECRETS_ARN` env var on `app_api`/`inference_api`/AgentCore; no `secretsmanager:*` against `{projectPrefix}-auth-provider-secrets`; no read of `/{projectPrefix}/auth/auth-provider-secrets-arn`
    - Assert single-tag-change diff isolation: rendering with one MCP tag changed (others unchanged) produces a diff containing only that one Lambda's `ImageUri`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.11, 3.12, 3.13, 3.14, 3.15, 6.2, 6.3, 6.4, 12.3, 13.4, 13.6_

  - [ ]* 7.4 Write cross-stack reference tests
    - Serialise both templates to JSON and assert zero `Fn::ImportValue` references and zero `Outputs.*.Export` declarations between the two stacks
    - Assert PlatformStack references no BackendStack resources
    - _Requirements: 3.9, 4.2, 4.3_

  - [ ]* 7.5 Write CDK snapshot test for BackendStack
    - One snapshot of `Template.fromStack(backendStack).toJSON()` with the standard image-tag context fixture

- [ ] 8. Checkpoint - Both stacks synth and `npx cdk list` returns exactly two names
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement Build_System content-hash Docker pipeline (`scripts/build/`)
  - [ ] 9.1 Implement `compute-content-hash.sh`
    - Accept `--service`, `--dockerfile`, `--source-dir` (≥1), `--shared-dir` (≥0), `--manifest` (≥1)
    - Collect `--dockerfile`, `--manifest`s, and `git ls-files <source-dir> <shared-dir>`; sort lexicographically with `LC_ALL=C`
    - Hash each file's contents with `sha256sum`, build `path\0<sha256>\n` buffer, take final SHA-256, emit 64-char lowercase hex on stdout
    - Exit non-zero with a stderr message on any failure (caller falls back)
    - _Requirements: 5.1, 5.9_

  - [ ]* 9.2 Write property test for Content_Hash determinism and format
    - **Property 1: Content_Hash determinism and format**
    - **Validates: Requirements 5.1**
    - File `scripts/build/test/content-hash-determinism.property.test.ts`; use `fast-check` to generate temporary git-tracked source trees, invoke the script twice, assert byte-identical 64-char lowercase hex output matching `^[a-f0-9]{64}$`; minimum 100 iterations; include `// Feature: stack-architecture-simplification, Property 1: Content_Hash determinism and format` header

  - [ ]* 9.3 Write property test for Content_Hash sensitivity
    - **Property 2: Content_Hash sensitivity**
    - **Validates: Requirements 5.1**
    - File `scripts/build/test/content-hash-sensitivity.property.test.ts`; generate two trees that differ in at least one tracked file's content, Dockerfile, or manifest; assert resulting hashes differ; minimum 100 iterations; include `// Feature: stack-architecture-simplification, Property 2: Content_Hash sensitivity` header

  - [ ] 9.4 Implement `build-and-push-if-changed.sh`
    - Compute the Content_Hash via 9.1; on success, call `aws ecr describe-images --image-ids imageTag=$tag`
    - Image found → echo tag, skip build/push
    - `ImageNotFoundException` → `docker build -t $repo:$tag` then `docker push $repo:$tag`, echo tag
    - Other ECR error → log reason on stderr, fall back to unconditional build/push using the Content_Hash as tag
    - Hash computation failed → log reason, build/push using fallback tag `fallback-$(date +%s)-${GITHUB_SHA:-unknown}` matching `^[a-zA-Z0-9._-]{1,128}$`
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9, 5.10, 6.1_

  - [ ]* 9.5 Write property test for Content_Hash → image tag round-trip
    - **Property 3: Content_Hash is the image tag round-trip**
    - **Validates: Requirements 5.2, 5.5, 5.6, 5.7**
    - File `scripts/build/test/content-hash-roundtrip.property.test.ts`; mock `aws ecr describe-images`, `docker build`, `docker push` via shimmed `PATH`; for any successfully-computed Content_Hash where ECR has no matching tag, assert the tag emitted to `GITHUB_OUTPUT`, the `docker build -t` argument, and the `docker push` argument all equal the Content_Hash byte-for-byte; minimum 100 iterations; include `// Feature: stack-architecture-simplification, Property 3: Content_Hash is the image tag round-trip` header

  - [ ]* 9.6 Write unit tests for fallback paths
    - Cover hash computation failure → fallback tag build+push; ECR `describe-images` non-`ImageNotFoundException` error → fallback build+push using hash; ECR `ImageNotFoundException` → build+push using hash; ECR success → skip build+push
    - Assert stderr log lines for failure reasons
    - _Requirements: 5.8, 5.9, 5.10_

  - [ ] 9.7 Implement `build-all-images.sh`
    - Invoke `build-and-push-if-changed.sh` once per service for `app_api`, `inference_api`, `mcp_wikipedia`, `mcp_arxiv`, `mcp_google`, `mcp_tavily`, `mcp_finance`, `rag_ingestion`
    - Emit one `{service}_image_tag={tag}` line per service to `$GITHUB_OUTPUT`
    - Exit non-zero if any per-service build/push fails
    - _Requirements: 5.7_

- [ ] 10. Update frontend environment for same-origin BFF
  - [ ] 10.1 Set `appApiUrl='/api'` in `frontend/ai.client/src/environments/environment.production.ts`
    - Replace any absolute ALB or API-subdomain URL with the literal string `/api`
    - Verify a production `npm run build` produces a `frontend/ai.client/dist/` bundle containing zero absolute URLs pointing at the ALB or a separate API subdomain
    - _Requirements: 13.3_

- [ ] 11. Implement CI/CD workflows (`.github/workflows/`)
  - [ ] 11.1 Create `platform.yml`
    - Single workflow with `synth-cdk` then `deploy` jobs running `npx cdk synth PlatformStack` and `npx cdk deploy PlatformStack`
    - Do NOT include any `Validate CloudFormation Template` step or `test-cdk.sh` invocation
    - _Requirements: 7.1, 7.11_

  - [ ] 11.2 Create `backend.yml`
    - Three-job graph: `build-images` (invokes `scripts/build/build-all-images.sh` and exposes 8 image tags via `outputs:`), `synth-cdk` (`needs: build-images`, runs `cdk synth BackendStack` with `--context appApiImageTag=...` etc.), `deploy` (`needs: synth-cdk`, runs `cdk deploy BackendStack` reusing `cdk.out/`)
    - Halt the workflow if `build-images` fails so neither `synth-cdk` nor `deploy` runs
    - Do NOT include any `Validate CloudFormation Template` step or `test-cdk.sh` invocation
    - _Requirements: 7.1, 7.2, 7.3, 7.11_

  - [ ] 11.3 Create `frontend-deploy.yml`
    - Build job runs `npm ci` and `npm run build` for the Angular SPA
    - Resolve job calls `aws ssm get-parameter` for `/{projectPrefix}/platform/s3/spa-bucket-name` and `/{projectPrefix}/platform/cloudfront/distribution-id`
    - Sync job runs `aws s3 sync dist/ai.client/ s3://{bucket}/ --delete`; invalidate job runs `aws cloudfront create-invalidation --paths "/*"`
    - If build fails, halt before any `aws s3 sync` or `aws cloudfront create-invalidation` invocation; mark run failed
    - _Requirements: 7.1, 7.4, 7.5, 7.6, 7.11_

  - [ ] 11.4 Update retained cross-cutting workflows
    - Update `codeql.yml`, `version-check.yml`, `release.yml`, `nightly.yml`, `nightly-deploy-pipeline.yml`, `artifacts.yml` to replace every reference to legacy per-service stack names with `PlatformStack` or `BackendStack`
    - In `nightly-deploy-pipeline.yml`, chain Platform → Backend → Frontend deploys via `needs:` so a failure short-circuits the pipeline
    - _Requirements: 7.9, 7.10, 9.5, 9.7_

  - [ ]* 11.5 Write workflow YAML shape tests
    - Parse `.github/workflows/*.yml` with `js-yaml` and assert: exactly two stack-deploy workflows + one frontend-deploy workflow exist; legacy filenames absent (Requirement 7.7); `backend.yml` declares `synth-cdk needs: build-images` and `deploy needs: synth-cdk`; `frontend-deploy.yml` reads the two SSM parameter paths and runs `aws s3 sync` then `aws cloudfront create-invalidation`; no workflow contains a `Validate CloudFormation Template` step or `test-cdk.sh` invocation
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.7, 7.8, 7.9, 7.10, 7.11_

- [ ] 12. Update Deployment_Procedure documentation
  - [ ] 12.1 Rewrite `infrastructure/README.md`
    - Document a single fresh-deployment sequence: prerequisites, ordered `npx cdk deploy PlatformStack` then `npx cdk deploy BackendStack` commands, separate Frontend_Deploy_Workflow invocation building the Angular SPA and syncing to the Platform-owned SPA S3 bucket, post-deployment verification steps
    - Include explicit instructions to identify and CloudFormation-delete any legacy stacks present in the target AWS account before deploying the new architecture
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 12.2 Write repo-shape tests
    - Walk the file tree and assert: legacy stack files absent; legacy workflow files absent; `infrastructure/lib/platform-stack.ts` and `infrastructure/lib/backend-stack.ts` present; `infrastructure/bin/infrastructure.ts` imports only the two new stacks; no source file under `infrastructure/lib/` contains comments or identifiers labeled `migration`, `legacy`, or `backwards compatibility` for the legacy stacks; no `infrastructure/lib/` source mentions RDS, Aurora, or other relational DBs as a persistence option
    - _Requirements: 3.11, 8.1, 8.2, 8.5, 8.6, 9.1, 9.2_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references the specific requirements clauses it implements for traceability.
- Property tests (Properties 1–6 from the design) live close to the implementation they validate so failures surface immediately.
- The `PlatformImports` lazy-SSM-read pattern (Task 6.1) is the linchpin for satisfying Requirements 13.5 and 13.6 — every Backend construct that touches the ALB must go through `attachTargetGroup(...)` or `addListenerRule(...)` rather than reading SSM directly.
- The `bin/infrastructure.ts` wiring (Task 7.2) is the integration point where both stacks, image-tag context, and stack-dependency wiring come together; nothing earlier should be considered "shipped" until this step lands.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "9.1", "10.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "9.2", "9.3", "9.4", "11.1", "11.3", "11.4"] },
    { "id": 3, "tasks": ["2.5", "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.8", "6.1", "6.2", "6.3", "9.5", "9.6", "9.7"] },
    { "id": 4, "tasks": ["3.7", "4.1", "6.4", "6.5", "6.6", "6.7", "6.8", "11.2"] },
    { "id": 5, "tasks": ["4.2", "4.3", "7.1"] },
    { "id": 6, "tasks": ["7.2"] },
    { "id": 7, "tasks": ["7.3", "7.4", "7.5", "11.5", "12.1"] },
    { "id": 8, "tasks": ["12.2"] }
  ]
}
```
