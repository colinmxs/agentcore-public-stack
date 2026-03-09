# Testing Posture Report — AgentCore Public Stack

**Date**: March 6, 2026
**Last Updated**: March 9, 2026
**Scope**: Full monorepo inventory (backend, frontend, infrastructure, scripts, CI/CD)

---

## Executive Summary

Since the initial report on March 6, significant progress has been made. Backend test coverage has jumped from ~5% to an estimated ~65-75%, with new tests across auth, RBAC, all API routes, agent core, streaming, tools, multimodal, integrations, the core session manager, and now the shared backend services layer. The previously critical `turn_based_session_manager` gap has been closed with 83 tests at 91% coverage. The shared backend services gap has been closed with 395 tests at 70% coverage across all 8 modules (DynamoDB, KMS, S3, Secrets Manager via moto). **Frontend coverage has jumped from 12.64% to 40.6% line coverage (3.2x improvement)**, with 60 spec files and 657 passing tests covering auth, session services, admin services, shared services, file upload, and shared utilities. **Infrastructure CDK coverage has jumped from ~15% to ~75-80%**, with 249 tests across 10 suites covering all 6 stacks, including a critical static analysis test that prevents circular SSM parameter dependencies between stacks. **Lambda function coverage has gone from zero to 141 tests across 14 test files**, covering both runtime-provisioner and runtime-updater — the critical functions that provision and update all AgentCore runtimes. **Cost tracking and DynamoDB storage coverage has gone from zero to 170 tests across 6 test files**, covering the full financial data pipeline: DynamoDB storage (message ops, cost summaries, system rollups, active user tracking), CostAggregator (30s TTL caching, quota enforcement fast path, detailed report aggregation), pricing_config (snapshot creation), and AdminCostService (dashboard, trends, top users, model usage). All use moto-backed DynamoDB with production-matching table schemas (3 tables, 3 GSIs). Remaining gaps: still zero E2E or performance tests.

---

## Backend (Python / pytest)

| Metric | Value |
|---|---|
| Test framework | pytest 7.0+ with pytest-asyncio, hypothesis |
| Test files | **~82 files** (up from 6) |
| Source modules (app_api) | **15 directories**, ~40+ source files |
| Source modules (agents) | **8 directories**, ~30+ source files |
| Source modules (shared) | **11 directories**, ~30+ source files |
| Lambda functions | **2 functions**, 141 tests across 14 files |
| Estimated coverage | **~65-75%** (up from ~40-50%) |

### What's tested
- `agents/main_agent/quota/` — QuotaChecker, QuotaResolver (existing)
- `apis/` — Citation event generation (existing)
- `ingestion/` — CSV chunker, token validation (existing)
- ✅ `auth/` — **NEW**: JWT validation, OIDC auth service, PKCE, auth routes, dependencies, state store (~2,184 lines)
- ✅ `rbac/` — **NEW**: App role admin service, app role cache, app role service, property-based permission tests (~1,042 lines)
- ✅ `routes/` — **NEW**: All 15 route modules tested — admin, assistants, auth, chat, costs, documents, files, health, inference, memory, models, sessions, tools, users + property-based auth sweep and request validation (~3,246 lines)
- ✅ `agents/main_agent/core/` — **NEW**: agent_factory, model_config, system_prompt_builder (~766 lines)
- ✅ `agents/main_agent/session/` — **NEW**: compaction_models, memory_config, preview_session_manager, session_factory, stop_hook, **turn_based_session_manager (83 tests, 91% coverage)** (~1,757 lines)
- ✅ `agents/main_agent/streaming/` — **NEW**: event_formatter, stream_processor, tool_result_processor (~1,274 lines)
- ✅ `agents/main_agent/tools/` — **NEW**: tool_catalog, tool_filter, tool_registry (~516 lines)
- ✅ `agents/main_agent/multimodal/` — **NEW**: document_handler, file_sanitizer, image_handler, prompt_builder (~524 lines)
- ✅ `agents/main_agent/integrations/` — **NEW**: external_mcp_client, gateway_auth, gateway_mcp_client, oauth_auth (~392 lines)
- ✅ `agents/main_agent/utils/` — **NEW**: global_state, timezone (~105 lines)
- ✅ `agents/main_agent/property/` — **NEW**: Property-based agent core tests (~665 lines)
- ✅ `apis/shared/` — **NEW**: Comprehensive shared backend services test suite — **395 tests, 70% coverage** across all 8 modules. Uses moto for DynamoDB (9 tables with GSIs), KMS, S3, Secrets Manager. Covers: users (repository + sync), auth_providers (repository + service), RBAC (repository + cache + service + admin_service + seeder), OAuth (provider_repo + token_repo + encryption + token_cache + service), files (repository + resolver), managed_models, sessions (metadata + messages), assistants (service + RAG), quota (models + builders), state_store. 17 modules at 85%+, 8 at 70-84%. (~3,696 lines)

