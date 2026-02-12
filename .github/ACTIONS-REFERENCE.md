# GitHub Actions Configuration Reference

## Introduction

This document provides a comprehensive reference for all GitHub Variables and Secrets used in the AgentCore Public Stack deployment workflows. Each of the five deployment workflows (Infrastructure, App API, Inference API, Frontend, and Gateway) can be customized with specific configuration values.

For a quick-start guide with only the required values, see [README-ACTIONS.md](./README-ACTIONS.md).

## GitHub Variables vs Secrets

GitHub provides two mechanisms for storing configuration values:

- **Variables**: Non-sensitive configuration values stored in repository settings and accessed via `vars.*` in workflows. Use Variables for values like AWS regions, project prefixes, and resource sizing parameters that don't need encryption.

- **Secrets**: Sensitive configuration values stored encrypted in repository settings and accessed via `secrets.*` in workflows. Use Secrets for values like AWS credentials, API keys, certificate ARNs, and any other sensitive data that should never be exposed in logs or workflow files.

## Configuration by Stack

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

### App API Stack

The App API Stack deploys the main application backend service as an ECS Fargate container. This stack includes the FastAPI application server, DynamoDB tables for user data and quotas, S3 buckets for file uploads and RAG documents, and integration with Microsoft Entra ID for authentication.

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| AWS_ACCESS_KEY_ID | Secret | No | None | AWS access key ID for authentication (alternative to role-based auth) |
| AWS_REGION | Variable | Yes | `us-west-2` | AWS region for resource deployment |
| AWS_ROLE_ARN | Secret | No | None | AWS IAM role ARN for OIDC authentication (recommended over access keys) |
| AWS_SECRET_ACCESS_KEY | Secret | No | None | AWS secret access key for authentication (alternative to role-based auth) |
| CDK_APP_API_CPU | Variable | No | `512` | CPU units for App API ECS task (256, 512, 1024, 2048, 4096) |
| CDK_APP_API_DESIRED_COUNT | Variable | No | `1` | Desired number of App API tasks running |
| CDK_APP_API_ENABLED | Variable | No | `true` | Enable/disable App API stack deployment |
| CDK_APP_API_ENTRA_REDIRECT_URI | Variable | No | None | Microsoft Entra ID OAuth redirect URI for authentication callback |
| CDK_APP_API_MAX_CAPACITY | Variable | No | `10` | Maximum App API tasks for auto-scaling |
| CDK_APP_API_MEMORY | Variable | No | `1024` | Memory (MB) for App API ECS task (512, 1024, 2048, 4096, 8192) |
| CDK_AWS_ACCOUNT | Secret | Yes | None | 12-digit AWS account ID for CDK deployment |
| CDK_ENABLE_AUTHENTICATION | Variable | No | `true` | Enable/disable authentication for the platform |
| CDK_ENTRA_CLIENT_ID | Variable | No | None | Microsoft Entra ID (Azure AD) application client ID |
| CDK_ENTRA_TENANT_ID | Variable | No | None | Microsoft Entra ID (Azure AD) tenant ID |
| CDK_FILE_UPLOAD_CORS_ORIGINS | Variable | No | `http://localhost:4200` | Comma-separated CORS origins for file upload S3 bucket |
| CDK_FILE_UPLOAD_MAX_SIZE_MB | Variable | No | `10` | Maximum file upload size in megabytes |
| CDK_HOSTED_ZONE_DOMAIN | Variable | No | None | Route53 hosted zone domain name (e.g., 'example.com') |
| CDK_PROJECT_PREFIX | Variable | Yes | `bsu-agentcore` | Prefix for all resource names (e.g., 'mycompany-agentcore') |
| CDK_RETAIN_DATA_ON_DELETE | Variable | No | `true` | Retain DynamoDB tables and S3 buckets on stack deletion |
| CDK_VPC_CIDR | Variable | No | `10.0.0.0/16` | CIDR block for VPC network |

### Inference API Stack

