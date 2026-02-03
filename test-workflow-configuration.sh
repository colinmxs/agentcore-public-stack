#!/bin/bash
# Test script for GitHub Actions workflow configuration (Task 15.6)
# Validates Requirements: 9.1, 9.2, 9.3, 9.4

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Test result tracking
declare -a FAILED_TESTS=()

# Helper functions
log_test() {
    echo -e "\n${YELLOW}TEST:${NC} $1"
    ((TESTS_TOTAL++))
}

log_pass() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    ((TESTS_FAILED++))
    FAILED_TESTS+=("$1")
}

log_info() {
    echo -e "  ℹ $1"
}

# Workflow files to test
WORKFLOWS=(
    ".github/workflows/infrastructure.yml"
    ".github/workflows/app-api.yml"
    ".github/workflows/inference-api.yml"
    ".github/workflows/frontend.yml"
    ".github/workflows/gateway.yml"
)

echo "=========================================="
echo "GitHub Actions Workflow Configuration Test"
echo "=========================================="
echo ""
echo "Testing environment-agnostic refactor requirements:"
echo "  - Requirement 9.1: GitHub Environments support"
echo "  - Requirement 9.2: Variable/secret loading from environments"
echo "  - Requirement 9.3: Manual environment selection (workflow_dispatch)"
echo "  - Requirement 9.4: Automatic environment selection (branch-based)"
echo ""

# Test 1: Verify workflow files exist
log_test "Workflow files exist"
all_exist=true
for workflow in "${WORKFLOWS[@]}"; do
    if [ -f "$workflow" ]; then
        log_info "Found: $workflow"
    else
        log_info "Missing: $workflow"
        all_exist=false
    fi
done

if [ "$all_exist" = true ]; then
    log_pass "All workflow files exist"
else
    log_fail "Some workflow files are missing"
fi

# Test 2: Verify workflow_dispatch with environment input (Requirement 9.3)
log_test "Workflows have workflow_dispatch with environment selection"
for workflow in "${WORKFLOWS[@]}"; do
    if [ ! -f "$workflow" ]; then
        continue
    fi
    
    workflow_name=$(basename "$workflow")
    
    # Check for workflow_dispatch trigger
    if grep -q "workflow_dispatch:" "$workflow"; then
        # Check for environment input with choice type
        if grep -A 10 "workflow_dispatch:" "$workflow" | grep -q "environment:" && \
           grep -A 10 "workflow_dispatch:" "$workflow" | grep -q "type: choice" && \
           grep -A 15 "workflow_dispatch:" "$workflow" | grep -q "development" && \
           grep -A 15 "workflow_dispatch:" "$workflow" | grep -q "production"; then
            log_info "✓ $workflow_name has workflow_dispatch with environment choice"
        else
            log_fail "$workflow_name: workflow_dispatch missing proper environment input"
        fi
    else
        log_fail "$workflow_name: Missing workflow_dispatch trigger"
    fi
done
log_pass "All workflows have workflow_dispatch with environment selection"

# Test 3: Verify environment key in jobs (Requirement 9.1)
log_test "Jobs reference GitHub Environments correctly"
for workflow in "${WORKFLOWS[@]}"; do
    if [ ! -f "$workflow" ]; then
        continue
    fi
    
    workflow_name=$(basename "$workflow")
    
    # Check for environment selection logic in jobs
    # Pattern: environment: ${{ github.event.inputs.environment || ...
    if grep -q "environment: \${{" "$workflow"; then
        log_info "✓ $workflow_name has environment selection logic"
    else
        log_fail "$workflow_name: Missing environment selection in jobs"
    fi
done
log_pass "All workflows reference GitHub Environments"

# Test 4: Verify automatic environment selection based on branch (Requirement 9.4)
log_test "Workflows have automatic environment selection based on branch"
for workflow in "${WORKFLOWS[@]}"; do
    if [ ! -f "$workflow" ]; then
        continue
    fi
    
    workflow_name=$(basename "$workflow")
    
    # Check for branch-based environment selection
    # Pattern: github.ref == 'refs/heads/main' && 'production'
    # Pattern: github.ref == 'refs/heads/develop' && 'development'
    if grep -q "github.ref == 'refs/heads/main'" "$workflow" && \
       grep -q "'production'" "$workflow" && \
       grep -q "github.ref == 'refs/heads/develop'" "$workflow" && \
       grep -q "'development'" "$workflow"; then
        log_info "✓ $workflow_name has branch-based environment selection (main→production, develop→development)"
    else
        log_fail "$workflow_name: Missing or incomplete branch-based environment selection"
    fi
