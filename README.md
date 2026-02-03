## Quick Start

### Single-Environment Deployment

Deploy the application to AWS with minimal configuration:

```bash
# 1. Clone repository
git clone https://github.com/Boise-State-Development/agentcore-public-stack.git
cd agentcore-public-stack

# 2. Configure GitHub Variables and Secrets
# Go to: Settings → Secrets and variables → Actions → Variables
# Add the following variables (see Configuration Reference below)
```

**Required GitHub Variables:**
- `CDK_PROJECT_PREFIX` - Resource name prefix (e.g., "mycompany-agentcore")
- `CDK_AWS_REGION` - AWS region (e.g., "us-west-2")
- `CDK_FILE_UPLOAD_CORS_ORIGINS` - Allowed CORS origins (e.g., "https://app.example.com")
- `APP_API_URL` - App API URL for frontend (e.g., "https://api.example.com")
- `INFERENCE_API_URL` - Inference API URL for frontend (e.g., "https://inference.example.com")

**Required GitHub Secrets:**
- `AWS_ROLE_ARN` - AWS IAM role ARN for deployment (e.g., "arn:aws:iam::123456789012:role/deploy-role")
- `CDK_AWS_ACCOUNT` - AWS account ID (12-digit number)

**Optional GitHub Variables (with defaults):**
- `CDK_RETAIN_DATA_ON_DELETE` - Retain data on stack deletion (default: "true")
- `CDK_ENABLE_AUTHENTICATION` - Enable authentication (default: "true")
- `CDK_APP_API_DESIRED_COUNT` - App API task count (default: "2")
- `CDK_APP_API_MAX_CAPACITY` - App API max tasks (default: "10")
- `CDK_INFERENCE_API_DESIRED_COUNT` - Inference API task count (default: "2")
- `CDK_INFERENCE_API_MAX_CAPACITY` - Inference API max tasks (default: "10")

```bash
# 3. Deploy via GitHub Actions
# Push to main branch or manually trigger workflow
git push origin main
```

### Local Development

Run the application locally without any configuration:

```bash
# 1. Clone repository
git clone https://github.com/Boise-State-Development/agentcore-public-stack.git
cd agentcore-public-stack

# 2. Setup dependencies
./setup.sh

# 3. Configure AWS credentials
cp backend/src/.env.example backend/src/.env
# Edit .env with your AWS credentials and region

# 4. Start all services
./start.sh
```

**Local Development Notes:**
- No configuration variables needed - uses localhost defaults
- Frontend automatically connects to `http://localhost:8000` (App API) and `http://localhost:8001` (Inference API)
- Authentication is enabled by default
- All data is stored locally (no cloud resources required for basic functionality)

## Configuration Reference

The application is fully configuration-driven. All environment-specific behavior is controlled through GitHub Variables and Secrets (for deployment) or environment variables (for local development).

### Core Configuration

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `CDK_PROJECT_PREFIX` | string | ✅ Yes | - | Resource name prefix for all AWS resources. Use different prefixes for multiple environments (e.g., "myapp-prod", "myapp-dev"). |
| `CDK_AWS_ACCOUNT` | secret | ✅ Yes | - | AWS account ID (12-digit number). Store as GitHub Secret. |
| `CDK_AWS_REGION` | string | ✅ Yes | - | AWS region code (e.g., "us-west-2", "us-east-1"). |
| `AWS_ROLE_ARN` | secret | ✅ Yes | - | AWS IAM role ARN for GitHub Actions deployment. Store as GitHub Secret. |

**Example:**
```bash
CDK_PROJECT_PREFIX="mycompany-agentcore"
CDK_AWS_ACCOUNT="123456789012"  # Secret
CDK_AWS_REGION="us-west-2"
AWS_ROLE_ARN="arn:aws:iam::123456789012:role/github-deploy"  # Secret
```

### Resource Behavior

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `CDK_RETAIN_DATA_ON_DELETE` | boolean | No | `true` | Controls data retention when stacks are deleted. Set to `"true"` to retain DynamoDB tables and S3 buckets (recommended for production). Set to `"false"` to automatically delete data resources. |

