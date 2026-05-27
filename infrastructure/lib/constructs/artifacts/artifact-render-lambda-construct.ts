import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';
import { Construct } from 'constructs';

import { AppConfig } from '../../config';

export interface ArtifactRenderLambdaConstructProps {
  config: AppConfig;
  /** Artifact metadata table — granted read access. */
  artifactsTable: dynamodb.ITable;
  /** Artifact content bucket — granted read access. */
  artifactsBucket: s3.IBucket;
  /** CSP `frame-ancestors` source list (space-separated). */
  frameAncestors: string;
}

/**
 * ArtifactRenderLambdaConstruct — JWT-validating, S3-fetching Lambda
 * that returns rendered artifact HTML with a strict CSP.
 *
 * The JWT-signing key (HMAC-SHA256) lives in PlatformStack
 * (`/{prefix}/artifacts/render-token-key-arn`); this construct reads
 * it via SSM and grants `secretsmanager:GetSecretValue` on the secret.
 *
 * Function URL with `AWS_IAM` auth — the URL is invoked by CloudFront
 * over Origin Access Control (configured in the distribution
 * construct). AWS_IAM blocks direct invocation at the
 * `lambdaUrl.amazonaws.com` hostname; CloudFront signs each origin
 * request with SigV4.
 *
 * The CSP `script-src` allow-list (`CSP_SCRIPT_SRC` env var) is kept
 * byte-identical with the CloudFront response-headers-policy in the
 * paired distribution construct (defense in depth — the Lambda emits
 * its own CSP and CloudFront adds another, both must list the same
 * trusted CDNs).
 *
 * ARM64 for cost; Python 3.12 to match the rest of the backend
 * toolchain.
 */
export class ArtifactRenderLambdaConstruct extends Construct {
  public readonly renderFunction: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;

  constructor(
    scope: Construct,
    id: string,
    props: ArtifactRenderLambdaConstructProps,
  ) {
    super(scope, id);

    const { config, artifactsTable, artifactsBucket, frameAncestors } = props;

    const renderTokenKeyArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/${config.projectPrefix}/artifacts/render-token-key-arn`,
    );

    // Auto-generated log group name (no `logGroupName`) so a
    // failed-deploy orphan can't collide with a redeploy. Default
    // CDK behaviour with feature flag
    // `@aws-cdk/aws-lambda:useCdkManagedLogGroup: true` would name
    // the log group `/aws/lambda/<functionName>`, which collides
    // with any orphan left behind by a previous failed deploy.
    const renderLogGroup = new logs.LogGroup(this, 'RenderFunctionLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.renderFunction = new lambda.Function(this, 'RenderFunction', {
      // Intentionally no `functionName` — let CDK auto-generate it
      // for the same orphan-collision reason as the log group above.
      // The deploy script resolves the function via SSM at
      // `/{prefix}/artifacts/render-function-name` (published below).
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler.handler',
      logGroup: renderLogGroup,
      code: lambda.Code.fromAsset(
        path.resolve(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          'backend',
          'src',
          'lambdas',
          'artifact_render',
        ),
      ),
      memorySize: 512,
      timeout: cdk.Duration.seconds(5),
      environment: {
        ARTIFACTS_BUCKET: artifactsBucket.bucketName,
        ARTIFACTS_TABLE: artifactsTable.tableName,
        RENDER_TOKEN_SECRET_ARN: renderTokenKeyArn,
        FRAME_ANCESTOR_ORIGIN: frameAncestors,
        // Pinned CSP allow-list. Must stay byte-identical with the
        // `script-src` line in the paired distribution construct's
        // response-headers-policy CSP (defense in depth).
        CSP_SCRIPT_SRC:
          "'self' 'unsafe-inline' https://cdn.tailwindcss.com https://esm.sh https://cdn.jsdelivr.net https://unpkg.com",
      },
    });

    artifactsBucket.grantRead(this.renderFunction);
    artifactsTable.grantReadData(this.renderFunction);

    this.renderFunction.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'ReadRenderTokenSecret',
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`${renderTokenKeyArn}*`],
      }),
    );

    this.functionUrl = this.renderFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    // Publish the auto-generated function name so the backend
    // workflow's code-deploy step can resolve which function to
    // call `aws lambda update-function-code` against. (We dropped
    // the deterministic `functionName` above to avoid collisions
    // with orphans from failed deploys.)
    new ssm.StringParameter(this, 'RenderFunctionNameParameter', {
      parameterName: `/${config.projectPrefix}/artifacts/render-function-name`,
      stringValue: this.renderFunction.functionName,
      description: 'Artifact render Lambda function name (CDK-auto-generated; consumed by backend workflow code-deploy step)',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
