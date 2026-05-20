import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags } from './config';
import { RagCorsUpdaterConstruct } from './constructs/spa/rag-cors-updater-construct';
import { SpaBucketConstruct } from './constructs/spa/spa-bucket-construct';
import { SpaDistributionConstruct } from './constructs/spa/spa-distribution-construct';

export interface FrontendStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * Frontend Stack — S3 + CloudFront + Optional Route53.
 *
 * As of the Phase 2 lift, all resource creation lives in constructs
 * under `lib/constructs/spa/`. This stack assembles them and stitches
 * in the cross-stack ALB URL read from SSM.
 *
 * Provisioned:
 *   - SPA static-asset S3 bucket  (constructs/spa/spa-bucket-construct.ts)
 *   - CloudFront distribution + behaviors + functions + Route53 ALIAS
 *     (constructs/spa/spa-distribution-construct.ts)
 *   - Optional RAG CORS updater Lambda + custom resource
 *     (constructs/spa/rag-cors-updater-construct.ts), only when
 *     `config.ragIngestion.enabled`
 *
 * Reads from SSM:
 *   /{prefix}/network/alb-url    — published by InfrastructureStack
 *   /{prefix}/rag/documents-bucket-name (when ragIngestion enabled)
 */
export class FrontendStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly distributionDomainName: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { config } = props;

    applyStandardTags(this, config);

    // Pre-Phase-7 the SPA fetched `/config.json` at startup. After the
    // Phase 7 cleanup the only field worth keeping was `appApiUrl`,
    // which is now hardcoded into the bundle via Angular
    // `fileReplacements`. The SSM token is still resolved here because
    // it feeds the CloudFront `/api/*` HttpOrigin.
    let appApiUrl: string;
    try {
      appApiUrl = ssm.StringParameter.valueForStringParameter(
        this,
        `/${config.projectPrefix}/network/alb-url`,
      );
    } catch (error) {
      throw new Error(
        `Failed to import App API URL from SSM Parameter Store. ` +
          `Ensure InfrastructureStack has been deployed and exports the parameter: ` +
          `/${config.projectPrefix}/network/alb-url. ` +
          `Error: ${error}`,
      );
    }

    console.log('📥 Imported backend URLs from SSM:');
    console.log(`   App API URL: ${appApiUrl}`);

    const spaBucket = new SpaBucketConstruct(this, 'SpaBucket', { config });
    this.bucket = spaBucket.bucket;

    const spaDistribution = new SpaDistributionConstruct(
      this,
      'SpaDistribution',
      {
        config,
        bucket: this.bucket,
        appApiUrl,
      },
    );
    this.distribution = spaDistribution.distribution;
    this.distributionDomainName = spaDistribution.distributionDomainName;

    if (config.ragIngestion.enabled) {
      const frontendUrl = config.domainName
        ? `https://${config.domainName}`
        : `https://${this.distributionDomainName}`;
      new RagCorsUpdaterConstruct(this, 'RagCorsUpdater', {
        config,
        frontendUrl,
      });
    }

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.bucket.bucketName,
      description: 'S3 Bucket Name',
      exportName: `${config.projectPrefix}-FrontendBucketName`,
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `${config.projectPrefix}-DistributionId`,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
      exportName: `${config.projectPrefix}-DistributionDomainName`,
    });

    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: config.domainName || `https://${this.distributionDomainName}`,
      description: 'Frontend Website URL',
      exportName: `${config.projectPrefix}-WebsiteUrl`,
    });
  }
}
