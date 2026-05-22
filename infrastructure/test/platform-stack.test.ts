/**
 * PlatformStack assertion tests.
 *
 * Verifies that PlatformStack synthesizes correctly and exposes all
 * required typed properties for BackendStack consumption.
 */
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PlatformStack } from '../lib/platform-stack';
import { createMockConfig, mockSsmContext, MOCK_ACCOUNT, MOCK_REGION } from './helpers/mock-config';

describe('PlatformStack', () => {
  let stack: PlatformStack;
  let template: Template;

  beforeAll(() => {
    // Provide domain + certs so all constructs can synthesize.
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
    stack = new PlatformStack(app, 'TestPlatformStack', {
      config,
      env: { account: MOCK_ACCOUNT, region: MOCK_REGION },
    });
    // Wire the SPA distribution (requires ALB URL)
    stack.wireSpaDistribution('http://mock-alb.example.com');
    template = Template.fromStack(stack);
  });

  describe('Network resources', () => {
    it('creates a VPC', () => {
      template.resourceCountIs('AWS::EC2::VPC', 1);
    });

    it('creates public and private subnets', () => {
      template.resourceCountIs('AWS::EC2::Subnet', 4); // 2 AZs × 2 types
    });

    it('creates a NAT gateway', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });

    it('creates an internet gateway', () => {
      template.resourceCountIs('AWS::EC2::InternetGateway', 1);
    });

    it('creates an ALB', () => {
      template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
    });

    it('creates an ALB listener', () => {
      template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 2); // HTTPS + HTTP redirect
    });

    it('creates ALB security group', () => {
      template.resourceCountIs('AWS::EC2::SecurityGroup', 1);
    });

    it('creates an ECS cluster', () => {
      template.resourceCountIs('AWS::ECS::Cluster', 1);
    });
  });

  describe('Identity resources', () => {
    it('creates Cognito user pool', () => {
      template.resourceCountIs('AWS::Cognito::UserPool', 1);
    });

    it('creates Cognito user pool client', () => {
      template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    });

    it('creates Cognito domain', () => {
      template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
    });

    it('creates the platform workload identity', () => {
      template.resourceCountIs('AWS::BedrockAgentCore::WorkloadIdentity', 1);
    });

    it('creates Secrets Manager secrets', () => {
      // auth secret, voice ticket signing, BFF cookie data key,
      // OAuth client secrets, auth provider secrets, Cognito BFF client secret,
      // artifact render token (always-on now)
      template.resourceCountIs('AWS::SecretsManager::Secret', 7);
    });

    it('creates KMS keys', () => {
      // OAuth token encryption + BFF cookie signing
      template.resourceCountIs('AWS::KMS::Key', 2);
    });
  });

  describe('DynamoDB tables', () => {
    it('creates all shared tables', () => {
      // All 24 tables (artifacts always-on now)
      template.resourceCountIs('AWS::DynamoDB::Table', 24);
    });
  });

  describe('S3 buckets', () => {
    it('creates all data buckets', () => {
      // file-uploads, SPA static, mcp-sandbox, rag-documents, fine-tuning-data, artifacts-content
      template.resourceCountIs('AWS::S3::Bucket', 6);
    });
  });

  describe('CloudFront distributions', () => {
    it('creates SPA + mcp-sandbox distributions', () => {
      // Artifacts distribution is wired separately via wireArtifactsDistribution
      // (not called in this test to avoid circular dep)
      template.resourceCountIs('AWS::CloudFront::Distribution', 2);
    });

    it('creates CloudFront functions', () => {
      // SPA: api-path-strip + spa-routing
      // MCP sandbox: csp-function
      template.resourceCountIs('AWS::CloudFront::Function', 3);
    });
  });

  describe('SSM parameters', () => {
    it('publishes SSM parameters for runtime consumption', () => {
      // Large number — every construct publishes at least 2
      const params = template.findResources('AWS::SSM::Parameter');
      expect(Object.keys(params).length).toBeGreaterThanOrEqual(40);
    });
  });

  describe('Typed properties', () => {
    it('exposes vpc', () => {
      expect(stack.vpc).toBeDefined();
    });

    it('exposes alb', () => {
      expect(stack.alb).toBeDefined();
    });

    it('exposes albListener', () => {
      expect(stack.albListener).toBeDefined();
    });

    it('exposes ecsCluster', () => {
      expect(stack.ecsCluster).toBeDefined();
    });

    it('exposes authSecret', () => {
      expect(stack.authSecret).toBeDefined();
    });

    it('exposes userPool', () => {
      expect(stack.userPool).toBeDefined();
    });

    it('exposes fileUploadBucket', () => {
      expect(stack.fileUploadBucket).toBeDefined();
    });

    it('exposes ragDocumentsBucket', () => {
      expect(stack.ragDocumentsBucket).toBeDefined();
    });

    it('exposes artifactsContentBucket', () => {
      expect(stack.artifactsContentBucket).toBeDefined();
    });

    it('exposes fineTuningDataBucket', () => {
      expect(stack.fineTuningDataBucket).toBeDefined();
    });

    it('exposes artifactsTable', () => {
      expect(stack.artifactsTable).toBeDefined();
    });

    it('exposes fineTuningJobsTable', () => {
      expect(stack.fineTuningJobsTable).toBeDefined();
    });

    it('exposes mcpSandboxProxyOrigin', () => {
      expect(stack.mcpSandboxProxyOrigin).toBeDefined();
    });

    it('exposes spaDistribution after wiring', () => {
      expect(stack.spaDistribution).toBeDefined();
    });

    it('exposes artifactsFrameAncestors', () => {
      expect(stack.artifactsFrameAncestors).toContain('https://example.com');
    });
  });
});
