# Deployment Architecture

## How Updates Work

Each service has a different update mechanism. Deploy scripts MUST trigger the appropriate update method after pushing new code.

### App API (ECS Fargate)

**Service**: FastAPI application on ECS Fargate  
**Update Method**: `aws ecs update-service --force-new-deployment`

**Deploy Script Requirements**:
1. Push new image to ECR with git SHA tag
2. Run `cdk deploy AppApiStack` (updates task definition)
3. Parse `EcsClusterName` and `EcsServiceName` from CDK outputs
4. Call `aws ecs update-service --force-new-deployment`

**Critical**: ECS does NOT automatically detect new images. Without step 4, the service continues running old containers indefinitely.

**CDK Stack Requirements**:
- Must export `EcsClusterName` in CloudFormation outputs
- Must export `EcsServiceName` in CloudFormation outputs

### Inference API (AgentCore Runtime)

**Service**: Strands Agent on AWS Bedrock AgentCore Runtime (managed ECS)  
**Update Method**: SSM parameter change triggers Lambda

**Deploy Script Requirements**:
1. Push new image to ECR with git SHA tag
2. Run `cdk deploy InferenceApiStack`
3. Update SSM parameter: `/${PROJECT_PREFIX}/inference-api/image-tag` with new IMAGE_TAG

**Automatic Process**:
1. EventBridge detects SSM parameter change
2. Triggers `runtime-updater` Lambda function
3. Lambda queries all auth providers with runtimes
4. Updates all runtimes in parallel (max 5 concurrent)
5. Sends SNS notification with results

**Critical**: Without step 3, the runtime-updater Lambda never triggers and all AgentCore Runtimes continue running old images.

### Gateway (Lambda Functions)

**Service**: MCP tool endpoints as Lambda functions  
**Update Method**: Automatic via CDK deploy

**Deploy Script Requirements**:
1. Run `cdk deploy GatewayStack`

**Automatic**: Lambda functions are updated immediately when CDK deploys new code. No manual trigger needed.

### Frontend (CloudFront + S3)

**Service**: Angular SPA served via CloudFront  
**Update Method**: S3 sync + CloudFront invalidation

**Deploy Script Requirements**:
1. Build Angular app (`npm run build`)
2. Sync to S3 bucket
3. Invalidate CloudFront cache

## Common Pitfalls

### Missing CDK Outputs

If deploy scripts can't parse cluster/service names from CDK outputs, they silently skip the update step.

**Symptoms**: Deployment succeeds but changes don't appear in running service.

**Fix**: Ensure CDK stack exports all required values as `CfnOutput`.

### Wrong jq Query Path

CDK outputs use full stack name as key (e.g., `"dev-boisestateai-v2-AppApiStack"`), not just `"AppApiStack"`.

**Wrong**: `.AppApiStack.EcsClusterName`  
**Right**: `.[] | .EcsClusterName` (extracts from first stack object)

### Forgetting SSM Parameter Update

The runtime-updater Lambda only triggers on SSM parameter changes. Pushing a new image to ECR alone does nothing.

**Symptoms**: Inference API deployment succeeds, image is in ECR, but runtimes serve old responses.

**Fix**: Always update `/${PROJECT_PREFIX}/inference-api/image-tag` after pushing new image.

## Verification

After deployment, verify updates took effect:

### App API
```bash
# Check ECS task definition revision increased
aws ecs describe-services \
  --cluster ${CLUSTER_NAME} \
  --services ${SERVICE_NAME} \
  --query 'services[0].taskDefinition'

# Check running tasks are using new image
aws ecs describe-tasks \
  --cluster ${CLUSTER_NAME} \
  --tasks $(aws ecs list-tasks --cluster ${CLUSTER_NAME} --service-name ${SERVICE_NAME} --query 'taskArns[0]' --output text) \
  --query 'tasks[0].containers[0].image'
```

### Inference API
```bash
# Check SSM parameter was updated
aws ssm get-parameter \
  --name /${PROJECT_PREFIX}/inference-api/image-tag \
  --query 'Parameter.Value'

# Check runtime-updater Lambda logs
aws logs tail /aws/lambda/${PROJECT_PREFIX}-runtime-updater --follow

# Check runtime status in DynamoDB
aws dynamodb scan \
  --table-name ${PROJECT_PREFIX}-auth-providers \
  --projection-expression "provider_id,runtime_status,runtime_arn"
```

### Gateway
```bash
# Check Lambda function code SHA
aws lambda get-function \
  --function-name ${PROJECT_PREFIX}-mcp-wikipedia \
  --query 'Configuration.CodeSha256'
```

## Debugging Stale Deployments

If changes don't appear after deployment:

1. **Check if image was pushed to ECR**
   ```bash
   aws ecr describe-images \
     --repository-name ${PROJECT_PREFIX}-app-api \
     --image-ids imageTag=${IMAGE_TAG}
   ```

2. **Check if CDK outputs file exists and has correct structure**
   ```bash
   cat cdk-outputs-app-api.json | jq '.'
   ```

3. **Check deploy script logs for update step**
   - Look for "Forcing new deployment" (App API)
   - Look for "SSM parameter updated" (Inference API)

4. **Manually trigger update if needed**
   ```bash
   # App API
   aws ecs update-service \
     --cluster ${CLUSTER_NAME} \
     --service ${SERVICE_NAME} \
     --force-new-deployment

   # Inference API
   aws ssm put-parameter \
     --name /${PROJECT_PREFIX}/inference-api/image-tag \
     --value ${IMAGE_TAG} \
     --overwrite
   ```
