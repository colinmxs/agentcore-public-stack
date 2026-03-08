# Step 4 of 5 — Deploy Workflows

✅ Step 1: Prerequisites<br>
✅ Step 2: AWS Setup<br>
✅ Step 3: Configure GitHub<br>
➡️ **Step 4: Deploy Workflows** ← You are here<br>
⬜ Step 5: Verify Deployment

⏱️ ~20-30 minutes · 🟢 Easy (just clicking buttons) · Requires: Steps 1-3 complete

---

Now for the fun part. You'll trigger 7 GitHub Actions workflows in order. Each one deploys a different layer of the stack.

## What you'll need for this step

- Access to the **Actions** tab in your forked repository
- Patience — the first deploy takes the longest as AWS provisions new resources

---

## How to Run Each Workflow

1. Go to the **Actions** tab in your repository
2. Select the workflow from the left sidebar
3. Click **Run workflow** → select the `main` branch → click the green **Run workflow** button
4. Wait for it to complete (green checkmark) before starting the next one

> [!IMPORTANT]
> Run these workflows **in order**. Each step depends on resources created by the previous step. Wait for each workflow to finish before starting the next.

> [!WARNING]
> The first deployment takes the longest (~15-20 minutes for Step 1) because AWS is creating resources from scratch. Subsequent deployments are much faster.

---

## Deployment Order

| # | Workflow | What It Deploys |
|:-:|---------|-----------------|
| 1 | **Deploy Infrastructure** | VPC, subnets, ALB, ECS cluster, DynamoDB tables, S3 buckets |
| 2 | **Deploy RAG Ingestion** | Document ingestion pipeline for retrieval-augmented generation |
| 3 | **Deploy Inference API** | Strands Agent runtime container on ECS (Bedrock AgentCore) |
| 4 | **Deploy App API** | Backend REST API container on ECS |
| 5 | **Deploy Frontend** | Angular app to S3 + CloudFront distribution |
| 6 | **Deploy Gateway** | Lambda functions for MCP tool endpoints |
| 7 | **Seed Bootstrap Data** | Auth provider, default models, roles, tools, and admin config |

### Status Badges

You can monitor the current state of each workflow:

| Workflow | Status |
|----------|--------|
| Deploy Infrastructure | [![Step 1](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/infrastructure.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/infrastructure.yml) |
| Deploy RAG Ingestion | [![Step 2](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/rag-ingestion.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/rag-ingestion.yml) |
| Deploy Inference API | [![Step 3](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/inference-api.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/inference-api.yml) |
| Deploy App API | [![Step 4](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/app-api.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/app-api.yml) |
| Deploy Frontend | [![Step 5](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/frontend.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/frontend.yml) |
| Deploy Gateway | [![Step 6](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/gateway.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/gateway.yml) |
| Seed Bootstrap Data | [![Step 7](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/bootstrap-data-seeding.yml/badge.svg)](https://github.com/Boise-State-Development/agentcore-public-stack/actions/workflows/bootstrap-data-seeding.yml) |

> [!NOTE]
> All workflows default to the **production** environment when triggered manually.

---

## What Each Workflow Does

<details>
<summary>1. Deploy Infrastructure (VPC, ALB, ECS)</summary>

Creates the foundational AWS resources:
- VPC with public and private subnets
- Application Load Balancer with HTTPS
- ECS cluster for running containers
- DynamoDB tables (sessions, users, roles, quotas, models, costs)
- S3 buckets (file uploads, frontend assets)
- Route 53 DNS records for your API subdomain

This is the longest-running workflow on first deploy (~15-20 minutes).

</details>

<details>
<summary>2. Deploy RAG Ingestion</summary>

Sets up the document ingestion pipeline for retrieval-augmented generation. This enables your agents to search through uploaded documents when answering questions.

</details>

<details>
<summary>3. Deploy Inference API (AgentCore Runtime)</summary>

Deploys the Strands Agent runtime as an ECS service. This is the brain of the system — it runs the AI agent that processes user messages, invokes tools, and generates responses using AWS Bedrock models.

</details>

<details>
<summary>4. Deploy App API (Backend)</summary>

Deploys the main backend REST API as an ECS service. Handles:
- User authentication and session management
- Chat message routing to the Inference API
- Admin endpoints for models, tools, and roles
- SSE streaming for real-time responses

</details>

<details>
<summary>5. Deploy Frontend (CloudFront)</summary>

Builds the Angular application and deploys it to:
- S3 bucket for static asset hosting
- CloudFront CDN for global distribution and HTTPS
- Route 53 DNS record for your frontend domain

</details>

<details>
<summary>6. Deploy Gateway (Lambda Tools)</summary>

Deploys Lambda-based MCP tool endpoints behind API Gateway. These provide the agent with access to external services like Wikipedia, ArXiv, financial data, and more. Tools are invoked via MCP protocol with AWS SigV4 authentication.

</details>

<details>
<summary>7. Seed Bootstrap Data</summary>

Seeds your application with initial configuration:
- Auth provider (from your `SEED_AUTH_*` variables)
- Default AI models and pricing
- Application roles and permissions
- Default tool configurations
- Admin role mapping (if `SEED_ADMIN_JWT_ROLE` is set)

You can re-run this workflow later to update seed data.

</details>

---

## If a Workflow Fails

1. Click into the failed workflow run to see the error logs
2. Check the [Troubleshooting Guide](./troubleshooting.md) for common issues
3. Fix the issue (usually a missing variable or permission) and re-run the workflow
4. You don't need to re-run workflows that already succeeded

> [!TIP]
> The most common failure cause is a missing or incorrect variable in Step 3. Double-check your configuration if a workflow fails immediately.

---

### ➡️ [Next: Step 5 — Verify Deployment](./step-05-verify.md)
