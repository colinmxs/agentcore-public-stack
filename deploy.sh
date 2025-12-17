#!/bin/bash

###############################################################################
# AWS CDK Multi-Stack Deployment Orchestration Script
# 
# Description: Interactive deployment menu for AWS CDK stacks
# Usage: ./deploy.sh [--dry-run]
#
# Stacks:
#   1. Infrastructure Stack - VPC, ALB, ECS Cluster, Security Groups
#   2. App API Stack - Application API on Fargate
#   3. Inference API Stack - AgentCore Runtime with Memory & Tools
#   4. Gateway Stack - MCP Gateway with Lambda tools
#   5. Frontend Stack - S3 + CloudFront + Route53
#
###############################################################################

set -euo pipefail

# Detect project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_ROOT

# Source environment configuration
source "${PROJECT_ROOT}/scripts/common/load-env.sh"

# Define logging functions locally
log_success() {
    echo -e "\033[0;32m✓ $1\033[0m"
}

log_warning() {
    echo -e "\033[1;33m⚠ $1\033[0m"
}

log_error() {
    echo -e "\033[0;31m✗ $1\033[0m"
}

log_info() {
    echo -e "\033[0;34mℹ $1\033[0m"
}

log_header() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  $1"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
}

# Global dry-run flag
DRY_RUN=false

###############################################################################
# Parse command-line arguments
###############################################################################
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                log_warning "DRY-RUN MODE: Commands will be displayed but not executed"
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

###############################################################################
# Show usage information
###############################################################################
show_usage() {
    cat << EOF
Usage: ./deploy.sh [OPTIONS]

Interactive deployment orchestration for AWS CDK stacks.

OPTIONS:
    --dry-run       Show what would be deployed without executing
    -h, --help      Show this help message

STACKS:
    1. Infrastructure Stack - Foundation layer (VPC, ALB, ECS Cluster)
    2. App API Stack        - Application API on Fargate
    3. Inference API Stack  - AgentCore Runtime with Memory & Tools
    4. Gateway Stack        - MCP Gateway with Lambda tools
    5. Frontend Stack       - S3 + CloudFront + Route53

EXAMPLES:
    ./deploy.sh              # Interactive menu
    ./deploy.sh --dry-run    # Preview deployment without executing

EOF
}

###############################################################################
# Environment validation
###############################################################################
validate_environment() {
    log_header "Validating Environment"
    
    local errors=0
    
    # Check required environment variables
    if [ -z "${CDK_AWS_ACCOUNT:-}" ]; then
        log_error "CDK_AWS_ACCOUNT is not set"
        ((errors++))
    else
        log_success "CDK_AWS_ACCOUNT: ${CDK_AWS_ACCOUNT}"
    fi
    
    if [ -z "${CDK_AWS_REGION:-}" ]; then
        log_error "CDK_AWS_REGION is not set"
        ((errors++))
    else
        log_success "CDK_AWS_REGION: ${CDK_AWS_REGION}"
    fi
    
    if [ -z "${CDK_PROJECT_PREFIX:-}" ]; then
        log_error "CDK_PROJECT_PREFIX is not set"
        ((errors++))
    else
        log_success "CDK_PROJECT_PREFIX: ${CDK_PROJECT_PREFIX}"
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        log_error "AWS credentials are not configured or invalid"
        log_info "Run 'aws configure' or set AWS environment variables"
        ((errors++))
    else
        local caller_identity=$(aws sts get-caller-identity --query 'Arn' --output text 2>/dev/null || echo "Unknown")
        log_success "AWS credentials valid: ${caller_identity}"
    fi
    
    # Check if CDK is installed
    if ! command -v cdk &>/dev/null; then
        log_error "AWS CDK CLI is not installed"
        log_info "Run: npm install -g aws-cdk"
        ((errors++))
    else
        local cdk_version=$(cdk --version 2>/dev/null || echo "Unknown")
        log_success "AWS CDK installed: ${cdk_version}"
    fi
    
    # Check if required directories exist
    if [ ! -d "${PROJECT_ROOT}/infrastructure" ]; then
        log_error "Infrastructure directory not found: ${PROJECT_ROOT}/infrastructure"
        ((errors++))
    else
        log_success "Infrastructure directory found"
    fi
    
    if [ ! -d "${PROJECT_ROOT}/scripts" ]; then
        log_error "Scripts directory not found: ${PROJECT_ROOT}/scripts"
        ((errors++))
    else
        log_success "Scripts directory found"
    fi
    
    if [ $errors -gt 0 ]; then
        log_error "Environment validation failed with ${errors} error(s)"
        return 1
    fi
    
    log_success "Environment validation passed"
    return 0
}

