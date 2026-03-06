# Requirements Document

## Introduction

The Auth & RBAC modules are the highest-risk untested surface in the AgentCore Public Stack. The Testing Posture Report rates this area as 🔴 Critical: zero tests on JWT validation, role guards, access control. This spec defines comprehensive test coverage for both backend (Python/pytest) and frontend (Angular/Vitest) auth and RBAC systems, including property-based testing where applicable.

## Glossary

- **JWT_Validator**: The `GenericOIDCJWTValidator` class that validates JWT tokens against dynamically configured OIDC providers, performing signature verification, issuer matching, audience checks, scope verification, and claim extraction.
- **Auth_Dependency**: The FastAPI dependency functions `get_current_user()`, `get_current_user_trusted()`, and `get_current_user_id()` that extract authenticated users from HTTP requests.
- **RBAC_Checker**: The role-checking utilities in `rbac.py` including `require_roles()`, `require_all_roles()`, `has_any_role()`, and `has_all_roles()`.
- **AppRole_Service**: The `AppRoleService` class that resolves user permissions by mapping JWT roles to AppRoles and merging tools, models, and quota tiers.
- **AppRole_Admin_Service**: The `AppRoleAdminService` class that handles CRUD operations on AppRoles with inheritance resolution, cache invalidation, and system role protection.
- **AppRole_Cache**: The `AppRoleCache` class providing in-memory TTL-based caching for roles, user permissions, and JWT-to-AppRole mappings.
- **State_Store**: The `StateStore` abstraction (`InMemoryStateStore`, `DynamoDBStateStore`) for OIDC state management with TTL expiration and one-time-use semantics.
- **Auth_Service_FE**: The Angular `AuthService` class managing token storage, OIDC login/logout flows, token refresh, and authentication state signals.
- **Auth_Guard**: The Angular `authGuard` CanActivateFn that protects routes requiring authentication.
- **Admin_Guard**: The Angular `adminGuard` CanActivateFn that protects admin routes requiring specific roles (Admin, SuperAdmin, DotNetDevelopers).
- **Auth_Interceptor**: The Angular `authInterceptor` HttpInterceptorFn that adds Bearer tokens to requests and handles 401 retry with token refresh.
- **Error_Interceptor**: The Angular `errorInterceptor` HttpInterceptorFn that catches HTTP errors from non-streaming requests and delegates to ErrorService.
- **PKCE**: Proof Key for Code Exchange (S256 method) used in the OIDC authorization code flow.
- **Auth_Routes**: The FastAPI router endpoints for `/auth/providers`, `/auth/login`, `/auth/token`, `/auth/refresh`, `/auth/logout`, and `/auth/runtime-endpoint`.
- **OIDC_Auth_Service**: The `GenericOIDCAuthService` class handling PKCE generation, state management, authorization URL building, token exchange, and token refresh.
- **Test_Suite**: The collection of pytest (backend) and Vitest (frontend) test files created by this feature.

## Requirements

### Requirement 1: GenericOIDCJWTValidator Token Validation Tests