- ✅ `lambda-functions/runtime-provisioner/tests/` — **NEW**: Comprehensive test suite for the runtime-provisioner Lambda — **76 tests** across 6 files. Uses moto for DynamoDB/SSM + unittest.mock for Bedrock AgentCore Control (unsupported by moto). Covers: handler routing (INSERT/MODIFY/REMOVE dispatch, multi-record batches, error re-raise), full INSERT flow (runtime creation, JWT authorizer config, 30+ env vars from SSM, DynamoDB status updates, SSM ARN storage, URL-encoded endpoint construction), MODIFY flow (JWT field change detection for issuerUrl/clientId/jwksUri, no-op when unchanged, config preservation during update), REMOVE flow (runtime deletion, SSM cleanup, ResourceNotFoundException grace), all helper functions (DynamoDB deserialization for S/N/BOOL/NULL/L/M types, URL normalization, validation, discovery URL construction), runtime name generation (hyphen→underscore, 48-char truncation, `r_` prefix fallback), SSM CRUD (required/optional params, batch fetch, error handling), DynamoDB update helpers (runtime info, status, error truncation to 1000 chars). (~1,200 lines)
- ✅ `lambda-functions/runtime-updater/tests/` — **NEW**: Comprehensive test suite for the runtime-updater Lambda — **65 tests** across 7 files. Uses moto for DynamoDB/SSM/SNS + unittest.mock for Bedrock AgentCore Control. Covers: full handler flow (happy path, invalid events, no-providers, critical failure SNS alerts, mixed success/failure counts), EventBridge event parsing (SSM parameter name matching, missing/empty detail handling, SSM fetch), parallel update execution (ThreadPoolExecutor with max 5 workers, result collection, exception capture, batch processing of 10+ providers), retry logic with exponential backoff (ThrottlingException/ServiceUnavailableException retries, ResourceNotFoundException/ValidationException fail-fast, 2^n backoff timing verification, DynamoDB status transitions UPDATING→READY/UPDATE_FAILED), DynamoDB provider discovery (scan with filter, FAILED status exclusion, pagination, null runtime_id filtering), SNS notifications (update summary with success/failure counts, failure details, critical failure alerts with timestamps, publish failure handling), all helper functions (deserialization, status updates, error truncation, key format validation). (~1,100 lines)

- ✅ `tests/costs/` — **NEW**: Comprehensive cost tracking and DynamoDB storage test suite — **170 tests** across 6 files + conftest. Uses moto for DynamoDB (3 tables: SessionsMetadata, UserCostSummary, SystemCostRollup with 3 GSIs matching production schema). Covers:
  - **DynamoDBStorage message operations** (31 tests): `store_message_metadata` (PK/SK format, TTL, Decimal conversion), `get_message_metadata` (GSI query, filtering), `get_session_metadata` (multi-message retrieval), `get_user_messages_in_range` (date filtering, flattening), `_convert_floats_to_decimal` / `_convert_decimal_to_float` (recursive conversion, edge cases)
  - **DynamoDBStorage cost summary operations** (28 tests): `get_user_cost_summary` (lookup, Decimal→float), `update_user_cost_summary` (atomic ADD increments, if_not_exists semantics, GSI2PK), `_update_model_breakdown` (model ID sanitization dots/colons/hyphens→underscores, 3-step nested map update, error suppression), `_update_cost_sort_key` (15-digit zero-padded cents format), `get_top_users_by_cost` (PeriodCostIndex GSI, descending sort, limit/min_cost)
  - **DynamoDBStorage rollup operations** (38 tests): `track_active_user` (conditional writes, deduplication, TTL 90/400 days), `track_active_user_for_model` (per-model tracking), `update_daily_rollup` / `update_monthly_rollup` / `update_model_rollup` (atomic increments, activeUsers/uniqueUsers counting), `get_system_summary` (monthly/daily lookup), `get_daily_trends` (range query, ascending sort), `get_model_usage` (begins_with query, cost-descending sort)
  - **CostAggregator** (29 tests): cache hit/miss/expiry (30s TTL), empty summary caching, `invalidate_cache` (specific/per-user/global), `get_user_cost_summary` (field mapping from storage dict), `get_detailed_cost_report` (message-level aggregation, per-model breakdown, cache savings calculation), `_create_empty_summary` (month parsing, leap year February, December edge case), `_build_model_summaries` (dict→ModelCostSummary conversion)
  - **pricing_config** (13 tests): `get_model_by_model_id` (found/not-found), `get_model_pricing` (Bedrock with cache prices, OpenAI without), `create_pricing_snapshot` (currency, timestamp Z-suffix, None for unknown model)
  - **AdminCostService** (31 tests): `_get_period_date_range` (all month lengths, leap year, December→January), `get_top_users` (default period, limit cap at 1000), `get_system_summary` (monthly/daily, empty→zero-fill), `get_usage_by_model` (avg_cost_per_request, division-by-zero), `get_daily_trends` (90-day max enforcement, invalid date ValueError), `get_dashboard` (combines all sub-queries, include_trends toggle, end_date capping)

