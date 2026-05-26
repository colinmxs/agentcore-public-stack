/**
 * SSM parameter resolution + container environment builder for App API.
 *
 * Extracts the ~130 lines of ssm.StringParameter.valueForStringParameter
 * calls and the ~120 lines of container environment entries into two
 * focused functions. The main construct calls these and gets back typed
 * objects it can pass to the task definition and IAM grants module.
 */

import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { AppConfig, buildCorsOrigins } from '../../config';

/** All SSM-resolved values the App API construct needs. */
export interface AppApiSsmParams {
  // Network
  vpcId: string;
  vpcCidr: string;
  privateSubnetIds: string;
  availabilityZones: string;
  imageTag: string;
  albSecurityGroupId: string;
  albArn: string;
  albListenerArn: string;
  ecsClusterName: string;
  ecsClusterArn: string;
  // Tables (names + ARNs)
  oidcStateTableName: string;
  oidcStateTableArn: string;
  usersTableName: string;
  usersTableArn: string;
  appRolesTableName: string;
  appRolesTableArn: string;
  apiKeysTableName: string;
  apiKeysTableArn: string;
  oauthProvidersTableName: string;
  oauthProvidersTableArn: string;
  oauthUserTokensTableName: string;
  oauthUserTokensTableArn: string;
  oauthTokenEncryptionKeyArn: string;
  oauthClientSecretsArn: string;
  userQuotasTableName: string;
  userQuotasTableArn: string;
  quotaEventsTableName: string;
  quotaEventsTableArn: string;
  sessionsMetadataTableName: string;
  sessionsMetadataTableArn: string;
  userCostSummaryTableName: string;
  userCostSummaryTableArn: string;
  systemCostRollupTableName: string;
  systemCostRollupTableArn: string;
  managedModelsTableName: string;
  managedModelsTableArn: string;
  userSettingsTableName: string;
  userSettingsTableArn: string;
  userMenuLinksTableName: string;
  userMenuLinksTableArn: string;
  authProvidersTableName: string;
  authProvidersTableArn: string;
  authProviderSecretsArn: string;
  // Cognito
  cognitoUserPoolArn: string;
  cognitoUserPoolId: string;
  cognitoAppClientId: string;
  cognitoIssuerUrl: string;
  cognitoDomainUrl: string;
  // BFF
  bffSessionsTableName: string;
  bffSessionsTableArn: string;
  bffCookieSigningKeyArn: string;
  bffCookieDataKeySecretArn: string;
  cognitoBFFAppClientId: string;
  cognitoBFFAppClientSecretArn: string;
  // Voice
  voiceTicketReplayTableName: string;
  voiceTicketReplayTableArn: string;
  voiceTicketSigningSecretArn: string;
  // Inference
  inferenceApiRuntimeEndpointUrl: string;
  // File uploads
  userFilesBucketName: string;
  userFilesBucketArn: string;
  userFilesTableName: string;
  userFilesTableArn: string;
  // RAG
  ragDocumentsBucketName: string;
  ragAssistantsTableName: string;
  ragVectorBucketName: string;
  ragVectorIndexName: string;
  ragAssistantsTableArn: string;
  ragDocumentsBucketArn: string;
  memoryId: string;
  // Workload identity
  workloadIdentityName: string;
}

/**
 * Same-stack values that App API needs from sibling BackendStack
 * constructs. Passed in directly rather than read from SSM because
 * `valueForStringParameter` would deadlock on first deploy: CFN
 * resolves SSM template parameters before any of the stack's
 * resources are created, so reading a parameter that this same
 * stack publishes is unsatisfiable.
 */
export interface AppApiBackendOverrides {
  /** AgentCore Memory ID (from InferenceAgentCoreConstruct.memory.attrMemoryId). */
  memoryId: string;
  /** AgentCore Runtime endpoint URL (from InferenceAgentCoreConstruct.runtimeEndpointUrl). */
  inferenceApiRuntimeEndpointUrl: string;
}

