#!/usr/bin/env bash
# scripts/backend/deploy.sh — deploy BackendStack via CDK.
#
# Expects image tag env vars (from build-all-images.sh):
#   APP_API_IMAGE_TAG, INFERENCE_API_IMAGE_TAG, RAG_INGESTION_IMAGE_TAG
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${PROJECT_ROOT}/scripts/common/load-env.sh"

cd "${PROJECT_ROOT}/infrastructure"

if [ ! -d "node_modules" ]; then
    npm ci --prefer-offline
fi

CDK_CONTEXT_PARAMS=$(build_cdk_context_params)

# Add image tag context params if provided
if [ -n "${APP_API_IMAGE_TAG:-}" ]; then
    CDK_CONTEXT_PARAMS="${CDK_CONTEXT_PARAMS} --context appApiImageTag=\"${APP_API_IMAGE_TAG}\""
fi
if [ -n "${INFERENCE_API_IMAGE_TAG:-}" ]; then
    CDK_CONTEXT_PARAMS="${CDK_CONTEXT_PARAMS} --context inferenceApiImageTag=\"${INFERENCE_API_IMAGE_TAG}\""
fi
if [ -n "${RAG_INGESTION_IMAGE_TAG:-}" ]; then
    CDK_CONTEXT_PARAMS="${CDK_CONTEXT_PARAMS} --context ragIngestionImageTag=\"${RAG_INGESTION_IMAGE_TAG}\""
fi

if [ -d "cdk.out" ] && [ -f "cdk.out/manifest.json" ]; then
    log_info "Using pre-synthesized template from cdk.out/"
    npx cdk deploy "${CDK_PROJECT_PREFIX}-BackendStack" \
        --app "cdk.out/" \
        --require-approval never \
        --outputs-file "${PROJECT_ROOT}/infrastructure/backend-outputs.json"
else
    log_info "Synthesizing and deploying BackendStack..."
    eval npx cdk deploy "${CDK_PROJECT_PREFIX}-BackendStack" \
        ${CDK_CONTEXT_PARAMS} \
        --require-approval never \
        --outputs-file "${PROJECT_ROOT}/infrastructure/backend-outputs.json"
fi

log_info "BackendStack deployed successfully"
