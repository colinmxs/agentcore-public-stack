# Multi-Runtime Authentication Providers - Design

## Architecture Overview

### Core Concept

Deploy a separate AWS Bedrock AgentCore Runtime instance for each OIDC authentication provider. Each runtime is configured with its provider's specific JWT authorizer (issuer URL, client ID, JWKS URI). When an admin adds a provider via the UI, a Lambda function automatically provisions the corresponding runtime.

### Key Insight

AWS Bedrock AgentCore supports multiple runtime instances per account (quota: 1,000), and each runtime can have its own independent JWT authorizer configuration. This enables a "runtime per provider" architecture where each provider gets native JWT validation without requiring a proxy layer.

### High-Level Flow

```
Admin creates provider in UI
        ↓
App API saves to DynamoDB
        ↓
DynamoDB Stream triggers Lambda
        ↓
Lambda provisions AgentCore Runtime
        ↓
Runtime ARN stored in DynamoDB
        ↓
User authenticates with provider
        ↓
Frontend fetches runtime endpoint URL
        ↓
Frontend calls runtime directly
        ↓
Runtime validates JWT and processes request
```

## Component Architecture

### 1. DynamoDB Auth Providers Table

**Purpose**: Store provider configuration and runtime tracking information

**Schema Extensions**:

```python
# New fields added to AuthProvider model
agentcore_runtime_arn: Optional[str] = None          # ARN of the provisioned runtime
agentcore_runtime_id: Optional[str] = None           # Runtime ID for API calls
agentcore_runtime_endpoint_url: Optional[str] = None # Runtime endpoint URL
agentcore_runtime_status: str = "PENDING"            # PENDING | CREATING | READY | UPDATING | FAILED | UPDATE_FAILED
agentcore_runtime_error: Optional[str] = None        # Error message if provisioning fails
```

**DynamoDB Streams**: Enabled with `NEW_AND_OLD_IMAGES` to capture all changes for Lambda processing.

### 2. Runtime Provisioner Lambda

**Purpose**: Automatically create, update, and delete AgentCore Runtimes based on provider changes

**Trigger**: DynamoDB Streams on Auth Providers table

**Event Handling**:
- `INSERT`: Create new runtime with provider's JWT config
- `MODIFY`: Update runtime if JWT-relevant fields changed (issuer, client ID, JWKS URI)
- `REMOVE`: Delete runtime and clean up SSM parameters

**Runtime Creation Process**:
1. Extract provider details from DynamoDB stream event
2. Fetch current container image tag from SSM
3. Construct runtime name: `{projectPrefix}_agentcore_runtime_{provider_id}`
4. Determine discovery URL from issuer URL or JWKS URI
5. Call `bedrock-agentcore-control:CreateAgentRuntime` with:
   - Container image URI from ECR
   - JWT authorizer config (discovery URL, allowed audience)
   - Shared resource references (Memory ARN, Gateway ID, Code Interpreter ID, Browser ID)
   - Runtime execution role ARN
   - Environment variables
6. Store runtime ARN, ID, and endpoint URL in DynamoDB
7. Store runtime ARN in SSM for cross-stack reference

**Error Handling**:
- Catch all exceptions during runtime creation
- Update DynamoDB with `FAILED` status and error message
- Log detailed error information to CloudWatch
- Retry logic handled by Lambda DynamoDB Stream integration (3 attempts)

### 3. Runtime Updater Lambda

**Purpose**: Automatically update all provider runtimes when new container images are deployed

**Trigger**: EventBridge rule detecting SSM parameter changes for `/inference-api/image-tag`

**Update Process**:
1. Detect SSM parameter change event from EventBridge
2. Fetch new image tag from SSM
3. Query DynamoDB for all providers with existing runtimes
4. Get new container URI from ECR
5. Update each runtime in parallel (max 5 concurrent):
   - Fetch current runtime configuration
   - Call `UpdateAgentRuntime` with new container image
   - Preserve all other configuration (JWT auth, network, environment)
   - Retry up to 3 times with exponential backoff (2s, 4s, 8s)
6. Update DynamoDB status for each provider (UPDATING or UPDATE_FAILED)
7. Send SNS notification summary with success/failure counts

**Retry Logic**:
- 3 attempts per runtime with exponential backoff
- Individual runtime failures don't affect others
- Failed runtimes marked in DynamoDB with error details
- SNS alert sent for each persistent failure

