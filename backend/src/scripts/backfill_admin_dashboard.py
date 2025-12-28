#!/usr/bin/env python3
"""
Backfill GSI attributes and system rollups for admin cost dashboard

This script populates:
1. GSI2PK/GSI2SK attributes on UserCostSummary table for PeriodCostIndex GSI
2. SystemCostRollup table with pre-aggregated system-wide metrics

Usage:
    # Dry run (no changes)
    python -m scripts.backfill_admin_dashboard --period 2025-01 --dry-run

    # Execute backfill for specific period
    python -m scripts.backfill_admin_dashboard --period 2025-01

    # Execute backfill for all periods
    python -m scripts.backfill_admin_dashboard --all-periods

Environment:
    Requires AWS credentials and DynamoDB table names configured:
    - DYNAMODB_COST_SUMMARY_TABLE_NAME
    - DYNAMODB_SYSTEM_ROLLUP_TABLE_NAME
"""

import argparse
import asyncio
import logging
import os
import sys
from decimal import Decimal
from typing import Dict, Optional, List, Any
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AdminDashboardBackfill:
    """Backfill GSI attributes and system rollups for admin dashboard"""

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

        self.cost_summary_table_name = os.environ.get(
            "DYNAMODB_COST_SUMMARY_TABLE_NAME"
        )
        self.system_rollup_table_name = os.environ.get(
            "DYNAMODB_SYSTEM_ROLLUP_TABLE_NAME"
        )

        if not self.cost_summary_table_name:
            raise ValueError("DYNAMODB_COST_SUMMARY_TABLE_NAME not set")

        self.cost_summary_table = self.dynamodb.Table(self.cost_summary_table_name)

        # System rollup table is optional - create it if specified
        self.system_rollup_table = None
        if self.system_rollup_table_name:
            self.system_rollup_table = self.dynamodb.Table(self.system_rollup_table_name)

        # Verify tables exist
        try:
            cost_status = self.cost_summary_table.table_status
            logger.info(f"✅ Cost summary table status: {cost_status}")
        except Exception as e:
            logger.error(f"❌ Cannot access cost summary table '{self.cost_summary_table_name}': {e}")
            raise

        if self.system_rollup_table:
            try:
                rollup_status = self.system_rollup_table.table_status
                logger.info(f"✅ System rollup table status: {rollup_status}")
            except Exception as e:
                logger.warning(f"⚠️ System rollup table not accessible: {e}")
                logger.warning("   Will skip system rollup updates")
                self.system_rollup_table = None

        logger.info(f"📊 Using tables:")
        logger.info(f"   Cost Summary: {self.cost_summary_table_name}")
        if self.system_rollup_table_name:
            logger.info(f"   System Rollup: {self.system_rollup_table_name}")

    async def backfill_period(self, period: str) -> Dict[str, Any]:
        """
        Backfill GSI attributes and system rollups for a specific period

        Args:
            period: Period in YYYY-MM format

        Returns:
            Dict with backfill results
        """
        logger.info(f"🔄 Backfilling admin dashboard data for period={period}")

        # Get all cost summaries for this period
        summaries = await self._get_all_summaries_for_period(period)
        logger.info(f"📦 Found {len(summaries)} user cost summaries for {period}")

        # Track aggregates for system rollup
        system_totals = {
            "totalCost": Decimal("0"),
            "totalRequests": 0,
            "totalInputTokens": 0,
            "totalOutputTokens": 0,
            "totalCacheReadTokens": 0,
            "totalCacheWriteTokens": 0,
            "totalCacheSavings": Decimal("0"),
            "activeUsers": len(summaries),
            "modelBreakdown": {}
        }

        users_updated = 0
        users_skipped = 0

        for summary in summaries:
            user_id = summary.get("userId") or self._extract_user_id(summary.get("PK", ""))
            total_cost = float(summary.get("totalCost", 0))

            # Update GSI attributes
            needs_update = await self._update_gsi_attributes(
                user_id=user_id,
                period=period,
                total_cost=total_cost,
                current_gsi2pk=summary.get("GSI2PK"),
                current_gsi2sk=summary.get("GSI2SK")
            )

            if needs_update:
                users_updated += 1
            else:
                users_skipped += 1

            # Aggregate for system totals
            system_totals["totalCost"] += Decimal(str(summary.get("totalCost", 0)))
            system_totals["totalRequests"] += summary.get("totalRequests", 0)
            system_totals["totalInputTokens"] += summary.get("totalInputTokens", 0)
            system_totals["totalOutputTokens"] += summary.get("totalOutputTokens", 0)
            system_totals["totalCacheReadTokens"] += summary.get("totalCacheReadTokens", 0)
            system_totals["totalCacheWriteTokens"] += summary.get("totalCacheWriteTokens", 0)
            system_totals["totalCacheSavings"] += Decimal(str(summary.get("cacheSavings", 0)))

            # Aggregate model breakdown
            model_breakdown = summary.get("modelBreakdown", {})
            for model_key, model_data in model_breakdown.items():
                if model_key not in system_totals["modelBreakdown"]:
                    system_totals["modelBreakdown"][model_key] = {
                        "modelName": model_data.get("modelName", model_key),
                        "provider": model_data.get("provider", "unknown"),
                        "totalCost": Decimal("0"),
                        "totalRequests": 0,
                        "totalInputTokens": 0,
                        "totalOutputTokens": 0,
                        "uniqueUsers": 0
                    }

                system_totals["modelBreakdown"][model_key]["totalCost"] += Decimal(str(model_data.get("cost", 0)))
                system_totals["modelBreakdown"][model_key]["totalRequests"] += model_data.get("requests", 0)
                system_totals["modelBreakdown"][model_key]["totalInputTokens"] += model_data.get("inputTokens", 0)
                system_totals["modelBreakdown"][model_key]["totalOutputTokens"] += model_data.get("outputTokens", 0)
                system_totals["modelBreakdown"][model_key]["uniqueUsers"] += 1

        # Update system rollups
        rollup_updated = False
        if self.system_rollup_table:
            rollup_updated = await self._update_system_rollup(period, system_totals)

        logger.info(f"📊 Period {period} totals:")
        logger.info(f"   Total Cost: ${float(system_totals['totalCost']):.2f}")
        logger.info(f"   Total Requests: {system_totals['totalRequests']:,}")
        logger.info(f"   Active Users: {system_totals['activeUsers']}")
        logger.info(f"   Cache Savings: ${float(system_totals['totalCacheSavings']):.2f}")

        return {
            "period": period,
            "users_found": len(summaries),
            "users_updated": users_updated,
            "users_skipped": users_skipped,
            "system_rollup_updated": rollup_updated,
            "totals": {
                "totalCost": float(system_totals["totalCost"]),
                "totalRequests": system_totals["totalRequests"],
                "activeUsers": system_totals["activeUsers"],
                "totalCacheSavings": float(system_totals["totalCacheSavings"])
            }
        }

    async def _get_all_summaries_for_period(self, period: str) -> List[Dict[str, Any]]:
        """Get all user cost summaries for a period"""
        items = []

        try:
            # Scan cost summary table for this period
            response = self.cost_summary_table.scan(
                FilterExpression="SK = :sk",
                ExpressionAttributeValues={
                    ":sk": f"PERIOD#{period}"
                }
            )

            items.extend(response.get("Items", []))

            while "LastEvaluatedKey" in response:
                response = self.cost_summary_table.scan(
                    FilterExpression="SK = :sk",
                    ExpressionAttributeValues={
                        ":sk": f"PERIOD#{period}"
                    },
                    ExclusiveStartKey=response["LastEvaluatedKey"]
                )
                items.extend(response.get("Items", []))

        except Exception as e:
            logger.error(f"Failed to scan cost summaries: {e}")
            raise

        # Convert Decimal to float for calculations
        return [self._convert_decimal_to_float(item) for item in items]

    async def _update_gsi_attributes(
        self,
        user_id: str,
        period: str,
        total_cost: float,
        current_gsi2pk: Optional[str],
        current_gsi2sk: Optional[str]
    ) -> bool:
        """
        Update GSI2PK and GSI2SK attributes for PeriodCostIndex

        Returns True if update was performed, False if skipped
        """
        expected_gsi2pk = f"PERIOD#{period}"
        cost_cents = int(total_cost * 100)
        expected_gsi2sk = f"COST#{cost_cents:015d}"

        # Check if update is needed
        if current_gsi2pk == expected_gsi2pk and current_gsi2sk == expected_gsi2sk:
            logger.debug(f"   User {user_id}: GSI attributes already correct")
            return False

        if self.dry_run:
            logger.info(f"🔍 DRY RUN: Would update user {user_id}: GSI2PK={expected_gsi2pk}, GSI2SK={expected_gsi2sk}")
            return True

        try:
            self.cost_summary_table.update_item(
                Key={
                    "PK": f"USER#{user_id}",
                    "SK": f"PERIOD#{period}"
                },
                UpdateExpression="SET userId = :userId, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk",
                ExpressionAttributeValues={
                    ":userId": user_id,
                    ":gsi2pk": expected_gsi2pk,
                    ":gsi2sk": expected_gsi2sk
                }
            )
            logger.debug(f"   Updated user {user_id}: GSI2SK={expected_gsi2sk}")
            return True

        except Exception as e:
            logger.error(f"Failed to update GSI attributes for {user_id}: {e}")
            return False

    async def _update_system_rollup(
        self,
        period: str,
        totals: Dict[str, Any]
    ) -> bool:
        """Update system-wide monthly rollup"""
        if not self.system_rollup_table:
            return False

        if self.dry_run:
            logger.info(f"🔍 DRY RUN: Would update monthly rollup for {period}")
            return True

        try:
            now = datetime.utcnow().isoformat() + "Z"

            # Update monthly rollup
            self.system_rollup_table.put_item(
                Item={
                    "PK": "ROLLUP#MONTHLY",
                    "SK": period,
                    "type": "monthly",
                    "totalCost": totals["totalCost"],
                    "totalRequests": totals["totalRequests"],
                    "totalInputTokens": totals["totalInputTokens"],
                    "totalOutputTokens": totals["totalOutputTokens"],
                    "totalCacheReadTokens": totals["totalCacheReadTokens"],
                    "totalCacheWriteTokens": totals["totalCacheWriteTokens"],
                    "totalCacheSavings": totals["totalCacheSavings"],
                    "activeUsers": totals["activeUsers"],
                    "lastUpdated": now
                }
            )

            # Update per-model rollups
            for model_key, model_data in totals.get("modelBreakdown", {}).items():
                self.system_rollup_table.put_item(
                    Item={
                        "PK": "ROLLUP#MODEL",
                        "SK": f"{period}#{model_key}",
                        "type": "model",
                        "modelId": model_key,
                        "modelName": model_data["modelName"],
                        "provider": model_data["provider"],
                        "totalCost": model_data["totalCost"],
                        "totalRequests": model_data["totalRequests"],
                        "totalInputTokens": model_data["totalInputTokens"],
                        "totalOutputTokens": model_data["totalOutputTokens"],
                        "uniqueUsers": model_data["uniqueUsers"],
                        "lastUpdated": now
                    }
                )

            logger.info(f"✅ Updated system rollups for {period}")
            return True

        except Exception as e:
            logger.error(f"Failed to update system rollup: {e}")
            return False

    async def get_all_periods(self) -> List[str]:
        """Get all unique periods from cost summary table"""
        periods = set()

        try:
            response = self.cost_summary_table.scan(
                ProjectionExpression="SK"
            )

            for item in response.get("Items", []):
                sk = item.get("SK", "")
                if sk.startswith("PERIOD#"):
                    periods.add(sk[7:])  # Remove "PERIOD#" prefix

            while "LastEvaluatedKey" in response:
                response = self.cost_summary_table.scan(
                    ProjectionExpression="SK",
                    ExclusiveStartKey=response["LastEvaluatedKey"]
                )
                for item in response.get("Items", []):
                    sk = item.get("SK", "")
                    if sk.startswith("PERIOD#"):
                        periods.add(sk[7:])

        except Exception as e:
            logger.error(f"Failed to get periods: {e}")
            raise

        return sorted(list(periods))

    def _extract_user_id(self, pk: str) -> str:
        """Extract user_id from PK (USER#{user_id})"""
        if pk.startswith("USER#"):
            return pk[5:]
        return pk

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
        description="Backfill GSI attributes and system rollups for admin cost dashboard"
    )
    parser.add_argument(
        "--period",
        help="Period to backfill in YYYY-MM format (e.g., 2025-01)"
    )
    parser.add_argument(
        "--all-periods",
        action="store_true",
        help="Backfill all periods found in the cost summary table"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )

    args = parser.parse_args()

    if not args.period and not args.all_periods:
        parser.error("Either --period or --all-periods must be specified")

    if args.period:
        # Validate period format
        if len(args.period) != 7 or args.period[4] != '-':
            parser.error("Period must be in YYYY-MM format (e.g., 2025-01)")

    try:
        backfill = AdminDashboardBackfill(dry_run=args.dry_run)

        if args.dry_run:
            logger.info("🔍 DRY RUN MODE - No changes will be made")

        results = []

        if args.all_periods:
            periods = await backfill.get_all_periods()
            logger.info(f"📅 Found {len(periods)} periods to backfill: {periods}")

            for period in periods:
                result = await backfill.backfill_period(period)
                results.append(result)
        else:
            result = await backfill.backfill_period(args.period)
            results.append(result)

        # Print summary
        print("\n" + "=" * 70)
        print("ADMIN DASHBOARD BACKFILL SUMMARY")
        print("=" * 70)

        total_users_updated = 0
        total_cost = 0.0

        for result in results:
            print(f"\n📅 Period: {result['period']}")
            print(f"   Users Found: {result['users_found']}")
            print(f"   Users Updated (GSI): {result['users_updated']}")
            print(f"   Users Skipped: {result['users_skipped']}")
            print(f"   System Rollup Updated: {'✅' if result['system_rollup_updated'] else '❌'}")
            print(f"   Total Cost: ${result['totals']['totalCost']:.2f}")
            print(f"   Total Requests: {result['totals']['totalRequests']:,}")
            print(f"   Active Users: {result['totals']['activeUsers']}")

            total_users_updated += result['users_updated']
            total_cost += result['totals']['totalCost']

        print("\n" + "=" * 70)
        print(f"Total periods processed: {len(results)}")
        print(f"Total users updated: {total_users_updated}")
        print(f"Total cost across all periods: ${total_cost:.2f}")

        if args.dry_run:
            print("\n🔍 This was a DRY RUN - No changes were made")
            print("   Run without --dry-run to apply changes")

    except Exception as e:
        logger.error(f"❌ Backfill failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
