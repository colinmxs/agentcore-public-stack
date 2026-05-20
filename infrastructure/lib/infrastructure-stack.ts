import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrockagentcore';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags } from './config';

import { AlbConstruct } from './constructs/network/alb-construct';
import { EcsClusterConstruct } from './constructs/network/ecs-cluster-construct';
import { NetworkConstruct } from './constructs/network/network-construct';

import { AdminTablesConstruct } from './constructs/data/admin-tables-construct';
import { AuthTablesConstruct } from './constructs/data/auth-tables-construct';
import { CostTrackingTablesConstruct } from './constructs/data/cost-tracking-tables-construct';
import { FileUploadConstruct } from './constructs/data/file-upload-construct';
import { QuotaTablesConstruct } from './constructs/data/quota-tables-construct';
import { SharedConversationsConstruct } from './constructs/data/shared-conversations-construct';

import { ArtifactRenderTokenSecretConstruct } from './constructs/identity/artifact-render-token-secret-construct';
import { AuthProvidersConstruct } from './constructs/identity/auth-providers-construct';
import { AuthSecretConstruct } from './constructs/identity/auth-secret-construct';
import { BffCookieKeyConstruct } from './constructs/identity/bff-cookie-key-construct';
import { CognitoConstruct } from './constructs/identity/cognito-construct';
import { OAuthTablesConstruct } from './constructs/identity/oauth-tables-construct';
import { PlatformIdentityConstruct } from './constructs/identity/platform-identity-construct';
import { VoiceTicketConstruct } from './constructs/identity/voice-ticket-construct';

import { AlbDnsConstruct } from './constructs/zones/alb-dns-construct';

export interface InfrastructureStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * Infrastructure Stack — Shared Network Resources and Core Tables.
 *
 * This stack creates foundational resources shared by all application
 * stacks. As of the Phase 2 lift, the inline resource creation has been
 * extracted into a set of reusable constructs under
 * `lib/constructs/`; this stack assembles them.
 *
 * Provisioned (in deploy order):
 *   - VPC, ALB, ECS cluster, ALB security group  (constructs/network/)
 *   - Auth secret, voice ticket signing, KMS keys, BFF cookie data key,
 *     workload identity, Cognito, auth providers, OAuth, optional
 *     artifact render token  (constructs/identity/)
 *   - Auth tables, quota tables, cost-tracking tables, admin tables,
 *     file uploads, shared conversations  (constructs/data/)
 *   - Route53 hosted zone lookup + ALB DNS  (constructs/zones/)
 *
 * Logical IDs of underlying CFN resources may differ from prior commits
 * because nested constructs prefix child IDs. The equivalence test in
 * `test/equivalence/` verifies that the resource fingerprints (type +
 * normalized properties) match the original union, so logical ID drift
 * is a tolerated cosmetic.
 *
 * This stack should be deployed FIRST, before any application stacks.
 */
export class InfrastructureStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly albListener: elbv2.ApplicationListener;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsCluster: ecs.Cluster;
  public readonly authSecret: secretsmanager.Secret;
  public readonly platformWorkloadIdentity: bedrock.CfnWorkloadIdentity;

  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);

    const { config } = props;

    applyStandardTags(this, config);

    // ============================================================
    // Network foundation — VPC, ALB, ECS cluster
    // ============================================================
    const network = new NetworkConstruct(this, 'Network', { config });
    this.vpc = network.vpc;

    const albConstruct = new AlbConstruct(this, 'Alb', {
      config,
      vpc: this.vpc,
    });
    this.alb = albConstruct.alb;
    this.albListener = albConstruct.albListener;
    this.albSecurityGroup = albConstruct.albSecurityGroup;

    const ecsClusterConstruct = new EcsClusterConstruct(this, 'EcsCluster', {
      config,
      vpc: this.vpc,
    });
    this.ecsCluster = ecsClusterConstruct.ecsCluster;

    // ============================================================
    // Identity foundation — secrets, KMS, Cognito, OAuth providers
    // ============================================================
    const authSecret = new AuthSecretConstruct(this, 'AuthSecret', { config });
    this.authSecret = authSecret.authSecret;

    new VoiceTicketConstruct(this, 'VoiceTicket', { config });

    new BffCookieKeyConstruct(this, 'BffCookieKey', { config });

    const platformIdentity = new PlatformIdentityConstruct(
      this,
      'PlatformIdentity',
      { config },
    );
    this.platformWorkloadIdentity = platformIdentity.workloadIdentity;

    new OAuthTablesConstruct(this, 'OAuthTables', { config });

    new AuthProvidersConstruct(this, 'AuthProviders', { config });

    new CognitoConstruct(this, 'Cognito', { config });

    if (config.artifacts.enabled) {
      new ArtifactRenderTokenSecretConstruct(this, 'ArtifactRenderToken', {
        config,
      });
    }

    // ============================================================
    // Data tables (auth, quota, cost tracking, admin, sharing)
    // ============================================================
    new AuthTablesConstruct(this, 'AuthTables', { config });
    new QuotaTablesConstruct(this, 'QuotaTables', { config });
    new CostTrackingTablesConstruct(this, 'CostTrackingTables', { config });
    new AdminTablesConstruct(this, 'AdminTables', { config });
    new FileUploadConstruct(this, 'FileUpload', { config });
    new SharedConversationsConstruct(this, 'SharedConversations', { config });

    // ============================================================
    // Route53 hosted zone + ALB URL export
    // ============================================================
    new AlbDnsConstruct(this, 'AlbDns', { config, alb: this.alb });

    // ============================================================
    // Stack-level CloudFormation Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${config.projectPrefix}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
      exportName: `${config.projectPrefix}-alb-dns-name`,
    });

    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: this.ecsCluster.clusterName,
      description: 'ECS Cluster Name',
      exportName: `${config.projectPrefix}-ecs-cluster-name`,
    });

    new cdk.CfnOutput(this, 'AuthSecretArn', {
      value: this.authSecret.secretArn,
      description: 'Authentication Secret ARN',
      exportName: `${config.projectPrefix}-auth-secret-arn`,
    });

    new cdk.CfnOutput(this, 'AuthSecretName', {
      value: this.authSecret.secretName,
      description: 'Authentication Secret Name',
      exportName: `${config.projectPrefix}-auth-secret-name`,
    });
  }
}
