# AgentCore Backend

This backend uses a unified dependency management approach with a single `pyproject.toml` file.

## Installation

### For App API (Authentication Service)

The App API only needs core dependencies (FastAPI, auth utilities):

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -e "."
```

### For Inference API (Agent Execution Service)

The Inference API needs core dependencies + AgentCore-specific packages:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -e ".[agentcore]"
```

### For Development (All Dependencies + Dev Tools)

Install everything including pytest, black, ruff, mypy:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -e ".[agentcore,dev]"
```

## AWS Configuration

This project requires AWS credentials for Bedrock and other AWS services.

**Quick Setup:**
```bash
# Configure AWS CLI profile
aws configure --profile my-profile

# Set in .env file
echo "AWS_PROFILE=my-profile" >> src/.env

# Or use environment variable
export AWS_PROFILE=my-profile
```

📖 **See [AWS_PROFILE_GUIDE.md](../AWS_PROFILE_GUIDE.md) for detailed configuration options including:**
- Multiple AWS accounts/profiles
- AWS SSO (IAM Identity Center)
- Environment variable fallback
- CI/CD configuration
- Troubleshooting

## Project Structure

```
backend/
├── pyproject.toml          # Single source of truth for all dependencies
├── src/
│   ├── agentcore/          # Agent orchestration & tools
│   └── apis/
│       ├── shared/         # Shared auth utilities
│       ├── app_api/        # Authentication API (port 8000)
│       └── inference_api/  # Agent execution API (port 8001)
```

## Running APIs

### App API (Authentication)
```bash
cd backend
source venv/bin/activate
cd src/apis/app_api
python main.py
# Runs on http://localhost:8000
```

### Inference API (Agent Execution)
```bash
cd backend
source venv/bin/activate
cd src/apis/inference_api
python main.py
# Runs on http://localhost:8001
```

## Authentication Providers

The platform supports configurable OIDC authentication providers, allowing admins to set up one or more identity providers (Entra ID, Okta, Google, etc.) through the Admin UI.

### First-Time Setup (Bootstrap)

When deploying for the first time, no auth providers exist yet and no users can log in — a classic chicken-and-egg problem. The **seed script** solves this by writing directly to DynamoDB and Secrets Manager, bypassing the API entirely.

#### Prerequisites

- AWS credentials configured (via env vars, profile, or IAM role)
- CDK stacks deployed (`npx cdk deploy --all`) — this creates the DynamoDB table and Secrets Manager secret
- Python venv activated with project dependencies installed

#### Step 1: Seed your first provider

**Interactive mode** (prompts for all values):

```bash
cd backend
python scripts/seed_auth_provider.py
```

**Non-interactive** (for scripted/CI deployments):

```bash
python scripts/seed_auth_provider.py \
    --provider-id entra-id \
    --display-name "Microsoft Entra ID" \
    --issuer-url "https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0" \
    --client-id "YOUR_CLIENT_ID" \
    --client-secret "YOUR_CLIENT_SECRET" \
    --discover \
    --button-color "#0078D4" \
    --table-name auth-providers \
    --secrets-arn "arn:aws:secretsmanager:us-west-2:ACCOUNT:secret:auth-provider-secrets-XXXXX"
```

**Dry run** (preview without writing anything):

```bash
python scripts/seed_auth_provider.py --dry-run \
    --provider-id entra-id \
    --issuer-url "https://login.microsoftonline.com/YOUR_TENANT/v2.0" \
    ...
```

The `--discover` flag auto-fills all OIDC endpoints (authorization, token, JWKS, userinfo, logout) from the provider's `.well-known/openid-configuration`. If your provider requires custom claim mappings, use flags like `--user-id-claim`, `--roles-claim`, `--email-claim`, etc.

The `--client-secret` flag is optional on the command line — if omitted, the script prompts for it securely via password input so it doesn't appear in shell history.

Run `python scripts/seed_auth_provider.py --help` for the full list of options.

#### Step 2: Configure environment variables

Ensure these are set in your backend environment (`.env` or ECS task definition):

```bash
# Points to the DynamoDB table and Secrets Manager secret created by CDK
DYNAMODB_AUTH_PROVIDERS_TABLE_NAME=auth-providers
AUTH_PROVIDER_SECRETS_ARN=arn:aws:secretsmanager:us-west-2:ACCOUNT:secret:auth-provider-secrets-XXXXX

# JWT roles that grant system admin access (must match a role your IdP issues)
ADMIN_JWT_ROLES='["Admin"]'

# Ensure authentication is enabled (this is the default)
ENABLE_AUTHENTICATION=true
```

#### Step 3: Start the backend and log in

```bash
cd src/apis/app_api && python main.py
```

Log in through your new provider. If your JWT contains a role listed in `ADMIN_JWT_ROLES`, you'll have admin access and can manage providers, roles, models, and quotas through the Admin UI.

### Adding Providers After Initial Setup

Once the first provider is bootstrapped and you can log in as an admin, additional providers are managed entirely through the Admin UI:

**Admin Dashboard > Auth Providers > Add Provider**

The form supports OIDC Discovery (enter an issuer URL and click "Discover" to auto-fill endpoints), configurable JWT claim mappings, validation rules, and login page appearance customization.

### Migration from Hardcoded Entra ID

If the platform was previously using the hardcoded Entra ID configuration (via `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, etc.), both systems work simultaneously during migration:

1. Deploy with the new auth-providers table alongside the existing Entra ID env vars
2. Log in using the existing Entra ID flow (still works unchanged)
3. Create an Entra ID entry in Auth Providers through the Admin UI
4. Verify the new provider works
5. Remove the legacy `ENTRA_*` env vars in a later deployment

The JWT validation layer tries the new multi-provider system first, then falls back to the legacy Entra ID validator, so there is no disruption during the transition.

## Module Imports

All modules are properly packaged and can be imported directly:

```python
# Import shared auth utilities
from apis.shared.auth import get_current_user, User, StateStore

# Import agentcore modules
from agentcore.agent.agent import ChatbotAgent
from agentcore.local_tools.weather import get_weather
```

## Dependencies Overview

### Core Dependencies (all APIs)
- FastAPI 0.116.1
- Uvicorn 0.35.0
- Boto3 (AWS SDK)
- python-dotenv
- httpx
- PyJWT (authentication)

### AgentCore Dependencies (inference_api only)
- strands-agents 1.14.0
- strands-agents-tools 0.2.3
- bedrock-agentcore
- nova-act 2.3.18.0
- aws-opentelemetry-distro
- ddgs (DuckDuckGo search)

### Development Dependencies (optional)
- pytest
- pytest-asyncio
- black (code formatter)
- ruff (linter)
- mypy (type checker)

## Migration Notes

This structure replaces the previous approach that used:
- Multiple `pyproject.toml` files (one per package)
- Multiple `setup.py` files
- Multiple `requirements.txt` files with `-e` editable installs
- Manual `sys.path` manipulation

**Benefits:**
- Single source of truth for dependencies
- Consistent import patterns across all code
- Proper package resolution
- Better IDE support
- Easier dependency updates
- Works in containers without path hacks
