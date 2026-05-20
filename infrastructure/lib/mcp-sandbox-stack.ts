import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags } from './config';
import { McpSandboxBucketConstruct } from './constructs/mcp-sandbox/mcp-sandbox-bucket-construct';
import {
  MCP_SANDBOX_SUBDOMAIN_LABEL,
  McpSandboxDistributionConstruct,
  buildMcpSandboxFrameAncestors,
  buildMcpSandboxProxyCsp,
} from './constructs/mcp-sandbox/mcp-sandbox-distribution-construct';

// Re-export the helpers + label so existing test imports keep working.
export {
  MCP_SANDBOX_SUBDOMAIN_LABEL,
  buildMcpSandboxFrameAncestors,
  buildMcpSandboxProxyCsp,
};

export interface McpSandboxStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * MCP Apps host renderer — Sandbox Proxy origin.
 *
 * As of the Phase 2 lift this stack is a thin assembly of two
 * constructs under `lib/constructs/mcp-sandbox/`:
 *
 *   - McpSandboxBucketConstruct — private S3 bucket + asset deployment
 *   - McpSandboxDistributionConstruct — CloudFront + Route53 ALIAS,
 *                                       with CSP and `frame-ancestors`
 *                                       locked to the SPA origin
 *
 * INERT BY DESIGN: this stack writes exactly one SSM export
 * (`/{prefix}/mcp-sandbox/origin`) that nothing consumes until the
 * frontend `<mcp-app-frame>` lands and the whole host renderer stays
 * gated behind `MCP_APPS_HOST_ENABLED` until PR #7. Deploying it
 * changes nothing user-facing.
 *
 * Cross-stack contract: reads NOTHING from other stacks (cert ARN
 * comes from config, hosted zone via Route53 lookup). One-way SSM
 * publish only — deploy tier 1, parallel-safe with Artifacts / RAG /
 * Gateway / Fine-Tuning.
 */
export class McpSandboxStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly proxyOrigin: string;

  constructor(scope: Construct, id: string, props: McpSandboxStackProps) {
    super(scope, id, props);

    const { config } = props;
    applyStandardTags(this, config);

    const bucketConstruct = new McpSandboxBucketConstruct(this, 'Bucket', {
      config,
    });
    this.bucket = bucketConstruct.bucket;

    const distributionConstruct = new McpSandboxDistributionConstruct(
      this,
      'Distribution',
      { config, bucket: this.bucket },
    );
    this.distribution = distributionConstruct.distribution;
    this.proxyOrigin = distributionConstruct.proxyOrigin;

    // Deploy the static shell into the bucket, with CloudFront
    // invalidation on every redeploy so shell changes propagate
    // immediately despite the cache policy.
    bucketConstruct.deployShell(this.distribution);

    // Human-readable CloudFormation outputs for deploy-time visibility.
    new cdk.CfnOutput(this, 'McpSandboxOrigin', {
      value: this.proxyOrigin,
      description: 'MCP Apps sandbox-proxy origin URL',
    });
    new cdk.CfnOutput(this, 'McpSandboxProxyUrl', {
      value: `${this.proxyOrigin}/proxy.html`,
      description: 'Fully-qualified URL of the sandbox proxy shell',
    });
    new cdk.CfnOutput(this, 'McpSandboxDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID for the sandbox-proxy origin',
    });
  }
}
