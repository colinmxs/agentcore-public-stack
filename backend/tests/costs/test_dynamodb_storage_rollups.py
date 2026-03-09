"""Tests for DynamoDB rollup and active-user tracking operations.

Covers:
    - track_active_user
    - track_active_user_for_model
    - update_daily_rollup / update_monthly_rollup / update_model_rollup
    - get_system_summary / get_daily_trends / get_model_usage
"""

import pytest
from datetime import datetime, timezone, timedelta
from decimal import Decimal


# ── Helpers ──────────────────────────────────────────────────────────────────

PERIOD = "2025-01"
DATE = "2025-01-15"
USER = "user-alpha"
MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
MODEL_NAME = "Claude Sonnet 4.5"
PROVIDER = "bedrock"


def _usage(input_=1000, output_=500, cache_read=200, cache_write=100):
    return {
        "inputTokens": input_,
        "outputTokens": output_,
        "cacheReadInputTokens": cache_read,
        "cacheWriteInputTokens": cache_write,
    }


# ============================================================
# track_active_user
# ============================================================

class TestTrackActiveUser:

    @pytest.mark.asyncio
    async def test_first_call_returns_true_true(self, storage):
        is_new_today, is_new_month = await storage.track_active_user(USER, PERIOD, DATE)
        assert is_new_today is True
        assert is_new_month is True

    @pytest.mark.asyncio
    async def test_second_call_same_user_returns_false_false(self, storage):
        await storage.track_active_user(USER, PERIOD, DATE)
        is_new_today, is_new_month = await storage.track_active_user(USER, PERIOD, DATE)
        assert is_new_today is False
        assert is_new_month is False

    @pytest.mark.asyncio
    async def test_different_user_same_day_returns_true_true(self, storage):
        await storage.track_active_user(USER, PERIOD, DATE)
        is_new_today, is_new_month = await storage.track_active_user("user-beta", PERIOD, DATE)
        assert is_new_today is True
        assert is_new_month is True

    @pytest.mark.asyncio
    async def test_same_user_different_day_same_month(self, storage):
        """Same user on a new day should be new today but not this month."""
        await storage.track_active_user(USER, PERIOD, DATE)
        is_new_today, is_new_month = await storage.track_active_user(USER, PERIOD, "2025-01-16")
        assert is_new_today is True
        assert is_new_month is False

    @pytest.mark.asyncio
    async def test_ttl_values_are_set(self, storage, moto_dynamodb):
        """Daily TTL ~90 days, monthly TTL ~400 days from now."""
        await storage.track_active_user(USER, PERIOD, DATE)

        table = moto_dynamodb.Table("SystemCostRollup")

        daily = table.get_item(Key={"PK": f"ACTIVE#DAILY#{DATE}", "SK": USER})["Item"]
        monthly = table.get_item(Key={"PK": f"ACTIVE#MONTHLY#{PERIOD}", "SK": USER})["Item"]

        now_ts = datetime.now(timezone.utc).timestamp()
        # Daily TTL should be ~90 days in the future (give 2 day tolerance)
        assert float(daily["TTL"]) == pytest.approx(now_ts + 90 * 86400, abs=2 * 86400)
        # Monthly TTL should be ~400 days in the future
        assert float(monthly["TTL"]) == pytest.approx(now_ts + 400 * 86400, abs=2 * 86400)

    @pytest.mark.asyncio
    async def test_trackedAt_field_is_set(self, storage, moto_dynamodb):
        await storage.track_active_user(USER, PERIOD, DATE)
        table = moto_dynamodb.Table("SystemCostRollup")
        item = table.get_item(Key={"PK": f"ACTIVE#DAILY#{DATE}", "SK": USER})["Item"]
        assert "trackedAt" in item


# ============================================================
# track_active_user_for_model
# ============================================================

