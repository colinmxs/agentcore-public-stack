"""DynamoDB storage implementation for production

This storage backend uses AWS DynamoDB to store message metadata and cost summaries.
It's designed for production deployments with high scalability and performance.

Schema:
    SessionsMetadata Table:
        PK: USER#<user_id>
        SK: SESSION#<session_id>#MSG#<message_id>
        Attributes: cost, tokens, latency, modelInfo, pricingSnapshot, etc.
        GSI1: UserTimestampIndex (PK: USER#<user_id>, SK: <timestamp>)

    UserCostSummary Table:
        PK: USER#<user_id>
        SK: PERIOD#<YYYY-MM>
        Attributes: totalCost, totalRequests, totalTokens, modelBreakdown, etc.
"""

import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from decimal import Decimal

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    # Allow module to load without boto3 in development
    boto3 = None
    ClientError = Exception

from .metadata_storage import MetadataStorage


class DynamoDBStorage(MetadataStorage):
    """DynamoDB storage for production environments"""

    def __init__(self):
        """Initialize DynamoDB client and table references"""
        if boto3 is None:
            raise ImportError(
                "boto3 is required for DynamoDB storage. "
                "Install with: pip install boto3"
            )

        self.dynamodb = boto3.resource('dynamodb')

        # Get table names from environment
        self.sessions_metadata_table_name = os.environ.get(
            "DYNAMODB_SESSIONS_METADATA_TABLE_NAME",
            "SessionsMetadata"
        )
        self.cost_summary_table_name = os.environ.get(
            "DYNAMODB_COST_SUMMARY_TABLE_NAME",
            "UserCostSummary"
        )

        # Initialize table references
        self.sessions_metadata_table = self.dynamodb.Table(self.sessions_metadata_table_name)
        self.cost_summary_table = self.dynamodb.Table(self.cost_summary_table_name)

    def _convert_floats_to_decimal(self, obj: Any) -> Any:
        """
        Recursively convert floats to Decimal for DynamoDB

        DynamoDB doesn't support float type, requires Decimal instead.
        """
        if isinstance(obj, float):
            return Decimal(str(obj))
        elif isinstance(obj, dict):
            return {k: self._convert_floats_to_decimal(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_floats_to_decimal(item) for item in obj]
        else:
            return obj

    def _convert_decimal_to_float(self, obj: Any) -> Any:
        """
        Recursively convert Decimal to float for JSON serialization

        DynamoDB returns Decimal objects, which need to be converted back to float.
        """
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, dict):
            return {k: self._convert_decimal_to_float(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_decimal_to_float(item) for item in obj]
        else:
            return obj

    async def store_message_metadata(
        self,
        user_id: str,
        session_id: str,
        message_id: int,
        metadata: Dict[str, Any]
    ) -> None:
        """
        Store message metadata in DynamoDB

        Schema:
            PK: USER#<user_id>
            SK: SESSION#<session_id>#MSG#<message_id>
        """
        # Convert floats to Decimal for DynamoDB
        metadata_decimal = self._convert_floats_to_decimal(metadata)

        # Extract timestamp for GSI
        timestamp = metadata.get("attribution", {}).get("timestamp", datetime.now(timezone.utc).isoformat())

        # Calculate TTL (365 days from now)
        ttl = int((datetime.now(timezone.utc) + timedelta(days=365)).timestamp())

        # Build item
        item = {
            "PK": f"USER#{user_id}",
            "SK": f"SESSION#{session_id}#MSG#{message_id:05d}",
            "userId": user_id,
            "sessionId": session_id,
            "messageId": message_id,
            "timestamp": timestamp,
            "ttl": ttl,
            **metadata_decimal
        }

        # Add GSI attributes
        item["GSI1PK"] = f"USER#{user_id}"
        item["GSI1SK"] = timestamp

        # Store in DynamoDB
        try:
            self.sessions_metadata_table.put_item(Item=item)
        except ClientError as e:
            raise Exception(f"Failed to store message metadata: {e}")

    async def get_message_metadata(
        self,
        user_id: str,
        session_id: str,
        message_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get metadata for a specific message"""
        try:
            response = self.sessions_metadata_table.get_item(
                Key={
                    "PK": f"USER#{user_id}",
                    "SK": f"SESSION#{session_id}#MSG#{message_id:05d}"
                }
            )

            if "Item" not in response:
                return None

            # Convert Decimal back to float
            item = self._convert_decimal_to_float(response["Item"])

            # Remove DynamoDB-specific keys
            for key in ["PK", "SK", "GSI1PK", "GSI1SK", "ttl"]:
                item.pop(key, None)

            return item

        except ClientError as e:
            raise Exception(f"Failed to get message metadata: {e}")

    async def get_session_metadata(
        self,
        user_id: str,
        session_id: str
    ) -> List[Dict[str, Any]]:
        """Get all message metadata for a session"""
        try:
            response = self.sessions_metadata_table.query(
                KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
                ExpressionAttributeValues={
                    ":pk": f"USER#{user_id}",
                    ":sk_prefix": f"SESSION#{session_id}#MSG#"
                }
            )

            items = response.get("Items", [])

            # Convert Decimal to float and remove DynamoDB keys
            results = []
            for item in items:
                item_float = self._convert_decimal_to_float(item)
                for key in ["PK", "SK", "GSI1PK", "GSI1SK", "ttl"]:
                    item_float.pop(key, None)
                results.append(item_float)

            return results

        except ClientError as e:
            raise Exception(f"Failed to get session metadata: {e}")

    async def get_user_cost_summary(
        self,
        user_id: str,
        period: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get pre-aggregated cost summary for a user

        This provides <10ms quota checks by reading pre-aggregated data.
        """
        try:
            response = self.cost_summary_table.get_item(
                Key={
                    "PK": f"USER#{user_id}",
                    "SK": f"PERIOD#{period}"
                }
            )

            if "Item" not in response:
                return None

            # Convert Decimal back to float
            item = self._convert_decimal_to_float(response["Item"])

            # Remove DynamoDB-specific keys
            for key in ["PK", "SK"]:
                item.pop(key, None)

            return item

        except ClientError as e:
            raise Exception(f"Failed to get user cost summary: {e}")

    async def update_user_cost_summary(
        self,
        user_id: str,
        period: str,
        cost_delta: float,
        usage_delta: Dict[str, int],
        timestamp: str,
        model_id: Optional[str] = None,
        model_name: Optional[str] = None,
        cache_savings_delta: float = 0.0
    ) -> None:
        """
        Update pre-aggregated cost summary (atomic increment)

        Uses DynamoDB's atomic ADD operation for concurrent safety.
        Also updates per-model breakdown and cache savings for detailed cost analysis.
        """
        try:
            # Base update expression for aggregate totals
            update_expression = """
                ADD totalCost :cost,
                    totalRequests :one,
                    totalInputTokens :input,
                    totalOutputTokens :output,
                    totalCacheReadTokens :cacheRead,
                    totalCacheWriteTokens :cacheWrite,
                    cacheSavings :savings
                SET lastUpdated = :now,
                    periodStart = if_not_exists(periodStart, :periodStart),
                    periodEnd = if_not_exists(periodEnd, :periodEnd)
            """

            expression_values = {
                ":cost": Decimal(str(cost_delta)),
                ":one": 1,
                ":input": usage_delta.get("inputTokens", 0),
                ":output": usage_delta.get("outputTokens", 0),
                ":cacheRead": usage_delta.get("cacheReadInputTokens", 0),
                ":cacheWrite": usage_delta.get("cacheWriteInputTokens", 0),
                ":savings": Decimal(str(cache_savings_delta)),
                ":now": timestamp,
                ":periodStart": f"{period}-01T00:00:00Z",
                ":periodEnd": f"{period}-31T23:59:59Z"
            }

            self.cost_summary_table.update_item(
                Key={
                    "PK": f"USER#{user_id}",
                    "SK": f"PERIOD#{period}"
                },
                UpdateExpression=update_expression,
                ExpressionAttributeValues=expression_values
            )

            # Update per-model breakdown if model info is provided
            # This is a separate update to handle the nested map structure
            if model_id:
                await self._update_model_breakdown(
                    user_id=user_id,
                    period=period,
                    model_id=model_id,
                    model_name=model_name or model_id,
                    cost_delta=cost_delta,
                    usage_delta=usage_delta
                )

        except ClientError as e:
            raise Exception(f"Failed to update user cost summary: {e}")

    async def _update_model_breakdown(
        self,
        user_id: str,
        period: str,
        model_id: str,
        model_name: str,
        cost_delta: float,
        usage_delta: Dict[str, int]
    ) -> None:
        """
        Update per-model breakdown in cost summary

        Uses a multi-step approach to handle nested map structure in DynamoDB:
        1. First ensure modelBreakdown map exists (separate update to avoid path overlap)
        2. Then ensure the specific model entry exists
        3. Finally, atomically increment the model's counters
        """
        import logging
        logger = logging.getLogger(__name__)

        try:
            # Sanitize model_id for use as a DynamoDB map key
            # Replace dots, colons, and hyphens with underscores for DynamoDB compatibility
            safe_model_id = model_id.replace(".", "_").replace(":", "_").replace("-", "_")

            key = {
                "PK": f"USER#{user_id}",
                "SK": f"PERIOD#{period}"
            }

            # Step 1: Ensure modelBreakdown map exists (if not, create it)
            # This is a separate update to avoid path overlap issues
            try:
                self.cost_summary_table.update_item(
                    Key=key,
                    UpdateExpression="SET #mb = if_not_exists(#mb, :empty_map)",
                    ExpressionAttributeNames={"#mb": "modelBreakdown"},
                    ExpressionAttributeValues={":empty_map": {}}
                )
            except ClientError as e:
                # If the item doesn't exist yet, that's fine - the main update created it
                if e.response['Error']['Code'] != 'ConditionalCheckFailedException':
                    logger.warning(f"Error ensuring modelBreakdown exists: {e}")

            # Step 2: Ensure the specific model entry exists with initial values
            try:
                self.cost_summary_table.update_item(
                    Key=key,
                    UpdateExpression="SET #mb.#model = if_not_exists(#mb.#model, :init_model)",
                    ExpressionAttributeNames={
                        "#mb": "modelBreakdown",
                        "#model": safe_model_id
                    },
                    ExpressionAttributeValues={
                        ":init_model": {
                            "modelName": model_name,
                            "provider": "bedrock",
                            "cost": Decimal("0"),
                            "requests": 0,
                            "inputTokens": 0,
                            "outputTokens": 0,
                            "cacheReadTokens": 0,
                            "cacheWriteTokens": 0
                        }
                    }
                )
            except ClientError as e:
                logger.warning(f"Error initializing model entry: {e}")

            # Step 3: Atomically increment the model's counters
            self.cost_summary_table.update_item(
                Key=key,
                UpdateExpression="""
                    ADD #mb.#model.#cost :cost,
                        #mb.#model.#requests :one,
                        #mb.#model.#inputTokens :input,
                        #mb.#model.#outputTokens :output,
                        #mb.#model.#cacheReadTokens :cacheRead,
                        #mb.#model.#cacheWriteTokens :cacheWrite
                """,
                ExpressionAttributeNames={
                    "#mb": "modelBreakdown",
                    "#model": safe_model_id,
                    "#cost": "cost",
                    "#requests": "requests",
                    "#inputTokens": "inputTokens",
                    "#outputTokens": "outputTokens",
                    "#cacheReadTokens": "cacheReadTokens",
                    "#cacheWriteTokens": "cacheWriteTokens"
                },
                ExpressionAttributeValues={
                    ":cost": Decimal(str(cost_delta)),
                    ":one": 1,
                    ":input": usage_delta.get("inputTokens", 0),
                    ":output": usage_delta.get("outputTokens", 0),
                    ":cacheRead": usage_delta.get("cacheReadInputTokens", 0),
                    ":cacheWrite": usage_delta.get("cacheWriteInputTokens", 0)
                }
            )

            logger.debug(f"Updated model breakdown for {model_id} (key: {safe_model_id})")

        except ClientError as e:
            # Log but don't raise - model breakdown is supplementary data
            import logging
            logging.getLogger(__name__).error(
                f"Failed to update model breakdown for {model_id}: {e}"
            )

    async def get_user_messages_in_range(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Get all message metadata for a user in a date range

        Uses GSI1 (UserTimestampIndex) for efficient time-range queries.
        """
        try:
            # Convert datetimes to ISO strings
            start_iso = start_date.isoformat()
            end_iso = end_date.isoformat()

            response = self.sessions_metadata_table.query(
                IndexName="UserTimestampIndex",
                KeyConditionExpression="GSI1PK = :pk AND GSI1SK BETWEEN :start AND :end",
                ExpressionAttributeValues={
                    ":pk": f"USER#{user_id}",
                    ":start": start_iso,
                    ":end": end_iso
                }
            )

            items = response.get("Items", [])

            # Handle pagination if needed
            while "LastEvaluatedKey" in response:
                response = self.sessions_metadata_table.query(
                    IndexName="UserTimestampIndex",
                    KeyConditionExpression="GSI1PK = :pk AND GSI1SK BETWEEN :start AND :end",
                    ExpressionAttributeValues={
                        ":pk": f"USER#{user_id}",
                        ":start": start_iso,
                        ":end": end_iso
                    },
                    ExclusiveStartKey=response["LastEvaluatedKey"]
                )
                items.extend(response.get("Items", []))

            # Convert Decimal to float and remove DynamoDB keys
            results = []
            for item in items:
                item_float = self._convert_decimal_to_float(item)
                for key in ["PK", "SK", "GSI1PK", "GSI1SK", "ttl"]:
                    item_float.pop(key, None)
                results.append(item_float)

            return results

        except ClientError as e:
            raise Exception(f"Failed to get user messages in range: {e}")