/** Resolve all SSM parameters the App API construct needs. */
export function resolveAppApiSsmParams(
  scope: Construct,
  prefix: string,
  overrides: AppApiBackendOverrides,
): AppApiSsmParams {
  const p = (path: string) => ssm.StringParameter.valueForStringParameter(scope, `/${prefix}/${path}`);
  return {
    vpcId: p('network/vpc-id'),
    vpcCidr: p('network/vpc-cidr'),
    privateSubnetIds: p('network/private-subnet-ids'),
    availabilityZones: p('network/availability-zones'),
    imageTag: p('app-api/image-tag'),
    albSecurityGroupId: p('network/alb-security-group-id'),
    albArn: p('network/alb-arn'),
    albListenerArn: p('network/alb-listener-arn'),
    ecsClusterName: p('network/ecs-cluster-name'),
    ecsClusterArn: p('network/ecs-cluster-arn'),
    oidcStateTableName: p('auth/oidc-state-table-name'),
    oidcStateTableArn: p('auth/oidc-state-table-arn'),
    usersTableName: p('users/users-table-name'),
    usersTableArn: p('users/users-table-arn'),
    appRolesTableName: p('rbac/app-roles-table-name'),
    appRolesTableArn: p('rbac/app-roles-table-arn'),
    apiKeysTableName: p('auth/api-keys-table-name'),
    apiKeysTableArn: p('auth/api-keys-table-arn'),
    oauthProvidersTableName: p('oauth/providers-table-name'),
    oauthProvidersTableArn: p('oauth/providers-table-arn'),
    oauthUserTokensTableName: p('oauth/user-tokens-table-name'),
    oauthUserTokensTableArn: p('oauth/user-tokens-table-arn'),
    oauthTokenEncryptionKeyArn: p('oauth/token-encryption-key-arn'),
    oauthClientSecretsArn: p('oauth/client-secrets-arn'),
    userQuotasTableName: p('quota/user-quotas-table-name'),
    userQuotasTableArn: p('quota/user-quotas-table-arn'),
    quotaEventsTableName: p('quota/quota-events-table-name'),
    quotaEventsTableArn: p('quota/quota-events-table-arn'),
    sessionsMetadataTableName: p('cost-tracking/sessions-metadata-table-name'),
    sessionsMetadataTableArn: p('cost-tracking/sessions-metadata-table-arn'),
    userCostSummaryTableName: p('cost-tracking/user-cost-summary-table-name'),
    userCostSummaryTableArn: p('cost-tracking/user-cost-summary-table-arn'),
    systemCostRollupTableName: p('cost-tracking/system-cost-rollup-table-name'),
    systemCostRollupTableArn: p('cost-tracking/system-cost-rollup-table-arn'),
    managedModelsTableName: p('admin/managed-models-table-name'),
    managedModelsTableArn: p('admin/managed-models-table-arn'),
    userSettingsTableName: p('settings/user-settings-table-name'),
    userSettingsTableArn: p('settings/user-settings-table-arn'),
    userMenuLinksTableName: p('admin/user-menu-links-table-name'),
    userMenuLinksTableArn: p('admin/user-menu-links-table-arn'),
    authProvidersTableName: p('auth/auth-providers-table-name'),
    authProvidersTableArn: p('auth/auth-providers-table-arn'),
    authProviderSecretsArn: p('auth/auth-provider-secrets-arn'),
    cognitoUserPoolArn: p('auth/cognito/user-pool-arn'),
    cognitoUserPoolId: p('auth/cognito/user-pool-id'),
    cognitoAppClientId: p('auth/cognito/bff-app-client-id'),
    cognitoIssuerUrl: p('auth/cognito/issuer-url'),
    cognitoDomainUrl: p('auth/cognito/domain-url'),
    bffSessionsTableName: p('auth/bff-sessions-table-name'),
    bffSessionsTableArn: p('auth/bff-sessions-table-arn'),
    bffCookieSigningKeyArn: p('auth/bff-cookie-signing-key-arn'),
    bffCookieDataKeySecretArn: p('auth/bff-cookie-data-key-secret-arn'),
    cognitoBFFAppClientId: p('auth/cognito/bff-app-client-id'),
    cognitoBFFAppClientSecretArn: p('auth/cognito/bff-app-client-secret-arn'),
    voiceTicketReplayTableName: p('voice/ticket-replay-table-name'),
    voiceTicketReplayTableArn: p('voice/ticket-replay-table-arn'),
    voiceTicketSigningSecretArn: p('voice/ticket-signing-secret-arn'),
    inferenceApiRuntimeEndpointUrl: overrides.inferenceApiRuntimeEndpointUrl,
    userFilesBucketName: p('user-file-uploads/bucket-name'),
    userFilesBucketArn: p('user-file-uploads/bucket-arn'),
    userFilesTableName: p('user-file-uploads/table-name'),
    userFilesTableArn: p('user-file-uploads/table-arn'),
    ragDocumentsBucketName: p('rag/documents-bucket-name'),
    ragAssistantsTableName: p('rag/assistants-table-name'),
    ragVectorBucketName: p('rag/vector-bucket-name'),
    ragVectorIndexName: p('rag/vector-index-name'),
    ragAssistantsTableArn: p('rag/assistants-table-arn'),
    ragDocumentsBucketArn: p('rag/documents-bucket-arn'),
    memoryId: overrides.memoryId,
    workloadIdentityName: p('oauth/platform-workload-identity-name'),
  };
}

