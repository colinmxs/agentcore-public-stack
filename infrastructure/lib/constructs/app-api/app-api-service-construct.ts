import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { AppConfig, getResourceName, buildCorsOrigins } from '../../config';
import { AssistantsTableConstruct } from '../data/assistants-table-construct';
import { resolveAppApiSsmParams, buildAppApiEnvironment } from './app-api-environment';
import { grantAppApiPermissions } from './app-api-iam-grants';

export interface AppApiServiceConstructProps {
  config: AppConfig;
  /**
   * AgentCore Memory ARN. Sourced directly from the sibling
   * InferenceAgentCoreConstruct in BackendStack, not from SSM,
   * because publisher and consumer share a stack.
   */
  agentCoreMemoryArn: string;
  /**
   * AgentCore Memory ID. Same-stack ref via InferenceAgentCoreConstruct;
   * used as the App API container's `MEMORY_ID` env var.
   */
  agentCoreMemoryId: string;
  /**
   * Bedrock AgentCore Runtime endpoint URL. Same-stack ref via
   * InferenceAgentCoreConstruct; used as the App API container's
   * `INFERENCE_API_URL` env var.
   */
  inferenceApiRuntimeEndpointUrl: string;
}

/**
 * AppApiServiceConstruct — ECS Fargate service for the App API.
 *
 * Provisions:
 *   - ECS task definition + container (env vars via app-api-environment.ts)
 *   - IAM grants on the task role (via app-api-iam-grants.ts)
 *   - ALB target group + listener rule
 *   - Fargate service with auto-scaling
 *   - Security group (ingress from ALB on :8000)
 *   - Assistants DynamoDB table (local to this construct)
 *   - Artifacts env vars (S3 bucket, DDB table, origin, render token)
 *
 * All cross-stack values are resolved from SSM at synth time via
 * `resolveAppApiSsmParams()`. The container reads them as plain env
 * vars at runtime.
 */
