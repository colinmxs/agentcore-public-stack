# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Production-ready multi-agent conversational AI system built with AWS Bedrock AgentCore and Strands Agents.

**Tech Stack:**
- **Frontend**: Angular v21, TypeScript, Tailwind v4.1+ CSS
- **Backend**: Python 3.13+, FastAPI
- **Agent Framework**: Strands Agents (AWS Bedrock)
- **Cloud Services**: AWS Bedrock AgentCore (Runtime, Memory, Gateway, Code Interpreter, Browser)

## Build and Run Commands

### Backend

```bash
cd backend

# Install uv (one-time)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install for app_api only
uv sync

# Install for inference_api (with AgentCore)
uv sync --extra agentcore

# Install all including dev tools
uv sync --extra agentcore --extra dev

# Run App API (port 8000)
cd src/apis/app_api && uv run python main.py

# Run Inference API (port 8001)
cd src/apis/inference_api && uv run python main.py

# Run tests
uv run python -m pytest tests/ -v
```

### Frontend

```bash
cd frontend/ai.client
npm install
npm run start        # Dev server (port 4200)
npm run build        # Production build
npm test             # Run tests (Vitest)
```

### Infrastructure (CDK)

```bash
cd infrastructure
npm install
npm run build        # Compile TypeScript
npx cdk synth        # Generate CloudFormation
npx cdk deploy --all # Deploy all stacks
npx cdk diff         # Compare changes
```

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
│           ├── app_api/                # Main application API (port 8000)
│           ├── inference_api/          # Bedrock inference endpoint (port 8001)
│           └── shared/                 # Shared utilities & error handling
├── frontend/ai.client/                 # Angular SPA
│   └── src/app/
│       ├── auth/                       # OIDC/Entra ID authentication
│       ├── session/                    # Chat UI & services
│       ├── admin/                      # Admin dashboard pages
│       └── services/                   # State management, HTTP services
└── infrastructure/                     # AWS CDK infrastructure
    └── lib/                            # Stack definitions
```

## Key Architecture Patterns

### Multi-Protocol Tool Architecture

| Protocol | Location | Examples | Auth |
|----------|----------|----------|------|
| Direct call | `agents/main_agent/tools/` | Weather, Calculator | N/A |
| AWS SDK | `agents/main_agent/tools/` | Code Interpreter, Browser | IAM |
| MCP + SigV4 | Cloud Lambda (Gateway) | Wikipedia, ArXiv, Finance | AWS SigV4 |
| A2A | Cloud Runtime (WIP) | Report Writer | AgentCore auth |

### Turn-based Session Management

**File:** `backend/src/agents/main_agent/session/turn_based_session_manager.py`

Messages are buffered within a turn to reduce AgentCore Memory API calls:
- Pass-through mode: Messages sent individually
- Message count initialized once at startup
- Supports session cancellation via `cancelled` flag

### Prompt Caching Strategy

**File:** `backend/src/agents/main_agent/core/model_config.py`

Automatic prompt caching (Bedrock only) via `CacheConfig(strategy="auto")` passed to BedrockModel.
The SDK automatically injects cache points at the end of the last assistant message.

### SSE Event Types

| Event | Purpose |
|-------|---------|
| `message_start` | Start of assistant response |
| `content_block_start/delta/stop` | Streaming content |
| `message_stop` | End of message |
| `tool_use` | Tool invocation |
| `tool_result` | Tool execution result |
| `stream_error` | Conversational error |
| `done` | Stream complete |

## Backend API Route Conventions

All admin endpoints MUST be under the `/admin/` prefix:

| Pattern | Example | Use For |
|---------|---------|---------|
| `/resource/` | `/tools/` | User-facing endpoints |
| `/admin/resource/` | `/admin/tools/` | Admin CRUD |

**Correct:** `GET /admin/tools/`, `PUT /admin/tools/{id}`
**Incorrect:** ~~`GET /tools/admin/`~~

## Authentication Flow

**Frontend:** OIDC with Entra ID + PKCE

1. `login()` → Backend `/auth/login` → Entra ID authorization
2. Callback → `/auth/token` exchange → Store tokens in localStorage
3. `authInterceptor` adds Bearer token, auto-refreshes on expiry
4. `authGuard` protects routes

## Error Handling

Errors stream as assistant messages (better UX than HTTP errors):
- `ConversationalErrorEvent` for user-friendly markdown errors
- Errors persisted to session history
- Fail-open approach for RBAC/quota errors

## Frontend Guidelines

### Icon-Only Buttons (Accessibility Required)

Buttons with only icons MUST include a tooltip:

```html
<button
  (click)="editItem()"
  class="p-2 text-gray-500 hover:text-blue-600"
  [appTooltip]="'Edit Item'"
  appTooltipPosition="top"