### What's NOT tested (remaining gaps)
- **Admin cost routes**: HTTP layer tests for admin cost endpoints (service layer tested, route layer not)
- **User cost routes**: HTTP layer tests for user-facing cost endpoints

### Config
```toml
# backend/pyproject.toml
[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
addopts = ["--import-mode=importlib"]
```
Dev deps: pytest, pytest-asyncio, hypothesis, black, ruff, mypy, tiktoken

---

## Frontend (Angular / Vitest)

| Metric | Value |
|---|---|
| Test framework | Vitest 4.0.18 with @vitest/coverage-v8, fast-check |
| Test files | **60 spec files** (up from 18) |
| Total tests | **657 passing**, 1 skipped, 0 failures |
| Source directories | **14 feature directories** + services + components |
| Components/services | ~50+ source files |
| Line coverage | **40.6%** (up from ~12.64% baseline) |
| Statement coverage | 39.5% |
| Branch coverage | 39.65% |
| Function coverage | 42.99% |

### What's tested

#### Auth module (7 spec files)
- `auth/auth.service.spec.ts` — 29 tests: login, logout (success + error handling), storeTokens, clearTokens, ensureAuthenticated, isTokenExpired, getAccessToken, getRefreshToken, getProviderId, getAuthorizationHeader, event dispatching (token-stored, token-cleared)
- `auth/auth.guard.spec.ts` — Route guard tests
- `auth/admin.guard.spec.ts` — Admin guard tests
- `auth/auth.interceptor.spec.ts` — Auth interceptor tests
- `auth/error.interceptor.spec.ts` — Error interceptor tests
- `auth/auth-pbt.spec.ts` — Property-based auth tests
- `auth/callback/callback.service.spec.ts` — OAuth callback handling
- `auth/auth-api.service.spec.ts` — Auth API service
- `auth/api-keys/api-key.service.spec.ts` — API key service
- `auth/user.service.spec.ts` — User service

#### Session services (6 spec files)
- `session/services/session/session.service.spec.ts` — 27 tests: CRUD operations, toggleStarred, updateSessionTags, updateSessionStatus, updateSessionPreferences, hasCurrentSession, setSessionMetadataId, updateSessionsParams, resetSessionsParams, deleteSession (newSessionIds removal), bulkDeleteSessions (currentSession clearing)
- `session/services/session/message-map.service.spec.ts` — 19 tests: loadMessagesForSession, matchToolResultsToToolUses (success/error status, JSON error detection), restoreFileAttachments, fetchSessionFiles error handling, message ID incrementing, error paths
- `session/services/chat/chat-http.service.spec.ts` — 13 tests: sendChatRequest, cancelChatRequest, getBearerTokenForStreamingResponse (4 scenarios), getRuntimeEndpointUrl (6 scenarios including provider ID mismatch warning)
- `session/services/chat/stream-parser.service.spec.ts` — 18 tests: citation field mapping (all fields, missing fields, non-string fields), reset/done/metadata state management
- `session/services/chat/chat-state.service.spec.ts` — Chat state management
- `session/services/chat/chat-request.service.spec.ts` — Chat request service
- `session/services/visual-state/visual-state.service.spec.ts` — 11 tests: updateState, dismiss/toggleExpanded state preservation, debounced save scheduling, session change loading/clearing, saveToBackend
- `session/services/model/model.service.spec.ts` — Model loading and selection