**User Story:** As a developer, I want comprehensive tests for the GenericOIDCJWTValidator, so that I can verify JWT signature verification, issuer matching, audience checks, scope enforcement, and claim extraction work correctly across multiple OIDC providers.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the `GenericOIDCJWTValidator` source file, verifying they accurately describe the current behavior, and update or remove any that are stale, misleading, or incorrect.
2. WHEN a token with a valid RS256 signature is provided, THE JWT_Validator SHALL decode the token and return a User object with correct email, user_id, name, and roles.
2. WHEN a token with an invalid signature is provided, THE JWT_Validator SHALL raise an HTTPException with status 401 and detail containing "Invalid token signature".
3. WHEN a token with an expired `exp` claim is provided, THE JWT_Validator SHALL raise an HTTPException with status 401 and detail containing "Token expired".
4. WHEN a token issuer matches the provider's `issuer_url` exactly, THE JWT_Validator SHALL accept the token as valid.
5. WHEN a token has an Entra ID v1 issuer (`https://sts.windows.net/{tenant}/`) and the provider has a v2 issuer (`https://login.microsoftonline.com/{tenant}/v2.0`), THE JWT_Validator SHALL accept the token via cross-version matching.
6. WHEN a token has an Entra ID v2 issuer and the provider has a v1 issuer, THE JWT_Validator SHALL accept the token via cross-version matching.
7. WHEN a token issuer does not match the provider issuer and no cross-version match exists, THE JWT_Validator SHALL raise an HTTPException with status 401.
8. WHEN the provider has `allowed_audiences` configured and the token audience is not in the list, THE JWT_Validator SHALL raise an HTTPException with status 401 and detail containing "Invalid token audience".
9. WHEN the provider has `allowed_audiences` configured and the token audience is a list containing at least one allowed audience, THE JWT_Validator SHALL accept the token.
10. WHEN the provider has `required_scopes` configured and the token `scp` claim is missing a required scope, THE JWT_Validator SHALL raise an HTTPException with status 401 and detail containing "Token missing required scope".
11. WHEN the provider has a `user_id_pattern` configured and the extracted user_id does not match the regex pattern, THE JWT_Validator SHALL raise an HTTPException with status 401 and detail "Invalid user.".
12. WHEN the provider has a `user_id_claim` pointing to a missing claim, THE JWT_Validator SHALL raise an HTTPException with status 401 and detail "Invalid user.".
13. WHEN the provider has `first_name_claim` and `last_name_claim` configured and the `name_claim` is absent, THE JWT_Validator SHALL construct the name from first and last name claims.
14. WHEN the token `roles` claim is a string instead of a list, THE JWT_Validator SHALL normalize the roles to a single-element list.
15. WHEN the `email` claim is absent but `preferred_username` is present, THE JWT_Validator SHALL use `preferred_username` as the email.
16. THE JWT_Validator SHALL cache PyJWKClient instances per JWKS URI so that repeated validations for the same provider reuse the client.
17. WHEN `resolve_provider_from_token()` is called with a valid token, THE JWT_Validator SHALL match the token issuer to an enabled provider and return the AuthProvider.
18. WHEN `resolve_provider_from_token()` is called with a token whose issuer matches no enabled provider, THE JWT_Validator SHALL return None.
19. WHEN `invalidate_cache()` is called, THE JWT_Validator SHALL clear both the issuer-to-provider cache and the JWKS client cache.
20. WHEN the `_extract_claim()` method receives a dot-notation claim path, THE JWT_Validator SHALL traverse nested dictionaries to extract the value.
21. WHEN the `_extract_claim()` method receives a URI-style claim path (e.g., `http://schemas.example.com/claims/id`), THE JWT_Validator SHALL perform a direct dictionary lookup.

### Requirement 2: Remove Legacy EntraIDJWTValidator

**User Story:** As a developer, I want the legacy `EntraIDJWTValidator` removed from the codebase, so that we eliminate dead code and reduce the auth surface area before production — the `GenericOIDCJWTValidator` already handles all OIDC providers including Entra ID.

#### Acceptance Criteria

1. BEFORE removal, THE developer SHALL review all inline comments and docstrings in `jwt_validator.py` and any files that import it, verifying comments accurately reflect the current state, and document all call sites in the PR description confirming none are actively used.
2. THE file `backend/src/apis/shared/auth/jwt_validator.py` SHALL be deleted entirely.
2. ALL import references to `EntraIDJWTValidator` or `get_validator` from `jwt_validator` SHALL be removed from the codebase.
3. THE `GenericOIDCJWTValidator` SHALL remain the sole JWT validation path, with no regression in functionality.
4. IF any module currently falls back to `EntraIDJWTValidator` when the generic validator is unavailable, THAT fallback SHALL be removed.
5. THE `__init__.py` or any re-exports referencing `jwt_validator` SHALL be updated to exclude the deleted module.
6. AFTER removal, all existing tests SHALL continue to pass without modification (confirming no runtime dependency on the legacy validator).

