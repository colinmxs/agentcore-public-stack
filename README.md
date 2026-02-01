# AgentCore Public Stack

Production-ready multi-agent conversational AI system built with AWS Bedrock AgentCore and Strands Agents.

## Overview

This reference architecture demonstrates building agentic workflows combining **Strands Agents** and **Amazon Bedrock AgentCore**. The system provides a full-stack chatbot application with tool execution, memory management, browser automation, and multi-protocol tool integration.

### Core Capabilities

- Multi-turn conversation orchestration with Strands Agents
- Integration with Bedrock AgentCore services (Runtime, Memory, Gateway, Code Interpreter, Browser)
- 30+ tools across 4 protocols (Direct, AWS SDK, MCP, A2A)
- Dynamic tool filtering with per-user customization
- Token optimization via prompt caching
- Multimodal input/output (images, documents, charts)

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Angular v21, TypeScript, Tailwind CSS v4.1+ |
| **Backend** | Python 3.13+, FastAPI |
| **Agent Framework** | Strands Agents SDK |
| **Cloud Services** | AWS Bedrock AgentCore (Runtime, Memory, Gateway, Code Interpreter, Browser) |
| **Infrastructure** | AWS CDK (TypeScript), ECS Fargate, CloudFront, DynamoDB |
| **Authentication** | OIDC (Entra ID, Cognito, Google) with PKCE |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Interface                                  │
│                     Angular v21 + Tailwind CSS v4.1+                        │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ SSE Streaming
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              App API (FastAPI)                               │
│              Authentication · Session Management · File Upload              │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Inference API (Strands Agent)                        │
│        Turn-based Session Manager · Dynamic Tool Filtering · Caching        │
└───────┬─────────────────┬─────────────────┬─────────────────┬───────────────┘
        │                 │                 │                 │
        ▼                 ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Local Tools  │ │ Built-in Tools│ │ Gateway Tools │ │ Runtime Tools │
│  (Direct)     │ │ (AWS SDK)     │ │ (MCP+SigV4)   │ │ (A2A) 🚧      │
│               │ │               │ │               │ │               │
│ Calculator    │ │ Code Interp.  │ │ Wikipedia     │ │ Report Writer │
│ Weather       │ │ Browser       │ │ ArXiv         │ │               │
│ Web Search    │ │ (Nova Act)    │ │ Google Search │ │               │
│ Visualization │ │               │ │ Tavily        │ │               │
│ URL Fetcher   │ │               │ │ Finance       │ │               │
└───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │   AgentCore Memory    │
                          │  Session History +    │
                          │  User Preferences     │
                          └───────────────────────┘
```

### System Components

1. **Frontend (Angular v21)**
   - Signal-based state management
   - OIDC authentication with PKCE flow
   - SSE streaming for real-time responses
   - Dynamic tool selection via sidebar

2. **App API (FastAPI - Port 8000)**
   - Session and conversation management
   - User authentication and authorization
   - File upload handling
   - Admin endpoints for configuration

3. **Inference API (FastAPI - Port 8001)**
   - Strands Agent orchestration with Bedrock models
   - Turn-based session manager for optimized API calls
   - Dynamic tool filtering based on user selection
   - Prompt caching for token optimization

4. **AgentCore Services**
   - **Memory**: Persistent conversation storage with user preference retrieval
   - **Gateway**: MCP tool endpoints with SigV4 authentication
   - **Code Interpreter**: Python execution for charts and analysis
   - **Browser**: Web automation via Nova Act model

## Key Features

### Multi-Protocol Tool Architecture

Tools communicate via different protocols based on their characteristics:

| Protocol | Location | Examples | Authentication |
|----------|----------|----------|----------------|
| **Direct Call** | `agents/main_agent/tools/` | Calculator, Weather, Visualization | N/A |
| **AWS SDK** | `agents/main_agent/tools/` | Code Interpreter, Browser | IAM |
| **MCP + SigV4** | Cloud Lambda (Gateway) | Wikipedia, ArXiv, Finance | AWS SigV4 |
| **A2A** | Cloud Runtime (WIP) | Report Writer | AgentCore auth |

**Total: 30 tools** (21 active, 9 in progress)

### Dynamic Tool Filtering

Users can enable/disable specific tools via the UI sidebar. The agent dynamically filters tool definitions before each invocation, sending only selected tools to the model.

**How it works:**

1. **User Toggle**: User selects tools via UI sidebar
2. **Enabled Tools**: Frontend sends enabled tool list to backend
3. **Tool Filtering**: Strands Agent filters tools before model invocation
4. **Reduced Tokens**: Model receives only enabled tool definitions

**Benefits:**
- Reduced token usage (fewer tool definitions sent to model)
- Per-user customization without code changes
- Real-time tool updates without redeployment

**Implementation:** `backend/src/agents/main_agent/tools/tool_registry.py`

```python
# Filter tools based on user selection
enabled_tools = ["calculator", "gateway_wikipedia-search___wikipedia_search"]

