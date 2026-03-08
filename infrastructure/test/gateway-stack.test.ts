import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { GatewayStack } from '../lib/gateway-stack';
import { createMockConfig, mockEnv } from './helpers/mock-config';

describe('GatewayStack', () => {
  let template: Template;
  let config: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    config = createMockConfig();
    const app = new cdk.App();
    const stack = new GatewayStack(app, 'TestGatewayStack', {
      config,
      env: mockEnv(config),
    });
    template = Template.fromStack(stack);
  });

  test('synthesizes without errors', () => {
    expect(template.toJSON()).toBeDefined();
  });

  describe('Gateway resource', () => {
    test('CfnGateway exists with MCP protocol and AWS_IAM auth', () => {
      template.hasResourceProperties('AWS::BedrockAgentCore::Gateway', {
        AuthorizerType: 'AWS_IAM',
        ProtocolType: 'MCP',
        ExceptionLevel: 'DEBUG',
        ProtocolConfiguration: {
          Mcp: {
            SupportedVersions: ['2025-11-25'],
            SearchType: 'SEMANTIC',
          },
        },
      });
    });
  });

  describe('IAM Role', () => {
    test('gateway execution role exists with bedrock-agentcore principal', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'sts:AssumeRole',
              Principal: Match.objectLike({
                Service: 'bedrock-agentcore.amazonaws.com',
              }),
            }),
          ]),
        }),
        Description: 'Execution role for AgentCore Gateway',
      });
    });

    test('has Lambda invocation permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'LambdaInvokeAccess',
              Effect: 'Allow',
              Action: 'lambda:InvokeFunction',
            }),
          ]),
        }),
      });
    });

    test('has CloudWatch Logs permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'GatewayLogsAccess',
              Effect: 'Allow',
              Action: Match.arrayWith(['logs:PutLogEvents']),
            }),
          ]),
        }),
      });
    });
  });

  describe('SSM Parameters', () => {
    test('creates 2 SSM parameters', () => {
      template.resourceCountIs('AWS::SSM::Parameter', 2);
    });

    test('exports gateway URL', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/${config.projectPrefix}/gateway/url`,
        Type: 'String',
      });
    });

    test('exports gateway ID', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/${config.projectPrefix}/gateway/id`,
        Type: 'String',
      });
    });
  });
});
