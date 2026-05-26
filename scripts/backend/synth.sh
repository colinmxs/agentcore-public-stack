#!/usr/bin/env bash
# scripts/backend/synth.sh — synthesize BackendStack.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${PROJECT_ROOT}/scripts/common/load-env.sh"

cd "${PROJECT_ROOT}/infrastructure"

if [ ! -d "node_modules" ]; then
    npm ci --prefer-offline
fi

CDK_CONTEXT_PARAMS=$(build_cdk_context_params)

log_info "Synthesizing BackendStack..."
eval npx cdk synth "${CDK_PROJECT_PREFIX}-BackendStack" \
    ${CDK_CONTEXT_PARAMS}

log_info "BackendStack synthesized to cdk.out/"
