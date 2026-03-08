# Design Document: Agent Core Tests

## Overview

This design specifies a comprehensive test suite for the Agent Core module (`backend/src/agents/main_agent/`), covering 25 requirements across 7 submodules: core, tools, multimodal, streaming, session, integrations, and utils. The test suite uses pytest with pytest-asyncio for async tests and Hypothesis for property-based testing.

The test files mirror the source module structure under `backend/tests/agents/main_agent/`, with a dedicated `property/` subdirectory for Hypothesis-based property tests. All external dependencies (Strands Agents, boto3, AWS services, MCP clients) are mocked to ensure tests are fast, deterministic, and runnable without cloud credentials.

## Architecture

### Test File Organization

```
backend/tests/agents/main_agent/
├── conftest.py                          # Shared fixtures for all main_agent tests
├── core/
│   ├── test_model_config.py             # Req 1: ModelConfig, Req 2: RetryConfig
│   ├── test_system_prompt_builder.py    # Req 3: SystemPromptBuilder
│   └── test_agent_factory.py            # Req 4: AgentFactory
├── tools/
│   ├── test_tool_registry.py            # Req 5: ToolRegistry
│   ├── test_tool_filter.py              # Req 6: ToolFilter
│   └── test_tool_catalog.py             # Req 7: ToolCatalogService
├── multimodal/
│   ├── test_image_handler.py            # Req 8: ImageHandler
│   ├── test_document_handler.py         # Req 9: DocumentHandler
│   ├── test_file_sanitizer.py           # Req 10: FileSanitizer
│   └── test_prompt_builder.py           # Req 11: PromptBuilder
├── streaming/
│   ├── test_event_formatter.py          # Req 12: StreamEventFormatter
│   ├── test_tool_result_processor.py    # Req 13: ToolResultProcessor
│   └── test_stream_processor.py         # Req 23: Stream processor event handlers
├── session/
│   ├── test_preview_session_manager.py  # Req 14: PreviewSessionManager
│   ├── test_session_factory.py          # Req 15: SessionFactory
│   ├── test_compaction_models.py        # Req 16: CompactionState/Config
│   ├── test_memory_config.py            # Req 17: MemoryStorageConfig
│   └── test_stop_hook.py               # Req 18: StopHook
├── integrations/
│   ├── test_oauth_auth.py              # Req 19: OAuthBearerAuth, CompositeAuth
│   ├── test_gateway_auth.py            # Req 20: SigV4HTTPXAuth
│   ├── test_gateway_mcp_client.py      # Req 24: FilteredMCPClient
│   └── test_external_mcp_client.py     # Req 25: External MCP utilities
├── utils/
│   ├── test_timezone.py                # Req 21: get_current_date_pacific
│   └── test_global_state.py            # Req 22: Deprecated global state
└── property/
    ├── conftest.py                     # Shared Hypothesis strategies
    └── test_pbt_agent_core.py          # All property-based tests (8 properties)
```

### Mocking Strategy

All tests isolate the unit under test by mocking external dependencies:

| Dependency | Mock Approach |
|---|---|
| `strands.Agent`, `BedrockModel`, `OpenAIModel`, `GeminiModel` | `unittest.mock.patch` on constructors |
| `strands.models.CacheConfig` | `MagicMock` |
| `botocore.config.Config` | `MagicMock` |
| `boto3.Session` | `unittest.mock.patch` returning mock credentials/region |
| `bedrock_agentcore.memory.*` | `unittest.mock.patch` on imports; toggle `AGENTCORE_MEMORY_AVAILABLE` |
| `os.environ` | `monkeypatch.setenv` / `monkeypatch.delenv` via pytest fixtures |
| `httpx.Request` / `httpx.Response` | Direct construction with test data |
| `MCPClient`, `streamablehttp_client` | `unittest.mock.patch` |
| `strands.types.session.SessionMessage` | Direct construction or `MagicMock` |
| File I/O (ToolResultProcessor) | `unittest.mock.patch` on `open`, `os.makedirs` |

### Fixture Design

Shared fixtures in `conftest.py`:

- `tool_registry` — pre-populated `ToolRegistry` with 3-5 mock tools
- `tool_filter` — `ToolFilter` wrapping the `tool_registry` fixture
- `model_config` — default `ModelConfig` instance
- `retry_config` — default `RetryConfig` instance
- `preview_session` — `PreviewSessionManager` with a test session ID
- `mock_agent` — `MagicMock` with `.messages` attribute for session hook tests
- `sample_files` — list of mock `FileContent` objects (image, document, unsupported)