/** Build the container environment map for the App API task. */
export function buildAppApiEnvironment(
  config: AppConfig,
  params: AppApiSsmParams,
): Record<string, string> {
  return {
    AWS_REGION: config.awsRegion,
    PROJECT_PREFIX: config.projectPrefix,
    FRONTEND_URL: config.domainName ? `https://${config.domainName}` : 'http://localhost:4200',
    CORS_ORIGINS: buildCorsOrigins(config, config.appApi.additionalCorsOrigins).join(','),
    AGENTCORE_LOCAL_OAUTH_CALLBACK_URL: config.domainName
      ? `https://${config.domainName}/oauth-complete`
      : 'http://localhost:4200/oauth-complete',
    DYNAMODB_QUOTA_TABLE: params.userQuotasTableName,
    DYNAMODB_EVENTS_TABLE: params.quotaEventsTableName,
    DYNAMODB_OIDC_STATE_TABLE_NAME: params.oidcStateTableName,
    DYNAMODB_MANAGED_MODELS_TABLE_NAME: params.managedModelsTableName,
    DYNAMODB_SESSIONS_METADATA_TABLE_NAME: params.sessionsMetadataTableName,
    DYNAMODB_COST_SUMMARY_TABLE_NAME: params.userCostSummaryTableName,
    DYNAMODB_SYSTEM_ROLLUP_TABLE_NAME: params.systemCostRollupTableName,
    DYNAMODB_USERS_TABLE_NAME: params.usersTableName,
    DYNAMODB_APP_ROLES_TABLE_NAME: params.appRolesTableName,
    DYNAMODB_USER_FILES_TABLE_NAME: params.userFilesTableName,
    S3_USER_FILES_BUCKET_NAME: params.userFilesBucketName,
    FILE_UPLOAD_MAX_SIZE_BYTES: String(4194304),
    FILE_UPLOAD_MAX_FILES_PER_MESSAGE: String(5),
    FILE_UPLOAD_USER_QUOTA_BYTES: String(1073741824),
    S3_ASSISTANTS_DOCUMENTS_BUCKET_NAME: params.ragDocumentsBucketName,
    DYNAMODB_ASSISTANTS_TABLE_NAME: params.ragAssistantsTableName,
    S3_ASSISTANTS_VECTOR_STORE_BUCKET_NAME: params.ragVectorBucketName,
    S3_ASSISTANTS_VECTOR_STORE_INDEX_NAME: params.ragVectorIndexName,
    AGENTCORE_MEMORY_TYPE: 'dynamodb',
    AGENTCORE_MEMORY_ID: params.memoryId,
    DYNAMODB_API_KEYS_TABLE_NAME: params.apiKeysTableName,
    OAUTH_TOKEN_ENCRYPTION_KEY_ARN: params.oauthTokenEncryptionKeyArn,
    OAUTH_CLIENT_SECRETS_ARN: params.oauthClientSecretsArn,
    DYNAMODB_OAUTH_PROVIDERS_TABLE_NAME: params.oauthProvidersTableName,
    DYNAMODB_OAUTH_USER_TOKENS_TABLE_NAME: params.oauthUserTokensTableName,
    AGENTCORE_RUNTIME_WORKLOAD_NAME: params.workloadIdentityName,
    DYNAMODB_AUTH_PROVIDERS_TABLE_NAME: params.authProvidersTableName,
    AUTH_PROVIDER_SECRETS_ARN: params.authProviderSecretsArn,
    DYNAMODB_USER_SETTINGS_TABLE_NAME: params.userSettingsTableName,
    DYNAMODB_USER_MENU_LINKS_TABLE_NAME: params.userMenuLinksTableName,
    COGNITO_USER_POOL_ID: params.cognitoUserPoolId,
    COGNITO_APP_CLIENT_ID: params.cognitoAppClientId,
    COGNITO_ISSUER_URL: params.cognitoIssuerUrl,
    COGNITO_DOMAIN_URL: params.cognitoDomainUrl,
    COGNITO_REGION: config.awsRegion,
    SHARED_CONVERSATIONS_TABLE_NAME: params.ragAssistantsTableName, // TODO: should be shared-conversations SSM
    BFF_SESSIONS_TABLE_NAME: params.bffSessionsTableName,
    BFF_COOKIE_SIGNING_KEY_ARN: params.bffCookieSigningKeyArn,
    BFF_COOKIE_DATA_KEY_SECRET_ARN: params.bffCookieDataKeySecretArn,
    BFF_SESSION_TTL_SECONDS: '28800',
    BFF_SESSION_REFRESH_LEEWAY_SECONDS: '60',
    COGNITO_BFF_APP_CLIENT_ID: params.cognitoBFFAppClientId,
    COGNITO_BFF_APP_CLIENT_SECRET_ARN: params.cognitoBFFAppClientSecretArn,
    BFF_AUTH_CALLBACK_URL: config.domainName
      ? `https://${config.domainName}/api/auth/callback`
      : 'http://localhost:8000/auth/callback',
    BFF_POST_LOGIN_REDIRECT_URL: config.domainName
      ? `https://${config.domainName}/`
      : 'http://localhost:4200/',
    INFERENCE_API_URL: params.inferenceApiRuntimeEndpointUrl,
    VOICE_TICKET_REPLAY_TABLE_NAME: params.voiceTicketReplayTableName,
    VOICE_TICKET_SIGNING_SECRET_ARN: params.voiceTicketSigningSecretArn,
  };
}
