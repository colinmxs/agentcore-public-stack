# GitHub Actions Configuration

## Introduction

This document provides a comprehensive reference for all GitHub Variables and Secrets required to deploy the AgentCore Public Stack via GitHub Actions CI/CD workflows. Each of the five deployment workflows (Infrastructure, App API, Inference API, Frontend, and Gateway) requires specific configuration values to successfully build and deploy their respective stacks to AWS.

Use this guide to understand which configuration values you need to set in your GitHub repository settings before running the deployment workflows. The documentation includes information about whether each value is required or optional, default values where applicable, and a description of what each configuration controls.

## GitHub Variables and Secrets

GitHub provides two mechanisms for storing configuration values:

- **Variables**: Non-sensitive configuration values stored in repository settings and accessed via `vars.*` in workflows. Use Variables for values like AWS regions, project prefixes, and resource sizing parameters that don't need encryption.

- **Secrets**: Sensitive configuration values stored encrypted in repository settings and accessed via `secrets.*` in workflows. Use Secrets for values like AWS credentials, API keys, certificate ARNs, and any other sensitive data that should never be exposed in logs or workflow files.

### Infrastructure Stack

The Infrastructure Stack creates the foundational AWS resources for the entire platform, including VPC, Application Load Balancer, ECS Cluster, security groups, and core DynamoDB tables. This stack must be deployed first before any other stacks.

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| AWS_ACCESS_KEY_ID | Secret | No | None | AWS access key ID for authentication (alternative to role-based auth) |
| AWS_REGION | Variable | Yes | `us-west-2` | AWS region for resource deployment |
| AWS_ROLE_ARN | Secret | No | None | AWS IAM role ARN for OIDC authentication (recommended over access keys) |
| AWS_SECRET_ACCESS_KEY | Secret | No | None | AWS secret access key for authentication (alternative to role-based auth) |
| CDK_ALB_SUBDOMAIN | Variable | No | None | Subdomain for ALB (e.g., 'api' for api.yourdomain.com) |
| CDK_APP_API_CPU | Variable | No | `512` | CPU units for App API ECS task (used in deploy job for context) |
| CDK_APP_API_DESIRED_COUNT | Variable | No | `1` | Desired number of App API tasks (used in deploy job for context) |
| CDK_APP_API_MAX_CAPACITY | Variable | No | `10` | Maximum App API tasks for auto-scaling (used in deploy job for context) |
| CDK_APP_API_MEMORY | Variable | No | `1024` | Memory (MB) for App API ECS task (used in deploy job for context) |
| CDK_AWS_ACCOUNT | Secret | Yes | None | 12-digit AWS account ID for CDK deployment |
| CDK_CERTIFICATE_ARN | Variable | No | None | ACM certificate ARN for HTTPS on ALB |
| CDK_ENABLE_AUTHENTICATION | Variable | No | `true` | Enable/disable authentication for the platform (used in deploy job for context) |
| CDK_FILE_UPLOAD_CORS_ORIGINS | Variable | No | `http://localhost:4200` | Comma-separated CORS origins for file upload |
| CDK_FILE_UPLOAD_MAX_SIZE_MB | Variable | No | `10` | Maximum file upload size in megabytes |
| CDK_HOSTED_ZONE_DOMAIN | Variable | No | None | Route53 hosted zone domain name (e.g., 'example.com') |
| CDK_INFERENCE_API_CPU | Variable | No | `1024` | CPU units for Inference API ECS task (used in deploy job for context) |
| CDK_INFERENCE_API_DESIRED_COUNT | Variable | No | `1` | Desired number of Inference API tasks (used in deploy job for context) |
| CDK_INFERENCE_API_MAX_CAPACITY | Variable | No | `5` | Maximum Inference API tasks for auto-scaling (used in deploy job for context) |
| CDK_INFERENCE_API_MEMORY | Variable | No | `2048` | Memory (MB) for Inference API ECS task (used in deploy job for context) |
| CDK_PROJECT_PREFIX | Variable | Yes | `bsu-agentcore` | Prefix for all resource names (e.g., 'mycompany-agentcore') |
| CDK_RETAIN_DATA_ON_DELETE | Variable | No | `true` | Retain DynamoDB tables and S3 buckets on stack deletion |
| CDK_VPC_CIDR | Variable | No | `10.0.0.0/16` | CIDR block for VPC network |

