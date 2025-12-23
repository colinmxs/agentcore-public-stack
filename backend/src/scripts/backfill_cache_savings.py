#!/usr/bin/env python3
"""
Backfill cache savings for historical cost summaries

This script recalculates cache savings from message metadata and updates
the UserCostSummary table with the correct totals.

Usage:
    # Dry run (no changes)
    python -m scripts.backfill_cache_savings --period 2025-12 --dry-run

    # Execute backfill for specific user and period
    python -m scripts.backfill_cache_savings --user-id USER123 --period 2025-12

    # Execute backfill for all users in a period
    python -m scripts.backfill_cache_savings --period 2025-12

Environment:
    Requires AWS credentials and DynamoDB table names configured:
    - DYNAMODB_SESSIONS_METADATA_TABLE_NAME
    - DYNAMODB_COST_SUMMARY_TABLE_NAME
"""

import argparse
import asyncio
import logging
import os
import sys
from decimal import Decimal
from typing import Dict, Optional, List, Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CacheSavingsBackfill:
    """Backfill cache savings from message metadata"""

    def __init__(self, dry_run: bool = True):
        self.dry_run = dry_run
        self._init_dynamodb()

    def _init_dynamodb(self):
        """Initialize DynamoDB resources"""
        import boto3

        # Get region from environment or use default
        region = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
        logger.info(f"🌎 Using AWS region: {region}")

        self.dynamodb = boto3.resource('dynamodb', region_name=region)

        self.sessions_metadata_table_name = os.environ.get(
            "DYNAMODB_SESSIONS_METADATA_TABLE_NAME"
        )
        self.cost_summary_table_name = os.environ.get(
            "DYNAMODB_COST_SUMMARY_TABLE_NAME"
        )

        if not self.sessions_metadata_table_name:
            raise ValueError("DYNAMODB_SESSIONS_METADATA_TABLE_NAME not set")
        if not self.cost_summary_table_name:
            raise ValueError("DYNAMODB_COST_SUMMARY_TABLE_NAME not set")

        self.sessions_table = self.dynamodb.Table(self.sessions_metadata_table_name)
        self.cost_summary_table = self.dynamodb.Table(self.cost_summary_table_name)

        # Verify tables exist by checking their status
        try:
            sessions_status = self.sessions_table.table_status
            logger.info(f"✅ Sessions table status: {sessions_status}")
        except Exception as e:
            logger.error(f"❌ Cannot access sessions table '{self.sessions_metadata_table_name}': {e}")
            raise

        try:
            cost_status = self.cost_summary_table.table_status
            logger.info(f"✅ Cost summary table status: {cost_status}")
        except Exception as e:
            logger.error(f"❌ Cannot access cost summary table '{self.cost_summary_table_name}': {e}")
            raise

        logger.info(f"📊 Using tables:")
        logger.info(f"   Sessions: {self.sessions_metadata_table_name}")
        logger.info(f"   Cost Summary: {self.cost_summary_table_name}")

    async def backfill_user_period(
        self,
        user_id: str,
        period: str
    ) -> Dict[str, Any]:
        """
        Backfill cache savings for a specific user and period

        Args:
            user_id: User identifier
            period: Period in YYYY-MM format

        Returns:
            Dict with backfill results
        """
        logger.info(f"🔄 Backfilling cache savings for user={user_id}, period={period}")

        # Get all message metadata for this user in the period
        messages = await self._get_user_messages_for_period(user_id, period)
        logger.info(f"📦 Found {len(messages)} messages for {user_id} in {period}")

        # Calculate cache savings from each message
        total_cache_savings = 0.0
        messages_with_cache = 0

        for msg in messages:
            token_usage = msg.get("tokenUsage", {})
            cache_read_tokens = token_usage.get("cacheReadInputTokens", 0)

            if cache_read_tokens > 0:
                model_info = msg.get("modelInfo", {})
                pricing = model_info.get("pricingSnapshot", {})

                if pricing:
                    input_price = pricing.get("inputPricePerMtok", 0)
                    cache_read_price = pricing.get("cacheReadPricePerMtok", 0)

                    standard_cost = (cache_read_tokens / 1_000_000) * input_price
                    actual_cache_cost = (cache_read_tokens / 1_000_000) * cache_read_price
                    savings = standard_cost - actual_cache_cost

                    if savings > 0:
                        total_cache_savings += savings
                        messages_with_cache += 1
                        logger.debug(
                            f"   Message savings: ${savings:.6f} "
                            f"({cache_read_tokens:,} tokens)"
                        )

        logger.info(
            f"💰 Calculated total cache savings: ${total_cache_savings:.6f} "
            f"from {messages_with_cache} messages with cache"
        )

        # Get current cost summary
        current_summary = await self._get_cost_summary(user_id, period)
        current_cache_savings = float(current_summary.get("cacheSavings", 0)) if current_summary else 0

        logger.info(f"📊 Current cacheSavings in summary: ${current_cache_savings:.6f}")
        logger.info(f"📊 Calculated cacheSavings: ${total_cache_savings:.6f}")

        if abs(total_cache_savings - current_cache_savings) < 0.000001:
            logger.info("✅ Cache savings already correct, no update needed")
            return {
                "user_id": user_id,
                "period": period,
                "messages_processed": len(messages),
                "messages_with_cache": messages_with_cache,
                "current_cache_savings": current_cache_savings,
                "calculated_cache_savings": total_cache_savings,
                "updated": False
            }

        # Update cost summary with correct cache savings
        if not self.dry_run:
            await self._update_cache_savings(user_id, period, total_cache_savings)
            logger.info(f"✅ Updated cacheSavings to ${total_cache_savings:.6f}")
        else:
            logger.info(f"🔍 DRY RUN: Would update cacheSavings to ${total_cache_savings:.6f}")

        return {
            "user_id": user_id,
            "period": period,
            "messages_processed": len(messages),
            "messages_with_cache": messages_with_cache,
            "current_cache_savings": current_cache_savings,
            "calculated_cache_savings": total_cache_savings,
            "updated": not self.dry_run
        }

    async def backfill_all_users_for_period(
        self,
        period: str
    ) -> List[Dict[str, Any]]:
        """
        Backfill cache savings for all users in a period

        Args:
            period: Period in YYYY-MM format

        Returns:
            List of backfill results for each user
        """
        # Get all unique user IDs from cost summaries for this period
        users = await self._get_users_for_period(period)
        logger.info(f"👥 Found {len(users)} users with cost summaries for {period}")

        results = []
        for user_id in users:
            try:
                result = await self.backfill_user_period(user_id, period)
                results.append(result)
            except Exception as e:
                logger.error(f"❌ Failed to backfill user {user_id}: {e}")
                results.append({
                    "user_id": user_id,
                    "period": period,
                    "error": str(e)
                })

        return results

    async def _get_user_messages_for_period(
        self,
        user_id: str,
        period: str
    ) -> List[Dict[str, Any]]:
        """Get all message metadata for a user in a period"""
        # Query using primary key and filter by timestamp
        # PK = USER#{user_id}, SK begins with SESSION#
        # Filter in Python: SK contains #MSG# (to exclude session records)
        items = []

        try:
            # Build date range for the period
            start_date = f"{period}-01"
            end_date = f"{period}-31T23:59:59Z"

            pk_value = f"USER#{user_id}"
            logger.info(f"🔍 Querying table '{self.sessions_metadata_table_name}'")
            logger.info(f"   PK = '{pk_value}'")
            logger.info(f"   Date range: {start_date} to {end_date}")

            # Query all items for this user, filter by timestamp only
            # We'll filter for #MSG# in Python since SK can't be in FilterExpression
            paginator_params = {
                "KeyConditionExpression": "PK = :pk AND begins_with(SK, :sk_prefix)",
                "FilterExpression": "#ts >= :start AND #ts <= :end",
                "ExpressionAttributeNames": {
                    "#ts": "timestamp"
                },
                "ExpressionAttributeValues": {
                    ":pk": pk_value,
                    ":sk_prefix": "SESSION#",
                    ":start": start_date,
                    ":end": end_date
                }
            }

            response = self.sessions_table.query(**paginator_params)
            # Filter for message records only (SK contains #MSG#)
            page_items = [item for item in response.get("Items", []) if "#MSG#" in item.get("SK", "")]
            items.extend(page_items)
            logger.info(f"   First page: {len(response.get('Items', []))} items, {len(page_items)} messages")

            page_count = 1
            while "LastEvaluatedKey" in response:
                page_count += 1
                paginator_params["ExclusiveStartKey"] = response["LastEvaluatedKey"]
                response = self.sessions_table.query(**paginator_params)
                page_items = [item for item in response.get("Items", []) if "#MSG#" in item.get("SK", "")]
                items.extend(page_items)
                logger.info(f"   Page {page_count}: {len(response.get('Items', []))} items, {len(page_items)} messages")

            logger.info(f"📦 Retrieved {len(items)} message records from DynamoDB")

        except Exception as e:
            logger.error(f"Failed to query messages from table '{self.sessions_metadata_table_name}': {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise

        # Convert Decimal to float
        return [self._convert_decimal_to_float(item) for item in items]

    async def _get_cost_summary(
        self,
        user_id: str,
        period: str
    ) -> Optional[Dict[str, Any]]:
        """Get cost summary for a user and period"""
        try:
            response = self.cost_summary_table.get_item(
                Key={
                    "PK": f"USER#{user_id}",
                    "SK": f"PERIOD#{period}"
                }
            )

            item = response.get("Item")
            if item:
                return self._convert_decimal_to_float(item)
            return None

        except Exception as e:
            logger.error(f"Failed to get cost summary: {e}")
            raise

    async def _update_cache_savings(
        self,
        user_id: str,
        period: str,
        cache_savings: float
    ) -> None:
        """Update cache savings in cost summary (overwrite, not add)"""
        try:
            self.cost_summary_table.update_item(
                Key={
                    "PK": f"USER#{user_id}",
                    "SK": f"PERIOD#{period}"
                },
                UpdateExpression="SET cacheSavings = :savings",
                ExpressionAttributeValues={
                    ":savings": Decimal(str(cache_savings))
                }
            )
        except Exception as e:
            logger.error(f"Failed to update cache savings: {e}")
            raise

    async def _get_users_for_period(self, period: str) -> List[str]:
        """Get all user IDs with cost summaries for a period"""
        users = set()

        try:
            # Scan cost summary table for this period
            response = self.cost_summary_table.scan(
                FilterExpression="SK = :sk",
                ExpressionAttributeValues={
                    ":sk": f"PERIOD#{period}"
                },
                ProjectionExpression="PK"
            )

            for item in response.get("Items", []):
                # Extract user_id from PK (USER#<user_id>)
                pk = item.get("PK", "")
                if pk.startswith("USER#"):
                    users.add(pk[5:])  # Remove "USER#" prefix

            while "LastEvaluatedKey" in response:
                response = self.cost_summary_table.scan(
                    FilterExpression="SK = :sk",
                    ExpressionAttributeValues={
                        ":sk": f"PERIOD#{period}"
                    },
                    ProjectionExpression="PK",
                    ExclusiveStartKey=response["LastEvaluatedKey"]
                )
                for item in response.get("Items", []):
                    pk = item.get("PK", "")
                    if pk.startswith("USER#"):
                        users.add(pk[5:])

        except Exception as e:
            logger.error(f"Failed to get users for period: {e}")
            raise

        return list(users)

    def _convert_decimal_to_float(self, obj: Any) -> Any:
        """Recursively convert Decimal to float"""
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, dict):
            return {k: self._convert_decimal_to_float(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_decimal_to_float(item) for item in obj]
        return obj


async def main():
    parser = argparse.ArgumentParser(
        description="Backfill cache savings for historical cost summaries"
    )
    parser.add_argument(
        "--user-id",
        help="Specific user ID to backfill (optional, all users if not specified)"
    )
    parser.add_argument(
        "--period",
        required=True,
        help="Period to backfill in YYYY-MM format (e.g., 2025-12)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )

    args = parser.parse_args()

    # Validate period format
    if len(args.period) != 7 or args.period[4] != '-':
        parser.error("Period must be in YYYY-MM format (e.g., 2025-12)")

    try:
        backfill = CacheSavingsBackfill(dry_run=args.dry_run)

        if args.dry_run:
            logger.info("🔍 DRY RUN MODE - No changes will be made")

        if args.user_id:
            results = [await backfill.backfill_user_period(args.user_id, args.period)]
        else:
            results = await backfill.backfill_all_users_for_period(args.period)

        # Print summary
        print("\n" + "=" * 60)
        print("BACKFILL SUMMARY")
        print("=" * 60)

        total_updated = 0
        total_savings = 0.0

        for result in results:
            if "error" in result:
                print(f"❌ {result['user_id']}: ERROR - {result['error']}")
            else:
                status = "✅ Updated" if result['updated'] else "⏭️  Skipped"
                print(
                    f"{status} {result['user_id']}: "
                    f"${result['current_cache_savings']:.6f} -> ${result['calculated_cache_savings']:.6f} "
                    f"({result['messages_with_cache']} messages with cache)"
                )
                if result['updated']:
                    total_updated += 1
                total_savings += result['calculated_cache_savings']

        print("=" * 60)
        print(f"Total users processed: {len(results)}")
        print(f"Total users updated: {total_updated}")
        print(f"Total calculated cache savings: ${total_savings:.6f}")

        if args.dry_run:
            print("\n🔍 This was a DRY RUN - No changes were made")
            print("   Run without --dry-run to apply changes")

    except Exception as e:
        logger.error(f"❌ Backfill failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
