/**
 * BackendStack assertion tests.
 *
 * Verifies that BackendStack synthesizes correctly, instantiates all
 * expected constructs, and creates the right resource types.
 */
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PlatformStack } from '../lib/platform-stack';
import { BackendStack } from '../lib/backend-stack';
import { createMockConfig, mockSsmContext, MOCK_ACCOUNT, MOCK_REGION } from './helpers/mock-config';

describe('BackendStack', () => {
  let template: Template;

  beforeAll(() => {
    // Provide domain + certs so all constructs can synthesize.
    // Artifacts distribution is NOT wired (wireArtifactsDistribution not
    // called) to avoid the circular dep — it's tested in isolation.
    const cert = 'arn:aws:acm:us-east-1:123456789012:certificate/test';
    const config = createMockConfig({
      domainName: 'example.com',
      infrastructureHostedZoneDomain: 'example.com',
      certificateArn: cert,
      frontend: { enabled: true, cloudFrontPriceClass: 'PriceClass_100', certificateArn: cert },
      artifacts: { enabled: true, retentionDays: 90, extraFrameAncestors: [], certificateArn: cert },
      mcpSandbox: { enabled: true, extraFrameAncestors: [], certificateArn: cert },
      fineTuning: { enabled: true, defaultQuotaHours: 100 },
    });
    const app = new cdk.App();
    mockSsmContext(app, config);

    const platform = new PlatformStack(app, 'Platform', {
      config,
      env: { account: MOCK_ACCOUNT, region: MOCK_REGION },
    });
    platform.wireSpaDistribution('http://mock-alb.example.com');
    // NOTE: wireArtifactsDistribution() NOT called — avoids circular dep

    const backend = new BackendStack(app, 'Backend', {
      config,
      platform,
      env: { account: MOCK_ACCOUNT, region: MOCK_REGION },
    });
    template = Template.fromStack(backend);
  });

  describe('App API Fargate service', () => {
    it('creates an ECS task definition', () => {
      template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
    });

    it('creates an ECS Fargate service', () => {
      template.resourceCountIs('AWS::ECS::Service', 1);
    });

    it('creates a target group', () => {
      template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 1);
    });

    it('creates a listener rule', () => {
      template.resourceCountIs('AWS::ElasticLoadBalancingV2::ListenerRule', 1);
    });

    it('creates an ECS security group', () => {
      // App API ECS SG + SageMaker SG
      template.resourceCountIs('AWS::EC2::SecurityGroup', 2);
    });

    it('creates auto-scaling targets', () => {
      template.resourceCountIs('AWS::ApplicationAutoScaling::ScalableTarget', 1);
    });

    it('creates auto-scaling policies', () => {
      template.resourceCountIs('AWS::ApplicationAutoScaling::ScalingPolicy', 2);
    });

    it('creates a log group for the task', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/ecs/test-project/app-api',
      });
    });
  });

  describe('AgentCore resources', () => {
    it('creates AgentCore Runtime', () => {
      template.resourceCountIs('AWS::BedrockAgentCore::Runtime', 1);
    });

    it('creates AgentCore Memory', () => {
      template.resourceCountIs('AWS::BedrockAgentCore::Memory', 1);
    });

    it('creates Code Interpreter Custom', () => {
      template.resourceCountIs('AWS::BedrockAgentCore::CodeInterpreterCustom', 1);
    });

    it('creates Browser Custom', () => {
      template.resourceCountIs('AWS::BedrockAgentCore::BrowserCustom', 1);
    });

    it('creates AgentCore Gateway', () => {
      template.resourceCountIs('AWS::BedrockAgentCore::Gateway', 1);
    });
  });

  describe('RAG Ingestion Lambda', () => {
    it('creates the ingestion Lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'test-project-rag-ingestion',
      });
    });

    it('creates S3 bucket notification for the Lambda', () => {
      template.resourceCountIs('Custom::S3BucketNotifications', 1);
    });
  });

  describe('Artifact Render Lambda', () => {
    it('creates the render Lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'test-project-artifact-render',
      });
    });
  });

  describe('SageMaker Fine-Tuning', () => {
    it('creates the SageMaker execution role', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'test-project-sagemaker-exec-role',
      });
    });

    it('creates the SageMaker security group', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for SageMaker training jobs - outbound HTTPS only',
      });
    });
  });

  describe('IAM roles', () => {
    it('creates the AgentCore runtime execution role', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'test-project-agentcore-runtime-role',
      });
    });

    it('creates the AgentCore memory execution role', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'test-project-agentcore-memory-role',
      });
    });

    it('creates the gateway execution role', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'test-project-gateway-role',
      });
    });
  });

  describe('No data resources in Backend', () => {
    it('creates zero DynamoDB tables (except assistants which is local)', () => {
      // Only the assistants table lives in Backend (local to app-api)
      template.resourceCountIs('AWS::DynamoDB::Table', 1);
    });

    it('creates zero S3 buckets', () => {
      template.resourceCountIs('AWS::S3::Bucket', 0);
    });

    it('creates zero CloudFront distributions', () => {
      template.resourceCountIs('AWS::CloudFront::Distribution', 0);
    });
  });

  describe('SSM parameters', () => {
    it('publishes gateway SSM parameters', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/test-project/gateway/url',
      });
    });

    it('publishes RAG ingestion Lambda ARN', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/test-project/rag/ingestion-lambda-arn',
      });
    });
  });
});
