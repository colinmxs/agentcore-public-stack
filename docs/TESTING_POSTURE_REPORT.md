# Testing Posture Report — AgentCore Public Stack

**Date**: March 6, 2026
**Last Updated**: March 8, 2026 (evening)
**Scope**: Full monorepo inventory (backend, frontend, infrastructure, scripts, CI/CD)

---

## Executive Summary

Since the initial report on March 6, significant progress has been made. Backend test coverage has jumped from ~5% to an estimated ~55-65%, with new tests across auth, RBAC, all API routes, agent core, streaming, tools, multimodal, integrations, the core session manager, and now the shared backend services layer. The previously critical `turn_based_session_manager` gap has been closed with 83 tests at 91% coverage. The shared backend services gap has been closed with 395 tests at 70% coverage across all 8 modules (DynamoDB, KMS, S3, Secrets Manager via moto). Frontend auth coverage went from 1 spec file to 7, and several shared components now have tests. **Infrastructure CDK coverage has jumped from ~15% to ~75-80%**, with 249 tests across 10 suites covering all 6 stacks, including a critical static analysis test that prevents circular SSM parameter dependencies between stacks. Remaining gaps: Lambda functions have no tests, and there are still zero E2E or performance tests.

---

## Backend (Python / pytest)

| Metric | Value |
|---|---|
| Test framework | pytest 7.0+ with pytest-asyncio, hypothesis |
| Test files | **~75 files** (up from 6) |
| Source modules (app_api) | **15 directories**, ~40+ source files |
| Source modules (agents) | **8 directories**, ~30+ source files |
| Source modules (shared) | **11 directories**, ~30+ source files |
| Lambda functions | **2 functions**, 0 tests |
| Estimated coverage | **~55-65%** (up from ~40-50%) |

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

### What's NOT tested (remaining gaps)
- **Lambda functions**: runtime-provisioner, runtime-updater — zero tests
- **Cost tracking**: calculator, aggregator, pricing_config — zero tests (route-level tests exist)
- **DynamoDB storage**: dynamodb_storage (app_api layer) — zero tests

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
| Test framework | Vitest 4.0.8 with @vitest/coverage-v8, fast-check |
| Test files | **18 spec files** (up from 5) |
| Source directories | **14 feature directories** + services + components |
| Components/services | ~50+ source files |
| Estimated coverage | **~25-30%** (up from ~8%) |

### What's tested
- `app.spec.ts` — Smoke test (existing)
- `app.config.spec.ts` — APP_INITIALIZER integration (existing)
- `services/config.service.spec.ts` — Config loading and validation (existing)
- `session/services/chat/stream-parser.service.spec.ts` — Citation parsing with property-based tests (existing)
- ✅ `auth/auth.service.spec.ts` — **NEW**: Auth service tests
- ✅ `auth/auth.guard.spec.ts` — **NEW**: Auth guard tests
- ✅ `auth/admin.guard.spec.ts` — **NEW**: Admin guard tests
- ✅ `auth/auth.interceptor.spec.ts` — **NEW**: Auth interceptor tests
- ✅ `auth/error.interceptor.spec.ts` — **NEW**: Error interceptor tests
- ✅ `auth/auth-pbt.spec.ts` — **NEW**: Property-based auth tests
- ✅ `components/sidenav/sidenav.spec.ts` — **NEW**: Sidenav component tests
- ✅ `components/sidenav/components/session-list/session-list.spec.ts` — **NEW**: Session list tests
- ✅ `components/topnav/topnav.spec.ts` — **NEW**: Topnav component tests
- ✅ `components/model-settings/model-settings.spec.ts` — **NEW**: Model settings tests
- ✅ `session/components/citation-display/citation-display.component.spec.ts` — **NEW**: Citation display tests
- ✅ `assistants/assistant-form/assistant-form.page.spec.ts` — **NEW**: Assistant form page tests
- ✅ `assistants/assistant-form/components/assistant-preview.component.spec.ts` — **NEW**: Assistant preview tests

### What's NOT tested (remaining gaps)
- **Session page**: session.page (the main chat UI) — zero tests
- **All admin pages**: users, costs, quota, tools, roles, auth-providers, bedrock-models, oauth-providers, manage-models — zero tests
- **Most feature pages**: costs, files, manage-sessions, memory, settings, not-found — zero tests
- **Most services**: api.service, sse.service, error.service, file-upload.service, header.service, quota.service, sidenav.service, toast.service, tool.service — zero tests
- **Most shared components**: tooltip, confirmation-dialog, error-toast, toast, file-card, model-dropdown, quota-warning-banner, storage-quota-banner — zero tests
- **Routing**: app.routes — zero tests

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
| Frontend Components | 🟡 Medium | **PARTIALLY ADDRESSED** | Auth module fully covered, sidenav/topnav/model-settings added; admin pages, most feature pages, and most services still untested |
| Infrastructure Stacks | ✅ Resolved → 🟢 Low | **ADDRESSED** | 249 tests across 10 suites. All 6 stacks have assertion-level tests. Critical circular dependency prevention via static SSM dependency graph analysis. Cross-cutting security and best-practice validation. |
| Cost Tracking | 🟡 Medium | **UNCHANGED** | Financial data, zero unit tests (route-level tests exist via test_costs.py) |
| Lambda Functions | 🟡 Medium | **UNCHANGED** | Small scope but zero tests |
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
1. **Cost tracking unit tests** — calculator, aggregator, pricing_config. Route-level tests exist but no unit tests on the business logic.
4. **Lambda function tests** — runtime-provisioner, runtime-updater. Small scope but completely untested.
6. ~~**CDK stack assertion tests**~~ — Done. 249 tests across 10 suites covering all 6 stacks. Includes static dependency graph analysis that prevents circular SSM dependencies, per-stack resource assertions, and cross-cutting security/best-practice validation.
6. **Frontend service tests** — api.service, sse.service, error.service, file-upload.service. The data backbone.
7. **Frontend page tests** — Admin pages, feature pages. Large surface area but lower risk than backend gaps.
8. **Integration tests** — API → Agent → Tool round-trips with mocked AWS services.
9. **E2E tests** — Playwright or Cypress for critical user flows (login → chat → response).
10. **Coverage gates** — Enforce minimum thresholds in CI (start at 30%, ramp to 60%+).
11. **Nightly CI** — Full deployment to staging + smoke tests + teardown.
