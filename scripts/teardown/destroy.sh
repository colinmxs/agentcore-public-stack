#!/bin/bash

#============================================================
# Teardown - Destroy All CDK Stacks
#
# Destroys all CDK stacks in reverse deployment order.
# Infrastructure stack is destroyed last since all others depend on it.
#
# Usage: bash scripts/teardown/destroy.sh
#============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source common utilities
source "${PROJECT_ROOT}/scripts/common/load-env.sh"

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# ===========================================================
# Destroy all stacks (parallel where possible)
#
# Dependency graph:
#   All application stacks depend on InfrastructureStack.
#   Application stacks are independent of each other.
#
# Strategy:
#   Phase 1: Destroy all application stacks in parallel
#   Phase 2: Destroy InfrastructureStack (foundation)
#
# Implementation notes:
#   - Each parallel `cdk destroy` writes its synth output to a
#     dedicated directory (--output cdk.out.<stack>) so they don't
#     contend for the same `cdk.out/` lock. Without this, only
#     the first process to acquire the lock succeeds; the rest
#     abort with "Another CLI (PID=...) is currently synthing".
#   - Before invoking `cdk destroy`, we ask CloudFormation directly
#     whether the stack exists. Missing stacks are skipped cleanly
#     instead of being reported as ambiguous failures.
# ===========================================================

cd "${PROJECT_ROOT}/infrastructure"

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    log_info "Installing CDK dependencies..."
    npm ci
fi

# Build CDK context params
CDK_CONTEXT_PARAMS=$(build_cdk_context_params)

# Phase 1: All application stacks (independent, can run in parallel)
PARALLEL_STACKS=(
    "SageMakerFineTuningStack"
    "RagIngestionStack"
    "GatewayStack"
    "InferenceApiStack"
    "AppApiStack"
    "FrontendStack"
    "McpSandboxStack"
    "ArtifactsStack"
)

# Phase 2: Foundation stack (must be last)
FOUNDATION_STACK="InfrastructureStack"

log_info "============================================"
log_info "  TEARDOWN: Destroying all CDK stacks"
log_info "  Project: ${CDK_PROJECT_PREFIX}"
log_info "  Region:  ${CDK_AWS_REGION}"
log_info "  Account: ${CDK_AWS_ACCOUNT}"
log_info "============================================"

# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

# Returns 0 if the CloudFormation stack exists, 1 otherwise.
# Suppresses all output; use the exit code only.
stack_exists() {
    local stack_name="$1"
    aws cloudformation describe-stacks \
        --stack-name "${stack_name}" \
        --region "${CDK_AWS_REGION}" \
        --output text \
        --query 'Stacks[0].StackName' \
        >/dev/null 2>&1
}

# Destroy a single stack. Each invocation writes synth output to its
# own --output directory so parallel runs don't fight for cdk.out's
# lock. Logs go to the per-stack file the caller passes in.
destroy_stack() {
    local construct_id="$1"
    local output_dir="$2"
    local log_file="$3"

    eval cdk destroy "${construct_id}" \
        ${CDK_CONTEXT_PARAMS} \
        --output "${output_dir}" \
        --force \
        --exclusively \
        > "${log_file}" 2>&1
}

# ---------------------------------------------------------------
# Phase 1: Destroy application stacks in parallel
# ---------------------------------------------------------------
log_info ""
log_info "Phase 1: Destroying application stacks in parallel..."

PIDS=()
STACK_NAMES=()
LOG_DIR=$(mktemp -d)
SYNTH_DIR=$(mktemp -d)
SKIPPED_STACKS=()

for STACK in "${PARALLEL_STACKS[@]}"; do
    FULL_STACK_NAME="${CDK_PROJECT_PREFIX}-${STACK}"

    # Skip stacks that don't exist in CloudFormation. This avoids
    # spending time synthing for a stack that was never deployed
    # (or has already been torn down).
    if ! stack_exists "${FULL_STACK_NAME}"; then
        log_info "  Skipping ${FULL_STACK_NAME} (does not exist in CloudFormation)"
        SKIPPED_STACKS+=("${FULL_STACK_NAME}")
        continue
    fi

    log_info "  Starting destroy: ${FULL_STACK_NAME}"

    destroy_stack \
        "${STACK}" \
        "${SYNTH_DIR}/${STACK}" \
        "${LOG_DIR}/${STACK}.log" &
    PIDS+=($!)
    STACK_NAMES+=("${STACK}")
done

# Wait for all parallel destroys and collect results
FAILED_STACKS=()
for i in "${!PIDS[@]}"; do
    if wait "${PIDS[$i]}"; then
        log_success "Destroyed ${CDK_PROJECT_PREFIX}-${STACK_NAMES[$i]}"
    else
        FAILED_STACKS+=("${CDK_PROJECT_PREFIX}-${STACK_NAMES[$i]}")
        log_warn "Failed to destroy ${CDK_PROJECT_PREFIX}-${STACK_NAMES[$i]}"
        if [ -f "${LOG_DIR}/${STACK_NAMES[$i]}.log" ]; then
            log_warn "  Tail of log:"
            tail -n 20 "${LOG_DIR}/${STACK_NAMES[$i]}.log" \
                | sed 's/^/    /'
        fi
    fi
done

# ---------------------------------------------------------------
# Phase 2: Destroy foundation stack
# ---------------------------------------------------------------
log_info ""
log_info "Phase 2: Destroying foundation stack..."
FULL_STACK_NAME="${CDK_PROJECT_PREFIX}-${FOUNDATION_STACK}"

if ! stack_exists "${FULL_STACK_NAME}"; then
    log_info "  Skipping ${FULL_STACK_NAME} (does not exist in CloudFormation)"
    SKIPPED_STACKS+=("${FULL_STACK_NAME}")
else
    log_info "  Destroying ${FULL_STACK_NAME}..."
    FOUNDATION_LOG="${LOG_DIR}/${FOUNDATION_STACK}.log"
    if destroy_stack \
        "${FOUNDATION_STACK}" \
        "${SYNTH_DIR}/${FOUNDATION_STACK}" \
        "${FOUNDATION_LOG}"; then
        log_success "Destroyed ${FULL_STACK_NAME}"
    else
        FAILED_STACKS+=("${FULL_STACK_NAME}")
        log_warn "Failed to destroy ${FULL_STACK_NAME}"
        if [ -f "${FOUNDATION_LOG}" ]; then
            log_warn "  Tail of log:"
            tail -n 20 "${FOUNDATION_LOG}" | sed 's/^/    /'
        fi
    fi
fi

# Cleanup
rm -rf "${LOG_DIR}" "${SYNTH_DIR}"

# ---------------------------------------------------------------
# Summary
# ---------------------------------------------------------------
echo ""
log_info "============================================"
if [ ${#SKIPPED_STACKS[@]} -gt 0 ]; then
    log_info "Skipped (did not exist):"
    for STACK in "${SKIPPED_STACKS[@]}"; do
        log_info "  - ${STACK}"
    done
fi
if [ ${#FAILED_STACKS[@]} -eq 0 ]; then
    log_success "All existing stacks destroyed successfully!"
else
    log_warn "The following stacks failed to destroy:"
    for STACK in "${FAILED_STACKS[@]}"; do
        log_warn "  - ${STACK}"
    done
    log_info "============================================"
    exit 1
fi
log_info "============================================"
