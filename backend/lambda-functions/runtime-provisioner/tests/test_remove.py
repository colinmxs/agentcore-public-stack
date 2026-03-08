"""Tests for handle_remove (REMOVE/delete runtime flow)."""

import os
import sys

import pytest
from botocore.exceptions import ClientError

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)

from conftest import make_remove_event, PROJECT_PREFIX


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestRemoveDeletesRuntime:
    """Verify runtime deletion via bedrock."""

    def test_remove_deletes_runtime(self, lambda_module):
        mod, bedrock = lambda_module

        event = make_remove_event(provider_id="prov1", runtime_id="rt-abc")
        mod.lambda_handler(event, {})

        bedrock.delete_agent_runtime.assert_called_once_with(agentRuntimeId="rt-abc")


class TestRemoveSSM:
    """SSM parameter cleanup on remove."""

    def test_remove_deletes_ssm_parameter(self, lambda_module):
        mod, bedrock = lambda_module
        pid = "prov-ssm"
        param_name = f"/{PROJECT_PREFIX}/runtimes/{pid}/arn"

        # Pre-create the SSM parameter
        mod.ssm.put_parameter(
            Name=param_name,
            Value="arn:aws:bedrock:us-east-1:123456789012:agent-runtime/rt-xyz",
            Type="String",
        )

        event = make_remove_event(provider_id=pid, runtime_id="rt-xyz")
        mod.lambda_handler(event, {})

        # Parameter should be gone
        with pytest.raises(ClientError) as exc_info:
            mod.ssm.get_parameter(Name=param_name)
        assert exc_info.value.response["Error"]["Code"] == "ParameterNotFound"

    def test_remove_ssm_parameter_not_found_ok(self, lambda_module):
        """SSM ParameterNotFound during cleanup does not crash."""
        mod, bedrock = lambda_module
        pid = "prov-ssm-missing"

        # Do NOT create the SSM parameter — it shouldn't exist
        event = make_remove_event(provider_id=pid, runtime_id="rt-missing")
        # Should not raise
        mod.lambda_handler(event, {})


class TestRemoveGracefulErrors:
    """Error handling in remove path."""

    def test_remove_handles_resource_not_found(self, lambda_module):
        """ResourceNotFoundException from delete_agent_runtime → no crash."""
        mod, bedrock = lambda_module

        bedrock.delete_agent_runtime.side_effect = ClientError(
            {"Error": {"Code": "ResourceNotFoundException", "Message": "Not found"}},
            "DeleteAgentRuntime",
        )

        event = make_remove_event(provider_id="prov-gone", runtime_id="rt-gone")
        # Should not raise
        mod.lambda_handler(event, {})

    def test_remove_missing_runtime_id_skips(self, lambda_module):
        """No agentcoreRuntimeId → no delete attempt."""
        mod, bedrock = lambda_module

        event = make_remove_event(provider_id="prov-noid")  # runtime_id=None
        mod.lambda_handler(event, {})

        bedrock.delete_agent_runtime.assert_not_called()

    def test_remove_does_not_reraise(self, lambda_module):
        """Any error in handle_remove is caught (doesn't propagate)."""
        mod, bedrock = lambda_module

        bedrock.delete_agent_runtime.side_effect = ClientError(
            {"Error": {"Code": "InternalServerError", "Message": "boom"}},
            "DeleteAgentRuntime",
        )

        event = make_remove_event(provider_id="prov-err", runtime_id="rt-err")
        # Should NOT raise despite InternalServerError
        mod.lambda_handler(event, {})
