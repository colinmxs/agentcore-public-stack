# Implementation Plan: Auth & RBAC Test Suite

## Overview

Incremental implementation of comprehensive test coverage for the Auth & RBAC modules. Backend tests use pytest + Hypothesis, frontend tests use Vitest + fast-check. Each task begins with a docstring/comment audit of the module under test, then implements the tests. Property-based tests are placed close to the code they validate.

## Tasks

- [x] 1. Set up test infrastructure and shared fixtures
  - [x] 1.1 Create backend test directories and conftest files
    - Create `backend/tests/auth/conftest.py` with shared fixtures: RSA key pair generation, `make_user()` factory, `make_provider()` factory, mock `AuthProviderRepository`, mock `PyJWKClient`, and a `make_jwt()` helper that signs tokens with the test RSA key
    - Create `backend/tests/auth/__init__.py` and `backend/tests/rbac/__init__.py` and `backend/tests/property/__init__.py`
    - Create `backend/tests/rbac/conftest.py` with fixtures: `make_app_role()` factory, mock `AppRoleRepository`, mock `AppRoleCache`
    - _Requirements: 1.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1_

  - [x] 1.2 Verify Hypothesis and fast-check are available
    - Ensure `hypothesis` is in `backend/pyproject.toml` dev dependencies; add if missing
    - Ensure `fast-check` is in `frontend/ai.client/package.json` devDependencies; add if missing
    - _Requirements: 15.1_

- [x] 2. Remove legacy EntraIDJWTValidator
  - [x] 2.1 Audit comments and remove legacy validator
    - Review all inline comments and docstrings in `backend/src/apis/shared/auth/jwt_validator.py` and any files that import it; fix stale comments
    - Delete `backend/src/apis/shared/auth/jwt_validator.py`
    - Remove all import references to `EntraIDJWTValidator` or `get_validator` from `jwt_validator` across the codebase
    - Update `__init__.py` or any re-exports to exclude the deleted module
    - Remove any fallback code that uses `EntraIDJWTValidator` when the generic validator is unavailable
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 2.2 Verify no regression after removal
    - Run existing backend tests to confirm nothing breaks: `docker compose exec dev bash -c "cd /workspace/bsu-org/agentcore-public-stack/backend && python -m pytest tests/ -v"`
    - _Requirements: 2.7_

- [x] 3. Checkpoint - Verify test infrastructure and legacy removal
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. GenericOIDCJWTValidator tests
  - [x] 4.1 Audit JWT validator comments and write unit tests
    - Review and fix all inline comments and docstrings in `backend/src/apis/shared/auth/generic_jwt_validator.py`
    - Create `backend/tests/auth/test_generic_jwt_validator.py` with tests covering: valid RS256 decode (1.2), invalid signature (1.3), expired token (1.4), exact issuer match (1.5), Entra ID v1↔v2 cross-version matching (1.6, 1.7), issuer mismatch rejection (1.8), audience validation (1.9, 1.10), scope enforcement (1.11), user_id pattern validation (1.12), missing user_id claim (1.13), name construction from first/last claims (1.14), roles normalization from string (1.15), email fallback to preferred_username (1.16), JWKS client caching (1.17), resolve_provider_from_token success and failure (1.18, 1.19), invalidate_cache (1.20), dot-notation claim extraction (1.21), URI-style claim lookup (1.22)
    - _Requirements: 1.1–1.22_

  - [ ]* 4.2 Write property test for dot-notation claim extraction
    - **Property 11: Dot-notation claim extraction traverses nested dicts**
    - **Validates: Requirements 1.21**

- [x] 5. FastAPI auth dependency tests
  - [x] 5.1 Audit auth dependency comments and write unit tests
    - Review and fix all inline comments and docstrings in `backend/src/apis/shared/auth/dependencies.py`
    - Create `backend/tests/auth/test_dependencies.py` with tests covering: valid Bearer token flow (3.2), no credentials 401 (3.3), failed validation 401 (3.4), no validator 500 (3.5), trusted decode success (3.6), trusted malformed token (3.7), trusted no-validator fallback (3.8), trusted missing user_id (3.9), get_current_user_id returns string (3.10)
    - _Requirements: 3.1–3.10_

