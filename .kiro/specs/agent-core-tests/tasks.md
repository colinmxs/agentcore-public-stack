# Implementation Plan: Agent Core Tests

## Overview

Build a comprehensive pytest test suite for `backend/src/agents/main_agent/` covering 25 requirements across 7 submodules. Tests are organized to mirror source structure, with shared fixtures first, simple dataclass/utility tests next, and complex integration-heavy tests last. All external dependencies are mocked. Property-based tests use Hypothesis.

All commands run inside Docker: `docker compose exec dev <command>`

## Tasks

- [x] 1. Create shared test fixtures and directory structure
  - [x] 1.1 Create `backend/tests/agents/main_agent/conftest.py` with shared fixtures
    - Create directory structure: `core/`, `tools/`, `multimodal/`, `streaming/`, `session/`, `integrations/`, `utils/`, `property/`
    - Add `__init__.py` files for each subdirectory
    - Implement fixtures: `tool_registry`, `tool_filter`, `model_config`, `retry_config`, `preview_session`, `mock_agent`, `sample_files`
    - _Requirements: All (shared infrastructure)_

  - [x] 1.2 Create `backend/tests/agents/main_agent/property/conftest.py` with Hypothesis strategies
    - Implement strategies: `st_model_config`, `st_retry_config`, `st_compaction_state`, `st_filename`, `st_tool_ids`, `st_sse_event_dict`
    - _Requirements: 1.13, 2.4, 5.9, 6.7, 10.4, 10.5, 12.9, 12.10, 14.8, 16.5, 23.9_

- [x] 2. Checkpoint - Ensure fixtures load correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Core submodule tests — dataclasses and configuration
  - [x] 3.1 Create `backend/tests/agents/main_agent/core/test_model_config.py`
    - Test ModelConfig defaults, `get_provider` for Bedrock/OpenAI/Gemini model IDs, explicit provider override
    - Test `to_bedrock_config` with/without caching and retry, `to_openai_config`, `to_gemini_config` with max_tokens
    - Test `to_dict`, `from_params` with defaults and invalid provider
    - _Requirements: 1.1–1.12_

  - [x] 3.2 Create RetryConfig tests in `test_model_config.py`
    - Test default values, `from_env` with and without environment variables
    - _Requirements: 2.1–2.3_

  - [x] 3.3 Create `backend/tests/agents/main_agent/core/test_system_prompt_builder.py`
    - Test `build` with include_date True/False, custom base_prompt, `from_user_prompt`
    - Test DEFAULT_SYSTEM_PROMPT contains expected key phrases
    - _Requirements: 3.1–3.5_

  - [x] 3.4 Create `backend/tests/agents/main_agent/core/test_agent_factory.py`
    - Test `create_agent` for Bedrock, OpenAI (with/without API key), Gemini (with/without API key)
    - Test retry_strategy passed for Bedrock, None for others
    - Test SequentialToolExecutor is passed
    - Mock `strands.Agent`, `BedrockModel`, `OpenAIModel`, `GeminiModel`
    - _Requirements: 4.1–4.8_

- [x] 4. Tools submodule tests
  - [x] 4.1 Create `backend/tests/agents/main_agent/tools/test_tool_registry.py`
    - Test empty registry, register/get/has tool, unregistered tool returns None/False
    - Test `register_module_tools` with and without `__all__`, `get_all_tool_ids`, `get_tool_count`
    - _Requirements: 5.1–5.8_

  - [x] 4.2 Create `backend/tests/agents/main_agent/tools/test_tool_filter.py`
    - Test empty/None enabled_tool_ids, local tool filtering, gateway tool filtering, unrecognized IDs
    - Test `set_external_mcp_tools` + `filter_tools_extended`, `get_statistics` counts
    - _Requirements: 6.1–6.6_

  - [x] 4.3 Create `backend/tests/agents/main_agent/tools/test_tool_catalog.py`
    - Test `get_all_tools`, `get_tool` valid/invalid, `get_tools_by_category`
    - Test `add_gateway_tool` auto-prefix, `ToolMetadata.to_dict` camelCase keys
    - _Requirements: 7.1–7.6_