#### Admin services (12 spec files)
- `admin/costs/services/admin-cost-state.service.spec.ts` — 20 tests: loadData, exportData (with safe URL mock), setPeriod, clearError, 7 computed signal tests, demo period tests, error paths
- `admin/costs/services/admin-cost-http.service.spec.ts` — HTTP layer for admin costs
- `admin/quota-tiers/services/quota-state.service.spec.ts` — Quota state management
- `admin/quota-tiers/services/quota-http.service.spec.ts` — Quota HTTP service
- `admin/users/services/user-state.service.spec.ts` — User state management
- `admin/users/services/user-http.service.spec.ts` — User HTTP service
- `admin/roles/services/app-roles.service.spec.ts` — App roles CRUD
- `admin/tools/services/admin-tool.service.spec.ts` — Admin tool management
- `admin/tools/services/tools.service.spec.ts` — Tools service
- `admin/oauth-providers/services/oauth-providers.service.spec.ts` — OAuth providers
- `admin/auth-providers/services/auth-providers.service.spec.ts` — Auth providers
- `admin/manage-models/services/managed-models.service.spec.ts` — Managed models
- `admin/bedrock-models/services/bedrock-models.service.spec.ts` — Bedrock models
- `admin/openai-models/services/openai-models.service.spec.ts` — OpenAI models
- `admin/gemini-models/services/gemini-models.service.spec.ts` — Gemini models

#### Shared services (8 spec files)
- `services/config.service.spec.ts` — 25 tests: config loading, validation, fallback, computed signals, URL validation
- `services/error/error.service.spec.ts` — 25 tests: error handling, conversational stream errors
- `services/toast/toast.service.spec.ts` — 17 tests: toast notifications
- `services/sidenav/sidenav.service.spec.ts` — 19 tests: sidenav state management
- `services/header/header.service.spec.ts` — 7 tests: header state
- `services/quota/quota-warning.service.spec.ts` — 20 tests: quota warnings, setWarning, setQuotaExceeded
- `services/file-upload/file-upload.service.spec.ts` — 40 tests: file validation (size, type, extension), upload flow, listSessionFiles, listAllFiles, completeUpload, loadQuota, error handling
- `services/tool/tool.service.spec.ts` — 11 tests: tool loading and management

#### Other services (5 spec files)
- `assistants/services/assistant.service.spec.ts` — Assistant CRUD
- `assistants/services/assistant-api.service.spec.ts` — Assistant API
- `assistants/services/document.service.spec.ts` — 13 tests: getDownloadUrl, listDocuments with params, CRUD error handling, handleApiError (HttpErrorResponse, Error, non-Error)
- `assistants/assistant-form/services/preview-chat.service.spec.ts` — Preview chat
- `costs/services/cost.service.spec.ts` — Cost service
- `memory/services/memory.service.spec.ts` — Memory service
- `settings/connections/services/connections.service.spec.ts` — Connections service
- `users/services/user-api.service.spec.ts` — User API service
- `components/topnav/components/theme-toggle/theme.service.spec.ts` — 7 tests: theme preference setting/cycling

#### Shared utilities (1 spec file)
- `shared/utils/stream-parser/stream-parser-core.spec.ts` — 83 tests: core stream parsing logic

#### Component specs (6 spec files)
- `app.spec.ts` — App component smoke test
- `app.config.spec.ts` — APP_INITIALIZER integration (16 tests)
- `components/sidenav/sidenav.spec.ts` — Sidenav component
- `components/sidenav/components/session-list/session-list.spec.ts` — Session list
- `components/topnav/topnav.spec.ts` — Topnav component
- `components/model-settings/model-settings.spec.ts` — Model settings
- `session/components/citation-display/citation-display.component.spec.ts` — 22 tests: citation display
- `assistants/assistant-form/assistant-form.page.spec.ts` — Assistant form page (12 tests)
- `assistants/assistant-form/components/assistant-preview.component.spec.ts` — Assistant preview (11 tests)

