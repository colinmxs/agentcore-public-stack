import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { FrontendStack } from '../lib/frontend-stack';
import { createMockConfig, createMockApp, mockEnv } from './helpers/mock-config';

describe('FrontendStack', () => {
  let template: Template;
  let config: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    config = createMockConfig();
    const app = createMockApp(config, ['FrontendStack']);
    const stack = new FrontendStack(app, 'TestFrontendStack', {
      config,
      env: mockEnv(config),
    });
    template = Template.fromStack(stack);
  });

  test('synthesizes without errors', () => {
    expect(template.toJSON()).toBeDefined();
  });

  test('creates S3 bucket with versioning enabled', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: {
        Status: 'Enabled',
      },
    });
  });

  test('creates S3 bucket with encryption', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: Match.objectLike({
              SSEAlgorithm: Match.anyValue(),
            }),
          }),
        ]),
      },
    });
  });

  test('creates S3 bucket that blocks public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('creates CloudFront distribution', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  });

  test('creates CloudFront response headers policy with security headers', () => {
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          StrictTransportSecurity: Match.objectLike({
            AccessControlMaxAgeSec: 31536000,
            IncludeSubdomains: true,
            Override: true,
          }),
          FrameOptions: Match.objectLike({
            FrameOption: 'DENY',
            Override: true,
          }),
          ContentTypeOptions: Match.objectLike({
            Override: true,
          }),
          XSSProtection: Match.objectLike({
            Protection: true,
            ModeBlock: true,
            Override: true,
          }),
          ReferrerPolicy: Match.objectLike({
            ReferrerPolicy: 'strict-origin-when-cross-origin',
            Override: true,
          }),
        },
      },
    });
  });

  test('creates 4 SSM parameters', () => {
    template.resourceCountIs('AWS::SSM::Parameter', 4);
  });

  test('does not create Route53 record when domainName is not set', () => {
    template.resourceCountIs('AWS::Route53::RecordSet', 0);
  });

  test('sets removal policy to Delete when retainDataOnDelete is false', () => {
    const buckets = template.findResources('AWS::S3::Bucket', {
      // Match the frontend bucket (has versioning)
      Properties: {
        VersioningConfiguration: { Status: 'Enabled' },
      },
    });

    const bucketLogicalIds = Object.keys(buckets);
    expect(bucketLogicalIds.length).toBeGreaterThanOrEqual(1);

    const frontendBucket = buckets[bucketLogicalIds[0]];
    expect(frontendBucket.DeletionPolicy).toBe('Delete');
  });
});