- [x] 5. Multimodal submodule tests
  - [x] 5.1 Create `backend/tests/agents/main_agent/multimodal/test_image_handler.py`
    - Test `is_image` by content_type, by extension, negative case
    - Test `get_image_format` for png/jpeg/default, `create_content_block` structure
    - _Requirements: 8.1–8.7_

  - [x] 5.2 Create `backend/tests/agents/main_agent/multimodal/test_document_handler.py`
    - Test `is_document` for all supported/unsupported extensions
    - Test `get_document_format` mapping and default, `create_content_block` structure
    - _Requirements: 9.1–9.5_

  - [x] 5.3 Create `backend/tests/agents/main_agent/multimodal/test_file_sanitizer.py`
    - Test special character replacement, whitespace collapsing, trimming
    - _Requirements: 10.1–10.3_

  - [x] 5.4 Create `backend/tests/agents/main_agent/multimodal/test_prompt_builder.py`
    - Test `build_prompt` with no files (plain string), with images, with documents, with unsupported files
    - Test `get_content_type_summary` for text-only and multimodal, attached files marker
    - _Requirements: 11.1–11.8_

- [x] 6. Checkpoint - Ensure all dataclass and handler tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Streaming submodule tests
  - [x] 7.1 Create `backend/tests/agents/main_agent/streaming/test_event_formatter.py`
    - Test `format_sse_event` format, non-serializable error handling
    - Test `create_init_event`, `create_response_event`, `create_tool_use_event`, `create_complete_event`, `create_error_event`
    - Test `extract_final_result_data`
    - _Requirements: 12.1–12.8_

  - [x] 7.2 Create `backend/tests/agents/main_agent/streaming/test_tool_result_processor.py`
    - Test text extraction, image extraction, JSON content with embedded images, empty content
    - _Requirements: 13.1–13.4_

  - [x] 7.3 Create `backend/tests/agents/main_agent/streaming/test_stream_processor.py`
    - Test `_handle_lifecycle_events`, `_handle_content_block_events`, `_handle_tool_events`
    - Test `_handle_reasoning_events`, `_handle_citation_events`, `_handle_metadata_events`
    - Test `_serialize_object` with primitives, datetime, UUID, Decimal, dicts, lists, __dict__ objects
    - _Requirements: 23.1–23.8_

- [x] 8. Session submodule tests
  - [x] 8.1 Create `backend/tests/agents/main_agent/session/test_compaction_models.py`
    - Test CompactionState defaults, `to_dict` camelCase, `from_dict` valid/None/empty
    - Test CompactionConfig `from_env` with and without env vars
    - _Requirements: 16.1–16.4, 16.6–16.7_

  - [x] 8.2 Create `backend/tests/agents/main_agent/session/test_memory_config.py`
    - Test `load_memory_config` with/without AGENTCORE_MEMORY_ID, region handling, `is_cloud_mode`
    - _Requirements: 17.1–17.5_

  - [x] 8.3 Create `backend/tests/agents/main_agent/session/test_stop_hook.py`
    - Test `check_cancelled` when cancelled=True, cancelled=False, no cancelled attribute
    - _Requirements: 18.1–18.3_

  - [x] 8.4 Create `backend/tests/agents/main_agent/session/test_preview_session_manager.py`
    - Test init with zero messages, `create_message`, `read_session` returns copy
    - Test `clear_session`, `is_preview_session`, `_initialize_agent` with/without messages
    - _Requirements: 14.1–14.7_

  - [x] 8.5 Create `backend/tests/agents/main_agent/session/test_session_factory.py`
    - Test preview session creation, cloud session creation with memory available
    - Test RuntimeError when memory unavailable, `is_cloud_mode`
    - Mock `bedrock_agentcore.memory` availability
    - _Requirements: 15.1–15.4_