class TestTrackActiveUserForModel:

    @pytest.mark.asyncio
    async def test_first_call_returns_true(self, storage):
        result = await storage.track_active_user_for_model(USER, PERIOD, MODEL_ID)
        assert result is True

    @pytest.mark.asyncio
    async def test_duplicate_returns_false(self, storage):
        await storage.track_active_user_for_model(USER, PERIOD, MODEL_ID)
        result = await storage.track_active_user_for_model(USER, PERIOD, MODEL_ID)
        assert result is False

    @pytest.mark.asyncio
    async def test_model_id_sanitized_in_pk(self, storage, moto_dynamodb):
        """Dots, colons, and dashes in model_id are replaced with underscores."""
        await storage.track_active_user_for_model(USER, PERIOD, "gpt-4.0:turbo")

        safe = "gpt_4_0_turbo"
        table = moto_dynamodb.Table("SystemCostRollup")
        item = table.get_item(
            Key={"PK": f"ACTIVE#MODEL#{PERIOD}#{safe}", "SK": USER}
        )
        assert "Item" in item

    @pytest.mark.asyncio
    async def test_different_user_same_model(self, storage):
        await storage.track_active_user_for_model(USER, PERIOD, MODEL_ID)
        result = await storage.track_active_user_for_model("user-beta", PERIOD, MODEL_ID)
        assert result is True


# ============================================================
# update_daily_rollup
# ============================================================

class TestUpdateDailyRollup:

    @pytest.mark.asyncio
    async def test_creates_new_entry(self, storage, sample_usage_delta):
        await storage.update_daily_rollup(DATE, 0.05, sample_usage_delta)

        summary = await storage.get_system_summary(DATE, period_type="daily")
        assert summary is not None
        assert summary["totalCost"] == pytest.approx(0.05)
        assert summary["totalRequests"] == 1
        assert summary["totalInputTokens"] == 1000
        assert summary["totalOutputTokens"] == 500
        assert summary["type"] == "daily"

    @pytest.mark.asyncio
    async def test_atomic_increment(self, storage, sample_usage_delta):
        await storage.update_daily_rollup(DATE, 0.05, sample_usage_delta)
        await storage.update_daily_rollup(DATE, 0.10, sample_usage_delta)

        summary = await storage.get_system_summary(DATE, period_type="daily")
        assert summary["totalCost"] == pytest.approx(0.15)
        assert summary["totalRequests"] == 2
        assert summary["totalInputTokens"] == 2000

    @pytest.mark.asyncio
    async def test_is_new_user_adds_active_users(self, storage, sample_usage_delta):
        await storage.update_daily_rollup(DATE, 0.05, sample_usage_delta, is_new_user=True)
        await storage.update_daily_rollup(DATE, 0.05, sample_usage_delta, is_new_user=True)

        summary = await storage.get_system_summary(DATE, period_type="daily")
        assert summary["activeUsers"] == 2

    @pytest.mark.asyncio
    async def test_without_is_new_user_no_active_users(self, storage, sample_usage_delta):
        await storage.update_daily_rollup(DATE, 0.05, sample_usage_delta)

        summary = await storage.get_system_summary(DATE, period_type="daily")
        assert "activeUsers" not in summary


# ============================================================
# update_monthly_rollup
# ============================================================

class TestUpdateMonthlyRollup:

    @pytest.mark.asyncio
    async def test_creates_new_entry(self, storage, sample_usage_delta):
        await storage.update_monthly_rollup(PERIOD, 1.50, sample_usage_delta)

        summary = await storage.get_system_summary(PERIOD, period_type="monthly")
        assert summary is not None
        assert summary["totalCost"] == pytest.approx(1.50)
        assert summary["totalRequests"] == 1
        assert summary["type"] == "monthly"

    @pytest.mark.asyncio
    async def test_atomic_increment(self, storage, sample_usage_delta):
        await storage.update_monthly_rollup(PERIOD, 1.50, sample_usage_delta)
        await storage.update_monthly_rollup(PERIOD, 2.00, sample_usage_delta)

        summary = await storage.get_system_summary(PERIOD, period_type="monthly")
        assert summary["totalCost"] == pytest.approx(3.50)
        assert summary["totalRequests"] == 2

    @pytest.mark.asyncio
    async def test_includes_cache_savings(self, storage, sample_usage_delta):
        await storage.update_monthly_rollup(PERIOD, 1.00, sample_usage_delta, cache_savings_delta=0.25)
        await storage.update_monthly_rollup(PERIOD, 1.00, sample_usage_delta, cache_savings_delta=0.35)

        summary = await storage.get_system_summary(PERIOD, period_type="monthly")
        assert summary["totalCacheSavings"] == pytest.approx(0.60)

    @pytest.mark.asyncio
    async def test_is_new_user_adds_active_users(self, storage, sample_usage_delta):
        await storage.update_monthly_rollup(PERIOD, 1.00, sample_usage_delta, is_new_user=True)

        summary = await storage.get_system_summary(PERIOD, period_type="monthly")
        assert summary["activeUsers"] == 1

    @pytest.mark.asyncio
    async def test_cache_token_fields(self, storage, sample_usage_delta):
        await storage.update_monthly_rollup(PERIOD, 1.00, sample_usage_delta)

        summary = await storage.get_system_summary(PERIOD, period_type="monthly")
        assert summary["totalCacheReadTokens"] == 200
        assert summary["totalCacheWriteTokens"] == 100


