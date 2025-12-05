#!/bin/bash
set -euo pipefail

# Script: Test Docker Image for App API
# Description: Starts Docker container and validates health endpoint

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source common utilities
source "${PROJECT_ROOT}/scripts/common/load-env.sh"

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
    log_info "Testing Docker image..."
    
    # Configuration already loaded by sourcing load-env.sh
    IMAGE_NAME="${CDK_PROJECT_PREFIX}-app-api:latest"
    
    log_info "Testing Docker image: ${IMAGE_NAME}"
    
    # Start container in background
    CONTAINER_ID=$(docker run -d -p 8000:8000 "${IMAGE_NAME}")
    log_info "Container ID: ${CONTAINER_ID}"
    
    # Wait for container to be healthy
    log_info "Waiting for container to be healthy..."
    
    # Give container a moment to start up before checking
    sleep 3
    
    for i in {1..30}; do
        # Check if container is still running
        if ! docker ps | grep -q "${CONTAINER_ID}"; then
            log_error "Container exited unexpectedly"
            docker logs "${CONTAINER_ID}"
            exit 1
        fi
        
        # Try health check
        if curl -f http://localhost:8000/health 2>/dev/null; then
            log_success "Container is healthy"
            docker stop "${CONTAINER_ID}" > /dev/null
            log_success "Docker image test passed"
            exit 0
        fi
        
        sleep 2
    done
    
    log_error "Container health check timed out"
    docker logs "${CONTAINER_ID}"
    docker stop "${CONTAINER_ID}" > /dev/null 2>&1 || true
    exit 1
}

main "$@"
