import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags, getResourceName } from './config';
import { FineTuningDataConstruct } from './constructs/fine-tuning/fine-tuning-data-construct';

export interface SageMakerFineTuningStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * SageMaker Fine-Tuning Stack — optional ML training infrastructure.
 *
 * As of the Phase 2 lift, the data resources (jobs table, access table,
 * data bucket) live in `constructs/fine-tuning/fine-tuning-data-construct.ts`.
 * The IAM execution role + security group compute half is still inline
 * here; it moves to a Backend construct in Task 9.
 *
 * Reads from SSM:
 *   /{prefix}/network/{vpc-id, vpc-cidr, private-subnet-ids,
 *                      availability-zones}        — InfrastructureStack
 *
 * Gated by `config.fineTuning.enabled` at the stack-instantiation site.
 */
export class SageMakerFineTuningStack extends cdk.Stack {
  public readonly fineTuningJobsTable: dynamodb.Table;
  public readonly fineTuningAccessTable: dynamodb.Table;
  public readonly fineTuningDataBucket: s3.Bucket;
  public readonly sagemakerExecutionRole: iam.Role;
  public readonly sagemakerSecurityGroup: ec2.SecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    props: SageMakerFineTuningStackProps,
  ) {
    super(scope, id, props);

    const { config } = props;

    applyStandardTags(this, config);

    // ============================================================
    // Network imports (used by the SageMaker security group + role)
    // ============================================================
    const vpcId = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/network/vpc-id`,
    );
    const vpcCidr = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/network/vpc-cidr`,
    );
    const privateSubnetIdsString = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/network/private-subnet-ids`,
    );
    const availabilityZonesString = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/network/availability-zones`,
    );

    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId,
      vpcCidrBlock: vpcCidr,
      availabilityZones: cdk.Fn.split(',', availabilityZonesString),
      privateSubnetIds: cdk.Fn.split(',', privateSubnetIdsString),
    });

    // ============================================================
    // Data resources (lifted into FineTuningDataConstruct)
    // ============================================================
    const data = new FineTuningDataConstruct(this, 'Data', { config });
    this.fineTuningJobsTable = data.jobsTable;
    this.fineTuningAccessTable = data.accessTable;
    this.fineTuningDataBucket = data.dataBucket;

    // ============================================================
    // SageMaker Execution Role (compute — moves to Backend in Task 9)
    // ============================================================
    this.sagemakerExecutionRole = new iam.Role(this, 'SageMakerExecutionRole', {
      roleName: getResourceName(config, 'sagemaker-exec-role'),
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      description:
        'Execution role assumed by SageMaker training and transform jobs',
    });

    this.fineTuningDataBucket.grantReadWrite(this.sagemakerExecutionRole);

    this.sagemakerExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'FineTuningJobsProgressWrite',
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:UpdateItem'],
        resources: [this.fineTuningJobsTable.tableArn],
      }),
    );

    this.sagemakerExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'VpcNetworkingForTraining',
        effect: iam.Effect.ALLOW,
        actions: [
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DescribeVpcs',
          'ec2:DescribeDhcpOptions',
          'ec2:CreateNetworkInterface',
          'ec2:CreateNetworkInterfacePermission',
          'ec2:DeleteNetworkInterface',
        ],
        resources: ['*'],
      }),
    );

    this.sagemakerExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsForTraining',
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [
          `arn:aws:logs:${config.awsRegion}:${config.awsAccount}:log-group:/aws/sagemaker/*`,
        ],
      }),
    );

    // ============================================================
    // SageMaker Security Group (compute — moves to Backend in Task 9)
    // ============================================================
    this.sagemakerSecurityGroup = new ec2.SecurityGroup(
      this,
      'SageMakerSecurityGroup',
      {
        vpc,
        securityGroupName: getResourceName(config, 'sagemaker-sg'),
        description:
          'Security group for SageMaker training jobs - outbound HTTPS only',
        allowAllOutbound: false,
      },
    );

    this.sagemakerSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow outbound HTTPS for AWS service access and model downloads',
    );

    new ssm.StringParameter(this, 'SageMakerExecutionRoleArnParameter', {
      parameterName: `/${config.projectPrefix}/fine-tuning/sagemaker-execution-role-arn`,
      stringValue: this.sagemakerExecutionRole.roleArn,
      description: 'SageMaker execution role ARN for training jobs',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'SageMakerSecurityGroupIdParameter', {
      parameterName: `/${config.projectPrefix}/fine-tuning/sagemaker-security-group-id`,
      stringValue: this.sagemakerSecurityGroup.securityGroupId,
      description: 'SageMaker training jobs security group ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'PrivateSubnetIdsParameter', {
      parameterName: `/${config.projectPrefix}/fine-tuning/private-subnet-ids`,
      stringValue: privateSubnetIdsString,
      description: 'Private subnet IDs for SageMaker training jobs',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // CloudFormation Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'FineTuningJobsTableName', {
      value: this.fineTuningJobsTable.tableName,
      description: 'Fine-tuning jobs DynamoDB table name',
      exportName: `${config.projectPrefix}-FineTuningJobsTableName`,
    });

    new cdk.CfnOutput(this, 'FineTuningAccessTableName', {
      value: this.fineTuningAccessTable.tableName,
      description: 'Fine-tuning access DynamoDB table name',
      exportName: `${config.projectPrefix}-FineTuningAccessTableName`,
    });

    new cdk.CfnOutput(this, 'FineTuningDataBucketName', {
      value: this.fineTuningDataBucket.bucketName,
      description: 'Fine-tuning data S3 bucket name',
      exportName: `${config.projectPrefix}-FineTuningDataBucketName`,
    });

    new cdk.CfnOutput(this, 'SageMakerExecutionRoleArn', {
      value: this.sagemakerExecutionRole.roleArn,
      description: 'SageMaker execution role ARN',
      exportName: `${config.projectPrefix}-SageMakerExecutionRoleArn`,
    });

    new cdk.CfnOutput(this, 'SageMakerSecurityGroupId', {
      value: this.sagemakerSecurityGroup.securityGroupId,
      description: 'SageMaker security group ID',
      exportName: `${config.projectPrefix}-SageMakerSecurityGroupId`,
    });
  }
}
