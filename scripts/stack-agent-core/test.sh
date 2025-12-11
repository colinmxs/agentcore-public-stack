#!/bin/bash
set -euo pipefail

# Test script for Agent Core Stack
# Runs tests for the agent code

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_info "============================================"
log_info "Agent Core Stack - Run Tests"
log_info "============================================"

# Navigate to backend directory
BACKEND_DIR="${PROJECT_ROOT}/backend"
if [ ! -d "${BACKEND_DIR}" ]; then
    log_error "Backend directory not found: ${BACKEND_DIR}"
    exit 1
fi

cd "${BACKEND_DIR}"

log_info "Current directory: $(pwd)"

# Check if tests directory exists
TESTS_DIR="${BACKEND_DIR}/tests/agents"
if [ ! -d "${TESTS_DIR}" ]; then
    log_warn "Tests directory not found: ${TESTS_DIR}"
    log_warn "Creating placeholder tests directory..."
    mkdir -p "${TESTS_DIR}"
fi

# Check if there are any test files
if [ -z "$(find "${TESTS_DIR}" -name 'test_*.py' -o -name '*_test.py' 2>/dev/null)" ]; then
    log_warn "No test files found in ${TESTS_DIR}"
    log_info "Skipping tests (no test files present)"
    exit 0
fi

# Run tests with pytest
log_info "Running agent tests with pytest..."
if command -v pytest &> /dev/null; then
    pytest "${TESTS_DIR}" -v --tb=short
    TEST_EXIT_CODE=$?
    
    if [ ${TEST_EXIT_CODE} -eq 0 ]; then
        log_info "All tests passed successfully!"
    else
        log_error "Tests failed with exit code ${TEST_EXIT_CODE}"
        exit ${TEST_EXIT_CODE}
    fi
else
    log_error "pytest not found. Please install pytest: pip install pytest"
    exit 1
fi

log_info "============================================"
log_info "Agent Core tests completed successfully!"
log_info "============================================"