- [x] 6. RBAC role checker tests
  - [x] 6.1 Audit RBAC comments and write unit tests
    - Review and fix all inline comments and docstrings in `backend/src/apis/shared/auth/rbac.py`
    - Create `backend/tests/auth/test_rbac.py` with tests covering: require_roles OR-logic grant (4.2), require_roles OR-logic deny (4.3), require_all_roles AND-logic grant (4.4), require_all_roles AND-logic deny with missing roles detail (4.5), empty roles list 403 (4.6), has_any_role true (4.7), has_any_role false (4.8), has_all_roles true (4.9), has_all_roles false (4.10), empty roles returns false (4.11), require_admin predefined checker (4.12)
    - _Requirements: 4.1–4.12_

  - [ ]* 6.2 Write property test for has_any_role set intersection
    - **Property 9: has_any_role is set intersection**
    - **Validates: Requirements 15.8**

  - [ ]* 6.3 Write property test for has_all_roles subset check
    - **Property 10: has_all_roles is subset check**
    - **Validates: Requirements 15.9**

- [x] 7. Checkpoint - Verify auth layer tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. AppRoleService permission resolution tests
  - [x] 8.1 Audit AppRoleService comments and write unit tests
    - Review and fix all inline comments and docstrings in `backend/src/apis/shared/rbac/service.py`
    - Create `backend/tests/rbac/test_app_role_service.py` with tests covering: tools union merge (5.2), models union merge (5.3), quota tier from highest priority (5.4), no matching roles falls back to default (5.5), no matching roles and no default returns empty (5.6), wildcard in tools (5.7), can_access_tool with wildcard (5.8), can_access_tool with matching tool (5.9), can_access_tool with no match (5.10), caching on second call (5.11), cache miss queries repo (5.12), only enabled roles merged (5.13)
    - _Requirements: 5.1–5.13_

  - [ ]* 8.2 Write property test for permission merge union
    - **Property 1: Permission merge produces union of tools and models**
    - **Validates: Requirements 5.2, 5.3, 5.7, 5.14**

  - [ ]* 8.3 Write property test for permission merge idempotence
    - **Property 2: Permission merge is idempotent**
    - **Validates: Requirements 5.15**

  - [ ]* 8.4 Write property test for quota tier from highest priority
    - **Property 3: Quota tier comes from highest-priority role**
    - **Validates: Requirements 5.4**

  - [ ]* 8.5 Write property test for wildcard universal tool access
    - **Property 4: Wildcard grants universal tool access**
    - **Validates: Requirements 5.8**

- [x] 9. AppRoleAdminService CRUD tests
  - [x] 9.1 Audit AppRoleAdminService comments and write unit tests
    - Review and fix all inline comments and docstrings in `backend/src/apis/shared/rbac/admin_service.py`
    - Create `backend/tests/rbac/test_app_role_admin_service.py` with tests covering: create_role success (6.2), create_role non-existent parent ValueError (6.3), create_role duplicate ValueError (6.4), update system_admin protected fields ValueError (6.5), delete system role ValueError (6.6), delete non-system role success + cache invalidation (6.7), inheritance permission merge (6.8), update jwt_role_mappings cache invalidation (6.9), add_tool_to_role (6.10), remove_tool_from_role (6.11)
    - _Requirements: 6.1–6.11_

- [x] 10. AppRoleCache TTL and invalidation tests
  - [x] 10.1 Audit AppRoleCache comments and write unit tests
    - Review and fix all inline comments and docstrings in `backend/src/apis/shared/rbac/cache.py`
    - Create `backend/tests/rbac/test_app_role_cache.py` with tests covering: cache hit before TTL (7.2), cache miss after TTL (7.3), invalidate_role clears role + user caches (7.4), invalidate_jwt_mapping clears mapping + user caches (7.5), invalidate_all clears everything (7.6), cleanup_expired removes only expired (7.7), get_stats accuracy (7.8)
    - _Requirements: 7.1–7.8_

- [x] 11. Checkpoint - Verify RBAC layer tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. OIDC state store tests
  - [x] 12.1 Audit state store comments and write unit tests
    - Review and fix all inline comments and docstrings in `backend/src/apis/shared/auth/state_store.py`
    - Create `backend/tests/auth/test_state_store.py` with tests covering: store and retrieve success (8.2), one-time-use second call returns None (8.3), unknown state returns None (8.4), TTL expiration (8.5), cleanup_expired removes only expired (8.6)
    - _Requirements: 8.1–8.6_

  - [ ]* 12.2 Write property test for state store round-trip
    - **Property 7: State store round-trip**
    - **Validates: Requirements 8.7**

  - [ ]* 12.3 Write property test for state store one-time-use
    - **Property 8: State store one-time-use**
    - **Validates: Requirements 8.3**

