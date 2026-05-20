import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { AppConfig, getResourceName, getRemovalPolicy } from '../../config';

export interface AdminTablesConstructProps {
  config: AppConfig;
}

/**
 * AdminTablesConstruct — DynamoDB tables backing user-facing settings
 * and admin-managed surfaces.
 *
 *   - UserSettingsTable    — per-user UI settings and preferences
 *   - UserMenuLinksTable   — admin-managed links rendered in the SPA
 *                            user menu (fixed PK `USER_MENU_LINKS`,
 *                            SK `LINK#<uuid>`)
 */
export class AdminTablesConstruct extends Construct {
  public readonly userSettingsTable: dynamodb.Table;
  public readonly userMenuLinksTable: dynamodb.Table;

  constructor(
    scope: Construct,
    id: string,
    props: AdminTablesConstructProps,
  ) {
    super(scope, id);

    const { config } = props;

    this.userSettingsTable = new dynamodb.Table(this, 'UserSettingsTable', {
      tableName: getResourceName(config, 'user-settings'),
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    new ssm.StringParameter(this, 'UserSettingsTableNameParameter', {
      parameterName: `/${config.projectPrefix}/settings/user-settings-table-name`,
      stringValue: this.userSettingsTable.tableName,
      description: 'User settings DynamoDB table name',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'UserSettingsTableArnParameter', {
      parameterName: `/${config.projectPrefix}/settings/user-settings-table-arn`,
      stringValue: this.userSettingsTable.tableArn,
      description: 'User settings DynamoDB table ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    this.userMenuLinksTable = new dynamodb.Table(this, 'UserMenuLinksTable', {
      tableName: getResourceName(config, 'user-menu-links'),
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: getRemovalPolicy(config),
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    new ssm.StringParameter(this, 'UserMenuLinksTableNameParameter', {
      parameterName: `/${config.projectPrefix}/admin/user-menu-links-table-name`,
      stringValue: this.userMenuLinksTable.tableName,
      description: 'User-menu links DynamoDB table name',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'UserMenuLinksTableArnParameter', {
      parameterName: `/${config.projectPrefix}/admin/user-menu-links-table-arn`,
      stringValue: this.userMenuLinksTable.tableArn,
      description: 'User-menu links DynamoDB table ARN',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
