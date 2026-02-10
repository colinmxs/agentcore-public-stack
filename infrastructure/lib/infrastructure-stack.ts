import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { AppConfig, getResourceName, applyStandardTags, getRemovalPolicy } from './config';

export interface InfrastructureStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * Infrastructure Stack - Shared Network Resources and Core Tables
 * 
 * This stack creates foundational resources shared by all application stacks:
 * - VPC with public/private subnets across multiple AZs
 * - Application Load Balancer (ALB) in public subnets
 * - ECS Cluster for application workloads
 * - Security groups for ALB and ECS
 * - Core DynamoDB tables (Users, AppRoles, OAuth, OIDC)
 * - KMS keys and Secrets Manager for OAuth
 * - SSM parameters for cross-stack references
 * 
 * This stack should be deployed FIRST, before any application stacks.
 */
export class InfrastructureStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly albListener: elbv2.ApplicationListener;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsCluster: ecs.Cluster;
  public readonly authSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Apply standard tags
    applyStandardTags(this, config);

    // ============================================================
    // VPC - Network Foundation
    // ============================================================
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: getResourceName(config, 'vpc'),
      ipAddresses: ec2.IpAddresses.cidr(config.vpcCidr),
      maxAzs: 2, // Use 2 AZs for high availability
      natGateways: 1, // Single NAT Gateway for cost optimization (can be increased for HA)
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Export VPC ID to SSM for cross-stack references
    new ssm.StringParameter(this, 'VpcIdParameter', {
      parameterName: `/${config.projectPrefix}/network/vpc-id`,
      stringValue: this.vpc.vpcId,
      description: 'Shared VPC ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export VPC CIDR to SSM
    new ssm.StringParameter(this, 'VpcCidrParameter', {
      parameterName: `/${config.projectPrefix}/network/vpc-cidr`,
      stringValue: this.vpc.vpcCidrBlock,
      description: 'Shared VPC CIDR block',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export Private Subnet IDs to SSM
    const privateSubnetIds = this.vpc.privateSubnets.map(subnet => subnet.subnetId).join(',');
    new ssm.StringParameter(this, 'PrivateSubnetIdsParameter', {
      parameterName: `/${config.projectPrefix}/network/private-subnet-ids`,
      stringValue: privateSubnetIds,
      description: 'Comma-separated list of private subnet IDs',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export Public Subnet IDs to SSM
    const publicSubnetIds = this.vpc.publicSubnets.map(subnet => subnet.subnetId).join(',');
    new ssm.StringParameter(this, 'PublicSubnetIdsParameter', {
      parameterName: `/${config.projectPrefix}/network/public-subnet-ids`,
      stringValue: publicSubnetIds,
      description: 'Comma-separated list of public subnet IDs',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export Availability Zones to SSM
    const availabilityZones = this.vpc.availabilityZones.join(',');
    new ssm.StringParameter(this, 'AvailabilityZonesParameter', {
      parameterName: `/${config.projectPrefix}/network/availability-zones`,
      stringValue: availabilityZones,
      description: 'Comma-separated list of availability zones',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // Authentication Secret
    // ============================================================
    
    // Create a secret for authentication (e.g., JWT signing key, session secret, etc.)
    // This secret value should be rotated regularly in production
    this.authSecret = new secretsmanager.Secret(this, 'AuthenticationSecret', {
      secretName: getResourceName(config, 'auth-secret'),
      description: 'Authentication secret for JWT signing, session encryption, and other auth operations',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ description: 'Authentication Secret' }),
        generateStringKey: 'secret',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 64,
      },
      removalPolicy: getRemovalPolicy(config),
    });

    // Export Authentication Secret ARN to SSM
    new ssm.StringParameter(this, 'AuthSecretArnParameter', {
      parameterName: `/${config.projectPrefix}/auth/secret-arn`,
      stringValue: this.authSecret.secretArn,
      description: 'Authentication Secret ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export Authentication Secret Name to SSM
    new ssm.StringParameter(this, 'AuthSecretNameParameter', {
      parameterName: `/${config.projectPrefix}/auth/secret-name`,
      stringValue: this.authSecret.secretName,
      description: 'Authentication Secret Name',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // Security Groups
    // ============================================================
    
    // ALB Security Group - Allow HTTP/HTTPS from internet
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: getResourceName(config, 'alb-sg'),
      description: 'Security group for Application Load Balancer',
      allowAllOutbound: true,
    });

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic from internet'
    );

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic from internet'
    );

    // Export ALB Security Group ID to SSM
    new ssm.StringParameter(this, 'AlbSecurityGroupIdParameter', {
      parameterName: `/${config.projectPrefix}/network/alb-security-group-id`,
      stringValue: this.albSecurityGroup.securityGroupId,
      description: 'ALB Security Group ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // Application Load Balancer
    // ============================================================
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: this.vpc,
      internetFacing: true,
      loadBalancerName: getResourceName(config, 'alb'),
      securityGroup: this.albSecurityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    // Export ALB ARN to SSM
    new ssm.StringParameter(this, 'AlbArnParameter', {
      parameterName: `/${config.projectPrefix}/network/alb-arn`,
      stringValue: this.alb.loadBalancerArn,
      description: 'Application Load Balancer ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export ALB DNS name to SSM
    new ssm.StringParameter(this, 'AlbDnsNameParameter', {
      parameterName: `/${config.projectPrefix}/network/alb-dns-name`,
      stringValue: this.alb.loadBalancerDnsName,
      description: 'Application Load Balancer DNS name',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // ALB Listeners (HTTP and optional HTTPS)
    // ============================================================
    if (config.certificateArn) {
      // Import certificate from ARN
      const certificate = acm.Certificate.fromCertificateArn(
        this,
        'Certificate',
        config.certificateArn
      );

      // Create HTTPS listener - this is where backend services attach
      this.albListener = this.alb.addListener('HttpsListener', {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [certificate],
        defaultAction: elbv2.ListenerAction.fixedResponse(404, {
          contentType: 'text/plain',
          messageBody: 'Not Found - No matching route',
        }),
      });

      // Export HTTPS Listener ARN to SSM
      new ssm.StringParameter(this, 'AlbHttpsListenerArnParameter', {
        parameterName: `/${config.projectPrefix}/network/alb-https-listener-arn`,
        stringValue: this.albListener.listenerArn,
        description: 'Application Load Balancer HTTPS Listener ARN',
        tier: ssm.ParameterTier.STANDARD,
      });

      // HTTP listener only redirects to HTTPS (no target groups here)
      const httpRedirectListener = this.alb.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: 'HTTPS',
          port: '443',
          permanent: true,
        }),
      });
    } else {
      // Create default HTTP listener (no certificate)
      this.albListener = this.alb.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.fixedResponse(404, {
          contentType: 'text/plain',
          messageBody: 'Not Found - No matching route',
        }),
      });
    }

    // Export ALB Listener ARN to SSM (primary listener for backend services)
    new ssm.StringParameter(this, 'AlbListenerArnParameter', {
      parameterName: `/${config.projectPrefix}/network/alb-listener-arn`,
      stringValue: this.albListener.listenerArn,
      description: 'Application Load Balancer Primary Listener ARN (HTTPS if cert provided, HTTP otherwise)',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // ECS Cluster
    // ============================================================
    this.ecsCluster = new ecs.Cluster(this, 'EcsCluster', {
      clusterName: getResourceName(config, 'ecs-cluster'),
      vpc: this.vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED, // Enable CloudWatch Container Insights
    });

    // Export ECS Cluster Name to SSM
    new ssm.StringParameter(this, 'EcsClusterNameParameter', {
      parameterName: `/${config.projectPrefix}/network/ecs-cluster-name`,
      stringValue: this.ecsCluster.clusterName,
      description: 'ECS Cluster Name',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Export ECS Cluster ARN to SSM
    new ssm.StringParameter(this, 'EcsClusterArnParameter', {
      parameterName: `/${config.projectPrefix}/network/ecs-cluster-arn`,
      stringValue: this.ecsCluster.clusterArn,
      description: 'ECS Cluster ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // Core DynamoDB Tables (OAuth, RBAC, Users)
    // ============================================================
    // These tables are shared by both App API and Inference API stacks
    // to avoid circular dependencies. They must be created in the
    // Infrastructure Stack (foundation layer) and imported by other stacks.

    // OidcState Table - Distributed state storage for OIDC authentication
    const oidcStateTable = new dynamodb.Table(this, "OidcStateTable", {
      tableName: getResourceName(config, "oidc-state"),
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Store OIDC state table name in SSM
    new ssm.StringParameter(this, "OidcStateTableNameParameter", {
      parameterName: `/${config.projectPrefix}/auth/oidc-state-table-name`,
      stringValue: oidcStateTable.tableName,
      description: "OIDC state table name",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "OidcStateTableArnParameter", {
      parameterName: `/${config.projectPrefix}/auth/oidc-state-table-arn`,
      stringValue: oidcStateTable.tableArn,
      description: "OIDC state table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    // Users Table - User profiles synced from JWT for admin lookup
    const usersTable = new dynamodb.Table(this, "UsersTable", {
      tableName: getResourceName(config, "users"),
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

    // UserIdIndex - O(1) lookup by userId for admin deep links
    usersTable.addGlobalSecondaryIndex({
      indexName: "UserIdIndex",
      partitionKey: {
        name: "userId",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // EmailIndex - O(1) lookup by email for search
    usersTable.addGlobalSecondaryIndex({
      indexName: "EmailIndex",
      partitionKey: {
        name: "email",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // EmailDomainIndex - Browse users by company/domain, sorted by last login
    usersTable.addGlobalSecondaryIndex({
      indexName: "EmailDomainIndex",
      partitionKey: {
        name: "GSI2PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI2SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["userId", "email", "name", "status"],
    });

    // StatusLoginIndex - Browse users by status, sorted by last login
    usersTable.addGlobalSecondaryIndex({
      indexName: "StatusLoginIndex",
      partitionKey: {
        name: "GSI3PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI3SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["userId", "email", "name", "emailDomain"],
    });

    // Store users table name in SSM
    new ssm.StringParameter(this, "UsersTableNameParameter", {
      parameterName: `/${config.projectPrefix}/users/users-table-name`,
      stringValue: usersTable.tableName,
      description: "Users table name for admin user lookup",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "UsersTableArnParameter", {
      parameterName: `/${config.projectPrefix}/users/users-table-arn`,
      stringValue: usersTable.tableArn,
      description: "Users table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    // AppRoles Table - Role definitions and permission mappings
    const appRolesTable = new dynamodb.Table(this, "AppRolesTable", {
      tableName: getResourceName(config, "app-roles"),
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

    // GSI1: JwtRoleMappingIndex - Fast lookup: "Given JWT role X, what AppRoles apply?"
    // This is the critical index for authorization performance
    appRolesTable.addGlobalSecondaryIndex({
      indexName: "JwtRoleMappingIndex",
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

    // GSI2: ToolRoleMappingIndex - Reverse lookup: "What AppRoles grant access to tool X?"
    // Used for bidirectional sync when updating tool permissions
    appRolesTable.addGlobalSecondaryIndex({
      indexName: "ToolRoleMappingIndex",
      partitionKey: {
        name: "GSI2PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI2SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["roleId", "displayName", "enabled"],
    });

    // GSI3: ModelRoleMappingIndex - Reverse lookup: "What AppRoles grant access to model X?"
    // Used for bidirectional sync when updating model permissions
    appRolesTable.addGlobalSecondaryIndex({
      indexName: "ModelRoleMappingIndex",
      partitionKey: {
        name: "GSI3PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI3SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["roleId", "displayName", "enabled"],
    });

    // Store AppRoles table name in SSM
    new ssm.StringParameter(this, "AppRolesTableNameParameter", {
      parameterName: `/${config.projectPrefix}/rbac/app-roles-table-name`,
      stringValue: appRolesTable.tableName,
      description: "AppRoles table name for RBAC",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "AppRolesTableArnParameter", {
      parameterName: `/${config.projectPrefix}/rbac/app-roles-table-arn`,
      stringValue: appRolesTable.tableArn,
      description: "AppRoles table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    // KMS Key for encrypting OAuth user tokens at rest
    const oauthTokenEncryptionKey = new kms.Key(this, "OAuthTokenEncryptionKey", {
      alias: getResourceName(config, "oauth-token-key"),
      description: "KMS key for encrypting OAuth user tokens at rest",
      enableKeyRotation: true,
      removalPolicy: getRemovalPolicy(config),
    });

    // OAuth Providers Table - Admin-configured OAuth provider settings
    const oauthProvidersTable = new dynamodb.Table(this, "OAuthProvidersTable", {
      tableName: getResourceName(config, "oauth-providers"),
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI1: EnabledProvidersIndex - Query enabled providers for user display
    oauthProvidersTable.addGlobalSecondaryIndex({
      indexName: "EnabledProvidersIndex",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // OAuth User Tokens Table - User-connected OAuth tokens (KMS encrypted)
    const oauthUserTokensTable = new dynamodb.Table(this, "OAuthUserTokensTable", {
      tableName: getResourceName(config, "oauth-user-tokens"),
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: oauthTokenEncryptionKey,
    });

    // GSI1: ProviderUsersIndex - List users connected to a provider (admin view)
    oauthUserTokensTable.addGlobalSecondaryIndex({
      indexName: "ProviderUsersIndex",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Secrets Manager for OAuth client secrets
    const oauthClientSecretsSecret = new secretsmanager.Secret(this, "OAuthClientSecretsSecret", {
      secretName: getResourceName(config, "oauth-client-secrets"),
      description: "OAuth provider client secrets (JSON: {provider_id: secret})",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Store OAuth resource names in SSM
    new ssm.StringParameter(this, "OAuthProvidersTableNameParameter", {
      parameterName: `/${config.projectPrefix}/oauth/providers-table-name`,
      stringValue: oauthProvidersTable.tableName,
      description: "OAuth providers table name",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "OAuthProvidersTableArnParameter", {
      parameterName: `/${config.projectPrefix}/oauth/providers-table-arn`,
      stringValue: oauthProvidersTable.tableArn,
      description: "OAuth providers table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "OAuthUserTokensTableNameParameter", {
      parameterName: `/${config.projectPrefix}/oauth/user-tokens-table-name`,
      stringValue: oauthUserTokensTable.tableName,
      description: "OAuth user tokens table name",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "OAuthUserTokensTableArnParameter", {
      parameterName: `/${config.projectPrefix}/oauth/user-tokens-table-arn`,
      stringValue: oauthUserTokensTable.tableArn,
      description: "OAuth user tokens table ARN",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "OAuthTokenEncryptionKeyArnParameter", {
      parameterName: `/${config.projectPrefix}/oauth/token-encryption-key-arn`,
      stringValue: oauthTokenEncryptionKey.keyArn,
      description: "KMS key ARN for OAuth token encryption",
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, "OAuthClientSecretsArnParameter", {
      parameterName: `/${config.projectPrefix}/oauth/client-secrets-arn`,
      stringValue: oauthClientSecretsSecret.secretArn,
      description: "Secrets Manager ARN for OAuth client secrets",
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // Route53 Hosted Zone (Optional)
    // ============================================================
    if (config.infrastructureHostedZoneDomain && config.infrastructureHostedZoneDomain.trim() !== '') {
      const hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
        zoneName: config.infrastructureHostedZoneDomain,
        comment: `Hosted zone for ${config.projectPrefix}`,
      });

      // Export Hosted Zone ID to SSM
      new ssm.StringParameter(this, 'HostedZoneIdParameter', {
        parameterName: `/${config.projectPrefix}/network/hosted-zone-id`,
        stringValue: hostedZone.hostedZoneId,
        description: 'Route53 Hosted Zone ID',
        tier: ssm.ParameterTier.STANDARD,
      });

      // Export Hosted Zone Name to SSM
      new ssm.StringParameter(this, 'HostedZoneNameParameter', {
        parameterName: `/${config.projectPrefix}/network/hosted-zone-name`,
        stringValue: hostedZone.zoneName,
        description: 'Route53 Hosted Zone Name',
        tier: ssm.ParameterTier.STANDARD,
      });

      // CloudFormation Output for Hosted Zone
      new cdk.CfnOutput(this, 'HostedZoneId', {
        value: hostedZone.hostedZoneId,
        description: 'Route53 Hosted Zone ID',
        exportName: `${config.projectPrefix}-hosted-zone-id`,
      });

      new cdk.CfnOutput(this, 'HostedZoneNameServers', {
        value: cdk.Fn.join(', ', hostedZone.hostedZoneNameServers || []),
        description: 'Route53 Hosted Zone Name Servers',
        exportName: `${config.projectPrefix}-hosted-zone-ns`,
      });

      // ============================================================
      // Route53 A Record for ALB (Optional)
      // ============================================================
      if (config.albSubdomain) {
        const albRecordName = `${config.albSubdomain}.${config.infrastructureHostedZoneDomain}`;
        const protocol = config.certificateArn ? 'https' : 'http';
        
        const albARecord = new route53.ARecord(this, 'AlbARecord', {
          zone: hostedZone,
          recordName: config.albSubdomain,
          target: route53.RecordTarget.fromAlias(
            new route53Targets.LoadBalancerTarget(this.alb)
          ),
          comment: `A record for ALB - points ${albRecordName} to load balancer`,
        });

        // Additional HTTPS URL output when certificate is provided
        if (config.certificateArn) {
          new cdk.CfnOutput(this, 'AlbUrlHttps', {
            value: `https://${albRecordName}`,
            description: 'Application Load Balancer HTTPS URL (HTTP redirects here)',
            exportName: `${config.projectPrefix}-alb-url-https`,
          });
        }
      }
    }

    // ============================================================
    // ALB URL Export (Always)
    // ============================================================
    // Determine the ALB URL to export
    // Priority: Custom domain (if configured) > ALB DNS name
    let albUrl: string;
    let albUrlDescription: string;
    
    if (config.infrastructureHostedZoneDomain && config.albSubdomain) {
      // Use custom domain URL
      const albRecordName = `${config.albSubdomain}.${config.infrastructureHostedZoneDomain}`;
      const protocol = config.certificateArn ? 'https' : 'http';
      albUrl = `${protocol}://${albRecordName}`;
      albUrlDescription = 'Application Load Balancer Custom Domain URL';
    } else {
      // Use ALB DNS name as fallback
      const protocol = config.certificateArn ? 'https' : 'http';
      albUrl = `${protocol}://${this.alb.loadBalancerDnsName}`;
      albUrlDescription = 'Application Load Balancer URL (DNS name)';
    }
    
    // Export ALB URL to SSM - used by frontend stack for runtime config
    new ssm.StringParameter(this, 'AlbUrlParameter', {
      parameterName: `/${config.projectPrefix}/network/alb-url`,
      stringValue: albUrl,
      description: albUrlDescription,
      tier: ssm.ParameterTier.STANDARD,
    });

    // CloudFormation Output for ALB URL
    new cdk.CfnOutput(this, 'AlbUrl', {
      value: albUrl,
      description: albUrlDescription,
      exportName: `${config.projectPrefix}-alb-url`,
    });

    // ============================================================
    // CloudFormation Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${config.projectPrefix}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
      exportName: `${config.projectPrefix}-alb-dns-name`,
    });

    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: this.ecsCluster.clusterName,
      description: 'ECS Cluster Name',
      exportName: `${config.projectPrefix}-ecs-cluster-name`,
    });

    new cdk.CfnOutput(this, 'AuthSecretArn', {
      value: this.authSecret.secretArn,
      description: 'Authentication Secret ARN',
      exportName: `${config.projectPrefix}-auth-secret-arn`,
    });

    new cdk.CfnOutput(this, 'AuthSecretName', {
      value: this.authSecret.secretName,
      description: 'Authentication Secret Name',
      exportName: `${config.projectPrefix}-auth-secret-name`,
    });
  }
}