### Requirement 3: FastAPI Auth Dependency Tests

**User Story:** As a developer, I want tests for the FastAPI authentication dependencies, so that I can verify that `get_current_user()` correctly validates tokens via the generic validator, `get_current_user_trusted()` extracts claims without signature verification, and both handle edge cases properly.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the auth dependency functions (`get_current_user`, `get_current_user_trusted`, `get_current_user_id`), verifying they accurately describe the current behavior, and update or remove any that are stale, misleading, or incorrect.
2. WHEN `get_current_user()` receives valid Bearer credentials, THE Auth_Dependency SHALL resolve the provider from the token, validate the token, and return a User object with `raw_token` set.
2. WHEN `get_current_user()` receives no credentials (None), THE Auth_Dependency SHALL raise an HTTPException with status 401 and a `WWW-Authenticate: Bearer` header.
3. WHEN `get_current_user()` receives a token that fails validation, THE Auth_Dependency SHALL raise an HTTPException with status 401.
4. WHEN `get_current_user()` is called and no generic validator is available, THE Auth_Dependency SHALL raise an HTTPException with status 500 and detail containing "Authentication service not configured".
5. WHEN `get_current_user_trusted()` receives valid Bearer credentials, THE Auth_Dependency SHALL decode the JWT without signature verification and return a User object using provider-specific claim mappings.
6. WHEN `get_current_user_trusted()` receives a malformed token, THE Auth_Dependency SHALL raise an HTTPException with status 401 and detail "Malformed token.".
7. WHEN `get_current_user_trusted()` is called with no generic validator available, THE Auth_Dependency SHALL fall back to standard OIDC claims (`sub`, `email`, `name`, `roles`).
8. WHEN `get_current_user_trusted()` extracts a token with a missing `user_id` claim, THE Auth_Dependency SHALL raise an HTTPException with status 401 and detail "Invalid user.".
9. WHEN `get_current_user_id()` is called, THE Auth_Dependency SHALL return only the `user_id` string from the authenticated User.

### Requirement 4: RBAC Role Checker Tests

**User Story:** As a developer, I want tests for the RBAC role-checking utilities, so that I can verify OR-logic, AND-logic, predefined role checkers, and edge cases like empty role lists.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in `rbac.py` for `require_roles()`, `require_all_roles()`, `has_any_role()`, `has_all_roles()`, and any predefined role checkers, verifying they accurately describe the current behavior, and update or remove any that are stale, misleading, or incorrect.
2. WHEN `require_roles("Admin", "SuperAdmin")` is used and the user has the "Admin" role, THE RBAC_Checker SHALL return the User object (access granted).
2. WHEN `require_roles("Admin", "SuperAdmin")` is used and the user has neither role, THE RBAC_Checker SHALL raise an HTTPException with status 403.
3. WHEN `require_all_roles("Admin", "Security")` is used and the user has both roles, THE RBAC_Checker SHALL return the User object (access granted).
4. WHEN `require_all_roles("Admin", "Security")` is used and the user is missing the "Security" role, THE RBAC_Checker SHALL raise an HTTPException with status 403 and detail listing the missing roles.
5. WHEN `require_roles()` or `require_all_roles()` is used and the user has an empty roles list, THE RBAC_Checker SHALL raise an HTTPException with status 403 and detail "User has no assigned roles.".
6. WHEN `has_any_role(user, "Admin", "Faculty")` is called and the user has "Faculty", THE RBAC_Checker SHALL return True.
7. WHEN `has_any_role(user, "Admin")` is called and the user has no matching role, THE RBAC_Checker SHALL return False.
8. WHEN `has_all_roles(user, "Admin", "Security")` is called and the user has both, THE RBAC_Checker SHALL return True.
9. WHEN `has_all_roles(user, "Admin", "Security")` is called and the user is missing one, THE RBAC_Checker SHALL return False.
10. WHEN `has_any_role()` or `has_all_roles()` is called with a user whose roles list is empty, THE RBAC_Checker SHALL return False.
11. THE RBAC_Checker predefined `require_admin` SHALL accept users with "Admin", "SuperAdmin", or "DotNetDevelopers" roles.

