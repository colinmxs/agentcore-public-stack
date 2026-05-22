/**
 * IAM execution roles for the AgentCore inference-api constructs.
 *
 * Extracted from the monolithic inference-agentcore-construct.ts.
 * Each function creates one IAM role with all its policy statements
 * and returns it.
 *
 * Roles:
 *   - Runtime execution role (assumed by bedrock-agentcore.amazonaws.com)
 *   - Memory execution role
 *   - Code Interpreter execution role
 *   - Browser execution role
 */

import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { AppConfig, getResourceName } from '../../config';

/**
 * Create the AgentCore Runtime execution role with all required
 * policy statements.
 */
export function createRuntimeExecutionRole(
  scope: Construct,
  config: AppConfig,
): iam.Role {
  const role = new iam.Role(scope, 'AgentCoreRuntimeExecutionRole', {
    roleName: getResourceName(config, 'agentcore-runtime-role'),
    assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com', {
      conditions: {
        StringEquals: { 'aws:SourceAccount': config.awsAccount },
        ArnLike: {
          'aws:SourceArn': `arn:aws:bedrock-agentcore:${config.awsRegion}:${config.awsAccount}:*`,
        },
      },
    }),
    description: 'Execution role for AWS Bedrock AgentCore Runtime',
  });

  // ── CloudWatch Logs ──
  role.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup'],
    resources: [`arn:aws:logs:${config.awsRegion}:${config.awsAccount}:log-group:/aws/bedrock-agentcore/runtimes/*`],
  }));
  role.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['logs:DescribeLogGroups'],
    resources: [`arn:aws:logs:${config.awsRegion}:${config.awsAccount}:log-group:*`],
  }));
  role.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
    resources: [`arn:aws:logs:${config.awsRegion}:${config.awsAccount}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*`],
  }));

  // ── X-Ray ──
  role.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords', 'xray:GetSamplingRules', 'xray:GetSamplingTargets'],
    resources: ['*'],
  }));

  // ── CloudWatch Metrics ──
  role.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['cloudwatch:PutMetricData'],
    resources: ['*'],
    conditions: { StringEquals: { 'cloudwatch:namespace': 'bedrock-agentcore' } },
  }));

  // ── Bedrock model invocation ──
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'BedrockModelInvocation',
    effect: iam.Effect.ALLOW,
    actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
    resources: [`arn:aws:bedrock:*::foundation-model/*`, `arn:aws:bedrock:${config.awsRegion}:${config.awsAccount}:*`],
  }));

  // ── AWS Marketplace (model subscription validation) ──
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'MarketplaceModelAccess',
    effect: iam.Effect.ALLOW,
    actions: ['aws-marketplace:ViewSubscriptions', 'aws-marketplace:Subscribe'],
    resources: ['*'],
  }));

  // ── External MCP Lambda Function URL invocation ──
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'ExternalMCPLambdaAccess',
    effect: iam.Effect.ALLOW,
    actions: ['lambda:InvokeFunctionUrl', 'lambda:InvokeFunction'],
    resources: [`arn:aws:lambda:${config.awsRegion}:${config.awsAccount}:function:${config.projectPrefix}-mcp-*`],
  }));

  // ── AgentCore Gateway ──
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'AgentCoreGatewayAccess',
    effect: iam.Effect.ALLOW,
    actions: ['bedrock-agentcore:InvokeGateway', 'bedrock-agentcore:ListGatewayTargets'],
    resources: [`arn:aws:bedrock-agentcore:${config.awsRegion}:${config.awsAccount}:gateway/*`],
  }));

  // ── SSM Parameter Store ──
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'SSMParameterRead',
    effect: iam.Effect.ALLOW,
    actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
    resources: [`arn:aws:ssm:${config.awsRegion}:${config.awsAccount}:parameter/${config.projectPrefix}/*`],
  }));

  // ── Secrets Manager (OAuth client secrets + auth provider secrets) ──
  const oauthClientSecretsArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/oauth/client-secrets-arn`);
  const authProviderSecretsArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/auth/auth-provider-secrets-arn`);
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'SecretsManagerRead',
    effect: iam.Effect.ALLOW,
    actions: ['secretsmanager:GetSecretValue'],
    resources: [`${oauthClientSecretsArn}*`, `${authProviderSecretsArn}*`],
  }));

  // ── AgentCore Identity OAuth vault secrets ──
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'AgentCoreIdentityOAuthSecrets',
    effect: iam.Effect.ALLOW,
    actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
    resources: [`arn:aws:secretsmanager:${config.awsRegion}:${config.awsAccount}:secret:bedrock-agentcore-identity!default/oauth2/*`],
  }));

  // ── DynamoDB tables (Users, Roles, OAuth, Quotas, Costs, etc.) ──
  const tableArns = [
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/users/users-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/rbac/app-roles-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/oauth/providers-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/oauth/user-tokens-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/auth/api-keys-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/rag/assistants-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/quota/user-quotas-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/quota/quota-events-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/cost-tracking/sessions-metadata-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/cost-tracking/user-cost-summary-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/cost-tracking/system-cost-rollup-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/admin/managed-models-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/auth/auth-providers-table-arn`),
    ssm.StringParameter.valueForStringParameter(scope, `/${config.projectPrefix}/user-file-uploads/table-arn`),
  ];
  const tableResources = tableArns.flatMap(arn => [arn, `${arn}/index/*`]);
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'DynamoDBTableAccess',
    effect: iam.Effect.ALLOW,
    actions: [
      'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
      'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan',
      'dynamodb:BatchGetItem', 'dynamodb:BatchWriteItem',
    ],
    resources: tableResources,
  }));

  // ── KMS (OAuth token encryption) ──
  const oauthTokenEncryptionKeyArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/oauth/token-encryption-key-arn`);
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'KmsOAuthTokenAccess',
    effect: iam.Effect.ALLOW,
    actions: ['kms:Decrypt', 'kms:Encrypt', 'kms:GenerateDataKey'],
    resources: [oauthTokenEncryptionKeyArn],
  }));

  // ── Cognito (user pool read for token validation) ──
  const cognitoUserPoolId = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/auth/cognito/user-pool-id`);
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'CognitoUserPoolRead',
    effect: iam.Effect.ALLOW,
    actions: ['cognito-idp:DescribeUserPool', 'cognito-idp:DescribeUserPoolClient'],
    resources: [`arn:aws:cognito-idp:${config.awsRegion}:${config.awsAccount}:userpool/${cognitoUserPoolId}`],
  }));

  // ── File uploads S3 ──
  const userFilesBucketArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/user-file-uploads/bucket-arn`);
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'UserFilesBucketAccess',
    effect: iam.Effect.ALLOW,
    actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
    resources: [userFilesBucketArn, `${userFilesBucketArn}/*`],
  }));

  // ── Artifacts (S3 write + DDB write) ──
  const artifactsBucketArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/artifacts/bucket-arn`);
  const artifactsTableArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/artifacts/table-arn`);
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'ArtifactsBucketWrite',
    effect: iam.Effect.ALLOW,
    actions: ['s3:PutObject', 's3:PutObjectTagging'],
    resources: [`${artifactsBucketArn}/*`],
  }));
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'ArtifactsTableWrite',
    effect: iam.Effect.ALLOW,
    actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
    resources: [artifactsTableArn, `${artifactsTableArn}/index/*`],
  }));

  // ── S3 Vectors (RAG query) ──
  const vectorBucketName = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/rag/vector-bucket-name`);
  const vectorIndexName = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/rag/vector-index-name`);
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'S3VectorsQueryAccess',
    effect: iam.Effect.ALLOW,
    actions: ['s3vectors:GetVector', 's3vectors:GetVectors', 's3vectors:ListVectors',
              's3vectors:QueryVectors', 's3vectors:GetIndex', 's3vectors:ListIndexes'],
    resources: [
      `arn:aws:s3vectors:${config.awsRegion}:${config.awsAccount}:bucket/${vectorBucketName}`,
      `arn:aws:s3vectors:${config.awsRegion}:${config.awsAccount}:bucket/${vectorBucketName}/index/${vectorIndexName}`,
    ],
  }));

  // ── AgentCore WorkloadIdentity ──
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'AgentCoreWorkloadIdentityAccess',
    effect: iam.Effect.ALLOW,
    actions: ['bedrock-agentcore:GetWorkloadAccessTokenForUserId', 'bedrock-agentcore:GetWorkloadIdentity'],
    resources: ['*'],
  }));

  // ── AgentCore Memory ──
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'AgentCoreMemoryAccess',
    effect: iam.Effect.ALLOW,
    actions: [
      'bedrock-agentcore:CreateMemoryEvent', 'bedrock-agentcore:GetMemoryEvent',
      'bedrock-agentcore:ListMemoryEvents', 'bedrock-agentcore:DeleteMemoryEvent',
      'bedrock-agentcore:RetrieveMemory', 'bedrock-agentcore:ListSessions',
      'bedrock-agentcore:DeleteSession',
    ],
    resources: [`arn:aws:bedrock-agentcore:${config.awsRegion}:${config.awsAccount}:memory/*`],
  }));

  // ── AgentCore Code Interpreter + Browser ──
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'AgentCoreToolsAccess',
    effect: iam.Effect.ALLOW,
    actions: [
      'bedrock-agentcore:InvokeCodeInterpreter',
      'bedrock-agentcore:InvokeBrowser',
    ],
    resources: [
      `arn:aws:bedrock-agentcore:${config.awsRegion}:${config.awsAccount}:code-interpreter/*`,
      `arn:aws:bedrock-agentcore:${config.awsRegion}:${config.awsAccount}:browser/*`,
    ],
  }));

  // ── ECR pull (for runtime container image) ──
  role.addToPolicy(new iam.PolicyStatement({
    sid: 'ECRPullAccess',
    effect: iam.Effect.ALLOW,
    actions: [
      'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage',
      'ecr:GetAuthorizationToken', 'ecr:BatchCheckLayerAvailability',
    ],
    resources: ['*'],
  }));

  return role;
}

/**
 * Create the AgentCore Memory execution role.
 */
export function createMemoryExecutionRole(scope: Construct, config: AppConfig): iam.Role {
  const role = new iam.Role(scope, 'AgentCoreMemoryExecutionRole', {
    roleName: getResourceName(config, 'agentcore-memory-role'),
    assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
    description: 'Execution role for AgentCore Memory',
  });
  role.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: [`arn:aws:bedrock:*::foundation-model/*`],
  }));
  // Additional model access for memory processing (Claude + Nova)
  role.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: [
      `arn:aws:bedrock:${config.awsRegion}::foundation-model/anthropic.claude-*`,
      `arn:aws:bedrock:${config.awsRegion}::foundation-model/amazon.nova-*`,
    ],
  }));
  return role;
}

/**
 * Create the Code Interpreter execution role.
 */
export function createCodeInterpreterExecutionRole(scope: Construct, config: AppConfig): iam.Role {
  const role = new iam.Role(scope, 'CodeInterpreterExecutionRole', {
    roleName: getResourceName(config, 'code-interpreter-role'),
    assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
    description: 'Execution role for AgentCore Code Interpreter',
  });
  role.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
    resources: [`arn:aws:logs:${config.awsRegion}:${config.awsAccount}:log-group:/aws/bedrock/agentcore/${config.projectPrefix}/code-interpreter/*`],
  }));
  return role;
}

/**
 * Create the Browser execution role.
 */
export function createBrowserExecutionRole(scope: Construct, config: AppConfig): iam.Role {
  const role = new iam.Role(scope, 'BrowserExecutionRole', {
    roleName: getResourceName(config, 'browser-role'),
    assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
    description: 'Execution role for AgentCore Browser',
  });
  role.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
    resources: [`arn:aws:logs:${config.awsRegion}:${config.awsAccount}:log-group:/aws/bedrock/agentcore/${config.projectPrefix}/browser/*`],
  }));
  return role;
}
