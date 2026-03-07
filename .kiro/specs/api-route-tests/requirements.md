# Requirements Document

## Introduction

The AgentCore Public Stack backend has 15+ API route modules across two FastAPI applications (App API on port 8000, Inference API on port 8001) with zero route-level test coverage. This feature adds comprehensive API route tests using FastAPI TestClient, pytest-asyncio, and Hypothesis. The goal is to validate HTTP status codes, authentication enforcement, RBAC authorization, request validation, error handling, and response schemas for every route module. Tests will mock external dependencies (DynamoDB, S3, Bedrock, MCP) so they run fast and deterministically.

## Glossary

- **App_API**: The primary FastAPI application serving user-facing endpoints on port 8000 (sessions, files, chat, admin, etc.)
- **Inference_API**: The secondary FastAPI application serving AgentCore Runtime endpoints on port 8001 (ping, invocations, converse)
- **TestClient**: The `httpx.AsyncClient` or `fastapi.testclient.TestClient` used to send HTTP requests to a FastAPI app in tests without starting a real server
- **Route_Module**: A Python module containing FastAPI router definitions for a specific domain (e.g., `sessions/routes.py`, `files/routes.py`)
- **Auth_Dependency**: The `get_current_user` FastAPI dependency that extracts and validates JWT tokens, returning a `User` object
- **RBAC_Guard**: The `require_roles` or `require_all_roles` FastAPI dependency that checks user roles before granting access to a route
- **Dependency_Override**: FastAPI's `app.dependency_overrides` mechanism for replacing real dependencies with mocks during testing
- **Test_Fixture**: A pytest fixture providing reusable test setup such as mock users, authenticated clients, or service mocks
- **Hypothesis**: A property-based testing library that generates random inputs to find edge cases
- **Route_Test**: A test that sends an HTTP request to a route endpoint and asserts on the response status code, body, and headers


## Requirements

### Requirement 1: Shared Test Infrastructure

**User Story:** As a developer, I want reusable test fixtures and helpers for API route testing, so that I can write route tests consistently without duplicating mock setup across every module.

#### Acceptance Criteria

1. THE Test_Infrastructure SHALL provide a pytest fixture that creates an authenticated TestClient with Auth_Dependency overridden to return a configurable mock User
2. THE Test_Infrastructure SHALL provide a pytest fixture that creates an unauthenticated TestClient with no Auth_Dependency override
3. THE Test_Infrastructure SHALL provide factory fixtures for creating mock User objects with configurable user_id, email, and roles
4. THE Test_Infrastructure SHALL provide a pytest fixture that creates a TestClient with RBAC_Guard overridden to simulate users with specific roles
5. WHEN a test requires a mocked external service (DynamoDB, S3, Bedrock), THE Test_Infrastructure SHALL provide Dependency_Override fixtures that replace service dependencies with async mocks
6. THE Test_Infrastructure SHALL reside in a shared conftest.py accessible to all route test modules

### Requirement 2: Health Endpoint Tests

**User Story:** As a developer, I want tests for the health check endpoint, so that I can verify the service readiness probe works correctly.

#### Acceptance Criteria

1. WHEN a GET request is sent to /health, THE App_API SHALL return HTTP 200 with a JSON body containing "status", "service", and "version" fields
2. THE health response "status" field SHALL contain the value "healthy"
3. WHEN a GET request is sent to /ping, THE Inference_API SHALL return HTTP 200

### Requirement 3: Session Route Tests

**User Story:** As a developer, I want tests for all session management routes, so that I can verify session CRUD operations, pagination, and access control.

#### Acceptance Criteria

1. WHEN an authenticated user sends GET /sessions, THE App_API SHALL return HTTP 200 with a paginated list of sessions belonging to that user
2. WHEN an unauthenticated request is sent to GET /sessions, THE App_API SHALL return HTTP 401
3. WHEN an authenticated user sends GET /sessions with a valid limit parameter, THE App_API SHALL return at most that many sessions
4. WHEN an authenticated user sends GET /sessions/{session_id} for a session they own, THE App_API SHALL return HTTP 200 with session metadata
5. WHEN an authenticated user sends PUT /sessions/{session_id} with valid update data, THE App_API SHALL return HTTP 200 with updated metadata
6. WHEN an authenticated user sends DELETE /sessions/{session_id} for a session they own, THE App_API SHALL return HTTP 200
7. WHEN an authenticated user sends POST /sessions/bulk-delete with a list of session IDs, THE App_API SHALL return HTTP 200 with deletion results
8. WHEN an authenticated user sends GET /sessions/{session_id}/messages, THE App_API SHALL return HTTP 200 with the message history for that session