### Requirement 5: AppRoleService Permission Resolution Tests

**User Story:** As a developer, I want tests for the AppRoleService permission resolution, so that I can verify JWT-to-AppRole mapping, permission merging (union for tools/models, highest priority for quota), wildcard handling, caching, and default role fallback.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the `AppRoleService` source file, verifying they accurately describe the permission resolution pipeline, merge logic, caching behavior, wildcard handling, and default role fallback, and update or remove any that are stale, misleading, or incorrect.
2. WHEN a user has JWT roles that map to multiple AppRoles, THE AppRole_Service SHALL merge tools as a union of all roles' effective tools.
2. WHEN a user has JWT roles that map to multiple AppRoles, THE AppRole_Service SHALL merge models as a union of all roles' effective models.
3. WHEN a user has JWT roles that map to multiple AppRoles with different quota tiers, THE AppRole_Service SHALL select the quota tier from the highest-priority role.
4. WHEN a user has JWT roles that match no AppRoles, THE AppRole_Service SHALL fall back to the "default" role if it exists and is enabled.
5. WHEN a user has JWT roles that match no AppRoles and no default role exists, THE AppRole_Service SHALL return empty permissions.
6. WHEN any matching AppRole has a wildcard ("*") in its tools, THE AppRole_Service SHALL include "*" in the merged tools list.
7. WHEN `can_access_tool()` is called and the user's permissions contain "*" in tools, THE AppRole_Service SHALL return True for any tool_id.
8. WHEN `can_access_tool()` is called and the tool_id is in the user's tools list, THE AppRole_Service SHALL return True.
9. WHEN `can_access_tool()` is called and the tool_id is not in the user's tools list and no wildcard exists, THE AppRole_Service SHALL return False.
10. WHEN `resolve_user_permissions()` is called twice for the same user, THE AppRole_Service SHALL return the cached result on the second call without querying the repository.
11. WHEN the cache is empty and `resolve_user_permissions()` is called, THE AppRole_Service SHALL query the repository for JWT mappings and cache the results.
12. THE AppRole_Service SHALL only include enabled AppRoles when merging permissions.
13. FOR ALL sets of AppRoles with tools lists, merging permissions SHALL produce a tools list that is a superset of each individual role's tools (union property).
14. FOR ALL sets of AppRoles, merging permissions and then merging again with the same roles SHALL produce an identical result (idempotence property).

### Requirement 6: AppRoleAdminService CRUD and Inheritance Tests