### What's NOT tested (remaining gaps)
- **Session page**: session.page (the main chat UI) — zero tests
- **All admin pages**: users, costs, quota, tools, roles, auth-providers, bedrock-models, oauth-providers, manage-models — zero component tests (services are tested)
- **Most feature pages**: costs, files, manage-sessions, memory, settings, not-found — zero component tests
- **Stream parser deep coverage**: stream-parser.service.ts (906 lines) is only ~20% covered — citation tests work but the core streaming event pipeline (MessageBuilder, processStreamEvent callbacks) is untested due to complex internal architecture
- **Routing**: app.routes — minimal coverage
- **Most shared components**: tooltip, confirmation-dialog, error-toast, toast, file-card, model-dropdown, quota-warning-banner, storage-quota-banner — zero tests

### Testing patterns and lessons learned

**Critical patterns required for all Angular specs in this codebase:**
- `TestBed.resetTestingModule()` must be the first line of every `beforeEach` AND called again in `afterEach` to prevent cross-test contamination
- Use `httpMock.match(() => true)` in `afterEach` instead of `httpMock.verify()` — verify causes cascading failures
- Services with async constructors (calling `ensureAuthenticated()`) require `vi.waitFor()` to intercept HTTP requests
- Never use `vi.stubGlobal('URL', ...)` — it replaces the URL constructor and breaks all subsequent tests. Override only static methods on the existing URL object
- Never use `vi.useFakeTimers()` — it can break URL constructor and other globals. Use real `setTimeout` with `await new Promise(resolve => setTimeout(resolve, ms))` instead

**ConfigService mock pattern:** `{ provide: ConfigService, useValue: { appApiUrl: signal('http://localhost:8000') } }`

**AuthService mock pattern:** `{ provide: AuthService, useValue: { ensureAuthenticated: vi.fn().mockResolvedValue(undefined), isAuthenticated: vi.fn().mockReturnValue(false), getAccessToken: vi.fn().mockReturnValue('tok'), isTokenExpired: vi.fn().mockReturnValue(false), refreshAccessToken: vi.fn(), getProviderId: vi.fn().mockReturnValue('p1') } }`

### Config
```json
// package.json scripts
"test": "ng test",
"test:ci": "ng test --watch=false"
```
Dev deps: vitest, @vitest/coverage-v8, fast-check, jsdom

---

## Infrastructure (CDK / Jest)

| Metric | Value |
|---|---|
| Test framework | Jest 29.7 with ts-jest |
| Test files | **10 files** (8 real assertion suites, 1 comprehensive config suite, 1 legacy placeholder) |
| CDK stacks | **6 stacks** |
| Estimated coverage | **~75-80%** |

### What's tested
- `config.test.ts` — RAG ingestion configuration loading (56 test cases, comprehensive)
- `rag-ingestion-stack.test.ts` — RAG ingestion stack resource creation (CDK assertions)
- ✅ `stack-dependencies.test.ts` — **NEW (CRITICAL)**: Static source-code analysis that extracts every SSM parameter read/write across all 6 stacks, builds a directed dependency graph, and enforces:
  - **No circular dependencies** — cycle detection prevents stacks that depend on each other
  - **Deployment tier ordering** — each stack is assigned a tier (0–4) and may only read SSM params written by earlier tiers. Violations produce actionable error messages naming the exact stack and parameter.
  - **All reads satisfied** — every SSM param read is written by some stack or marked as externally provided
  - **Stack file tracking** — new stack files must be registered or tests fail
  - Deployment tiers: `InfrastructureStack (0) → RagIngestion/Gateway (1) → InferenceApi (2) → AppApi (3) → Frontend (4)`