The Inference API Stack deploys the AWS Bedrock AgentCore Runtime, which hosts the AI agent inference service. This stack includes the AgentCore Runtime container, AgentCore Memory for conversation persistence, Code Interpreter for Python execution, Browser for web automation, and all necessary IAM roles and permissions for integration with DynamoDB, S3, Bedrock models, and external MCP tools.

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| AWS_ACCESS_KEY_ID | Secret | No | None | AWS access key ID for authentication (alternative to role-based auth) |
| AWS_REGION | Variable | Yes | `us-west-2` | AWS region for resource deployment |
| AWS_ROLE_ARN | Secret | No | None | AWS IAM role ARN for OIDC authentication (recommended over access keys) |
| AWS_SECRET_ACCESS_KEY | Secret | No | None | AWS secret access key for authentication (alternative to role-based auth) |
| CDK_AWS_ACCOUNT | Secret | Yes | None | 12-digit AWS account ID for CDK deployment |
| CDK_ENTRA_CLIENT_ID | Variable | No | None | Microsoft Entra ID (Azure AD) application client ID for JWT validation |
| CDK_ENTRA_TENANT_ID | Variable | No | None | Microsoft Entra ID (Azure AD) tenant ID for JWT validation |
| CDK_INFERENCE_API_CPU | Variable | No | `1024` | CPU units for Inference API AgentCore Runtime (256, 512, 1024, 2048, 4096) |
| CDK_INFERENCE_API_DESIRED_COUNT | Variable | No | `1` | Desired number of Inference API runtime instances |
| CDK_INFERENCE_API_ENABLE_GPU | Variable | No | `false` | Enable GPU support for Inference API runtime |
| CDK_INFERENCE_API_ENABLED | Variable | No | `true` | Enable/disable Inference API stack deployment |
| CDK_INFERENCE_API_MAX_CAPACITY | Variable | No | `5` | Maximum Inference API runtime instances for auto-scaling |
| CDK_INFERENCE_API_MEMORY | Variable | No | `2048` | Memory (MB) for Inference API AgentCore Runtime (512, 1024, 2048, 4096, 8192) |
| CDK_PROJECT_PREFIX | Variable | Yes | `bsu-agentcore` | Prefix for all resource names (e.g., 'mycompany-agentcore') |
| CDK_RETAIN_DATA_ON_DELETE | Variable | No | `true` | Retain AgentCore Memory and related resources on stack deletion |
| ENV_INFERENCE_API_API_URL | Variable | No | None | Backend API URL for runtime environment (e.g., 'https://api.example.com') |
| ENV_INFERENCE_API_CORS_ORIGINS | Variable | No | None | Comma-separated CORS origins for runtime environment |
| ENV_INFERENCE_API_ENABLE_AUTHENTICATION | Variable | No | `true` | Enable/disable authentication in runtime container |
| ENV_INFERENCE_API_FRONTEND_URL | Variable | No | None | Frontend URL for runtime environment (e.g., 'https://app.example.com') |
| ENV_INFERENCE_API_GENERATED_IMAGES_DIR | Variable | No | `generated_images` | Directory path for generated images in runtime container |
| ENV_INFERENCE_API_LOG_LEVEL | Variable | No | `INFO` | Log level for runtime container (DEBUG, INFO, WARNING, ERROR) |
| ENV_INFERENCE_API_NOVA_ACT_API_KEY | Secret | No | None | Amazon Nova Act API key for browser automation |
| ENV_INFERENCE_API_OAUTH_CALLBACK_URL | Variable | No | None | OAuth callback URL for external MCP tool authentication |
| ENV_INFERENCE_API_OUTPUT_DIR | Variable | No | `output` | Directory path for output files in runtime container |
| ENV_INFERENCE_API_TAVILY_API_KEY | Secret | No | None | Tavily API key for web search integration |
| ENV_INFERENCE_API_UPLOAD_DIR | Variable | No | `uploads` | Directory path for uploaded files in runtime container |

### Frontend Stack

