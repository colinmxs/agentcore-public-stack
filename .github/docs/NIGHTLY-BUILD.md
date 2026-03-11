# Nightly Build & Test Workflow

## Overview

The nightly build workflow provides comprehensive validation of the AgentCore Public Stack through automated testing, deployment verification, and AI-powered coverage analysis. It runs every night at 2 AM Mountain Time (9 AM UTC) on the main branch.

## Workflow Jobs

### 1. Install Dependencies (3 jobs)
- **install-backend**: Installs Python dependencies and caches packages
- **install-frontend**: Installs npm dependencies for Angular frontend
- **install-infrastructure**: Installs npm dependencies for CDK infrastructure

### 2. Test with Coverage (2 jobs)
- **test-backend**: Runs pytest with coverage reporting (JSON + HTML)
- **test-frontend**: Runs vitest with coverage reporting (JSON + HTML)

Both jobs upload coverage artifacts for later analysis.

### 3. Deploy Full Stack (6 jobs)
Deploys all stacks to the development environment with `nightly-agentcore` prefix:
- **deploy-infrastructure**: VPC, ALB, ECS, DynamoDB tables
- **deploy-app-api**: FastAPI application on ECS Fargate
- **deploy-inference-api**: Strands Agent on AgentCore Runtime
- **deploy-rag-ingestion**: Document ingestion Lambda functions
- **deploy-frontend**: Angular SPA to S3 + CloudFront
- **deploy-gateway**: MCP tool Lambda functions

All deployments use `CDK_RETAIN_DATA_ON_DELETE=false` to ensure clean teardown.

### 4. Smoke Test Deployment
Validates the deployed infrastructure by testing health endpoints:
- App API: `http://<alb-url>:8000/health`
- Inference API: `http://<alb-url>:8001/health`

### 5. Teardown Stack
Runs **always** (even if tests fail) to clean up resources:
1. Lists all S3 buckets with `nightly-agentcore` prefix
2. Empties each bucket (deletes all objects and versions)
3. Runs `cdk destroy --all --force` to remove all stacks

### 6. Analyze Coverage
Compares current test coverage against previous baseline:
- Downloads previous night's coverage artifacts (if available)
- Identifies files in critical paths with decreased coverage
- Critical paths: `**/apis/**/*.py`, `**/rbac/**/*.py`, `**/auth/**/*.py`, `**/agents/**/*.py`
- Generates `coverage-comparison.json` report

### 7. AI Coverage Gap Analysis
Uses GitHub Models API (GPT-4o) to analyze coverage gaps:
- Reads coverage comparison report
- For each file with decreased coverage:
  - Calls GPT-4o to analyze the gap and suggest test scenarios
  - Searches for existing GitHub issues about this file
  - Creates new issue or updates existing with AI analysis
- Labels issues with `test-coverage` and `nightly-build`

## Manual Triggers

The workflow supports manual execution via `workflow_dispatch` with options:
- **skip_deployment**: Skip deployment and smoke tests (test coverage only)
- **skip_teardown**: Leave resources deployed for debugging

## Configuration

### Environment Variables
All deployment jobs use the `development` GitHub environment with these overrides:
- `CDK_PROJECT_PREFIX=nightly-agentcore` (isolates from dev deployment)
- `CDK_RETAIN_DATA_ON_DELETE=false` (enables clean teardown)
- Minimal resource sizing (CPU: 512-1024, Memory: 1024-2048, Desired: 1, Max: 2)

### Required Secrets
- `AWS_ROLE_ARN` or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
- `GITHUB_TOKEN` (automatically provided by GitHub Actions)

### Required Variables
- `AWS_REGION`
- `CDK_AWS_ACCOUNT`
- All other CDK configuration variables from development environment

## Scripts

### Backend Test Script
**Location**: `scripts/stack-app-api/test.sh`

Runs pytest with coverage flags:
```bash
python3 -m pytest tests/ \
    --cov=src \
    --cov-report=html \
    --cov-report=json \
    --cov-report=term
```

### Frontend Test Script
**Location**: `scripts/stack-frontend/test.sh`

Runs Angular tests with coverage:
```bash
ng test --no-watch --coverage \
    --coverage.reporter=html \
    --coverage.reporter=json \
    --coverage.reporter=text
```

