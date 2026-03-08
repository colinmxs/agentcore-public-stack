"""
Tests for runtime-provisioner INSERT / create-runtime flow.
"""
import sys
import os
from urllib.parse import quote

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)

from conftest import make_insert_event, PROJECT_PREFIX

RUNTIME_ARN = "arn:aws:bedrock:us-east-1:123456789012:agent-runtime/test-runtime-id"
RUNTIME_ID = "test-runtime-id"


def _get_ddb_item(mod, provider_id):
    """Read the auth-provider item back from moto DynamoDB."""
    resp = mod.dynamodb.get_item(
        TableName="test-auth-providers",
        Key={
            "PK": {"S": f"AUTH_PROVIDER#{provider_id}"},
            "SK": {"S": f"AUTH_PROVIDER#{provider_id}"},
        },
    )
    return resp.get("Item")


# ── 1. Happy-path: bedrock create called ──────────────────────────────────

def test_insert_creates_runtime(lambda_module):
    """INSERT event → bedrock create_agent_runtime is called."""
    mod, bedrock = lambda_module
    event = make_insert_event("prov1", "https://issuer.example.com", "cid-1")
    mod.lambda_handler(event, {})

    bedrock.create_agent_runtime.assert_called_once()


# ── 2. DynamoDB updated with runtime info ─────────────────────────────────

def test_insert_updates_dynamodb_with_runtime_info(lambda_module):
    """After create, DynamoDB has runtime ARN, ID, endpoint URL, status READY."""
    mod, _ = lambda_module
    event = make_insert_event("prov2", "https://issuer.example.com", "cid-2")
    mod.lambda_handler(event, {})

    item = _get_ddb_item(mod, "prov2")
    assert item is not None
    assert item["agentcoreRuntimeArn"]["S"] == RUNTIME_ARN
    assert item["agentcoreRuntimeId"]["S"] == RUNTIME_ID
    assert item["agentcoreRuntimeStatus"]["S"] == "READY"
    assert "agentcoreRuntimeEndpointUrl" in item


# ── 3. SSM param stored ──────────────────────────────────────────────────

def test_insert_stores_runtime_arn_in_ssm(lambda_module):
    """SSM param /{prefix}/runtimes/{provider_id}/arn is created."""
    mod, _ = lambda_module
    event = make_insert_event("prov3", "https://issuer.example.com", "cid-3")
    mod.lambda_handler(event, {})

    ssm_resp = mod.ssm.get_parameter(
        Name=f"/{PROJECT_PREFIX}/runtimes/prov3/arn"
    )
    assert ssm_resp["Parameter"]["Value"] == RUNTIME_ARN


# ── 4. Runtime name format ────────────────────────────────────────────────

def test_insert_runtime_name_format(lambda_module):
    """Runtime name uses underscores: {safe_prefix}_runtime_{safe_provider_id}."""
    mod, bedrock = lambda_module
    event = make_insert_event("my-provider", "https://issuer.example.com", "cid")
    mod.lambda_handler(event, {})

    call_kwargs = bedrock.create_agent_runtime.call_args[1]
    name = call_kwargs["agentRuntimeName"]
    assert "_" in name
    assert "-" not in name
    expected = f"{PROJECT_PREFIX.replace('-', '_')}_runtime_my_provider"
    assert name == expected


# ── 5. JWT authorizer config ─────────────────────────────────────────────

def test_insert_jwt_authorizer_config(lambda_module):
    """CreateAgentRuntime has correct discoveryUrl and allowedAudience."""
    mod, bedrock = lambda_module
    event = make_insert_event("prov5", "https://issuer.example.com", "aud-5")
    mod.lambda_handler(event, {})

    call_kwargs = bedrock.create_agent_runtime.call_args[1]
    auth_cfg = call_kwargs["authorizerConfiguration"]["customJWTAuthorizer"]
    assert auth_cfg["discoveryUrl"] == "https://issuer.example.com/.well-known/openid-configuration"
    assert auth_cfg["allowedAudience"] == ["aud-5"]


# ── 6. Container image from SSM ──────────────────────────────────────────

