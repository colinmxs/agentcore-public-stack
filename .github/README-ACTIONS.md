# GitHub Actions Quick Start

## Required Configuration

To deploy the AgentCore Public Stack via GitHub Actions, you need to configure these **required** values in your GitHub repository settings (Settings → Secrets and variables → Actions).

### Minimum Required Setup

| Name | Type | Example Value | Description |
|------|------|---------------|-------------|
| AWS_REGION | Variable | `us-west-2` | AWS region for all resource deployment |
| CDK_AWS_ACCOUNT | Secret | `123456789012` | Your 12-digit AWS account ID |
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

## Quick Deploy

Once you've set the required values above:

1. Go to **Actions** tab in your GitHub repository
2. Select the **Infrastructure Stack** workflow and run it first
3. After Infrastructure completes, run the other stacks in any order:
   - App API Stack
   - Inference API Stack
   - Frontend Stack
   - Gateway Stack

All other configuration values have sensible defaults and are optional.

## Next Steps

- **Customize your deployment**: See [ACTIONS-REFERENCE.md](./ACTIONS-REFERENCE.md) for all available configuration options
- **Enable authentication**: Set `CDK_ENTRA_CLIENT_ID` and `CDK_ENTRA_TENANT_ID` for Microsoft Entra ID
- **Custom domains**: Configure `CDK_HOSTED_ZONE_DOMAIN`, `CDK_CERTIFICATE_ARN`, and related domain settings
- **External integrations**: Add `ENV_INFERENCE_API_TAVILY_API_KEY` for web search, `ENV_INFERENCE_API_NOVA_ACT_API_KEY` for browser automation

## Configuration Reference

For a complete list of all configuration options organized by stack, see [ACTIONS-REFERENCE.md](./ACTIONS-REFERENCE.md).
