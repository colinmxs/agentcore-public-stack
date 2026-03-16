"""DynamoDB repository for API keys.

Table schema:
    PK: USER#<user_id>
    SK: KEY#<key_id>

    GSI: KeyHashIndex
        keyHash (partition key, no sort key — each hash is unique)
        Projection: ALL

Attributes:
    keyId, userId, name, keyHash, keyPrefix,
    createdAt, expiresAt, lastUsedAt
"""

import hashlib
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class ApiKeyRepository:
    """DynamoDB repository for API key CRUD operations."""

    def __init__(self):
        self.dynamodb = boto3.resource("dynamodb")
        self.table_name = os.environ.get(
            "DYNAMODB_API_KEYS_TABLE_NAME", "ApiKeys"
        )
        self.table = self.dynamodb.Table(self.table_name)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def hash_key(raw_key: str) -> str:
        """SHA-256 hash of the raw API key for secure storage."""
        return hashlib.sha256(raw_key.encode()).hexdigest()

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def create_key(self, item: Dict[str, Any]) -> None:
        """Put a new API key item into the table."""
        try:
            self.table.put_item(
                Item=item,
                ConditionExpression="attribute_not_exists(PK) AND attribute_not_exists(SK)",
            )
        except ClientError as e:
            logger.error(f"Failed to create API key: {e}")
            raise

    async def delete_key(self, user_id: str, key_id: str) -> bool:
        """Delete an API key. Returns True if deleted."""
        try:
            self.table.delete_item(
                Key={"PK": f"USER#{user_id}", "SK": f"KEY#{key_id}"},
                ConditionExpression="attribute_exists(PK)",
            )
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return False
            logger.error(f"Failed to delete API key {key_id}: {e}")
            raise

    async def update_last_used(self, user_id: str, key_id: str) -> None:
        """Stamp lastUsedAt on a key after successful validation."""
        try:
            self.table.update_item(
                Key={"PK": f"USER#{user_id}", "SK": f"KEY#{key_id}"},
                UpdateExpression="SET lastUsedAt = :ts",
                ExpressionAttributeValues={
                    ":ts": datetime.now(timezone.utc).isoformat(),
                },
            )
        except ClientError as e:
            # Non-critical — log and move on
            logger.warning(f"Failed to update lastUsedAt for key {key_id}: {e}")

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get_key(self, user_id: str, key_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single key item by user_id + key_id."""
        resp = self.table.get_item(
            Key={"PK": f"USER#{user_id}", "SK": f"KEY#{key_id}"}
        )
        return resp.get("Item")

    async def get_key_for_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get the API key belonging to a user (one key per user)."""
        resp = self.table.query(
            KeyConditionExpression=Key("PK").eq(f"USER#{user_id}"),
            Limit=1,
        )
        items = resp.get("Items", [])
        return items[0] if items else None

    async def get_key_by_hash(self, key_hash: str) -> Optional[Dict[str, Any]]:
        """Look up a key by its hash via the KeyHashIndex GSI."""
        resp = self.table.query(
            IndexName="KeyHashIndex",
            KeyConditionExpression=Key("keyHash").eq(key_hash),
            Limit=1,
        )
        items = resp.get("Items", [])
        return items[0] if items else None

    # ------------------------------------------------------------------
    # Rate limiting
    # ------------------------------------------------------------------

    async def check_rate_limit(
        self,
        key_id: str,
        window_seconds: int = 60,
        max_requests: int = 60,
    ) -> bool:
        """Sliding-window rate limit using atomic DynamoDB counters.

        Stores a counter item per key per time window. TTL auto-cleans
        expired windows. Fail-open: returns True on any error.

        Returns True if the request is allowed, False if rate-limited.
        """
        now = int(time.time())
        window_key = now // window_seconds

        try:
            resp = self.table.update_item(
                Key={"PK": f"RATE#{key_id}", "SK": f"WIN#{window_key}"},
                UpdateExpression=(
                    "SET #cnt = if_not_exists(#cnt, :zero) + :one, #ttl = :ttl"
                ),
                ExpressionAttributeNames={"#cnt": "requestCount", "#ttl": "ttl"},
                ExpressionAttributeValues={
                    ":zero": 0,
                    ":one": 1,
                    ":ttl": now + (window_seconds * 2),
                },
                ReturnValues="UPDATED_NEW",
            )
            count = int(resp["Attributes"]["requestCount"])
            return count <= max_requests
        except ClientError as exc:
            logger.warning(f"Rate limit check failed for key {key_id}: {exc}")
            return True  # fail-open


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_repo: Optional[ApiKeyRepository] = None


def get_api_key_repository() -> ApiKeyRepository:
    global _repo
    if _repo is None:
        _repo = ApiKeyRepository()
    return _repo
