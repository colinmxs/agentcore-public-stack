import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { AppConfig, getResourceName, applyStandardTags } from './config';

export interface AgentCoreStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * Agent Core Stack - Managed Services for Agent Orchestration
 * 
 * This stack creates:
 * - DynamoDB table for agent state and configuration
 * - S3 bucket for agent artifacts (tools, outputs, logs)
 * - Lambda functions for agent orchestration
 * - Step Functions state machine for agent workflow execution
 * - IAM roles with least-privilege access
 * 
 * Dependencies:
 * - None (standalone managed services stack)
 */
export class AgentCoreStack extends cdk.Stack {
  public readonly agentStateTable: dynamodb.Table;
  public readonly agentArtifactsBucket: s3.Bucket;
  public readonly orchestrationFunction?: lambda.Function;
  public readonly workflowStateMachine?: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: AgentCoreStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Apply standard tags
    applyStandardTags(this, config);

    // ============================================================
    // DynamoDB Table for Agent State and Configuration
    // ============================================================
    
    this.agentStateTable = new dynamodb.Table(this, 'AgentStateTable', {
      tableName: getResourceName(config, 'agent-state'),
      partitionKey: {
        name: 'agentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: config.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: config.environment === 'prod',
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'ttl', // Enable TTL for automatic cleanup of old states
    });

    // Add GSI for querying by status
    this.agentStateTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying by user
    this.agentStateTable.addGlobalSecondaryIndex({
      indexName: 'UserIndex',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================================
    // S3 Bucket for Agent Artifacts
    // ============================================================
    
    this.agentArtifactsBucket = new s3.Bucket(this, 'AgentArtifactsBucket', {
      bucketName: getResourceName(config, 'agent-artifacts'),
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: config.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: config.environment !== 'prod',
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
        {
          id: 'TransitionToIA',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });

    // ============================================================
    // IAM Role for Lambda Functions
    // ============================================================
    
    const lambdaExecutionRole = new iam.Role(this, 'AgentLambdaExecutionRole', {
      roleName: getResourceName(config, 'agent-lambda-role'),
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Agent Core Lambda functions',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant DynamoDB access
    this.agentStateTable.grantReadWriteData(lambdaExecutionRole);

    // Grant S3 access
    this.agentArtifactsBucket.grantReadWrite(lambdaExecutionRole);

    // ============================================================
    // Lambda Function for Agent Orchestration
    // ============================================================
    
    this.orchestrationFunction = new lambda.Function(this, 'AgentOrchestrationFunction', {
      functionName: getResourceName(config, 'agent-orchestration'),
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('backend/src/agents', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          command: [
            'bash', '-c',
            'pip install --no-cache-dir -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      role: lambdaExecutionRole,
      memorySize: config.agentCore.lambdaMemory,
      timeout: cdk.Duration.seconds(config.agentCore.lambdaTimeout),
      environment: {
        AGENT_STATE_TABLE: this.agentStateTable.tableName,
        ARTIFACTS_BUCKET: this.agentArtifactsBucket.bucketName,
        PROJECT_PREFIX: config.projectPrefix,
        ENVIRONMENT: config.environment,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
    });

    // ============================================================
    // Step Functions State Machine (Optional)
    // ============================================================
    
    if (config.agentCore.enableStepFunctions) {
      // Define a simple workflow: Initialize → Execute → Finalize
      const initTask = new tasks.LambdaInvoke(this, 'InitializeAgent', {
        lambdaFunction: this.orchestrationFunction,
        payload: sfn.TaskInput.fromObject({
          action: 'initialize',
          'input.$': '$',
        }),
        resultPath: '$.initResult',
      });

      const executeTask = new tasks.LambdaInvoke(this, 'ExecuteAgent', {
        lambdaFunction: this.orchestrationFunction,
        payload: sfn.TaskInput.fromObject({
          action: 'execute',
          'input.$': '$',
        }),
        resultPath: '$.executeResult',
      });

      const finalizeTask = new tasks.LambdaInvoke(this, 'FinalizeAgent', {
        lambdaFunction: this.orchestrationFunction,
        payload: sfn.TaskInput.fromObject({
          action: 'finalize',
          'input.$': '$',
        }),
        resultPath: '$.finalizeResult',
      });

      // Define workflow
      const definition = initTask
        .next(executeTask)
        .next(finalizeTask);

      // Create state machine
      this.workflowStateMachine = new sfn.StateMachine(this, 'AgentWorkflowStateMachine', {
        stateMachineName: getResourceName(config, 'agent-workflow'),
        definition,
        timeout: cdk.Duration.minutes(30),
        tracingEnabled: true,
        logs: {
          destination: new logs.LogGroup(this, 'StateMachineLogGroup', {
            logGroupName: `/aws/vendedlogs/states/${getResourceName(config, 'agent-workflow')}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }),
          level: sfn.LogLevel.ALL,
        },
      });

      // Grant Step Functions permission to invoke Lambda
      this.orchestrationFunction.grantInvoke(this.workflowStateMachine);
    }

    // ============================================================
    // Export Resources to SSM Parameter Store
    // ============================================================
    
    new ssm.StringParameter(this, 'AgentStateTableNameParam', {
      parameterName: `/${config.projectPrefix}/agents/state-table-name`,
      stringValue: this.agentStateTable.tableName,
      description: 'DynamoDB table name for agent state',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'AgentStateTableArnParam', {
      parameterName: `/${config.projectPrefix}/agents/state-table-arn`,
      stringValue: this.agentStateTable.tableArn,
      description: 'DynamoDB table ARN for agent state',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'AgentArtifactsBucketNameParam', {
      parameterName: `/${config.projectPrefix}/agents/artifacts-bucket-name`,
      stringValue: this.agentArtifactsBucket.bucketName,
      description: 'S3 bucket name for agent artifacts',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'AgentArtifactsBucketArnParam', {
      parameterName: `/${config.projectPrefix}/agents/artifacts-bucket-arn`,
      stringValue: this.agentArtifactsBucket.bucketArn,
      description: 'S3 bucket ARN for agent artifacts',
      tier: ssm.ParameterTier.STANDARD,
    });

    if (this.orchestrationFunction) {
      new ssm.StringParameter(this, 'OrchestrationFunctionNameParam', {
        parameterName: `/${config.projectPrefix}/agents/orchestration-function-name`,
        stringValue: this.orchestrationFunction.functionName,
        description: 'Lambda function name for agent orchestration',
        tier: ssm.ParameterTier.STANDARD,
      });

      new ssm.StringParameter(this, 'OrchestrationFunctionArnParam', {
        parameterName: `/${config.projectPrefix}/agents/orchestration-function-arn`,
        stringValue: this.orchestrationFunction.functionArn,
        description: 'Lambda function ARN for agent orchestration',
        tier: ssm.ParameterTier.STANDARD,
      });
    }

    if (this.workflowStateMachine) {
      new ssm.StringParameter(this, 'WorkflowStateMachineArnParam', {
        parameterName: `/${config.projectPrefix}/agents/workflow-state-machine-arn`,
        stringValue: this.workflowStateMachine.stateMachineArn,
        description: 'Step Functions state machine ARN for agent workflow',
        tier: ssm.ParameterTier.STANDARD,
      });
    }

    // ============================================================
    // CloudFormation Outputs
    // ============================================================
    
    new cdk.CfnOutput(this, 'AgentStateTableName', {
      value: this.agentStateTable.tableName,
      description: 'DynamoDB table name for agent state',
      exportName: `${config.projectPrefix}-AgentStateTableName`,
    });

    new cdk.CfnOutput(this, 'AgentArtifactsBucketName', {
      value: this.agentArtifactsBucket.bucketName,
      description: 'S3 bucket name for agent artifacts',
      exportName: `${config.projectPrefix}-AgentArtifactsBucketName`,
    });

    if (this.orchestrationFunction) {
      new cdk.CfnOutput(this, 'OrchestrationFunctionName', {
        value: this.orchestrationFunction.functionName,
        description: 'Lambda function name for agent orchestration',
        exportName: `${config.projectPrefix}-OrchestrationFunctionName`,
      });
    }

    if (this.workflowStateMachine) {
      new cdk.CfnOutput(this, 'WorkflowStateMachineArn', {
        value: this.workflowStateMachine.stateMachineArn,
        description: 'Step Functions state machine ARN for agent workflow',
        exportName: `${config.projectPrefix}-WorkflowStateMachineArn`,
      });
    }
  }
}