# ============================================================
# update_model_rollup
# ============================================================

class TestUpdateModelRollup:

    @pytest.mark.asyncio
    async def test_creates_new_entry(self, storage, sample_usage_delta):
        await storage.update_model_rollup(
            PERIOD, MODEL_ID, MODEL_NAME, PROVIDER, 0.05, sample_usage_delta
        )

        models = await storage.get_model_usage(PERIOD)
        assert len(models) == 1
        assert models[0]["totalCost"] == pytest.approx(0.05)
        assert models[0]["totalRequests"] == 1

    @pytest.mark.asyncio
    async def test_model_id_sanitized_in_sk(self, storage, moto_dynamodb, sample_usage_delta):
        """Dots/colons/dashes replaced with underscores in the SK."""
        await storage.update_model_rollup(
            PERIOD, "gpt-4.0:turbo", "GPT 4 Turbo", "openai", 0.10, sample_usage_delta
        )

        table = moto_dynamodb.Table("SystemCostRollup")
        safe = "gpt_4_0_turbo"
        resp = table.get_item(Key={"PK": "ROLLUP#MODEL", "SK": f"{PERIOD}#{safe}"})
        assert "Item" in resp

    @pytest.mark.asyncio
    async def test_is_new_user_for_model_adds_unique_users(self, storage, sample_usage_delta):
        await storage.update_model_rollup(
            PERIOD, MODEL_ID, MODEL_NAME, PROVIDER, 0.05, sample_usage_delta,
            is_new_user_for_model=True
        )
        await storage.update_model_rollup(
            PERIOD, MODEL_ID, MODEL_NAME, PROVIDER, 0.05, sample_usage_delta,
            is_new_user_for_model=True
        )

        models = await storage.get_model_usage(PERIOD)
        assert models[0]["uniqueUsers"] == 2

    @pytest.mark.asyncio
    async def test_metadata_fields_set(self, storage, sample_usage_delta):
        await storage.update_model_rollup(
            PERIOD, MODEL_ID, MODEL_NAME, PROVIDER, 0.05, sample_usage_delta
        )

        models = await storage.get_model_usage(PERIOD)
        m = models[0]
        assert m["modelId"] == MODEL_ID
        assert m["modelName"] == MODEL_NAME
        assert m["provider"] == PROVIDER
        assert m["type"] == "model"
        assert "lastUpdated" in m


# ============================================================
# get_system_summary
# ============================================================

class TestGetSystemSummary:

    @pytest.mark.asyncio
    async def test_monthly_lookup(self, storage, sample_usage_delta):
        await storage.update_monthly_rollup(PERIOD, 5.0, sample_usage_delta)

        result = await storage.get_system_summary(PERIOD, period_type="monthly")
        assert result is not None
        assert result["totalCost"] == pytest.approx(5.0)

    @pytest.mark.asyncio
    async def test_daily_lookup(self, storage, sample_usage_delta):
        await storage.update_daily_rollup(DATE, 0.50, sample_usage_delta)

        result = await storage.get_system_summary(DATE, period_type="daily")
        assert result is not None
        assert result["totalCost"] == pytest.approx(0.50)

    @pytest.mark.asyncio
    async def test_returns_none_for_missing_period(self, storage):
        result = await storage.get_system_summary("2099-12", period_type="monthly")
        assert result is None

    @pytest.mark.asyncio
    async def test_decimal_to_float_conversion(self, storage, moto_dynamodb):
        """Values stored as Decimal should be returned as float/int."""
        table = moto_dynamodb.Table("SystemCostRollup")
        table.put_item(Item={
            "PK": "ROLLUP#MONTHLY",
            "SK": "2025-06",
            "totalCost": Decimal("12.345"),
            "totalRequests": Decimal("10"),
            "type": "monthly",
        })

        result = await storage.get_system_summary("2025-06", period_type="monthly")
        assert isinstance(result["totalCost"], float)
        assert result["totalCost"] == pytest.approx(12.345)

    @pytest.mark.asyncio
    async def test_pk_sk_removed_from_response(self, storage, sample_usage_delta):
        await storage.update_monthly_rollup(PERIOD, 1.0, sample_usage_delta)

        result = await storage.get_system_summary(PERIOD, period_type="monthly")
        assert "PK" not in result
        assert "SK" not in result


