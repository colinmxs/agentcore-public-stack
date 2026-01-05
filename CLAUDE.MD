# Claude Code Instructions for AgentCore Public Stack

## Project Overview

This is a production-ready multi-agent conversational AI system built with AWS Bedrock AgentCore and Strands Agents. The application combines agent orchestration with MCP-based tool integration, multimodal I/O, financial analysis tools, and deep research capabilities.

**Tech Stack:**
- **Frontend**: Angular v21, TypeScript, Tailwind v4.1 CSS (see skills for detailed guidelines)
- **Backend**: Python 3.13+, FastAPI
- **Agent Framework**: Strands Agents (AWS Bedrock)
- **Cloud Services**: AWS Bedrock AgentCore (Runtime, Memory, Gateway, Code Interpreter, Browser)

## Project Structure

```
/
├── backend/
│   └── src/
│       ├── agents/main_agent/          # Core agent implementation
│       │   ├── core/                   # Agent factory, model config, system prompt
│       │   ├── session/                # Turn-based session management
│       │   ├── streaming/              # SSE event processing & formatting
│       │   └── tools/                  # Tool registry & local tools
│       └── apis/
│           ├── app_api/                # Main application API
│           │   ├── chat/               # Chat endpoints & SSE streaming
│           │   └── auth/               # Authentication endpoints
│           ├── inference_api/          # Bedrock inference endpoint
│           └── shared/                 # Shared utilities & error handling
│
├── frontend/
│   └── ai.client/
│       └── src/
│           ├── app/
│           │   ├── auth/               # OIDC/Entra ID authentication
│           │   ├── session/            # Chat UI & services
│           │   ├── admin/              # Admin dashboard pages
│           │   └── services/           # State management, HTTP services
│           └── environments/           # Environment configuration
│
└── infrastructure/                     # AWS CDK infrastructure
    ├── bin/infrastructure.ts           # CDK app entry point
    ├── lib/
    │   ├── config.ts                   # Configuration & validation
    │   ├── infrastructure-stack.ts     # VPC, ALB, ECS Cluster
    │   ├── frontend-stack.ts           # S3, CloudFront
    │   ├── app-api-stack.ts            # App API Fargate + DynamoDB
    │   ├── inference-api-stack.ts      # Inference API Fargate
    │   └── gateway-stack.ts            # AgentCore Gateway + Lambdas
    └── cdk.context.json                # Stack configuration
```

## Key Architecture Patterns

### 1. Multi-Protocol Tool Architecture

Tools communicate via different protocols:

| Protocol | Location | Examples | Auth |
|----------|----------|----------|------|
| Direct call | `backend/src/agents/main_agent/tools/` | Weather, Calculator, Visualization | N/A |
| AWS SDK | `backend/src/agents/main_agent/tools/` | Code Interpreter, Browser | IAM |
| MCP + SigV4 | Cloud Lambda (Gateway) | Wikipedia, ArXiv, Finance | AWS SigV4 |
| A2A | Cloud Runtime (WIP) | Report Writer | AgentCore auth |

### 2. Turn-based Session Management

**File:** `backend/src/agents/main_agent/session/turn_based_session_manager.py`

- Pass-through mode: Messages sent individually to AgentCore Memory
- Message count initialized once at startup (avoids eventual consistency issues)
- Supports session cancellation via `cancelled` flag
- Hooks for MessageAddedEvent tracking

### 3. Dynamic Tool Filtering

**File:** `backend/src/apis/app_api/chat/routes.py`

- RBAC checks filter tools before agent creation
- Users can enable/disable tools via UI
- Denied tools removed from enabled_tools list
- Fail-open: RBAC errors don't block requests

### 4. Prompt Caching Strategy

**File:** `backend/src/agents/main_agent/core/agent_factory.py`

Two-level caching (Bedrock only):
- System prompt caching (static)
- Conversation history caching (dynamic, last 2 messages)
- Max 4 cache points with rotation
- Enabled via `ConversationCachingHook`

### 5. Multimodal I/O

**Input:** Images (PNG, JPEG, GIF, WebP), Documents (PDF, CSV, DOCX)
**Output:** Charts from Code Interpreter, screenshots from Browser

## SSE Event Types

The backend emits these Server-Sent Events:

