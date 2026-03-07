# Implementation Plan: API Route Tests

## Overview

Add comprehensive route-level tests for all App API and Inference API endpoints. Tests use FastAPI TestClient with dependency overrides for auth, RBAC, and service mocks. Property-based tests (Hypothesis) cover request validation and auth enforcement. Each test module creates a minimal FastAPI app mounting only the router under test, following the established pattern in `tests/auth/test_auth_routes.py`.

## Tasks

- [x] 1. Set up shared test infrastructure
  - [x] 1.1 Create `backend/tests/routes/__init__.py` and `backend/tests/routes/conftest.py` with shared fixtures
    - Implement `make_user` factory fixture (configurable email, user_id, name, roles)
    - Implement `mock_auth_user(app, user)` helper to override `get_current_user`
    - Implement `mock_no_auth(app)` helper to override `get_current_user` with 401
    - Implement `authenticated_client(app, user)` fixture returning TestClient with auth
    - Implement `unauthenticated_client(app)` fixture returning TestClient without auth override
    - Implement `admin_client(app)` fixture returning TestClient with admin-role user
    - Implement `mock_service(app, dependency, mock)` helper for overriding any Depends()
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Implement health and auth route tests
  - [x] 2.1 Create `backend/tests/routes/test_health.py`
    - Test GET /health returns 200 with "status", "service", "version" fields
    - Test health response "status" field equals "healthy"
    - Test Inference API GET /ping returns 200
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.2 Create `backend/tests/routes/test_auth.py`
    - Test GET auth providers returns 200 with provider list
    - Test GET auth providers returns 200 with empty list when none configured
    - Test valid auth callback returns tokens
    - Test invalid/expired callback returns 400 or 401
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 3. Checkpoint - Ensure infrastructure and basic tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement session and file route tests
  - [x] 4.1 Create `backend/tests/routes/test_sessions.py`
    - Test GET /sessions returns 200 with paginated session list for authenticated user
    - Test GET /sessions returns 401 for unauthenticated request
    - Test GET /sessions with valid limit parameter returns at most N sessions
    - Test GET /sessions/{session_id} returns 200 with session metadata
    - Test PUT /sessions/{session_id} returns 200 with updated metadata
    - Test DELETE /sessions/{session_id} returns 200
    - Test POST /sessions/bulk-delete returns 200 with deletion results
    - Test GET /sessions/{session_id}/messages returns 200 with message history
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 4.2 Create `backend/tests/routes/test_files.py`
    - Test POST /files/presign with valid request returns 200 with presigned URL
    - Test POST /files/presign with unsupported MIME type returns 400
    - Test POST /files/presign with oversized file returns 400
    - Test POST /files/presign with exceeded quota returns 403
    - Test POST /files/{upload_id}/complete for valid upload returns 200
    - Test POST /files/{upload_id}/complete for nonexistent upload returns 404
    - Test GET /files returns 200 with paginated file list
    - Test DELETE /files/{upload_id} for owned file returns 204
    - Test DELETE /files/{upload_id} for nonexistent file returns 404
    - Test GET /files/quota returns 200 with quota usage data
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

