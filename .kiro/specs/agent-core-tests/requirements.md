# Requirements Document

## Introduction

Comprehensive unit and property-based test coverage for the Agent Core module (`backend/src/agents/main_agent/`). This module is the heart of the conversational AI system — it orchestrates agent creation, session management, tool filtering, multimodal content handling, streaming event processing, and external integrations. Currently at zero test coverage across all submodules (core, session, streaming, tools, multimodal, integrations, utils), this spec defines the requirements for a thorough test suite using pytest, pytest-asyncio, and Hypothesis.

## Glossary

- **Test_Suite**: The collection of pytest test files under `backend/tests/agents/main_agent/`
- **ModelConfig**: Dataclass that holds LLM provider configuration (model ID, temperature, caching, retry settings)
- **RetryConfig**: Dataclass controlling two-layer retry behavior (botocore HTTP-level and Strands SDK agent-level)
- **AgentFactory**: Static factory that creates Strands Agent instances for Bedrock, OpenAI, or Gemini providers
- **SystemPromptBuilder**: Builder class that constructs system prompts with optional date injection
- **ToolRegistry**: Registry that discovers and stores tool objects by ID
- **ToolFilter**: Filters tools into local, gateway, and external MCP categories based on user-enabled tool lists
- **ToolCatalogService**: Service for querying tool metadata (name, description, category, icon)
- **GatewayIntegration**: Manages Gateway MCP client lifecycle for AgentCore Gateway tools
- **StreamCoordinator**: Orchestrates streaming agent responses, metadata storage, and cost calculation
- **StreamEventFormatter**: Formats processed events into SSE-compatible `data: {...}\n\n` strings
- **ToolResultProcessor**: Extracts text and images from tool execution results
- **ImageHandler**: Detects image formats and creates Bedrock-compatible image ContentBlocks
- **DocumentHandler**: Detects document formats and creates Bedrock-compatible document ContentBlocks
- **FileSanitizer**: Sanitizes filenames to meet AWS Bedrock character requirements
- **PromptBuilder**: Assembles multimodal prompts from text, images, and documents
- **SessionFactory**: Factory that creates the appropriate session manager (cloud or preview)
- **PreviewSessionManager**: In-memory session manager for assistant preview/testing (no persistence)
- **TurnBasedSessionManager**: Cloud session manager with AgentCore Memory, compaction, and summarization
- **CompactionState**: Dataclass tracking compaction checkpoint, summary, and token counts
- **CompactionConfig**: Dataclass for compaction behavior configuration (threshold, protected turns)
- **StopHook**: Strands hook that cancels tool execution when a session is stopped by the user
- **OAuthBearerAuth**: HTTPX Auth class that injects OAuth Bearer tokens into requests
- **CompositeAuth**: Combines multiple HTTPX Auth handlers (e.g., SigV4 + OAuth)
- **SigV4HTTPXAuth**: HTTPX Auth class that signs requests with AWS SigV4 for Gateway authentication
- **FilteredMCPClient**: MCPClient wrapper that filters gateway tools based on enabled tool IDs
- **MemoryStorageConfig**: Configuration dataclass for AgentCore Memory (memory ID, region)

## Requirements

### Requirement 1: Model Configuration Tests