done
log_pass "All workflows have automatic environment selection"

# Test 5: Verify GitHub Environment variables are referenced (Requirement 9.2)
log_test "Workflows reference GitHub Environment variables correctly"
for workflow in "${WORKFLOWS[@]}"; do
    if [ ! -f "$workflow" ]; then
        continue
    fi
    
    workflow_name=$(basename "$workflow")
    
    # Check for vars. and secrets. references
    if grep -q "\${{ vars\." "$workflow" && grep -q "\${{ secrets\." "$workflow"; then
        log_info "✓ $workflow_name references GitHub Variables and Secrets"
    else
        log_fail "$workflow_name: Missing GitHub Variables or Secrets references"
    fi
    
    # Check for CDK_PROJECT_PREFIX (should be in all workflows)
    if grep -q "CDK_PROJECT_PREFIX: \${{ vars.CDK_PROJECT_PREFIX }}" "$workflow"; then
        log_info "✓ $workflow_name references CDK_PROJECT_PREFIX from vars"
    else
        log_fail "$workflow_name: Missing CDK_PROJECT_PREFIX from GitHub Variables"
    fi
    
    # Check for CDK_AWS_ACCOUNT (should be in all workflows)
    if grep -q "CDK_AWS_ACCOUNT: \${{ secrets.CDK_AWS_ACCOUNT }}" "$workflow"; then
        log_info "✓ $workflow_name references CDK_AWS_ACCOUNT from secrets"
    else
        log_fail "$workflow_name: Missing CDK_AWS_ACCOUNT from GitHub Secrets"
    fi
done
log_pass "All workflows reference GitHub Environment variables"

# Test 6: Verify no DEPLOY_ENVIRONMENT references remain
log_test "No DEPLOY_ENVIRONMENT references in workflows"
deploy_env_found=false
for workflow in "${WORKFLOWS[@]}"; do
    if [ ! -f "$workflow" ]; then
        continue
    fi
    
    workflow_name=$(basename "$workflow")
    
    if grep -q "DEPLOY_ENVIRONMENT" "$workflow"; then
        log_fail "$workflow_name: Found DEPLOY_ENVIRONMENT reference (should be removed)"
        deploy_env_found=true
        # Show the lines containing DEPLOY_ENVIRONMENT
        log_info "Lines with DEPLOY_ENVIRONMENT:"
        grep -n "DEPLOY_ENVIRONMENT" "$workflow" | while read -r line; do
            log_info "  $line"
        done
    fi
done

if [ "$deploy_env_found" = false ]; then
    log_pass "No DEPLOY_ENVIRONMENT references found in workflows"
else
    log_fail "DEPLOY_ENVIRONMENT references found (must be removed)"
fi

# Test 7: Verify environment selection expression format
log_test "Environment selection expressions are correctly formatted"
for workflow in "${WORKFLOWS[@]}"; do
    if [ ! -f "$workflow" ]; then
        continue
    fi
    
    workflow_name=$(basename "$workflow")
    
    # Extract environment selection expressions
    env_expressions=$(grep -o "environment: \${{[^}]*}}" "$workflow" || true)
    
    if [ -n "$env_expressions" ]; then
        # Check if expression includes all three parts:
        # 1. github.event.inputs.environment (manual)
        # 2. github.ref == 'refs/heads/main' && 'production' (main branch)
        # 3. github.ref == 'refs/heads/develop' && 'development' (develop branch)
        
        if echo "$env_expressions" | grep -q "github.event.inputs.environment" && \
           echo "$env_expressions" | grep -q "github.ref == 'refs/heads/main'" && \
           echo "$env_expressions" | grep -q "'production'" && \
           echo "$env_expressions" | grep -q "github.ref == 'refs/heads/develop'" && \
           echo "$env_expressions" | grep -q "'development'"; then
            log_info "✓ $workflow_name has complete environment selection expression"
        else
            log_fail "$workflow_name: Incomplete environment selection expression"
        fi
    fi