### Requirement 4: File Route Tests

**User Story:** As a developer, I want tests for file upload, listing, deletion, and quota routes, so that I can verify the file management lifecycle and quota enforcement.

#### Acceptance Criteria

1. WHEN an authenticated user sends POST /files/presign with a valid PresignRequest, THE App_API SHALL return HTTP 200 with a presigned URL and upload ID
2. WHEN an authenticated user sends POST /files/presign with an unsupported MIME type, THE App_API SHALL return HTTP 400
3. WHEN an authenticated user sends POST /files/presign with a file exceeding the size limit, THE App_API SHALL return HTTP 400
4. WHEN an authenticated user sends POST /files/presign and the user quota is exceeded, THE App_API SHALL return HTTP 403
5. WHEN an authenticated user sends POST /files/{upload_id}/complete for a valid upload, THE App_API SHALL return HTTP 200
6. WHEN an authenticated user sends POST /files/{upload_id}/complete for a nonexistent upload, THE App_API SHALL return HTTP 404
7. WHEN an authenticated user sends GET /files, THE App_API SHALL return HTTP 200 with a paginated file list
8. WHEN an authenticated user sends DELETE /files/{upload_id} for a file they own, THE App_API SHALL return HTTP 204
9. WHEN an authenticated user sends DELETE /files/{upload_id} for a nonexistent file, THE App_API SHALL return HTTP 404
10. WHEN an authenticated user sends GET /files/quota, THE App_API SHALL return HTTP 200 with quota usage data

### Requirement 5: Chat Route Tests

**User Story:** As a developer, I want tests for chat and title generation routes, so that I can verify chat request handling and streaming response initiation.

#### Acceptance Criteria

1. WHEN an authenticated user sends POST /chat/title with a valid GenerateTitleRequest, THE App_API SHALL return HTTP 200 with a generated title
2. WHEN an unauthenticated request is sent to POST /chat/title, THE App_API SHALL return HTTP 401
3. WHEN an authenticated user sends POST /chat/stream with a valid ChatRequest, THE App_API SHALL return a streaming response with content-type text/event-stream
4. WHEN an authenticated user sends POST /chat/multimodal with a valid ChatRequest, THE App_API SHALL return a streaming response

### Requirement 6: Authentication Route Tests

**User Story:** As a developer, I want tests for authentication routes, so that I can verify login flows, provider listing, and token handling.

#### Acceptance Criteria

1. WHEN a GET request is sent to the auth providers endpoint, THE App_API SHALL return HTTP 200 with a list of configured authentication providers
2. WHEN no authentication providers are configured, THE App_API SHALL return HTTP 200 with an empty list
3. WHEN a valid authentication callback is received, THE App_API SHALL process the callback and return appropriate tokens
4. IF an invalid or expired callback state is received, THEN THE App_API SHALL return HTTP 400 or HTTP 401

### Requirement 7: Admin Route Tests with RBAC

**User Story:** As a developer, I want tests for admin routes, so that I can verify that RBAC guards correctly restrict access and that admin operations work for authorized users.

#### Acceptance Criteria

1. WHEN a user with Admin role sends a request to an admin endpoint, THE App_API SHALL return HTTP 200 with the requested data
2. WHEN a user without Admin role sends a request to an admin endpoint, THE App_API SHALL return HTTP 403
3. WHEN a user with no roles sends a request to an admin endpoint, THE App_API SHALL return HTTP 403
4. WHEN an unauthenticated request is sent to an admin endpoint, THE App_API SHALL return HTTP 401
5. WHEN an admin user sends GET to the managed models endpoint, THE App_API SHALL return HTTP 200 with a list of models
6. WHEN an admin user sends POST to create a managed model with valid data, THE App_API SHALL return HTTP 200 with the created model
7. WHEN an admin user sends DELETE to remove a managed model, THE App_API SHALL return HTTP 200

### Requirement 8: Tools Route Tests

**User Story:** As a developer, I want tests for tool discovery and management routes, so that I can verify tool listing and permission handling.

#### Acceptance Criteria