**User Story:** As a developer, I want ModelConfig to correctly manage multi-provider LLM configuration, so that agents are created with the right model parameters for Bedrock, OpenAI, and Gemini.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that ModelConfig initializes with correct default values (model_id, temperature, caching_enabled, provider)
2. WHEN a model_id starting with "gpt-" or "o1-" is provided, THE Test_Suite SHALL verify that ModelConfig.get_provider returns ModelProvider.OPENAI
3. WHEN a model_id starting with "gemini-" is provided, THE Test_Suite SHALL verify that ModelConfig.get_provider returns ModelProvider.GEMINI
4. WHEN a model_id containing "anthropic" or "claude" is provided, THE Test_Suite SHALL verify that ModelConfig.get_provider returns ModelProvider.BEDROCK
5. WHEN provider is explicitly set to a non-Bedrock value, THE Test_Suite SHALL verify that get_provider returns the explicit provider regardless of model_id
6. THE Test_Suite SHALL verify that to_bedrock_config produces a dictionary with model_id, temperature, and CacheConfig when caching is enabled
7. THE Test_Suite SHALL verify that to_bedrock_config includes boto_client_config with retry settings when RetryConfig is present
8. THE Test_Suite SHALL verify that to_openai_config produces a dictionary with model_id and params containing temperature
9. WHEN max_tokens is set, THE Test_Suite SHALL verify that to_openai_config includes max_tokens in params and to_gemini_config includes max_output_tokens in params
10. THE Test_Suite SHALL verify that to_dict produces a dictionary with provider resolved via get_provider
11. THE Test_Suite SHALL verify that ModelConfig.from_params creates a config with defaults applied for omitted parameters
12. WHEN an invalid provider string is passed to from_params, THE Test_Suite SHALL verify that the provider defaults to BEDROCK
13. FOR ALL valid ModelConfig instances, THE Test_Suite SHALL verify that from_params(to_dict values) produces an equivalent configuration (round-trip property)

### Requirement 2: Retry Configuration Tests

**User Story:** As a developer, I want RetryConfig to correctly load from environment variables and provide sensible defaults, so that retry behavior is configurable without code changes.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that RetryConfig initializes with correct default values (boto_max_attempts=3, sdk_max_attempts=4, sdk_initial_delay=2.0, sdk_max_delay=16.0)
2. WHEN environment variables RETRY_BOTO_MAX_ATTEMPTS, RETRY_SDK_MAX_ATTEMPTS, RETRY_SDK_INITIAL_DELAY, and RETRY_SDK_MAX_DELAY are set, THE Test_Suite SHALL verify that RetryConfig.from_env reads those values
3. WHEN no environment variables are set, THE Test_Suite SHALL verify that RetryConfig.from_env returns default values
4. FOR ALL RetryConfig instances, THE Test_Suite SHALL verify that sdk_initial_delay is less than or equal to sdk_max_delay (invariant property)

### Requirement 3: System Prompt Builder Tests

**User Story:** As a developer, I want SystemPromptBuilder to correctly construct system prompts with optional date injection, so that agents receive properly formatted instructions.

#### Acceptance Criteria

1. WHEN include_date is True, THE Test_Suite SHALL verify that SystemPromptBuilder.build appends a "Current date:" line to the base prompt
2. WHEN include_date is False, THE Test_Suite SHALL verify that SystemPromptBuilder.build returns the base prompt unchanged
3. WHEN a custom base_prompt is provided, THE Test_Suite SHALL verify that SystemPromptBuilder uses the custom prompt instead of DEFAULT_SYSTEM_PROMPT
4. WHEN from_user_prompt is called, THE Test_Suite SHALL verify that the builder is configured with the user prompt as the base prompt
5. THE Test_Suite SHALL verify that DEFAULT_SYSTEM_PROMPT contains expected key phrases ("boisestate.ai", "CORE PRINCIPLES", "RESPONSE GUIDELINES")

### Requirement 4: Agent Factory Tests

**User Story:** As a developer, I want AgentFactory to create correctly configured Strands Agent instances for each provider, so that the agent is wired with the right model, tools, and session manager.

#### Acceptance Criteria

