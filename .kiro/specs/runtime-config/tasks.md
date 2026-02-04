# Runtime Configuration Feature - Implementation Tasks

## Phase 1: Configuration Infrastructure (Foundation)

### 1.1 Add Production Configuration Property
- [ ] Add `production: boolean` to `AppConfig` interface in `infrastructure/lib/config.ts`
- [ ] Load `production` from `CDK_PRODUCTION` environment variable with default `true` in `loadConfig()`
- [ ] Add `CDK_PRODUCTION` export to `scripts/common/load-env.sh`
- [ ] Add `production` to context parameters in `load-env.sh`
- [ ] Add production flag display to config output in `load-env.sh`

**Acceptance Criteria**:
- Config loads `production` from environment variable
- Default value is `true` when not specified
- Value is displayed in deployment logs

### 1.2 Export ALB URL to SSM Parameter
- [ ] Add SSM parameter export in `infrastructure/lib/infrastructure-stack.ts`
- [ ] Use parameter name: `/${projectPrefix}/network/alb-url`
- [ ] Export HTTPS URL if certificate exists, otherwise HTTP
- [ ] Add CloudFormation output for verification

**Acceptance Criteria**:
- SSM parameter is created with correct URL
- Parameter is accessible by other stacks
- URL format is correct (http:// or https://)

### 1.3 Export Runtime Endpoint URL to SSM Parameter
- [ ] Construct full endpoint URL in `infrastructure/lib/inference-api-stack.ts`
- [ ] Use `cdk.Fn.sub()` to build URL with runtime ARN
- [ ] Add SSM parameter: `/${projectPrefix}/inference-api/runtime-endpoint-url`
- [ ] Add CloudFormation output for verification

**Acceptance Criteria**:
- SSM parameter contains full endpoint URL
- URL format: `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{arn}`
- ARN is not URL-encoded in SSM (encoding happens in app)

## Phase 2: Frontend Stack Changes (Config Generation)

### 2.1 Update Frontend Stack to Read SSM Parameters
- [ ] Import `appApiUrl` from SSM in `infrastructure/lib/frontend-stack.ts`
- [ ] Import `inferenceApiUrl` from SSM in `infrastructure/lib/frontend-stack.ts`
- [ ] Add error handling for missing SSM parameters
- [ ] Add comments explaining SSM parameter dependencies

**Acceptance Criteria**:
- Stack successfully reads both SSM parameters at synth time
- Clear error message if parameters don't exist
- Stack deployment depends on backend stacks

### 2.2 Generate config.json Content
- [ ] Create `runtimeConfig` object with all required fields
- [ ] Use `config.production` for environment determination
- [ ] Set `enableAuthentication` to `true`
- [ ] Validate all required fields are present

**Acceptance Criteria**:
- Config object has correct TypeScript structure
- Environment is "production" or "development" based on flag
- All required fields are populated

### 2.3 Deploy config.json to S3
- [ ] Add `BucketDeployment` construct for config.json
- [ ] Use `s3deploy.Source.jsonData()` to create config file
- [ ] Set cache control: 5 minute TTL with must-revalidate
- [ ] Set `prune: false` to preserve other files
- [ ] Deploy to root of website bucket

**Acceptance Criteria**:
- config.json is deployed to S3 bucket root
- File is accessible at `/config.json`
- Cache headers are set correctly
- Deployment doesn't delete other files

### 2.4 Update Frontend Stack Scripts
- [ ] Add `production` context parameter to `scripts/stack-frontend/synth.sh`
- [ ] Add `production` context parameter to `scripts/stack-frontend/deploy.sh`
- [ ] Ensure context parameters match exactly in both scripts
- [ ] Test scripts locally with environment variable

**Acceptance Criteria**:
- Both scripts accept `CDK_PRODUCTION` environment variable
- Context parameters are identical in synth and deploy
- Scripts work with and without the variable set

## Phase 3: Angular Application Changes (Config Service)

### 3.1 Create ConfigService
- [ ] Create `frontend/ai.client/src/app/services/config.service.ts`
- [ ] Define `RuntimeConfig` interface with all required fields
- [ ] Implement signal-based state management
- [ ] Add computed signals for easy access (appApiUrl, inferenceApiUrl, etc.)
- [ ] Implement `loadConfig()` method with HTTP fetch
- [ ] Add configuration validation logic
- [ ] Implement fallback to environment.ts on error
- [ ] Add loading state tracking

**Acceptance Criteria**:
- Service fetches config.json from `/config.json`
- Configuration is validated before storing
- Fallback to environment.ts works correctly
- All fields are accessible via computed signals
- Service is provided in root

### 3.2 Add APP_INITIALIZER
- [ ] Update `frontend/ai.client/src/app/app.config.ts`
- [ ] Create `initializeApp` factory function
- [ ] Add `APP_INITIALIZER` provider with ConfigService dependency
- [ ] Ensure config loads before app bootstrap
- [ ] Add error handling for initialization failures

**Acceptance Criteria**:
- APP_INITIALIZER runs before app starts
- App waits for config to load
- Initialization errors are handled gracefully
- App continues even if config fetch fails

### 3.3 Update ApiService to Use ConfigService
- [ ] Inject ConfigService in `frontend/ai.client/src/app/services/api.service.ts`
- [ ] Replace `environment.appApiUrl` with `config.appApiUrl()`
- [ ] Use computed signal for reactive base URL
- [ ] Update all HTTP request methods
- [ ] Test API calls work with new config

**Acceptance Criteria**:
- ApiService uses ConfigService for base URL
- HTTP requests go to correct backend URL
- URL updates reactively if config changes
- No references to environment.appApiUrl remain

### 3.4 Update AuthService to Use ConfigService
- [ ] Inject ConfigService in `frontend/ai.client/src/app/auth/auth.service.ts`
- [ ] Replace `environment.enableAuthentication` with `config.enableAuthentication()`
- [ ] Update authentication logic to use config
- [ ] Test authentication flow with config

**Acceptance Criteria**:
- AuthService uses ConfigService for auth flag
- Authentication behavior matches config
- No references to environment.enableAuthentication remain

### 3.5 Update Other Services Using Environment
- [ ] Search codebase for `environment.appApiUrl` references
- [ ] Search codebase for `environment.inferenceApiUrl` references
- [ ] Update all services to use ConfigService
- [ ] Remove unused environment imports

**Acceptance Criteria**:
- All services use ConfigService instead of environment
- No direct environment.ts imports for runtime config
- All HTTP requests use correct URLs

### 3.6 Update Environment Files
- [ ] Keep `environment.ts` with local development values
- [ ] Update `environment.production.ts` to have empty/placeholder values
- [ ] Add comments explaining runtime config takes precedence
- [ ] Document fallback behavior

**Acceptance Criteria**:
- environment.ts has valid local development values
- environment.production.ts indicates runtime config is used
- Comments explain the configuration strategy

## Phase 4: Local Development Support

### 4.1 Create Local Config Example
- [ ] Create `frontend/ai.client/public/config.json.example`
- [ ] Add example values for local development
- [ ] Document all configuration fields
- [ ] Add instructions in comments

**Acceptance Criteria**:
- Example file has valid JSON structure
- All required fields are documented
- Local URLs are provided as examples

### 4.2 Update .gitignore
- [ ] Add `/frontend/ai.client/public/config.json` to .gitignore
- [ ] Ensure example file is not ignored
- [ ] Test that local config is not committed

**Acceptance Criteria**:
- Local config.json is ignored by git
- Example file is tracked by git
- No accidental commits of local config

### 4.3 Update Development Documentation
- [ ] Add "Local Development" section to frontend README
- [ ] Document Option 1: Use local config.json
- [ ] Document Option 2: Use environment.ts fallback
- [ ] Add troubleshooting section
- [ ] Document how to verify config is loaded

**Acceptance Criteria**:
- Clear instructions for local setup
- Both configuration options are documented
- Troubleshooting covers common issues
- Examples are provided

## Phase 5: Testing

### 5.1 Unit Tests for ConfigService
- [ ] Create `config.service.spec.ts`
- [ ] Test successful config loading
- [ ] Test fallback to environment.ts on error
- [ ] Test validation of required fields
- [ ] Test validation of invalid JSON
- [ ] Test computed signals return correct values
- [ ] Test loading state tracking

**Acceptance Criteria**:
- All ConfigService methods are tested
- Edge cases are covered
- Tests pass in CI/CD
- Code coverage > 80%

### 5.2 Integration Tests
- [ ] Test APP_INITIALIZER runs before app starts
- [ ] Test app loads with valid config.json
- [ ] Test app loads with missing config.json (fallback)
- [ ] Test app loads with invalid config.json (fallback)
- [ ] Test API calls use correct URLs from config

**Acceptance Criteria**:
- Integration tests cover happy path
- Error scenarios are tested
- Tests run in CI/CD
- All tests pass

### 5.3 End-to-End Tests
- [ ] Add Cypress test for config loading
- [ ] Test app loads and makes API calls
- [ ] Test config fetch failure handling
- [ ] Test authentication flow with config
- [ ] Test navigation and routing work

**Acceptance Criteria**:
- E2E tests cover critical user flows
- Config loading is verified
- Tests pass in CI/CD

### 5.4 Manual Testing Checklist
- [ ] Deploy to dev environment
- [ ] Verify config.json is accessible at `/config.json`
- [ ] Verify app loads successfully
- [ ] Verify API calls go to correct backend
- [ ] Verify authentication works
- [ ] Test with browser cache cleared
- [ ] Test with network throttling
- [ ] Test config.json fetch failure (block request)

**Acceptance Criteria**:
- All manual tests pass
- No console errors
- App behavior is correct
- Performance is acceptable

## Phase 6: Deployment Pipeline Updates

### 6.1 Update Frontend Workflow
- [ ] Add `CDK_PRODUCTION` to `env:` section in `.github/workflows/frontend.yml`
- [ ] Source from GitHub Variables: `${{ vars.CDK_PRODUCTION }}`
- [ ] Remove any manual URL configuration steps (if present)
- [ ] Update workflow comments to explain config flow

**Acceptance Criteria**:
- Workflow uses CDK_PRODUCTION variable
- No manual configuration steps remain
- Workflow runs successfully in CI/CD

### 6.2 Set GitHub Variables
- [ ] Set `CDK_PRODUCTION=true` in production repository
- [ ] Set `CDK_PRODUCTION=false` in dev/staging repositories (if separate)
- [ ] Document variable settings in deployment guide
- [ ] Verify variables are accessible in workflows

**Acceptance Criteria**:
- GitHub Variables are set correctly
- Variables are accessible in workflows
- Documentation is updated

### 6.3 Test Full Deployment Pipeline
- [ ] Deploy infrastructure stack
- [ ] Verify ALB URL is in SSM
- [ ] Deploy inference API stack
- [ ] Verify runtime URL is in SSM
- [ ] Deploy frontend stack
- [ ] Verify config.json is generated correctly
- [ ] Verify config.json is deployed to S3
- [ ] Test app loads and works end-to-end

**Acceptance Criteria**:
- Full pipeline deploys successfully
- All SSM parameters are populated
- config.json has correct values
- App works in deployed environment

## Phase 7: Documentation & Cleanup

### 7.1 Update Architecture Documentation
- [ ] Document runtime configuration architecture
- [ ] Add sequence diagrams for config loading
- [ ] Document SSM parameter dependencies
- [ ] Update deployment order documentation

**Acceptance Criteria**:
- Architecture docs are complete
- Diagrams are clear and accurate
- Dependencies are documented

### 7.2 Update Deployment Guide
- [ ] Document new deployment process
- [ ] Remove manual configuration steps
- [ ] Add troubleshooting section
- [ ] Document rollback procedure

**Acceptance Criteria**:
- Deployment guide is accurate
- Manual steps are removed
- Troubleshooting covers common issues

### 7.3 Update Developer Guide
- [ ] Document ConfigService usage
- [ ] Add examples of accessing configuration
- [ ] Document local development setup
- [ ] Add FAQ section

**Acceptance Criteria**:
- Developer guide is complete
- Examples are clear
- FAQ covers common questions

### 7.4 Code Cleanup
- [ ] Remove unused environment.ts references
- [ ] Remove commented-out code
- [ ] Update code comments
- [ ] Run linter and fix issues
- [ ] Run formatter

**Acceptance Criteria**:
- No unused code remains
- Code is properly formatted
- Comments are accurate
- Linter passes

## Phase 8: Rollout & Monitoring

### 8.1 Deploy to Dev Environment
- [ ] Deploy all stacks to dev
- [ ] Verify config.json is correct
- [ ] Test app functionality
- [ ] Monitor for errors
- [ ] Collect feedback

**Acceptance Criteria**:
- Dev deployment successful
- No critical errors
- App works as expected

### 8.2 Deploy to Staging Environment
- [ ] Deploy all stacks to staging
- [ ] Verify config.json is correct
- [ ] Run full test suite
- [ ] Monitor for errors
- [ ] Collect feedback

**Acceptance Criteria**:
- Staging deployment successful
- All tests pass
- No critical errors

### 8.3 Deploy to Production Environment
- [ ] Create deployment plan
- [ ] Schedule deployment window
- [ ] Deploy all stacks to production
- [ ] Verify config.json is correct
- [ ] Monitor application metrics
- [ ] Monitor error rates
- [ ] Verify user flows work

**Acceptance Criteria**:
- Production deployment successful
- No increase in error rates
- User flows work correctly
- Metrics are normal

### 8.4 Post-Deployment Monitoring
- [ ] Monitor CloudWatch logs for errors
- [ ] Monitor application performance
- [ ] Monitor config.json fetch success rate
- [ ] Monitor API call success rates
- [ ] Collect user feedback

**Acceptance Criteria**:
- No critical errors in logs
- Performance is acceptable
- Config loading success rate > 99%
- API calls work correctly

## Success Criteria

- [ ] Zero manual steps in deployment pipeline
- [ ] Frontend builds are environment-agnostic
- [ ] Configuration updates don't require rebuilds
- [ ] Local development works without AWS infrastructure
- [ ] All tests pass (unit, integration, e2e)
- [ ] Documentation is complete and accurate
- [ ] Production deployment is successful
- [ ] No increase in error rates or performance degradation

## Rollback Plan

If critical issues occur:
1. Revert frontend stack deployment (CloudFormation rollback)
2. App falls back to environment.ts automatically
3. Investigate and fix issues
4. Redeploy when ready

## Notes

- Tasks can be worked on in parallel where dependencies allow
- Phase 1-2 (Infrastructure) must complete before Phase 3 (Angular)
- Phase 3 (Angular) must complete before Phase 5 (Testing)
- Phase 6 (Pipeline) can be done in parallel with Phase 5 (Testing)
- Phase 8 (Rollout) must be done sequentially (dev → staging → production)
