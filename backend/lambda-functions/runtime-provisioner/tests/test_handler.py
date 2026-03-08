"""
Tests for runtime-provisioner lambda_handler event routing.
"""
import sys
import os

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)

from conftest import make_insert_event, make_modify_event, make_remove_event


def test_insert_event_routes_to_handle_insert(lambda_module):
    """INSERT event calls create_runtime and updates DynamoDB."""
    mod, bedrock = lambda_module
    event = make_insert_event("provider1", "https://auth.example.com", "client-1")
    mod.lambda_handler(event, {})

    bedrock.create_agent_runtime.assert_called_once()


def test_modify_event_routes_to_handle_modify(lambda_module):
    """MODIFY event with JWT changes triggers update_agent_runtime."""
    mod, bedrock = lambda_module
    event = make_modify_event(
        "provider1",
        old_issuer_url="https://old.example.com",
        new_issuer_url="https://new.example.com",
        old_client_id="old-client",
        new_client_id="new-client",
    )
    mod.lambda_handler(event, {})

    bedrock.get_agent_runtime.assert_called_once()
    bedrock.update_agent_runtime.assert_called_once()


def test_remove_event_routes_to_handle_remove(lambda_module):
    """REMOVE event triggers delete_agent_runtime."""
    mod, bedrock = lambda_module
    event = make_remove_event("provider1", runtime_id="test-runtime-id")
    mod.lambda_handler(event, {})

    bedrock.delete_agent_runtime.assert_called_once_with(
        agentRuntimeId="test-runtime-id"
    )


def test_unknown_event_type_ignored(lambda_module):
    """Event with unknown eventName logs warning but doesn't crash."""
    mod, bedrock = lambda_module
    event = {
        "Records": [
            {
                "eventName": "UNKNOWN",
                "dynamodb": {"NewImage": {}},
            }
        ]
    }
    result = mod.lambda_handler(event, {})

    assert result["statusCode"] == 200
    bedrock.create_agent_runtime.assert_not_called()
    bedrock.update_agent_runtime.assert_not_called()
    bedrock.delete_agent_runtime.assert_not_called()


def test_multiple_records_processed(lambda_module):
    """Event with 3 records (INSERT, MODIFY, REMOVE) all get processed."""
    mod, bedrock = lambda_module

    insert_rec = make_insert_event(
        "prov-a", "https://auth.example.com", "client-a"
    )["Records"][0]
    modify_rec = make_modify_event(
        "prov-b",
        old_issuer_url="https://old.example.com",
        new_issuer_url="https://new.example.com",
        old_client_id="old-b",
        new_client_id="new-b",
    )["Records"][0]
    remove_rec = make_remove_event(
        "prov-c", runtime_id="rt-c"
    )["Records"][0]

    event = {"Records": [insert_rec, modify_rec, remove_rec]}
    mod.lambda_handler(event, {})

    assert bedrock.create_agent_runtime.call_count == 1
    assert bedrock.update_agent_runtime.call_count == 1
    assert bedrock.delete_agent_runtime.call_count == 1


def test_handler_returns_200_on_success(lambda_module):
    """Handler returns statusCode 200 on successful processing."""
    mod, _ = lambda_module
    event = make_insert_event("prov-ok", "https://auth.example.com", "cid")
    result = mod.lambda_handler(event, {})

    assert result["statusCode"] == 200


def test_handler_reraises_on_exception(lambda_module):
    """If the for-loop itself blows up, the handler re-raises."""
    mod, _ = lambda_module
    # Records must be iterable; passing a non-iterable triggers TypeError
    # inside the try block before any handle_* is called.
    event = {"Records": "not-a-list"}
    import pytest

    with pytest.raises(TypeError):
        mod.lambda_handler(event, {})
