#!/bin/bash
set -euo pipefail

# Script: Run Playwright E2E Tests Against a Deployed Nightly Stack
# Description: Installs Playwright browsers, resolves the frontend CloudFront
#              URL, and runs the full E2E suite using the CI-specific Playwright
#              config.
#
# Required environment variables:
#   CDK_PROJECT_PREFIX    — CDK project prefix (e.g. nightly-develop)
#   CDK_AWS_REGION        — AWS region for CloudFormation lookups
#   ADMIN_USERNAME        — Cognito admin test account username
#   ADMIN_PASSWORD        — Cognito admin test account password
#   USER_USERNAME         — Cognito regular user test account username
#   USER_PASSWORD         — Cognito regular user test account password
#
# The script resolves the frontend URL from:
#   1. SSM parameter /${CDK_PROJECT_PREFIX}/frontend/url (set by FrontendStack)
#   2. CloudFormation WebsiteUrl output from FrontendStack
#   3. CloudFormation DistributionDomainName output from FrontendStack

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FRONTEND_DIR="${PROJECT_ROOT}/frontend/ai.client"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

# ---------------------------------------------------------------------------
# Resolve the frontend URL of the deployed stack (CloudFront / S3)
# ---------------------------------------------------------------------------
get_base_url() {
    # Try SSM parameter first (set by FrontendStack)
    local ssm_key="/${CDK_PROJECT_PREFIX}/frontend/url"
    local frontend_url
    frontend_url=$(aws ssm get-parameter \
        --name "${ssm_key}" \
        --query "Parameter.Value" \
        --output text \
        --region "${CDK_AWS_REGION}" 2>/dev/null || true)

    if [ -n "${frontend_url}" ] && [ "${frontend_url}" != "None" ]; then
        # SSM value may already include https:// or may be a bare domain
        if [[ "${frontend_url}" == https://* ]]; then
            echo "${frontend_url}"
        else
            echo "https://${frontend_url}"
        fi
        return 0
    fi

    # Fallback: query CloudFormation WebsiteUrl output from FrontendStack
    local stack_name="${CDK_PROJECT_PREFIX}-FrontendStack"
    frontend_url=$(aws cloudformation describe-stacks \
        --stack-name "${stack_name}" \
        --query "Stacks[0].Outputs[?OutputKey=='WebsiteUrl'].OutputValue" \
        --output text \
        --region "${CDK_AWS_REGION}" 2>/dev/null || true)

    if [ -n "${frontend_url}" ] && [ "${frontend_url}" != "None" ]; then
        if [[ "${frontend_url}" == https://* ]]; then
            echo "${frontend_url}"
        else
            echo "https://${frontend_url}"
        fi
        return 0
    fi

    # Last resort: query CloudFront distribution domain from FrontendStack
    local cf_domain
    cf_domain=$(aws cloudformation describe-stacks \
        --stack-name "${stack_name}" \
        --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" \
        --output text \
        --region "${CDK_AWS_REGION}" 2>/dev/null || true)

    if [ -n "${cf_domain}" ] && [ "${cf_domain}" != "None" ]; then
        echo "https://${cf_domain}"
        return 0
    fi

    log_error "Could not resolve frontend URL from SSM (${ssm_key}) or FrontendStack outputs"
    return 1
}

# ---------------------------------------------------------------------------
# Patch Cognito App Client callback URLs to include the dynamic CloudFront URL
# ---------------------------------------------------------------------------
# The nightly stack has no custom domain, so the CloudFront distribution URL
# changes every run. Cognito rejects OAuth redirects to URLs not in its
# allowlist, so we must add the CloudFront URL before running auth tests.
# ---------------------------------------------------------------------------
patch_cognito_callback_urls() {
    local frontend_url="$1"
    local callback_url="${frontend_url}/auth/callback"
    local logout_url="${frontend_url}"

    # Fetch Cognito resource IDs from SSM
    local user_pool_id
    user_pool_id=$(aws ssm get-parameter \
        --name "/${CDK_PROJECT_PREFIX}/auth/cognito/user-pool-id" \
        --query "Parameter.Value" --output text \
        --region "${CDK_AWS_REGION}")

    local client_id
    client_id=$(aws ssm get-parameter \
        --name "/${CDK_PROJECT_PREFIX}/auth/cognito/app-client-id" \
        --query "Parameter.Value" --output text \
        --region "${CDK_AWS_REGION}")

    log_info "  User Pool ID: ${user_pool_id}"
    log_info "  Client ID:    ${client_id}"

    # Read current app client settings
    local current_config
    current_config=$(aws cognito-idp describe-user-pool-client \
        --user-pool-id "${user_pool_id}" \
        --client-id "${client_id}" \
        --region "${CDK_AWS_REGION}" \
        --output json)

    # Extract existing callback and logout URLs
    local existing_callbacks
    existing_callbacks=$(echo "${current_config}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
urls = data['UserPoolClient'].get('CallbackURLs', [])
print('\n'.join(urls))
")

    local existing_logouts
    existing_logouts=$(echo "${current_config}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
urls = data['UserPoolClient'].get('LogoutURLs', [])
print('\n'.join(urls))
")

    # Check if the CloudFront callback URL is already present
    if echo "${existing_callbacks}" | grep -qF "${callback_url}"; then
        log_info "  Callback URL already present — skipping patch"
        return 0
    fi

    # Build updated URL lists using python3 for reliable JSON construction
    local callbacks_json
    callbacks_json=$(echo "${current_config}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
urls = data['UserPoolClient'].get('CallbackURLs', [])
urls.append('${callback_url}')
print(json.dumps(urls))
")

    local logouts_json
    logouts_json=$(echo "${current_config}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
urls = data['UserPoolClient'].get('LogoutURLs', [])
new_url = '${logout_url}'
if new_url not in urls:
    urls.append(new_url)
print(json.dumps(urls))
")

    log_info "  Adding callback URL: ${callback_url}"
    log_info "  Adding logout URL:   ${logout_url}"

    # Extract current OAuth settings to preserve them
    local allowed_flows
    allowed_flows=$(echo "${current_config}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
flows = data['UserPoolClient'].get('AllowedOAuthFlows', [])
print(' '.join(flows))
")

    local allowed_scopes
    allowed_scopes=$(echo "${current_config}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
scopes = data['UserPoolClient'].get('AllowedOAuthScopes', [])
print(' '.join(scopes))
")

    # Update the app client with the new callback/logout URLs
    aws cognito-idp update-user-pool-client \
        --user-pool-id "${user_pool_id}" \
        --client-id "${client_id}" \
        --callback-urls "${callbacks_json}" \
        --logout-urls "${logouts_json}" \
        --allowed-o-auth-flows ${allowed_flows} \
        --allowed-o-auth-scopes ${allowed_scopes} \
        --allowed-o-auth-flows-user-pool-client \
        --supported-identity-providers COGNITO \
        --region "${CDK_AWS_REGION}" \
        --no-cli-pager > /dev/null

    log_success "  Cognito app client patched successfully"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    log_info "Starting Playwright E2E tests against deployed nightly stack..."

    # --- Validate required env vars ---
    local missing=()
    [ -z "${CDK_PROJECT_PREFIX:-}" ]  && missing+=("CDK_PROJECT_PREFIX")
    [ -z "${CDK_AWS_REGION:-}" ]      && missing+=("CDK_AWS_REGION")
    [ -z "${ADMIN_USERNAME:-}" ]      && missing+=("ADMIN_USERNAME")
    [ -z "${ADMIN_PASSWORD:-}" ]      && missing+=("ADMIN_PASSWORD")
    [ -z "${USER_USERNAME:-}" ]       && missing+=("USER_USERNAME")
    [ -z "${USER_PASSWORD:-}" ]       && missing+=("USER_PASSWORD")

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required environment variables: ${missing[*]}"
        exit 1
    fi

    # --- Resolve base URL ---
    log_info "Resolving deployed stack URL..."
    local base_url
    base_url=$(get_base_url)
    log_info "Base URL: ${base_url}"

    # --- Verify frontend is reachable ---
    log_info "Verifying frontend is reachable..."
    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" "${base_url}" --max-time 30 || echo "000")
    if [ "${response_code}" = "000" ]; then
        log_error "Frontend is not reachable at ${base_url} (connection failed)"
        exit 1
    fi
    log_info "Frontend responded with HTTP ${response_code}"

    # --- Ensure Cognito allows the dynamic CloudFront callback URL ---
    log_info "Patching Cognito app client with CloudFront callback URL..."
    patch_cognito_callback_urls "${base_url}"

    # --- Change to frontend directory ---
    cd "${FRONTEND_DIR}"

    # --- Check node_modules ---
    if [ ! -d "node_modules" ]; then
        log_error "node_modules not found. Frontend dependencies must be installed first."
        exit 1
    fi

    # --- Install Playwright browsers ---
    log_info "Installing Playwright browsers (chromium only)..."
    npx playwright install --with-deps chromium

    # --- Run E2E tests ---
    log_info "Running Playwright E2E tests..."
    log_info "  Config: playwright.ci.config.ts"
    log_info "  Base URL: ${base_url}"

    export E2E_BASE_URL="${base_url}"
    export CI=true

    # Run tests — allow failure so we can still upload artifacts
    local exit_code=0
    npx playwright test --config=playwright.ci.config.ts || exit_code=$?

    if [ ${exit_code} -eq 0 ]; then
        log_success "All E2E tests passed!"
    else
        log_error "E2E tests failed with exit code: ${exit_code}"
    fi

    # Report location is always relative to the config file
    if [ -d "playwright-report" ]; then
        log_info "HTML report generated: playwright-report/index.html"
    fi

    return ${exit_code}
}

main "$@"