1. WHEN provider is BEDROCK, THE Test_Suite SHALL verify that AgentFactory.create_agent creates an Agent with a BedrockModel
2. WHEN provider is OPENAI and OPENAI_API_KEY is set, THE Test_Suite SHALL verify that AgentFactory.create_agent creates an Agent with an OpenAIModel
3. WHEN provider is GEMINI and GOOGLE_GEMINI_API_KEY is set, THE Test_Suite SHALL verify that AgentFactory.create_agent creates an Agent with a GeminiModel
4. IF OPENAI_API_KEY is not set and provider is OPENAI, THEN THE Test_Suite SHALL verify that AgentFactory raises ValueError
5. IF GOOGLE_GEMINI_API_KEY is not set and provider is GEMINI, THEN THE Test_Suite SHALL verify that AgentFactory raises ValueError
6. WHEN retry_config is provided for a Bedrock model, THE Test_Suite SHALL verify that a ModelRetryStrategy is passed to the Agent
7. WHEN retry_config is not provided or provider is not Bedrock, THE Test_Suite SHALL verify that retry_strategy is None
8. THE Test_Suite SHALL verify that AgentFactory passes SequentialToolExecutor to the Agent constructor

### Requirement 5: Tool Registry Tests

**User Story:** As a developer, I want ToolRegistry to correctly register, retrieve, and manage tools, so that the agent has access to the right set of tools.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that a new ToolRegistry starts with zero tools
2. WHEN register_tool is called, THE Test_Suite SHALL verify that the tool is retrievable via get_tool and has_tool returns True
3. WHEN get_tool is called with an unregistered tool_id, THE Test_Suite SHALL verify that it returns None
4. WHEN has_tool is called with an unregistered tool_id, THE Test_Suite SHALL verify that it returns False
5. WHEN register_module_tools is called with a module that has __all__, THE Test_Suite SHALL verify that all exported tools are registered
6. WHEN register_module_tools is called with a module without __all__, THE Test_Suite SHALL verify that no tools are registered
7. THE Test_Suite SHALL verify that get_all_tool_ids returns all registered tool IDs
8. THE Test_Suite SHALL verify that get_tool_count returns the correct count after registrations
9. FOR ALL sequences of register_tool calls, THE Test_Suite SHALL verify that get_tool_count equals the number of unique tool_ids registered (idempotence/count invariant)

### Requirement 6: Tool Filter Tests

**User Story:** As a developer, I want ToolFilter to correctly categorize tools into local, gateway, and external MCP buckets, so that each tool type is handled by the appropriate integration.

#### Acceptance Criteria

1. WHEN enabled_tool_ids is None or empty, THE Test_Suite SHALL verify that filter_tools returns empty lists for both local tools and gateway tool IDs
2. WHEN enabled_tool_ids contains registered local tool IDs, THE Test_Suite SHALL verify that filter_tools returns the corresponding tool objects
3. WHEN enabled_tool_ids contains IDs starting with "gateway_", THE Test_Suite SHALL verify that filter_tools returns those IDs in the gateway_tool_ids list
4. WHEN enabled_tool_ids contains unrecognized tool IDs, THE Test_Suite SHALL verify that filter_tools skips those IDs
5. WHEN set_external_mcp_tools is called and filter_tools_extended is used, THE Test_Suite SHALL verify that external MCP tool IDs appear in the external_mcp_tool_ids list
6. THE Test_Suite SHALL verify that get_statistics returns correct counts for each tool category
7. FOR ALL lists of enabled_tool_ids, THE Test_Suite SHALL verify that the sum of local_tools, gateway_tools, external_mcp_tools, and unknown_tools in get_statistics equals total_requested (partition invariant)

### Requirement 7: Tool Catalog Service Tests

**User Story:** As a developer, I want ToolCatalogService to provide correct tool metadata for UI display and authorization, so that the frontend can render tool information accurately.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that get_all_tools returns all tools in the catalog
2. WHEN get_tool is called with a valid tool_id, THE Test_Suite SHALL verify that it returns the correct ToolMetadata
3. WHEN get_tool is called with an invalid tool_id, THE Test_Suite SHALL verify that it returns None
4. THE Test_Suite SHALL verify that get_tools_by_category returns only tools matching the specified category
5. WHEN add_gateway_tool is called without "gateway_" prefix, THE Test_Suite SHALL verify that the prefix is automatically added
6. THE Test_Suite SHALL verify that ToolMetadata.to_dict produces a dictionary with camelCase keys (toolId, isGatewayTool, requiresOauthProvider)