**Message Structure Events:**
| Event | Purpose |
|-------|---------|
| `message_start` | Start of assistant response (contains `role`) |
| `content_block_start` | Begin text/tool_use/reasoning block |
| `content_block_delta` | Streaming content chunks |
| `content_block_stop` | End of content block |
| `message_stop` | End of message (stopReason: end_turn, tool_use, max_tokens) |

**Tool Events:**
| Event | Purpose |
|-------|---------|
| `tool_use` | Tool invocation with toolUseId, name, input |
| `tool_result` | Tool execution result (supports images/JSON) |
| `tool_progress` | Progress during tool execution (%) |
| `tool_error` | Tool execution error |

**Status Events:**
| Event | Purpose |
|-------|---------|
| `reasoning` | Chain-of-thought thinking blocks |
| `metadata` | Usage metrics, latency info |
| `quota_warning` | Approaching quota limit |
| `quota_exceeded` | Quota limit reached |
| `stream_error` | Conversational error (displayed as chat message) |
| `error` | Legacy error event |
| `done` | Stream complete |

**SSE Format:** `event: <type>\ndata: <json>\n\n`

## Model Configuration

**File:** `backend/src/agents/main_agent/core/model_config.py`

**Default Model:** `us.anthropic.claude-haiku-4-5-20251001-v1:0` (cost-conscious for high-volume)

**Supported Providers:**
| Provider | Model Patterns | Config |
|----------|---------------|--------|
| Bedrock (default) | `us.anthropic.claude-*`, `claude-*` | IAM auth, prompt caching |
| OpenAI | `gpt-*`, `o1-*` | `OPENAI_API_KEY` env var |
| Gemini | `gemini-*` | `GOOGLE_GEMINI_API_KEY` env var |

**ModelConfig Fields:**
```python
model_id: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
temperature: float = 0.7
caching_enabled: bool = True
provider: ModelProvider = ModelProvider.BEDROCK
max_tokens: Optional[int] = None
```

## System Prompt

**File:** `backend/src/agents/main_agent/core/system_prompt_builder.py`

The agent uses a Boise State University-specific system prompt with:
- Academic integrity guidelines
- Institutional knowledge context
- Cost awareness principles
- Markdown/KaTeX/Mermaid output support
- Dynamic tool availability awareness

Date is injected dynamically in Pacific timezone.

## Authentication Flow

**Frontend:** OIDC with Entra ID + PKCE

**Key Files:**
- `frontend/ai.client/src/app/auth/services/auth.service.ts` - Token management
- `frontend/ai.client/src/app/auth/services/callback.service.ts` - OAuth callback
- `frontend/ai.client/src/app/auth/guards/` - Route protection

**Flow:**
1. `login()` → Backend `/auth/login` → Entra ID authorization
2. Callback → `/auth/token` exchange → Store tokens in localStorage
3. `authInterceptor` adds Bearer token, auto-refreshes on expiry
4. `authGuard` protects routes, redirects with returnUrl

**Token Storage:**
- `localStorage['access_token']` - JWT access token
- `localStorage['refresh_token']` - Refresh token
- `localStorage['token_expiry']` - Expiry timestamp
- `sessionStorage['auth_state']` - CSRF state token

**Configuration:** `environment.enableAuthentication` toggles auth (default: true)

## Error Handling

**Backend:** `backend/src/apis/shared/errors.py`

**Error Codes:**
- Client: `bad_request`, `unauthorized`, `forbidden`, `not_found`, `validation_error`, `rate_limit_exceeded`, `quota_exceeded`
- Server: `internal_error`, `service_unavailable`, `timeout`
- Agent: `agent_error`, `tool_error`, `model_error`, `stream_error`

**Strategy:**
- Errors stream as assistant messages (better UX than HTTP errors)
- `ConversationalErrorEvent` for user-friendly markdown errors
- Errors persisted to session history
- Fail-open approach for RBAC/quota errors

**Frontend:** `frontend/ai.client/src/app/services/error/`
- `ErrorService` - Centralized error handling
- `ErrorToastComponent` - Bottom-right toast notifications
- Supports retry actions for recoverable errors

## Data Flow