- ✅ `infrastructure-stack.test.ts` — **NEW**: 33 tests — VPC, ALB, ECS Cluster, Security Groups, 13 DynamoDB tables with key schemas/GSIs, KMS key, Secrets Manager, 40+ SSM params, encryption, removal policies
- ✅ `app-api-stack.test.ts` — **NEW**: 49 tests — Fargate service, task definition (CPU/memory/health check), DynamoDB tables with GSIs, S3 buckets with CORS, S3 Vector Store, Lambda functions, SNS topic, ALB target group, 7 SSM params, IAM role, CloudWatch logs
- ✅ `inference-api-stack.test.ts` — **NEW**: 22 tests — IAM runtime execution role, AgentCore Memory, Code Interpreter, Browser, 8 SSM params, least-privilege IAM validation
- ✅ `gateway-stack.test.ts` — **NEW**: 7 tests — Gateway resource with MCP protocol, IAM role, 2 SSM params
- ✅ `frontend-stack.test.ts` — **NEW**: 9 tests — S3 bucket (versioning, encryption, public access block), CloudFront distribution, security response headers, 4 SSM params, removal policies
- ✅ `security-best-practices.test.ts` — **NEW**: 10 tests — Cross-cutting validation across all 6 stacks: S3 encryption + public access blocking, DynamoDB encryption + PAY_PER_REQUEST billing, IAM least-privilege (no wildcard action+resource), standard tags, removal policy consistency for production vs non-production
- ✅ `helpers/mock-config.ts` — **NEW**: Shared AppConfig factory with sensible defaults and SSM context mocking for `valueFromLookup` calls across all stacks

### What's NOT tested (remaining gaps)
- **Config loading** for non-RAG stacks — unit tests for AppApi, InferenceApi, Frontend, Gateway config sections
- **Conditional resource creation** — tests don't cover disabled stack scenarios (e.g., `config.gateway.enabled = false`)
- **Custom domain / HTTPS paths** — Route53, ACM certificate, HTTPS listener configurations

---

## CI/CD Pipelines

| Workflow | Test Jobs | What They Run |
|---|---|---|
| `app-api.yml` | test-python, test-docker, test-cdk | pytest, Docker health check, CDK synth validation |
| `inference-api.yml` | test-python, test-docker, test-cdk | pytest, Docker health check, CDK synth validation |
| `frontend.yml` | test-frontend, test-cdk | Vitest (with coverage), CDK synth validation |
| `infrastructure.yml` | test | CDK diff validation |
| `gateway.yml` | test, test-cdk | Gateway tests, CDK synth validation |
| `rag-ingestion.yml` | test-cdk | CDK synth validation |
| `version-check.yml` | — | VERSION file + manifest sync check |

All workflows support `skip_tests` input flag. Tests run on push to main/develop and on PRs. Docker health endpoint tests validate container startup. CDK synth validation catches CloudFormation errors.

**Missing from CI**: coverage thresholds/gates, integration tests, E2E tests, performance/load tests, security scanning, dependency auditing.

---

## Scripts

Every stack has a `test.sh` script. Most run the relevant test framework (pytest or ng test). CDK stacks have `test-cdk.sh` for CloudFormation validation. Docker stacks have `test-docker.sh` for health endpoint checks. All scripts use `set -euo pipefail` and are portable between local and CI.

---

## Risk Assessment (Updated March 8, 2026)

| Area | Risk Level | Status | Rationale |
|---|---|---|---|
| Auth / RBAC | ✅ Resolved → 🟢 Low | **ADDRESSED** | Comprehensive backend auth + RBAC tests, full frontend auth module coverage |
| API Routes | ✅ Resolved → 🟢 Low | **ADDRESSED** | All 15 route modules now have tests + property-based validation |
| Session Management | ✅ Resolved → 🟢 Low | **ADDRESSED** | 83 tests, 91% coverage via moto DynamoDB, Hypothesis property tests, full async flow coverage |
| Agent Core | ✅ Resolved → 🟢 Low | **ADDRESSED** | agent_factory, model_config, system_prompt_builder all tested + property-based tests |
| Streaming/SSE | ✅ Resolved → 🟢 Low | **ADDRESSED** | event_formatter, stream_processor, tool_result_processor all tested (~1,274 lines) |
| Frontend Components | 🟡 Medium | **SIGNIFICANTLY ADDRESSED** | 60 spec files, 657 tests, 40.6% line coverage. All services tested (auth, session, admin, shared, file-upload, tools). Remaining gaps: component/page tests, stream-parser deep coverage, E2E flows |
| Infrastructure Stacks | ✅ Resolved → 🟢 Low | **ADDRESSED** | 249 tests across 10 suites. All 6 stacks have assertion-level tests. Critical circular dependency prevention via static SSM dependency graph analysis. Cross-cutting security and best-practice validation. |
| Cost Tracking | ✅ Resolved → 🟢 Low | **ADDRESSED** | 170 tests across 6 files. Full financial pipeline covered: DynamoDB storage (3 tables, 3 GSIs), CostAggregator (caching, aggregation), pricing_config, AdminCostService. Uses moto with production-matching schemas. |
| Lambda Functions | ✅ Resolved → 🟢 Low | **ADDRESSED** | 141 tests across 14 files. Both runtime-provisioner (76 tests) and runtime-updater (65 tests) comprehensively covered. Full handler flows, error handling, retry logic, parallel execution, DynamoDB/SSM/SNS interactions, edge cases. Uses moto + unittest.mock. |
| Shared Backend Services | ✅ Resolved → 🟢 Low | **ADDRESSED** | 395 tests, 70% coverage across all 8 modules. 17 modules at 85%+. Uses moto for DynamoDB, KMS, S3, Secrets Manager. |
| Quota System | 🟢 Low | **UNCHANGED** | Well-tested (checker + resolver) |
| Ingestion Pipeline | 🟢 Low | **UNCHANGED** | CSV chunker + token validation covered |
| Tool System | ✅ Resolved → 🟢 Low | **ADDRESSED** | tool_catalog, tool_filter, tool_registry all tested |
| Multimodal | ✅ Resolved → 🟢 Low | **ADDRESSED** | document_handler, file_sanitizer, image_handler, prompt_builder all tested |
| Integrations | ✅ Resolved → 🟢 Low | **ADDRESSED** | MCP client, gateway auth, OAuth all tested |

