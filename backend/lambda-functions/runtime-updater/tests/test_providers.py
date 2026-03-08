"""Tests for get_providers_with_runtimes — DynamoDB provider discovery."""

import sys
import os

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)
from conftest import make_provider_record, AUTH_PROVIDERS_TABLE


# ------------------------------------------------------------------
# 1. Two providers with runtimes → both returned
# ------------------------------------------------------------------

def test_returns_providers_with_runtimes(lambda_module, dynamodb_client):
    make_provider_record(dynamodb_client, "prov-a")
    make_provider_record(dynamodb_client, "prov-b")

    providers = lambda_module.get_providers_with_runtimes()
    assert len(providers) == 2
    ids = {p["provider_id"] for p in providers}
    assert ids == {"prov-a", "prov-b"}


# ------------------------------------------------------------------
# 2. FAILED status → excluded
# ------------------------------------------------------------------

def test_excludes_failed_providers(lambda_module, dynamodb_client):
    make_provider_record(dynamodb_client, "good", status="READY")
    make_provider_record(dynamodb_client, "bad", status="FAILED")

    providers = lambda_module.get_providers_with_runtimes()
    assert len(providers) == 1
    assert providers[0]["provider_id"] == "good"


# ------------------------------------------------------------------
# 3. Provider without agentcoreRuntimeId → excluded
# ------------------------------------------------------------------

def test_excludes_providers_without_runtime_id(lambda_module, dynamodb_client):
    # Insert manually without runtime id
    dynamodb_client.put_item(
        TableName=AUTH_PROVIDERS_TABLE,
        Item={
            "PK": {"S": "AUTH_PROVIDER#no-runtime"},
            "SK": {"S": "AUTH_PROVIDER#no-runtime"},
            "providerId": {"S": "no-runtime"},
            "agentcoreRuntimeStatus": {"S": "READY"},
            "displayName": {"S": "No Runtime Provider"},
        },
    )
    make_provider_record(dynamodb_client, "with-runtime")

    providers = lambda_module.get_providers_with_runtimes()
    assert len(providers) == 1
    assert providers[0]["provider_id"] == "with-runtime"


# ------------------------------------------------------------------
# 4. Empty table → empty list
# ------------------------------------------------------------------

def test_empty_table_returns_empty_list(lambda_module):
    providers = lambda_module.get_providers_with_runtimes()
    assert providers == []


# ------------------------------------------------------------------
# 5. Fields deserialized correctly
# ------------------------------------------------------------------

def test_provider_fields_deserialized(lambda_module, dynamodb_client):
    make_provider_record(
        dynamodb_client,
        "prov-1",
        runtime_id="rt-abc",
        runtime_arn="arn:aws:bedrock-agentcore:us-east-1:111:runtime/rt-abc",
        display_name="My Provider",
    )

    providers = lambda_module.get_providers_with_runtimes()
    assert len(providers) == 1
    p = providers[0]
    assert p["provider_id"] == "prov-1"
    assert p["runtime_id"] == "rt-abc"
    assert p["runtime_arn"] == "arn:aws:bedrock-agentcore:us-east-1:111:runtime/rt-abc"
    assert p["display_name"] == "My Provider"


# ------------------------------------------------------------------
# 6. Non-FAILED statuses are all included
# ------------------------------------------------------------------

def test_includes_non_failed_statuses(lambda_module, dynamodb_client):
    make_provider_record(dynamodb_client, "ready", status="READY")
    make_provider_record(dynamodb_client, "updating", status="UPDATING")
    make_provider_record(dynamodb_client, "update-failed", status="UPDATE_FAILED")

    providers = lambda_module.get_providers_with_runtimes()
    ids = {p["provider_id"] for p in providers}
    assert ids == {"ready", "updating", "update-failed"}


# ------------------------------------------------------------------
# 7. Pagination — at least >25 items returned when 30 inserted
# ------------------------------------------------------------------

def test_pagination_collects_all(lambda_module, dynamodb_client):
    for i in range(30):
        make_provider_record(dynamodb_client, f"prov-{i:03d}")

    providers = lambda_module.get_providers_with_runtimes()
    assert len(providers) == 30