### Requirement 8: Multimodal Image Handler Tests

**User Story:** As a developer, I want ImageHandler to correctly detect image formats and create Bedrock-compatible ContentBlocks, so that image attachments are processed correctly.

#### Acceptance Criteria

1. WHEN content_type starts with "image/", THE Test_Suite SHALL verify that is_image returns True
2. WHEN filename ends with .png, .jpg, .jpeg, .gif, or .webp, THE Test_Suite SHALL verify that is_image returns True
3. WHEN content_type is not image and filename has no image extension, THE Test_Suite SHALL verify that is_image returns False
4. THE Test_Suite SHALL verify that get_image_format returns "png" for image/png content type and .png extension
5. THE Test_Suite SHALL verify that get_image_format returns "jpeg" for image/jpeg, image/jpg, .jpg, and .jpeg
6. THE Test_Suite SHALL verify that get_image_format defaults to "png" for unrecognized formats
7. THE Test_Suite SHALL verify that create_content_block returns a dictionary with "image" key containing "format" and "source.bytes"

### Requirement 9: Multimodal Document Handler Tests

**User Story:** As a developer, I want DocumentHandler to correctly detect document formats and create ContentBlocks, so that document attachments are processed correctly.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that is_document returns True for all supported extensions (.pdf, .csv, .doc, .docx, .xls, .xlsx, .html, .txt, .md)
2. THE Test_Suite SHALL verify that is_document returns False for unsupported extensions (.exe, .zip, .py)
3. THE Test_Suite SHALL verify that get_document_format returns the correct format string for each supported extension
4. THE Test_Suite SHALL verify that get_document_format defaults to "txt" for unrecognized extensions
5. THE Test_Suite SHALL verify that create_content_block returns a dictionary with "document" key containing "format", "name", and "source.bytes"

### Requirement 10: File Sanitizer Tests

**User Story:** As a developer, I want FileSanitizer to produce Bedrock-safe filenames, so that file uploads do not cause API errors.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that sanitize_filename replaces special characters with underscores while preserving alphanumeric characters, hyphens, parentheses, and square brackets
2. THE Test_Suite SHALL verify that sanitize_filename collapses consecutive whitespace into a single space
3. THE Test_Suite SHALL verify that sanitize_filename trims leading and trailing whitespace
4. FOR ALL input strings, THE Test_Suite SHALL verify that sanitize_filename output matches the regex pattern `^[a-zA-Z0-9\s\-\(\)\[\]_]*$` (output invariant property)
5. FOR ALL input strings, THE Test_Suite SHALL verify that sanitize_filename is idempotent: sanitize(sanitize(x)) equals sanitize(x)

### Requirement 11: Multimodal Prompt Builder Tests

**User Story:** As a developer, I want PromptBuilder to correctly assemble multimodal prompts from text, images, and documents, so that the agent receives properly structured input.

#### Acceptance Criteria

1. WHEN no files are provided, THE Test_Suite SHALL verify that build_prompt returns the message as a plain string
2. WHEN files are provided, THE Test_Suite SHALL verify that build_prompt returns a list of ContentBlocks with text first
3. WHEN image files are provided, THE Test_Suite SHALL verify that the ContentBlock list includes image blocks with correct format
4. WHEN document files are provided, THE Test_Suite SHALL verify that the ContentBlock list includes document blocks with sanitized names
5. WHEN an unsupported file type is provided, THE Test_Suite SHALL verify that build_prompt skips the unsupported file and includes only supported content
6. THE Test_Suite SHALL verify that get_content_type_summary returns "text only" for string prompts
7. THE Test_Suite SHALL verify that get_content_type_summary returns correct counts for multimodal prompts (e.g., "text + 2 images + 1 document")
8. WHEN files include a filename, THE Test_Suite SHALL verify that the text block includes an "[Attached files: ...]" marker

### Requirement 12: SSE Event Formatter Tests