- [x] 5. Implement chat and admin route tests
  - [x] 5.1 Create `backend/tests/routes/test_chat.py`
    - Test POST /chat/title with valid request returns 200 with generated title
    - Test POST /chat/title returns 401 for unauthenticated request
    - Test POST /chat/stream returns streaming response with text/event-stream content-type
    - Test POST /chat/multimodal returns streaming response
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.2 Create `backend/tests/routes/test_admin.py`
    - Test admin endpoint returns 200 for user with Admin role
    - Test admin endpoint returns 403 for user without Admin role
    - Test admin endpoint returns 403 for user with no roles
    - Test admin endpoint returns 401 for unauthenticated request
    - Test GET managed models returns 200 with model list for admin
    - Test POST create managed model returns 200 for admin
    - Test DELETE managed model returns 200 for admin
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 6. Checkpoint - Ensure session, file, chat, and admin tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement remaining module route tests
  - [x] 7.1 Create `backend/tests/routes/test_tools.py`
    - Test GET /tools returns 200 with tool list for authenticated user
    - Test GET /tools returns 401 for unauthenticated request
    - _Requirements: 8.1, 8.2_

  - [x] 7.2 Create `backend/tests/routes/test_memory.py`
    - Test memory endpoint returns 200 with memory data for authenticated user
    - Test memory endpoint returns 401 for unauthenticated request
    - _Requirements: 9.1, 9.2_

  - [x] 7.3 Create `backend/tests/routes/test_costs.py`
    - Test costs endpoint returns 200 with cost data for authenticated user
    - Test costs endpoint returns 401 for unauthenticated request
    - _Requirements: 10.1, 10.2_

  - [x] 7.4 Create `backend/tests/routes/test_users.py`
    - Test users endpoint returns 200 with user profile for authenticated user
    - Test users endpoint returns 401 for unauthenticated request
    - _Requirements: 11.1, 11.2_

  - [x] 7.5 Create `backend/tests/routes/test_models.py`
    - Test GET /models returns 200 with model data for authenticated user
    - Test GET /models returns 401 for unauthenticated request
    - _Requirements: 12.1, 12.2_

  - [x] 7.6 Create `backend/tests/routes/test_assistants.py`
    - Test assistants endpoint returns 200 with assistant data for authenticated user
    - Test assistants endpoint returns 401 for unauthenticated request
    - _Requirements: 13.1, 13.2_

  - [x] 7.7 Create `backend/tests/routes/test_documents.py`
    - Test documents endpoint returns 200 with document data for authenticated user
    - Test documents endpoint returns 401 for unauthenticated request
    - _Requirements: 14.1, 14.2_

  - [x] 7.8 Create `backend/tests/routes/test_inference.py`
    - Test GET /ping returns 200
    - Test POST /invocations with valid payload returns streaming response
    - Test POST /invocations with invalid payload returns 422
    - _Requirements: 15.1, 15.2, 15.3_

- [x] 8. Checkpoint - Ensure all per-module route tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement property-based request validation tests
  - [x] 9.1 Create `backend/tests/routes/test_pbt_request_validation.py` with Hypothesis strategies
    - Set up Hypothesis configuration with `@settings(max_examples=100)`
    - _Requirements: 16.1, 16.2, 16.3_

  - [x] 9.2 Write property test for pagination limit invariant
    - **Property 1: Pagination limit invariant**
    - For any valid limit N (1 ≤ N ≤ 1000) and mock session list, GET /sessions with limit=N returns at most N sessions
    - **Validates: Requirements 3.3**

  - [x] 9.3 Write property test for invalid MIME type rejection
    - **Property 2: Invalid MIME type rejection**
    - For any MIME type string not in ALLOWED_MIME_TYPES, POST /files/presign returns HTTP 400
    - **Validates: Requirements 4.2, 16.2**

  - [x] 9.4 Write property test for oversized file rejection
    - **Property 3: Oversized file rejection**
    - For any file size > MAX_FILE_SIZE, POST /files/presign returns HTTP 400
    - **Validates: Requirements 4.3**

  - [x] 9.5 Write property test for invalid session ID rejection
    - **Property 5: Invalid session ID rejection**
    - For any random string as session_id where lookup returns no result, GET /sessions/{session_id}/metadata returns 404 or 422
    - **Validates: Requirements 16.1**

  - [x] 9.6 Write property test for missing required fields rejection
    - **Property 6: Missing required fields rejection**
    - For any JSON object missing required fields, the route returns HTTP 422
    - **Validates: Requirements 16.3**

- [x] 10. Implement auth sweep and RBAC property tests
  - [x] 10.1 Create `backend/tests/routes/test_pbt_auth_sweep.py` with route introspection
    - Import full App API app from `apis.app_api.main`
    - Discover all APIRoute objects via `app.routes`
    - Define known public routes to exclude (/health, /auth/providers, /auth/login, etc.)
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 10.2 Write property test for non-admin role rejection
    - **Property 4: Non-admin role rejection**
    - For any User whose roles do not contain "Admin", "SuperAdmin", or "DotNetDevelopers", admin endpoints return HTTP 403
    - **Validates: Requirements 7.2, 7.3**

  - [x] 10.3 Write parametrized test for auth enforcement across all protected routes
    - **Property 7: Auth enforcement across all protected routes**
    - For each protected route discovered via introspection, unauthenticated request returns HTTP 401
    - Verify health endpoint remains accessible without auth
    - **Validates: Requirements 17.1, 17.2, 17.3**

- [x] 11. Final checkpoint - Ensure all tests pass
  - Run full route test suite: `docker compose exec dev bash -c "cd /workspace/bsu-org/agentcore-public-stack/backend && python -m pytest tests/routes/ -v"`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All test commands must run inside Docker: `docker compose exec dev <command>`