**User Story:** As a developer, I want tests for the AppRoleAdminService, so that I can verify role creation, update, deletion, inheritance resolution, system role protection, and cache invalidation.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the `AppRoleAdminService` source file, verifying they accurately describe the CRUD lifecycle, inheritance resolution, system role protection rules, and cache invalidation triggers, and update or remove any that are stale, misleading, or incorrect.
2. WHEN `create_role()` is called with valid data, THE AppRole_Admin_Service SHALL create the role in the repository with computed effective permissions and return the created AppRole.
2. WHEN `create_role()` is called with an `inherits_from` list referencing a non-existent role, THE AppRole_Admin_Service SHALL raise a ValueError.
3. WHEN `create_role()` is called and the role already exists, THE AppRole_Admin_Service SHALL raise a ValueError.
4. WHEN `update_role()` is called on the "system_admin" role with fields other than `display_name` or `description`, THE AppRole_Admin_Service SHALL raise a ValueError listing the protected fields.
5. WHEN `delete_role()` is called on a system role, THE AppRole_Admin_Service SHALL raise a ValueError with detail "Cannot delete system role".
6. WHEN `delete_role()` is called on a non-system role, THE AppRole_Admin_Service SHALL delete the role and invalidate relevant caches.
7. WHEN a role inherits from a parent role, THE AppRole_Admin_Service SHALL compute effective permissions by merging the role's granted_tools with the parent's granted_tools (union).
8. WHEN `update_role()` modifies `jwt_role_mappings`, THE AppRole_Admin_Service SHALL invalidate the JWT mapping cache for affected mappings.
9. WHEN `add_tool_to_role()` is called with a tool not already in the role, THE AppRole_Admin_Service SHALL add the tool and recompute effective permissions.
10. WHEN `remove_tool_from_role()` is called with a tool in the role, THE AppRole_Admin_Service SHALL remove the tool and recompute effective permissions.

### Requirement 7: AppRoleCache TTL and Invalidation Tests

**User Story:** As a developer, I want tests for the AppRoleCache, so that I can verify TTL expiration, cache hit/miss behavior, and targeted invalidation.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the `AppRoleCache` source file, verifying they accurately describe each cache layer, the TTL mechanism, and the invalidation cascade behavior, and update or remove any that are stale, misleading, or incorrect.
2. WHEN a user permission entry is cached and retrieved before TTL expiration, THE AppRole_Cache SHALL return the cached value.
2. WHEN a user permission entry is cached and retrieved after TTL expiration, THE AppRole_Cache SHALL return None.
3. WHEN `invalidate_role()` is called, THE AppRole_Cache SHALL remove the role entry and clear all user permission caches.
4. WHEN `invalidate_jwt_mapping()` is called, THE AppRole_Cache SHALL remove the JWT mapping entry and clear all user permission caches.
5. WHEN `invalidate_all()` is called, THE AppRole_Cache SHALL clear all user, role, and JWT mapping caches.
6. WHEN `cleanup_expired()` is called, THE AppRole_Cache SHALL remove only expired entries from all cache layers.
7. THE AppRole_Cache `get_stats()` method SHALL return accurate counts of total and expired entries for each cache layer.

### Requirement 8: OIDC State Store Tests

**User Story:** As a developer, I want tests for the InMemoryStateStore, so that I can verify state storage, one-time retrieval, TTL expiration, and cleanup behavior.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the `InMemoryStateStore` source file, verifying they accurately describe the storage structure, TTL enforcement, one-time-use deletion semantics, and cleanup behavior, and update or remove any that are stale, misleading, or incorrect.
2. WHEN `store_state()` is called and then `get_and_delete_state()` is called with the same state, THE State_Store SHALL return `(True, OIDCStateData)` with the correct redirect_uri, code_verifier, nonce, and provider_id.
2. WHEN `get_and_delete_state()` is called a second time with the same state, THE State_Store SHALL return `(False, None)` because the state was consumed.
3. WHEN `get_and_delete_state()` is called with a state that was never stored, THE State_Store SHALL return `(False, None)`.
4. WHEN `store_state()` is called with a TTL of 0 seconds and `get_and_delete_state()` is called after the TTL expires, THE State_Store SHALL return `(False, None)`.
5. WHEN multiple states are stored and some expire, THE State_Store SHALL clean up only the expired entries during `_cleanup_expired()`.
6. FOR ALL state tokens stored with OIDCStateData, storing and then retrieving SHALL return data equivalent to the original (round-trip property).

### Requirement 9: PKCE Generation Tests

