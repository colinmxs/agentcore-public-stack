# GitHub Actions — Deploy Guide

This guide walks you through deploying the AgentCore Public Stack from a fork of this repository. Follow the steps in order — each one builds on the last.

## Step A: Prepare Your AWS Account

Before touching GitHub, you need three things set up in AWS.

### A1. Set Up AWS Authentication

Choose one of these two methods. Your GitHub workflows will use these credentials to deploy resources.

**Option 1: OIDC Role (recommended)**

This is the more secure approach — no long-lived keys to rotate.

1. Create an IAM OIDC identity provider for `token.actions.githubusercontent.com`
2. Create an IAM role that trusts the GitHub OIDC provider, scoped to your repository
3. Note the role ARN — you'll need it in Step B

See: [Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)

**Option 2: IAM Access Keys (simpler, less secure)**

1. Create an IAM user with programmatic access and the necessary deployment permissions
2. Generate an access key pair
3. Note the Access Key ID and Secret Access Key — you'll need them in Step B

### A2. Create a Route 53 Hosted Zone

Create a public hosted zone for your domain (e.g. `example.com`).

See: [Creating a public hosted zone](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/CreatingHostedZone.html)

### A3. Create ACM Certificates

You need two certificates, both for the same domain:

| Certificate | Region | Used By |
|-------------|--------|---------|
| ALB certificate | Your deployment region (e.g. `us-west-2`) | Application Load Balancer |
| CloudFront certificate | `us-east-1` (required by CloudFront) | Frontend CDN |

See: [Requesting a public certificate](https://docs.aws.amazon.com/acm/latest/userguide/gs-acm-request-public.html)

---

## Step B: Configure GitHub Repository

Go to your forked repository: **Settings → Secrets and variables → Actions**

### Secrets

These are encrypted values that never appear in logs.

| Name | Required | Description |
|------|:--------:|-------------|
| `AWS_ROLE_ARN` | If using OIDC | IAM role ARN from Step A1 |
| `AWS_ACCESS_KEY_ID` | If using keys | IAM access key from Step A1 |
| `AWS_SECRET_ACCESS_KEY` | If using keys | IAM secret key from Step A1 |
| `CDK_CERTIFICATE_ARN` | Yes | ACM certificate ARN for the ALB (from Step A3, in your deployment region) |
| `CDK_FRONTEND_CERTIFICATE_ARN` | Yes | ACM certificate ARN for CloudFront (from Step A3, must be `us-east-1`) |

### Variables

These are non-sensitive configuration values.

| Name | Required | Example | Description |
|------|:--------:|---------|-------------|
| `AWS_REGION` | Yes | `us-west-2` | AWS region for all resources |
| `CDK_AWS_ACCOUNT` | Yes | `123456789012` | Your 12-digit AWS account ID |
| `CDK_PROJECT_PREFIX` | Yes | `agentcore` | Unique prefix for all AWS resource names |
| `CDK_HOSTED_ZONE_DOMAIN` | Yes | `example.com` | Route 53 hosted zone domain (from Step A2) |
| `CDK_ALB_SUBDOMAIN` | Yes | `api` | Subdomain for the ALB (e.g. `api.example.com`) |
| `CDK_DOMAIN_NAME` | Yes | `app.example.com` | Custom domain for the CloudFront distribution |

That's it for required config. All other values have sensible defaults — see [ACTIONS-REFERENCE.md](./ACTIONS-REFERENCE.md) for the full list.

---

## Step C: Deploy

Go to the **Actions** tab and run each workflow in order. Wait for each step to complete before starting the next.

| Order | Workflow | Status |
|:-----:|---------|--------|
| 1 | [Deploy Infrastructure (VPC, ALB, ECS)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/infrastructure.yml) | [![Step 1](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/infrastructure.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/infrastructure.yml) |
| 2 | [Deploy RAG Ingestion](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/rag-ingestion.yml) | [![Step 2](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/rag-ingestion.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/rag-ingestion.yml) |
| 3 | [Deploy Inference API (AgentCore Runtime)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/inference-api.yml) | [![Step 3](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/inference-api.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/inference-api.yml) |
| 4 | [Deploy App API (Backend)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/app-api.yml) | [![Step 4](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/app-api.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/app-api.yml) |
| 5 | [Deploy Frontend (CloudFront)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/frontend.yml) | [![Step 5](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/frontend.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/frontend.yml) |
| 6 | [Deploy Gateway (Lambda Tools)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/gateway.yml) | [![Step 6](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/gateway.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/gateway.yml) |
| 7 | [Seed Bootstrap Data](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/bootstrap-data-seeding.yml) | [![Step 7](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/bootstrap-data-seeding.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/bootstrap-data-seeding.yml) |

All workflows default to the **production** environment when triggered manually. To tear down, run them in reverse order (7 → 1).

---

## Step D: Configure Authentication (Optional)

To set up an OIDC auth provider (e.g. Microsoft Entra ID) via the Bootstrap Data Seeding workflow, add these to your GitHub repository:

| Name | Type | Example | Description |
|------|------|---------|-------------|
| `SEED_AUTH_PROVIDER_ID` | Variable | `entra-id` | Slug identifier for the auth provider |
| `SEED_AUTH_DISPLAY_NAME` | Variable | `Microsoft Entra ID` | Display name on the login page |
| `SEED_AUTH_ISSUER_URL` | Variable | `https://login.microsoftonline.com/TENANT/v2.0` | OIDC issuer URL |
| `SEED_AUTH_CLIENT_ID` | Variable | `your-client-id` | OAuth client ID |
| `SEED_AUTH_CLIENT_SECRET` | Secret | `your-client-secret` | OAuth client secret |
| `SEED_AUTH_BUTTON_COLOR` | Variable | `#0078D4` | Login button color |

Then re-run **Step 7 — Seed Bootstrap Data**.

---

## Optional Integrations

| Name | Type | Description |
|------|------|-------------|
| `ENV_INFERENCE_API_TAVILY_API_KEY` | Secret | Tavily API key for web search |
| `ENV_INFERENCE_API_NOVA_ACT_API_KEY` | Secret | Amazon Nova Act API key for browser automation |

---

## Full Configuration Reference

For every available variable and secret (resource sizing, CORS, WAF, throttling, etc.), see [ACTIONS-REFERENCE.md](./ACTIONS-REFERENCE.md).