- [x] 9. Integrations submodule tests
  - [x] 9.1 Create `backend/tests/agents/main_agent/integrations/test_oauth_auth.py`
    - Test `OAuthBearerAuth` with static token, token_provider callback, None token, missing both
    - Test `CompositeAuth` applies all handlers in order
    - Mock `httpx.Request`
    - _Requirements: 19.1–19.5_

  - [x] 9.2 Create `backend/tests/agents/main_agent/integrations/test_gateway_auth.py`
    - Test `SigV4HTTPXAuth.auth_flow` adds signature headers, removes connection header
    - Test `get_gateway_region_from_url` extraction, fallback, ValueError
    - Mock `boto3.Session`, `botocore.auth.SigV4Auth`
    - _Requirements: 20.1–20.5_

  - [x] 9.3 Create `backend/tests/agents/main_agent/integrations/test_gateway_mcp_client.py`
    - Test `FilteredMCPClient` stores enabled_tool_ids and prefix
    - Test `get_gateway_client_if_enabled` returns None when disabled, None when no gateway IDs
    - _Requirements: 24.1–24.3_

  - [x] 9.4 Create `backend/tests/agents/main_agent/integrations/test_external_mcp_client.py`
    - Test `extract_region_from_url` for standard URLs and non-matching URLs
    - Test `detect_aws_service_from_url` for known patterns
    - _Requirements: 25.1–25.3_

- [x] 10. Utils submodule tests
  - [x] 10.1 Create `backend/tests/agents/main_agent/utils/test_timezone.py`
    - Test format "YYYY-MM-DD (DayName) HH:00 TZ", timezone is PST or PDT
    - Test UTC fallback when timezone libraries unavailable
    - _Requirements: 21.1–21.3_

  - [x] 10.2 Create `backend/tests/agents/main_agent/utils/test_global_state.py`
    - Test `set_global_stream_processor` accepts any arg, `get_global_stream_processor` returns None
    - _Requirements: 22.1–22.2_

- [x] 11. Checkpoint - Ensure all unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Property-based tests
  - [x] 12.1 Create `backend/tests/agents/main_agent/property/test_pbt_agent_core.py`
    - [x] 12.1.1 Write property test for ModelConfig round-trip
      - **Property 1: ModelConfig round-trip**
      - **Validates: Requirements 1.13**

    - [x] 12.1.2 Write property test for RetryConfig delay invariant
      - **Property 2: RetryConfig delay invariant**
      - **Validates: Requirements 2.4**

    - [x] 12.1.3 Write property test for ToolRegistry count invariant
      - **Property 3: ToolRegistry count invariant**
      - **Validates: Requirements 5.9**

    - [x] 12.1.4 Write property test for ToolFilter partition invariant
      - **Property 4: ToolFilter partition invariant**
      - **Validates: Requirements 6.7**

    - [x] 12.1.5 Write property test for FileSanitizer output invariant and idempotence
      - **Property 5: FileSanitizer output invariant and idempotence**
      - **Validates: Requirements 10.4, 10.5**

    - [x] 12.1.6 Write property test for SSE format invariant and JSON round-trip
      - **Property 6: SSE format invariant and JSON round-trip**
      - **Validates: Requirements 12.9, 12.10**

    - [x] 12.1.7 Write property test for PreviewSessionManager count invariant
      - **Property 7: PreviewSessionManager count invariant**
      - **Validates: Requirements 14.8**

    - [x] 12.1.8 Write property test for CompactionState round-trip
      - **Property 8: CompactionState round-trip**
      - **Validates: Requirements 16.5**

    - [x] 12.1.9 Write property test for ProcessedEvent structural invariant
      - **Property 9: ProcessedEvent structural invariant**
      - **Validates: Requirements 23.9**

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Run full suite: `docker compose exec dev python -m pytest tests/agents/main_agent/ -v`
  - Verify coverage: `docker compose exec dev python -m pytest tests/agents/main_agent/ -v --cov=agents.main_agent`

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All commands must run inside Docker: `docker compose exec dev <command>`
- Workspace path inside container: `/workspace/bsu-org/agentcore-public-stack/`
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases from acceptance criteria
- Checkpoints ensure incremental validation at natural breakpoints
