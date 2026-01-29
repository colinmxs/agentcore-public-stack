# Backend Architecture Cleanup - Tasks

## Phase 1: Shared Library Extraction

### 1. Create Shared Sessions Module

- [ ] 1.1 Create `apis/shared/sessions/__init__.py` with module exports
- [ ] 1.2 Copy session models from `apis/app_api/sessions/models.py` to `apis/shared/sessions/models.py`
- [ ] 1.3 Copy metadata operations from `apis/app_api/sessions/services/metadata.py` to `apis/shared/sessions/metadata.py`
- [ ] 1.4 Copy message operations from `apis/app_api/sessions/services/messages.py` to `apis/shared/sessions/messages.py`
- [ ] 1.5 Update imports within shared sessions module to use relative imports
- [ ] 1.6 Verify shared sessions module can be imported without errors

### 2. Create Shared Files Module

- [ ] 2.1 Create `apis/shared/files/__init__.py` with module exports
- [ ] 2.2 Copy file models from `apis/app_api/files/models.py` to `apis/shared/files/models.py`
- [ ] 2.3 Copy file resolver from `apis/app_api/files/file_resolver.py` to `apis/shared/files/file_resolver.py`
- [ ] 2.4 Copy file repository from `apis/app_api/files/repository.py` to `apis/shared/files/repository.py`
- [ ] 2.5 Update imports within shared files module to use relative imports
- [ ] 2.6 Verify shared files module can be imported without errors

### 3. Create Shared Models Module

- [ ] 3.1 Create `apis/shared/models/__init__.py` with module exports
- [ ] 3.2 Copy managed models service from `apis/app_api/admin/services/managed_models.py` to `apis/shared/models/managed_models.py`
- [ ] 3.3 Extract model data models to `apis/shared/models/models.py`
- [ ] 3.4 Update imports within shared models module to use relative imports
- [ ] 3.5 Verify shared models module can be imported without errors

### 4. Create Shared Assistants Module

- [ ] 4.1 Create `apis/shared/assistants/__init__.py` with module exports
- [ ] 4.2 Copy assistant models from `apis/app_api/assistants/models.py` to `apis/shared/assistants/models.py`
- [ ] 4.3 Copy core assistant service from `apis/app_api/assistants/services/assistant_service.py` to `apis/shared/assistants/service.py`
- [ ] 4.4 Copy RAG service from `apis/app_api/assistants/services/rag_service.py` to `apis/shared/assistants/rag_service.py`
- [ ] 4.5 Update imports within shared assistants module to use relative imports
- [ ] 4.6 Verify shared assistants module can be imported without errors

### 5. Update Inference API Imports

- [ ] 5.1 Update `apis/inference_api/chat/service.py` to import from `apis.shared.sessions`
- [ ] 5.2 Update `apis/inference_api/chat/routes.py` to import sessions from `apis.shared.sessions`
- [ ] 5.3 Update `apis/inference_api/chat/routes.py` to import files from `apis.shared.files`
- [ ] 5.4 Update `apis/inference_api/chat/routes.py` to import models from `apis.shared.models`
- [ ] 5.5 Update `apis/inference_api/chat/routes.py` to import assistants from `apis.shared.assistants`
- [ ] 5.6 Verify inference API starts without import errors
- [ ] 5.7 Test inference API `/ping` endpoint
- [ ] 5.8 Test inference API `/invocations` endpoint with sample request

### 6. Update App API Imports

- [ ] 6.1 Update `apis/app_api/sessions/routes.py` to import from `apis.shared.sessions`
- [ ] 6.2 Update `apis/app_api/sessions/services/` files to import from `apis.shared.sessions`
- [ ] 6.3 Update `apis/app_api/files/routes.py` to import from `apis.shared.files`
- [ ] 6.4 Update `apis/app_api/files/service.py` to import from `apis.shared.files`
- [ ] 6.5 Update `apis/app_api/admin/routes.py` to import models from `apis.shared.models`
- [ ] 6.6 Update `apis/app_api/assistants/routes.py` to import from `apis.shared.assistants`
- [ ] 6.7 Update `apis/app_api/assistants/services/` files to import from `apis.shared.assistants`
- [ ] 6.8 Update `apis/app_api/chat/routes.py` to import from shared modules
- [ ] 6.9 Update `apis/app_api/memory/routes.py` to import from shared modules
- [ ] 6.10 Verify app API starts without import errors
- [ ] 6.11 Test app API health endpoint
- [ ] 6.12 Test app API session endpoints

### 7. Verify Independent Deployment

- [ ] 7.1 Build inference API Docker image independently
- [ ] 7.2 Build app API Docker image independently
- [ ] 7.3 Run inference API container and verify it starts
- [ ] 7.4 Run app API container and verify it starts
- [ ] 7.5 Verify no cross-API imports using static analysis
- [ ] 7.6 Run full test suite for both APIs

### 8. Clean Up Duplicate Code

- [ ] 8.1 Remove duplicate session code from `apis/app_api/sessions/models.py` (keep only app-specific)
- [ ] 8.2 Remove duplicate file code from `apis/app_api/files/` (keep only app-specific routes)
- [ ] 8.3 Remove duplicate model code from `apis/app_api/admin/services/managed_models.py` (keep only admin-specific)
- [ ] 8.4 Remove duplicate assistant code from `apis/app_api/assistants/` (keep only app-specific routes)
- [ ] 8.5 Update any remaining imports to use shared modules
- [ ] 8.6 Verify no broken imports after cleanup

