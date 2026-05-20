import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags } from './config';
import { FineTuningDataConstruct } from './constructs/fine-tuning/fine-tuning-data-construct';
import { SageMakerExecutionRoleConstruct } from './constructs/fine-tuning/sagemaker-execution-role-construct';

export interface SageMakerFineTuningStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * SageMaker Fine-Tuning Stack — optional ML training infrastructure.
 *
 * As of the Phase 2 lift, both halves of this stack live in
 * constructs:
 *
 *   - FineTuningDataConstruct          (data — DDB tables, S3 bucket)
 *   - SageMakerExecutionRoleConstruct  (compute — IAM role, SG)
 *
 * The stack itself is a thin assembly that resolves the network
 * imports SSM tokens (kept inline because the security group needs
 * the imported VPC) and then composes the constructs.
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

    // Network imports
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

    // Data resources
    const data = new FineTuningDataConstruct(this, 'Data', { config });
    this.fineTuningJobsTable = data.jobsTable;
    this.fineTuningAccessTable = data.accessTable;
    this.fineTuningDataBucket = data.dataBucket;

    // Compute resources
    const role = new SageMakerExecutionRoleConstruct(this, 'ExecutionRole', {
      config,
      dataBucket: data.dataBucket,
      jobsTable: data.jobsTable,
      vpc,
      privateSubnetIdsString,
    });
    this.sagemakerExecutionRole = role.executionRole;
    this.sagemakerSecurityGroup = role.securityGroup;

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
