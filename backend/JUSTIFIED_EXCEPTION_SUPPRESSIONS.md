# Justified Exception Suppressions

This document lists all exception suppressions in the codebase that are intentionally not propagated, along with justifications for why suppression is safe.

## Philosophy

**When to suppress exceptions:**
- ✅ Optional telemetry/metrics that shouldn't break requests
- ✅ Best-effort operations with explicit fallbacks
- ✅ Background tasks that are truly fire-and-forget
- ✅ Individual item failures in batch operations (skip and continue)

**When to propagate exceptions:**
- ❌ Core business logic failures
- ❌ Data persistence failures
- ❌ Authentication/authorization failures
- ❌ External service failures that affect the response
- ❌ Validation failures

## Justified Suppressions

### 1. Session Metadata - Cost Summary Updates

**Location:** `backend/src/apis/shared/sessions/metadata.py:434-442`

**Function:** `_update_cost_summary_async()`

**Justification:** Cost summary updates are fire-and-forget background operations called asynchronously after the main message storage completes. Failures here should not break the user's chat request. The cost data is already stored in the primary cost record (C# prefix), so this is just updating pre-aggregated summaries for faster quota checks.

**Impact:** Admin dashboard cost summaries may be temporarily out of sync, but primary cost data is preserved.

---

### 2. Session Metadata - System Rollup Updates

**Location:** `backend/src/apis/shared/sessions/metadata.py:535-542`

**Function:** `_update_system_rollups_async()`

**Justification:** System rollup updates are supplementary analytics for admin dashboard. They are fire-and-forget background operations that should not block user requests. The primary cost data is already stored in individual cost records (C# prefix). Rollup failures only affect admin dashboard aggregates, not user functionality.

**Impact:** Admin dashboard system-wide statistics may be temporarily out of sync.

---

### 3. Session Metadata - GSI Lookup Fallback

**Location:** `backend/src/apis/shared/sessions/metadata.py:848-853`

**Function:** `_get_session_by_gsi()`

**Justification:** GSI lookup is a fallback mechanism for finding sessions. If the GSI doesn't exist yet (during initial deployment) or the query fails, we gracefully return None and let the caller handle it. This is not a critical failure - the session might not exist, or we're in a transitional state.

**Impact:** Session lookup may fail gracefully, returning None instead of crashing.

---

### 4. Session Metadata - Invalid Pagination Tokens

**Location:** `backend/src/apis/shared/sessions/metadata.py:1153-1158` and `1323-1328`

**Function:** `_apply_pagination()` and `_list_user_sessions_cloud()`

**Justification:** Invalid pagination tokens should not break the request. We fall back to starting from the beginning, which is a reasonable default. This handles cases where tokens are corrupted, expired, or malformed.

**Impact:** User sees results from the beginning instead of the requested page.

---

### 5. Session Metadata - Individual Session Parsing Failures

**Location:** `backend/src/apis/shared/sessions/metadata.py:1261-1266` and `1358-1363`

**Function:** `_list_user_sessions_local()` and `_list_user_sessions_cloud()`

**Justification:** When listing sessions, individual session parsing failures should not break the entire list operation. We skip corrupted sessions and continue processing others. This provides better UX than failing completely.

**Impact:** Corrupted sessions are omitted from the list, but other sessions are still shown.

---

### 6. Storage - Individual Session Processing in Aggregations

**Location:** `backend/src/apis/app_api/storage/local_file_storage.py:218-225` and `328-335`

**Function:** `get_user_cost_summary()` and `get_user_messages_in_date_range()`

**Justification:** When aggregating costs or collecting messages across multiple sessions, individual session processing failures should not break the entire aggregation. We skip corrupted sessions and continue, providing partial results. This is better UX than failing the entire cost summary or message collection request.

**Impact:** Corrupted sessions are omitted from aggregations, but other sessions contribute to the results.

---

### 7. Managed Models - Individual Model Parsing Failures

**Location:** `backend/src/apis/shared/models/managed_models.py:543-548` and `655-660`

**Function:** `_list_managed_models_local()` and `_list_managed_models_cloud()`

**Justification:** When listing models, individual model parsing failures should not break the entire list operation. We skip corrupted models and continue processing others. This provides better UX than failing completely.

**Impact:** Corrupted models are omitted from the list, but other models are still shown.

---

### 8. User Sync - JWT to DynamoDB Synchronization

**Location:** `backend/src/apis/shared/users/sync.py:90-97`

**Function:** `sync_from_jwt()`

**Justification:** User sync is a best-effort operation that keeps the DynamoDB user table up-to-date with JWT claims. Sync failures should not break authentication or block user requests. The user can still access the system with their JWT token. Critical operations (auth, RBAC) use JWT claims directly, not the synced data.

**Impact:** User profile in DynamoDB may be out of sync, but authentication and authorization still work.

---

### 9. RBAC Seeder - Role Seeding Failures

**Location:** `backend/src/apis/shared/rbac/seeder.py:83-89`

**Function:** `seed_system_roles()`

**Justification:** Role seeding is a startup initialization task that should be resilient to individual role failures. If one role fails to seed (e.g., due to transient DynamoDB issues), we continue seeding other roles to maximize system availability. The application can still start and function with partial roles. Critical: system_admin role failure is logged and monitored for alerting.

**Impact:** Some system roles may not be seeded, but the application can still start.

---

### 10. Model Access - AppRole Permission Resolution Fallback

**Location:** `backend/src/apis/app_api/admin/services/model_access.py:77-84` and `122-131`

**Function:** `can_access_model()` and `filter_accessible_models()`

**Justification:** AppRole permission resolution failures should not block access checks or model filtering. We fall back to legacy JWT role checking to maintain system availability during the AppRole migration period. This ensures users can still access models even if the AppRole system has issues. We log the error for monitoring.

**Impact:** Users fall back to JWT role-based access instead of AppRole-based access.

---

## Monitoring Recommendations

All justified suppressions log errors with `exc_info=True` for full stack traces. Monitor these logs for:

1. **Cost summary update failures** - May indicate DynamoDB issues
2. **System rollup failures** - May indicate DynamoDB issues
3. **User sync failures** - May indicate DynamoDB or JWT parsing issues
4. **Role seeding failures** - Critical if system_admin role fails
5. **AppRole resolution failures** - May indicate RBAC service issues

## Review Schedule

This document should be reviewed:
- When adding new exception handlers
- During code reviews
- Quarterly as part of technical debt review
- When investigating production issues related to silent failures

## Last Updated

2025-01-15 - Initial documentation after Phase 2 exception handling improvements
