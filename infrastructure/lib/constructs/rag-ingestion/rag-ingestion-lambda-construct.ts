import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { AppConfig, getResourceName } from '../../config';

export interface RagIngestionLambdaConstructProps {
  config: AppConfig;
  /** RAG documents bucket — granted read access + S3 event subscription. */
  documentsBucket: s3.IBucket;
  /** RAG assistants table — granted read/write data access. */
  assistantsTable: dynamodb.ITable;
  /** Vector bucket name — used for IAM grants and Lambda env. */
  vectorBucketName: string;
  /** Vector index name — used for IAM grants and Lambda env. */
  vectorIndexName: string;
}

/**
 * RagIngestionLambdaConstruct — DockerImage Lambda that processes
 * documents from S3, extracts text, chunks, generates embeddings via
 * Bedrock, and stores them in the S3 Vectors index.
 *
 * The image tag is read from
 * `/{prefix}/rag-ingestion/image-tag` (set by `push-to-ecr.sh`).
 * Logs go to a 1-week-retention CloudWatch log group.
 *
 * IAM:
 *   - Read on the documents bucket
 *   - Read/write on the assistants table
 *   - Full s3vectors:* on the supplied vector bucket + index ARNs
 *   - bedrock:InvokeModel on
 *     `arn:aws:bedrock:{region}::foundation-model/{embeddingModel}*`
 *
 * S3 event subscription on `assistants/` prefix in the documents
 * bucket triggers the Lambda on object create.
 *
 * SSM publication: `/{prefix}/rag/ingestion-lambda-arn` (consumed by
 * downstream services that need to invoke the Lambda).
 */
export class RagIngestionLambdaConstruct extends Construct {
  public readonly lambda: lambda.DockerImageFunction;

  constructor(
    scope: Construct,
    id: string,
    props: RagIngestionLambdaConstructProps,
  ) {
    super(scope, id);

    const {
      config,
      documentsBucket,
      assistantsTable,
      vectorBucketName,
      vectorIndexName,
    } = props;

    const imageTag = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/rag-ingestion/image-tag`,
    );

    const ecrRepository = ecr.Repository.fromRepositoryName(
      this,
      'RagIngestionRepository',
      getResourceName(config, 'rag-ingestion'),
    );

    const ingestionLogGroup = new logs.LogGroup(this, 'RagIngestionLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.lambda = new lambda.DockerImageFunction(this, 'RagIngestionLambda', {
      functionName: getResourceName(config, 'rag-ingestion'),
      code: lambda.DockerImageCode.fromEcr(ecrRepository, {
        tagOrDigest: imageTag,
      }),
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(config.ragIngestion.lambdaTimeout),
      memorySize: config.ragIngestion.lambdaMemorySize,
      logGroup: ingestionLogGroup,
      environment: {
        S3_ASSISTANTS_DOCUMENTS_BUCKET_NAME: documentsBucket.bucketName,
        DYNAMODB_ASSISTANTS_TABLE_NAME: assistantsTable.tableName,
        S3_ASSISTANTS_VECTOR_STORE_BUCKET_NAME: vectorBucketName,
        S3_ASSISTANTS_VECTOR_STORE_INDEX_NAME: vectorIndexName,
        BEDROCK_REGION: config.awsRegion,
      },
      description:
        'RAG document ingestion pipeline - processes documents from S3, extracts text, chunks, generates embeddings, stores in S3 vector store',
    });

    // IAM grants
    documentsBucket.grantRead(this.lambda);
    assistantsTable.grantReadWriteData(this.lambda);

    this.lambda.addToRolePolicy(
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

    this.lambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${config.awsRegion}::foundation-model/${config.ragIngestion.embeddingModel}*`,
        ],
      }),
    );

    // NOTE: S3 event notification is NOT wired here when the construct
    // lives in a different stack from the bucket (cross-stack S3
    // notifications create a circular dependency in CDK). The parent
    // stack that owns the bucket must call
    // `bucket.addEventNotification(...)` with this Lambda as the
    // destination. When both live in the same stack (legacy
    // RagIngestionStack), the notification is wired by the stack itself.

    new ssm.StringParameter(this, 'IngestionLambdaArnParameter', {
      parameterName: `/${config.projectPrefix}/rag/ingestion-lambda-arn`,
      stringValue: this.lambda.functionArn,
      description: 'RAG ingestion Lambda ARN',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
