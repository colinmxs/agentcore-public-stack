#!/usr/bin/env bash
# scripts/platform/synth.sh — synthesize PlatformStack.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/load-env.sh"

cd "$SCRIPT_DIR/../../infrastructure"
npm ci --prefer-offline
npx cdk synth "${CDK_PROJECT_PREFIX}-PlatformStack"