agent = Agent(
    model=model,
    tools=get_filtered_tools(enabled_tools),  # Dynamic filtering
    session_manager=session_manager
)
```

### Memory Architecture and Long-Context Management

The system implements a two-tier memory architecture combining short-term session history with long-term user preferences.

**Memory Tiers:**

| Tier | Scope | Storage | Retrieval |
|------|-------|---------|-----------|
| **Short-term** | Session conversation history | AgentCore Memory | Automatic via session manager |
| **Long-term** | User preferences and facts | AgentCore Memory (namespaced) | Vector retrieval with relevance scoring |

**Turn-based Session Manager:**

Buffers messages within a turn to reduce AgentCore Memory API calls:

```
Without buffering:                  With buffering:
User message     → API call 1       User → Assistant → Tool → Result
Assistant reply  → API call 2                    ↓
Tool use         → API call 3       Single merged API call
Tool result      → API call 4
─────────────────────────────       ─────────────────────────────
Total: 4 API calls per turn         Total: 1 API call (75% reduction)
```

**Long-term Memory Configuration:**

```python
AgentCoreMemoryConfig(
    memory_id=memory_id,
    session_id=session_id,
    actor_id=user_id,
    retrieval_config={
        # User preferences (coding style, language, etc.)
        f"/preferences/{user_id}": RetrievalConfig(top_k=5, relevance_score=0.7),
        # User-specific facts (learned information)
        f"/facts/{user_id}": RetrievalConfig(top_k=10, relevance_score=0.3),
    }
)
```

**Implementation:** `backend/src/agents/main_agent/session/turn_based_session_manager.py`

### Token Optimization via Prompt Caching

Implements automatic prompt caching via Strands SDK to significantly reduce input token costs across repeated API calls.

**Cache Strategy:**

- Single cache point at end of last assistant message
- Automatically injected before each model call
- Covers system prompt, tools, and conversation history
- Reduces input tokens for repeated content

**Implementation:** `backend/src/agents/main_agent/core/model_config.py`

```python
from strands.models import BedrockModel, CacheConfig

model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    cache_config=CacheConfig(strategy="auto")
)
```

**How caching works across turns:**

| Turn | Action | Token Impact |
|------|--------|--------------|
| Turn 1 | Cache creation | Full token count (cache created) |
| Turn 2+ | Cache read | Reduced tokens (reusing cached system prompt + history) |

The SDK automatically manages cache points, injecting them at the end of the last assistant message before each model call.

### Multimodal Input/Output

Native support for visual and document content:

**Input:**
- Images: PNG, JPEG, GIF, WebP
- Documents: PDF, CSV, DOCX, and more

**Output:**
- Charts and diagrams from Code Interpreter
- Screenshots from Browser automation
- Generated documents (Excel, PowerPoint, Word)

## Demos

*Coming soon*

<!--
| Demo | Description |
|------|-------------|
| **Finance Assistant** | Stock analysis with real-time quotes, charts, and Excel reports |
| **Browser Automation** | Web navigation with Nova Act, screenshot capture |
| **Academic Research** | Paper search via ArXiv and Wikipedia integration |
| **Deep Research** | Multi-agent research with supervisor-worker pattern |
-->

## Deployment

### Prerequisites

- **AWS Account** with Bedrock access (Claude models)
- **AWS CLI** configured with credentials
- **Docker** installed and running
- **Node.js** 18+ and **Python** 3.13+
- **AgentCore** enabled in your AWS account region

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/your-org/agentcore-public-stack.git
cd agentcore-public-stack

# 2. Setup dependencies
./setup.sh

# 3. Configure environment
cp backend/.env.example backend/.env
# Edit .env with your AWS credentials

# 4. Start all services
./start.sh
```

**Services started:**
- Frontend: http://localhost:4200
- App API: http://localhost:8000
- Inference API: http://localhost:8001

**What runs locally:**
- Frontend (Angular v21)
- App API (FastAPI)
- Inference API (Strands Agent)
- Local Tools (5 tools)
- Built-in Tools (Code Interpreter, Browser via AWS API)

**Requires cloud deployment:**
- AgentCore Gateway (MCP tools)
- AgentCore Memory (uses local file storage locally)

### Cloud Deployment

*Coming soon*

<!--
```bash
cd infrastructure
npm install
npx cdk deploy --all
```
-->

## Project Structure

```
agentcore-public-stack/
├── backend/
│   └── src/
│       ├── agents/main_agent/          # Core agent implementation
│       │   ├── core/                   # Agent factory, model config, system prompt
│       │   ├── session/                # Turn-based session management
│       │   ├── streaming/              # SSE event processing
│       │   └── tools/                  # Tool registry & local tools
│       └── apis/
│           ├── app_api/                # Main application API (port 8000)
│           ├── inference_api/          # Bedrock inference (port 8001)
│           └── shared/                 # Shared utilities
├── frontend/ai.client/                 # Angular SPA
│   └── src/app/
│       ├── auth/                       # OIDC authentication
│       ├── session/                    # Chat UI & services
│       ├── admin/                      # Admin dashboard
│       └── services/                   # State management
└── infrastructure/                     # AWS CDK
    └── lib/                            # Stack definitions
```

## License

MIT License - see LICENSE file for details.
