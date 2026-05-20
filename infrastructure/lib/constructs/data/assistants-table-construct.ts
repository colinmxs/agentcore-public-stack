import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

import { AppConfig, getRemovalPolicy, getResourceName } from '../../config';

export interface AssistantsTableConstructProps {
  config: AppConfig;
}

/**
 * AssistantsTableConstruct — DynamoDB table backing user-defined
 * assistants in app-api.
 *
 *   PK: USER#{userId}, SK: ASSISTANT#{assistantId}
 *
 * GSIs:
 *   OwnerStatusIndex      — list assistants by owner + status
 *   VisibilityStatusIndex — list public/shared assistants by status
 *   SharedWithIndex       — list assistants shared with a given user
 *                           (projection = ALL)
 *
 * Lives in this construct (rather than alongside other shared tables)
 * because it is currently created inline in `app-api-stack.ts` and
 * grants are wired through that stack's task role. Phase 3 may
 * relocate it into Platform when the service splits. For now the
 * construct gives the legacy stack a clean home for the table
 * definition without changing any CFN output.
 */
export class AssistantsTableConstruct extends Construct {
  public readonly table: dynamodb.Table;

  constructor(
    scope: Construct,
    id: string,
    props: AssistantsTableConstructProps,
  ) {
    super(scope, id);

    const { config } = props;

    this.table = new dynamodb.Table(this, 'AssistantsTable', {
      tableName: getResourceName(config, 'assistants'),
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'OwnerStatusIndex',
      partitionKey: { name: 'GSI_PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI_SK', type: dynamodb.AttributeType.STRING },
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'VisibilityStatusIndex',
      partitionKey: { name: 'GSI2_PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2_SK', type: dynamodb.AttributeType.STRING },
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'SharedWithIndex',
      partitionKey: { name: 'GSI3_PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI3_SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}
