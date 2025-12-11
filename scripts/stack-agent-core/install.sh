#!/bin/bash
set -euo pipefail

# Install script for Agent Core Stack
# This script installs Python dependencies for the agent code

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
log_info "Agent Core Stack - Install Dependencies"
log_info "============================================"

# Navigate to backend directory
BACKEND_DIR="${PROJECT_ROOT}/backend"
if [ ! -d "${BACKEND_DIR}" ]; then
    log_error "Backend directory not found: ${BACKEND_DIR}"
    exit 1
fi

cd "${BACKEND_DIR}"

log_info "Current directory: $(pwd)"

# Check if pyproject.toml exists
if [ ! -f "pyproject.toml" ]; then
    log_error "pyproject.toml not found in ${BACKEND_DIR}"
    exit 1
fi

# Install Python dependencies
log_info "Installing Python dependencies from pyproject.toml..."
if command -v pip3 &> /dev/null; then
    pip3 install -e ".[agentcore]" --quiet
    log_info "Python dependencies installed successfully"
else
    log_error "pip3 not found. Please install Python 3 and pip."
    exit 1
fi

# Verify installation
log_info "Verifying installation..."
python3 -c "import agents" 2>/dev/null && log_info "✓ agents package is importable" || log_warn "⚠ agents package may not be properly installed"

log_info "============================================"
log_info "Agent Core dependencies installed successfully!"
log_info "============================================"
