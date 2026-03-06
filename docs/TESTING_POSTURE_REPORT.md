# Testing Posture Report — AgentCore Public Stack

**Date**: March 6, 2026  
**Scope**: Full monorepo inventory (backend, frontend, infrastructure, scripts, CI/CD)

---

## Executive Summary

The project has test frameworks properly wired up and CI/CD pipelines that execute them, but actual test coverage is **critically thin**. Roughly **~5% of backend source modules** and **~8% of frontend components/services** have any test coverage at all. Infrastructure tests exist for 1 of 7 stacks. There are zero integration tests, zero E2E tests, and zero performance tests.

The good news: the plumbing works. pytest, Vitest, and Jest are configured, CI runs them, and the few tests that exist are well-written (property-based testing with Hypothesis/fast-check, proper mocking, async patterns). The foundation is solid — it just needs actual tests on top of it.

---

## Backend (Python / pytest)

| Metric | Value |
|---|---|
| Test framework | pytest 7.0+ with pytest-asyncio, hypothesis |
| Test files | **6 files** |
| Source modules (app_api) | **15 directories**, ~40+ source files |
| Source modules (agents) | **8 directories**, ~30+ source files |
| Source modules (shared) | **11 directories**, ~30+ source files |
| Lambda functions | **2 functions**, 0 tests |
| Estimated coverage | **~5%** |

### What's tested
- `agents/main_agent/quota/` — QuotaChecker (8 async tests), QuotaResolver (8 async tests)
- `apis/` — Citation event generation (property-based, ~100 examples)
- `ingestion/` — CSV chunker (14 tests), token validation (5 tests)

### What's NOT tested (critical gaps)
- **Auth & RBAC**: JWT validation, role-based access, guards, dependencies — zero tests
- **All API routes**: auth, sessions, messages, files, tools, assistants, memory, costs, admin, users, health, chat, documents, models — zero route tests
- **Agent core**: agent_factory, model_config, system_prompt_builder, main_agent — zero tests
- **Session management**: turn_based_session_manager, session_factory, preview_session_manager — zero tests
- **Streaming/SSE**: stream_coordinator, stream_processor, event_formatter — zero tests
- **Tool system**: tool_registry, tool_catalog, tool_filter, gateway_integration — zero tests
- **Multimodal**: image_handler, document_handler, file_sanitizer — zero tests
- **Integrations**: MCP client, gateway auth, OAuth — zero tests
- **Shared services**: all of auth_providers, files, models, oauth, rbac, sessions, storage, users — zero tests
- **Lambda functions**: runtime-provisioner, runtime-updater — zero tests
- **Cost tracking**: calculator, aggregator, pricing_config — zero tests
- **DynamoDB storage**: dynamodb_storage, metadata_storage — zero tests

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
| Test files | **5 spec files** |
| Source directories | **14 feature directories** + services + components |
| Components/services | ~50+ source files |
| Estimated coverage | **~8%** |

### What's tested
- `app.spec.ts` — Smoke test (1 trivial test)
- `app.config.spec.ts` — APP_INITIALIZER integration (4 tests)
- `auth/auth-api.service.spec.ts` — HTTP mocking for auth API (4 tests)
- `services/config.service.spec.ts` — Config loading and validation (~10+ tests)
- `session/services/chat/stream-parser.service.spec.ts` — Citation parsing with property-based tests (~20+ tests)

### What's NOT tested (critical gaps)
- **Auth module**: auth.service, auth.guard, admin.guard, auth.interceptor, error.interceptor, user.service — zero tests
- **Session page**: session.page (the main chat UI) — zero tests
- **All admin pages**: users, costs, quota, tools, roles, auth-providers, bedrock-models, oauth-providers, manage-models — zero tests
- **All feature pages**: assistants, costs, files, manage-sessions, memory, settings, not-found — zero tests
- **All shared components**: sidenav, topnav, tooltip, confirmation-dialog, error-toast, toast, file-card, model-dropdown, model-settings, quota-warning-banner, storage-quota-banner — zero tests
- **All services**: api.service, sse.service, error.service, file-upload.service, header.service, quota.service, sidenav.service, toast.service, tool.service — zero tests
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
| Test files | **3 files** (1 real, 1 comprehensive, 1 placeholder) |
| CDK stacks | **7 stacks** |
| Estimated coverage | **~15%** (config heavily tested, stacks not) |

### What's tested
- `config.test.ts` — RAG ingestion configuration loading (100+ test cases, comprehensive)
- `rag-ingestion-stack.test.ts` — RAG ingestion stack resource creation (real CDK assertions)
- `infrastructure.test.ts` — **Placeholder only** (all code commented out)

### What's NOT tested
- **InfrastructureStack** — VPC, ALB, ECS Cluster, Security Groups — zero real tests
- **AppApiStack** — Fargate service, task definitions, auto-scaling — zero tests
- **InferenceApiStack** — Bedrock AgentCore Runtime — zero tests
- **FrontendStack** — S3, CloudFront distribution — zero tests
- **GatewayStack** — API Gateway, Lambda functions — zero tests
- **Config loading** for non-RAG stacks — zero tests

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

## Risk Assessment

| Area | Risk Level | Rationale |
|---|---|---|
| Auth / RBAC | 🔴 Critical | Zero tests on JWT validation, role guards, access control |
| API Routes | 🔴 Critical | Zero route-level tests across 15+ API modules |
| Session Management | 🔴 Critical | Core user-facing feature, zero tests |
| Agent Core | 🟠 High | Complex orchestration logic, zero tests |
| Streaming/SSE | 🟠 High | Real-time data flow, zero tests |
| Frontend Components | 🟠 High | ~50+ components, 5 have tests |
| Infrastructure Stacks | 🟡 Medium | CDK synth catches some issues, but no assertion-level tests |
| Cost Tracking | 🟡 Medium | Financial data, zero tests |
| Lambda Functions | 🟡 Medium | Small scope but zero tests |
| Quota System | 🟢 Low | Well-tested (checker + resolver) |
| Ingestion Pipeline | 🟢 Low | CSV chunker + token validation covered |

---

## Recommendations (Priority Order)

1. **Auth & RBAC tests** — JWT validation, role guards, middleware. Highest blast radius if broken.
2. **API route tests** — FastAPI TestClient for each route module. Start with sessions, chat, files.
3. **Frontend service tests** — auth.service, api.service, sse.service. These are the data backbone.
4. **CDK stack assertion tests** — Template.fromStack() assertions for each stack's critical resources.
5. **Agent session tests** — turn_based_session_manager is the core runtime loop.
6. **Integration tests** — API → Agent → Tool round-trips with mocked AWS services.
7. **E2E tests** — Playwright or Cypress for critical user flows (login → chat → response).
8. **Coverage gates** — Enforce minimum thresholds in CI (start at 30%, ramp to 60%+).
9. **Nightly CI** — Full deployment to staging + smoke tests + teardown.
