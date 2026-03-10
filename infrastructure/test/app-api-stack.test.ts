import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AppApiStack } from '../lib/app-api-stack';
import { createMockConfig, createMockApp, mockEnv } from './helpers/mock-config';

describe('AppApiStack', () => {
  let template: Template;
  let config: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    config = createMockConfig();
    const app = createMockApp(config, ['AppApiStack']);
    const stack = new AppApiStack(app, 'TestAppApiStack', {
      config,
      env: mockEnv(config),
    });
    template = Template.fromStack(stack);
  });

  // ============================================================
  // Stack Synthesis
  // ============================================================

  test('synthesizes without errors', () => {
    expect(template.toJSON()).toBeDefined();
  });

  // ============================================================
  // ECS Fargate Service
  // ============================================================

  describe('ECS Fargate Service', () => {
    test('creates a Fargate service', () => {
      template.hasResourceProperties('AWS::ECS::Service', {
        LaunchType: 'FARGATE',
      });
    });

    test('service has circuit breaker with rollback enabled', () => {
      template.hasResourceProperties('AWS::ECS::Service', {
        DeploymentConfiguration: Match.objectLike({
          DeploymentCircuitBreaker: {
            Enable: true,
            Rollback: true,
          },
        }),
      });
    });

    test('service desired count matches config', () => {
      template.hasResourceProperties('AWS::ECS::Service', {
        DesiredCount: config.appApi.desiredCount,
      });
    });
  });

  // ============================================================
  // ECS Task Definition
  // ============================================================

  describe('Task Definition', () => {
    test('has correct CPU from config', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Cpu: String(config.appApi.cpu),
      });
    });

    test('has correct memory from config', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Memory: String(config.appApi.memory),
      });
    });

    test('uses Fargate compatibility', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        RequiresCompatibilities: ['FARGATE'],
      });
    });

    test('container maps port 8000', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            PortMappings: Match.arrayWith([
              Match.objectLike({ ContainerPort: 8000 }),
            ]),
          }),
        ]),
      });
    });

    test('container has health check', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            HealthCheck: Match.objectLike({
              Command: ['CMD-SHELL', 'curl -f http://localhost:8000/health || exit 1'],
            }),
          }),
        ]),
      });
    });
  });

  // ============================================================
  // DynamoDB Tables
  // ============================================================

  describe('DynamoDB Tables', () => {
    test('creates AssistantsTable with PAY_PER_REQUEST billing', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${config.projectPrefix}-assistants`,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: Match.arrayWith([
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ]),
      });
    });

    test('AssistantsTable has global secondary indexes', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${config.projectPrefix}-assistants`,
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({ IndexName: 'OwnerStatusIndex' }),
          Match.objectLike({ IndexName: 'VisibilityStatusIndex' }),
          Match.objectLike({ IndexName: 'SharedWithIndex' }),
        ]),
      });
    });

    test('creates UserFilesTable with PAY_PER_REQUEST billing', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${config.projectPrefix}-user-files`,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: Match.arrayWith([
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ]),
      });
    });

    test('UserFilesTable has TTL enabled', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${config.projectPrefix}-user-files`,
        TimeToLiveSpecification: {
          AttributeName: 'ttl',
          Enabled: true,
        },
      });
    });

    test('UserFilesTable has SessionIndex GSI', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${config.projectPrefix}-user-files`,
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({ IndexName: 'SessionIndex' }),
        ]),
      });
    });

    test('UserFilesTable has DynamoDB Streams enabled', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: `${config.projectPrefix}-user-files`,
        StreamSpecification: {
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
      });
    });

    test('creates exactly 2 DynamoDB tables', () => {
      template.resourceCountIs('AWS::DynamoDB::Table', 2);
    });
  });

  // ============================================================
  // S3 Buckets
  // ============================================================

  describe('S3 Buckets', () => {
    test('creates AssistantsDocumentBucket with versioning', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: `${config.projectPrefix}-assistants-documents`,
        VersioningConfiguration: { Status: 'Enabled' },
      });
    });

    test('creates UserFilesBucket', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: `${config.projectPrefix}-user-files-${config.awsAccount}`,
      });
    });

    test('AssistantsDocumentBucket has CORS configuration', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: `${config.projectPrefix}-assistants-documents`,
        CorsConfiguration: {
          CorsRules: Match.arrayWith([
            Match.objectLike({
              AllowedMethods: ['GET', 'PUT', 'HEAD'],
              AllowedHeaders: ['Content-Type', 'Content-Length', 'x-amz-*'],
            }),
          ]),
        },
      });
    });

    test('UserFilesBucket has CORS configuration', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: `${config.projectPrefix}-user-files-${config.awsAccount}`,
        CorsConfiguration: {
          CorsRules: Match.arrayWith([
            Match.objectLike({
              AllowedMethods: ['GET', 'PUT', 'HEAD'],
            }),
          ]),
        },
      });
    });

    test('UserFilesBucket blocks all public access', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: `${config.projectPrefix}-user-files-${config.awsAccount}`,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    test('UserFilesBucket enforces SSL', () => {
      // enforceSSL adds a bucket policy denying non-SSL requests
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Deny',
              Condition: { Bool: { 'aws:SecureTransport': 'false' } },
            }),
          ]),
        }),
      });
    });

    test('UserFilesBucket has lifecycle rules', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: `${config.projectPrefix}-user-files-${config.awsAccount}`,
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({ Id: 'transition-to-ia' }),
            Match.objectLike({ Id: 'transition-to-glacier' }),
            Match.objectLike({ Id: 'expire-objects' }),
            Match.objectLike({ Id: 'abort-incomplete-multipart' }),
          ]),
        },
      });
    });

    test('creates exactly 2 S3 buckets', () => {
      template.resourceCountIs('AWS::S3::Bucket', 2);
    });
  });

  // ============================================================
  // S3 Vector Store Resources
  // ============================================================

  describe('S3 Vector Store', () => {
    test('creates S3 Vector Bucket', () => {
      template.hasResourceProperties('AWS::S3Vectors::VectorBucket', {
        VectorBucketName: `${config.projectPrefix}-assistants-vector-store-v1`,
      });
    });

    test('creates S3 Vector Index with correct config', () => {
      template.hasResourceProperties('AWS::S3Vectors::Index', {
        VectorBucketName: `${config.projectPrefix}-assistants-vector-store-v1`,
        IndexName: `${config.projectPrefix}-assistants-vector-index-v1`,
        DataType: 'float32',
        Dimension: 1024,
        DistanceMetric: 'cosine',
      });
    });
  });

  // ============================================================
  // Lambda Functions
  // ============================================================

  describe('Lambda Functions', () => {
    test('creates RuntimeProvisioner function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: `${config.projectPrefix}-runtime-provisioner`,
        Runtime: 'python3.14',
        Handler: 'lambda_function.lambda_handler',
        MemorySize: 512,
        Timeout: 300,
        Architectures: ['arm64'],
      });
    });

    test('creates RuntimeUpdater function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: `${config.projectPrefix}-runtime-updater`,
        Runtime: 'python3.14',
        Handler: 'lambda_function.lambda_handler',
        MemorySize: 512,
        Timeout: 900,
        Architectures: ['arm64'],
      });
    });

    test('creates at least 2 Lambda functions', () => {
      const lambdas = template.findResources('AWS::Lambda::Function');
      expect(Object.keys(lambdas).length).toBeGreaterThanOrEqual(2);
    });

    test('RuntimeProvisioner has DynamoDB event source mapping', () => {
      template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
        BatchSize: 1,
        BisectBatchOnFunctionError: true,
        MaximumRetryAttempts: 3,
        StartingPosition: 'LATEST',
      });
    });
  });

  // ============================================================
  // SNS Topic
  // ============================================================

  describe('SNS Topic', () => {
    test('creates runtime update alerts topic', () => {
      template.hasResourceProperties('AWS::SNS::Topic', {
        TopicName: `${config.projectPrefix}-runtime-update-alerts`,
        DisplayName: 'AgentCore Runtime Update Alerts',
      });
    });

    test('creates exactly 1 SNS topic', () => {
      template.resourceCountIs('AWS::SNS::Topic', 1);
    });
  });

  // ============================================================
  // ALB Target Group
  // ============================================================

  describe('ALB Target Group', () => {
    test('creates target group on port 8000', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        Port: 8000,
        Protocol: 'HTTP',
        TargetType: 'ip',
      });
    });

    test('target group has health check on /health', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        HealthCheckPath: '/health',
        HealthyThresholdCount: 2,
        UnhealthyThresholdCount: 3,
      });
    });

    test('creates listener rule for /* path pattern', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
        Conditions: Match.arrayWith([
          Match.objectLike({
            Field: 'path-pattern',
            PathPatternConfig: { Values: ['/*'] },
          }),
        ]),
        Priority: 1,
      });
    });
  });

  // ============================================================
  // SSM Parameters (exported by this stack)
  // ============================================================

  describe('SSM Parameters', () => {
    test('exports 7 SSM parameters', () => {
      template.resourceCountIs('AWS::SSM::Parameter', 7);
    });

    test('exports file-upload/bucket-name', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/${config.projectPrefix}/file-upload/bucket-name`,
        Type: 'String',
      });
    });

    test('exports file-upload/bucket-arn', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/${config.projectPrefix}/file-upload/bucket-arn`,
        Type: 'String',
      });
    });

    test('exports file-upload/table-name', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/${config.projectPrefix}/file-upload/table-name`,
        Type: 'String',
      });
    });

    test('exports file-upload/table-arn', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/${config.projectPrefix}/file-upload/table-arn`,
        Type: 'String',
      });
    });

    test('exports lambda/runtime-provisioner-arn', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/${config.projectPrefix}/lambda/runtime-provisioner-arn`,
        Type: 'String',
      });
    });

    test('exports lambda/runtime-updater-arn', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/${config.projectPrefix}/lambda/runtime-updater-arn`,
        Type: 'String',
      });
    });

    test('exports sns/runtime-update-alerts-arn', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/${config.projectPrefix}/sns/runtime-update-alerts-arn`,
        Type: 'String',
      });
    });
  });

  // ============================================================
  // IAM Task Role
  // ============================================================

  describe('IAM Task Role', () => {
    test('creates an IAM role for ECS task', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'sts:AssumeRole',
              Principal: { Service: 'ecs-tasks.amazonaws.com' },
            }),
          ]),
        }),
      });
    });

    test('task role has Bedrock InvokeModel permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'bedrock:InvokeModel',
              Effect: 'Allow',
            }),
          ]),
        }),
      });
    });

    test('task role has S3 Vectors permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                's3vectors:PutVectors',
                's3vectors:QueryVectors',
              ]),
              Effect: 'Allow',
            }),
          ]),
        }),
      });
    });
  });

  // ============================================================
  // CloudWatch Log Group
  // ============================================================

  describe('CloudWatch Log Group', () => {
    test('creates log group for ECS tasks', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: `/ecs/${config.projectPrefix}/app-api`,
        RetentionInDays: 7,
      });
    });
  });

  // ============================================================
  // Security Group
  // ============================================================

  describe('Security Group', () => {
    test('creates ECS security group', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for App API ECS Fargate tasks',
      });
    });
  });

  // ============================================================
  // EventBridge Rule
  // ============================================================

  describe('EventBridge Rule', () => {
    test('creates rule for SSM parameter change detection', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        EventPattern: Match.objectLike({
          source: ['aws.ssm'],
          'detail-type': ['Parameter Store Change'],
        }),
      });
    });
  });

  // ============================================================
  // CloudFormation Outputs (Required for Deploy Script)
  // ============================================================

  describe('CloudFormation Outputs', () => {
    test('exports EcsClusterName for deploy script', () => {
      template.hasOutput('EcsClusterName', {
        Description: 'ECS Cluster Name',
        Export: {
          Name: `${config.projectPrefix}-AppEcsClusterName`,
        },
      });
    });

    test('exports EcsServiceName for deploy script', () => {
      template.hasOutput('EcsServiceName', {
        Description: 'ECS Service Name',
        Export: {
          Name: `${config.projectPrefix}-AppEcsServiceName`,
        },
      });
    });
  });
});