>
  <ng-icon name="heroPencilSquare" class="size-5" />
</button>
```

### State Management

Signal-based state throughout (`signal()`, `computed()`)

## Tailwind CSS v4.1+ Rules

See `.cursor/rules/tailwind.mdc` for comprehensive guidelines. Key points:

### Breaking Changes (ALWAYS use v4 syntax)

| ❌ Deprecated | ✅ Replacement |
|---------------|----------------|
| `bg-opacity-*` | `bg-black/50` |
| `bg-gradient-*` | `bg-linear-*` |
| `shadow-sm` | `shadow-xs` |
| `shadow` | `shadow-sm` |
| `rounded-sm` | `rounded-xs` |
| `rounded` | `rounded-sm` |
| `leading-*` | `text-base/7` (line-height modifier) |
| `space-x-*` in flex | `gap-*` |

### Layout Rules

- Always use `gap-*` in flex/grid, never `space-x-*` or `space-y-*`
- Use `min-h-dvh` instead of `min-h-screen` (mobile Safari bug)
- Use `size-*` over separate `w-*` and `h-*` for equal dimensions
- Never use `@apply`

## CDK Infrastructure

**Deploy order:** InfrastructureStack → AppApiStack → InferenceApiStack → FrontendStack → GatewayStack

### DynamoDB Tables (AppApiStack)

| Table | Purpose |
|-------|---------|
| `user-quotas` | Quota tier assignments |
| `quota-events` | Quota usage events |
| `sessions-metadata` | Message-level cost tracking |
| `user-cost-summary` | Aggregated user costs |
| `managed-models` | Model pricing/config |
| `users` | User profiles from JWT |
| `app-roles` | RBAC role definitions |

## Environment Configuration

### Backend (.env)

Located at `backend/src/.env`:

```bash
AWS_REGION=us-west-2
AWS_PROFILE=<your-aws-profile>
AGENTCORE_MEMORY_ID=<memory-id>
AGENTCORE_PROJECT_PREFIX=<project-prefix>
DYNAMODB_AUTH_PROVIDERS_TABLE_NAME=<prefix>-auth-providers
AUTH_PROVIDER_SECRETS_ARN=<secrets-manager-arn>
# ... plus all DynamoDB table names, S3 buckets, etc.
```

### Frontend (environment.ts)

Located at `frontend/ai.client/src/environments/`:

```typescript
export const environment = {
  production: false,
  appApiUrl: 'http://localhost:8000',
  inferenceApiUrl: 'http://localhost:8001',
  enableAuthentication: true
};
```

## Local Development Gotchas

### AWS_PROFILE override

`load_dotenv` uses `override=True` so the `.env` file's `AWS_PROFILE` wins over your shell environment. This is intentional — without it, a shell-level `AWS_PROFILE` pointing to a different account causes `ResourceNotFoundException` errors on all DynamoDB tables because boto3 connects to the wrong AWS account.

### Auth Provider Secrets

OIDC client secrets (e.g., Entra ID) are stored in AWS Secrets Manager, NOT in `.env`. The secret at `AUTH_PROVIDER_SECRETS_ARN` must be a JSON object keyed by provider ID:

```json
{"entra-id": "<client-secret>", "other-provider": "<secret>"}
```

After a fresh stack deployment, the CDK-generated secret only contains a placeholder. You must manually add provider client secrets:

```bash
aws secretsmanager put-secret-value \
  --secret-id <AUTH_PROVIDER_SECRETS_ARN> \
  --secret-string '{"entra-id": "<your-entra-client-secret>"}'