**User Story:** As a developer, I want tests for the PKCE code verifier and challenge generation, so that I can verify the S256 challenge method produces correct, spec-compliant values.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the PKCE generation code (`generate_pkce_pair()` and related helpers), verifying they accurately describe the verifier generation, S256 challenge computation, and base64url encoding, and update or remove any that are stale, misleading, or incorrect.
2. THE OIDC_Auth_Service `generate_pkce_pair()` function SHALL produce a code_verifier between 43 and 128 characters in length.
2. THE OIDC_Auth_Service `generate_pkce_pair()` function SHALL produce a code_challenge that equals `BASE64URL(SHA256(code_verifier))` with padding stripped.
3. FOR ALL generated PKCE pairs, recomputing `BASE64URL(SHA256(code_verifier))` SHALL equal the returned code_challenge (round-trip property).
4. WHEN `generate_pkce_pair()` is called multiple times, THE OIDC_Auth_Service SHALL produce unique code_verifier values each time.

### Requirement 10: GenericOIDCAuthService Flow Tests

**User Story:** As a developer, I want tests for the GenericOIDCAuthService, so that I can verify state generation, authorization URL building, token exchange with nonce validation, token refresh, and logout URL construction.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the `GenericOIDCAuthService` source file, verifying they accurately describe the OIDC flow methods (`generate_state`, `build_authorization_url`, `exchange_code_for_tokens`, `refresh_access_token`, `build_logout_url`) and how PKCE, nonce, and state interact, and update or remove any that are stale, misleading, or incorrect.
2. WHEN `generate_state()` is called, THE OIDC_Auth_Service SHALL store the state in the state store with the provider_id, code_verifier, nonce, and optional redirect_uri.
2. WHEN `build_authorization_url()` is called with PKCE enabled, THE OIDC_Auth_Service SHALL include `code_challenge` and `code_challenge_method=S256` in the URL parameters.
3. WHEN `build_authorization_url()` is called with PKCE disabled, THE OIDC_Auth_Service SHALL omit `code_challenge` and `code_challenge_method` from the URL parameters.
4. WHEN `exchange_code_for_tokens()` is called with an invalid state, THE OIDC_Auth_Service SHALL raise an HTTPException with status 400 and detail containing "Invalid or expired state".
5. WHEN `exchange_code_for_tokens()` receives an ID token with a nonce that does not match the stored nonce, THE OIDC_Auth_Service SHALL raise an HTTPException with status 400 and detail "ID token nonce validation failed.".
6. WHEN `exchange_code_for_tokens()` succeeds, THE OIDC_Auth_Service SHALL return a dict containing access_token, refresh_token, id_token, token_type, expires_in, scope, and provider_id.
7. WHEN `refresh_access_token()` receives a 400 response from the token endpoint, THE OIDC_Auth_Service SHALL raise an HTTPException with status 401 and detail containing "Invalid or expired refresh token".
8. WHEN `build_logout_url()` is called with a post_logout_redirect_uri, THE OIDC_Auth_Service SHALL append it as a query parameter to the logout endpoint.
9. WHEN `build_logout_url()` is called and no logout endpoint is configured, THE OIDC_Auth_Service SHALL return an empty string.

### Requirement 11: Auth Routes Integration Tests

**User Story:** As a developer, I want integration tests for the auth API routes, so that I can verify the full request/response cycle for providers listing, login initiation, token exchange, refresh, logout, and runtime endpoint resolution.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the auth router source file, verifying they accurately describe each endpoint's behavior, dependency injections, request/response schemas, and error handling, and update or remove any that are stale, misleading, or incorrect.
2. WHEN `GET /auth/providers` is called, THE Auth_Routes SHALL return a list of enabled providers with provider_id, display_name, logo_url, and button_color.
2. WHEN `GET /auth/login?provider_id=test` is called, THE Auth_Routes SHALL return an authorization_url and state token.
3. WHEN `GET /auth/login` is called with a non-existent provider_id, THE Auth_Routes SHALL return status 400.
4. WHEN `POST /auth/token` is called with a valid state and code, THE Auth_Routes SHALL return access_token, refresh_token, and token metadata.
5. WHEN `POST /auth/token` is called with an invalid state, THE Auth_Routes SHALL return status 400.
6. WHEN `POST /auth/refresh?provider_id=test` is called with a valid refresh token, THE Auth_Routes SHALL return a new access_token.
7. WHEN `GET /auth/logout?provider_id=test` is called, THE Auth_Routes SHALL return a logout_url.
8. WHEN `GET /auth/runtime-endpoint` is called by an authenticated user whose provider has a runtime endpoint, THE Auth_Routes SHALL return the runtime_endpoint_url, provider_id, and runtime_status.
9. WHEN `GET /auth/runtime-endpoint` is called without authentication, THE Auth_Routes SHALL return status 401.

