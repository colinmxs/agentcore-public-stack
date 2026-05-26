/**
 * IAM grants for the App API Fargate task role.
 *
 * Extracted from the monolithic app-api-service-construct.ts to improve
 * readability. This module exports a single function that attaches all
 * required IAM policy statements to the task role.
 *
 * The grants are grouped by domain:
 *   - Core tables (users, roles, quotas, costs, sessions, OAuth)
 *   - File uploads (S3 + DDB)
 *   - RAG (assistants table, documents bucket, vector store)
 *   - Cognito (user pool admin ops)
 *   - Secrets Manager (auth secret, OAuth secrets, BFF cookie key)
 *   - Artifacts (S3 + DDB + render token)
 *   - Fine-tuning (DDB + S3 + SageMaker + IAM PassRole)
 *   - AgentCore Memory
 *   - Bedrock (title generation)
 *   - SSM (inference-api image tag for runtime endpoint resolution)
 */

import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AppConfig } from '../../config';

export interface AppApiIamGrantsProps {
  scope: Construct;
  config: AppConfig;
  taskRole: iam.IRole;
  assistantsTable: dynamodb.ITable;
  // All the SSM-resolved ARNs/names are passed as strings since
  // the parent construct already resolved them from SSM.
  oidcStateTableArn: string;
  usersTableArn: string;
  appRolesTableArn: string;
  apiKeysTableArn: string;
  oauthProvidersTableArn: string;
  oauthUserTokensTableArn: string;
  oauthTokenEncryptionKeyArn: string;
  oauthClientSecretsArn: string;
  userQuotasTableArn: string;
  quotaEventsTableArn: string;
  sessionsMetadataTableArn: string;
  userCostSummaryTableArn: string;
  systemCostRollupTableArn: string;
  managedModelsTableArn: string;
  userSettingsTableArn: string;
  userMenuLinksTableArn: string;
  authProvidersTableArn: string;
  authProviderSecretsArn: string;
  cognitoUserPoolArn: string;
  bffSessionsTableArn: string;
  bffCookieSigningKeyArn: string;
  bffCookieDataKeySecretArn: string;
  cognitoBFFAppClientSecretArn: string;
  voiceTicketReplayTableArn: string;
  voiceTicketSigningSecretArn: string;
  userFilesBucketArn: string;
  userFilesTableArn: string;
  ragAssistantsTableArn: string;
  ragDocumentsBucketArn: string;
  /**
   * AgentCore Memory ARN. Passed in directly (not read from SSM)
   * because the AgentCore Memory is created by a sibling construct
   * inside the same BackendStack — `valueForStringParameter` here
   * would resolve before the Memory exists, deadlocking on first
   * deploy.
   */
  agentCoreMemoryArn: string;
}

/**
 * Attach all IAM grants to the App API task role.
 *
 * This is a pure side-effect function — it mutates the task role's
 * policy by adding statements. Extracted for readability; the grants
 * themselves are byte-identical to the original monolith.
 */