### Smoke Test Script
**Location**: `scripts/nightly/smoke-test.sh`

Validates deployed infrastructure:
1. Retrieves ALB DNS from CloudFormation outputs
2. Curls health endpoints with 30-second timeout
3. Validates HTTP 200 responses

### Teardown Script
**Location**: `scripts/nightly/teardown.sh`

Cleans up nightly deployment:
1. Lists S3 buckets with `nightly-agentcore` prefix
2. Empties each bucket (handles versioned objects)
3. Runs `cdk destroy --all --force`

### Coverage Comparison Script
**Location**: `scripts/nightly/compare-coverage.py`

Analyzes coverage changes:
1. Loads current backend and frontend coverage JSON
2. Downloads previous baseline from GitHub Actions artifacts (simplified)
3. Compares coverage for files matching critical path patterns
4. Generates `coverage-comparison.json` with decreases

### AI Coverage Analysis Script
**Location**: `scripts/nightly/ai-coverage-analysis.py`

Creates/updates GitHub issues:
1. Reads `coverage-comparison.json`
2. For each file with decreased coverage:
   - Calls GitHub Models API (GPT-4o) to analyze gap
   - Searches for existing issues using GitHub API
   - Creates new issue or adds comment to existing
3. Labels issues with `test-coverage` and `nightly-build`

## Coverage Configuration

### Backend (pytest)
**Location**: `backend/pytest.ini`

```ini
[coverage:run]
source = src
omit = */tests/*, */test_*.py

[coverage:json]
output = coverage.json
pretty_print = True
```

### Frontend (vitest)
Coverage reporters configured via CLI flags in test script.

## Artifacts

All artifacts are retained for 30 days:
- **backend-coverage**: `backend/coverage.json` + `backend/htmlcov/`
- **frontend-coverage**: `frontend/ai.client/coverage/`
- **coverage-comparison**: `coverage-comparison.json`

## Monitoring

Check workflow status:
- GitHub Actions UI: `.github/workflows/nightly.yml`
- Coverage trends: Download artifacts from previous runs
- Test gaps: GitHub Issues with `test-coverage` label

## Extending the Workflow

### Adding New Test Types
Add a new job after `test-frontend`:
```yaml
test-integration:
  name: Integration Tests
  runs-on: ubuntu-latest
  needs: install-backend
  steps:
    - name: Run integration tests
      run: bash scripts/test-integration.sh
```

### Adding New Smoke Tests
Edit `scripts/nightly/smoke-test.sh` to add more endpoint checks.

### Changing Critical Paths
Edit `scripts/nightly/compare-coverage.py` and update `CRITICAL_PATTERNS`:
```python
CRITICAL_PATTERNS = [
    r".*/apis/.*\.py$",
    r".*/rbac/.*\.py$",
    r".*/auth/.*\.py$",
    r".*/agents/.*\.py$",
    r".*/your-new-path/.*\.py$",  # Add new pattern
]
```

### Customizing AI Analysis
Edit `scripts/nightly/ai-coverage-analysis.py` to:
- Change the AI prompt
- Adjust issue title/body format
- Add custom labels
- Change priority thresholds

## Troubleshooting

### Deployment Fails
- Check AWS credentials in development environment
- Verify `nightly-agentcore` prefix doesn't conflict with existing resources
- Review CloudFormation stack events in AWS Console

### Teardown Fails
- S3 buckets may have objects that can't be deleted (check bucket policies)
- CDK destroy may fail if resources are in use (check ECS tasks, Lambda functions)
- Manually empty buckets and destroy stacks if needed

### Coverage Comparison Fails
- Ensure coverage JSON files are uploaded as artifacts
- Check artifact download step logs
- Verify file paths match expected locations

### AI Analysis Fails
- Check GitHub Models API token (uses `GITHUB_TOKEN`)
- Verify API rate limits haven't been exceeded
- Review script logs for API error messages

## Future Enhancements

Potential improvements:
- Download and extract previous coverage artifacts (currently simplified)
- Add integration tests against deployed endpoints
- Generate coverage trend charts
- Send Slack/email notifications on failures
- Add performance benchmarking
- Test database migrations
- Validate CDK drift detection