- [x] 13. PKCE generation tests
  - [x] 13.1 Audit PKCE comments and write unit tests
    - Review and fix all inline comments and docstrings in the PKCE generation code in `backend/src/apis/app_api/auth/service.py`
    - Create `backend/tests/auth/test_pkce.py` with tests covering: verifier length 43–128 (9.2), challenge equals BASE64URL(SHA256(verifier)) (9.3), uniqueness across calls (9.5)
    - _Requirements: 9.1–9.5_

  - [ ]* 13.2 Write property test for PKCE round-trip correctness
    - **Property 5: PKCE round-trip correctness**
    - **Validates: Requirements 9.2, 9.3, 9.4**

  - [ ]* 13.3 Write property test for PKCE verifier uniqueness
    - **Property 6: PKCE verifier uniqueness**
    - **Validates: Requirements 9.5**

- [x] 14. GenericOIDCAuthService flow tests
  - [x] 14.1 Audit OIDC auth service comments and write unit tests
    - Review and fix all inline comments and docstrings in `backend/src/apis/app_api/auth/service.py` (GenericOIDCAuthService class)
    - Create `backend/tests/auth/test_oidc_auth_service.py` with tests covering: generate_state stores state (10.2), build_authorization_url with PKCE (10.3), build_authorization_url without PKCE (10.4), exchange_code invalid state 400 (10.5), exchange_code nonce mismatch 400 (10.6), exchange_code success returns token dict (10.7), refresh_access_token 400 response raises 401 (10.8), build_logout_url with redirect (10.9), build_logout_url no endpoint returns empty string (10.10)
    - _Requirements: 10.1–10.10_

- [x] 15. Auth routes integration tests
  - [x] 15.1 Audit auth routes comments and write integration tests
    - Review and fix all inline comments and docstrings in `backend/src/apis/app_api/auth/routes.py`
    - Create `backend/tests/auth/test_auth_routes.py` using FastAPI TestClient with tests covering: GET /auth/providers returns provider list (11.2), GET /auth/login returns auth URL + state (11.3), GET /auth/login unknown provider 400 (11.4), POST /auth/token valid exchange (11.5), POST /auth/token invalid state 400 (11.6), POST /auth/refresh success (11.7), GET /auth/logout returns URL (11.8), GET /auth/runtime-endpoint authenticated (11.9), GET /auth/runtime-endpoint unauthenticated 401 (11.10)
    - _Requirements: 11.1–11.10_

- [x] 16. Checkpoint - Verify all backend tests
  - Ensure all tests pass: `docker compose exec dev bash -c "cd /workspace/bsu-org/agentcore-public-stack/backend && python -m pytest tests/auth/ tests/rbac/ tests/property/ -v"`
  - Ask the user if questions arise.

- [x] 17. Frontend AuthService tests
  - [x] 17.1 Audit AuthService comments and write Vitest tests
    - Review and fix all inline comments and docstrings in `frontend/ai.client/src/app/auth/auth.service.ts`
    - Create `frontend/ai.client/src/app/auth/auth.service.spec.ts` with tests covering: storeTokens stores to localStorage (12.2), getAccessToken returns stored token (12.3), isTokenExpired false when valid (12.4), isTokenExpired true within buffer (12.5), isTokenExpired true when no expiry (12.6), isAuthenticated true (12.7), isAuthenticated false (12.8), clearTokens removes all keys (12.9), login stores state and provider (12.10), ensureAuthenticated resolves with valid token (12.11), ensureAuthenticated refreshes expired token (12.12), ensureAuthenticated throws when no token (12.13)
    - _Requirements: 12.1–12.13_

- [x] 18. Frontend auth guard and admin guard tests
  - [x] 18.1 Audit guard comments and write Vitest tests
    - Review and fix all inline comments and docstrings in `frontend/ai.client/src/app/auth/auth.guard.ts` and `admin.guard.ts` (or equivalent files)
    - Create `frontend/ai.client/src/app/auth/auth.guard.spec.ts` with tests covering: authenticated returns true (13.2), unauthenticated redirects to /auth/login with returnUrl (13.3), expired token + refresh success returns true (13.4), expired token + refresh fail redirects (13.5)
    - Create `frontend/ai.client/src/app/auth/admin.guard.spec.ts` with tests covering: admin role returns true (13.6), non-admin redirects to / (13.7), unauthenticated redirects to /auth/login (13.8)
    - _Requirements: 13.1–13.8_