export class AppApiServiceConstruct extends Construct {
  public readonly ecsService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: AppApiServiceConstructProps) {
    super(scope, id);

    const { config } = props;

    // ── Resolve all SSM parameters ──
    const params = resolveAppApiSsmParams(this, config.projectPrefix, {
      memoryId: props.agentCoreMemoryId,
      inferenceApiRuntimeEndpointUrl: props.inferenceApiRuntimeEndpointUrl,
    });

    // ── Import network resources ──
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId: params.vpcId,
      vpcCidrBlock: params.vpcCidr,
      availabilityZones: cdk.Fn.split(',', params.availabilityZones),
      privateSubnetIds: cdk.Fn.split(',', params.privateSubnetIds),
    });

    const albSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this, 'ImportedAlbSg', params.albSecurityGroupId,
    );

    const albListener = elbv2.ApplicationListener.fromApplicationListenerAttributes(
      this, 'ImportedAlbListener', {
        listenerArn: params.albListenerArn,
        securityGroup: albSecurityGroup,
      },
    );

    const ecsCluster = ecs.Cluster.fromClusterAttributes(this, 'ImportedEcsCluster', {
      clusterName: params.ecsClusterName,
      clusterArn: params.ecsClusterArn,
      vpc,
      securityGroups: [],
    });

    // ── Security group ──
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'AppEcsSecurityGroup', {
      vpc,
      securityGroupName: getResourceName(config, 'app-ecs-sg'),
      description: 'Security group for App API ECS Fargate tasks',
      allowAllOutbound: true,
    });
    ecsSecurityGroup.addIngressRule(
      albSecurityGroup, ec2.Port.tcp(8000),
      'Allow traffic from ALB to App API tasks',
    );

    // ── Assistants table (local) ──
    const assistantsTable = new AssistantsTableConstruct(
      this, 'AssistantsTableConstruct', { config },
    ).table;

    // ── Task definition ──
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'AppApiTaskDefinition', {
      family: getResourceName(config, 'app-api-task'),
      cpu: config.appApi.cpu,
      memoryLimitMiB: config.appApi.memory,
    });

    const logGroup = new logs.LogGroup(this, 'AppApiLogGroup', {
      logGroupName: `/ecs/${config.projectPrefix}/app-api`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const ecrRepository = ecr.Repository.fromRepositoryName(
      this, 'AppApiRepository', getResourceName(config, 'app-api'),
    );

    // ── Container environment ──
    const environment = buildAppApiEnvironment(config, params);

    // Artifacts env vars (always-on)
    const artifactsBucketName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/artifacts/bucket-name`);
    const artifactsTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/artifacts/table-name`);
    const artifactsOrigin = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/artifacts/origin`);
    const artifactRenderTokenSecretArn = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/artifacts/render-token-key-arn`);

    environment['S3_ARTIFACTS_BUCKET_NAME'] = artifactsBucketName;
    environment['DYNAMODB_ARTIFACTS_TABLE_NAME'] = artifactsTableName;
    environment['ARTIFACTS_ORIGIN'] = artifactsOrigin;
    environment['ARTIFACTS_RENDER_TOKEN_SECRET_ARN'] = artifactRenderTokenSecretArn;

    // Fine-tuning env vars (always-on)
    const ftJobsTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/fine-tuning/jobs-table-name`);
    const ftAccessTableName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/fine-tuning/access-table-name`);
    const ftDataBucketName = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/fine-tuning/data-bucket-name`);
    const ftExecRoleArn = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/fine-tuning/sagemaker-execution-role-arn`);
    const ftSecurityGroupId = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/fine-tuning/sagemaker-security-group-id`);
    const ftPrivateSubnetIds = ssm.StringParameter.valueForStringParameter(
      this, `/${config.projectPrefix}/fine-tuning/private-subnet-ids`);

    environment['FINE_TUNING_JOBS_TABLE_NAME'] = ftJobsTableName;
    environment['FINE_TUNING_ACCESS_TABLE_NAME'] = ftAccessTableName;
    environment['FINE_TUNING_DATA_BUCKET_NAME'] = ftDataBucketName;
    environment['SAGEMAKER_EXECUTION_ROLE_ARN'] = ftExecRoleArn;
    environment['SAGEMAKER_SECURITY_GROUP_ID'] = ftSecurityGroupId;
    environment['FINE_TUNING_PRIVATE_SUBNET_IDS'] = ftPrivateSubnetIds;

    // ── Container definition ──
    const container = taskDefinition.addContainer('AppApiContainer', {
      containerName: 'app-api',
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository, params.imageTag),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'app-api', logGroup }),
      environment,
      portMappings: [{ containerPort: 8000, protocol: ecs.Protocol.TCP }],
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8000/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // ── IAM grants ──
    grantAppApiPermissions({
      scope: this,
      config,
      taskRole: taskDefinition.taskRole,
      assistantsTable,
      oidcStateTableArn: params.oidcStateTableArn,
      usersTableArn: params.usersTableArn,
      appRolesTableArn: params.appRolesTableArn,
      apiKeysTableArn: params.apiKeysTableArn,
      oauthProvidersTableArn: params.oauthProvidersTableArn,
      oauthUserTokensTableArn: params.oauthUserTokensTableArn,
      oauthTokenEncryptionKeyArn: params.oauthTokenEncryptionKeyArn,
      oauthClientSecretsArn: params.oauthClientSecretsArn,
      userQuotasTableArn: params.userQuotasTableArn,
      quotaEventsTableArn: params.quotaEventsTableArn,
      sessionsMetadataTableArn: params.sessionsMetadataTableArn,
      userCostSummaryTableArn: params.userCostSummaryTableArn,
      systemCostRollupTableArn: params.systemCostRollupTableArn,
      managedModelsTableArn: params.managedModelsTableArn,
      userSettingsTableArn: params.userSettingsTableArn,
      userMenuLinksTableArn: params.userMenuLinksTableArn,
      authProvidersTableArn: params.authProvidersTableArn,
      authProviderSecretsArn: params.authProviderSecretsArn,
      cognitoUserPoolArn: params.cognitoUserPoolArn,
      bffSessionsTableArn: params.bffSessionsTableArn,
      bffCookieSigningKeyArn: params.bffCookieSigningKeyArn,
      bffCookieDataKeySecretArn: params.bffCookieDataKeySecretArn,
      cognitoBFFAppClientSecretArn: params.cognitoBFFAppClientSecretArn,
      voiceTicketReplayTableArn: params.voiceTicketReplayTableArn,
      voiceTicketSigningSecretArn: params.voiceTicketSigningSecretArn,
      userFilesBucketArn: params.userFilesBucketArn,
      userFilesTableArn: params.userFilesTableArn,
      ragAssistantsTableArn: params.ragAssistantsTableArn,
      ragDocumentsBucketArn: params.ragDocumentsBucketArn,
      agentCoreMemoryArn: props.agentCoreMemoryArn,
    });

    // ── Target group ──
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'AppApiTargetGroup', {
      vpc,
      targetGroupName: getResourceName(config, 'app-api-tg'),
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200',
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // Route all traffic to this target group
    new elbv2.ApplicationListenerRule(this, 'AppApiListenerRule', {
      listener: albListener,
      priority: 1,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/*'])],
      targetGroups: [targetGroup],
    });

    // ── Fargate service ──
    this.ecsService = new ecs.FargateService(this, 'AppApiService', {
      cluster: ecsCluster,
      serviceName: getResourceName(config, 'app-api-service'),
      taskDefinition,
      desiredCount: config.appApi.desiredCount,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      circuitBreaker: { enable: true, rollback: true },
      enableExecuteCommand: true,
    });

    this.ecsService.attachToApplicationTargetGroup(targetGroup);

    // ── Auto-scaling ──
    const scaling = this.ecsService.autoScaleTaskCount({
      minCapacity: config.appApi.desiredCount,
      maxCapacity: config.appApi.maxCapacity,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // ── Outputs ──
    new cdk.CfnOutput(cdk.Stack.of(this), 'AppApiServiceName', {
      value: this.ecsService.serviceName,
      description: 'App API ECS Service Name',
    });

    new cdk.CfnOutput(cdk.Stack.of(this), 'AppApiTaskDefinitionArn', {
      value: taskDefinition.taskDefinitionArn,
      description: 'App API Task Definition ARN',
    });
  }
}