```
User Input (Frontend)
    ↓
POST /chat/stream
    ├─ Authenticate (JWT from Bearer token)
    ├─ Authorize (RBAC tool filtering)
    ├─ Check Quota (warn/exceed events)
    └─ Get/Create Agent
        ↓
Agent.stream_async()
    ├─ SystemPromptBuilder (inject date)
    ├─ Model invocation (Bedrock/OpenAI/Gemini)
    ├─ Tool execution (SequentialToolExecutor)
    └─ Stream events
        ↓
StreamProcessor → EventFormatter
    ├─ Transform to SSE format
    ├─ Track usage metrics
    └─ Persist to session
        ↓
Frontend StreamParser
    ├─ Parse SSE events
    ├─ Build message content blocks
    ├─ Handle tool results (images/JSON)
    └─ Update UI signals
```

## Route Structure

**Public Routes:**
- `/auth/login` - OIDC login
- `/auth/callback` - OAuth callback

**Authenticated Routes (authGuard):**
- `/` - Main chat interface
- `/s/:sessionId` - Load specific session
- `/costs` - User cost dashboard
- `/memories` - Memory dashboard
- `/manage-sessions` - Session management

**Admin Routes (adminGuard - requires Admin/SuperAdmin/DotNetDevelopers role):**
- `/admin` - Admin dashboard
- `/admin/bedrock/models`, `/admin/gemini/models`, `/admin/openai/models` - Model config
- `/admin/quota/*` - Quota tier management
- `/admin/users/*` - User management
- `/admin/roles/*` - Role management
- `/admin/tools/*` - Tool management

## Backend API Route Conventions

**IMPORTANT:** All admin endpoints MUST be under the `/admin/` prefix. Do NOT create admin routes nested under resource routes.

| Pattern | Example | Use For |
|---------|---------|---------|
| `/resource/` | `/tools/`, `/models/` | User-facing resource endpoints |
| `/admin/resource/` | `/admin/tools/`, `/admin/roles/` | Admin CRUD for resources |

**Correct:**
- `GET /tools/` - User's accessible tools
- `GET /admin/tools/` - Admin tool catalog management
- `PUT /admin/tools/{id}` - Admin update tool

**Incorrect:**
- ~~`GET /tools/admin/`~~ - Don't nest admin under resource
- ~~`PUT /tools/admin/{id}`~~ - Admin routes go under `/admin/`

**Backend Route Files:**
| Route Prefix | File Location |
|--------------|---------------|
| `/auth/*` | `apis/app_api/auth/routes.py` |
| `/chat/*` | `apis/app_api/chat/routes.py` |
| `/tools/*` | `apis/app_api/tools/routes.py` |
| `/models/*` | `apis/app_api/models/routes.py` |
| `/admin/*` | `apis/app_api/admin/routes.py` (includes subrouters) |
| `/admin/tools/*` | `apis/app_api/admin/tools/routes.py` |
| `/admin/roles/*` | `apis/app_api/admin/roles/routes.py` |
| `/admin/users/*` | `apis/app_api/admin/users/routes.py` |
| `/admin/quota/*` | `apis/app_api/admin/quota/routes.py` |
| `/admin/costs/*` | `apis/app_api/admin/costs/routes.py` |

## Common Debugging Scenarios

**"Tool not appearing in UI"**
1. Check tool is exported in `__init__.py`
2. Verify RBAC permissions for user's role
3. Check tool is in `enabled_tools` list
4. Verify tool registration in ToolRegistry

**"Session not persisting"**
1. Check AgentCore Memory configuration
2. Verify session_id is being passed correctly
3. Check TurnBasedSessionManager flush on completion
4. Look for errors in session persistence logs

**"SSE stream disconnecting"**
1. Check 600-second timeout in routes.py
2. Verify client isn't closing connection
3. Look for `asyncio.CancelledError` in logs
4. Check for quota exceeded events

**"Authentication failing"**
1. Verify `enableAuthentication` in environment.ts
2. Check token expiry and refresh logic
3. Verify Entra ID configuration
4. Check CORS settings for auth endpoints

## Development Guidelines

### Python Backend

**Style:**
- Use type hints for all functions
- Follow PEP 8 conventions
- Use Pydantic models for data validation
- Async/await for I/O operations

