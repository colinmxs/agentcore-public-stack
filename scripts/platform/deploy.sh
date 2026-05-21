#!/usr/bin/env bash
# scripts/platform/deploy.sh — deploy PlatformStack via CDK.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/load-env.sh"

cd "$SCRIPT_DIR/../../infrastructure"
npm ci --prefer-offline
npx cdk deploy "${CDK_PROJECT_PREFIX}-PlatformStack" \
  --require-approval never \
  --outputs-file cdk-outputs-platform.json
