#!/usr/bin/env bash
# scripts/frontend/deploy.sh — sync SPA build artifacts to S3 + invalidate CloudFront.
# Reads bucket name and distribution ID from SSM.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/load-env.sh"

: "${CDK_PROJECT_PREFIX:?CDK_PROJECT_PREFIX is required}"
: "${AWS_REGION:?AWS_REGION is required}"

BUCKET_NAME=$(aws ssm get-parameter \
  --name "/${CDK_PROJECT_PREFIX}/frontend/bucket-name" \
  --region "$AWS_REGION" \
  --query 'Parameter.Value' --output text)

DISTRIBUTION_ID=$(aws ssm get-parameter \
  --name "/${CDK_PROJECT_PREFIX}/frontend/distribution-id" \
  --region "$AWS_REGION" \
  --query 'Parameter.Value' --output text)

echo "Syncing to s3://${BUCKET_NAME}..."
aws s3 sync "$SCRIPT_DIR/../../frontend/ai.client/dist/ai.client/" \
  "s3://${BUCKET_NAME}/" --delete --region "$AWS_REGION"

echo "Invalidating CloudFront distribution ${DISTRIBUTION_ID}..."
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" --query 'Invalidation.Id' --output text

echo "Frontend deploy complete."