- [x] 19. Frontend interceptor tests
  - [x] 19.1 Audit interceptor comments and write Vitest tests
    - Review and fix all inline comments and docstrings in `frontend/ai.client/src/app/auth/auth.interceptor.ts` and `error.interceptor.ts` (or equivalent files)
    - Create `frontend/ai.client/src/app/auth/auth.interceptor.spec.ts` with tests covering: attaches Bearer token (14.2), skips auth endpoints (14.3), no token passes through (14.4), refreshes expired token before request (14.5), retries on 401 (14.6), 401 retry fail clears tokens (14.7)
    - Create `frontend/ai.client/src/app/auth/error.interceptor.spec.ts` with tests covering: non-streaming error calls handleHttpError (14.8), streaming endpoint skips handling (14.9), silent endpoint skips display (14.10)
    - _Requirements: 14.1–14.10_

- [x] 20. Checkpoint - Verify all frontend tests
  - Ensure all tests pass: `docker compose exec dev bash -c "cd /workspace/bsu-org/agentcore-public-stack/frontend/ai.client && npx vitest --run src/app/auth/"`
  - Ask the user if questions arise.

- [x] 21. Backend property-based tests (Hypothesis)
  - [x] 21.1 Create backend PBT file with Hypothesis strategies
    - Create `backend/tests/property/test_pbt_permissions.py` with shared Hypothesis strategies (`st_app_role`, `st_user`, `st_oidc_state_data`, `st_role_name`, `st_tool_id`) as defined in the design document
    - _Requirements: 15.1_

  - [ ]* 21.2 Write property test: permission merge union (backend)
    - **Property 1: Permission merge produces union of tools and models**
    - **Validates: Requirements 15.2, 15.3**

  - [ ]* 21.3 Write property test: permission merge idempotence (backend)
    - **Property 2: Permission merge is idempotent**
    - **Validates: Requirements 15.4**

  - [ ]* 21.4 Write property test: quota tier from highest priority (backend)
    - **Property 3: Quota tier comes from highest-priority role**
    - **Validates: Requirements 15.5**

  - [ ]* 21.5 Write property test: PKCE round-trip (backend)
    - **Property 5: PKCE round-trip correctness**
    - **Validates: Requirements 15.6**

  - [ ]* 21.6 Write property test: state store round-trip (backend)
    - **Property 7: State store round-trip**
    - **Validates: Requirements 15.7**

  - [ ]* 21.7 Write property test: has_any_role set intersection (backend)
    - **Property 9: has_any_role is set intersection**
    - **Validates: Requirements 15.8**

  - [ ]* 21.8 Write property test: has_all_roles subset check (backend)
    - **Property 10: has_all_roles is subset check**
    - **Validates: Requirements 15.9**

- [x] 22. Frontend property-based tests (fast-check)
  - [x] 22.1 Create frontend PBT file with fast-check arbitraries
    - Create `frontend/ai.client/src/app/auth/auth-pbt.spec.ts` with shared fast-check arbitraries (`arbRoleName`, `arbRoleList`) as defined in the design document
    - _Requirements: 15.1_

  - [ ]* 22.2 Write property test: has_any_role set intersection (frontend)
    - **Property 9: has_any_role is set intersection (frontend equivalent)**
    - **Validates: Requirements 15.8**

  - [ ]* 22.3 Write property test: has_all_roles subset check (frontend)
    - **Property 10: has_all_roles is subset check (frontend equivalent)**
    - **Validates: Requirements 15.9**

- [x] 23. Final checkpoint - Full test suite verification
  - Run all backend tests: `docker compose exec dev bash -c "cd /workspace/bsu-org/agentcore-public-stack/backend && python -m pytest tests/auth/ tests/rbac/ tests/property/ -v"`
  - Run all frontend tests: `docker compose exec dev bash -c "cd /workspace/bsu-org/agentcore-public-stack/frontend/ai.client && npx vitest --run src/app/auth/"`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task begins with a docstring/comment audit per the "BEFORE writing tests" acceptance criteria
- Property tests validate universal correctness properties from the design document
- All runtime commands use `docker compose exec dev` per dev environment rules
- Backend PBT uses Hypothesis with `@settings(max_examples=100)`
- Frontend PBT uses fast-check with `{ numRuns: 100 }`
