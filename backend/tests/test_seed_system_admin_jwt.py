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

from seed_bootstrap_data import (  # noqa: E402
    seed_system_admin_jwt_roles,
    seed_system_admin_role,
    seed_default_tools,
)

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


class TestSeedSystemAdminRole:
    def test_creates_role_with_grants(self, dynamodb_table):
        """Creates DEFINITION + TOOL_GRANT#* + MODEL_GRANT#* without JWT mapping."""
        result = seed_system_admin_role(TABLE_NAME, REGION)

        assert result.created == 1
        assert result.failed == 0

        # Verify DEFINITION
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "DEFINITION"}
        )
        item = resp["Item"]
        assert item["roleId"] == "system_admin"
        assert item["jwtRoleMappings"] == []
        assert item["grantedTools"] == ["*"]
        assert item["grantedModels"] == ["*"]
        assert item["isSystemRole"] is True
        assert item["priority"] == 1000

        # Verify TOOL_GRANT#*
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "TOOL_GRANT#*"}
        )
        grant = resp["Item"]
        assert grant["GSI2PK"] == "TOOL#*"
        assert grant["GSI2SK"] == "ROLE#system_admin"
        assert grant["enabled"] is True

        # Verify MODEL_GRANT#*
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "MODEL_GRANT#*"}
        )
        grant = resp["Item"]
        assert grant["GSI3PK"] == "MODEL#*"
        assert grant["GSI3SK"] == "ROLE#system_admin"
        assert grant["enabled"] is True

    def test_skips_when_role_exists(self, dynamodb_table):
        """Skips if system_admin DEFINITION already present."""
        seed_system_admin_role(TABLE_NAME, REGION)

        result = seed_system_admin_role(TABLE_NAME, REGION)

        assert result.skipped == 1
        assert result.created == 0

    def test_jwt_seeder_works_after_role_seeder(self, dynamodb_table):
        """JWT mapping seeder correctly updates role created without mappings."""
        seed_system_admin_role(TABLE_NAME, REGION)

        result = seed_system_admin_jwt_roles(TABLE_NAME, REGION, "Admin")
        assert result.created == 1

        # DEFINITION should now have the JWT mapping
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "DEFINITION"}
        )
        assert resp["Item"]["jwtRoleMappings"] == ["Admin"]

        # JWT_MAPPING item should exist
        resp = dynamodb_table.get_item(
            Key={"PK": "ROLE#system_admin", "SK": "JWT_MAPPING#Admin"}
        )
        assert resp["Item"]["GSI1PK"] == "JWT_ROLE#Admin"


class TestSeedDefaultTools:
    def test_creates_both_tools(self, dynamodb_table):
        """Creates fetch_url_content and create_visualization tool entries."""
        result = seed_default_tools(TABLE_NAME, REGION)

        assert result.created == 2
        assert result.failed == 0

        # Verify fetch_url_content
        resp = dynamodb_table.get_item(
            Key={"PK": "TOOL#fetch_url_content", "SK": "METADATA"}
        )
        item = resp["Item"]
        assert item["toolId"] == "fetch_url_content"
        assert item["displayName"] == "URL Fetcher"
        assert item["category"] == "search"
        assert item["protocol"] == "local"
        assert item["status"] == "active"
        assert item["enabledByDefault"] is True
        assert item["isPublic"] is False
        assert item["GSI1PK"] == "CATEGORY#search"
        assert item["GSI1SK"] == "TOOL#fetch_url_content"

        # Verify create_visualization
        resp = dynamodb_table.get_item(
            Key={"PK": "TOOL#create_visualization", "SK": "METADATA"}
        )
        item = resp["Item"]
        assert item["toolId"] == "create_visualization"
        assert item["displayName"] == "Charts & Graphs"
        assert item["category"] == "data"
        assert item["enabledByDefault"] is False
        assert item["GSI1PK"] == "CATEGORY#data"
        assert item["GSI1SK"] == "TOOL#create_visualization"

    def test_skips_existing_tools(self, dynamodb_table):
        """Skips tools that already exist."""
        seed_default_tools(TABLE_NAME, REGION)

        result = seed_default_tools(TABLE_NAME, REGION)

        assert result.skipped == 2
        assert result.created == 0

    def test_partial_skip(self, dynamodb_table):
        """Skips only the tool that already exists, creates the other."""
        # Pre-create one tool
        dynamodb_table.put_item(Item={
            "PK": "TOOL#fetch_url_content",
            "SK": "METADATA",
            "toolId": "fetch_url_content",
        })

        result = seed_default_tools(TABLE_NAME, REGION)

        assert result.created == 1
        assert result.skipped == 1
