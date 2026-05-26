#!/usr/bin/env bash
# scripts/platform/deploy.sh — deploy PlatformStack via CDK.
#
# Follows the devops steering doc pattern:
#   1. Source load-env.sh (exports CDK_* vars from env > context > defaults)
#   2. Build context params via build_cdk_context_params()
#   3. Deploy with context params (or from pre-synthesized cdk.out/)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source common utilities (exports CDK_* vars, validates config)
source "${PROJECT_ROOT}/scripts/common/load-env.sh"

cd "${PROJECT_ROOT}/infrastructure"

# Install/refresh CDK npm deps via the centralised install script.
"${PROJECT_ROOT}/scripts/cdk/install.sh"

# Build context parameters from exported env vars
CDK_CONTEXT_PARAMS=$(build_cdk_context_params)

# Deploy — use pre-synthesized cdk.out/ if available, otherwise synth+deploy
if [ -d "cdk.out" ] && [ -f "cdk.out/manifest.json" ]; then
    log_info "Using pre-synthesized template from cdk.out/"
    npx cdk deploy "${CDK_PROJECT_PREFIX}-PlatformStack" \
        --app "cdk.out/" \
        --exclusively \
        --require-approval never \
        --outputs-file "${PROJECT_ROOT}/infrastructure/platform-outputs.json"
else
    log_info "Synthesizing and deploying PlatformStack..."
    eval npx cdk deploy "${CDK_PROJECT_PREFIX}-PlatformStack" \
        ${CDK_CONTEXT_PARAMS} \
        --exclusively \
        --require-approval never \
        --outputs-file "${PROJECT_ROOT}/infrastructure/platform-outputs.json"
fi

log_info "PlatformStack deployed successfully"
