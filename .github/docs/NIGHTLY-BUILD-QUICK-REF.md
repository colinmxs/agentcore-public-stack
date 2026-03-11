# Nightly Build Quick Reference

## Automatic Execution
Runs every night at **2 AM Mountain Time (9 AM UTC)** on the `main` branch.

## Manual Execution
Go to: **Actions** → **Nightly Build & Test** → **Run workflow**

Options:
- **skip_deployment**: `true` = Run tests only, skip deployment/smoke tests
- **skip_teardown**: `true` = Leave resources deployed for debugging

## What It Does

1. ✅ **Tests**: Runs full test suite (backend + frontend) with coverage
2. 🚀 **Deploys**: Full stack to AWS with `nightly-agentcore` prefix
3. 🔍 **Validates**: Smoke tests health endpoints
4. 🧹 **Cleans Up**: Empties S3 buckets and destroys all stacks
5. 📊 **Analyzes**: Compares coverage against previous baseline
6. 🤖 **AI Review**: Creates GitHub issues for coverage gaps in critical paths

## Critical Paths Monitored
- `**/apis/**/*.py` - API routes and services
- `**/rbac/**/*.py` - Role-based access control
- `**/auth/**/*.py` - Authentication logic
- `**/agents/**/*.py` - Agent implementations

## Artifacts (30-day retention)
- Backend coverage: `backend/coverage.json` + HTML report
- Frontend coverage: `frontend/ai.client/coverage/` + JSON
- Coverage comparison: `coverage-comparison.json`

## GitHub Issues
Coverage gaps automatically create issues with:
- **Labels**: `test-coverage`, `nightly-build`
- **Title**: "Test Coverage Decreased: [filename]"
- **Body**: AI analysis with suggested test scenarios

## Debugging Failed Runs

### Tests Failed
Check test job logs for specific failures.

### Deployment Failed
1. Check AWS CloudFormation console for stack events
2. Verify development environment variables are set
3. Ensure AWS credentials are valid

### Teardown Failed
1. Manually empty S3 buckets: `aws s3 rm s3://nightly-agentcore-* --recursive`
2. Manually destroy stacks: `cd infrastructure && npx cdk destroy --all --force`

### Coverage Analysis Failed
1. Check if coverage artifacts were uploaded
2. Verify Python script has correct file paths
3. Review script logs for errors

### AI Analysis Failed
1. Check GitHub Models API rate limits
2. Verify `GITHUB_TOKEN` has `issues: write` permission
3. Review API error messages in logs

## Viewing Results

### Coverage Reports
Download artifacts from workflow run:
- Backend: `backend/htmlcov/index.html`
- Frontend: `frontend/ai.client/coverage/index.html`

### Coverage Trends
Compare `coverage-comparison.json` across multiple runs.

### Test Gaps
Filter issues by label: `is:issue is:open label:test-coverage label:nightly-build`

## Customization

### Change Schedule
Edit `.github/workflows/nightly.yml`:
```yaml
schedule:
  - cron: '0 9 * * *'  # 2 AM MT = 9 AM UTC
```

### Add Critical Paths
Edit `scripts/nightly/compare-coverage.py`:
```python
CRITICAL_PATTERNS = [
    r".*/your-path/.*\.py$",  # Add pattern
]
```

### Customize AI Prompts
Edit `scripts/nightly/ai-coverage-analysis.py` → `analyze_coverage_gap()` function.

## Cost Considerations

Nightly deployment costs (approximate):
- **ECS Fargate**: ~$0.10/hour × 2 hours = $0.20
- **ALB**: ~$0.025/hour × 2 hours = $0.05
- **Lambda**: Minimal (free tier)
- **S3**: Minimal (deleted after run)
- **Total per night**: ~$0.25

Monthly cost: ~$7.50 (30 nights)

## Disabling Nightly Builds

### Temporarily
Set workflow to manual-only:
```yaml
on:
  # schedule:  # Comment out
  #   - cron: '0 9 * * *'
  workflow_dispatch:
```

### Permanently
Delete `.github/workflows/nightly.yml`

## Support

For issues or questions:
1. Check [NIGHTLY-BUILD.md](./NIGHTLY-BUILD.md) for detailed documentation
2. Review workflow logs in GitHub Actions
3. Open an issue with `nightly-build` label
