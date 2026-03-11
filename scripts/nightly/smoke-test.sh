#!/bin/bash
set -euo pipefail

# Script: Smoke Test Deployed Nightly Stack
# Description: Validates health endpoints for App API and Inference API

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Get ALB URL from CDK outputs
get_alb_url() {
    local stack_name="${CDK_PROJECT_PREFIX}-InfrastructureStack"
    local alb_dns=$(aws cloudformation describe-stacks \
        --stack-name "${stack_name}" \
        --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue" \
        --output text \
        --region "${CDK_AWS_REGION}")
    
    if [ -z "${alb_dns}" ]; then
        log_error "Could not retrieve ALB DNS name from stack ${stack_name}"
        return 1
    fi
    
    echo "http://${alb_dns}"
}

# Test health endpoint
test_health_endpoint() {
    local url="$1"
    local name="$2"
    
    log_info "Testing ${name}: ${url}"
    
    local response_code=$(curl -s -o /dev/null -w "%{http_code}" "${url}" --max-time 30)
    
    if [ "${response_code}" = "200" ]; then
        log_success "${name} health check passed (HTTP ${response_code})"
        return 0
    else
        log_error "${name} health check failed (HTTP ${response_code})"
        return 1
    fi
}

main() {
    log_info "Starting smoke tests for nightly deployment..."
    
    # Validate required environment variables
    if [ -z "${CDK_PROJECT_PREFIX:-}" ]; then
        log_error "CDK_PROJECT_PREFIX environment variable is required"
        exit 1
    fi
    
    if [ -z "${CDK_AWS_REGION:-}" ]; then
        log_error "CDK_AWS_REGION environment variable is required"
        exit 1
    fi
    
    log_info "Project prefix: ${CDK_PROJECT_PREFIX}"
    log_info "AWS region: ${CDK_AWS_REGION}"
    
    # Get ALB URL
    log_info "Retrieving ALB URL from CloudFormation..."
    ALB_URL=$(get_alb_url)
    log_info "ALB URL: ${ALB_URL}"
    
    # Test App API health endpoint (port 8000)
    test_health_endpoint "${ALB_URL}:8000/health" "App API"
    APP_API_RESULT=$?
    
    # Test Inference API health endpoint (port 8001)
    test_health_endpoint "${ALB_URL}:8001/health" "Inference API"
    INFERENCE_API_RESULT=$?
    
    # Check results
    if [ ${APP_API_RESULT} -eq 0 ] && [ ${INFERENCE_API_RESULT} -eq 0 ]; then
        log_success "All smoke tests passed!"
        exit 0
    else
        log_error "Some smoke tests failed"
        exit 1
    fi
}

main "$@"
