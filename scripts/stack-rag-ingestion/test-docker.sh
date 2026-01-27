#!/bin/bash
set -euo pipefail

# Script: Test Docker Image for RAG Ingestion Lambda
# Description: Validates Docker image can be loaded and contains required components

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Set CDK_PROJECT_PREFIX from environment or use default
# This script doesn't need full configuration validation, just the project prefix
CDK_PROJECT_PREFIX="${CDK_PROJECT_PREFIX:-agentcore}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Logging functions
log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1" >&2
}

log_success() {
    echo "[SUCCESS] $1"
}

main() {
    log_info "Testing RAG Ingestion Lambda Docker image..."
    
    # Use CDK_PROJECT_PREFIX and IMAGE_TAG from environment (set at workflow level)
    IMAGE_NAME="${CDK_PROJECT_PREFIX}-rag-ingestion:${IMAGE_TAG}"
    
    log_info "Testing Docker image: ${IMAGE_NAME}"
    
    # Check if image exists
    if ! docker images "${IMAGE_NAME}" | grep -q "${IMAGE_TAG}"; then
        log_error "Docker image not found: ${IMAGE_NAME}"
        log_info "Available images:"
        docker images "${CDK_PROJECT_PREFIX}-rag-ingestion"
        exit 1
    fi
    
    log_success "Docker image found: ${IMAGE_NAME}"
    
    # Display image size
    IMAGE_SIZE=$(docker images "${IMAGE_NAME}" --format "{{.Size}}" | head -n 1)
    log_info "Image size: ${IMAGE_SIZE}"
    
    # Test that image can be inspected
    log_info "Inspecting image metadata..."
    if docker inspect "${IMAGE_NAME}" > /dev/null 2>&1; then
        log_success "Image inspection passed"
    else
        log_error "Failed to inspect image"
        exit 1
    fi
    
    # Verify Lambda handler exists in image
    log_info "Verifying Lambda handler exists..."
    if docker run --rm --platform linux/arm64 "${IMAGE_NAME}" ls /var/task/handler.py > /dev/null 2>&1; then
        log_success "Lambda handler found in image"
    else
        log_info "Note: handler.py not found at /var/task/handler.py (may use different handler location)"
    fi
    
    # Verify Python packages are installed
    log_info "Verifying Python packages..."
    if docker run --rm --platform linux/arm64 "${IMAGE_NAME}" python3 -c "import boto3; import langchain" 2>/dev/null; then
        log_success "Required Python packages (boto3, langchain) are installed"
    else
        log_error "Required Python packages are missing"
        exit 1
    fi
    
    log_success "Docker image validation passed!"
    log_info "Image is ready for Lambda deployment"
}

main "$@"