**User Story:** As a developer, I want StreamEventFormatter to produce correctly formatted SSE events, so that the frontend can parse streaming responses reliably.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that format_sse_event produces output in the format `data: {json}\n\n`
2. IF event_data contains non-serializable objects, THEN THE Test_Suite SHALL verify that format_sse_event returns an error event instead of raising an exception
3. THE Test_Suite SHALL verify that create_init_event produces an event with type "init"
4. THE Test_Suite SHALL verify that create_response_event produces an event with type "response" and the provided text
5. THE Test_Suite SHALL verify that create_tool_use_event produces an event with type "tool_use" containing toolUseId, name, and input
6. THE Test_Suite SHALL verify that create_complete_event produces an event with type "complete" and optional images and usage data
7. THE Test_Suite SHALL verify that create_error_event produces an event with type "error" and the error message
8. THE Test_Suite SHALL verify that extract_final_result_data extracts text parts and image data from a final result object
9. FOR ALL valid event dictionaries, THE Test_Suite SHALL verify that format_sse_event output starts with "data: " and ends with "\n\n" (format invariant)
10. FOR ALL valid event dictionaries, THE Test_Suite SHALL verify that the JSON payload in format_sse_event output can be parsed back to the original dictionary (round-trip property)

### Requirement 13: Tool Result Processor Tests

**User Story:** As a developer, I want ToolResultProcessor to correctly extract text and images from tool execution results, so that tool outputs are displayed properly in the chat.

#### Acceptance Criteria

1. WHEN a tool result contains text content, THE Test_Suite SHALL verify that process_tool_result extracts the text
2. WHEN a tool result contains image content with base64 data, THE Test_Suite SHALL verify that process_tool_result extracts the images
3. WHEN a tool result contains JSON content with embedded images, THE Test_Suite SHALL verify that _process_json_content extracts the images and cleans the text
4. WHEN a tool result has no content, THE Test_Suite SHALL verify that process_tool_result returns empty text and empty image list

### Requirement 14: Preview Session Manager Tests

**User Story:** As a developer, I want PreviewSessionManager to maintain in-memory conversation context without persistence, so that assistant preview sessions work correctly.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that PreviewSessionManager initializes with zero messages
2. WHEN create_message is called, THE Test_Suite SHALL verify that the message is stored in memory and message_count increases
3. WHEN read_session is called, THE Test_Suite SHALL verify that it returns a copy of stored messages (not a reference)
4. WHEN clear_session is called, THE Test_Suite SHALL verify that all messages are removed and message_count returns to zero
5. THE Test_Suite SHALL verify that is_preview_session returns True for session IDs starting with "preview-" and False otherwise
6. WHEN _initialize_agent is called with existing messages, THE Test_Suite SHALL verify that the agent's messages list is populated
7. WHEN _initialize_agent is called with no messages, THE Test_Suite SHALL verify that the agent's messages list is empty
8. FOR ALL sequences of create_message and clear_session operations, THE Test_Suite SHALL verify that message_count equals the number of messages added since the last clear (count invariant)

### Requirement 15: Session Factory Tests

**User Story:** As a developer, I want SessionFactory to create the correct session manager type based on session ID and environment, so that preview and cloud sessions are handled appropriately.

#### Acceptance Criteria

1. WHEN session_id starts with "preview-", THE Test_Suite SHALL verify that SessionFactory.create_session_manager returns a PreviewSessionManager
2. WHEN session_id does not start with "preview-" and AgentCore Memory is available, THE Test_Suite SHALL verify that SessionFactory.create_session_manager returns a TurnBasedSessionManager
3. IF AgentCore Memory package is not available and session is not a preview, THEN THE Test_Suite SHALL verify that SessionFactory.create_session_manager raises RuntimeError
4. THE Test_Suite SHALL verify that is_cloud_mode returns True when AgentCore Memory is available and configured, and False otherwise

### Requirement 16: Compaction Models Tests

