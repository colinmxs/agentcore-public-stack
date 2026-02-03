# Migration Guide: Environment-Agnostic Refactoring

## Table of Contents

1. [Overview](#overview)
2. [What Changed](#what-changed)
3. [Configuration Variables Reference](#configuration-variables-reference)
4. [Migration Steps](#migration-steps)
5. [Testing Your Migration](#testing-your-migration)
6. [Rollback Procedures](#rollback-procedures)
7. [Troubleshooting](#troubleshooting)
8. [FAQ](#faq)

---

## Overview

This guide helps you migrate from the old environment-aware architecture (using `DEPLOY_ENVIRONMENT=prod/dev/test`) to the new configuration-driven approach where all behavior is controlled by explicit configuration variables.

### Why This Change?

**Before:** The codebase made decisions based on environment names (dev/test/prod), requiring code changes to adjust behavior.

**After:** All behavior is controlled by external configuration variables, making the code simpler and more flexible.

### Who Needs to Migrate?

- **Existing deployments** using `DEPLOY_ENVIRONMENT` variable
- **CI/CD pipelines** that pass `--context environment=` to CDK commands
- **Teams** managing multiple environments (dev/staging/prod)

### Migration Timeline

- **Estimated time:** 30-60 minutes per environment
- **Downtime required:** No (configuration changes only)
- **Risk level:** Low (backward compatible during transition)

---

## What Changed

### 1. CDK Configuration

#### Removed

- ❌ `environment` field from `AppConfig` interface
- ❌ `DEPLOY_ENVIRONMENT` environment variable
- ❌ `--context environment="${DEPLOY_ENVIRONMENT}"` from CDK commands
- ❌ Environment conditionals: `config.environment === 'prod'`
- ❌ Automatic environment suffixes in resource names (`-dev`, `-test`, `-prod`)

#### Added

- ✅ `retainDataOnDelete: boolean` - Controls removal policies
- ✅ `CDK_PROJECT_PREFIX` - Resource name prefix (replaces environment-based naming)
- ✅ `CDK_RETAIN_DATA_ON_DELETE` - Explicit retention control
- ✅ `CDK_FILE_UPLOAD_CORS_ORIGINS` - Explicit CORS configuration
- ✅ Helper functions: `getRemovalPolicy()`, `getAutoDeleteObjects()`, `parseBooleanEnv()`
- ✅ Configuration validation with clear error messages

### 2. Resource Naming

**Before:**
```typescript
// Production: "myproject-vpc"
// Development: "myproject-dev-vpc"
getResourceName(config, 'vpc')
```

**After:**
```typescript
// Always: "{projectPrefix}-vpc"
// User controls prefix: "myproject-prod-vpc" or "myproject-vpc"
getResourceName(config, 'vpc')
```

### 3. Removal Policies

**Before:**
```typescript
removalPolicy: config.environment === 'prod' 
  ? cdk.RemovalPolicy.RETAIN 
  : cdk.RemovalPolicy.DESTROY
```

**After:**
```typescript
removalPolicy: getRemovalPolicy(config)
// Controlled by CDK_RETAIN_DATA_ON_DELETE flag
```

### 4. CORS Configuration

**Before:**
```typescript
const corsOrigins = config.environment === 'prod'
  ? ['https://prod.example.com']
  : ['http://localhost:4200'];
```

**After:**
```typescript
const corsOrigins = config.fileUpload.corsOrigins
  .split(',')
  .map(o => o.trim());
// Controlled by CDK_FILE_UPLOAD_CORS_ORIGINS variable
```

---

## Configuration Variables Reference

### Required Variables

| Variable | Description | Example | Notes |
|----------|-------------|---------|-------|
| `CDK_PROJECT_PREFIX` | Resource name prefix | `agentcore-prod` | Include environment in prefix if desired |
| `CDK_AWS_ACCOUNT` | AWS account ID | `123456789012` | Must be 12 digits |
| `CDK_AWS_REGION` | AWS region | `us-west-2` | Must be valid AWS region |

### Optional Variables (with defaults)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CDK_RETAIN_DATA_ON_DELETE` | boolean | `true` | Retain data resources on stack deletion |
| `CDK_FILE_UPLOAD_CORS_ORIGINS` | string | `http://localhost:4200` | Comma-separated CORS origins |
| `CDK_FILE_UPLOAD_MAX_SIZE_MB` | number | `10` | Maximum file upload size in MB |
| `CDK_APP_API_DESIRED_COUNT` | number | `2` | App API ECS task count |
| `CDK_APP_API_MAX_CAPACITY` | number | `10` | App API auto-scaling max |
| `CDK_APP_API_CPU` | number | `1024` | App API CPU units (1024 = 1 vCPU) |
| `CDK_APP_API_MEMORY` | number | `2048` | App API memory in MB |
| `CDK_INFERENCE_API_DESIRED_COUNT` | number | `2` | Inference API task count |
| `CDK_INFERENCE_API_MAX_CAPACITY` | number | `10` | Inference API auto-scaling max |
| `CDK_INFERENCE_API_CPU` | number | `1024` | Inference API CPU units |
| `CDK_INFERENCE_API_MEMORY` | number | `2048` | Inference API memory in MB |
| `CDK_ENABLE_AUTHENTICATION` | boolean | `true` | Enable authentication |

### Frontend Variables (for production builds)

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_API_URL` | `http://localhost:8000` | App API endpoint URL |
| `INFERENCE_API_URL` | `http://localhost:8001` | Inference API endpoint URL |
| `PRODUCTION` | `false` | Production mode flag |
| `ENABLE_AUTHENTICATION` | `true` | Enable authentication in frontend |

---

## Migration Steps

### Step 1: Identify Current Configuration

First, determine your current environment configuration:

```bash
# Check your current DEPLOY_ENVIRONMENT value
echo $DEPLOY_ENVIRONMENT

# Check your current CDK_PROJECT_PREFIX
echo $CDK_PROJECT_PREFIX
```

### Step 2: Map Old Configuration to New

Use this mapping table to convert your old configuration:

| Old Configuration | New Configuration |
|-------------------|-------------------|
| `DEPLOY_ENVIRONMENT=prod` | `CDK_PROJECT_PREFIX=myproject-prod`<br>`CDK_RETAIN_DATA_ON_DELETE=true` |
| `DEPLOY_ENVIRONMENT=dev` | `CDK_PROJECT_PREFIX=myproject-dev`<br>`CDK_RETAIN_DATA_ON_DELETE=false` |
| `DEPLOY_ENVIRONMENT=test` | `CDK_PROJECT_PREFIX=myproject-test`<br>`CDK_RETAIN_DATA_ON_DELETE=false` |

**Important:** If you want to keep the same resource names as before:
- Production (no suffix): Use `CDK_PROJECT_PREFIX=myproject`
- Development (with suffix): Use `CDK_PROJECT_PREFIX=myproject-dev`

### Step 3: Update Environment Variables

#### Option A: Local Development (.env file)

Create or update `infrastructure/.env`:

```bash
# Required
CDK_PROJECT_PREFIX=agentcore-prod
CDK_AWS_ACCOUNT=123456789012
CDK_AWS_REGION=us-west-2

# Optional (with recommended production values)
CDK_RETAIN_DATA_ON_DELETE=true
CDK_FILE_UPLOAD_CORS_ORIGINS=https://app.example.com,https://admin.example.com
CDK_APP_API_DESIRED_COUNT=3
CDK_APP_API_MAX_CAPACITY=20
CDK_INFERENCE_API_DESIRED_COUNT=3
CDK_INFERENCE_API_MAX_CAPACITY=20
```

#### Option B: GitHub Environments

1. Go to **Repository Settings** → **Environments**
2. Create or select an environment (e.g., "production")
3. Add **Variables**:
   - `CDK_PROJECT_PREFIX`: `agentcore-prod`
   - `CDK_AWS_REGION`: `us-west-2`
   - `CDK_RETAIN_DATA_ON_DELETE`: `true`
   - `CDK_FILE_UPLOAD_CORS_ORIGINS`: `https://app.example.com`
   - (Add other optional variables as needed)
4. Add **Secrets**:
   - `CDK_AWS_ACCOUNT`: `123456789012`
   - `AWS_ROLE_ARN`: `arn:aws:iam::123456789012:role/deploy-role`

#### Option C: CI/CD Pipeline

Update your CI/CD configuration to export the new variables:

```yaml
# GitHub Actions example
env:
  CDK_PROJECT_PREFIX: ${{ vars.CDK_PROJECT_PREFIX }}
  CDK_AWS_ACCOUNT: ${{ secrets.CDK_AWS_ACCOUNT }}
  CDK_AWS_REGION: ${{ vars.CDK_AWS_REGION }}
  CDK_RETAIN_DATA_ON_DELETE: ${{ vars.CDK_RETAIN_DATA_ON_DELETE }}
  CDK_FILE_UPLOAD_CORS_ORIGINS: ${{ vars.CDK_FILE_UPLOAD_CORS_ORIGINS }}
```

### Step 4: Remove Old Configuration

Remove the old environment variable:

```bash
# Remove from .env files
sed -i '/DEPLOY_ENVIRONMENT/d' infrastructure/.env

# Remove from shell scripts
unset DEPLOY_ENVIRONMENT
```

### Step 5: Update Deployment Scripts (if customized)

If you have custom deployment scripts, update them:

**Before:**
```bash
export DEPLOY_ENVIRONMENT="prod"
cdk deploy --context environment="${DEPLOY_ENVIRONMENT}"
```

**After:**
```bash
export CDK_PROJECT_PREFIX="myproject-prod"
export CDK_RETAIN_DATA_ON_DELETE="true"
cdk deploy
# No --context parameter needed
```

### Step 6: Validate Configuration

Run the configuration validation:

```bash
cd infrastructure
source ../scripts/common/load-env.sh

# You should see output like:
# 📋 Configuration loaded:
#    Project Prefix: agentcore-prod
#    AWS Region: us-west-2
#    Retain Data: true
```

---

## Testing Your Migration

### Test 1: CDK Synthesis

Verify that all stacks synthesize correctly:

```bash
cd infrastructure
npm run build
npx cdk synth --all
```

**Expected:** All stacks synthesize without errors.

**Check for:**
- ✅ No errors about missing `environment` field
- ✅ Resource names match your `CDK_PROJECT_PREFIX`
- ✅ No automatic `-dev`, `-test`, or `-prod` suffixes (unless in your prefix)

### Test 2: Resource Naming

Check that resource names are correct:

```bash
npx cdk synth InfrastructureStack | grep -A 5 "AWS::EC2::VPC"
```

**Expected:** VPC name should be `{CDK_PROJECT_PREFIX}-vpc`

### Test 3: Removal Policies

Check that removal policies match your retention setting:

```bash
npx cdk synth InfrastructureStack | grep -A 10 "AWS::DynamoDB::Table"
```

**Expected:**
- If `CDK_RETAIN_DATA_ON_DELETE=true`: `"DeletionPolicy": "Retain"`
- If `CDK_RETAIN_DATA_ON_DELETE=false`: `"DeletionPolicy": "Delete"`

### Test 4: Diff Against Existing Stack

Compare with your existing deployment:

```bash
npx cdk diff InfrastructureStack
```

**Expected:**
- If using same prefix: Minimal or no changes
- If using different prefix: New resources will be created

**⚠️ Warning:** If you see resources being replaced, review carefully before deploying!

### Test 5: Deploy to Test Environment

If you have a test/dev environment, deploy there first:

```bash
# Set test environment configuration
export CDK_PROJECT_PREFIX="agentcore-test"
export CDK_RETAIN_DATA_ON_DELETE="false"

# Deploy
npx cdk deploy --all
```

### Test 6: Verify Application Functionality

After deployment:

1. ✅ Check that APIs are accessible
2. ✅ Verify authentication works
3. ✅ Test file uploads (CORS configuration)
4. ✅ Verify data persistence
5. ✅ Check CloudWatch logs for errors

---

## Rollback Procedures

### If Issues Occur During Migration

#### Scenario 1: Configuration Errors

**Problem:** Missing or invalid configuration variables

**Solution:**
```bash
# Check what's missing
cd infrastructure
source ../scripts/common/load-env.sh

# Fix the missing variables
export CDK_PROJECT_PREFIX="myproject-prod"
export CDK_AWS_ACCOUNT="123456789012"
export CDK_AWS_REGION="us-west-2"
```

#### Scenario 2: Resource Name Conflicts

**Problem:** New resource names conflict with existing resources

**Solution:**
```bash
# Option 1: Use a different prefix
export CDK_PROJECT_PREFIX="myproject-v2-prod"

# Option 2: Match your old naming pattern
# If old prod resources had no suffix:
export CDK_PROJECT_PREFIX="myproject"

# If old dev resources had -dev suffix:
export CDK_PROJECT_PREFIX="myproject-dev"
```

#### Scenario 3: Deployment Fails

**Problem:** CDK deployment fails mid-way

**Solution:**
```bash
# 1. Check the error message
npx cdk deploy InfrastructureStack 2>&1 | tee deploy-error.log

# 2. Review CloudFormation events in AWS Console
# Go to CloudFormation → Stacks → Your Stack → Events

# 3. If needed, rollback the stack
aws cloudformation rollback-stack --stack-name InfrastructureStack

# 4. Fix the configuration issue and retry
```

#### Scenario 4: Application Not Working After Deployment

**Problem:** Application deployed but not functioning correctly

**Solution:**
```bash
# 1. Check CORS configuration
echo $CDK_FILE_UPLOAD_CORS_ORIGINS
# Should include your frontend URL

# 2. Verify API endpoints are correct
# Check ALB DNS name matches frontend configuration

# 3. Check CloudWatch logs
aws logs tail /aws/ecs/app-api --follow

# 4. If needed, redeploy with corrected configuration
export CDK_FILE_UPLOAD_CORS_ORIGINS="https://correct-url.example.com"
npx cdk deploy AppApiStack
```

### Complete Rollback (Emergency)

If you need to completely rollback to the old version:

```bash
# 1. Checkout the previous version
git checkout <previous-commit-hash>

# 2. Restore old environment variable
export DEPLOY_ENVIRONMENT="prod"

# 3. Redeploy
cd infrastructure
npx cdk deploy --all --context environment="${DEPLOY_ENVIRONMENT}"
```

**Note:** This should only be used in emergencies. The new configuration approach is more robust.

---

## Troubleshooting

### Common Issues

#### Issue 1: "CDK_PROJECT_PREFIX is required"

**Error:**
```
Error: CDK_PROJECT_PREFIX is required. Set this environment variable to your desired resource name prefix
```

**Solution:**
```bash
export CDK_PROJECT_PREFIX="myproject-prod"
```

#### Issue 2: "Invalid AWS account ID"

**Error:**
```
Error: Invalid AWS account ID: "12345". Expected a 12-digit number.
```

**Solution:**
```bash
# AWS account IDs must be exactly 12 digits
export CDK_AWS_ACCOUNT="123456789012"
```

#### Issue 3: "Invalid boolean value"

**Error:**
```
Error: Invalid boolean value: "yes". Expected "true", "false", "1", or "0".
```

**Solution:**
```bash
# Use proper boolean values
export CDK_RETAIN_DATA_ON_DELETE="true"  # Not "yes"
```

#### Issue 4: Resource Already Exists

**Error:**
```
Error: Resource with name "agentcore-vpc" already exists
```

**Solution:**
```bash
# Use a different project prefix
export CDK_PROJECT_PREFIX="agentcore-v2"

# Or include environment in prefix
export CDK_PROJECT_PREFIX="agentcore-prod"
```

#### Issue 5: CORS Errors in Frontend

**Error:** Browser console shows CORS errors when accessing API

**Solution:**
```bash
# Ensure CORS origins include your frontend URL
export CDK_FILE_UPLOAD_CORS_ORIGINS="https://app.example.com,https://admin.example.com"

# Redeploy the API stack
cd infrastructure
npx cdk deploy AppApiStack
```

#### Issue 6: DEPLOY_ENVIRONMENT Still Set

**Error:**
```
❌ DEPLOY_ENVIRONMENT is no longer supported
Please migrate to explicit configuration:
  Remove: DEPLOY_ENVIRONMENT=prod
  Add:    CDK_PROJECT_PREFIX=myproject-prod
          CDK_RETAIN_DATA_ON_DELETE=true
```

**Solution:**
```bash
# Remove the old variable
unset DEPLOY_ENVIRONMENT

# Set the new variables
export CDK_PROJECT_PREFIX="myproject-prod"
export CDK_RETAIN_DATA_ON_DELETE="true"
```

### Debugging Tips

#### Check Current Configuration

```bash
cd infrastructure
source ../scripts/common/load-env.sh
# This will print all loaded configuration
```

#### Verify Environment Variables

```bash
# List all CDK_* variables
env | grep CDK_
```

#### Check CDK Context

```bash
# View CDK context values
cat cdk.context.json

# Clear CDK context cache if needed
rm cdk.context.json
```

#### Validate CloudFormation Template

```bash
# Generate template and check for issues
npx cdk synth InfrastructureStack > template.yaml
cat template.yaml | grep -i "error\|invalid"
```

#### Check Resource Names in AWS

```bash
# List VPCs with your prefix
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=${CDK_PROJECT_PREFIX}-*"

# List DynamoDB tables with your prefix
aws dynamodb list-tables | grep ${CDK_PROJECT_PREFIX}

# List S3 buckets with your prefix
aws s3 ls | grep ${CDK_PROJECT_PREFIX}
```

---

## FAQ

### Q1: Do I need to destroy and recreate my stacks?

**A:** No! If you use the same resource names (by setting `CDK_PROJECT_PREFIX` to match your old naming pattern), CDK will update existing resources in place.

**Example:**
- Old: `DEPLOY_ENVIRONMENT=prod` created resources like `myproject-vpc`
- New: `CDK_PROJECT_PREFIX=myproject` creates the same `myproject-vpc`
- Result: No resource replacement needed

### Q2: What happens to my existing data?

**A:** Your data is safe. The migration only changes how configuration is loaded, not how resources are managed. If you set `CDK_RETAIN_DATA_ON_DELETE=true`, your data will be retained even if you delete the stack.

### Q3: Can I deploy multiple environments to the same AWS account?

**A:** Yes! Use different project prefixes for each environment:
- Development: `CDK_PROJECT_PREFIX=myproject-dev`
- Staging: `CDK_PROJECT_PREFIX=myproject-staging`
- Production: `CDK_PROJECT_PREFIX=myproject-prod`

### Q4: How do I handle secrets and sensitive configuration?

**A:** Use GitHub Environments for sensitive values:
1. Store sensitive values as **Secrets** (encrypted)
2. Store non-sensitive values as **Variables** (visible)
3. Reference them in workflows: `${{ secrets.CDK_AWS_ACCOUNT }}`

### Q5: What if I want to keep using environment names?

**A:** You can include environment names in your project prefix:
```bash
export CDK_PROJECT_PREFIX="agentcore-prod"
export CDK_PROJECT_PREFIX="agentcore-dev"
export CDK_PROJECT_PREFIX="agentcore-test"
```

The code no longer makes decisions based on environment names, but you can still use them for organization.

### Q6: Do I need to update my frontend configuration?

**A:** For local development, no changes needed. For production deployments, set these variables before building:
```bash
export APP_API_URL="https://api.example.com"
export INFERENCE_API_URL="https://inference.example.com"
export PRODUCTION="true"
```

### Q7: How do I test the migration without affecting production?

**A:** Use a different project prefix for testing:
```bash
# Test deployment
export CDK_PROJECT_PREFIX="myproject-migration-test"
export CDK_RETAIN_DATA_ON_DELETE="false"
npx cdk deploy --all

# If successful, use production prefix
export CDK_PROJECT_PREFIX="myproject-prod"
export CDK_RETAIN_DATA_ON_DELETE="true"
npx cdk deploy --all
```

### Q8: What if I encounter an error not listed here?

**A:** 
1. Check the error message carefully - it should indicate what's wrong
2. Verify all required variables are set: `env | grep CDK_`
3. Check CDK synthesis: `npx cdk synth --all`
4. Review CloudFormation events in AWS Console
5. Check the troubleshooting section above
6. If still stuck, create an issue with the error message and your configuration (redact sensitive values)

### Q9: Can I automate this migration?

**A:** Yes! Here's a script to help:

```bash
#!/bin/bash
# migrate-config.sh

# Old configuration
OLD_ENV="${DEPLOY_ENVIRONMENT:-prod}"
OLD_PREFIX="${CDK_PROJECT_PREFIX:-agentcore}"

# Determine new prefix
if [ "$OLD_ENV" = "prod" ]; then
  NEW_PREFIX="$OLD_PREFIX"
  RETAIN="true"
else
  NEW_PREFIX="$OLD_PREFIX-$OLD_ENV"
  RETAIN="false"
fi

# Export new configuration
export CDK_PROJECT_PREFIX="$NEW_PREFIX"
export CDK_RETAIN_DATA_ON_DELETE="$RETAIN"
export CDK_FILE_UPLOAD_CORS_ORIGINS="${CDK_FILE_UPLOAD_CORS_ORIGINS:-http://localhost:4200}"

# Unset old variable
unset DEPLOY_ENVIRONMENT

echo "✅ Migration complete!"
echo "   Old: DEPLOY_ENVIRONMENT=$OLD_ENV"
echo "   New: CDK_PROJECT_PREFIX=$NEW_PREFIX"
echo "        CDK_RETAIN_DATA_ON_DELETE=$RETAIN"
```

### Q10: How do I verify the migration was successful?

**A:** Run this checklist:

```bash
# 1. Configuration loads without errors
cd infrastructure
source ../scripts/common/load-env.sh

# 2. No DEPLOY_ENVIRONMENT references
! env | grep DEPLOY_ENVIRONMENT

# 3. CDK synthesis works
npx cdk synth --all > /dev/null && echo "✅ Synthesis OK"

# 4. Resource names are correct
npx cdk synth InfrastructureStack | grep "AWS::EC2::VPC" -A 5

# 5. Deployment succeeds
npx cdk deploy --all

# 6. Application works
curl https://your-api-url/health
```

---

## Additional Resources

- **Configuration Reference:** See `docs/ENVIRONMENT_AGNOSTIC_REFACTOR_SUMMARY.md`
- **Design Document:** See `.kiro/specs/environment-agnostic-refactor/design.md`
- **Requirements:** See `.kiro/specs/environment-agnostic-refactor/requirements.md`
- **GitHub Environments:** https://docs.github.com/en/actions/deployment/targeting-different-environments

---

## Support

If you encounter issues during migration:

1. **Check this guide** - Most common issues are covered in the Troubleshooting section
2. **Review error messages** - They include helpful hints about what's wrong
3. **Check configuration** - Run `source scripts/common/load-env.sh` to see loaded values
4. **Test in non-production first** - Use a test environment or different prefix
5. **Create an issue** - Include error messages and configuration (redact sensitive values)

---

**Last Updated:** 2024
**Version:** 1.0
**Status:** Production Ready