---

## Recommendations (Updated Priority Order)

### Completed ✅
1. ~~**Auth & RBAC tests**~~ — Done. Backend auth (JWT, OIDC, PKCE, RBAC) and frontend auth module fully covered.
2. ~~**API route tests**~~ — Done. All 15 route modules tested with property-based auth sweep and request validation.
3. ~~**Frontend auth service tests**~~ — Done. Full auth module coverage including guards, interceptors, and property-based tests.
4. ~~**`turn_based_session_manager` tests**~~ — Done. 83 tests across 19 classes, 91% coverage. Covers initialization, truncation (all 5 content types), summary injection, DynamoDB persistence (moto), LTM retrieval, post-turn async updates, session interface, and Hypothesis property-based invariants.

5. ~~**Shared backend services tests**~~ — Done. 395 tests across 22 files, 70% coverage. All 8 modules covered: users, auth_providers, RBAC (cache + service + admin), OAuth (repos + encryption + cache + service), files (repo + resolver), managed_models, sessions (metadata + messages), assistants (service + RAG), quota, state_store. 17 modules at 85%+.

### Remaining (Priority Order)
1. ~~**Cost tracking unit tests**~~ — Done. 170 tests across 6 files covering DynamoDB storage, CostAggregator, pricing_config, and AdminCostService.
2. ~~**Lambda function tests**~~ — Done. 141 tests across 14 files covering both runtime-provisioner and runtime-updater.
3. ~~**CDK stack assertion tests**~~ — Done. 249 tests across 10 suites covering all 6 stacks. Includes static dependency graph analysis that prevents circular SSM dependencies, per-stack resource assertions, and cross-cutting security/best-practice validation.
4. ~~**Frontend service tests**~~ — Done. 60 spec files, 657 tests, 40.6% line coverage. All services tested: auth (29 tests), session (27 tests), message-map (19 tests), chat-http (13 tests), stream-parser (18 tests), visual-state (11 tests), admin-cost-state (20 tests), file-upload (40 tests), error (25 tests), config (25 tests), toast (17 tests), sidenav (19 tests), quota-warning (20 tests), tool (11 tests), document (13 tests), theme (7 tests), plus 20+ admin service specs.
5. **Frontend stream-parser deep coverage** — stream-parser.service.ts (906 lines) is only ~20% covered. The core streaming event pipeline (MessageBuilder, processStreamEvent callbacks) needs tests that understand the actual callback architecture.
6. **Frontend component/page tests** — Admin pages, feature pages. Would push coverage toward 50%+ but risks pulling in uncovered template code.
7. **Integration tests** — API → Agent → Tool round-trips with mocked AWS services.
8. **E2E tests** — Playwright or Cypress for critical user flows (login → chat → response).
9. **Coverage gates** — Enforce minimum thresholds in CI (start at 40%, ramp to 60%+).
10. **Nightly CI** — Full deployment to staging + smoke tests + teardown.