**Key Files:**
- `backend/src/agents/main_agent/main_agent.py` - Main agent implementation
- `backend/src/apis/app_api/chat/routes.py` - SSE streaming endpoints
- `backend/src/agents/main_agent/core/agent_factory.py` - Agent creation

**Tool Development:**
- Local tools: Add to `backend/src/agents/main_agent/tools/local/`
- Use `@tool` decorator from Strands framework
- Return `ToolResult` with multimodal content support

**Testing:**
```bash
cd backend/src && python -m pytest
python -m pytest tests/test_agent.py -v
```

### Angular Frontend

This project uses Angular v21+ with Tailwind CSS v4.1+. For detailed framework guidelines, use the Angular and Tailwind skills.

**Icon-Only Buttons (Accessibility Required):**

Buttons with only icons (no visible text) MUST include:
1. **Tooltip**: Use `[appTooltip]` directive for styled tooltips
2. **Accessible name**: The tooltip directive auto-generates `aria-describedby`

```html
<!-- Correct: Icon button with tooltip -->
<button
  (click)="editItem()"
  class="p-2 text-gray-500 hover:text-blue-600"
  [appTooltip]="'Edit Item'"
  appTooltipPosition="top"
>
  <ng-icon name="heroPencilSquare" class="size-5" />
</button>

<!-- Incorrect: Icon button without tooltip -->
<button (click)="editItem()" class="p-2">
  <ng-icon name="heroPencilSquare" class="size-5" />
</button>
```

**Tooltip Directive:** `frontend/ai.client/src/app/components/tooltip/`
- Import: `import { TooltipDirective } from '../../../components/tooltip';`
- Add to component imports: `imports: [..., TooltipDirective]`
- Positions: `'top'` | `'bottom'` | `'left'` | `'right'`

**Key Files:**
- `frontend/ai.client/src/app/session/session.page.ts` - Main chat interface
- `frontend/ai.client/src/app/session/services/chat/` - Chat state & HTTP services
- `frontend/ai.client/src/app/services/error/` - Error handling

**State Management:**
- Signal-based state throughout (`signal()`, `computed()`)
- `stream-parser.service.ts` - SSE parsing with content block builders
- `chat-http.service.ts` - `@microsoft/fetch-event-source` for SSE

**Testing:**
```bash
cd frontend/ai.client && npm test
ng test --watch=false
```

## Environment Configuration

### Backend (.env)

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>

# AgentCore
AGENTCORE_MEMORY_ID=<memory-id>
AGENTCORE_RUNTIME_ID=<runtime-id>

# Optional
OPENAI_API_KEY=<key>
GOOGLE_GEMINI_API_KEY=<key>
TAVILY_API_KEY=<key>
```

### Frontend (environment.ts)

```typescript
export const environment = {
  production: false,
  appApiUrl: 'http://localhost:8000',
  inferenceApiUrl: 'http://localhost:8001',
  enableAuthentication: true
};
```

## Important Constraints

1. **No Over-engineering**: Only implement what's explicitly requested
2. **Security**: Watch for injection vulnerabilities (command, XSS, SQL)
3. **Token Optimization**: Consider token usage when modifying agent prompts
4. **Multimodal Support**: Maintain compatibility with image/document handling
5. **Session Management**: Respect turn-based buffering patterns
6. **Tool Protocols**: Use correct protocol for tool type (Direct/AWS SDK/MCP/A2A)
7. **Error Streaming**: Errors should be conversational (displayed as chat messages)

## Known Limitations

- AgentCore Gateway requires cloud deployment (not available locally)
- AgentCore Memory uses local file storage in development
- A2A Report Writer tools are work in progress
- Browser automation requires Nova Act model access
- Stream timeout: 600 seconds (10 minutes)

## CDK Infrastructure

**Location:** `infrastructure/`

### Stack Overview

| Stack | Purpose | Key Resources |
|-------|---------|---------------|
| `InfrastructureStack` | Shared network resources (deploy first) | VPC, ALB, ECS Cluster, Route53 |
| `FrontendStack` | Static website hosting | S3, CloudFront, OAC |
| `AppApiStack` | Core backend API | ECS Fargate, DynamoDB tables, Target Groups |
| `InferenceApiStack` | AI inference workloads | ECS Fargate (higher CPU/memory) |
| `GatewayStack` | MCP tool gateway | AgentCore Gateway, Lambda functions |

### Configuration

**File:** `infrastructure/lib/config.ts`

Configuration loaded from `cdk.context.json` with env var overrides:

```typescript
// Core settings
projectPrefix: string     // e.g., "bsu-agentcore"
awsRegion: string         // e.g., "us-west-2"
vpcCidr: string          // e.g., "10.0.0.0/16"