### 4. Frontend Runtime Selection Strategy

**Approach**: Direct Runtime Invocation (No ALB Routing)

**Key Insight**: AgentCore Runtimes are AWS-managed services with their own HTTPS API endpoints. The frontend calls these endpoints directly using the AWS Bedrock API, not through an ALB.

**Current Architecture**:
```
Frontend → AgentCore Runtime HTTPS Endpoint → JWT Validation → Process Request
```

**Endpoint Format**:
```
https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{runtime-arn}/invocations
```

**Implementation**:
1. Frontend determines user's auth provider from JWT token or auth service
2. Frontend fetches runtime endpoint URL for that provider from App API
3. Frontend calls the provider-specific runtime endpoint directly
4. Runtime validates JWT using its configured authorizer

**Frontend Flow**:
```typescript
// 1. Get user's provider ID from auth service
const providerId = this.authService.getProviderId(); // e.g., "entra-id"

// 2. Fetch runtime endpoint URL for this provider
const runtimeEndpoint = await this.apiService.getRuntimeEndpoint(providerId);
// Returns: "https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn:aws:bedrock-agentcore:us-east-1:123456789012:agent/abc-123/invocations"

// 3. Call the runtime endpoint directly
const response = await fetch(runtimeEndpoint, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});
```

**App API Endpoint** (new):
```python
@router.get("/auth/runtime-endpoint")
async def get_runtime_endpoint(current_user: User = Depends(get_current_user)):
    """Get the AgentCore Runtime endpoint URL for the user's auth provider."""
    # Get user's provider ID from JWT claims or user record
    provider_id = current_user.provider_id
    
    # Fetch provider from DynamoDB
    provider = await provider_repo.get_provider(provider_id)
    
    if not provider or not provider.agentcore_runtime_endpoint_url:
        raise HTTPException(status_code=404, detail="Runtime not found for provider")
    
    return {
        "runtime_endpoint_url": provider.agentcore_runtime_endpoint_url,
        "provider_id": provider_id,
    }
```

**Why No ALB Routing**:
- AgentCore Runtimes are AWS-managed services, not EC2/Fargate targets
- They have their own HTTPS endpoints managed by AWS
- Cannot be added to ALB target groups
- Frontend calls them directly via AWS Bedrock API

### 5. Shared Resources

All runtimes share these AgentCore resources (created once in Inference API Stack):

- **AgentCore Memory**: Single instance for conversation persistence
- **AgentCore Gateway**: Single instance for MCP tool integration
- **Code Interpreter Custom**: Single instance for code execution
- **Browser Custom**: Single instance for web automation
- **DynamoDB Tables**: Users, roles, tools, sessions, costs, quotas
- **S3 Buckets**: File uploads, vector storage
- **IAM Execution Role**: Shared role with permissions for all resources

**Benefits of Sharing**:
- Cost efficiency (no duplication of expensive resources)
- Consistent user experience across providers
- Simplified resource management
- Centralized data storage

### 6. Runtime Naming Convention

**Format**: `{projectPrefix}_agentcore_runtime_{provider_id}`

**Rules**:
- Replace hyphens with underscores (AgentCore requirement)
- Use provider ID from database
- Include project prefix for multi-tenant isolation

**Examples**:
- `bsu_agentcore_runtime_entra_id`
- `bsu_agentcore_runtime_okta_prod`
- `bsu_agentcore_runtime_google_workspace`

## Data Flow

### Provider Creation Flow

```
1. Admin submits provider form in UI
   ↓
2. Frontend POST /admin/auth-providers
   ↓
3. App API validates and saves to DynamoDB
   ↓
4. DynamoDB Stream emits INSERT event
   ↓
5. Runtime Provisioner Lambda triggered
   ↓
6. Lambda calls CreateAgentRuntime API
   ↓
7. AgentCore provisions runtime (2-5 minutes)
   ↓
8. Lambda stores runtime ARN in DynamoDB
   ↓
9. Lambda stores runtime ARN in SSM
   ↓
10. Admin UI polls for status updates
    ↓
11. Status changes: PENDING → CREATING → READY
```

### User Authentication Flow