**Example:**
```bash
# Production: Retain data for safety
CDK_RETAIN_DATA_ON_DELETE="true"

# Development: Auto-delete for easy cleanup
CDK_RETAIN_DATA_ON_DELETE="false"
```

**Impact:**
- `true`: DynamoDB tables and S3 buckets use `RETAIN` removal policy. Resources persist after stack deletion.
- `false`: Resources use `DESTROY` removal policy with `autoDeleteObjects` enabled for S3. All data is deleted with the stack.

### Frontend Configuration

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `APP_API_URL` | string | ✅ Yes* | `http://localhost:8000` | App API endpoint URL. Required for production builds. |
| `INFERENCE_API_URL` | string | ✅ Yes* | `http://localhost:8001` | Inference API endpoint URL. Required for production builds. |
| `PRODUCTION` | boolean | No | `false` | Enable production mode in frontend. Set to `"true"` for production deployments. |
| `ENABLE_AUTHENTICATION` | boolean | No | `true` | Enable/disable authentication in frontend. |

*Required for production deployments, optional for local development (uses localhost defaults).

**Example:**
```bash
# Production deployment
APP_API_URL="https://api.mycompany.com"
INFERENCE_API_URL="https://inference.mycompany.com"
PRODUCTION="true"
ENABLE_AUTHENTICATION="true"

# Local development (defaults)
APP_API_URL="http://localhost:8000"
INFERENCE_API_URL="http://localhost:8001"
PRODUCTION="false"
ENABLE_AUTHENTICATION="true"
```

### CORS Configuration

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `CDK_FILE_UPLOAD_CORS_ORIGINS` | string | No | `http://localhost:4200` | Comma-separated list of allowed CORS origins for file upload API. |
| `CDK_FILE_UPLOAD_MAX_SIZE_MB` | number | No | `10` | Maximum file upload size in megabytes. |

**Example:**
```bash
# Single origin
CDK_FILE_UPLOAD_CORS_ORIGINS="https://app.mycompany.com"

# Multiple origins
CDK_FILE_UPLOAD_CORS_ORIGINS="https://app.mycompany.com,https://app-staging.mycompany.com"

# Local development
CDK_FILE_UPLOAD_CORS_ORIGINS="http://localhost:4200"
```

### Service Scaling Configuration

#### App API (Main Application Backend)

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `CDK_APP_API_DESIRED_COUNT` | number | No | `2` | Desired number of ECS tasks for App API. |
| `CDK_APP_API_MAX_CAPACITY` | number | No | `10` | Maximum number of tasks for auto-scaling. |
| `CDK_APP_API_CPU` | number | No | `1024` | CPU units (1024 = 1 vCPU). |
| `CDK_APP_API_MEMORY` | number | No | `2048` | Memory in MB. |

**Example:**
```bash
# Production: Higher capacity
CDK_APP_API_DESIRED_COUNT="3"
CDK_APP_API_MAX_CAPACITY="20"
CDK_APP_API_CPU="2048"
CDK_APP_API_MEMORY="4096"

# Development: Minimal capacity
CDK_APP_API_DESIRED_COUNT="1"
CDK_APP_API_MAX_CAPACITY="5"
CDK_APP_API_CPU="1024"
CDK_APP_API_MEMORY="2048"
```

#### Inference API (AI Model Inference)

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `CDK_INFERENCE_API_DESIRED_COUNT` | number | No | `2` | Desired number of ECS tasks for Inference API. |
| `CDK_INFERENCE_API_MAX_CAPACITY` | number | No | `10` | Maximum number of tasks for auto-scaling. |
| `CDK_INFERENCE_API_CPU` | number | No | `1024` | CPU units (1024 = 1 vCPU). |
| `CDK_INFERENCE_API_MEMORY` | number | No | `2048` | Memory in MB. |

**Example:**
```bash
# Production: Higher capacity
CDK_INFERENCE_API_DESIRED_COUNT="3"
CDK_INFERENCE_API_MAX_CAPACITY="20"
CDK_INFERENCE_API_CPU="2048"
CDK_INFERENCE_API_MEMORY="4096"

# Development: Minimal capacity
CDK_INFERENCE_API_DESIRED_COUNT="1"
CDK_INFERENCE_API_MAX_CAPACITY="5"
CDK_INFERENCE_API_CPU="1024"
CDK_INFERENCE_API_MEMORY="2048"
```