Hypothesis strategies in `property/conftest.py`:

- `st_model_config` — generates valid `ModelConfig` instances with random providers, temperatures, model IDs
- `st_retry_config` — generates `RetryConfig` with constrained delay values (`initial <= max`)
- `st_compaction_state` — generates `CompactionState` with random checkpoint, summary, token counts
- `st_filename` — generates arbitrary strings for sanitizer testing
- `st_tool_ids` — generates lists of tool IDs mixing local, gateway, external, and unknown
- `st_sse_event_dict` — generates valid event dictionaries with string keys and JSON-serializable values

## Components and Interfaces

### Unit Under Test → Test File Mapping

| Component | Source File | Test File | Key Methods Tested |
|---|---|---|---|
| `ModelConfig` | `core/model_config.py` | `core/test_model_config.py` | `get_provider`, `to_bedrock_config`, `to_openai_config`, `to_gemini_config`, `to_dict`, `from_params` |
| `RetryConfig` | `core/model_config.py` | `core/test_model_config.py` | `__init__`, `from_env` |
| `SystemPromptBuilder` | `core/system_prompt_builder.py` | `core/test_system_prompt_builder.py` | `build`, `from_user_prompt` |
| `AgentFactory` | `core/agent_factory.py` | `core/test_agent_factory.py` | `create_agent` (Bedrock/OpenAI/Gemini paths) |
| `ToolRegistry` | `tools/tool_registry.py` | `tools/test_tool_registry.py` | `register_tool`, `get_tool`, `has_tool`, `register_module_tools`, `get_all_tool_ids`, `get_tool_count` |
| `ToolFilter` | `tools/tool_filter.py` | `tools/test_tool_filter.py` | `filter_tools`, `filter_tools_extended`, `set_external_mcp_tools`, `get_statistics` |
| `ToolCatalogService` | `tools/tool_catalog.py` | `tools/test_tool_catalog.py` | `get_all_tools`, `get_tool`, `get_tools_by_category`, `add_gateway_tool`, `ToolMetadata.to_dict` |
| `ImageHandler` | `multimodal/image_handler.py` | `multimodal/test_image_handler.py` | `is_image`, `get_image_format`, `create_content_block` |
| `DocumentHandler` | `multimodal/document_handler.py` | `multimodal/test_document_handler.py` | `is_document`, `get_document_format`, `create_content_block` |
| `FileSanitizer` | `multimodal/file_sanitizer.py` | `multimodal/test_file_sanitizer.py` | `sanitize_filename` |
| `PromptBuilder` | `multimodal/prompt_builder.py` | `multimodal/test_prompt_builder.py` | `build_prompt`, `get_content_type_summary` |
| `StreamEventFormatter` | `streaming/event_formatter.py` | `streaming/test_event_formatter.py` | `format_sse_event`, `create_*_event`, `extract_final_result_data` |
| `ToolResultProcessor` | `streaming/tool_result_processor.py` | `streaming/test_tool_result_processor.py` | `process_tool_result`, `_extract_basic_content`, `_process_json_content` |
| Stream processor functions | `streaming/stream_processor.py` | `streaming/test_stream_processor.py` | `_handle_lifecycle_events`, `_handle_content_block_events`, `_handle_tool_events`, `_handle_reasoning_events`, `_handle_citation_events`, `_handle_metadata_events`, `_serialize_object` |
| `PreviewSessionManager` | `session/preview_session_manager.py` | `session/test_preview_session_manager.py` | `create_message`, `read_session`, `clear_session`, `message_count`, `_initialize_agent` |
| `SessionFactory` | `session/session_factory.py` | `session/test_session_factory.py` | `create_session_manager`, `is_cloud_mode` |
| `CompactionState` | `session/compaction_models.py` | `session/test_compaction_models.py` | `to_dict`, `from_dict` |
| `CompactionConfig` | `session/compaction_models.py` | `session/test_compaction_models.py` | `from_env` |
| `MemoryStorageConfig` | `session/memory_config.py` | `session/test_memory_config.py` | `load_memory_config`, `is_cloud_mode` |
| `StopHook` | `session/hooks/stop.py` | `session/test_stop_hook.py` | `check_cancelled` |
| `OAuthBearerAuth` | `integrations/oauth_auth.py` | `integrations/test_oauth_auth.py` | `auth_flow` |
| `CompositeAuth` | `integrations/oauth_auth.py` | `integrations/test_oauth_auth.py` | `auth_flow` |
| `SigV4HTTPXAuth` | `integrations/gateway_auth.py` | `integrations/test_gateway_auth.py` | `auth_flow`, `get_gateway_region_from_url` |
| `FilteredMCPClient` | `integrations/gateway_mcp_client.py` | `integrations/test_gateway_mcp_client.py` | `__init__`, `get_gateway_client_if_enabled` |
| External MCP utils | `integrations/external_mcp_client.py` | `integrations/test_external_mcp_client.py` | `extract_region_from_url`, `detect_aws_service_from_url` |
| `get_current_date_pacific` | `utils/timezone.py` | `utils/test_timezone.py` | `get_current_date_pacific` |
| Global state | `utils/global_state.py` | `utils/test_global_state.py` | `set_global_stream_processor`, `get_global_stream_processor` |

