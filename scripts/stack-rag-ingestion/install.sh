#!/bin/bash
set -euo pipefail

# Script: Install Dependencies for RAG Ingestion Stack
# Description: Installs Python and Node.js dependencies for the RAG Ingestion service

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"

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
    log_info "Installing RAG Ingestion Stack dependencies..."
    
    # ===========================================================
    # Install Python Dependencies
    # ===========================================================
    
    # Check if backend directory exists
    if [ ! -d "${BACKEND_DIR}" ]; then
        log_error "Backend directory not found: ${BACKEND_DIR}"
        exit 1
    fi
    
    # Change to backend directory
    cd "${BACKEND_DIR}"
    
    # Check if pyproject.toml exists
    if [ ! -f "pyproject.toml" ]; then
        log_error "pyproject.toml not found in ${BACKEND_DIR}"
        exit 1
    fi
    
    # Check if Python is installed
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 is not installed. Please install Python 3.9 or higher."
        exit 1
    fi
    
    # Display Python version
    PYTHON_VERSION=$(python3 --version)
    log_info "Using ${PYTHON_VERSION}"
    
    # Upgrade pip
    log_info "Upgrading pip..."
    python3 -m pip install --upgrade pip
    
    # Install the package and its dependencies
    log_info "Installing dependencies from pyproject.toml..."
    python3 -m pip install -e ".[agentcore,dev]"
    
    # Verify installation
    log_info "Verifying Python installation..."
    if python3 -c "import boto3" 2>/dev/null; then
        log_success "boto3 installed successfully"
    else
        log_error "boto3 installation verification failed"
        exit 1
    fi
    
    if python3 -c "import langchain" 2>/dev/null; then
        log_success "langchain installed successfully"
    else
        log_error "langchain installation verification failed"
        exit 1
    fi
    
    log_success "Python dependencies installed successfully!"
    
    # ===========================================================
    # Install CDK Dependencies
    # ===========================================================
    
    log_info "Installing CDK dependencies..."
    cd "${PROJECT_ROOT}/infrastructure"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        log_error "package.json not found in ${PROJECT_ROOT}/infrastructure"
        exit 1
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18 or higher."
        exit 1
    fi
    
    # Display Node.js version
    NODE_VERSION=$(node --version)
    log_info "Using Node.js ${NODE_VERSION}"
    
    # Install Node.js dependencies
    if [ -d "node_modules" ]; then
        log_info "node_modules already exists, skipping npm install"
    else
        log_info "Installing Node.js dependencies from package.json..."
        npm install
    fi
    
    # Verify CDK installation
    log_info "Verifying CDK installation..."
    if npm list aws-cdk-lib &> /dev/null; then
        log_success "aws-cdk-lib installed successfully"
    else
        log_error "aws-cdk-lib installation verification failed"
        exit 1
    fi
    
    log_success "CDK dependencies installed successfully!"
    log_success "All RAG Ingestion Stack dependencies installed successfully!"
}

main "$@"