**User Story:** As a developer, I want CompactionState and CompactionConfig to correctly serialize, deserialize, and load from environment, so that compaction behavior is configurable and state is persisted correctly.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that CompactionState initializes with default values (checkpoint=0, summary=None, last_input_tokens=0)
2. THE Test_Suite SHALL verify that CompactionState.to_dict produces a dictionary with camelCase keys
3. WHEN CompactionState.from_dict is called with a valid dictionary, THE Test_Suite SHALL verify that it reconstructs the correct state
4. WHEN CompactionState.from_dict is called with None or empty dict, THE Test_Suite SHALL verify that it returns default state
5. FOR ALL CompactionState instances, THE Test_Suite SHALL verify that from_dict(to_dict(state)) produces an equivalent state (round-trip property)
6. THE Test_Suite SHALL verify that CompactionConfig.from_env reads AGENTCORE_MEMORY_COMPACTION_ENABLED, AGENTCORE_MEMORY_COMPACTION_TOKEN_THRESHOLD, AGENTCORE_MEMORY_COMPACTION_PROTECTED_TURNS, and AGENTCORE_MEMORY_COMPACTION_MAX_TOOL_CONTENT_LENGTH from environment
7. WHEN no environment variables are set, THE Test_Suite SHALL verify that CompactionConfig.from_env returns default values

### Requirement 17: Memory Configuration Tests

**User Story:** As a developer, I want load_memory_config to correctly load and validate memory configuration from environment, so that AgentCore Memory is properly initialized.

#### Acceptance Criteria

1. WHEN AGENTCORE_MEMORY_ID is set, THE Test_Suite SHALL verify that load_memory_config returns a MemoryStorageConfig with the correct memory_id and region
2. IF AGENTCORE_MEMORY_ID is not set, THEN THE Test_Suite SHALL verify that load_memory_config raises RuntimeError
3. WHEN AWS_REGION is set, THE Test_Suite SHALL verify that load_memory_config uses the specified region
4. WHEN AWS_REGION is not set, THE Test_Suite SHALL verify that load_memory_config defaults to "us-west-2"
5. THE Test_Suite SHALL verify that MemoryStorageConfig.is_cloud_mode always returns True

### Requirement 18: Stop Hook Tests

**User Story:** As a developer, I want StopHook to cancel tool execution when a session is stopped, so that users can interrupt long-running agent operations.

#### Acceptance Criteria

1. WHEN session_manager.cancelled is True, THE Test_Suite SHALL verify that StopHook.check_cancelled sets event.cancel_tool to a cancellation message
2. WHEN session_manager.cancelled is False, THE Test_Suite SHALL verify that StopHook.check_cancelled does not modify the event
3. WHEN session_manager does not have a cancelled attribute, THE Test_Suite SHALL verify that StopHook.check_cancelled does not raise an exception

### Requirement 19: OAuth Bearer Auth Tests

**User Story:** As a developer, I want OAuthBearerAuth to correctly inject Bearer tokens into HTTP requests, so that external MCP servers receive proper authentication.

#### Acceptance Criteria

1. WHEN a static token is provided, THE Test_Suite SHALL verify that auth_flow adds "Authorization: Bearer {token}" to the request headers
2. WHEN a token_provider callback is provided, THE Test_Suite SHALL verify that auth_flow calls the provider and uses the returned token
3. WHEN the token_provider returns None, THE Test_Suite SHALL verify that auth_flow does not add an Authorization header
4. IF neither token nor token_provider is provided, THEN THE Test_Suite SHALL verify that OAuthBearerAuth raises ValueError
5. THE Test_Suite SHALL verify that CompositeAuth applies all auth handlers in order to the request

### Requirement 20: SigV4 Gateway Auth Tests