### Requirement 12: Frontend AuthService Tests

**User Story:** As a developer, I want Vitest tests for the Angular AuthService, so that I can verify token storage, expiry checking, authentication state, login flow initiation, logout, and token refresh.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the Angular `AuthService` source file, verifying they accurately describe the signals, localStorage keys, token expiry buffer logic, `ensureAuthenticated()` refresh flow, and `login()` redirect construction, and update or remove any that are stale, misleading, or incorrect.
2. WHEN `storeTokens()` is called with a token response, THE Auth_Service_FE SHALL store access_token, refresh_token, and computed expiry timestamp in localStorage.
2. WHEN `getAccessToken()` is called after storing tokens, THE Auth_Service_FE SHALL return the stored access token.
3. WHEN `isTokenExpired()` is called and the token expiry is in the future beyond the buffer, THE Auth_Service_FE SHALL return false.
4. WHEN `isTokenExpired()` is called and the token expiry is within the buffer window, THE Auth_Service_FE SHALL return true.
5. WHEN `isTokenExpired()` is called and no expiry is stored, THE Auth_Service_FE SHALL return true.
6. WHEN `isAuthenticated()` is called with a valid non-expired token, THE Auth_Service_FE SHALL return true.
7. WHEN `isAuthenticated()` is called with no token, THE Auth_Service_FE SHALL return false.
8. WHEN `clearTokens()` is called, THE Auth_Service_FE SHALL remove access_token, refresh_token, token_expiry, and provider_id from localStorage and set currentProviderId signal to null.
9. WHEN `login()` is called, THE Auth_Service_FE SHALL store the state in sessionStorage and the provider_id in localStorage before redirecting.
10. WHEN `ensureAuthenticated()` is called with a valid token, THE Auth_Service_FE SHALL resolve without error.
11. WHEN `ensureAuthenticated()` is called with an expired token and refresh succeeds, THE Auth_Service_FE SHALL resolve without error after refreshing.
12. WHEN `ensureAuthenticated()` is called with no token, THE Auth_Service_FE SHALL throw an Error with message containing "not authenticated".

### Requirement 13: Frontend Auth Guard Tests

**User Story:** As a developer, I want Vitest tests for the authGuard and adminGuard, so that I can verify route protection, token refresh attempts, and role-based access control on the frontend.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the `authGuard` and `adminGuard` source files, verifying they accurately describe the guard logic, token refresh attempts, role checks, and redirect behavior, and update or remove any that are stale, misleading, or incorrect.
2. WHEN the user is authenticated, THE Auth_Guard SHALL return true and allow navigation.
2. WHEN the user is not authenticated and has no token, THE Auth_Guard SHALL navigate to `/auth/login` with the returnUrl query parameter and return false.
3. WHEN the user has an expired token and refresh succeeds, THE Auth_Guard SHALL return true.
4. WHEN the user has an expired token and refresh fails, THE Auth_Guard SHALL navigate to `/auth/login` and return false.
5. WHEN the user is authenticated and has an admin role, THE Admin_Guard SHALL return true.
6. WHEN the user is authenticated but lacks admin roles, THE Admin_Guard SHALL navigate to `/` and return false.
7. WHEN the user is not authenticated, THE Admin_Guard SHALL navigate to `/auth/login` and return false.