###############################################################################
# Execute command with dry-run support
###############################################################################
execute_command() {
    local description=$1
    shift
    local command=("$@")
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] ${description}"
        log_info "[DRY-RUN] Command: ${command[*]}"
    else
        log_info "${description}"
        "${command[@]}"
    fi
}

###############################################################################
# Stack deployment functions
###############################################################################

deploy_infrastructure() {
    log_header "Deploying Infrastructure Stack"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would deploy Infrastructure Stack (VPC, ALB, ECS Cluster)"
        log_info "[DRY-RUN] Script: ${PROJECT_ROOT}/scripts/stack-infrastructure/deploy.sh"
        return 0
    fi
    
    if [ ! -f "${PROJECT_ROOT}/scripts/stack-infrastructure/deploy.sh" ]; then
        log_error "Deploy script not found: ${PROJECT_ROOT}/scripts/stack-infrastructure/deploy.sh"
        return 1
    fi
    
    bash "${PROJECT_ROOT}/scripts/stack-infrastructure/deploy.sh"
    
    if [ $? -eq 0 ]; then
        log_success "Infrastructure Stack deployed successfully"
        return 0
    else
        log_error "Infrastructure Stack deployment failed"
        return 1
    fi
}

deploy_app_api() {
    log_header "Deploying App API Stack"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would deploy App API Stack (Fargate service)"
        log_info "[DRY-RUN] Script: ${PROJECT_ROOT}/scripts/stack-app-api/deploy.sh"
        return 0
    fi
    
    if [ ! -f "${PROJECT_ROOT}/scripts/stack-app-api/deploy.sh" ]; then
        log_error "Deploy script not found: ${PROJECT_ROOT}/scripts/stack-app-api/deploy.sh"
        return 1
    fi
    
    bash "${PROJECT_ROOT}/scripts/stack-app-api/deploy.sh"
    
    if [ $? -eq 0 ]; then
        log_success "App API Stack deployed successfully"
        return 0
    else
        log_error "App API Stack deployment failed"
        return 1
    fi
}

deploy_inference_api() {
    log_header "Deploying Inference API Stack"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would deploy Inference API Stack (AgentCore Runtime)"
        log_info "[DRY-RUN] Script: ${PROJECT_ROOT}/scripts/stack-inference-api/deploy.sh"
        return 0
    fi
    
    if [ ! -f "${PROJECT_ROOT}/scripts/stack-inference-api/deploy.sh" ]; then
        log_error "Deploy script not found: ${PROJECT_ROOT}/scripts/stack-inference-api/deploy.sh"
        return 1
    fi
    
    bash "${PROJECT_ROOT}/scripts/stack-inference-api/deploy.sh"
    
    if [ $? -eq 0 ]; then
        log_success "Inference API Stack deployed successfully"
        return 0
    else
        log_error "Inference API Stack deployment failed"
        return 1
    fi
}

deploy_gateway() {
    log_header "Deploying Gateway Stack"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would deploy Gateway Stack (MCP Gateway with Lambda tools)"
        log_info "[DRY-RUN] Script: ${PROJECT_ROOT}/scripts/stack-gateway/deploy.sh"
        return 0
    fi
    
    if [ ! -f "${PROJECT_ROOT}/scripts/stack-gateway/deploy.sh" ]; then
        log_error "Deploy script not found: ${PROJECT_ROOT}/scripts/stack-gateway/deploy.sh"
        return 1
    fi
    
    bash "${PROJECT_ROOT}/scripts/stack-gateway/deploy.sh"
    
    if [ $? -eq 0 ]; then
        log_success "Gateway Stack deployed successfully"
        return 0
    else
        log_error "Gateway Stack deployment failed"
        return 1
    fi
}