## Data Models

### Key Dataclasses Under Test

```python
# ModelConfig (core/model_config.py)
@dataclass
class ModelConfig:
    model_id: str          # Provider-specific model identifier
    temperature: float     # 0.0 - 1.0
    caching_enabled: bool  # Bedrock prompt caching
    provider: ModelProvider # BEDROCK | OPENAI | GEMINI
    max_tokens: Optional[int]
    retry_config: Optional[RetryConfig]

# RetryConfig (core/model_config.py)
@dataclass
class RetryConfig:
    boto_max_attempts: int     # Default: 3
    boto_retry_mode: str       # "legacy" | "standard" | "adaptive"
    connect_timeout: int       # Default: 5
    read_timeout: int          # Default: 120
    sdk_max_attempts: int      # Default: 4
    sdk_initial_delay: float   # Default: 2.0
    sdk_max_delay: float       # Default: 16.0

# CompactionState (session/compaction_models.py)
@dataclass
class CompactionState:
    checkpoint: int              # Message index to load from
    summary: Optional[str]       # Summary for skipped messages
    last_input_tokens: int       # Input tokens from last turn
    updated_at: Optional[str]    # ISO timestamp

# CompactionConfig (session/compaction_models.py)
@dataclass
class CompactionConfig:
    enabled: bool                # Default: False
    token_threshold: int         # Default: 100_000
    protected_turns: int         # Default: 2
    max_tool_content_length: int # Default: 500

# ToolMetadata (tools/tool_catalog.py)
@dataclass
class ToolMetadata:
    tool_id: str
    name: str
    description: str
    category: ToolCategory
    is_gateway_tool: bool
    requires_oauth_provider: Optional[str]
    icon: Optional[str]

# MemoryStorageConfig (session/memory_config.py)
@dataclass
class MemoryStorageConfig:
    memory_id: str
    region: str
```

### SSE Event Format

```
data: {"type": "<event_type>", ...payload}\n\n
```

All SSE events produced by `StreamEventFormatter` follow this wire format. The JSON payload always contains a `"type"` key. The `format_sse_event` method wraps any dict into this format.

### ProcessedEvent Format

```python
{"type": str, "data": dict}
```

All events produced by stream processor handler functions (`_handle_*`) follow this structure, enforced by the `_create_event` helper.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: ModelConfig round-trip

*For any* valid `ModelConfig` instance (with any provider, temperature, caching_enabled, model_id, and max_tokens), converting to a dictionary via `to_dict()` and then reconstructing via `from_params()` using those dictionary values should produce a `ModelConfig` whose `to_dict()` output is identical to the original's `to_dict()` output.

**Validates: Requirements 1.13**

### Property 2: RetryConfig delay invariant

*For any* `RetryConfig` instance constructed with valid parameters, `sdk_initial_delay` should be less than or equal to `sdk_max_delay`.

**Validates: Requirements 2.4**

### Property 3: ToolRegistry count invariant

*For any* sequence of `register_tool(tool_id, tool_obj)` calls on a fresh `ToolRegistry`, `get_tool_count()` should equal the number of distinct `tool_id` values in the sequence.

**Validates: Requirements 5.9**

### Property 4: ToolFilter partition invariant

*For any* list of `enabled_tool_ids` and any `ToolFilter` (with a known registry and known external MCP tool set), the sum of `local_tools + gateway_tools + external_mcp_tools + unknown_tools` from `get_statistics()` should equal `total_requested`.

**Validates: Requirements 6.7**

### Property 5: FileSanitizer output invariant and idempotence

*For any* input string, `sanitize_filename(x)` should (a) match the regex `^[a-zA-Z0-9\s\-\(\)\[\]_]*$` and (b) satisfy `sanitize_filename(sanitize_filename(x)) == sanitize_filename(x)`.

