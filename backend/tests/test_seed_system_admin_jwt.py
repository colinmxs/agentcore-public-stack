"""Tests for seed_system_admin_jwt_roles in seed_bootstrap_data.py."""

import sys
import os
import pytest
import boto3
from moto import mock_aws

# Add the scripts directory to the path so we can import the module
sys.path.insert(
    0,
    os.path.join(os.path.dirname(__file__), "..", "scripts"),
)

from seed_bootstrap_data import seed_system_admin_jwt_roles  # noqa: E402

TABLE_NAME = "test-app-roles"
REGION = "us-east-1"


@pytest.fixture
def dynamodb_table():
    """Create a mock DynamoDB table matching the app-roles schema."""
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name=REGION)
        table = dynamodb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
                {"AttributeName": "GSI1PK", "AttributeType": "S"},
                {"AttributeName": "GSI1SK", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "JwtRoleMappingIndex",
                    "KeySchema": [
                        {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        table.meta.client.get_waiter("table_exists").wait(TableName=TABLE_NAME)
        yield table


class TestSeedSystemAdminJwtRoles:
    def test_creates_full_role_when_missing(self, dynamodb_table):
        """When system_admin role doesn't exist, creates DEFINITION + JWT_MAPPING + grants."""
        result = seed_system_admin_jwt_roles(TABLE_NAME, REGION, "Admin")

        assert result.created == 1
        assert result.failed == 0

        # Verify DEFINITION item
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "DEFINITION"}
        )
        item = resp["Item"]
        assert item["roleId"] == "system_admin"
        assert item["jwtRoleMappings"] == ["Admin"]
        assert item["grantedTools"] == ["*"]
        assert item["grantedModels"] == ["*"]
        assert item["isSystemRole"] is True

        # Verify JWT_MAPPING item with GSI keys
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "JWT_MAPPING#Admin"}
        )
        mapping = resp["Item"]
        assert mapping["GSI1PK"] == "JWT_ROLE#Admin"
        assert mapping["GSI1SK"] == "ROLE#system_admin"
        assert mapping["roleId"] == "system_admin"
        assert mapping["enabled"] is True

        # Verify TOOL_GRANT item
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "TOOL_GRANT#*"}
        )
        assert "Item" in resp

        # Verify MODEL_GRANT item
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "MODEL_GRANT#*"}
        )
        assert "Item" in resp

    def test_skips_when_mapping_already_exists(self, dynamodb_table):
        """When system_admin already has the correct mapping, skip."""
        # Seed first
        seed_system_admin_jwt_roles(TABLE_NAME, REGION, "Admin")

        # Seed again with same value
        result = seed_system_admin_jwt_roles(TABLE_NAME, REGION, "Admin")

        assert result.skipped == 1
        assert result.created == 0
        assert result.failed == 0

    def test_updates_when_mapping_differs(self, dynamodb_table):
        """When system_admin has a different mapping, replace it."""
        # Seed with initial value
        seed_system_admin_jwt_roles(TABLE_NAME, REGION, "OldRole")

        # Verify initial mapping
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "JWT_MAPPING#OldRole"}
        )
        assert "Item" in resp

        # Update to new value
        result = seed_system_admin_jwt_roles(TABLE_NAME, REGION, "NewRole")

        assert result.created == 1
        assert result.failed == 0

        # Old mapping should be gone
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "JWT_MAPPING#OldRole"}
        )
        assert "Item" not in resp

        # New mapping should exist with correct GSI keys
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "JWT_MAPPING#NewRole"}
        )
        mapping = resp["Item"]
        assert mapping["GSI1PK"] == "JWT_ROLE#NewRole"
        assert mapping["GSI1SK"] == "ROLE#system_admin"
        assert mapping["roleId"] == "system_admin"

        # DEFINITION should reflect new mapping
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "DEFINITION"}
        )
        assert resp["Item"]["jwtRoleMappings"] == ["NewRole"]

    def test_gsi_queryable_after_creation(self, dynamodb_table):
        """JWT_MAPPING items should be queryable via the GSI."""
        seed_system_admin_jwt_roles(TABLE_NAME, REGION, "DotNetDevelopers")

        # Query the GSI as AppRoleService would
        resp = dynamodb_table.query(
            IndexName="JwtRoleMappingIndex",
            KeyConditionExpression=(
                boto3.dynamodb.conditions.Key("GSI1PK").eq("JWT_ROLE#DotNetDevelopers")
            ),
        )

        items = resp["Items"]
        assert len(items) == 1
        assert items[0]["roleId"] == "system_admin"
        assert items[0]["GSI1SK"] == "ROLE#system_admin"
