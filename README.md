# AgentCore Public Stack

This open-source repository is the working codebase behind [boisestate.ai](https://boisestate.ai) at Boise State University. It is a **production-ready, full-stack Generative AI application** built on AWS Bedrock AgentCore with a **consumption-based pricing model** (pay for what you use) rather than per-seat subscriptions.

By open-sourcing this platform, Boise State enables other institutions to adopt a cost-effective, privacy-respecting AI solution while retaining the flexibility to integrate their own tools and MCP servers to meet institutional needs.

## Why Boise State Built an Internal AI Platform

| Challenge | Our Approach |
|-----------|--------------|
| **Vendor Lock-in** | Freedom to choose and swap best-fit models without long-term contracts or CapEx expenditure |
| **Data Privacy** | Student and faculty data stays inside our controlled AWS account. Interactions with Bedrock models are never shared with model vendors |
| **Cost Reality** | 30k subscriptions × $20/month = **$7.2M/year** — unsustainable at enterprise scale. Consumption-based pricing aligns cost with actual usage |
| **Collaboration Gaps** | Unified platform bridges `boisestate.edu` and `u.boisestate.edu` identities, eliminating fragmented sharing in classroom use |
| **Equitable Access** | Every student gets access to the same models — no "haves and have-nots" based on who can afford premium tiers |
| **Campus Systems Integration** | Safely leverage institutional data via MCP servers (Canvas, Google Workspace, PeopleSoft, Library, etc.) |
| **Risk/Reward** | Low risk, high reward — if it works, we've built lasting infrastructure; if not, we've learned and can pivot |

## Overview

This reference architecture demonstrates building agentic workflows combining **Strands Agents** and **Amazon Bedrock AgentCore**. The system provides a full-stack chatbot application with tool execution, memory management, browser automation, and multi-protocol tool integration.

### Core Capabilities

- **Admin Dashboard** — Real-time cost analytics, model management, MCP tool configuration, and RBAC
- **Multi-model Support** — Add models from Bedrock (Claude, Llama, Mistral) or external providers
- **Extensible Tools** — Connect institutional systems via MCP servers without code changes
- **Role-Based Access** — Granular control over quotas, models, and tools by user role
- **Cost Optimization** — Token optimization via prompt caching and consumption-based billing
- **Multimodal** — Images, documents, code execution, and browser automation

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
│         Authentication · Session Management · Admin Controls · RBAC         │
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
│  Local Tools  │ │ Built-in Tools│ │  MCP Tools    │ │ Runtime Tools │
│  (Direct)     │ │ (AWS SDK)     │ │  (Gateway)    │ │ (A2A) 🚧      │
│               │ │               │ │               │ │               │
│ Your custom   │ │ Code Interp.  │ │ Configurable  │ │ Multi-agent   │
│ Python tools  │ │ Browser       │ │ via Admin UI  │ │ collaboration │
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

### Admin Dashboard

A comprehensive admin interface enables institutional administrators to manage the platform without code changes:

| Capability | Description |
|------------|-------------|
| **Real-time Cost Analytics** | Monitor token usage and costs per user, model, and time period. Track spending trends and identify optimization opportunities |
| **Model Management** | Add, configure, and disable models from any provider — Bedrock models (Claude, Llama, Mistral), or external providers via API |
| **MCP Tool Configuration** | Register and manage MCP servers through the UI. Connect institutional systems (Canvas, Google Workspace, PeopleSoft, etc.) without redeployment |
| **Role-Based Access Control** | Create application roles with granular permissions for quotas, models, and tools. Assign roles to users or groups |
| **Quota Management** | Set spending limits by role, department, or user. Configure soft warnings and hard limits |

### Configurable MCP Tools

MCP (Model Context Protocol) tools extend the agent's capabilities by connecting to external systems. Admins can add MCP servers via the dashboard — no code deployment required.

**How it works:**

1. **Admin registers MCP server** via Admin Dashboard (URL, auth, description)
2. **Tools auto-discovered** from the MCP server's tool manifest
3. **RBAC applied** — tools assigned to specific roles
4. **Users see tools** based on their role permissions

**Example institutional integrations:**
- **Canvas LMS** — Access course materials, grades, assignments
- **Google Workspace** — Search Drive, read Docs, manage Calendar
- **PeopleSoft** — Student records, registration status
- **Library Systems** — Research databases, catalog search
- **Custom APIs** — Any system exposed via MCP

### Multi-Protocol Tool Architecture

Tools communicate via different protocols based on their deployment model:

| Protocol | Description | Use Case |
|----------|-------------|----------|
| **Direct Call** | Python functions in `agents/main_agent/tools/` | Custom institutional logic |
| **AWS SDK** | Built-in AgentCore services | Code Interpreter, Browser automation |
| **MCP + SigV4** | Remote MCP servers via AgentCore Gateway | Campus systems, third-party APIs |
| **A2A** | Agent-to-agent collaboration (WIP) | Multi-agent workflows |

### Dynamic Tool Filtering

Users can enable/disable specific tools via the UI sidebar. The agent dynamically filters tool definitions before each invocation, sending only selected tools to the model.

**Benefits:**
- **Reduced token usage** — fewer tool definitions sent to model
- **Per-user customization** — users choose their workflow
- **Role-based defaults** — admins set tool availability by role
- **Real-time updates** — no redeployment needed

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

*Detailed instructions coming soon.*

### Cloud Deployment

*Detailed instructions coming soon.*

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