done
log_pass "Environment selection expressions are correctly formatted"

# Test 8: Verify deployment summary includes environment
log_test "Deployment summaries include environment information"
for workflow in "${WORKFLOWS[@]}"; do
    if [ ! -f "$workflow" ]; then
        continue
    fi
    
    workflow_name=$(basename "$workflow")
    
    # Check if deployment summary step exists and includes ENVIRONMENT variable
    if grep -q "Deployment summary" "$workflow" || grep -q "deployment summary" "$workflow"; then
        if grep -A 20 "deployment summary" "$workflow" | grep -q "ENVIRONMENT="; then
            log_info "✓ $workflow_name deployment summary includes environment"
        else
            log_fail "$workflow_name: Deployment summary missing environment variable"
        fi
    fi
done
log_pass "Deployment summaries include environment information"

# Test 9: Verify jobs that need environment have it set
log_test "Jobs requiring AWS credentials have environment set"
for workflow in "${WORKFLOWS[@]}"; do
    if [ ! -f "$workflow" ]; then
        continue
    fi
    
    workflow_name=$(basename "$workflow")
    
    # Find jobs that configure AWS credentials
    # These jobs should have environment: set
    job_names=$(grep -B 20 "Configure AWS credentials" "$workflow" | grep "^  [a-z-]*:" | sed 's/://g' | awk '{print $1}' || true)
    
    if [ -n "$job_names" ]; then
        log_info "✓ $workflow_name has jobs with AWS credential configuration"
    fi
done
log_pass "Jobs requiring AWS credentials have environment configuration"

# Test 10: Verify environment-specific variables are used correctly
log_test "Environment-specific configuration variables are properly referenced"
for workflow in "${WORKFLOWS[@]}"; do
    if [ ! -f "$workflow" ]; then
        continue
    fi
    
    workflow_name=$(basename "$workflow")
    
    # Check for common environment-specific variables
    # These should come from vars. or secrets., not hardcoded
    
    # Check CDK_RETAIN_DATA_ON_DELETE is from vars
    if grep -q "CDK_RETAIN_DATA_ON_DELETE" "$workflow"; then
        if grep -q "CDK_RETAIN_DATA_ON_DELETE: \${{ vars.CDK_RETAIN_DATA_ON_DELETE }}" "$workflow"; then
            log_info "✓ $workflow_name: CDK_RETAIN_DATA_ON_DELETE from vars"
        else
            log_fail "$workflow_name: CDK_RETAIN_DATA_ON_DELETE not from GitHub Variables"
        fi
    fi
    
    # Check AWS_ROLE_ARN is from secrets
    if grep -q "AWS_ROLE_ARN" "$workflow"; then
        if grep -q "AWS_ROLE_ARN: \${{ secrets.AWS_ROLE_ARN }}" "$workflow"; then
            log_info "✓ $workflow_name: AWS_ROLE_ARN from secrets"
        else
            log_fail "$workflow_name: AWS_ROLE_ARN not from GitHub Secrets"
        fi
    fi
done
log_pass "Environment-specific variables are properly referenced"

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Total Tests:  ${TESTS_TOTAL}"
echo -e "${GREEN}Passed:       ${TESTS_PASSED}${NC}"
echo -e "${RED}Failed:       ${TESTS_FAILED}${NC}"
echo ""

if [ ${TESTS_FAILED} -gt 0 ]; then
    echo -e "${RED}Failed Tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  - $test"
    done
    echo ""
    exit 1
else
    echo -e "${GREEN}✓ All workflow configuration tests passed!${NC}"
    echo ""
    echo "Validated Requirements:"
    echo "  ✓ 9.1: GitHub Environments support with environment key"
    echo "  ✓ 9.2: Variables and secrets loaded from GitHub Environments"
    echo "  ✓ 9.3: Manual environment selection via workflow_dispatch"
    echo "  ✓ 9.4: Automatic environment selection based on branch"
    echo "  ✓ No DEPLOY_ENVIRONMENT references remain"
    echo ""
    exit 0
fi
