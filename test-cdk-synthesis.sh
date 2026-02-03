#!/bin/bash
# Test CDK Synthesis with New Configuration
# This script tests task 15.4 - CDK synthesis with environment-agnostic configuration

set -e

echo "========================================"
echo "Testing CDK Synthesis with New Config"
echo "========================================"
echo ""

# Set required CDK environment variables
echo "Setting required environment variables..."

export CDK_PROJECT_PREFIX="test-agentcore"
export CDK_AWS_ACCOUNT="123456789012"  # Test account ID
export CDK_AWS_REGION="us-west-2"

# Set optional environment variables
export CDK_RETAIN_DATA_ON_DELETE="false"  # Test with DESTROY policy
export CDK_FILE_UPLOAD_CORS_ORIGINS="http://localhost:4200,https://test.example.com"
export CDK_ASSISTANTS_CORS_ORIGINS="http://localhost:4200,https://test.example.com"
export CDK_RAG_CORS_ORIGINS="http://localhost:4200,https://test.example.com"

# Set other optional configuration
export CDK_APP_API_DESIRED_COUNT="1"
export CDK_APP_API_MAX_CAPACITY="5"
export CDK_APP_API_CPU="512"
export CDK_APP_API_MEMORY="1024"

export CDK_INFERENCE_API_DESIRED_COUNT="1"
export CDK_INFERENCE_API_MAX_CAPACITY="3"
export CDK_INFERENCE_API_CPU="1024"
export CDK_INFERENCE_API_MEMORY="2048"

export CDK_FRONTEND_ENABLED="true"
export CDK_APP_API_ENABLED="true"
export CDK_INFERENCE_API_ENABLED="true"
export CDK_GATEWAY_ENABLED="true"
export CDK_RAG_ENABLED="true"

# Set required Entra ID configuration (can be dummy values for synthesis test)
export CDK_ENTRA_CLIENT_ID="00000000-0000-0000-0000-000000000000"
export CDK_ENTRA_TENANT_ID="00000000-0000-0000-0000-000000000000"

# Display configuration
echo ""
echo "Configuration:"
echo "  Project Prefix: $CDK_PROJECT_PREFIX"
echo "  AWS Account: $CDK_AWS_ACCOUNT"
echo "  AWS Region: $CDK_AWS_REGION"
echo "  Retain Data on Delete: $CDK_RETAIN_DATA_ON_DELETE"
echo "  CORS Origins: $CDK_FILE_UPLOAD_CORS_ORIGINS"
echo ""

# Change to infrastructure directory
cd infrastructure

# Clean previous synthesis output
echo "Cleaning previous synthesis output..."
rm -rf cdk.out

# Synthesize all stacks
echo ""
echo "Synthesizing all CDK stacks..."
echo ""

STACKS=(
    "InfrastructureStack"
    "AppApiStack"
    "InferenceApiStack"
    "FrontendStack"
    "GatewayStack"
    "RagIngestionStack"
)

ALL_SUCCESS=true

for stack in "${STACKS[@]}"; do
    echo "Synthesizing $stack..."
    
    if npx cdk synth "$stack" > /tmp/cdk-synth-$stack.log 2>&1; then
        echo "  ✓ $stack synthesized successfully"
    else
        echo "  ✗ $stack synthesis failed"
        echo "  Error output:"
        tail -20 /tmp/cdk-synth-$stack.log | sed 's/^/    /'
        ALL_SUCCESS=false
    fi
done

# Verify CloudFormation templates were generated
echo ""
echo "Verifying CloudFormation templates..."

TEMPLATES_GENERATED=true
for stack in "${STACKS[@]}"; do
    template_path="cdk.out/$stack.template.json"
    if [ -f "$template_path" ]; then
        echo "  ✓ $template_path exists"
    else
        echo "  ✗ $template_path not found"
        TEMPLATES_GENERATED=false
    fi
done

# Analyze resource names in templates
echo ""
echo "Analyzing resource names in templates..."

RESOURCE_NAME_ISSUES=0

for stack in "${STACKS[@]}"; do
    template_path="cdk.out/$stack.template.json"
    if [ -f "$template_path" ]; then
        # Check for environment suffixes in resource names
        if grep -q "test-agentcore-dev-\|test-agentcore-test-\|test-agentcore-prod-" "$template_path"; then
            echo "  ✗ $stack contains environment suffixes (-dev, -test, -prod)"
            RESOURCE_NAME_ISSUES=$((RESOURCE_NAME_ISSUES + 1))
        fi
        
        # Check that resources use the project prefix
        if grep -q "test-agentcore-" "$template_path"; then
            echo "  ✓ $stack uses project prefix correctly"
        else
            echo "  ⚠ $stack may not be using project prefix"
        fi
    fi
done

# Check removal policies
echo ""
echo "Checking removal policies..."

for stack in "${STACKS[@]}"; do
    template_path="cdk.out/$stack.template.json"
    if [ -f "$template_path" ]; then
        # Look for DynamoDB tables and S3 buckets with deletion policies
        if grep -q '"Type": "AWS::DynamoDB::Table"\|"Type": "AWS::S3::Bucket"' "$template_path"; then
            if grep -q '"DeletionPolicy": "Delete"' "$template_path"; then
                echo "  ✓ $stack has Delete policy (retainDataOnDelete=false)"
            elif grep -q '"DeletionPolicy": "Retain"' "$template_path"; then
                echo "  ⚠ $stack has Retain policy (expected Delete)"
            else
                echo "  ⚠ $stack has no explicit deletion policy"
            fi
        else
            echo "  - $stack has no data resources to check"
        fi
    fi
done

# Summary
echo ""
echo "========================================"
echo "Synthesis Test Summary"
echo "========================================"

if [ "$ALL_SUCCESS" = true ] && [ "$TEMPLATES_GENERATED" = true ] && [ "$RESOURCE_NAME_ISSUES" -eq 0 ]; then
    echo "✓ All tests passed!"
    echo "  - All stacks synthesized successfully"
    echo "  - CloudFormation templates generated"
    echo "  - Resource names follow expected pattern"
    echo "  - No environment suffixes found"
    exit 0
else
    echo "✗ Some tests failed:"
    
    if [ "$ALL_SUCCESS" = false ]; then
        echo "  - Stack synthesis failures detected"
    fi
    
    if [ "$TEMPLATES_GENERATED" = false ]; then
        echo "  - Some CloudFormation templates not generated"
    fi
    
    if [ "$RESOURCE_NAME_ISSUES" -gt 0 ]; then
        echo "  - Resource naming issues found"
    fi
    
    exit 1
fi
