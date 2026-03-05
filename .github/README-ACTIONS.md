# GitHub Actions Quick Start

## Required Configuration

To deploy the AgentCore Public Stack via GitHub Actions, you need to configure these **required** values in your GitHub repository settings (Settings → Secrets and variables → Actions).

### Minimum Required Setup

| Name | Type | Example Value | Description |
|------|------|---------------|-------------|
| AWS_REGION | Variable | `us-west-2` | AWS region for all resource deployment |
| CDK_AWS_ACCOUNT | Variable | `123456789012` | Your 12-digit AWS account ID |
| CDK_PROJECT_PREFIX | Variable | `agentcore` | Unique prefix for all AWS resource names |

### Authentication (Choose One Method)

**Option A: AWS Access Keys** (simpler, less secure)
| Name | Type | Description |
|------|------|-------------|
| AWS_ACCESS_KEY_ID | Secret | AWS access key ID |
| AWS_SECRET_ACCESS_KEY | Secret | AWS secret access key |

**Option B: OIDC Role** (recommended, more secure)
| Name | Type | Description |
|------|------|-------------|
| AWS_ROLE_ARN | Secret | AWS IAM role ARN for GitHub OIDC authentication |

To set up OIDC between GitHub and AWS:
1. Create an IAM OIDC identity provider in your AWS account for `token.actions.githubusercontent.com`
2. Create an IAM role that trusts the GitHub OIDC provider, scoped to your repository
3. Store the role ARN as the `AWS_ROLE_ARN` secret

AWS provides a step-by-step guide: [Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)

## Account Prep

Before deploying, your AWS account needs a Route 53 hosted zone and two ACM certificates.

### 1. Create a Route 53 Hosted Zone

Create a public hosted zone for your domain (e.g. `example.com`). See [Creating a public hosted zone](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/CreatingHostedZone.html).

### 2. Create ACM Certificates

You need two certificates for the hosted zone domain:

- **ALB certificate** — requested in your deployment region (e.g. `us-west-2`)
- **CloudFront certificate** — requested in `us-east-1` (Virginia), required by CloudFront

See [Requesting a public certificate](https://docs.aws.amazon.com/acm/latest/userguide/gs-acm-request-public.html).

### 3. Add Required Variables

| Name | Type | Example Value | Description |
|------|------|---------------|-------------|
| CDK_HOSTED_ZONE_DOMAIN | Variable | `example.com` | Route 53 hosted zone domain name |
| CDK_ALB_SUBDOMAIN | Variable | `api` | Subdomain for the ALB (e.g. `api.example.com`) |
| CDK_CERTIFICATE_ARN | Secret | `arn:aws:acm:us-west-2:...` | ACM certificate ARN for the ALB (in deployment region) |
| CDK_FRONTEND_CERTIFICATE_ARN | Secret | `arn:aws:acm:us-east-1:...` | ACM certificate ARN for CloudFront (must be us-east-1) |
| CDK_FRONTEND_DOMAIN_NAME | Variable | `app.example.com` | Custom domain for the CloudFront distribution |

## Quick Deploy

Once you've set the required values above, go to the **Actions** tab in your GitHub repository and run the workflows in this order. Each step must complete before starting the next.

| Order | Workflow Name | What It Deploys |
|-------|--------------|-----------------|
| 1 | Step 1 — Deploy Infrastructure (VPC, ALB, ECS) | Foundation layer: VPC, ALB, ECS Cluster, Security Groups |
| 2 | Step 2 — Deploy RAG Ingestion | RAG ingestion pipeline (S3 Vector Buckets) |
| 3 | Step 3 — Deploy Inference API (AgentCore Runtime) | Bedrock AgentCore Runtime (Strands Agent container) |
| 4 | Step 4 — Deploy App API (Backend) | Application backend (Fargate service) |
| 5 | Step 5 — Deploy Frontend (CloudFront) | Angular app (S3 + CloudFront distribution) |
| 6 | Step 6 — Deploy Gateway (Lambda Tools) | Bedrock AgentCore Gateway + Lambda MCP tools |
| 7 | Step 7 — Seed Bootstrap Data | Auth providers, quota tiers, default models |

All workflows default to the **production** environment when triggered manually. To tear down, run the workflows in reverse order (Step 7 → Step 1).

All other configuration values have sensible defaults and are optional.

## Next Steps

- **Customize your deployment**: See [ACTIONS-REFERENCE.md](./ACTIONS-REFERENCE.md) for all available configuration options
- **Seed bootstrap data**: Set `SEED_AUTH_ISSUER_URL` (Variable), `SEED_AUTH_CLIENT_ID` (Variable), and `SEED_AUTH_CLIENT_SECRET` (Secret) to configure an OIDC auth provider via the Bootstrap Data Seeding workflow
- **Custom domains**: Configure `CDK_DOMAIN_NAME`, `CDK_HOSTED_ZONE_DOMAIN`, `CDK_CERTIFICATE_ARN`, and related domain settings
- **External integrations**: Add `ENV_INFERENCE_API_TAVILY_API_KEY` for web search, `ENV_INFERENCE_API_NOVA_ACT_API_KEY` for browser automation

## Configuration Reference

For a complete list of all configuration options organized by stack, see [ACTIONS-REFERENCE.md](./ACTIONS-REFERENCE.md).
