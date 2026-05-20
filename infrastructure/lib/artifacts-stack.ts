import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags } from './config';
import { ArtifactRenderLambdaConstruct } from './constructs/artifacts/artifact-render-lambda-construct';
import { ArtifactsDataConstruct } from './constructs/artifacts/artifacts-data-construct';
import { ArtifactsDistributionConstruct } from './constructs/artifacts/artifacts-distribution-construct';

export interface ArtifactsStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * Artifacts Stack — iframe-isolated artifact rendering pipeline.
 *
 * As of the Phase 2 lift this stack is a thin assembly of three
 * constructs under `lib/constructs/artifacts/`:
 *
 *   - ArtifactsDataConstruct       — DynamoDB + S3 (Platform-side data)
 *   - ArtifactRenderLambdaConstruct — render Lambda + Function URL
 *                                     (Backend-side compute)
 *   - ArtifactsDistributionConstruct — CloudFront on `artifacts.{domain}`
 *                                      + Route53 ALIAS (Platform-side
 *                                      edge)
 *
 * Cross-stack contract (SSM, all `/{projectPrefix}/artifacts/*`):
 *
 *   Consumes (published by InfrastructureStack):
 *     /artifacts/render-token-key-arn
 *
 *   Publishes (consumed by inference-api, app-api, frontend):
 *     /artifacts/bucket-name
 *     /artifacts/bucket-arn
 *     /artifacts/table-name
 *     /artifacts/table-arn
 *     /artifacts/origin
 *
 * Deploy order: InfrastructureStack → ArtifactsStack → consumers.
 */
export class ArtifactsStack extends cdk.Stack {
  public readonly artifactsTable: dynamodb.Table;
  public readonly artifactsBucket: s3.Bucket;
  public readonly renderFunction: lambda.Function;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: ArtifactsStackProps) {
    super(scope, id, props);

    const { config } = props;
    applyStandardTags(this, config);

    // Validation in config.ts has already enforced these for enabled stacks.
    const domainName = config.domainName!;

    // CSP frame-ancestors source list: the deployed SPA origin, plus any
    // extra origins (e.g. http://localhost:4200 for a local SPA pointed at
    // this env). Used by both the render Lambda's CSP env var and the
    // CloudFront response-headers-policy CSP — must stay byte-identical.
    const frameAncestors = [
      `https://${domainName}`,
      ...config.artifacts.extraFrameAncestors,
    ].join(' ');

    const data = new ArtifactsDataConstruct(this, 'Data', { config });
    this.artifactsTable = data.table;
    this.artifactsBucket = data.bucket;

    const render = new ArtifactRenderLambdaConstruct(this, 'Render', {
      config,
      artifactsTable: data.table,
      artifactsBucket: data.bucket,
      frameAncestors,
    });
    this.renderFunction = render.renderFunction;

    const dist = new ArtifactsDistributionConstruct(this, 'Distribution', {
      config,
      renderFunctionUrl: render.functionUrl,
      frameAncestors,
    });
    this.distribution = dist.distribution;

    // Human-readable CloudFormation outputs for deploy-time visibility.
    new cdk.CfnOutput(this, 'ArtifactsOrigin', {
      value: `https://artifacts.${domainName}`,
      description: 'Artifact iframe origin URL',
    });
    new cdk.CfnOutput(this, 'ArtifactsDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID for the artifact origin',
    });
  }
}