export function grantAppApiPermissions(props: AppApiIamGrantsProps): void {
  const { scope, config, taskRole } = props;

  // ── Assistants table (local) ──
  props.assistantsTable.grantReadWriteData(taskRole);
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:Query', 'dynamodb:Scan'],
      resources: [`${props.assistantsTable.tableArn}/index/*`],
    }),
  );

  // ── User settings ──
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'UserSettingsTableAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
        'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan',
        'dynamodb:BatchGetItem', 'dynamodb:BatchWriteItem',
      ],
      resources: [props.userSettingsTableArn, `${props.userSettingsTableArn}/index/*`],
    }),
  );

  // ── User menu links ──
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'UserMenuLinksTableAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
        'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan',
      ],
      resources: [props.userMenuLinksTableArn, `${props.userMenuLinksTableArn}/index/*`],
    }),
  );

  // ── RAG assistants table ──
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'RagAssistantsTableAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
        'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan',
        'dynamodb:BatchGetItem', 'dynamodb:BatchWriteItem',
      ],
      resources: [props.ragAssistantsTableArn, `${props.ragAssistantsTableArn}/index/*`],
    }),
  );

  // ── RAG documents bucket ──
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'RagDocumentsBucketAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject', 's3:PutObject', 's3:DeleteObject',
        's3:ListBucket', 's3:GetBucketLocation',
      ],
      resources: [props.ragDocumentsBucketArn, `${props.ragDocumentsBucketArn}/*`],
    }),
  );

  // ── Core tables (OIDC, Users, Roles, API Keys, OAuth) ──
  const coreTables = [
    { sid: 'OidcStateAccess', arn: props.oidcStateTableArn },
    { sid: 'UsersTableAccess', arn: props.usersTableArn },
    { sid: 'AppRolesTableAccess', arn: props.appRolesTableArn },
    { sid: 'ApiKeysTableAccess', arn: props.apiKeysTableArn },
    { sid: 'OAuthProvidersAccess', arn: props.oauthProvidersTableArn },
    { sid: 'OAuthUserTokensAccess', arn: props.oauthUserTokensTableArn },
    { sid: 'UserQuotasAccess', arn: props.userQuotasTableArn },
    { sid: 'QuotaEventsAccess', arn: props.quotaEventsTableArn },
    { sid: 'SessionsMetadataAccess', arn: props.sessionsMetadataTableArn },
    { sid: 'UserCostSummaryAccess', arn: props.userCostSummaryTableArn },
    { sid: 'SystemCostRollupAccess', arn: props.systemCostRollupTableArn },
    { sid: 'ManagedModelsAccess', arn: props.managedModelsTableArn },
    { sid: 'AuthProvidersAccess', arn: props.authProvidersTableArn },
    { sid: 'BffSessionsAccess', arn: props.bffSessionsTableArn },
    { sid: 'VoiceTicketReplayAccess', arn: props.voiceTicketReplayTableArn },
    { sid: 'UserFilesTableAccess', arn: props.userFilesTableArn },
  ];

  for (const { sid, arn } of coreTables) {
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid,
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
          'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan',
          'dynamodb:BatchGetItem', 'dynamodb:BatchWriteItem',
        ],
        resources: [arn, `${arn}/index/*`],
      }),
    );
  }

  // ── File uploads S3 ──
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'UserFilesBucketAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject', 's3:PutObject', 's3:DeleteObject',
        's3:ListBucket', 's3:GetBucketLocation',
      ],
      resources: [props.userFilesBucketArn, `${props.userFilesBucketArn}/*`],
    }),
  );

  // ── Secrets Manager ──
  const secrets = [
    props.oauthClientSecretsArn,
    props.authProviderSecretsArn,
    props.voiceTicketSigningSecretArn,
    props.bffCookieDataKeySecretArn,
    props.cognitoBFFAppClientSecretArn,
  ];
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'SecretsManagerAccess',
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: secrets.map((s) => `${s}*`),
    }),
  );

  // ── KMS (OAuth token encryption + BFF cookie signing) ──
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'KmsDecryptAccess',
      effect: iam.Effect.ALLOW,
      actions: ['kms:Decrypt', 'kms:Encrypt', 'kms:GenerateDataKey'],
      resources: [props.oauthTokenEncryptionKeyArn, props.bffCookieSigningKeyArn],
    }),
  );

  // ── Cognito admin ops ──
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'CognitoAdminAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminGetUser', 'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminDisableUser', 'cognito-idp:AdminEnableUser',
        'cognito-idp:ListUsers', 'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword', 'cognito-idp:DescribeUserPool',
        'cognito-idp:UpdateUserPool', 'cognito-idp:ListIdentityProviders',
        'cognito-idp:CreateIdentityProvider', 'cognito-idp:UpdateIdentityProvider',
        'cognito-idp:DeleteIdentityProvider', 'cognito-idp:DescribeIdentityProvider',
        'cognito-idp:DescribeUserPoolClient', 'cognito-idp:UpdateUserPoolClient',
      ],
      resources: [props.cognitoUserPoolArn],
    }),
  );

  // ── Artifacts (S3 + DDB + render token) ──
  const artifactsBucketArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/artifacts/bucket-arn`);
  const artifactsTableArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/artifacts/table-arn`);
  const artifactRenderTokenSecretArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/artifacts/render-token-key-arn`);

  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'ArtifactsBucketReadWrite',
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject', 's3:PutObjectTagging', 's3:ListBucket'],
      resources: [artifactsBucketArn, `${artifactsBucketArn}/*`],
    }),
  );
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'ArtifactsTableReadWrite',
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
                'dynamodb:DeleteItem', 'dynamodb:Query'],
      resources: [artifactsTableArn, `${artifactsTableArn}/index/*`],
    }),
  );
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'ArtifactRenderTokenRead',
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [`${artifactRenderTokenSecretArn}*`],
    }),
  );

  // ── Fine-tuning ──
  const ftJobsTableArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/fine-tuning/jobs-table-arn`);
  const ftAccessTableArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/fine-tuning/access-table-arn`);
  const ftDataBucketArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/fine-tuning/data-bucket-arn`);
  const ftExecRoleArn = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/fine-tuning/sagemaker-execution-role-arn`);

  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'FineTuningTablesAccess',
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
                'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan',
                'dynamodb:BatchGetItem', 'dynamodb:BatchWriteItem'],
      resources: [ftJobsTableArn, `${ftJobsTableArn}/index/*`,
                  ftAccessTableArn, `${ftAccessTableArn}/index/*`],
    }),
  );
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'FineTuningBucketAccess',
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject',
                's3:ListBucket', 's3:GetBucketLocation'],
      resources: [ftDataBucketArn, `${ftDataBucketArn}/*`],
    }),
  );
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'SageMakerJobManagement',
      effect: iam.Effect.ALLOW,
      actions: ['sagemaker:CreateTrainingJob', 'sagemaker:DescribeTrainingJob',
                'sagemaker:StopTrainingJob', 'sagemaker:ListTrainingJobs',
                'sagemaker:CreateTransformJob', 'sagemaker:DescribeTransformJob',
                'sagemaker:StopTransformJob', 'sagemaker:ListTransformJobs'],
      resources: [`arn:aws:sagemaker:${config.awsRegion}:${config.awsAccount}:training-job/${config.projectPrefix}-*`,
                  `arn:aws:sagemaker:${config.awsRegion}:${config.awsAccount}:transform-job/${config.projectPrefix}-*`],
    }),
  );
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'PassSageMakerRole',
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [ftExecRoleArn],
      conditions: { StringEquals: { 'iam:PassedToService': 'sagemaker.amazonaws.com' } },
    }),
  );
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'SageMakerLogsRead',
      effect: iam.Effect.ALLOW,
      actions: ['logs:GetLogEvents', 'logs:FilterLogEvents', 'logs:DescribeLogStreams'],
      resources: [`arn:aws:logs:${config.awsRegion}:${config.awsAccount}:log-group:/aws/sagemaker/*`],
    }),
  );

  // ── AgentCore Memory ──
  // Memory ARN is passed in directly from the InferenceApi sibling
  // construct (same stack) rather than read from SSM. Reading SSM
  // here would chicken-and-egg on first deploy because both publisher
  // and consumer live in BackendStack.
  const memoryArn = props.agentCoreMemoryArn;
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'AgentCoreMemoryAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-agentcore:RetrieveMemory', 'bedrock-agentcore:CreateMemoryEvent',
        'bedrock-agentcore:GetMemoryEvent', 'bedrock-agentcore:ListMemoryEvents',
        'bedrock-agentcore:DeleteMemoryEvent', 'bedrock-agentcore:ListSessions',
        'bedrock-agentcore:DeleteSession',
      ],
      resources: [memoryArn],
    }),
  );

  // ── Bedrock (title generation) ──
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'BedrockInvokeModel',
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [`arn:aws:bedrock:${config.awsRegion}::foundation-model/*`],
    }),
  );

  // ── SSM read for inference-api image tag (runtime endpoint resolution) ──
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'SsmReadInferenceImageTag',
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [
        `arn:aws:ssm:${cdk.Stack.of(scope).region}:${cdk.Stack.of(scope).account}:parameter/${config.projectPrefix}/inference-api/image-tag`,
      ],
    }),
  );

  // ── S3 Vectors (RAG query) ──
  const vectorBucketName = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/rag/vector-bucket-name`);
  const vectorIndexName = ssm.StringParameter.valueForStringParameter(
    scope, `/${config.projectPrefix}/rag/vector-index-name`);
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'S3VectorsQueryAccess',
      effect: iam.Effect.ALLOW,
      actions: ['s3vectors:GetVector', 's3vectors:GetVectors',
                's3vectors:ListVectors', 's3vectors:QueryVectors',
                's3vectors:GetIndex', 's3vectors:ListIndexes'],
      resources: [
        `arn:aws:s3vectors:${config.awsRegion}:${config.awsAccount}:bucket/${vectorBucketName}`,
        `arn:aws:s3vectors:${config.awsRegion}:${config.awsAccount}:bucket/${vectorBucketName}/index/${vectorIndexName}`,
      ],
    }),
  );

  // ── AgentCore WorkloadIdentity (OAuth vault token minting) ──
  taskRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      sid: 'AgentCoreWorkloadIdentityAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-agentcore:GetWorkloadAccessTokenForUserId',
        'bedrock-agentcore:GetWorkloadIdentity',
      ],
      resources: ['*'],
    }),
  );
}