### Authentication Configuration

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `CDK_ENABLE_AUTHENTICATION` | boolean | No | `true` | Enable/disable authentication for the entire application. |

**Example:**
```bash
# Production: Authentication required
CDK_ENABLE_AUTHENTICATION="true"

# Development/Testing: Authentication optional
CDK_ENABLE_AUTHENTICATION="false"
```

### Configuration Examples

#### Production Environment

```bash
# Core
CDK_PROJECT_PREFIX="mycompany-agentcore-prod"
CDK_AWS_ACCOUNT="123456789012"  # Secret
CDK_AWS_REGION="us-west-2"
AWS_ROLE_ARN="arn:aws:iam::123456789012:role/prod-deploy"  # Secret

# Behavior
CDK_RETAIN_DATA_ON_DELETE="true"

# Frontend
APP_API_URL="https://api.mycompany.com"
INFERENCE_API_URL="https://inference.mycompany.com"
PRODUCTION="true"
ENABLE_AUTHENTICATION="true"

# CORS
CDK_FILE_UPLOAD_CORS_ORIGINS="https://app.mycompany.com"

# Scaling
CDK_APP_API_DESIRED_COUNT="3"
CDK_APP_API_MAX_CAPACITY="20"
CDK_INFERENCE_API_DESIRED_COUNT="3"
CDK_INFERENCE_API_MAX_CAPACITY="20"
```

#### Development Environment

```bash
# Core
CDK_PROJECT_PREFIX="mycompany-agentcore-dev"
CDK_AWS_ACCOUNT="987654321098"  # Secret (different account)
CDK_AWS_REGION="us-west-2"
AWS_ROLE_ARN="arn:aws:iam::987654321098:role/dev-deploy"  # Secret

# Behavior
CDK_RETAIN_DATA_ON_DELETE="false"  # Auto-delete for easy cleanup

# Frontend
APP_API_URL="https://dev-api.mycompany.com"
INFERENCE_API_URL="https://dev-inference.mycompany.com"
PRODUCTION="false"
ENABLE_AUTHENTICATION="true"

# CORS
CDK_FILE_UPLOAD_CORS_ORIGINS="https://dev-app.mycompany.com,http://localhost:4200"

# Scaling (minimal)
CDK_APP_API_DESIRED_COUNT="1"
CDK_APP_API_MAX_CAPACITY="5"
CDK_INFERENCE_API_DESIRED_COUNT="1"
CDK_INFERENCE_API_MAX_CAPACITY="5"
```

### Setting Configuration in GitHub

#### For Single-Environment Deployment

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **Variables** tab and add each variable
4. Click **Secrets** tab and add sensitive values (AWS_ROLE_ARN, CDK_AWS_ACCOUNT)

#### For Multi-Environment Deployment (Advanced)

Use GitHub Environments to manage separate configurations for dev/staging/prod:

1. Go to **Settings** → **Environments**
2. Create environments: `development`, `staging`, `production`
3. For each environment, add environment-specific variables and secrets
4. Optionally add protection rules (required reviewers, wait timers) for production

See [docs/GITHUB_ENVIRONMENTS.md](docs/GITHUB_ENVIRONMENTS.md) for detailed setup instructions.

### Resource Naming

All AWS resources are named using the pattern: `{CDK_PROJECT_PREFIX}-{resource-type}`

**Examples:**
- VPC: `mycompany-agentcore-prod-vpc`
- DynamoDB Table: `mycompany-agentcore-prod-user-quotas`
- S3 Bucket: `mycompany-agentcore-prod-user-files`

**Important:** Use different `CDK_PROJECT_PREFIX` values when deploying multiple environments to the same AWS account to avoid resource name conflicts.

### Validation

The application validates configuration at deployment time:

- **Missing required variables**: Deployment fails with clear error message listing missing variables
- **Invalid boolean values**: Must be "true", "false", "1", or "0"
- **Invalid AWS account ID**: Must be 12-digit number
- **Invalid AWS region**: Must be valid AWS region code

**Example error:**
```
Error: CDK_PROJECT_PREFIX is required.
Set this environment variable to your desired resource name prefix
(e.g., "mycompany-agentcore" or "mycompany-agentcore-prod")
```
<!-- # AgentCore Public Stack