**Validates: Requirements 10.4, 10.5**

### Property 6: SSE format invariant and JSON round-trip

*For any* dictionary with string keys and JSON-serializable values, `format_sse_event(d)` should (a) start with `"data: "` and end with `"\n\n"`, and (b) the JSON payload extracted from between the prefix and suffix should parse back to the original dictionary.

**Validates: Requirements 12.9, 12.10**

### Property 7: PreviewSessionManager count invariant

*For any* sequence of `create_message` and `clear_session` operations on a `PreviewSessionManager`, `message_count` should equal the number of `create_message` calls since the last `clear_session` (or since initialization if no clear has occurred).

**Validates: Requirements 14.8**

### Property 8: CompactionState round-trip

*For any* valid `CompactionState` instance (with any checkpoint, summary, last_input_tokens, and updated_at), `CompactionState.from_dict(state.to_dict())` should produce a `CompactionState` whose `to_dict()` output is identical to the original's `to_dict()` output.

**Validates: Requirements 16.5**

### Property 9: ProcessedEvent structural invariant

*For any* raw event dictionary processed by any of the stream processor handler functions (`_handle_lifecycle_events`, `_handle_content_block_events`, `_handle_tool_events`, `_handle_reasoning_events`, `_handle_citation_events`, `_handle_metadata_events`), every returned `ProcessedEvent` should contain exactly the keys `"type"` (a string) and `"data"` (a dictionary).

**Validates: Requirements 23.9**

## Error Handling

### Test-Level Error Handling

Tests should verify error conditions without letting exceptions escape:

| Error Condition | Expected Behavior | Test Approach |
|---|---|---|
| Missing API keys (OpenAI, Gemini) | `ValueError` raised | `pytest.raises(ValueError)` |
| Missing `AGENTCORE_MEMORY_ID` | `RuntimeError` raised | `pytest.raises(RuntimeError)` |
| Missing AgentCore Memory package | `RuntimeError` raised | Mock `AGENTCORE_MEMORY_AVAILABLE = False` |
| Non-serializable SSE event data | Error event returned (not exception) | Assert output contains `type: "error"` |
| Invalid provider string in `from_params` | Defaults to BEDROCK | Assert `get_provider() == BEDROCK` |
| Missing `cancelled` attribute on session manager | No exception raised | Assert `StopHook.check_cancelled` completes without error |
| No region from URL or boto3 | `ValueError` raised | `pytest.raises(ValueError)` |
| Neither token nor token_provider | `ValueError` raised | `pytest.raises(ValueError)` |

### Mocking Failures

When mocks are misconfigured or external dependencies change signatures, tests should fail with clear assertion errors rather than import errors. The `conftest.py` fixtures should use `autospec=True` where possible to catch API drift.

## Testing Strategy

### Dual Testing Approach

The test suite uses two complementary testing methods:

1. **Unit tests (pytest)**: Verify specific examples, edge cases, and error conditions for each acceptance criterion. These are deterministic and fast.

2. **Property-based tests (Hypothesis)**: Verify universal properties across randomly generated inputs. These catch edge cases that example-based tests miss.

Both are necessary — unit tests catch concrete bugs and verify specific behaviors, while property tests verify general correctness across the input space.

### Property-Based Testing Configuration

- **Library**: [Hypothesis](https://hypothesis.readthedocs.io/) (Python's standard PBT library)
- **Minimum iterations**: 100 per property (`@settings(max_examples=100)`)
- **Test file**: `backend/tests/agents/main_agent/property/test_pbt_agent_core.py`
- **Strategy file**: `backend/tests/agents/main_agent/property/conftest.py`
- **Each property test MUST reference its design property via docstring tag**
- **Tag format**: `Feature: agent-core-tests, Property {N}: {title}`
- **Each correctness property is implemented by a single `@given` test function**

### Test Execution

```bash
# Run all agent core unit tests
docker compose exec dev python -m pytest tests/agents/main_agent/ -v

# Run only property-based tests
docker compose exec dev python -m pytest tests/agents/main_agent/property/ -v

# Run with coverage
docker compose exec dev python -m pytest tests/agents/main_agent/ -v --cov=agents.main_agent
```

### Unit Test Balance

- Unit tests focus on: specific examples from acceptance criteria, error conditions, edge cases (empty inputs, None values, missing env vars)
- Property tests focus on: invariants, round-trips, idempotence, partition properties
- Avoid duplicating property test coverage in unit tests — if a property covers "all inputs", don't write 10 unit tests for specific inputs of the same behavior
