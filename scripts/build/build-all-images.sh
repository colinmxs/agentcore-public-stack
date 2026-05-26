#!/usr/bin/env bash
#============================================================
# build-all-images.sh — build & push all three backend Docker
# images (skipping unchanged ones), emit the resulting tags.
#
# Driven by the Backend Stack workflow:
#   .github/workflows/backend.yml
# The job's `outputs:` consume what we write to $GITHUB_OUTPUT;
# the deploy job re-receives them as APP_API_IMAGE_TAG /
# INFERENCE_API_IMAGE_TAG / RAG_INGESTION_IMAGE_TAG and the
# downstream `scripts/backend/deploy.sh` picks them up.
#
# We also write the tags to SSM under /{prefix}/{service}/image-tag
# because the CDK constructs (app-api-environment.ts,
# inference-agentcore-construct.ts, rag-ingestion-lambda-construct.ts)
# read the tag from SSM at synth time. Writing them here means the
# build pipeline and the CDK deploy stay in sync without a separate
# push-to-ecr step.
#
# Required env:
#   CDK_PROJECT_PREFIX       (e.g., ai-sbmt-api)
#   CDK_AWS_REGION or AWS_REGION
#   CDK_AWS_ACCOUNT or AWS_ACCOUNT_ID
#
# Optional env:
#   GITHUB_OUTPUT            set by GitHub Actions; if absent we
#                            still print the tags to stdout.
#============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_AND_PUSH="${SCRIPT_DIR}/build-and-push-if-changed.sh"

# Resolve env (accepting both CDK_ and bare AWS_ variants).
PREFIX="${CDK_PROJECT_PREFIX:-}"
REGION="${CDK_AWS_REGION:-${AWS_REGION:-}}"
ACCOUNT="${CDK_AWS_ACCOUNT:-${AWS_ACCOUNT_ID:-}}"

[[ -n "$PREFIX"  ]] || { echo "CDK_PROJECT_PREFIX required" >&2; exit 2; }
[[ -n "$REGION"  ]] || { echo "AWS_REGION (or CDK_AWS_REGION) required" >&2; exit 2; }
[[ -n "$ACCOUNT" ]] || { echo "AWS_ACCOUNT_ID (or CDK_AWS_ACCOUNT) required" >&2; exit 2; }

export AWS_REGION="$REGION"

REGISTRY="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"

log() { echo "==> $*"; }

# ---------------------------------------------------------------
# Per-service definitions.
#
# Each service spec is: name | dockerfile | manifests (comma) | platform | output-key
# Inference API runs on arm64 (cost-optimized AgentCore Runtime), so we
# pass --platform linux/arm64. The others build the host architecture
# (x86_64 on standard GitHub runners).
# ---------------------------------------------------------------
declare -A APP_API=(
    [dockerfile]="backend/Dockerfile.app-api"
    [source]="backend/src"
    [manifests]="backend/pyproject.toml,backend/uv.lock"
    [platform]=""
    [out_key]="app_api_image_tag"
    [ssm_key]="/${PREFIX}/app-api/image-tag"
)
declare -A INFERENCE_API=(
    [dockerfile]="backend/Dockerfile.inference-api"
    [source]="backend/src"
    [manifests]="backend/pyproject.toml,backend/uv.lock"
    [platform]="linux/arm64"
    [out_key]="inference_api_image_tag"
    [ssm_key]="/${PREFIX}/inference-api/image-tag"
)
declare -A RAG_INGESTION=(
    [dockerfile]="backend/Dockerfile.rag-ingestion"
    [source]="backend/src"
    [manifests]="backend/src/apis/app_api/documents/ingestion/requirements.lock"
    [platform]=""
    [out_key]="rag_ingestion_image_tag"
    [ssm_key]="/${PREFIX}/rag-ingestion/image-tag"
)

build_one() {
    local service="$1"
    local -n spec="$2"

    local repo="${REGISTRY}/${PREFIX}-${service}"

    # Build the manifest flag list from the comma-separated string.
    local manifest_args=()
    IFS=',' read -ra mans <<< "${spec[manifests]}"
    for m in "${mans[@]}"; do
        manifest_args+=( --manifest "$m" )
    done

    local platform_args=()
    if [[ -n "${spec[platform]}" ]]; then
        platform_args+=( --platform "${spec[platform]}" )
    fi

    local tag
    tag="$(
        bash "$BUILD_AND_PUSH" \
            --service "$service" \
            --dockerfile "${spec[dockerfile]}" \
            --source-dir "${spec[source]}" \
            "${manifest_args[@]}" \
            "${platform_args[@]}" \
            --ecr-repository "$repo"
    )"

    log "${service}: ${tag}"

    # Publish to GITHUB_OUTPUT for the workflow to consume.
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
        echo "${spec[out_key]}=${tag}" >> "$GITHUB_OUTPUT"
    fi

    # Publish to SSM so the CDK constructs that read the tag at synth
    # time pick up the freshly-built image. `put-parameter --overwrite`
    # is idempotent.
    aws ssm put-parameter \
        --region "$REGION" \
        --name "${spec[ssm_key]}" \
        --value "$tag" \
        --type String \
        --overwrite \
        --no-cli-pager >/dev/null
    log "${service}: SSM ${spec[ssm_key]} = ${tag}"
}

cd "$PROJECT_ROOT"

log "Project: $PREFIX  Region: $REGION  Account: $ACCOUNT"
build_one app-api        APP_API
build_one inference-api  INFERENCE_API
build_one rag-ingestion  RAG_INGESTION

log "All images built / verified."