### Requirement 14: Frontend Auth Interceptor Tests

**User Story:** As a developer, I want Vitest tests for the authInterceptor and errorInterceptor, so that I can verify token attachment, auth endpoint skipping, 401 retry with refresh, and error handling behavior.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the `authInterceptor` and `errorInterceptor` source files, verifying they accurately describe the token attachment logic, auth endpoint skip list, 401 retry mechanism, streaming/silent endpoint detection, and error delegation, and update or remove any that are stale, misleading, or incorrect.
2. WHEN a request is made to a non-auth endpoint and a token exists, THE Auth_Interceptor SHALL clone the request with an `Authorization: Bearer {token}` header.
2. WHEN a request is made to an auth endpoint (`/auth/login`, `/auth/token`, `/auth/refresh`, `/auth/providers`), THE Auth_Interceptor SHALL pass the request through without modification.
3. WHEN a request is made with no token, THE Auth_Interceptor SHALL pass the request through without an Authorization header.
4. WHEN the token is expired before the request, THE Auth_Interceptor SHALL attempt to refresh the token and then attach the new token.
5. WHEN a request returns a 401 error, THE Auth_Interceptor SHALL attempt to refresh the token and retry the request once.
6. WHEN a 401 retry refresh fails, THE Auth_Interceptor SHALL clear tokens and propagate the original error.
7. WHEN a non-streaming request returns an HTTP error, THE Error_Interceptor SHALL call `errorService.handleHttpError()` with the error.
8. WHEN a streaming endpoint (`/invocations`, `/chat/stream`) returns an error, THE Error_Interceptor SHALL skip error handling and let the error propagate.
9. WHEN a silent endpoint (`/health`, `/ping`) returns an error, THE Error_Interceptor SHALL skip displaying the error to the user.

### Requirement 15: Property-Based Tests for Permission Merging

**User Story:** As a developer, I want property-based tests using Hypothesis (backend) and fast-check (frontend) for permission merging and token generation, so that I can verify invariants hold across a wide range of inputs.

#### Acceptance Criteria

1. BEFORE writing tests, THE developer SHALL review all inline comments and docstrings in the `AppRoleService._merge_permissions()`, `generate_pkce_pair()`, `InMemoryStateStore`, `has_any_role()`, and `has_all_roles()` source code, verifying they accurately describe the invariants being tested (union, idempotence, round-trip, set intersection, subset), and update or remove any that are stale, misleading, or incorrect.
2. FOR ALL lists of AppRoles with arbitrary tools and models, THE AppRole_Service `_merge_permissions()` SHALL produce a tools set that is a superset of every individual role's effective tools (union invariant).
2. FOR ALL lists of AppRoles with arbitrary tools and models, THE AppRole_Service `_merge_permissions()` SHALL produce a models set that is a superset of every individual role's effective models (union invariant).
3. FOR ALL lists of AppRoles, merging permissions SHALL be idempotent: merging the same roles twice produces the same result.
4. FOR ALL lists of AppRoles with priorities, the selected quota_tier SHALL come from the role with the highest priority value.
5. FOR ALL PKCE pairs generated by `generate_pkce_pair()`, the code_challenge SHALL equal `BASE64URL(SHA256(code_verifier))` (round-trip property).
6. FOR ALL OIDCStateData objects stored in InMemoryStateStore, storing and then retrieving SHALL return equivalent data (round-trip property).
7. FOR ALL User objects with arbitrary role lists, `has_any_role(user, *roles)` SHALL return True if and only if the intersection of user.roles and roles is non-empty (set intersection property).
8. FOR ALL User objects with arbitrary role lists, `has_all_roles(user, *roles)` SHALL return True if and only if roles is a subset of user.roles (subset property).