```
1. User authenticates with their provider (Entra ID, Okta, etc.)
   ↓
2. Frontend receives JWT token
   ↓
3. Frontend extracts provider ID from token or auth service
   ↓
4. Frontend fetches runtime endpoint URL from App API
   ↓
5. Frontend calls provider-specific runtime endpoint directly
   ↓
6. Runtime validates JWT using provider's JWKS
   ↓
7. Runtime processes request and returns response
```

### Container Image Update Flow

```
1. CI/CD builds new Docker image
   ↓
2. Image pushed to ECR with new tag
   ↓
3. CDK deployment updates SSM parameter
   ↓
4. EventBridge detects SSM parameter change
   ↓
5. Runtime Updater Lambda triggered
   ↓
6. Lambda queries all providers with runtimes
   ↓
7. Lambda updates runtimes in parallel (max 5 concurrent)
   ↓
8. Each runtime restarts with new image (2-5 min)
   ↓
9. DynamoDB updated with status for each provider
   ↓
10. SNS notification sent if any failures
```

## Infrastructure Components

### New CDK Stack: RuntimeProvisionerStack

**Purpose**: Deploy Lambda functions and supporting infrastructure for runtime management

**Resources**:
- Runtime Provisioner Lambda function
- Runtime Updater Lambda function
- EventBridge rule for SSM parameter changes
- SNS topic for alerts
- IAM roles and policies
- CloudWatch dashboard for monitoring
- CloudWatch alarms for failures

**Dependencies**:
- App API Stack (DynamoDB table, stream ARN)
- Inference API Stack (shared resource ARNs, execution role ARN)
- Infrastructure Stack (VPC, security groups)

**Deployment Order**: After App API Stack and Inference API Stack

### Modified Stack: AppApiStack

**Changes**:
1. Enable DynamoDB Streams on Auth Providers table
2. Export stream ARN to SSM for Lambda trigger
3. Update AuthProvider model with runtime tracking fields
4. Add new endpoint: `GET /auth/runtime-endpoint` to return runtime URL for user's provider

### Modified Stack: InferenceApiStack

**Changes**:
1. Remove single runtime creation (now handled by Lambda)
2. Keep shared resources (Memory, Gateway, Code Interpreter, Browser)
3. Export runtime execution role ARN to SSM
4. Export shared resource ARNs to SSM (if not already exported)

### Modified Stack: FrontendStack

**Changes**:
1. Update API service to fetch runtime endpoint URL from App API
2. Update auth service to track current provider ID
3. Add admin UI for runtime status display
4. Add admin UI for runtime version tracking

## Security Considerations

### IAM Permissions

**Runtime Provisioner Lambda**:
- `bedrock-agentcore:CreateAgentRuntime`
- `bedrock-agentcore:UpdateAgentRuntime`
- `bedrock-agentcore:DeleteAgentRuntime`
- `bedrock-agentcore:GetAgentRuntime`
- `dynamodb:UpdateItem` (Auth Providers table)
- `ssm:GetParameter`, `ssm:PutParameter`, `ssm:DeleteParameter`
- `ecr:DescribeRepositories`, `ecr:DescribeImages`
- `iam:PassRole` (for runtime execution role)

**Runtime Updater Lambda**:
- `bedrock-agentcore:GetAgentRuntime`
- `bedrock-agentcore:UpdateAgentRuntime`
- `dynamodb:Scan`, `dynamodb:UpdateItem` (Auth Providers table)
- `ssm:GetParameter`
- `ecr:DescribeRepositories`, `ecr:DescribeImages`
- `sns:Publish` (for alerts)

**Runtime Execution Role** (shared by all runtimes):
- All permissions currently granted to single runtime
- Access to Memory, Gateway, Code Interpreter, Browser
- DynamoDB table access (users, roles, tools, sessions, costs, quotas)
- S3 bucket access (uploads, vectors)
- Bedrock model invocation

### JWT Validation

Each runtime validates JWTs independently using its provider's configuration:
- Discovery URL points to provider's OIDC configuration
- JWKS URI fetched from discovery document
- Public keys cached and rotated automatically
- Token signature verified using provider's public key
- Audience claim validated against configured client ID
- Issuer claim validated against configured issuer URL

### Network Security

- Runtimes deployed in PUBLIC network mode (AgentCore requirement)
- Runtimes have AWS-managed HTTPS endpoints with TLS
- Security groups control inbound/outbound traffic for supporting infrastructure
- VPC endpoints for AWS service access (optional)

