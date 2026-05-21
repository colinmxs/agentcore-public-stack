#!/usr/bin/env bash
# scripts/backend/deploy.sh — deploy BackendStack via CDK.
# Expects image tag context values passed as env vars:
#   APP_API_IMAGE_TAG, INFERENCE_API_IMAGE_TAG, RAG_INGESTION_IMAGE_TAG
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/load-env.sh"

cd "$SCRIPT_DIR/../../infrastructure"
npm ci --prefer-offline

CONTEXT_ARGS=""
[[ -n "${APP_API_IMAGE_TAG:-}" ]] && CONTEXT_ARGS+=" -c appApiImageTag=$APP_API_IMAGE_TAG"
[[ -n "${INFERENCE_API_IMAGE_TAG:-}" ]] && CONTEXT_ARGS+=" -c inferenceApiImageTag=$INFERENCE_API_IMAGE_TAG"
[[ -n "${RAG_INGESTION_IMAGE_TAG:-}" ]] && CONTEXT_ARGS+=" -c ragIngestionImageTag=$RAG_INGESTION_IMAGE_TAG"

npx cdk deploy "${CDK_PROJECT_PREFIX}-BackendStack" \
  --require-approval never \
  --outputs-file cdk-outputs-backend.json \
  $CONTEXT_ARGS