1. WHEN an authenticated user sends GET /tools, THE App_API SHALL return HTTP 200 with a list of available tools
2. WHEN an unauthenticated request is sent to GET /tools, THE App_API SHALL return HTTP 401

### Requirement 9: Memory Route Tests

**User Story:** As a developer, I want tests for memory management routes, so that I can verify memory retrieval and management operations.

#### Acceptance Criteria

1. WHEN an authenticated user sends a request to a memory endpoint, THE App_API SHALL return HTTP 200 with memory data
2. WHEN an unauthenticated request is sent to a memory endpoint, THE App_API SHALL return HTTP 401

### Requirement 10: Costs Route Tests

**User Story:** As a developer, I want tests for cost tracking routes, so that I can verify cost data retrieval for users.

#### Acceptance Criteria

1. WHEN an authenticated user sends a request to the costs endpoint, THE App_API SHALL return HTTP 200 with cost data for that user
2. WHEN an unauthenticated request is sent to the costs endpoint, THE App_API SHALL return HTTP 401

### Requirement 11: Users Route Tests

**User Story:** As a developer, I want tests for user profile routes, so that I can verify user data retrieval and updates.

#### Acceptance Criteria

1. WHEN an authenticated user sends a request to the users endpoint, THE App_API SHALL return HTTP 200 with user profile data
2. WHEN an unauthenticated request is sent to the users endpoint, THE App_API SHALL return HTTP 401

### Requirement 12: Models Route Tests

**User Story:** As a developer, I want tests for the models listing route, so that I can verify model discovery works correctly.

#### Acceptance Criteria

1. WHEN an authenticated user sends GET /models, THE App_API SHALL return HTTP 200 with available model data
2. WHEN an unauthenticated request is sent to GET /models, THE App_API SHALL return HTTP 401

### Requirement 13: Assistants Route Tests

**User Story:** As a developer, I want tests for assistant configuration routes, so that I can verify assistant CRUD operations.

#### Acceptance Criteria

1. WHEN an authenticated user sends a request to the assistants endpoint, THE App_API SHALL return HTTP 200 with assistant data
2. WHEN an unauthenticated request is sent to the assistants endpoint, THE App_API SHALL return HTTP 401

### Requirement 14: Documents Route Tests

**User Story:** As a developer, I want tests for document management routes, so that I can verify document operations.

#### Acceptance Criteria

1. WHEN an authenticated user sends a request to the documents endpoint, THE App_API SHALL return HTTP 200 with document data
2. WHEN an unauthenticated request is sent to the documents endpoint, THE App_API SHALL return HTTP 401

### Requirement 15: Inference API Route Tests

**User Story:** As a developer, I want tests for the Inference API endpoints, so that I can verify the AgentCore Runtime contract (ping and invocations).

#### Acceptance Criteria

1. WHEN a GET request is sent to /ping, THE Inference_API SHALL return HTTP 200
2. WHEN a POST request is sent to /invocations with a valid payload, THE Inference_API SHALL return a streaming response
3. WHEN a POST request is sent to /invocations with an invalid payload, THE Inference_API SHALL return HTTP 422

### Requirement 16: Request Validation with Property-Based Testing

**User Story:** As a developer, I want property-based tests for request validation, so that I can verify routes reject malformed inputs across a wide range of generated payloads.

#### Acceptance Criteria

1. FOR ALL randomly generated invalid session IDs, WHEN sent to GET /sessions/{session_id}, THE App_API SHALL return HTTP 404 or HTTP 422
2. FOR ALL randomly generated PresignRequest payloads with invalid MIME types, WHEN sent to POST /files/presign, THE App_API SHALL return HTTP 400
3. FOR ALL randomly generated payloads missing required fields, WHEN sent to a route expecting a request body, THE App_API SHALL return HTTP 422

### Requirement 17: Authentication Enforcement Across All Routes

**User Story:** As a developer, I want a systematic test that verifies every protected route rejects unauthenticated requests, so that I can be confident no route accidentally exposes data without auth.

#### Acceptance Criteria

1. FOR ALL protected routes in App_API, WHEN an unauthenticated request is sent, THE App_API SHALL return HTTP 401
2. FOR ALL protected routes in App_API, WHEN a request with an expired or invalid token is sent, THE App_API SHALL return HTTP 401
3. THE health endpoint SHALL remain accessible without authentication


