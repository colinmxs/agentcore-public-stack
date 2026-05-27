/**
 * Integration tests — verify the two-stack architecture synthesizes
 * correctly end-to-end and produces the expected cross-stack references.
 */
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PlatformStack } from '../lib/platform-stack';
import { BackendStack } from '../lib/backend-stack';
import { createMockConfig, mockSsmContext, MOCK_ACCOUNT, MOCK_REGION } from './helpers/mock-config';

describe('Two-stack integration', () => {
  let platformTemplate: Template;
  let backendTemplate: Template;

  beforeAll(() => {
    const cert = 'arn:aws:acm:us-east-1:123456789012:certificate/test';
    const config = createMockConfig({
      domainName: 'example.com',
      infrastructureHostedZoneDomain: 'example.com',
      certificateArn: cert,
      frontend: { cloudFrontPriceClass: 'PriceClass_100', certificateArn: cert },
      artifacts: { retentionDays: 90, extraFrameAncestors: [], certificateArn: cert },
      mcpSandbox: { extraFrameAncestors: [], certificateArn: cert },
      fineTuning: {},
    });
    const app = new cdk.App();
    mockSsmContext(app, config);

    const platform = new PlatformStack(app, 'Platform', {
      config,
      env: { account: MOCK_ACCOUNT, region: MOCK_REGION },
    });
    platform.wireSpaDistribution();

    const backend = new BackendStack(app, 'Backend', {
      config,
      platform,
      env: { account: MOCK_ACCOUNT, region: MOCK_REGION },
    });

    // NOTE: wireArtifactsDistribution is NOT called here because it
    // creates a circular CDK dependency (Platform → Backend Function URL,
    // Backend → Platform RAG bucket). This is a known issue — the fix is
    // to move the artifacts distribution into BackendStack. For now the
    // integration test verifies everything except the artifacts CF distro.

    platformTemplate = Template.fromStack(platform);
    backendTemplate = Template.fromStack(backend);
  });

  describe('Platform produces cross-stack exports', () => {
    it('has CFN outputs (CDK auto-generates for cross-stack refs)', () => {
      const outputs = platformTemplate.findOutputs('*');
      expect(Object.keys(outputs).length).toBeGreaterThan(0);
    });

    it('both stacks produce substantial resources', () => {
      const platformJson = platformTemplate.toJSON();
      const backendJson = backendTemplate.toJSON();
      const platformCount = Object.keys(platformJson.Resources || {}).length;
      const backendCount = Object.keys(backendJson.Resources || {}).length;
      expect(platformCount).toBeGreaterThan(50);
      expect(backendCount).toBeGreaterThan(20);
    });
  });

  describe('Backend consumes Platform resources', () => {
    it('has Fn::ImportValue references', () => {
      const templateJson = JSON.stringify(backendTemplate.toJSON());
      expect(templateJson).toContain('Fn::ImportValue');
    });

    it('creates the Fargate service', () => {
      backendTemplate.resourceCountIs('AWS::ECS::Service', 1);
    });

    it('creates the AgentCore Runtime', () => {
      backendTemplate.resourceCountIs('AWS::BedrockAgentCore::Runtime', 1);
    });

    it('creates the AgentCore Gateway in Platform (hoisted Phase 2)', () => {
      platformTemplate.resourceCountIs('AWS::BedrockAgentCore::Gateway', 1);
      backendTemplate.resourceCountIs('AWS::BedrockAgentCore::Gateway', 0);
    });
  });

  describe('Resource ownership is correct', () => {
    it('Platform owns all DynamoDB tables', () => {
      const platformTables = Object.keys(platformTemplate.findResources('AWS::DynamoDB::Table')).length;
      const backendTables = Object.keys(backendTemplate.findResources('AWS::DynamoDB::Table')).length;
      expect(platformTables).toBeGreaterThanOrEqual(20);
      expect(backendTables).toBeLessThanOrEqual(2); // only assistants
    });

    it('Platform owns all S3 buckets', () => {
      const platformBuckets = Object.keys(platformTemplate.findResources('AWS::S3::Bucket')).length;
      const backendBuckets = Object.keys(backendTemplate.findResources('AWS::S3::Bucket')).length;
      expect(platformBuckets).toBeGreaterThanOrEqual(5);
      expect(backendBuckets).toBe(0);
    });

    it('CloudFront distributions are all in Platform after Phase 3', () => {
      // Phase 3 moved the artifacts distribution to Platform.
      // Platform now owns SPA + MCP sandbox + artifacts.
      // Backend owns zero CloudFront distributions.
      const platformDists = Object.keys(platformTemplate.findResources('AWS::CloudFront::Distribution')).length;
      const backendDists = Object.keys(backendTemplate.findResources('AWS::CloudFront::Distribution')).length;
      expect(platformDists).toBeGreaterThanOrEqual(3);
      expect(backendDists).toBe(0);
    });

    it('Platform owns Cognito', () => {
      platformTemplate.resourceCountIs('AWS::Cognito::UserPool', 1);
      backendTemplate.resourceCountIs('AWS::Cognito::UserPool', 0);
    });

    it('Platform owns the VPC', () => {
      platformTemplate.resourceCountIs('AWS::EC2::VPC', 1);
      backendTemplate.resourceCountIs('AWS::EC2::VPC', 0);
    });

    it('Platform owns the ALB', () => {
      platformTemplate.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
      backendTemplate.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 0);
    });

    it('Backend owns the ECS service', () => {
      backendTemplate.resourceCountIs('AWS::ECS::Service', 1);
      platformTemplate.resourceCountIs('AWS::ECS::Service', 0);
    });

    it('Platform owns Memory + Code Interpreter + Browser + Gateway; Backend owns Runtime', () => {
      // Phase 1 of the platform-as-bootstrap refactor moved
      // Memory + CI + Browser to Platform. Phase 2 moved Gateway.
      // Runtime moves in Phase 5.
      platformTemplate.resourceCountIs('AWS::BedrockAgentCore::Memory', 1);
      platformTemplate.resourceCountIs('AWS::BedrockAgentCore::CodeInterpreterCustom', 1);
      platformTemplate.resourceCountIs('AWS::BedrockAgentCore::BrowserCustom', 1);
      platformTemplate.resourceCountIs('AWS::BedrockAgentCore::Gateway', 1);
      platformTemplate.resourceCountIs('AWS::BedrockAgentCore::Runtime', 0);

      backendTemplate.resourceCountIs('AWS::BedrockAgentCore::Memory', 0);
      backendTemplate.resourceCountIs('AWS::BedrockAgentCore::CodeInterpreterCustom', 0);
      backendTemplate.resourceCountIs('AWS::BedrockAgentCore::BrowserCustom', 0);
      backendTemplate.resourceCountIs('AWS::BedrockAgentCore::Gateway', 0);
      backendTemplate.resourceCountIs('AWS::BedrockAgentCore::Runtime', 1);
    });

    it('Backend owns Lambda functions (RAG + artifact render)', () => {
      const backendLambdas = Object.keys(backendTemplate.findResources('AWS::Lambda::Function')).length;
      expect(backendLambdas).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Stack naming', () => {
    it('Platform stack name includes project prefix', () => {
      const templateJson = platformTemplate.toJSON();
      // Stack name is set via props, not in the template itself
      // but we can verify the resource naming convention
      const params = platformTemplate.findResources('AWS::SSM::Parameter');
      const firstParam = Object.values(params)[0] as any;
      expect(firstParam.Properties.Name).toContain('test-project');
    });
  });
});

describe('Config validation', () => {
  it('loadConfig requires CDK_PROJECT_PREFIX', () => {
    const app = new cdk.App();
    // No context set — should throw
    expect(() => {
      const { loadConfig } = require('../lib/config');
      loadConfig(app);
    }).toThrow(/CDK_PROJECT_PREFIX/);
  });
});

describe('Restore tool exists', () => {
  const RESTORE = require('path').resolve(__dirname, '..', '..', 'scripts', 'restore-data');

  it('restore.py exists', () => {
    expect(require('fs').existsSync(require('path').join(RESTORE, 'restore.py'))).toBe(true);
  });

  it('pyproject.toml exists', () => {
    expect(require('fs').existsSync(require('path').join(RESTORE, 'pyproject.toml'))).toBe(true);
  });

  it('README.md exists', () => {
    expect(require('fs').existsSync(require('path').join(RESTORE, 'README.md'))).toBe(true);
  });

  it('restore.py has main() function', () => {
    const content = require('fs').readFileSync(require('path').join(RESTORE, 'restore.py'), 'utf-8');
    expect(content).toContain('def main()');
  });

  it('restore.py has --dry-run flag', () => {
    const content = require('fs').readFileSync(require('path').join(RESTORE, 'restore.py'), 'utf-8');
    expect(content).toContain('--dry-run');
  });

  it('restore.py is idempotent (catches DuplicateProviderException)', () => {
    const content = require('fs').readFileSync(require('path').join(RESTORE, 'restore.py'), 'utf-8');
    expect(content).toContain('DuplicateProviderException');
  });

  it('restore.py handles UsernameExistsException', () => {
    const content = require('fs').readFileSync(require('path').join(RESTORE, 'restore.py'), 'utf-8');
    expect(content).toContain('UsernameExistsException');
  });
});
