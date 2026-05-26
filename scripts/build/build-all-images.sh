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
# Required env (resolved by scripts/common/load-env.sh):
#   CDK_PROJECT_PREFIX
#   CDK_AWS_REGION
#   CDK_AWS_ACCOUNT
#
# Optional env:
#   GITHUB_OUTPUT   set by GitHub Actions; if absent we still log
#                   the tags but the workflow can't pick them up.
#============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_AND_PUSH="${SCRIPT_DIR}/build-and-push-if-changed.sh"

# Source common utilities (exports CDK_* vars, validates config,
# provides log_info / log_warn / log_error / log_success helpers).
source "${PROJECT_ROOT}/scripts/common/load-env.sh"

# build-and-push-if-changed.sh expects the AWS region under AWS_REGION
# (it's a stand-alone tool, agnostic to CDK_*); export it so the
# subprocess sees it.
export AWS_REGION="${CDK_AWS_REGION}"

REGISTRY="${CDK_AWS_ACCOUNT}.dkr.ecr.${CDK_AWS_REGION}.amazonaws.com"

# ---------------------------------------------------------------
# Per-service definitions.
#
# Each spec lists the inputs to hash and the platform to build for.
# Inference API runs on arm64 (cost-optimized AgentCore Runtime), so
# its --platform is linux/arm64. The others build the host
# architecture (x86_64 on standard GitHub runners).
# ---------------------------------------------------------------
declare -A APP_API=(
    [dockerfile]="backend/Dockerfile.app-api"
    [source]="backend/src"
    [manifests]="backend/pyproject.toml,backend/uv.lock"
    [platform]=""
    [out_key]="app_api_image_tag"
    [ssm_key]="/${CDK_PROJECT_PREFIX}/app-api/image-tag"
)
declare -A INFERENCE_API=(
    [dockerfile]="backend/Dockerfile.inference-api"
    [source]="backend/src"
    [manifests]="backend/pyproject.toml,backend/uv.lock"
    [platform]="linux/arm64"
    [out_key]="inference_api_image_tag"
    [ssm_key]="/${CDK_PROJECT_PREFIX}/inference-api/image-tag"
)
declare -A RAG_INGESTION=(
    [dockerfile]="backend/Dockerfile.rag-ingestion"
    [source]="backend/src"
    [manifests]="backend/src/apis/app_api/documents/ingestion/requirements.lock"
    [platform]=""
    [out_key]="rag_ingestion_image_tag"
    [ssm_key]="/${CDK_PROJECT_PREFIX}/rag-ingestion/image-tag"
)

build_one() {
    local service="$1"
    local -n spec="$2"

    local repo="${REGISTRY}/${CDK_PROJECT_PREFIX}-${service}"

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

    log_info "${service}: ${tag}"

    # Publish to GITHUB_OUTPUT for the workflow to consume.
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
        echo "${spec[out_key]}=${tag}" >> "$GITHUB_OUTPUT"
    fi

    # Publish to SSM so the CDK constructs that read the tag at synth
    # time pick up the freshly-built image. `put-parameter --overwrite`
    # is idempotent. Note: per the devops gotcha, --overwrite cannot be
    # combined with --tags for an existing parameter, so we don't pass
    # --tags here.
    aws ssm put-parameter \
        --region "${CDK_AWS_REGION}" \
        --name "${spec[ssm_key]}" \
        --value "$tag" \
        --type String \
        --overwrite \
        --no-cli-pager >/dev/null
    log_info "${service}: SSM ${spec[ssm_key]} = ${tag}"
}

cd "$PROJECT_ROOT"

log_info "Building all backend Docker images..."
build_one app-api        APP_API
build_one inference-api  INFERENCE_API
build_one rag-ingestion  RAG_INGESTION

log_info "All images built / verified."
