import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags, getResourceName } from './config';
import { RagDataConstruct } from './constructs/rag/rag-data-construct';

export interface RagIngestionStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * RAG Ingestion Stack — independent RAG pipeline.
 *
 * As of the Phase 2 lift, the data resources (documents bucket, vectors
 * bucket+index, assistants DDB table) live in
 * `constructs/rag/rag-data-construct.ts`. The Lambda + IAM + S3-event-
 * notification compute half is still inline here; it moves to a Backend
 * construct in Task 9.
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

    // ============================================================
    // Network imports (used implicitly by future VPC-bound execution
    // paths; today the Lambda is non-VPC-bound but the imports remain
    // for future migration without altering SSM contract)
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

    const _vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId,
      vpcCidrBlock: vpcCidr,
      availabilityZones: cdk.Fn.split(',', availabilityZonesString),
      privateSubnetIds: cdk.Fn.split(',', privateSubnetIdsString),
    });

    const imageTag = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/rag-ingestion/image-tag`,
    );

    // ============================================================
    // Data resources (lifted into RagDataConstruct)
    // ============================================================
    const data = new RagDataConstruct(this, 'Data', { config });
    this.documentsBucket = data.documentsBucket;
    this.assistantsTable = data.assistantsTable;
    const vectorBucketName = data.vectorBucketName;
    const vectorIndexName = data.vectorIndexName;

    // ============================================================
    // Lambda Function for Document Ingestion (compute — moves to
    // Backend in Task 9)
    // ============================================================
    const ecrRepository = ecr.Repository.fromRepositoryName(
      this,
      'RagIngestionRepository',
      getResourceName(config, 'rag-ingestion'),
    );

    const _containerImageUri = `${ecrRepository.repositoryUri}:${imageTag}`;

    const ingestionLogGroup = new logs.LogGroup(this, 'RagIngestionLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.ingestionLambda = new lambda.DockerImageFunction(
      this,
      'RagIngestionLambda',
      {
        functionName: getResourceName(config, 'rag-ingestion'),
        code: lambda.DockerImageCode.fromEcr(ecrRepository, {
          tagOrDigest: imageTag,
        }),
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(config.ragIngestion.lambdaTimeout),
        memorySize: config.ragIngestion.lambdaMemorySize,
        logGroup: ingestionLogGroup,
        environment: {
          S3_ASSISTANTS_DOCUMENTS_BUCKET_NAME: this.documentsBucket.bucketName,
          DYNAMODB_ASSISTANTS_TABLE_NAME: this.assistantsTable.tableName,
          S3_ASSISTANTS_VECTOR_STORE_BUCKET_NAME: vectorBucketName,
          S3_ASSISTANTS_VECTOR_STORE_INDEX_NAME: vectorIndexName,
          BEDROCK_REGION: config.awsRegion,
        },
        description:
          'RAG document ingestion pipeline - processes documents from S3, extracts text, chunks, generates embeddings, stores in S3 vector store',
      },
    );

    // IAM
    this.documentsBucket.grantRead(this.ingestionLambda);
    this.assistantsTable.grantReadWriteData(this.ingestionLambda);

    this.ingestionLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3vectors:ListVectorBuckets',
          's3vectors:GetVectorBucket',
          's3vectors:GetIndex',
          's3vectors:PutVectors',
          's3vectors:ListVectors',
          's3vectors:ListIndexes',
          's3vectors:GetVector',
          's3vectors:GetVectors',
          's3vectors:DeleteVector',
        ],
        resources: [
          `arn:aws:s3vectors:${config.awsRegion}:${config.awsAccount}:bucket/${vectorBucketName}`,
          `arn:aws:s3vectors:${config.awsRegion}:${config.awsAccount}:bucket/${vectorBucketName}/index/${vectorIndexName}`,
        ],
      }),
    );

    this.ingestionLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${config.awsRegion}::foundation-model/${config.ragIngestion.embeddingModel}*`,
        ],
      }),
    );

    // S3 Event Notifications
    this.documentsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.ingestionLambda),
      { prefix: 'assistants/' },
    );

    new ssm.StringParameter(this, 'IngestionLambdaArnParameter', {
      parameterName: `/${config.projectPrefix}/rag/ingestion-lambda-arn`,
      stringValue: this.ingestionLambda.functionArn,
      description: 'RAG ingestion Lambda ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

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
      value: vectorBucketName,
      description: 'RAG vector store bucket name',
      exportName: `${config.projectPrefix}-RagVectorBucketName`,
    });

    new cdk.CfnOutput(this, 'VectorIndexName', {
      value: vectorIndexName,
      description: 'RAG vector store index name',
      exportName: `${config.projectPrefix}-RagVectorIndexName`,
    });
  }
}