## Monitoring and Observability

### CloudWatch Metrics

**Custom Metrics** (namespace: `AgentCore/RuntimeUpdates`):
- `UpdateSuccess`: Count of successful runtime updates
- `UpdateFailure`: Count of failed runtime updates
- `UpdateDuration`: Time taken to update all runtimes
- `RuntimeCount`: Total number of active runtimes

**CloudWatch Dashboard**:
- Runtime update success rate graph
- Runtime update duration graph
- Runtime count by status
- Failed update details

### CloudWatch Alarms

- **Runtime Update Failures**: Triggers when UpdateFailure > 0
- **High Update Duration**: Triggers when UpdateDuration > 30 minutes
- **Runtime Creation Failures**: Triggers on Lambda errors

### SNS Notifications

**Alert Topics**:
- Runtime provisioning failures
- Runtime update failures
- Runtime deletion failures

**Notification Content**:
- Provider ID and display name
- Runtime ID and ARN
- Error message and stack trace
- Timestamp and attempt count
- Action required

### Admin Dashboard

**Runtime Status View**:
- List of all providers with runtime status
- Current image version per runtime
- Outdated runtime count
- Last update timestamp
- Error details for failed runtimes

**Runtime Version Tracking**:
- Current deployed image tag
- Image tag per runtime
- Version mismatch indicators
- Manual update trigger button

## Error Handling

### Runtime Creation Failures

**Causes**:
- Invalid JWT configuration (bad discovery URL, invalid client ID)
- ECR image not found
- IAM permission issues
- AgentCore API rate limiting
- Network connectivity issues

**Handling**:
1. Catch exception in Lambda
2. Update DynamoDB with FAILED status and error message
3. Log detailed error to CloudWatch
4. Lambda DynamoDB Stream integration retries (3 attempts)
5. Admin UI displays error to user

**Recovery**:
- Admin fixes provider configuration
- Update triggers new runtime creation attempt
- Or admin deletes and recreates provider

### Runtime Update Failures

**Causes**:
- Runtime not found (deleted externally)
- AgentCore API rate limiting
- Network connectivity issues
- Invalid runtime configuration

**Handling**:
1. Retry up to 3 times with exponential backoff
2. Update DynamoDB with UPDATE_FAILED status
3. Send SNS alert with failure details
4. Continue updating other runtimes (no cascading failures)

**Recovery**:
- Manual retry via admin UI
- Or wait for next image deployment (automatic retry)

### Routing Failures

**Causes**:
- Provider ID not found in database
- Runtime not ready (still provisioning)
- Runtime endpoint URL not stored in DynamoDB
- Network connectivity issues

**Handling**:
- App API returns 404 if provider not found
- Frontend displays error message
- User retries or contacts support

**Recovery**:
- Wait for runtime provisioning to complete
- Or admin fixes provider configuration

## Performance Considerations

### Runtime Provisioning Time

- **Expected**: 2-5 minutes per runtime
- **Optimization**: None available (AWS-managed process)
- **User Experience**: Show "Provisioning..." status in UI, send email when ready

### Runtime Update Time

- **Expected**: 2-5 minutes per runtime
- **Optimization**: Parallel updates (max 5 concurrent)
- **Total Time**: ~5-10 minutes for 5 providers, ~20-30 minutes for 20 providers

### Request Latency

- **No Added Latency**: Frontend calls runtime endpoints directly (no proxy, no ALB routing)
- **JWT Validation**: Handled natively by AgentCore (cached JWKS)
- **Routing Overhead**: None (direct API calls)

### Scalability

- **Provider Limit**: 1,000 runtimes per account (AWS quota)
- **Concurrent Updates**: 5 runtimes at a time (configurable)
- **AgentCore API Rate Limits**: 5 TPS for Create/Update/Delete operations

## Cost Analysis

### Per-Runtime Costs

- **Base Cost**: $0 (serverless, no idle charges)
- **Invocation Cost**: $0.00002 per request
- **Session Cost**: $0.0001 per minute

### Example: 5 Providers

- 5 runtimes × $0 base = $0/month
- 1M requests/month × $0.00002 = $20/month
- Shared resources (Memory, Gateway, etc.): $50/month
- **Total**: ~$70/month (vs $50/month for single runtime)

