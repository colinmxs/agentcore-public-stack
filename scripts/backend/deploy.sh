#!/usr/bin/env bash
# scripts/backend/deploy.sh — deploy BackendStack via CDK.
#
# Image tags are not passed via CDK context. The build pipeline
# (scripts/build/build-all-images.sh) writes each service's tag to
# SSM at /${prefix}/{service}/image-tag, and the constructs read
# them from SSM at synth time. Keep that the single source of truth.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${PROJECT_ROOT}/scripts/common/load-env.sh"

cd "${PROJECT_ROOT}/infrastructure"

# Install/refresh CDK npm deps via the centralised install script.
"${PROJECT_ROOT}/scripts/cdk/install.sh"

CDK_CONTEXT_PARAMS=$(build_cdk_context_params)

if [ -d "cdk.out" ] && [ -f "cdk.out/manifest.json" ]; then
    log_info "Using pre-synthesized template from cdk.out/"
    npx cdk deploy "${CDK_PROJECT_PREFIX}-BackendStack" \
        --app "cdk.out/" \
        --exclusively \
        --require-approval never \
        --outputs-file "${PROJECT_ROOT}/infrastructure/backend-outputs.json"
else
    log_info "Synthesizing and deploying BackendStack..."
    eval npx cdk deploy "${CDK_PROJECT_PREFIX}-BackendStack" \
        ${CDK_CONTEXT_PARAMS} \
        --exclusively \
        --require-approval never \
        --outputs-file "${PROJECT_ROOT}/infrastructure/backend-outputs.json"
fi

log_info "BackendStack deployed successfully"