# ============================================================
# get_daily_trends
# ============================================================

class TestGetDailyTrends:

    @pytest.mark.asyncio
    async def test_returns_entries_in_range(self, storage, sample_usage_delta):
        for day in ("2025-01-10", "2025-01-11", "2025-01-12"):
            await storage.update_daily_rollup(day, 1.0, sample_usage_delta)

        results = await storage.get_daily_trends("2025-01-10", "2025-01-12")
        assert len(results) == 3

    @pytest.mark.asyncio
    async def test_ascending_order(self, storage, sample_usage_delta):
        for day in ("2025-01-12", "2025-01-10", "2025-01-11"):
            await storage.update_daily_rollup(day, 1.0, sample_usage_delta)

        results = await storage.get_daily_trends("2025-01-10", "2025-01-12")
        dates = [r["date"] for r in results]
        assert dates == ["2025-01-10", "2025-01-11", "2025-01-12"]

    @pytest.mark.asyncio
    async def test_empty_range_returns_empty_list(self, storage):
        results = await storage.get_daily_trends("2099-01-01", "2099-01-31")
        assert results == []

    @pytest.mark.asyncio
    async def test_date_field_added_from_sk(self, storage, sample_usage_delta):
        await storage.update_daily_rollup(DATE, 1.0, sample_usage_delta)

        results = await storage.get_daily_trends(DATE, DATE)
        assert len(results) == 1
        assert results[0]["date"] == DATE
        assert "SK" not in results[0]
        assert "PK" not in results[0]

    @pytest.mark.asyncio
    async def test_excludes_entries_outside_range(self, storage, sample_usage_delta):
        for day in ("2025-01-09", "2025-01-10", "2025-01-12", "2025-01-13"):
            await storage.update_daily_rollup(day, 1.0, sample_usage_delta)

        results = await storage.get_daily_trends("2025-01-10", "2025-01-12")
        dates = [r["date"] for r in results]
        assert "2025-01-09" not in dates
        assert "2025-01-13" not in dates
        assert len(dates) == 2


# ============================================================
# get_model_usage
# ============================================================

class TestGetModelUsage:

    @pytest.mark.asyncio
    async def test_returns_models_for_period(self, storage, sample_usage_delta):
        await storage.update_model_rollup(PERIOD, "model-a", "Model A", "prov", 1.0, sample_usage_delta)
        await storage.update_model_rollup(PERIOD, "model-b", "Model B", "prov", 2.0, sample_usage_delta)

        results = await storage.get_model_usage(PERIOD)
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_sorted_by_cost_descending(self, storage, sample_usage_delta):
        await storage.update_model_rollup(PERIOD, "cheap", "Cheap", "p", 0.10, sample_usage_delta)
        await storage.update_model_rollup(PERIOD, "expensive", "Expensive", "p", 9.99, sample_usage_delta)
        await storage.update_model_rollup(PERIOD, "mid", "Mid", "p", 3.00, sample_usage_delta)

        results = await storage.get_model_usage(PERIOD)
        costs = [r["totalCost"] for r in results]
        assert costs[0] == pytest.approx(9.99)
        assert costs[1] == pytest.approx(3.00)
        assert costs[2] == pytest.approx(0.10)

    @pytest.mark.asyncio
    async def test_empty_period_returns_empty_list(self, storage):
        results = await storage.get_model_usage("2099-12")
        assert results == []

    @pytest.mark.asyncio
    async def test_pk_sk_removed(self, storage, sample_usage_delta):
        await storage.update_model_rollup(PERIOD, MODEL_ID, MODEL_NAME, PROVIDER, 1.0, sample_usage_delta)

        results = await storage.get_model_usage(PERIOD)
        for item in results:
            assert "PK" not in item
            assert "SK" not in item

    @pytest.mark.asyncio
    async def test_does_not_include_other_periods(self, storage, sample_usage_delta):
        await storage.update_model_rollup("2025-01", "m1", "M1", "p", 1.0, sample_usage_delta)
        await storage.update_model_rollup("2025-02", "m2", "M2", "p", 2.0, sample_usage_delta)

        results = await storage.get_model_usage("2025-01")
        assert len(results) == 1
        assert results[0]["modelName"] == "M1"