```

The auth provider config itself (client ID, issuer URL, endpoints) lives in the `auth-providers` DynamoDB table and is managed via the admin API.

## Debugging

**Tool not appearing:** Check export in `__init__.py`, RBAC permissions, `enabled_tools` list, ToolRegistry registration

**Session not persisting:** Check AgentCore Memory config, session_id, TurnBasedSessionManager flush

**SSE stream disconnecting:** Check 600-second timeout, client connection, quota exceeded events

## Coding Standards

### Python (Backend)
- **Naming**: `snake_case` for functions, variables, modules; `PascalCase` for classes
- **Imports**: Standard library first, then third-party, then local — separated by blank lines
- **Type hints**: Required on all function signatures
- **Strings**: Use f-strings for interpolation, double quotes preferred
- **Formatter**: Follow PEP 8 conventions

### TypeScript (Frontend & CDK)
- **Naming**: `camelCase` for functions/variables/properties; `PascalCase` for classes, interfaces, and types; `UPPER_SNAKE_CASE` for constants
- **Interfaces**: Prefix with `I` only if project convention exists, otherwise plain `PascalCase`
- **Access modifiers**: Use `private`/`protected`/`public` explicitly on class members
- **Strict mode**: TypeScript strict mode is enabled — no `any` unless absolutely necessary

### General
- No commented-out code in commits
- No `console.log` / `print()` left in production code
- Prefer early returns over deep nesting

## Testing

### Backend
- Run: `python -m pytest tests/ -v` from the `backend/` directory
- Test files: `test_<module>.py` in `tests/` mirroring the source structure
- Use `pytest` fixtures for shared setup

### Frontend
- Run: `npm test` from `frontend/ai.client/` (uses `ng test` under the hood)
- **Do NOT run Vitest directly** — always use `ng test` or `npm test`
- Scaffold tests using the Angular CLI (`ng generate` creates `.spec.ts` files automatically)
- Test files: `<component>.spec.ts` co-located with the component

### CDK
- Run: `npm test` from `infrastructure/`
- Snapshot tests for stack outputs

## Git & Branching

- **Branch from**: `develop` (never branch from `main` for feature work)
- **Branch naming**: `feature/<short-description>` (e.g., `feature/add-quota-dashboard`)
- **Commits**: Use conventional commit messages — `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- **PRs**: Target `develop` for feature branches; `main` is updated via release merges only
- **Keep commits focused**: One logical change per commit

## Dependency Management

- **Never install new packages without explicit user approval.** Always ask first.
- When proposing a new dependency, explain why it's needed and whether an existing package already covers the use case.
- Backend dependencies go in `backend/pyproject.toml`
- Frontend dependencies go in `frontend/ai.client/package.json`
- CDK dependencies go in `infrastructure/package.json`

## Cross-Package Boundaries

Frontend and backend MUST agree on a shared API schema — this is the contract between them.

- When adding or modifying an API endpoint, define the request/response types on **both sides** before implementing
- Backend route handlers define the shape; frontend TypeScript interfaces must match
- Breaking changes to an endpoint require updating both packages in the same PR
- SSE event types (documented above) are part of the contract — changes must be coordinated

## File Creation Rules

Follow the existing organizational structure. Do not create new top-level directories or invent new patterns.

| Change Type | Where It Goes |
|-------------|---------------|
| New backend API route | `backend/src/apis/app_api/<domain>/` with router + models |
| New admin endpoint | `backend/src/apis/app_api/admin/<domain>/` |
| New agent tool | `backend/src/agents/main_agent/tools/` + register in `__init__.py` |
| New Angular page | `frontend/ai.client/src/app/<feature>/pages/<page-name>/` |
| New Angular component | `frontend/ai.client/src/app/<feature>/components/<component-name>/` |
| New Angular service | `frontend/ai.client/src/app/<feature>/services/` or `src/app/services/` if shared |
| New CDK stack | `infrastructure/lib/<stack-name>-stack.ts` |
| Shared backend utilities | `backend/src/apis/shared/` |

When in doubt, look at how an existing similar feature is organized and follow that pattern.

## Constraints

1. Only implement what's explicitly requested
2. Watch for injection vulnerabilities (command, XSS, SQL)
3. Consider token usage when modifying agent prompts
4. Maintain multimodal compatibility
5. Respect turn-based buffering patterns
6. Use correct protocol for tool type
7. Errors should stream as conversational messages

## Known Limitations

- AgentCore Gateway requires cloud deployment (not available locally)
- AgentCore Memory uses local file storage in development
- A2A Report Writer tools are work in progress
- Stream timeout: 600 seconds