def test_insert_container_image_from_ssm(lambda_module):
    """Container URI built from SSM ecr-repository-uri + image-tag."""
    mod, bedrock = lambda_module
    event = make_insert_event("prov6", "https://issuer.example.com", "cid-6")
    mod.lambda_handler(event, {})

    call_kwargs = bedrock.create_agent_runtime.call_args[1]
    uri = call_kwargs["agentRuntimeArtifact"]["containerConfiguration"]["containerUri"]
    assert uri == "123456789012.dkr.ecr.us-east-1.amazonaws.com/test-repo:latest"


# ── 7. Environment variables passed ──────────────────────────────────────

def test_insert_environment_variables_passed(lambda_module):
    """All 30+ env vars passed to CreateAgentRuntime."""
    mod, bedrock = lambda_module
    event = make_insert_event("prov7", "https://issuer.example.com", "cid-7")
    mod.lambda_handler(event, {})

    call_kwargs = bedrock.create_agent_runtime.call_args[1]
    env_vars = call_kwargs["environmentVariables"]
    assert len(env_vars) >= 30
    assert env_vars["PROJECT_NAME"] == PROJECT_PREFIX
    assert env_vars["PROVIDER_ID"] == "prov7"
    assert env_vars["ENABLE_AUTHENTICATION"] == "true"


# ── 8. Endpoint URL encoded ──────────────────────────────────────────────

def test_insert_endpoint_url_encoded(lambda_module):
    """Endpoint URL has URL-encoded runtime ARN."""
    mod, _ = lambda_module
    event = make_insert_event("prov8", "https://issuer.example.com", "cid-8")
    mod.lambda_handler(event, {})

    item = _get_ddb_item(mod, "prov8")
    endpoint = item["agentcoreRuntimeEndpointUrl"]["S"]
    encoded_arn = quote(RUNTIME_ARN, safe="")
    assert encoded_arn in endpoint
    assert endpoint.startswith("https://bedrock-agentcore.")
    assert endpoint.endswith("/invocations")


# ── 9. Failure updates DynamoDB with error ────────────────────────────────

def test_insert_failure_updates_dynamodb_error(lambda_module):
    """When bedrock create fails, DynamoDB gets FAILED status + error message."""
    mod, bedrock = lambda_module
    bedrock.create_agent_runtime.side_effect = Exception("Boom!")

    event = make_insert_event("prov9", "https://issuer.example.com", "cid-9")
    mod.lambda_handler(event, {})

    item = _get_ddb_item(mod, "prov9")
    assert item is not None
    assert item["agentcoreRuntimeStatus"]["S"] == "FAILED"
    assert "Boom!" in item["agentcoreRuntimeError"]["S"]


# ── 10. Failure does NOT re-raise ─────────────────────────────────────────

def test_insert_failure_does_not_reraise(lambda_module):
    """Error in handle_insert is caught; handler still returns 200."""
    mod, bedrock = lambda_module
    bedrock.create_agent_runtime.side_effect = Exception("kaboom")

    event = make_insert_event("prov10", "https://issuer.example.com", "cid-10")
    result = mod.lambda_handler(event, {})

    assert result["statusCode"] == 200


# ── 11. Discovery URL from issuer ────────────────────────────────────────

def test_insert_discovery_url_from_issuer(lambda_module):
    """Discovery URL is {issuerUrl}/.well-known/openid-configuration."""
    mod, bedrock = lambda_module
    event = make_insert_event("prov11", "https://login.example.com", "cid-11")
    mod.lambda_handler(event, {})

    call_kwargs = bedrock.create_agent_runtime.call_args[1]
    disc = call_kwargs["authorizerConfiguration"]["customJWTAuthorizer"]["discoveryUrl"]
    assert disc == "https://login.example.com/.well-known/openid-configuration"


# ── 12. Trailing slash stripped ───────────────────────────────────────────

def test_insert_issuer_url_trailing_slash_stripped(lambda_module):
    """Trailing slash on issuerUrl is removed before constructing discovery URL."""
    mod, bedrock = lambda_module
    event = make_insert_event("prov12", "https://login.example.com/", "cid-12")
    mod.lambda_handler(event, {})

    call_kwargs = bedrock.create_agent_runtime.call_args[1]
    disc = call_kwargs["authorizerConfiguration"]["customJWTAuthorizer"]["discoveryUrl"]
    assert disc == "https://login.example.com/.well-known/openid-configuration"
    assert "//." not in disc
