"""Smoke tests to verify conftest fixtures wire up correctly."""

import sys
import os

# Make the tests directory importable so we can use the conftest helpers
_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)

from conftest import make_provider_record, make_ssm_change_event


def test_lambda_module_loads(lambda_module):
    """The lambda_function module loads with mocked clients."""
    assert hasattr(lambda_module, "lambda_handler")
    assert hasattr(lambda_module, "dynamodb")
    assert hasattr(lambda_module, "bedrock_agentcore")


def test_dynamodb_table_exists(dynamodb_client):
    """The moto DynamoDB table was created."""
    resp = dynamodb_client.describe_table(TableName="test-auth-providers")
    assert resp["Table"]["TableName"] == "test-auth-providers"


def test_ssm_params_populated(ssm_client):
    """SSM parameters are pre-populated."""
    resp = ssm_client.get_parameter(Name="/test-project/inference-api/image-tag")
    assert resp["Parameter"]["Value"] == "v1.0.0"


def test_sns_topic_exists(sns_client):
    """The SNS topic was created in moto."""
    resp = sns_client.list_topics()
    arns = [t["TopicArn"] for t in resp["Topics"]]
    assert any("test-runtime-update-alerts" in a for a in arns)


def test_bedrock_client_is_mock(bedrock_client):
    """The bedrock-agentcore-control client is a MagicMock."""
    resp = bedrock_client.get_agent_runtime(agentRuntimeId="rt-123")
    assert resp["roleArn"] == "arn:aws:iam::123456789012:role/test-runtime-role"


def test_make_provider_record(dynamodb_client):
    """make_provider_record inserts into the DynamoDB table."""
    make_provider_record(dynamodb_client, "prov-1")
    resp = dynamodb_client.get_item(
        TableName="test-auth-providers",
        Key={
            "PK": {"S": "AUTH_PROVIDER#prov-1"},
            "SK": {"S": "AUTH_PROVIDER#prov-1"},
        },
    )
    assert resp["Item"]["providerId"]["S"] == "prov-1"


def test_make_ssm_change_event():
    """make_ssm_change_event returns a well-formed event."""
    event = make_ssm_change_event()
    assert event["source"] == "aws.ssm"
    assert event["detail"]["name"] == "/test-project/inference-api/image-tag"


def test_lambda_handler_no_providers(lambda_module):
    """lambda_handler returns 200 with no providers to update."""
    event = make_ssm_change_event()
    result = lambda_module.lambda_handler(event, {})
    assert result["statusCode"] == 200