### Lambda Costs

- **Runtime Provisioner**: ~$1/month (infrequent invocations)
- **Runtime Updater**: ~$2/month (monthly image updates)

### Total Additional Cost

- **5 Providers**: +$20-25/month
- **10 Providers**: +$40-50/month
- **20 Providers**: +$80-100/month

## Trade-offs and Alternatives

### Pros of Multi-Runtime Approach

✅ Native JWT validation (no custom code)
✅ Complete provider isolation
✅ No added request latency
✅ Automatic provisioning
✅ Scalable to 1,000 providers
✅ Native AWS security

### Cons of Multi-Runtime Approach

❌ Longer provisioning time (2-5 min per provider)
❌ Higher operational complexity
❌ Multiple runtime instances to manage
❌ Frontend needs to fetch runtime endpoint per provider

### Alternative: Auth Proxy (Option 1)

**Approach**: Single runtime with validation proxy that reads all providers from DynamoDB

**Pros**:
- Simpler routing (single runtime endpoint)
- Instant provider activation (no runtime provisioning)
- Unlimited providers (no AWS quota limits)
- Centralized auth logic

**Cons**:
- Added request latency (+50-100ms)
- Custom JWT validation code
- Additional infrastructure (proxy service)
- Single point of failure

### Recommendation

- **1-5 Providers**: Multi-Runtime (this design)
- **5-10 Providers**: Multi-Runtime or Hybrid
- **10+ Providers**: Auth Proxy (Option 1)

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- Update Auth Provider DynamoDB schema
- Enable DynamoDB Streams
- Export runtime execution role ARN to SSM
- Update Inference API stack (remove single runtime)

### Phase 2: Runtime Provisioner (Week 2)
- Create Runtime Provisioner Lambda function
- Create RuntimeProvisionerStack CDK
- Add DynamoDB Stream trigger
- Test runtime creation with sample provider

### Phase 3: Runtime Updater (Week 3)
- Create Runtime Updater Lambda function
- Add EventBridge rule for SSM changes
- Implement retry logic and SNS alerts
- Test automatic image updates

### Phase 4: Routing & Frontend (Week 4)
- Update frontend to fetch runtime endpoint URL from App API
- Update auth service to track provider ID
- Add App API endpoint: GET /auth/runtime-endpoint
- Test end-to-end authentication flow

### Phase 5: Monitoring & Observability (Week 5)
- Create CloudWatch dashboard
- Configure CloudWatch alarms
- Add admin UI for runtime status
- Add admin UI for version tracking

### Phase 6: Testing & Validation (Week 6)
- End-to-end testing with multiple providers
- Load testing with concurrent requests
- Failure scenario testing
- Performance benchmarking

### Phase 7: Documentation & Operations (Week 7)
- Operational runbooks
- Troubleshooting guides
- Team training
- Production deployment

## Success Criteria

1. ✅ Runtime provisioning success rate > 95%
2. ✅ Runtime update success rate > 98%
3. ✅ Average provisioning time < 5 minutes
4. ✅ Average update time < 5 minutes per runtime
5. ✅ Zero authentication failures due to routing
6. ✅ Admin UI shows real-time runtime status
7. ✅ SNS alerts sent for all failures
8. ✅ CloudWatch dashboard operational
9. ✅ All runtimes share Memory, Gateway, Code Interpreter, Browser
10. ✅ Users from any provider can access AI agent

## Rollback Plan

If critical issues arise:

1. **Immediate**: Disable new provider creation in admin UI
2. **Short-term**: Route all traffic to primary runtime (Entra ID)
3. **Medium-term**: Implement auth proxy (Option 1) as fallback
4. **Long-term**: Fix issues and re-enable multi-runtime

## Future Enhancements

1. **Blue-Green Deployment**: Zero-downtime runtime updates
2. **Provider-Specific Resources**: Dedicated Memory/Gateway per provider
3. **Multi-Region Support**: Runtimes in multiple AWS regions
4. **Auto-Scaling**: Dynamic runtime provisioning based on load
5. **Cost Allocation**: Per-provider cost tracking and billing
6. **Runtime Health Checks**: Automated health monitoring and recovery
7. **Provider Groups**: Shared runtimes for provider groups
8. **Advanced Routing Logic**: Custom provider selection strategies