**User Story:** As a developer, I want SigV4HTTPXAuth to correctly sign requests for AgentCore Gateway, so that gateway MCP tools authenticate successfully.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that SigV4HTTPXAuth.auth_flow adds AWS signature headers to the request
2. THE Test_Suite SHALL verify that SigV4HTTPXAuth.auth_flow removes the "connection" header before signing
3. THE Test_Suite SHALL verify that get_gateway_region_from_url extracts the correct region from a standard Gateway URL pattern
4. WHEN the URL does not match the expected pattern, THE Test_Suite SHALL verify that get_gateway_region_from_url falls back to the boto3 session region
5. IF no region can be determined from URL or boto3 session, THEN THE Test_Suite SHALL verify that get_gateway_region_from_url raises ValueError

### Requirement 21: Timezone Utility Tests

**User Story:** As a developer, I want get_current_date_pacific to return correctly formatted dates in Pacific timezone, so that system prompts include accurate date information.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that get_current_date_pacific returns a string matching the format "YYYY-MM-DD (DayName) HH:00 TZ"
2. THE Test_Suite SHALL verify that the timezone abbreviation is either PST or PDT
3. IF timezone libraries are unavailable, THEN THE Test_Suite SHALL verify that get_current_date_pacific falls back to UTC

### Requirement 22: Global State Deprecation Tests

**User Story:** As a developer, I want the deprecated global state functions to be safe no-ops, so that backward-compatible code does not break.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that set_global_stream_processor accepts any argument without raising an exception
2. THE Test_Suite SHALL verify that get_global_stream_processor returns None

### Requirement 23: Stream Processor Event Handling Tests

**User Story:** As a developer, I want the stream processor to correctly transform raw Strands Agent events into standardized processed events, so that the frontend receives a consistent event format.

#### Acceptance Criteria

1. WHEN a lifecycle event (message_start, message_stop) is received, THE Test_Suite SHALL verify that _handle_lifecycle_events produces the correct processed events
2. WHEN a content_block_start event with type "text" is received, THE Test_Suite SHALL verify that _handle_content_block_events produces a content_block_start event with the correct contentBlockIndex
3. WHEN a content_block_delta event with text data is received, THE Test_Suite SHALL verify that _handle_content_block_events produces a content_block_delta event with the text
4. WHEN a tool_use event is received, THE Test_Suite SHALL verify that _handle_tool_events produces events with toolUseId, name, and input
5. WHEN a reasoning event (thinking text) is received, THE Test_Suite SHALL verify that _handle_reasoning_events produces a reasoning event with the text
6. WHEN a citation event is received, THE Test_Suite SHALL verify that _handle_citation_events produces citation_start or citation_end events with source metadata
7. WHEN a metadata event with usage data is received, THE Test_Suite SHALL verify that _handle_metadata_events produces a metadata event with token counts
8. THE Test_Suite SHALL verify that _serialize_object correctly handles primitives, datetime, UUID, Decimal, dicts, lists, and objects with __dict__
9. FOR ALL ProcessedEvent outputs, THE Test_Suite SHALL verify that the event contains "type" and "data" keys (structural invariant)

### Requirement 24: Gateway MCP Client Tests

**User Story:** As a developer, I want FilteredMCPClient to correctly filter gateway tools based on enabled tool IDs, so that only user-selected gateway tools are available to the agent.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that FilteredMCPClient stores the enabled_tool_ids and prefix
2. THE Test_Suite SHALL verify that get_gateway_client_if_enabled returns None when AGENTCORE_GATEWAY_MCP_ENABLED is "false"
3. WHEN no gateway tool IDs are provided, THE Test_Suite SHALL verify that create_filtered_gateway_client returns None

### Requirement 25: External MCP Client Utility Tests

**User Story:** As a developer, I want the external MCP client utilities to correctly parse URLs and detect AWS services, so that external tool connections are configured properly.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that extract_region_from_url correctly extracts AWS region from standard AgentCore URLs
2. WHEN the URL does not contain a recognizable region pattern, THE Test_Suite SHALL verify that extract_region_from_url returns None
3. THE Test_Suite SHALL verify that detect_aws_service_from_url returns the correct service name for known URL patterns (e.g., "bedrock-agentcore" for gateway URLs)
