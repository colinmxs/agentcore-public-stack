import * as cdk from 'aws-cdk-lib';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import { Construct } from 'constructs';

import { AppConfig, applyStandardTags } from './config';
import { AgentCoreGatewayConstruct } from './constructs/gateway/agentcore-gateway-construct';

export interface GatewayStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * Gateway Stack — AWS Bedrock AgentCore Gateway.
 *
 * As of the Phase 2 lift, the gateway resources live in
 * `constructs/gateway/agentcore-gateway-construct.ts`. This stack is a
 * thin assembly.
 *
 * Gateway Targets (search tools, etc.) are managed externally — the
 * MCP Lambda functions referenced by the gateway role's
 * `lambda:InvokeFunction` grant are owned by the external mcp-servers
 * repo, not this CDK app.
 */
export class GatewayStack extends cdk.Stack {
  public readonly gateway: agentcore.CfnGateway;

  constructor(scope: Construct, id: string, props: GatewayStackProps) {
    super(scope, id, props);

    const { config } = props;

    applyStandardTags(this, config);

    const gateway = new AgentCoreGatewayConstruct(this, 'Gateway', {
      config,
    });
    this.gateway = gateway.gateway;
  }
}
