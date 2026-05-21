#!/usr/bin/env bash
# scripts/frontend/build.sh — build the Angular SPA for production.
# Preserves the gen-version.js prebuild fix from beta.27.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/load-env.sh"

cd "$SCRIPT_DIR/../../frontend/ai.client"
npm ci --prefer-offline

# Run gen-version.js explicitly (the npm prebuild hook doesn't fire
# when ng build is invoked directly by scripts).
node scripts/gen-version.js || true

npm run build -- --configuration production