deploy_frontend() {
    log_header "Deploying Frontend Stack"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would deploy Frontend Stack (S3 + CloudFront)"
        log_info "[DRY-RUN] Script: ${PROJECT_ROOT}/scripts/stack-frontend/deploy-cdk.sh"
        log_info "[DRY-RUN] Script: ${PROJECT_ROOT}/scripts/stack-frontend/deploy-assets.sh"
        return 0
    fi
    
    if [ ! -f "${PROJECT_ROOT}/scripts/stack-frontend/deploy-cdk.sh" ]; then
        log_error "Deploy script not found: ${PROJECT_ROOT}/scripts/stack-frontend/deploy-cdk.sh"
        return 1
    fi
    
    if [ ! -f "${PROJECT_ROOT}/scripts/stack-frontend/deploy-assets.sh" ]; then
        log_error "Deploy script not found: ${PROJECT_ROOT}/scripts/stack-frontend/deploy-assets.sh"
        return 1
    fi
    
    # Deploy CDK infrastructure first
    bash "${PROJECT_ROOT}/scripts/stack-frontend/deploy-cdk.sh"
    if [ $? -ne 0 ]; then
        log_error "Frontend CDK deployment failed"
        return 1
    fi
    
    # Deploy assets to S3
    bash "${PROJECT_ROOT}/scripts/stack-frontend/deploy-assets.sh"
    if [ $? -ne 0 ]; then
        log_error "Frontend assets deployment failed"
        return 1
    fi
    
    log_success "Frontend Stack deployed successfully"
    return 0
}

deploy_all() {
    log_header "Deploying All Stacks"
    
    log_info "Deployment order: Infrastructure → App API → Inference API → Gateway → Frontend"
    
    if [ "$DRY_RUN" = false ]; then
        read -p "Are you sure you want to deploy all stacks? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_warning "Deployment cancelled by user"
            return 0
        fi
    fi
    
    # Deploy stacks in dependency order
    local failed_stacks=()
    
    # 1. Infrastructure (foundation)
    if ! deploy_infrastructure; then
        failed_stacks+=("Infrastructure")
    fi
    
    # 2. App API (depends on Infrastructure)
    if ! deploy_app_api; then
        failed_stacks+=("App API")
    fi
    
    # 3. Inference API (depends on Infrastructure)
    if ! deploy_inference_api; then
        failed_stacks+=("Inference API")
    fi
    
    # 4. Gateway (independent, but Inference API integrates with it)
    if ! deploy_gateway; then
        failed_stacks+=("Gateway")
    fi
    
    # 5. Frontend (independent)
    if ! deploy_frontend; then
        failed_stacks+=("Frontend")
    fi
    
    # Summary
    echo ""
    log_header "Deployment Summary"
    
    if [ ${#failed_stacks[@]} -eq 0 ]; then
        log_success "All stacks deployed successfully!"
    else
        log_error "Failed stacks: ${failed_stacks[*]}"
        return 1
    fi
}

###############################################################################
# Interactive menu
###############################################################################
show_menu() {
    clear
    cat << EOF

╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   AWS CDK Multi-Stack Deployment Orchestration                ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

Current Configuration:
  Project Prefix: ${CDK_PROJECT_PREFIX}
  AWS Account:    ${CDK_AWS_ACCOUNT}
  AWS Region:     ${CDK_AWS_REGION}
  Dry-Run Mode:   ${DRY_RUN}

Deployment Options:

  1) Deploy Infrastructure Stack    (VPC, ALB, ECS Cluster)
  2) Deploy App API Stack           (Application API on Fargate)
  3) Deploy Inference API Stack     (AgentCore Runtime)
  4) Deploy Gateway Stack           (MCP Gateway with Lambda)
  5) Deploy Frontend Stack          (S3 + CloudFront)
  
  6) Deploy All Stacks              (Full deployment in order)
  
  7) Exit

EOF
    
    read -p "Select an option (1-7): " choice
    echo ""
}

###############################################################################
# Main menu loop
###############################################################################
main_menu() {
    while true; do
        show_menu
        
        case $choice in
            1)
                deploy_infrastructure
                ;;
            2)
                deploy_app_api
                ;;
            3)
                deploy_inference_api
                ;;
            4)
                deploy_gateway
                ;;
            5)
                deploy_frontend
                ;;
            6)
                deploy_all
                ;;
            7)
                log_info "Exiting deployment orchestration"
                exit 0
                ;;
            *)
                log_error "Invalid option: ${choice}"
                ;;
        esac
        
        echo ""
        read -p "Press Enter to continue..."
    done
}

###############################################################################
# Main execution
###############################################################################
main() {
    # Parse command-line arguments
    parse_arguments "$@"
    
    # Show header
    log_header "AWS CDK Multi-Stack Deployment Orchestration"
    
    # Validate environment
    if ! validate_environment; then
        log_error "Environment validation failed. Please fix the errors above."
        exit 1
    fi
    
    # Start interactive menu
    main_menu
}

# Run main function
main "$@"
