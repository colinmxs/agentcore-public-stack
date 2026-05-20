import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags } from './config';
import { RagDataConstruct } from './constructs/rag/rag-data-construct';
import { RagIngestionLambdaConstruct } from './constructs/rag-ingestion/rag-ingestion-lambda-construct';

export interface RagIngestionStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * RAG Ingestion Stack — independent RAG pipeline.
 *
 * As of the Phase 2 lift, both halves of this stack live in
 * constructs:
 *
 *   - RagDataConstruct           (data — bucket, vectors, DDB)
 *   - RagIngestionLambdaConstruct (compute — Lambda, IAM, S3 event)
 *
 * The stack itself is a thin assembly that only resolves the network
 * imports SSM tokens (kept inline because the imported VPC is
 * referenced by future-VPC-bound execution paths) and then composes
 * the constructs.
 *
 * Reads from SSM:
 *   /{prefix}/network/{vpc-id, vpc-cidr, private-subnet-ids,
 *                      availability-zones}        — InfrastructureStack
 *   /{prefix}/rag-ingestion/image-tag             — pushed by build pipeline
 */
export class RagIngestionStack extends cdk.Stack {
  public readonly documentsBucket: s3.Bucket;
  public readonly assistantsTable: dynamodb.Table;
  public readonly ingestionLambda: lambda.DockerImageFunction;

  constructor(scope: Construct, id: string, props: RagIngestionStackProps) {
    super(scope, id, props);

    const { config } = props;

    applyStandardTags(this, config);

    // Network imports preserved for future VPC-bound execution paths.
    // The current Lambda is non-VPC-bound but the imports remain so the
    // SSM contract doesn't shift between releases.
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

    const _vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId,
      vpcCidrBlock: vpcCidr,
      availabilityZones: cdk.Fn.split(',', availabilityZonesString),
      privateSubnetIds: cdk.Fn.split(',', privateSubnetIdsString),
    });

    // Data resources
    const data = new RagDataConstruct(this, 'Data', { config });
    this.documentsBucket = data.documentsBucket;
    this.assistantsTable = data.assistantsTable;

    // Compute resources
    const compute = new RagIngestionLambdaConstruct(this, 'Lambda', {
      config,
      documentsBucket: data.documentsBucket,
      assistantsTable: data.assistantsTable,
      vectorBucketName: data.vectorBucketName,
      vectorIndexName: data.vectorIndexName,
    });
    this.ingestionLambda = compute.lambda;

    // ============================================================
    // CloudFormation Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: this.documentsBucket.bucketName,
      description: 'RAG documents bucket name',
      exportName: `${config.projectPrefix}-RagDocumentsBucketName`,
    });

    new cdk.CfnOutput(this, 'AssistantsTableName', {
      value: this.assistantsTable.tableName,
      description: 'RAG assistants table name',
      exportName: `${config.projectPrefix}-RagAssistantsTableName`,
    });

    new cdk.CfnOutput(this, 'IngestionLambdaArn', {
      value: this.ingestionLambda.functionArn,
      description: 'RAG ingestion Lambda function ARN',
      exportName: `${config.projectPrefix}-RagIngestionLambdaArn`,
    });

    new cdk.CfnOutput(this, 'VectorBucketName', {
      value: data.vectorBucketName,
      description: 'RAG vector store bucket name',
      exportName: `${config.projectPrefix}-RagVectorBucketName`,
    });

    new cdk.CfnOutput(this, 'VectorIndexName', {
      value: data.vectorIndexName,
      description: 'RAG vector store index name',
      exportName: `${config.projectPrefix}-RagVectorIndexName`,
    });
  }
}
