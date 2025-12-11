#!/bin/bash
set -euo pipefail

# Deploy script for Agent Core Stack
# Deploys the AgentCoreStack using AWS CDK

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CDK_DIR="${PROJECT_ROOT}/infrastructure"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_info "============================================"
log_info "Agent Core Stack - Deploy CDK Infrastructure"
log_info "============================================"

# Load environment variables
log_info "Loading environment configuration..."
if [ -f "${PROJECT_ROOT}/scripts/common/load-env.sh" ]; then
    # shellcheck source=../common/load-env.sh
    source "${PROJECT_ROOT}/scripts/common/load-env.sh"
else
    log_error "Environment loader not found: ${PROJECT_ROOT}/scripts/common/load-env.sh"
    exit 1
fi

# Check if CDK directory exists
if [ ! -d "${CDK_DIR}" ]; then
    log_error "CDK directory not found: ${CDK_DIR}"
    exit 1
fi

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    log_error "AWS CDK is not installed. Please install it first."
    log_error "Run: scripts/common/install-deps.sh"
    exit 1
fi

log_info "Deploying Agent Core Stack..."
log_info "CDK directory: ${CDK_DIR}"
log_info "Project prefix: ${CDK_PROJECT_PREFIX}"
log_info "AWS Region: ${CDK_AWS_REGION}"
log_info "AWS Account: ${CDK_AWS_ACCOUNT}"
log_info "Environment: ${DEPLOY_ENVIRONMENT}"

# Change to CDK directory
cd "${CDK_DIR}"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    log_warn "node_modules not found in CDK directory. Installing dependencies..."
    npm install
fi

# Display CDK version
log_info "CDK version: $(cdk --version)"

# Bootstrap CDK if needed (idempotent operation)
log_info "Ensuring CDK is bootstrapped in ${CDK_AWS_REGION}..."
cdk bootstrap aws://${CDK_AWS_ACCOUNT}/${CDK_AWS_REGION} \
    --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
    --toolkit-stack-name ${CDK_PROJECT_PREFIX}-CDKToolkit \
    --qualifier ${CDK_PROJECT_PREFIX:0:10} \
    --context environment="${DEPLOY_ENVIRONMENT}" || log_warn "Bootstrap may have already been completed"

# Build context arguments
CONTEXT_ARGS="--context environment=${DEPLOY_ENVIRONMENT}"
CONTEXT_ARGS="${CONTEXT_ARGS} --context projectPrefix=${CDK_PROJECT_PREFIX}"
CONTEXT_ARGS="${CONTEXT_ARGS} --context awsAccount=${CDK_AWS_ACCOUNT}"
CONTEXT_ARGS="${CONTEXT_ARGS} --context awsRegion=${CDK_AWS_REGION}"

# Synthesize the CloudFormation template
log_info "Synthesizing CloudFormation template..."
cdk synth AgentCoreStack ${CONTEXT_ARGS}

# Deploy the stack
log_info "Deploying AgentCoreStack..."

# Optional: Use --require-approval never for CI/CD
REQUIRE_APPROVAL="${CDK_REQUIRE_APPROVAL:-never}"

set +e
cdk deploy AgentCoreStack \
    ${CONTEXT_ARGS} \
    --require-approval ${REQUIRE_APPROVAL} \
    --outputs-file "${PROJECT_ROOT}/cdk-outputs-agent-core.json" \
    2>&1 | tee /tmp/cdk-deploy-agent-core.log
DEPLOY_EXIT_CODE=$?
set -e

if [ ${DEPLOY_EXIT_CODE} -ne 0 ]; then
    log_error "CDK deployment failed with exit code ${DEPLOY_EXIT_CODE}"
    log_error "Check the logs above for details."
    log_error ""
    log_error "Common issues:"
    log_error "  1. Missing AWS credentials or insufficient permissions"
    log_error "  2. Stack already exists with different configuration"
    log_error "  3. Resource limits exceeded (DynamoDB tables, Lambda functions, etc.)"
    log_error "  4. Invalid CDK configuration in cdk.context.json"
    log_error ""
    log_error "Full deployment log saved to: /tmp/cdk-deploy-agent-core.log"
    exit ${DEPLOY_EXIT_CODE}
fi

log_info "Agent Core Stack deployed successfully!"

# Display outputs
if [ -f "${PROJECT_ROOT}/cdk-outputs-agent-core.json" ]; then
    log_info ""
    log_info "Deployment outputs:"
    cat "${PROJECT_ROOT}/cdk-outputs-agent-core.json"
fi

log_info "============================================"
log_info "Agent Core Stack deployment complete!"
log_info "============================================"
log_info ""
log_info "Resources created:"
log_info "  - DynamoDB table for agent state"
log_info "  - S3 bucket for agent artifacts"
log_info "  - Lambda function for agent orchestration"
log_info "  - Step Functions state machine (if enabled)"
log_info "  - IAM roles and policies"
log_info ""
log_info "Next steps:"
log_info "  1. Verify resources in AWS Console"
log_info "  2. Test Lambda function invocation"
log_info "  3. Monitor CloudWatch logs for any issues"
