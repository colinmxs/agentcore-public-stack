import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as logs from "aws-cdk-lib/aws-logs";
import * as kms from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";
import { CfnResource } from "aws-cdk-lib";
import { AppConfig, getResourceName, applyStandardTags, getRemovalPolicy, getAutoDeleteObjects } from "./config";

export interface AppApiStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * App API Stack - Core Backend Application
 *
 * This stack creates:
 * - ECS Fargate service for App API
 * - Target group and listener rules for ALB routing
 * - Database (DynamoDB or RDS Aurora Serverless v2)
 * - Security groups for ECS tasks
 *
 * Dependencies:
 * - VPC, ALB, ECS Cluster from Infrastructure Stack (imported via SSM)
 *
 * Note: ECR repository is created by the build pipeline, not by CDK.
 */
export class AppApiStack extends cdk.Stack {
  public readonly ecsService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: AppApiStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Apply standard tags
    applyStandardTags(this, config);

    // ============================================================
    // Import Network Resources from Infrastructure Stack
    // ============================================================

    // Import VPC
    const vpcId = ssm.StringParameter.valueForStringParameter(this, `/${config.projectPrefix}/network/vpc-id`);
    const vpcCidr = ssm.StringParameter.valueForStringParameter(this, `/${config.projectPrefix}/network/vpc-cidr`);
    const privateSubnetIdsString = ssm.StringParameter.valueForStringParameter(this, `/${config.projectPrefix}/network/private-subnet-ids`);
    const availabilityZonesString = ssm.StringParameter.valueForStringParameter(this, `/${config.projectPrefix}/network/availability-zones`);

    // Import image tag from SSM (set by push-to-ecr.sh)
    const imageTag = ssm.StringParameter.valueForStringParameter(this, `/${config.projectPrefix}/app-api/image-tag`);

    // Import authentication secret ARN from SSM (created by infrastructure stack)
    const authSecretArn = ssm.StringParameter.valueForStringParameter(this, `/${config.projectPrefix}/auth/secret-arn`);

    const vpc = ec2.Vpc.fromVpcAttributes(this, "ImportedVpc", {
      vpcId: vpcId,
      vpcCidrBlock: vpcCidr,
      availabilityZones: cdk.Fn.split(",", availabilityZonesString),
      privateSubnetIds: cdk.Fn.split(",", privateSubnetIdsString),
    });