// Stack toggles
frontend.enabled: boolean
appApi.enabled: boolean
inferenceApi.enabled: boolean
gateway.enabled: boolean
```

### DynamoDB Tables (AppApiStack)

| Table | Purpose | Key Schema |
|-------|---------|------------|
| `user-quotas` | Quota tier assignments | PK/SK + 4 GSIs for lookups |
| `quota-events` | Quota usage events | PK/SK + TierEventIndex GSI |
| `sessions-metadata` | Message-level cost tracking | PK/SK + UserTimestampIndex, SessionLookupIndex |
| `user-cost-summary` | Aggregated user costs | PK/SK + PeriodCostIndex GSI |
| `system-cost-rollup` | Admin dashboard metrics | PK/SK |
| `oidc-state` | OIDC auth state (TTL-enabled) | PK/SK |
| `managed-models` | Model pricing/config | PK/SK + ModelIdIndex GSI |
| `users` | User profiles from JWT | PK/SK + UserIdIndex, EmailIndex, EmailDomainIndex |
| `app-roles` | RBAC role definitions | PK/SK + JwtRoleMappingIndex, ToolRoleMappingIndex |

### Gateway Stack (MCP Tools)

**Lambda Functions:**
- `mcp-google-search` - Google Custom Search (web + images)
- `mcp-brave-search` - Brave Search (web, local, video, image, news, summarizer)

**Gateway Targets:** 8 total (2 Google + 6 Brave)

**Secrets Required:**
```bash
# Google credentials
aws secretsmanager put-secret-value \
  --secret-id <google-secret-name> \
  --secret-string '{"api_key":"...","search_engine_id":"..."}'

# Brave credentials
aws secretsmanager put-secret-value \
  --secret-id <brave-secret-name> \
  --secret-string '{"api_key":"..."}'
```

### Cross-Stack References (SSM Parameters)

Resources exported to SSM under `/{projectPrefix}/`:
- `/network/vpc-id`, `/network/alb-arn`, `/network/ecs-cluster-name`
- `/quota/user-quotas-table-name`, `/quota/quota-events-table-name`
- `/cost-tracking/sessions-metadata-table-name`
- `/gateway/url`, `/gateway/id`
- `/frontend/distribution-id`, `/frontend/bucket-name`

### Deployment Order

1. `InfrastructureStack` (VPC, ALB, ECS Cluster) - **must be first**
2. `AppApiStack` (depends on network resources)
3. `InferenceApiStack` (depends on network resources)
4. `FrontendStack` (independent)
5. `GatewayStack` (independent)

### CDK Commands

```bash
cd infrastructure

# Install dependencies
npm install

# Synthesize CloudFormation
npx cdk synth

# Deploy all stacks
npx cdk deploy --all

# Deploy specific stack
npx cdk deploy InfrastructureStack

# Diff changes
npx cdk diff

# Destroy (careful!)
npx cdk destroy --all
```

### Environment Overrides

CDK context can be overridden via environment variables:
- `CDK_FRONTEND_ENABLED=true/false`
- `CDK_APP_API_CPU=512`
- `CDK_GATEWAY_LOG_LEVEL=DEBUG`
- `ENV_INFERENCE_API_TAVILY_API_KEY=...`

## Quick Reference Commands

```bash
# Backend
cd backend/src && python -m uvicorn api.main:app --reload

# Frontend
cd frontend/ai.client && ng serve

# Docker
docker-compose up --build

# CDK Infrastructure
cd infrastructure && npx cdk deploy --all

# Testing
cd backend/src && pytest
cd frontend/ai.client && npm test

# Logs
tail -f agentcore.log
docker-compose logs -f backend
```

## Git Workflow

- Main branch: `main`
- Feature branches: `feature/description`
- Always check status before commits

## Contact & Support

- GitHub Issues: https://github.com/aws-samples/sample-strands-agent-with-agentcore/issues
- License: MIT
