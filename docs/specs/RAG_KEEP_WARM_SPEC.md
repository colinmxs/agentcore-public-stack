# RAG Ingestion Lambda Keep-Warm Feature

## Problem

The RAG ingestion Lambda takes ~175 seconds on cold start due to Docling/PyTorch model loading (~140s), but only ~35 seconds on warm invocations. For agencies with heavy RAG usage, this cold start penalty degrades the document upload experience significantly.

## Solution

Deploy an EventBridge rule (disabled by default) that pings the ingestion Lambda every 5 minutes to keep it warm. Admins toggle it on/off from the admin UI at runtime — no CDK redeploy required.

## Architecture

```
Admin UI Toggle
    ↓
PUT /admin/settings/rag-keep-warm  (App API)
    ↓
1. Write state to DynamoDB (admin settings)
2. Call EventBridge EnableRule / DisableRule
    ↓
EventBridge Rule (5-min schedule) → Ingestion Lambda (early return on ping)
```

## Implementation Plan

### 1. CDK: Deploy EventBridge Rule (Disabled by Default)

**File:** `infrastructure/lib/rag-ingestion-stack.ts`

- Create an EventBridge rule on a `rate(5 minutes)` schedule targeting the ingestion Lambda
- Deploy the rule in a **disabled** state (`enabled: false`)
- Grant the App API task role `events:EnableRule` and `events:DisableRule` on this specific rule
- Export the rule name to SSM at `/{projectPrefix}/rag/keep-warm-rule-name`

Resources created:
- `AWS::Events::Rule` (disabled, 5-min rate schedule)
- `AWS::Lambda::Permission` (allow EventBridge to invoke ingestion Lambda)
- SSM parameter for rule name

### 2. Lambda Handler: Early Return on EventBridge Ping

**File:** `backend/src/apis/app_api/documents/ingestion/handler.py`

At the top of `lambda_handler`, before calling `async_lambda_handler`:

```python
def lambda_handler(event, context):
    # Keep-warm ping — return early but let module-level imports stay warm
    if event.get("source") == "aws.events":
        logger.info("Keep-warm ping received, Lambda is warm")
        return {"statusCode": 200, "body": "warm"}
    return asyncio.run(async_lambda_handler(event, context))
```

The module-level imports (torch, docling models) still execute on cold start, which is the whole point — subsequent real invocations skip that 140s penalty.

### 3. Backend API: Admin Toggle Endpoint

**File:** New route in `backend/src/apis/app_api/admin/`

`PUT /admin/settings/rag-keep-warm`

Request body:
```json
{ "enabled": true }
```

Handler logic:
1. Validate caller has admin role (existing RBAC middleware)
2. Read EventBridge rule name from env var (sourced from SSM)
3. Call `events_client.enable_rule(Name=rule_name)` or `events_client.disable_rule(Name=rule_name)`
4. Write current state to DynamoDB admin settings table (for UI read-back)
5. Return `{ "enabled": true/false }`

`GET /admin/settings/rag-keep-warm`

- Read current state from DynamoDB admin settings table
- Return `{ "enabled": true/false }`

IAM permissions needed on App API task role:
- `events:EnableRule` on the keep-warm rule ARN
- `events:DisableRule` on the keep-warm rule ARN

### 4. Frontend: Admin UI Toggle

**File:** Add to existing admin settings page

- Simple toggle switch with label: "Keep RAG Ingestion Lambda Warm"
- Description text: "Reduces document processing time from ~3 minutes to ~35 seconds by keeping the ingestion service warm. Recommended for production environments with frequent document uploads."
- Calls `PUT /admin/settings/rag-keep-warm` on toggle
- Reads initial state from `GET /admin/settings/rag-keep-warm`

### 5. Environment Variables

Pass the EventBridge rule name to the App API container:

**CDK:** Add to App API Fargate task environment:
```
RAG_KEEP_WARM_RULE_NAME = (from SSM)
```

**Lambda:** No new env vars needed — it just checks `event.source`.

## Config Flow

```
CDK Deploy (one-time)
    → EventBridge rule created (disabled)
    → Rule name stored in SSM
    → App API gets rule name as env var

Admin flips toggle ON
    → API calls events:EnableRule
    → Rule starts firing every 5 min
    → Lambda stays warm
    → Cold starts eliminated

Admin flips toggle OFF
    → API calls events:DisableRule
    → Rule stops firing
    → Lambda goes cold after ~15 min idle
    → Zero cost
```

## Cost Impact

| State | Cost |
|-------|------|
| Toggle OFF (default) | $0 — disabled rule doesn't fire |
| Toggle ON | ~$0.02/month — EventBridge invocations + Lambda ping duration (~100ms × 288/day) |

## Future Enhancements (Optional)

- **Schedule-aware warming**: Let admins set business hours (e.g., "Mon-Fri 8am-6pm") instead of 24/7. Update the EventBridge rule's schedule expression via `PutRule`.
- **Auto-warm based on usage**: Track document upload frequency and auto-enable/disable warming based on a threshold.
- **Provisioned concurrency option**: For agencies needing guaranteed zero cold start, offer provisioned concurrency as a premium option (~$12-15/month at 3008 MB).

## Effort Estimate

- CDK changes: ~1 hour (EventBridge rule, permissions, SSM export)
- Lambda handler guard: ~15 minutes
- Backend admin API: ~1 hour (endpoint, EventBridge calls, DynamoDB state)
- Frontend toggle: ~1 hour (UI component, API integration)
- Testing: ~1 hour (toggle on/off, verify warm pings, verify early return)

**Total: ~4-5 hours**

## Dependencies

- Existing admin RBAC system (for endpoint authorization)
- Existing admin UI settings page (for toggle placement)
- App API task role (needs EventBridge permissions added)