    // Import ALB Security Group
    const albSecurityGroupId = ssm.StringParameter.valueForStringParameter(this, `/${config.projectPrefix}/network/alb-security-group-id`);
    const albSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, "ImportedAlbSecurityGroup", albSecurityGroupId);

    // Import ALB
    const albArn = ssm.StringParameter.valueForStringParameter(this, `/${config.projectPrefix}/network/alb-arn`);
    const alb = elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, "ImportedAlb", {
      loadBalancerArn: albArn,
      securityGroupId: albSecurityGroupId,
    });

    // Import ALB Listener
    const albListenerArn = ssm.StringParameter.valueForStringParameter(this, `/${config.projectPrefix}/network/alb-listener-arn`);
    const albListener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, "ImportedAlbListener", {
      listenerArn: albListenerArn,
      securityGroup: albSecurityGroup,
    });

    // Import ECS Cluster
    const ecsClusterName = ssm.StringParameter.valueForStringParameter(this, `/${config.projectPrefix}/network/ecs-cluster-name`);
    const ecsClusterArn = ssm.StringParameter.valueForStringParameter(this, `/${config.projectPrefix}/network/ecs-cluster-arn`);
    const ecsCluster = ecs.Cluster.fromClusterAttributes(this, "ImportedEcsCluster", {
      clusterName: ecsClusterName,
      clusterArn: ecsClusterArn,
      vpc: vpc,
      securityGroups: [],
    });

    // ============================================================
    // Security Groups
    // ============================================================

    // ECS Task Security Group - Allow traffic from ALB
    const ecsSecurityGroup = new ec2.SecurityGroup(this, "AppEcsSecurityGroup", {
      vpc: vpc,
      securityGroupName: getResourceName(config, "app-ecs-sg"),
      description: "Security group for App API ECS Fargate tasks",
      allowAllOutbound: true,
    });

    ecsSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(8000), "Allow traffic from ALB to App API tasks");

    // ============================================================
    // Assistants Table
    // Base Table PK (String) SK (String)
    // Owner Status Index GSI_PK (String) GSI_SK (String)
    // Visibility Status Index GSI2_PK (String) GSI2_SK (String)
    // ============================================================
    const assistantsTable = new dynamodb.Table(this, "AssistantsTable", {
      tableName: getResourceName(config, "assistants"),
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    assistantsTable.addGlobalSecondaryIndex({
      indexName: "OwnerStatusIndex",
      partitionKey: {
        name: "GSI_PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI_SK",
        type: dynamodb.AttributeType.STRING,
      },
    });

    assistantsTable.addGlobalSecondaryIndex({
      indexName: "VisibilityStatusIndex",
      partitionKey: {
        name: "GSI2_PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI2_SK",
        type: dynamodb.AttributeType.STRING,
      },
    });

    assistantsTable.addGlobalSecondaryIndex({
      indexName: "SharedWithIndex",
      partitionKey: {
        name: "GSI3_PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI3_SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================================
    // Assistants Document Drop Bucket (RAG Injestion Drop Bucket)
    // ============================================================
    const origins = config.assistants?.corsOrigins.split(",").map((o) => o.trim());

    const assistantsDocumentsBucket = new s3.Bucket(this, "AssistantsDocumentBucket", {
      bucketName: getResourceName(config, "assistants-documents"),
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      cors: [
        {
          allowedOrigins: config.assistants?.corsOrigins.split(",").map((o) => o.trim()),
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedHeaders: ["Content-Type", "Content-Length", "x-amz-*"],
          exposedHeaders: ["ETag", "Content-Length", "Content-Type"],
          maxAge: 3600,
        },
      ],
    });

    // ============================================================
    // Assistants Vector Store Bucket
    // ============================================================
    // Create S3 Vector Bucket (not a regular S3 bucket)
    // Using CfnResource since there are no L2 constructs for S3 Vectors yet
    // Bucket name: 3-63 chars, lowercase, numbers, hyphens only
    const assistantsVectorStoreBucketName = getResourceName(config, "assistants-vector-store-v1");

    const assistantsVectorBucket = new CfnResource(this, "AssistantsVectorBucket", {
      type: "AWS::S3Vectors::VectorBucket",
      properties: {
        VectorBucketName: assistantsVectorStoreBucketName,
      },
    });

    // Create Vector Index within the bucket
    // Titan V2 embeddings: 1024 dimensions, float32, cosine similarity
    const assistantsVectorIndexName = getResourceName(config, "assistants-vector-index-v1");

    const assistantsVectorIndex = new CfnResource(this, "AssistantsVectorIndex", {
      type: "AWS::S3Vectors::Index",
      properties: {
        VectorBucketName: assistantsVectorStoreBucketName,
        IndexName: assistantsVectorIndexName,
        DataType: "float32", // Only supported type
        Dimension: 1024, // Titan V2 embedding dimension
        DistanceMetric: "cosine", // Cosine similarity for embeddings
        // MetadataConfiguration: Specify which metadata keys are NOT filterable
        // By default, all metadata keys (assistant_id, document_id, source) are filterable
        // Only mark 'text' as non-filterable since it's too large for filtering
        MetadataConfiguration: {
          NonFilterableMetadataKeys: ["text"],
        },
      },
    });

    // Index depends on bucket
    assistantsVectorIndex.addDependency(assistantsVectorBucket);

    // Note: Lambda function for document ingestion is now created in RagIngestionStack

    // ============================================================
    // Quota Management Tables
    // ============================================================

    // UserQuotas Table
    const userQuotasTable = new dynamodb.Table(this, "UserQuotasTable", {
      tableName: getResourceName(config, "user-quotas"),
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI1: AssignmentTypeIndex - Query assignments by type, sorted by priority
    userQuotasTable.addGlobalSecondaryIndex({
      indexName: "AssignmentTypeIndex",
      partitionKey: {
        name: "GSI1PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI1SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: UserAssignmentIndex - Query direct user assignments (O(1) lookup)
    userQuotasTable.addGlobalSecondaryIndex({
      indexName: "UserAssignmentIndex",
      partitionKey: {
        name: "GSI2PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI2SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3: RoleAssignmentIndex - Query role-based assignments, sorted by priority
    userQuotasTable.addGlobalSecondaryIndex({
      indexName: "RoleAssignmentIndex",
      partitionKey: {
        name: "GSI3PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI3SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI4: UserOverrideIndex - Query active overrides by user, sorted by expiry
    userQuotasTable.addGlobalSecondaryIndex({
      indexName: "UserOverrideIndex",
      partitionKey: {
        name: "GSI4PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI4SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // QuotaEvents Table
    const quotaEventsTable = new dynamodb.Table(this, "QuotaEventsTable", {
      tableName: getResourceName(config, "quota-events"),
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI5: TierEventIndex - Query events by tier for analytics
    quotaEventsTable.addGlobalSecondaryIndex({
      indexName: "TierEventIndex",
      partitionKey: {
        name: "GSI5PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI5SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Store quota table names in SSM
    new ssm.StringParameter(this, "UserQuotasTableNameParameter", {
      parameterName: `/${config.projectPrefix}/quota/user-quotas-table-name`,
      stringValue: userQuotasTable.tableName,
      description: "UserQuotas table name",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "UserQuotasTableArnParameter", {
      parameterName: `/${config.projectPrefix}/quota/user-quotas-table-arn`,
      stringValue: userQuotasTable.tableArn,
      description: "UserQuotas table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "QuotaEventsTableNameParameter", {
      parameterName: `/${config.projectPrefix}/quota/quota-events-table-name`,
      stringValue: quotaEventsTable.tableName,
      description: "QuotaEvents table name",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "QuotaEventsTableArnParameter", {
      parameterName: `/${config.projectPrefix}/quota/quota-events-table-arn`,
      stringValue: quotaEventsTable.tableArn,
      description: "QuotaEvents table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // Cost Tracking Tables
    // ============================================================

    // SessionsMetadata Table - Message-level metadata for cost tracking
    const sessionsMetadataTable = new dynamodb.Table(this, "SessionsMetadataTable", {
      tableName: getResourceName(config, "sessions-metadata"),
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: "ttl",
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI1: UserTimestampIndex - Query messages by user and time range
    sessionsMetadataTable.addGlobalSecondaryIndex({
      indexName: "UserTimestampIndex",
      partitionKey: {
        name: "GSI1PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI1SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // SessionLookupIndex - Direct session lookup by ID and per-session cost queries
    // Enables:
    //   - O(1) session lookup: GSI_PK=SESSION#{session_id}, GSI_SK=META
    //   - Per-session costs: GSI_PK=SESSION#{session_id}, GSI_SK begins_with C#
    sessionsMetadataTable.addGlobalSecondaryIndex({
      indexName: "SessionLookupIndex",
      partitionKey: {
        name: "GSI_PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI_SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // UserCostSummary Table - Pre-aggregated cost summaries for fast quota checks
    const userCostSummaryTable = new dynamodb.Table(this, "UserCostSummaryTable", {
      tableName: getResourceName(config, "user-cost-summary"),
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI2: PeriodCostIndex - Query top users by cost for admin dashboard
    // Enables efficient "top N users by cost" queries without table scans
    userCostSummaryTable.addGlobalSecondaryIndex({
      indexName: "PeriodCostIndex",
      partitionKey: {
        name: "GSI2PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI2SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["userId", "totalCost", "totalRequests", "lastUpdated"],
    });

    // SystemCostRollup Table - Pre-aggregated system-wide metrics for admin dashboard
    const systemCostRollupTable = new dynamodb.Table(this, "SystemCostRollupTable", {
      tableName: getResourceName(config, "system-cost-rollup"),
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Store cost tracking table names in SSM
    new ssm.StringParameter(this, "SessionsMetadataTableNameParameter", {
      parameterName: `/${config.projectPrefix}/cost-tracking/sessions-metadata-table-name`,
      stringValue: sessionsMetadataTable.tableName,
      description: "SessionsMetadata table name for message-level cost tracking",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "SessionsMetadataTableArnParameter", {
      parameterName: `/${config.projectPrefix}/cost-tracking/sessions-metadata-table-arn`,
      stringValue: sessionsMetadataTable.tableArn,
      description: "SessionsMetadata table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "UserCostSummaryTableNameParameter", {
      parameterName: `/${config.projectPrefix}/cost-tracking/user-cost-summary-table-name`,
      stringValue: userCostSummaryTable.tableName,
      description: "UserCostSummary table name for aggregated cost summaries",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "UserCostSummaryTableArnParameter", {
      parameterName: `/${config.projectPrefix}/cost-tracking/user-cost-summary-table-arn`,
      stringValue: userCostSummaryTable.tableArn,
      description: "UserCostSummary table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "SystemCostRollupTableNameParameter", {
      parameterName: `/${config.projectPrefix}/cost-tracking/system-cost-rollup-table-name`,
      stringValue: systemCostRollupTable.tableName,
      description: "SystemCostRollup table name for admin dashboard aggregates",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "SystemCostRollupTableArnParameter", {
      parameterName: `/${config.projectPrefix}/cost-tracking/system-cost-rollup-table-arn`,
      stringValue: systemCostRollupTable.tableArn,
      description: "SystemCostRollup table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // Managed Models Table
    // ============================================================

    // ManagedModels Table - Model management and pricing data
    const managedModelsTable = new dynamodb.Table(this, "ManagedModelsTable", {
      tableName: getResourceName(config, "managed-models"),
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI1: ModelIdIndex - Query by modelId for duplicate checking
    managedModelsTable.addGlobalSecondaryIndex({
      indexName: "ModelIdIndex",
      partitionKey: {
        name: "GSI1PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI1SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Store managed models table name in SSM
    new ssm.StringParameter(this, "ManagedModelsTableNameParameter", {
      parameterName: `/${config.projectPrefix}/admin/managed-models-table-name`,
      stringValue: managedModelsTable.tableName,
      description: "Managed models table name",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "ManagedModelsTableArnParameter", {
      parameterName: `/${config.projectPrefix}/admin/managed-models-table-arn`,
      stringValue: managedModelsTable.tableArn,
      description: "Managed models table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // Import Core Tables from Infrastructure Stack
    // ============================================================
    // OAuth, RBAC, and Users tables are created in Infrastructure Stack
    // to avoid circular dependencies. Import their ARNs/names via SSM.

    const oidcStateTableName = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/auth/oidc-state-table-name`
    );
    const oidcStateTableArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/auth/oidc-state-table-arn`
    );

    const usersTableName = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/users/users-table-name`
    );
    const usersTableArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/users/users-table-arn`
    );

    const appRolesTableName = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/rbac/app-roles-table-name`
    );
    const appRolesTableArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/rbac/app-roles-table-arn`
    );

    const oauthProvidersTableName = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/oauth/providers-table-name`
    );
    const oauthProvidersTableArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/oauth/providers-table-arn`
    );

    const oauthUserTokensTableName = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/oauth/user-tokens-table-name`
    );
    const oauthUserTokensTableArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/oauth/user-tokens-table-arn`
    );

    const oauthTokenEncryptionKeyArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/oauth/token-encryption-key-arn`
    );

    const oauthClientSecretsArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/oauth/client-secrets-arn`
    );

    // ============================================================
    // File Upload Storage (S3 + DynamoDB)
    // ============================================================

    // Determine allowed CORS origins from configuration
    const fileUploadCorsOrigins = config.fileUpload?.corsOrigins
      ? config.fileUpload.corsOrigins.split(",").map((o) => o.trim())
      : ["http://localhost:4200"];

    // S3 Bucket for user file uploads
    const userFilesBucket = new s3.Bucket(this, "UserFilesBucket", {
      // Include account ID for global uniqueness
      bucketName: getResourceName(config, "user-files", config.awsAccount),

      // Security configuration
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,

      // Removal policy based on retention configuration
      removalPolicy: getRemovalPolicy(config),
      autoDeleteObjects: getAutoDeleteObjects(config),

      // CORS for browser-based pre-signed URL uploads
      cors: [
        {
          allowedOrigins: fileUploadCorsOrigins,
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedHeaders: ["Content-Type", "Content-Length", "x-amz-*"],
          exposedHeaders: ["ETag", "Content-Length", "Content-Type"],
          maxAge: 3600,
        },
      ],

      // Intelligent tiering lifecycle rules
      lifecycleRules: [
        {
          id: "transition-to-ia",
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
        {
          id: "transition-to-glacier",
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
        {
          id: "expire-objects",
          expiration: cdk.Duration.days(config.fileUpload?.retentionDays || 365),
        },
        {
          id: "abort-incomplete-multipart",
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
    });

    // DynamoDB Table for file metadata
    /**
     * Schema:
     *   PK: USER#{userId}, SK: FILE#{uploadId} - File metadata
     *   PK: USER#{userId}, SK: QUOTA - User storage quota tracking
     *   GSI1PK: CONV#{sessionId}, GSI1SK: FILE#{uploadId} - Query files by conversation
     */
    const userFilesTable = new dynamodb.Table(this, "UserFilesTable", {
      tableName: getResourceName(config, "user-files"),
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: "ttl",
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: getRemovalPolicy(config),
    });

    // GSI1: SessionIndex - Query files by conversation/session
    userFilesTable.addGlobalSecondaryIndex({
      indexName: "SessionIndex",
      partitionKey: {
        name: "GSI1PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI1SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Store file upload resource names in SSM
    new ssm.StringParameter(this, "UserFilesBucketNameParameter", {
      parameterName: `/${config.projectPrefix}/file-upload/bucket-name`,
      stringValue: userFilesBucket.bucketName,
      description: "User files S3 bucket name",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "UserFilesBucketArnParameter", {
      parameterName: `/${config.projectPrefix}/file-upload/bucket-arn`,
      stringValue: userFilesBucket.bucketArn,
      description: "User files S3 bucket ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "UserFilesTableNameParameter", {
      parameterName: `/${config.projectPrefix}/file-upload/table-name`,
      stringValue: userFilesTable.tableName,
      description: "User files metadata table name",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "UserFilesTableArnParameter", {
      parameterName: `/${config.projectPrefix}/file-upload/table-arn`,
      stringValue: userFilesTable.tableArn,
      description: "User files metadata table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // ECS Task Definition
    // ============================================================
    // Note: ECR Repository is created automatically by the build pipeline
    // when pushing the first Docker image (see scripts/stack-app-api/push-to-ecr.sh)
    const taskDefinition = new ecs.FargateTaskDefinition(this, "AppApiTaskDefinition", {
      family: getResourceName(config, "app-api-task"),
      cpu: config.appApi.cpu,
      memoryLimitMiB: config.appApi.memory,
    });

    // Create log group for ECS task
    const logGroup = new logs.LogGroup(this, "AppApiLogGroup", {
      logGroupName: `/ecs/${config.projectPrefix}/app-api`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Reference the ECR repository created by the build pipeline
    const ecrRepository = ecr.Repository.fromRepositoryName(this, "AppApiRepository", getResourceName(config, "app-api"));

    // Reference the authentication secret from infrastructure stack
    const authSecret = secretsmanager.Secret.fromSecretCompleteArn(this, "AuthSecret", authSecretArn);

    // Container Definition
    const container = taskDefinition.addContainer("AppApiContainer", {
      containerName: "app-api",
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository, imageTag),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "app-api",
        logGroup: logGroup,
      }),
      environment: {
        AWS_REGION: config.awsRegion,
        PROJECT_PREFIX: config.projectPrefix,
        DYNAMODB_QUOTA_TABLE: userQuotasTable.tableName,
        DYNAMODB_EVENTS_TABLE: quotaEventsTable.tableName,
        DYNAMODB_OIDC_STATE_TABLE_NAME: oidcStateTableName,
        DYNAMODB_MANAGED_MODELS_TABLE_NAME: managedModelsTable.tableName,
        DYNAMODB_SESSIONS_METADATA_TABLE_NAME: sessionsMetadataTable.tableName,
        DYNAMODB_COST_SUMMARY_TABLE_NAME: userCostSummaryTable.tableName,
        DYNAMODB_SYSTEM_ROLLUP_TABLE_NAME: systemCostRollupTable.tableName,
        DYNAMODB_USERS_TABLE_NAME: usersTableName,
        DYNAMODB_APP_ROLES_TABLE_NAME: appRolesTableName,
        DYNAMODB_USER_FILES_TABLE_NAME: userFilesTable.tableName,
        S3_USER_FILES_BUCKET_NAME: userFilesBucket.bucketName,
        FILE_UPLOAD_MAX_SIZE_BYTES: String(config.fileUpload?.maxFileSizeBytes || 4194304),
        FILE_UPLOAD_MAX_FILES_PER_MESSAGE: String(config.fileUpload?.maxFilesPerMessage || 5),
        FILE_UPLOAD_USER_QUOTA_BYTES: String(config.fileUpload?.userQuotaBytes || 1073741824),
        // RAG resources - imported from RagIngestionStack via SSM
        S3_ASSISTANTS_DOCUMENTS_BUCKET_NAME: ssm.StringParameter.valueForStringParameter(
          this,
          `/${config.projectPrefix}/rag/documents-bucket-name`
        ),
        DYNAMODB_ASSISTANTS_TABLE_NAME: ssm.StringParameter.valueForStringParameter(
          this,
          `/${config.projectPrefix}/rag/assistants-table-name`
        ),
        S3_ASSISTANTS_VECTOR_STORE_BUCKET_NAME: ssm.StringParameter.valueForStringParameter(
          this,
          `/${config.projectPrefix}/rag/vector-bucket-name`
        ),
        S3_ASSISTANTS_VECTOR_STORE_INDEX_NAME: ssm.StringParameter.valueForStringParameter(
          this,
          `/${config.projectPrefix}/rag/vector-index-name`
        ),
        // AgentCore Memory Configuration (imported from InferenceApiStack)
        AGENTCORE_MEMORY_TYPE: 'dynamodb',
        AGENTCORE_MEMORY_ID: ssm.StringParameter.valueForStringParameter(
          this,
          `/${config.projectPrefix}/inference-api/memory-id`
        ),
        ENTRA_CLIENT_ID: config.entraClientId,
        ENTRA_TENANT_ID: config.entraTenantId,
        ENTRA_REDIRECT_URI: config.appApi.entraRedirectUri,
        DYNAMODB_OAUTH_PROVIDERS_TABLE_NAME: oauthProvidersTableName,
        DYNAMODB_OAUTH_USER_TOKENS_TABLE_NAME: oauthUserTokensTableName,
        OAUTH_TOKEN_ENCRYPTION_KEY_ARN: oauthTokenEncryptionKeyArn,
        OAUTH_CLIENT_SECRETS_ARN: oauthClientSecretsArn,
        // DATABASE_TYPE: config.appApi.databaseType,
        // ...(databaseConnectionInfo && { DATABASE_CONNECTION: databaseConnectionInfo }),
      },
      secrets: {
        // Secret values fetched at task startup, never visible in console/API
        ENTRA_CLIENT_SECRET: ecs.Secret.fromSecretsManager(authSecret, "secret"),
      },
      portMappings: [
        {
          containerPort: 8000,
          protocol: ecs.Protocol.TCP,
        },
      ],
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Grant permissions for database access
    if (config.appApi.databaseType === "dynamodb") {
      // Grant DynamoDB permissions (will be added after table is created)
      // This is a placeholder - actual permissions will be granted via IAM policy
    }

    // Grant permissions for assistants base table (local to this stack)
    assistantsTable.grantReadWriteData(taskDefinition.taskRole);
    
    // Grant explicit permissions for GSI queries (grantReadWriteData doesn't include GSI Query permissions)
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:Query',
          'dynamodb:Scan'
        ],
        resources: [
          `${assistantsTable.tableArn}/index/*`
        ],
      })
    );

    // Grant permissions for RAG assistants table (imported from RagIngestionStack)
    const ragAssistantsTableArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/rag/assistants-table-arn`
    );
    
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'RagAssistantsTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:BatchGetItem',
          'dynamodb:BatchWriteItem',
        ],
        resources: [
          ragAssistantsTableArn,
          `${ragAssistantsTableArn}/index/*`,
        ],
      })
    );

    // Grant permissions for assistants documents bucket (local to this stack)
    assistantsDocumentsBucket.grantReadWrite(taskDefinition.taskRole);

    // Grant permissions for RAG documents bucket (imported from RagIngestionStack)
    const ragDocumentsBucketArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/rag/documents-bucket-arn`
    );
    
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'RagDocumentsBucketAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:ListBucket',
        ],
        resources: [
          ragDocumentsBucketArn,
          `${ragDocumentsBucketArn}/*`,
        ],
      })
    );

    // Grant S3 Vectors permissions for assistants vector store
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3vectors:ListVectorBuckets",
          "s3vectors:GetVectorBucket",
          "s3vectors:GetIndex",
          "s3vectors:PutVectors",
          "s3vectors:ListVectors",
          "s3vectors:ListIndexes",
          "s3vectors:GetVector",
          "s3vectors:GetVectors",
          "s3vectors:DeleteVector",
          "s3vectors:QueryVectors",
        ],
        resources: [
          `arn:aws:s3vectors:${config.awsRegion}:${config.awsAccount}:bucket/${assistantsVectorStoreBucketName}`,
          `arn:aws:s3vectors:${config.awsRegion}:${config.awsAccount}:bucket/${assistantsVectorStoreBucketName}/index/*`,
        ],
      })
    );

    // Grant Bedrock permissions for Titan embeddings (used for RAG query embeddings)
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockTitanEmbeddings',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${config.awsRegion}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      })
    );


    // Grant permissions for quota management tables
    userQuotasTable.grantReadWriteData(taskDefinition.taskRole);
    quotaEventsTable.grantReadWriteData(taskDefinition.taskRole);

    // Grant permissions for OIDC state table (imported from Infrastructure Stack)
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'OidcStateTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [oidcStateTableArn, `${oidcStateTableArn}/index/*`],
      })
    );

    // Grant permissions for managed models table
    managedModelsTable.grantReadWriteData(taskDefinition.taskRole);

    // Grant permissions for cost tracking tables
    sessionsMetadataTable.grantReadWriteData(taskDefinition.taskRole);
    userCostSummaryTable.grantReadWriteData(taskDefinition.taskRole);
    systemCostRollupTable.grantReadWriteData(taskDefinition.taskRole);

    // Grant permissions for users table (imported from Infrastructure Stack)
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'UsersTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [usersTableArn, `${usersTableArn}/index/*`],
      })
    );

    // Grant permissions for AppRoles table (imported from Infrastructure Stack)
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'AppRolesTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [appRolesTableArn, `${appRolesTableArn}/index/*`],
      })
    );

    // Grant permissions for file upload resources
    userFilesTable.grantReadWriteData(taskDefinition.taskRole);
    userFilesBucket.grantReadWrite(taskDefinition.taskRole);

    // Grant permissions for authentication secret (imported from infrastructure stack)
    // Using manual policy statement for clarity when working with cross-stack imported secrets
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        resources: [authSecretArn],
      }),
    );

    // Grant Bedrock permissions for title generation (Nova Micro)
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockTitleGeneration',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          // Nova Micro foundation model - allow in all regions for flexibility
          `arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0`,
          // Cross-region inference profile (us. prefix works from any region)
          `arn:aws:bedrock:*:${config.awsAccount}:inference-profile/us.amazon.nova-micro-v1:0`,
        ],
      }),
    );

    // Grant permissions for OAuth provider management (imported from Infrastructure Stack)
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'OAuthProvidersTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [oauthProvidersTableArn, `${oauthProvidersTableArn}/index/*`],
      })
    );

    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'OAuthUserTokensTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [oauthUserTokensTableArn, `${oauthUserTokensTableArn}/index/*`],
      })
    );

    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'OAuthTokenEncryptionKeyAccess',
        effect: iam.Effect.ALLOW,
        actions: ['kms:Decrypt', 'kms:Encrypt', 'kms:GenerateDataKey', 'kms:DescribeKey'],
        resources: [oauthTokenEncryptionKeyArn],
      })
    );

    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'OAuthClientSecretsAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: [`${oauthClientSecretsArn}*`], // Wildcard for random suffix
      })
    );

    // Grant permissions for AgentCore Memory (imported from InferenceApiStack)
    const memoryArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/inference-api/memory-arn`
    );
    
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'AgentCoreMemoryAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          // Memory configuration
          'bedrock-agentcore:GetMemory',
          'bedrock-agentcore:GetMemoryStrategies',
          // Event operations
          'bedrock-agentcore:CreateEvent',
          'bedrock-agentcore:DeleteEvent',
          'bedrock-agentcore:ListEvents',
          // Memory retrieval
          'bedrock-agentcore:RetrieveMemory',
          'bedrock-agentcore:RetrieveMemoryRecords',
          'bedrock-agentcore:ListMemoryRecords',
          // Memory record deletion
          'bedrock-agentcore:BatchDeleteMemoryRecords',
          // Session operations
          'bedrock-agentcore:ListMemorySessions',
          'bedrock-agentcore:GetMemorySession',
          'bedrock-agentcore:DeleteMemorySession',
        ],
        resources: [memoryArn],
      })
    );

    // ============================================================
    // Target Group
    // ============================================================
    const targetGroup = new elbv2.ApplicationTargetGroup(this, "AppApiTargetGroup", {
      vpc: vpc,
      targetGroupName: getResourceName(config, "app-api-tg"),
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        enabled: true,
        path: "/health",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: "200",
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // Add listener rule for App API (all traffic)
    // Since this is the only target, route all HTTPS traffic to this target group
    albListener.addTargetGroups("AppApiTargetGroupAttachment", {
      targetGroups: [targetGroup],
      priority: 1,
      conditions: [elbv2.ListenerCondition.pathPatterns(["/*"])],
    });

    // ============================================================
    // ECS Fargate Service
    // ============================================================
    this.ecsService = new ecs.FargateService(this, "AppApiService", {
      cluster: ecsCluster,
      serviceName: getResourceName(config, "app-api-service"),
      taskDefinition: taskDefinition,
      desiredCount: config.appApi.desiredCount,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      circuitBreaker: {
        rollback: true,
      },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    // Attach service to target group
    this.ecsService.attachToApplicationTargetGroup(targetGroup);

    // Auto-scaling configuration
    const scaling = this.ecsService.autoScaleTaskCount({
      minCapacity: config.appApi.desiredCount,
      maxCapacity: config.appApi.maxCapacity,
    });

    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // ============================================================
    // CloudFormation Outputs
    // ============================================================
    new cdk.CfnOutput(this, "EcsServiceName", {
      value: this.ecsService.serviceName,
      description: "ECS Service Name",
      exportName: `${config.projectPrefix}-AppEcsServiceName`,
    });

    new cdk.CfnOutput(this, "TaskDefinitionArn", {
      value: taskDefinition.taskDefinitionArn,
      description: "Task Definition ARN",
      exportName: `${config.projectPrefix}-AppApiTaskDefinitionArn`,
    });

    new cdk.CfnOutput(this, "UserQuotasTableName", {
      value: userQuotasTable.tableName,
      description: "UserQuotas table name",
      exportName: `${config.projectPrefix}-UserQuotasTableName`,
    });

    new cdk.CfnOutput(this, "QuotaEventsTableName", {
      value: quotaEventsTable.tableName,
      description: "QuotaEvents table name",
      exportName: `${config.projectPrefix}-QuotaEventsTableName`,
    });

    new cdk.CfnOutput(this, "OidcStateTableName", {
      value: oidcStateTableName,
      description: "OIDC state table name (imported from Infrastructure Stack)",
      exportName: `${config.projectPrefix}-OidcStateTableName`,
    });

    new cdk.CfnOutput(this, "ManagedModelsTableName", {
      value: managedModelsTable.tableName,
      description: "Managed models table name",
      exportName: `${config.projectPrefix}-ManagedModelsTableName`,
    });

    new cdk.CfnOutput(this, "SessionsMetadataTableName", {
      value: sessionsMetadataTable.tableName,
      description: "SessionsMetadata table name for cost tracking",
      exportName: `${config.projectPrefix}-SessionsMetadataTableName`,
    });

    new cdk.CfnOutput(this, "UserCostSummaryTableName", {
      value: userCostSummaryTable.tableName,
      description: "UserCostSummary table name for cost aggregation",
      exportName: `${config.projectPrefix}-UserCostSummaryTableName`,
    });

    new cdk.CfnOutput(this, "SystemCostRollupTableName", {
      value: systemCostRollupTable.tableName,
      description: "SystemCostRollup table name for admin dashboard",
      exportName: `${config.projectPrefix}-SystemCostRollupTableName`,
    });

    new cdk.CfnOutput(this, "UsersTableName", {
      value: usersTableName,
      description: "Users table name for admin user lookup (imported from Infrastructure Stack)",
      exportName: `${config.projectPrefix}-UsersTableName`,
    });

    new cdk.CfnOutput(this, "AppRolesTableName", {
      value: appRolesTableName,
      description: "AppRoles table name for RBAC (imported from Infrastructure Stack)",
      exportName: `${config.projectPrefix}-AppRolesTableName`,
    });

    new cdk.CfnOutput(this, "UserFilesBucketName", {
      value: userFilesBucket.bucketName,
      description: "S3 bucket for user file uploads",
      exportName: `${config.projectPrefix}-UserFilesBucketName`,
    });

    new cdk.CfnOutput(this, "UserFilesTableName", {
      value: userFilesTable.tableName,
      description: "DynamoDB table for file metadata",
      exportName: `${config.projectPrefix}-UserFilesTableName`,
    });

    // Note: Lambda function output is now in RagIngestionStack

    new cdk.CfnOutput(this, "AssistantsVectorStoreBucketName", {
      value: assistantsVectorStoreBucketName,
      description: "Name of the S3 Vector Bucket for assistants embeddings",
    });

    new cdk.CfnOutput(this, "AssistantsVectorIndexName", {
      value: assistantsVectorIndexName,
      description: "Name of the Vector Index within the assistants vector bucket",
    });

    new cdk.CfnOutput(this, "AssistantsVectorIndexArn", {
      value: assistantsVectorIndex.getAtt("IndexArn").toString(),
      description: "ARN of the assistants vector index",
    });

    new cdk.CfnOutput(this, "OAuthProvidersTableName", {
      value: oauthProvidersTableName,
      description: "OAuth providers configuration table name (imported from Infrastructure Stack)",
      exportName: `${config.projectPrefix}-OAuthProvidersTableName`,
    });

    new cdk.CfnOutput(this, "OAuthUserTokensTableName", {
      value: oauthUserTokensTableName,
      description: "OAuth user tokens table name (KMS encrypted, imported from Infrastructure Stack)",
      exportName: `${config.projectPrefix}-OAuthUserTokensTableName`,
    });

    new cdk.CfnOutput(this, "OAuthTokenEncryptionKeyArn", {
      value: oauthTokenEncryptionKeyArn,
      description: "KMS key ARN for OAuth token encryption (imported from Infrastructure Stack)",
      exportName: `${config.projectPrefix}-OAuthTokenEncryptionKeyArn`,
    });

    new cdk.CfnOutput(this, "OAuthClientSecretsSecretArn", {
      value: oauthClientSecretsArn,
      description: "Secrets Manager ARN for OAuth client secrets (imported from Infrastructure Stack)",
      exportName: `${config.projectPrefix}-OAuthClientSecretsSecretArn`,
    });
  }
}
