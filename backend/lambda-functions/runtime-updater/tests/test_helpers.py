"""Tests for helper functions — deserialize_dynamodb_value, update_provider_status, update_provider_error."""

import sys
import os

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)
from conftest import make_provider_record, AUTH_PROVIDERS_TABLE


# ==================================================================
# deserialize_dynamodb_value
# ==================================================================

def test_deserialize_string(lambda_module):
    assert lambda_module.deserialize_dynamodb_value({"S": "hello"}) == "hello"


def test_deserialize_number(lambda_module):
    assert lambda_module.deserialize_dynamodb_value({"N": "42"}) == "42"


def test_deserialize_bool(lambda_module):
    assert lambda_module.deserialize_dynamodb_value({"BOOL": True}) is True


def test_deserialize_null(lambda_module):
    assert lambda_module.deserialize_dynamodb_value({"NULL": True}) is None


def test_deserialize_list(lambda_module):
    result = lambda_module.deserialize_dynamodb_value({"L": [{"S": "a"}, {"S": "b"}]})
    assert result == ["a", "b"]


def test_deserialize_map(lambda_module):
    result = lambda_module.deserialize_dynamodb_value({"M": {"k": {"S": "v"}}})
    assert result == {"k": "v"}


def test_deserialize_empty(lambda_module):
    assert lambda_module.deserialize_dynamodb_value({}) is None


def test_deserialize_none(lambda_module):
    assert lambda_module.deserialize_dynamodb_value(None) is None


# ==================================================================
# update_provider_status
# ==================================================================

def _get_item(dynamodb_client, provider_id):
    resp = dynamodb_client.get_item(
        TableName=AUTH_PROVIDERS_TABLE,
        Key={
            "PK": {"S": f"AUTH_PROVIDER#{provider_id}"},
            "SK": {"S": f"AUTH_PROVIDER#{provider_id}"},
        },
    )
    return resp.get("Item", {})


def test_update_provider_status(lambda_module, dynamodb_client):
    make_provider_record(dynamodb_client, "prov1")
    lambda_module.update_provider_status("prov1", "UPDATING")

    item = _get_item(dynamodb_client, "prov1")
    assert item["agentcoreRuntimeStatus"]["S"] == "UPDATING"


def test_update_provider_status_sets_updated_at(lambda_module, dynamodb_client):
    make_provider_record(dynamodb_client, "prov2")
    lambda_module.update_provider_status("prov2", "READY")

    item = _get_item(dynamodb_client, "prov2")
    assert "updatedAt" in item
    assert item["updatedAt"]["S"].endswith("Z")


# ==================================================================
# update_provider_error
# ==================================================================

def test_update_provider_error_sets_status(lambda_module, dynamodb_client):
    make_provider_record(dynamodb_client, "err1")
    lambda_module.update_provider_error("err1", "boom")

    item = _get_item(dynamodb_client, "err1")
    assert item["agentcoreRuntimeStatus"]["S"] == "UPDATE_FAILED"


def test_update_provider_error_stores_message(lambda_module, dynamodb_client):
    make_provider_record(dynamodb_client, "err2")
    lambda_module.update_provider_error("err2", "something went wrong")

    item = _get_item(dynamodb_client, "err2")
    assert item["agentcoreRuntimeError"]["S"] == "something went wrong"


def test_update_provider_error_truncates_long_message(lambda_module, dynamodb_client):
    make_provider_record(dynamodb_client, "err3")
    long_msg = "x" * 2000
    lambda_module.update_provider_error("err3", long_msg)

    item = _get_item(dynamodb_client, "err3")
    assert len(item["agentcoreRuntimeError"]["S"]) == 1000


# ==================================================================
# DynamoDB key format
# ==================================================================

def test_dynamodb_key_format(lambda_module, dynamodb_client):
    make_provider_record(dynamodb_client, "key-test")
    lambda_module.update_provider_status("key-test", "UPDATING")

    # Verify the key format by doing a direct get with the expected key
    item = _get_item(dynamodb_client, "key-test")
    assert item["PK"]["S"] == "AUTH_PROVIDER#key-test"
    assert item["SK"]["S"] == "AUTH_PROVIDER#key-test"