## Phase 2: Exception Handling Improvements

### 9. Fix Session Metadata Error Handling

- [ ] 9.1 Update `store_session_metadata()` in `apis/shared/sessions/metadata.py` to propagate DynamoDB errors
- [ ] 9.2 Update `store_session_metadata()` to propagate file storage errors
- [ ] 9.3 Update `get_session_metadata()` to propagate retrieval errors
- [ ] 9.4 Update `update_cost_summary()` to propagate errors (remove suppression)
- [ ] 9.5 Update `update_system_rollups()` to propagate errors (remove suppression)
- [ ] 9.6 Add justification comments for any remaining suppressions (e.g., title generation)
- [ ] 9.7 Add unit tests for error propagation in metadata operations
- [ ] 9.8 Test API returns 503 when DynamoDB is unavailable

### 10. Fix Storage Error Handling

- [ ] 10.1 Update `local_file_storage.py` session error handling to propagate failures
- [ ] 10.2 Update `dynamodb_storage.py` error handling to propagate failures
- [ ] 10.3 Add proper HTTPException with status codes for storage failures
- [ ] 10.4 Add unit tests for storage error propagation
- [ ] 10.5 Test API returns appropriate status codes for storage failures

### 11. Fix Managed Models Error Handling

- [ ] 11.1 Update `create_managed_model()` in `apis/shared/models/managed_models.py` to propagate errors
- [ ] 11.2 Update `update_managed_model()` to propagate errors
- [ ] 11.3 Update `delete_managed_model()` to propagate errors
- [ ] 11.4 Update `list_managed_models()` to propagate critical errors
- [ ] 11.5 Add proper HTTPException with status codes for model operations
- [ ] 11.6 Add unit tests for model operation error propagation
- [ ] 11.7 Test API returns appropriate status codes for model operation failures

### 12. Fix User Sync Error Handling

- [ ] 12.1 Review `apis/shared/users/sync.py` exception handling
- [ ] 12.2 Add justification comment for sync failure suppression (if appropriate)
- [ ] 12.3 Consider propagating critical sync failures (e.g., database errors)
- [ ] 12.4 Add unit tests for user sync error scenarios
- [ ] 12.5 Document when sync failures should/shouldn't break requests

### 13. Fix RBAC Seeder Error Handling

- [ ] 13.1 Review `apis/shared/rbac/seeder.py` exception handling
- [ ] 13.2 Add justification comment for role seeding suppression
- [ ] 13.3 Consider propagating critical seeding failures during startup
- [ ] 13.4 Add unit tests for seeder error scenarios
- [ ] 13.5 Document seeder error handling strategy

### 14. Fix Admin Routes Error Handling

- [ ] 14.1 Update Bedrock model listing error handling in `apis/app_api/admin/routes.py`
- [ ] 14.2 Update Gemini model listing error handling
- [ ] 14.3 Update OpenAI model listing error handling
- [ ] 14.4 Update enabled models CRUD error handling
- [ ] 14.5 Ensure all admin routes return appropriate status codes
- [ ] 14.6 Add integration tests for admin route error responses
- [ ] 14.7 Test API returns correct status codes for admin operation failures

### 15. Fix Model Access Error Handling

- [ ] 15.1 Update `apis/app_api/admin/services/model_access.py` permission check error handling
- [ ] 15.2 Decide if permission check failures should propagate or fall back
- [ ] 15.3 Add justification comments for any suppressions
- [ ] 15.4 Add unit tests for permission check error scenarios
- [ ] 15.5 Document permission check error handling strategy

### 16. Fix User Routes Error Handling

- [ ] 16.1 Update `apis/app_api/users/routes.py` user search error handling
- [ ] 16.2 Ensure user operations return appropriate status codes
- [ ] 16.3 Add integration tests for user route error responses
- [ ] 16.4 Test API returns correct status codes for user operation failures

### 17. Document Justified Suppressions

- [ ] 17.1 Add justification comment to title generation error handling
- [ ] 17.2 Add justification comment to telemetry/metrics error handling
- [ ] 17.3 Add justification comment to optional cache operations
- [ ] 17.4 Add justification comment to debug logging failures
- [ ] 17.5 Create list of all justified suppressions for code review

## Phase 3: Basic Validation (Deferred to Future Sprint)

Testing and comprehensive validation will be addressed in a future sprint.

## Phase 4: Documentation & Cleanup (Deferred to Future Sprint)

Documentation, monitoring setup, and final cleanup will be addressed in a future sprint.

## Notes

### Task Dependencies

- Phase 1 must complete before Phase 2 (need shared modules first)
- Phase 2 can be done incrementally (file-by-file)
- Phases 3 & 4 deferred to future sprint

### Estimated Effort

- Phase 1: 2-3 days (shared library extraction)
- Phase 2: 3-4 days (error handling improvements)
- **Total: 5-7 days**

### Risk Mitigation

- Test manually after each major change
- Keep rollback plan ready
- Start both APIs locally to verify imports work
- Monitor error logs during development

### Success Criteria (This Sprint)

✅ Zero imports from `apis.app_api` in `apis.inference_api`
✅ Shared library modules created and functional
✅ Both APIs start successfully with new imports
✅ Error handling improved in critical paths
✅ Justified suppressions documented with comments

### Deferred to Future Sprint

- Comprehensive unit tests
- Integration tests for error responses
- Static analysis for import independence
- Developer documentation
- Monitoring and alerting setup
