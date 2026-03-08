"""Tests for the runtime-updater Lambda handler and event flow."""

import json
import sys
import os
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)

from conftest import make_ssm_change_event, make_provider_record, PROJECT_PREFIX


def _setup_single_provider(lambda_module):
    """Insert one provider and return the valid SSM change event."""
    make_provider_record(lambda_module.dynamodb, "provider-1")
    return make_ssm_change_event()


def test_happy_path_single_provider(lambda_module):
    """One provider with runtime → bedrock update called, returns 200 with succeeded=1."""
    event = _setup_single_provider(lambda_module)

    with patch("lambda_function.time.sleep"):
        result = lambda_module.lambda_handler(event, {})

    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["succeeded"] == 1
    assert body["failed"] == 0
    assert body["total"] == 1
    lambda_module.bedrock_agentcore.get_agent_runtime.assert_called()
    lambda_module.bedrock_agentcore.update_agent_runtime.assert_called()


def test_happy_path_multiple_providers(lambda_module):
    """3 providers → all updated, correct counts."""
    make_provider_record(lambda_module.dynamodb, "provider-1")
    make_provider_record(lambda_module.dynamodb, "provider-2", runtime_id="rt-456")
    make_provider_record(lambda_module.dynamodb, "provider-3", runtime_id="rt-789")
    event = make_ssm_change_event()

    with patch("lambda_function.time.sleep"):
        result = lambda_module.lambda_handler(event, {})

    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["total"] == 3
    assert body["succeeded"] == 3
    assert body["failed"] == 0


def test_invalid_event_returns_400(lambda_module):
    """Wrong parameter name → returns statusCode 400."""
    event = make_ssm_change_event(parameter_name="/wrong/parameter/name")

    result = lambda_module.lambda_handler(event, {})

    assert result["statusCode"] == 400
    body = json.loads(result["body"])
    assert "error" in body


def test_no_providers_returns_200(lambda_module):
    """No providers in DynamoDB → returns 200 with 'No runtimes to update'."""
    event = make_ssm_change_event()

    result = lambda_module.lambda_handler(event, {})

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["message"] == "No runtimes to update"


def test_critical_failure_sends_sns_alert(lambda_module):
    """Force an exception → SNS publish called and exception re-raised."""
    event = make_ssm_change_event()
    make_provider_record(lambda_module.dynamodb, "provider-1")

    # Replace SNS with a MagicMock so we can inspect calls
    lambda_module.sns = MagicMock()

    # Force get_providers_with_runtimes to raise after it succeeds
    # by making get_container_image_uri fail (delete ECR repo SSM param)
    lambda_module.ssm.delete_parameter(
        Name=f"/{PROJECT_PREFIX}/inference-api/ecr-repository-uri"
    )

    with pytest.raises(ValueError):
        with patch("lambda_function.time.sleep"):
            lambda_module.lambda_handler(event, {})

    lambda_module.sns.publish.assert_called()
    # Verify the alert subject contains "CRITICAL"
    call_kwargs = lambda_module.sns.publish.call_args[1]
    assert "CRITICAL" in call_kwargs["Subject"]


def test_response_body_has_correct_counts(lambda_module):
    """Verify total, succeeded, failed in response body."""
    make_provider_record(lambda_module.dynamodb, "provider-1")
    make_provider_record(lambda_module.dynamodb, "provider-2", runtime_id="rt-456")
    event = make_ssm_change_event()

    with patch("lambda_function.time.sleep"):
        result = lambda_module.lambda_handler(event, {})

    body = json.loads(result["body"])
    assert body["message"] == "Runtime updates completed"
    assert body["total"] == 2
    assert body["succeeded"] == 2
    assert body["failed"] == 0


def test_mixed_success_failure_counts(lambda_module):
    """One provider succeeds, one fails → correct counts."""
    make_provider_record(lambda_module.dynamodb, "provider-1", runtime_id="rt-success")
    make_provider_record(lambda_module.dynamodb, "provider-2", runtime_id="rt-fail")
    event = make_ssm_change_event()

    error_response = {
        "Error": {"Code": "ValidationException", "Message": "Runtime not found"}
    }

    def get_runtime_side_effect(**kwargs):
        runtime_id = kwargs.get("agentRuntimeId", "")
        if runtime_id == "rt-fail":
            raise ClientError(error_response, "GetAgentRuntime")
        return {
            "agentRuntimeId": runtime_id,
            "agentRuntimeArn": f"arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/{runtime_id}",
            "roleArn": "arn:aws:iam::123456789012:role/test-runtime-role",
            "networkConfiguration": {"networkMode": "PUBLIC"},
            "agentRuntimeArtifact": {
                "containerConfiguration": {
                    "containerUri": "123456789012.dkr.ecr.us-east-1.amazonaws.com/test-repo:v0.9.0"
                }
            },
            "authorizerConfiguration": {
                "customJWTAuthorizer": {
                    "discoveryUrl": "https://example.com/.well-known/openid-configuration",
                    "allowedAudience": ["test-audience"],
                    "allowedClients": ["test-client-id"],
                }
            },
            "environmentVariables": {"ENV_VAR_1": "value1"},
            "status": "READY",
        }

    lambda_module.bedrock_agentcore.get_agent_runtime.side_effect = get_runtime_side_effect

    with patch("lambda_function.time.sleep"):
        result = lambda_module.lambda_handler(event, {})

    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["total"] == 2
    assert body["succeeded"] == 1
    assert body["failed"] == 1


def test_sends_update_summary_sns(lambda_module):
    """After updates complete, SNS publish called with summary."""
    make_provider_record(lambda_module.dynamodb, "provider-1")
    event = make_ssm_change_event()

    # Replace SNS with a MagicMock to inspect calls
    lambda_module.sns = MagicMock()

    with patch("lambda_function.time.sleep"):
        result = lambda_module.lambda_handler(event, {})

    assert result["statusCode"] == 200
    lambda_module.sns.publish.assert_called()
    call_kwargs = lambda_module.sns.publish.call_args[1]
    assert "Summary" in call_kwargs["Subject"] or "succeeded" in call_kwargs["Subject"]
    assert "v1.0.0" in call_kwargs["Message"]