Production-ready multi-agent conversational AI system built with Bedrock AgentCore and Strands Agents.
Supports RAG workflows, MCP-based tool integration, multimodal input/output, financial analysis tools,
and deep research orchestration with prompt caching and multi-protocol tool execution.

## Overview

Combines Strands Agent orchestration with AWS Bedrock AgentCore services:
- **Strands Agent**: Multi-turn conversation orchestration with tool execution
- **AgentCore Runtime**: Containerized agent deployment as managed AWS service
- **AgentCore Memory**: Persistent conversation storage with user preference retrieval
- **AgentCore Gateway**: MCP tool integration with SigV4 authentication
- **AgentCore Code Interpreter**: Built-in code execution for data analysis, visualization, and chart generation
- **AgentCore Browser**: Web automation via headless browser with live view streaming
- **Amazon Nova Act**: Agentic foundation model for browser automation with visual reasoning

**Quick Links:** [📸 UI Preview](#ui-preview) | [📹 Demo Videos](#demo-videos)

## Architecture

<img src="docs/images/architecture-overview.svg"
     alt="Architecture Overview"
     width="1200">

### Core Components

1. **Frontend** (Angular v21+)
   - Server-side API routes as Backend-for-Frontend
   - Cognito authentication with JWT validation
   - SSE streaming from AgentCore Runtime
   - Session management and file upload handling

2. **AgentCore Runtime**
   - Strands Agent with Bedrock Claude models
   - Turn-based session manager (optimized message buffering)
   - Uses AgentCore Memory for conversation persistence
   - Integrates with AgentCore Gateway via SigV4
   - Calls Built-in Tools via AWS API
   - Communicates with other agents via A2A protocol (Work in Progress)

3. **AgentCore Gateway**
   - MCP tool endpoints with SigV4 authentication
   - Routes requests to 5 Lambda functions (12 tools total)
   - Lambda functions use MCP protocol
   - Tools: Wikipedia, ArXiv, Google Search, Tavily, Finance

4. **AgentCore Memory**
   - Persistent conversation storage
   - Automatic history management across sessions

5. **Tool Ecosystem**
   - **Local Tools**: Weather, visualization, web search, URL fetcher (embedded in Runtime)
   - **Built-in Tools**: AgentCore Code Interpreter for diagrams/charts, AgentCore Browser for automation (AWS SDK + WebSocket)
   - **Gateway Tools**: Research, search, and finance data (via AgentCore Gateway + MCP)
   - **Runtime Tools** (Work in Progress): Report Writer with A2A protocol

## Key Features

- Amazon Bedrock AgentCore Runtime
- Strands Agent Orchestration
- MCP Gateway Tools (Wikipedia, ArXiv, Google, Tavily)
- A2A Agent-to-Agent Protocol
- Financial research tools (stock data, market news)
- Multimodal I/O (Vision, Charts, Documents, Screenshots)

## Use Cases
- Financial research agent with stock analysis & SEC ingestion
- Technical research assistant using multi-agent architecture
- Web automation agent via AgentCore Browser + Nova Act
- RAG-enabled chatbot using AgentCore Memory
- Multi-protocol research assistant (MCP, A2A, AWS SDK)

## UI Preview

<img src="docs/images/home.svg" alt="Application Overview" width="900">

*Interactive chatbot with dynamic tool filtering and multi-agent orchestration*

## Demo Videos

| Finance Assistant | Browser Automation | Academic Research |
|:---:|:---:|:---:|
| [<img src="docs/images/demo-finance.png" width="280">](https://drive.google.com/file/d/1QQyaBWwzNOiLWe5LKZrSZoN68t7gsJdO/view?usp=sharing) | [<img src="docs/images/demo-browser.png" width="280">](https://drive.google.com/file/d/1lPJGStD_YMWdF4a_k9ca_Kr-mah5yBnj/view?usp=sharing) | [<img src="docs/images/demo-academic.png" width="280">](https://drive.google.com/file/d/1FliAGRSMFBh41m5xZe2mNpSmLtu_T1yN/view?usp=sharing) |
| *Stock analysis, market news* | *Web automation with Nova Act* | *Research papers via ArXiv & Wikipedia* |

## Key Technical Features

**1. Full-stack Web-based Chatbot Application**

- **Frontend**: Angular v21, TypeScript, Tailwind CSS
- **Backend**: Python FastAPI routes for SSE streaming, authentication, session management
- **Agent Runtime**: Strands Agent orchestration on AgentCore Runtime (containerized)
- **Persistence**: AgentCore Memory for conversation history and user context
- **Authentication**: Multiple Providers (EntraId, Cognito, Google, Generic)
- **Deployment**: TBD

**2. Multi-Protocol Tool Architecture**

Tools communicate via different protocols based on their characteristics:

| Tool Type | Protocol | Count | Examples | Authentication |
|-----------|----------|-------|----------|----------------|
| **Local Tools** | Direct function calls | 5 | Weather, Web Search, Visualization | N/A |
| **Built-in Tools** | AWS SDK + WebSocket | 4 | AgentCore Code Interpreter, Browser (Nova Act) | IAM |
| **Gateway Tools** | MCP + SigV4 | 12 | Wikipedia, ArXiv, Finance (Lambda) | AWS SigV4 |
| **Runtime Tools** | A2A protocol | 9 | Report Writer | AgentCore auth |

Status: 21 tools ✅ / 9 tools 🚧. See [Implementation Details](#multi-protocol-tool-architecture) for complete tool list.

**3. Dynamic Tool Filtering**

Users can enable/disable specific tools via UI sidebar, and the agent dynamically filters tool definitions before each invocation, sending only selected tools to the model to reduce prompt token count and optimize costs.

**4. Token Optimization via Prompt Caching**

Implements hooks-based caching strategy with system prompt caching and dynamic conversation history caching (last 2 messages), using rotating cache points (max 4 total) to significantly reduce input token costs across repeated API calls.

**5. Multimodal Input/Output**

Native support for visual and document content:
- **Input**: Images (PNG, JPEG, GIF, WebP), Documents (PDF, CSV, DOCX, etc.)
- **Output**: Charts from AgentCore Code Interpreter, screenshots from AgentCore Browser

**6. Two-tier Memory System**

Combines session-based conversation history (short-term) with namespaced user preferences and facts (long-term) stored in AgentCore Memory, enabling cross-session context retention with relevance-scored retrieval per user.

## Implementation Details

### Multi-Protocol Tool Architecture

See [docs/TOOLS.md](docs/TOOLS.md) for detailed tool specifications.

| Tool Name | Protocol | API Key | Status | Description |
|-----------|----------|---------|--------|-------------|
| **Local Tools** | | | | |
| Calculator | Direct call | No | ✅ | Mathematical computations |
| Weather Lookup | Direct call | No | ✅ | Current weather by city |
| Visualization Creator | Direct call | No | ✅ | Interactive charts (Plotly) |
| Web Search | Direct call | No | ✅ | DuckDuckGo search |
| URL Fetcher | Direct call | No | ✅ | Web content extraction |
| **Built-in Tools** | | | | |
| Diagram Generator | AWS SDK | No | ✅ | Charts/diagrams via AgentCore Code Interpreter |
| Browser Automation (3 tools) | AWS SDK + WebSocket | Yes | ✅ | Navigate, action, extract via AgentCore Browser (Nova Act) |
| **Gateway Tools** | | | | |
| Wikipedia (2 tools) | MCP + SigV4 | No | ✅ | Article search and retrieval |
| ArXiv (2 tools) | MCP + SigV4 | No | ✅ | Scientific paper search |
| Google Search (2 tools) | MCP + SigV4 | Yes | ✅ | Web and image search |
| Tavily AI (2 tools) | MCP + SigV4 | Yes | ✅ | AI-powered search and extraction |
| Financial Market (4 tools) | MCP + SigV4 | No | ✅ | Stock quotes, history, news, analysis (Yahoo Finance) |
| **Runtime Tools** | | | | |
| Report Writer (9 tools) | A2A | No | 🚧 | Multi-section research reports with charts |

**Protocol Details:**
- **Direct call**: Python function with `@tool` decorator, executed in runtime container
- **AWS SDK**: Bedrock client API calls (AgentCore Code Interpreter, AgentCore Browser)
- **WebSocket**: Real-time bidirectional communication for browser automation
- **MCP + SigV4**: Model Context Protocol with AWS SigV4 authentication
- **A2A**: Agent-to-Agent protocol for runtime-to-runtime communication

**Total: 30 tools** (21 ✅ / 9 🚧)

### Dynamic Tool Filtering

**Implementation:** `agent.py:277-318`

```python
# User-selected tools from UI sidebar
enabled_tools = ["calculator", "gateway_wikipedia-search___wikipedia_search"]

# Filters applied before agent creation
agent = Agent(
    model=model,
    tools=get_filtered_tools(enabled_tools),  # Dynamic filtering
    session_manager=session_manager
)
```

<img src="docs/images/tool-filtering-flow.svg" alt="Tool Filtering Flow" width="800">

**Flow:**
1. **User Toggle**: User selects tools via UI sidebar
2. **Enabled Tools**: Frontend sends enabled tool list to AgentCore Runtime
3. **Tool Filtering**: Strands Agent filters tools before model invocation
4. **Invoke**: Model receives only enabled tool definitions
5. **ToolCall**: Agent executes local or remote tools as needed

**Benefits:**
- Reduced token usage (only selected tool definitions sent to model)
- Per-user customization
- Real-time tool updates without redeployment

### Token Optimization: Prompt Caching

**Implementation:** `model_config.py` via `CacheConfig(strategy="auto")`

Automatic prompt caching via Strands SDK (v1.24+):

```python
from strands.models import BedrockModel, CacheConfig

model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    cache_config=CacheConfig(strategy="auto")
)
```

**Cache Strategy:**
- Single cache point at end of last assistant message
- Automatically injected before each model call
- Covers system prompt, tools, and conversation history
- Reduces input tokens for repeated content

<img src="docs/images/prompt-caching.svg" alt="Prompt Caching Strategy" width="800">

**Visual Explanation:**
- 🟧 **Orange**: Cache creation (new content cached)
- 🟦 **Blue**: Cache read (reusing cached content)
- Event1 creates initial cache, Event2+ reuses and extends cached context

### Turn-based Session Manager

**Implementation:** `turn_based_session_manager.py:15-188`

Buffers messages within a turn to reduce AgentCore Memory API calls:

```
Without buffering:
User message     → API call 1
Assistant reply  → API call 2
Tool use         → API call 3
Tool result      → API call 4
Total: 4 API calls per turn

With buffering:
User → Assistant → Tool → Result  → Single merged API call
Total: 1 API call per turn (75% reduction)
```

**Key Methods:**
- `append_message()`: Buffers messages instead of immediate persistence
- `_should_flush_turn()`: Detects turn completion
- `flush()`: Writes merged message to AgentCore Memory

### Multimodal I/O

**Input Processing** (`agent.py:483-549`):
- Converts uploaded files to `ContentBlock` format
- Supports images (PNG, JPEG, GIF, WebP) and documents (PDF, CSV, DOCX, etc.)
- Files sent as raw bytes in message content array

**Output Rendering**:
- Tools return `ToolResult` with multimodal content
- Images from AgentCore Code Interpreter and Browser rendered inline
- Image bytes delivered as raw bytes (not base64)
- Files downloadable from frontend

**Example Tool Output:**
```python
return {
    "content": [
        {"text": "Chart generated successfully"},
        {"image": {"format": "png", "source": {"bytes": image_bytes}}}
    ],
    "status": "success"
}
```

### Two-tier Memory System

**Implementation:** `agent.py:223-235`

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

**Memory Tiers:**
- **Short-term**: Session conversation history (automatic via session manager)
- **Long-term**: Namespaced key-value storage with vector retrieval
- Cross-session persistence via `actor_id` (user identifier)

<!-- ### Cloud Deployment

Deploy the full-stack application to AWS:

```bash
# Navigate to deployment directory
cd agent-blueprint

# Full deployment (all components)
./deploy.sh
```

**Deployment Components:**

1. **Main Application Stack** (`chatbot-deployment/`)
   - Frontend + BFF (Next.js on Fargate)
   - AgentCore Runtime (Strands Agent)
   - AgentCore Memory (conversation persistence)
   - CloudFront, ALB, Cognito
   - Deploy: `cd chatbot-deployment/infrastructure && ./scripts/deploy.sh`

2. **AgentCore Gateway Stack** (`agentcore-gateway-stack/`)
   - MCP tool endpoints with SigV4 authentication
   - 5 Lambda functions (12 tools total)
   - Wikipedia, ArXiv, Google Search, Tavily, Finance
   - Deploy: `cd agentcore-gateway-stack && ./scripts/deploy.sh`

3. **Report Writer Runtime** (Optional, `agentcore-runtime-a2a-stack/`)
   - A2A protocol-based agent collaboration
   - Multi-section research report generation
   - Deploy: `cd agentcore-runtime-a2a-stack/report-writer && ./deploy.sh`

## Deployment Architecture

```
User → CloudFront → ALB → Frontend+BFF (Fargate)
                              ↓ HTTP
                         AgentCore Runtime
                         (Strands Agent container)
                              ↓
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ↓ SigV4           ↓ A2A             ↓ AWS SDK
     AgentCore Gateway   Report Writer     Built-in Tools
     (MCP endpoints)     Runtime 🚧        (Code Interpreter,
            ↓                               Browser + Nova Act)
     Lambda Functions (5x)
     └─ Wikipedia, ArXiv,
        Google, Tavily, Finance

     AgentCore Memory
     └─ Conversation history
        User preferences & facts
```

## Technology Stack

**Frontend & Backend:**
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui
- **BFF**: Next.js API Routes (SSE streaming, authentication, session management)
- **Deployment**: AWS Fargate (containerized)

**AI & Agent:**
- **Orchestration**: Strands Agents (Python)
- **Models**: AWS Bedrock Claude (Haiku default, Sonnet available)
- **Runtime**: AgentCore Runtime (containerized Strands Agent)

**AgentCore Services:**
- **Memory**: Conversation history with user preferences/facts retrieval
- **Gateway**: MCP tool endpoints with SigV4 authentication
- **Code Interpreter**: Python code execution for diagrams/charts
- **Browser**: Web automation with Nova Act AI model

**Tools & Integration:**
- **Local Tools**: Direct Python function calls (5 tools)
- **Built-in Tools**: AWS SDK + WebSocket (4 tools)
- **Gateway Tools**: Lambda + MCP protocol (12 tools)
- **Runtime Tools**: A2A protocol (9 tools, in progress)

**Infrastructure:**
- **IaC**: AWS CDK (TypeScript)
- **Frontend CDN**: CloudFront
- **Load Balancer**: Application Load Balancer
- **Authentication**: AWS Cognito
- **Compute**: Fargate containers


## Iframe Embedding

Embed the chatbot in external applications:

```html
<iframe
  src="https://your-domain.com/embed"
  width="100%"
  height="600"
  frameborder="0">
</iframe>
```

## Project Structure

```
sample-strands-agent-chatbot/
├── chatbot-app/
│   ├── frontend/              # Next.js (Frontend + BFF)
│   │   └── src/
│   │       ├── app/api/       # API routes (BFF layer)
│   │       ├── components/    # React components
│   │       └── config/        # Tool configuration
│   └── agentcore/             # AgentCore Runtime
│       └── src/
│           ├── agent/         # ChatbotAgent + session management
│           ├── local_tools/   # Weather, visualization, etc.
│           ├── builtin_tools/ # Code Interpreter tools
│           └── routers/       # FastAPI routes
│
└── agent-blueprint/
    ├── chatbot-deployment/    # Main app stack (Frontend+Runtime)
    ├── agentcore-gateway-stack/   # Gateway + 5 Lambda functions
    ├── agentcore-runtime-stack/   # Runtime deployment (shared)
    └── agentcore-runtime-a2a-stack/   # Report Writer (optional)
```

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md): Detailed deployment instructions

## Support

- **Issues**: [GitHub Issues](https://github.com/aws-samples/sample-strands-agent-with-agentcore/issues)
- **Troubleshooting**: [docs/guides/TROUBLESHOOTING.md](docs/guides/TROUBLESHOOTING.md)

## License

MIT License - see LICENSE file for details. -->