The Frontend Stack deploys the Angular application as a static website hosted on S3 with CloudFront CDN distribution. This stack includes S3 bucket configuration, CloudFront distribution with Origin Access Control (OAC), optional Route53 DNS records for custom domains, and runtime configuration generation that injects backend URLs from SSM parameters into the deployed application.

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| AWS_ACCESS_KEY_ID | Secret | No | None | AWS access key ID for authentication (alternative to role-based auth) |
| AWS_REGION | Variable | Yes | `us-west-2` | AWS region for resource deployment |
| AWS_ROLE_ARN | Secret | No | None | AWS IAM role ARN for OIDC authentication (recommended over access keys) |
| AWS_SECRET_ACCESS_KEY | Secret | No | None | AWS secret access key for authentication (alternative to role-based auth) |
| CDK_AWS_ACCOUNT | Secret | Yes | None | 12-digit AWS account ID for CDK deployment |
| CDK_FRONTEND_BUCKET_NAME | Secret | No | None | S3 bucket name for frontend assets (defaults to generated name with account ID) |
| CDK_FRONTEND_CERTIFICATE_ARN | Secret | No | None | ACM certificate ARN for HTTPS on CloudFront (required for custom domain) |
| CDK_FRONTEND_CLOUDFRONT_PRICE_CLASS | Variable | No | `PriceClass_100` | CloudFront price class (PriceClass_100, PriceClass_200, PriceClass_All) |
| CDK_FRONTEND_DOMAIN_NAME | Variable | No | None | Custom domain name for frontend (e.g., 'app.example.com') |
| CDK_FRONTEND_ENABLE_ROUTE53 | Variable | No | `false` | Enable Route53 A record creation for custom domain |
| CDK_FRONTEND_ENABLED | Variable | No | `true` | Enable/disable Frontend stack deployment |
| CDK_PRODUCTION | Variable | No | `true` | Production environment flag (affects runtime config generation) |
| CDK_PROJECT_PREFIX | Variable | Yes | `bsu-agentcore` | Prefix for all resource names (e.g., 'mycompany-agentcore') |
| CDK_RETAIN_DATA_ON_DELETE | Variable | No | `true` | Retain S3 bucket and CloudFront distribution on stack deletion |

### Gateway Stack

The Gateway Stack deploys the AWS Bedrock AgentCore Gateway with MCP (Model Context Protocol) tools for external integrations. This stack includes the AgentCore Gateway with AWS_IAM authentication, Lambda functions for Google Custom Search and Brave Search (providing 8 total MCP tools: web search, image search, local search, video search, news search, and AI summarization), Secrets Manager for API credentials, and all necessary IAM roles and permissions for Lambda invocation and CloudWatch logging.

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| AWS_ACCESS_KEY_ID | Secret | No | None | AWS access key ID for authentication (alternative to role-based auth) |
| AWS_REGION | Variable | Yes | `us-west-2` | AWS region for resource deployment |
| AWS_ROLE_ARN | Secret | No | None | AWS IAM role ARN for OIDC authentication (recommended over access keys) |
| AWS_SECRET_ACCESS_KEY | Secret | No | None | AWS secret access key for authentication (alternative to role-based auth) |
| CDK_AWS_ACCOUNT | Secret | Yes | None | 12-digit AWS account ID for CDK deployment |
| CDK_GATEWAY_API_TYPE | Variable | No | `HTTP` | API Gateway type for Gateway (REST or HTTP) |
| CDK_GATEWAY_ENABLE_WAF | Variable | No | `false` | Enable AWS WAF for Gateway API protection |
| CDK_GATEWAY_ENABLED | Variable | No | `true` | Enable/disable Gateway stack deployment |
| CDK_GATEWAY_LOG_LEVEL | Variable | No | `INFO` | Log level for Lambda functions (DEBUG, INFO, WARNING, ERROR) |
| CDK_GATEWAY_THROTTLE_BURST_LIMIT | Variable | No | `5000` | API Gateway burst limit for throttling (requests) |
| CDK_GATEWAY_THROTTLE_RATE_LIMIT | Variable | No | `10000` | API Gateway rate limit for throttling (requests per second) |
| CDK_PROJECT_PREFIX | Variable | Yes | `bsu-agentcore` | Prefix for all resource names (e.g., 'mycompany-agentcore') |
| CDK_RETAIN_DATA_ON_DELETE | Variable | No | `true` | Retain Secrets Manager secrets on stack deletion |
