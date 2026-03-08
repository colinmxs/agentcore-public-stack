"""Quota models and builder functions tests (pure logic, no AWS)."""

import pytest
from unittest.mock import MagicMock


def _make_result(**kw):
    r = MagicMock()
    r.current_usage = kw.get("current_usage", 5.0)
    r.quota_limit = kw.get("quota_limit", 10.0)
    r.percentage_used = kw.get("percentage_used", 50.0)
    r.remaining = kw.get("remaining", 5.0)
    r.message = kw.get("message", "Quota exceeded")
    r.warning_level = kw.get("warning_level", "80%")
    tier = MagicMock()
    tier.period_type = kw.get("period_type", "monthly")
    tier.tier_name = kw.get("tier_name", "Pro")
    r.tier = tier
    return r


class TestQuotaModels:
    def test_quota_exceeded_response_fields(self):
        from apis.shared.quota import QuotaExceededResponse
        r = QuotaExceededResponse(
            message="Over limit", currentUsage=8.0, quotaLimit=10.0,
            percentageUsed=80.0, periodType="monthly",
        )
        assert r.current_usage == 8.0
        assert r.code == "rate_limit_exceeded"

    def test_quota_warning_event_sse(self):
        from apis.shared.quota import QuotaWarningEvent
        e = QuotaWarningEvent(
            warningLevel="80%", currentUsage=8.0, quotaLimit=10.0,
            percentageUsed=80.0, remaining=2.0, message="Warning",
        )
        sse = e.to_sse_format()
        assert "event: quota_warning" in sse
        assert '"warningLevel"' in sse

    def test_quota_exceeded_event_sse(self):
        from apis.shared.quota import QuotaExceededEvent
        e = QuotaExceededEvent(
            currentUsage=10.0, quotaLimit=10.0, percentageUsed=100.0,
            periodType="monthly", resetInfo="Resets in 5 days", message="Over",
        )
        sse = e.to_sse_format()
        assert "event: quota_exceeded" in sse

    def test_is_quota_enforcement_enabled(self, monkeypatch):
        monkeypatch.setenv("ENABLE_QUOTA_ENFORCEMENT", "true")
        # Module-level constant is already set, so test the function
        from apis.shared.quota import is_quota_enforcement_enabled
        # Just verify it returns a bool
        assert isinstance(is_quota_enforcement_enabled(), bool)


class TestQuotaBuilders:
    def test_build_quota_exceeded_response_monthly(self):
        from apis.shared.quota import build_quota_exceeded_response
        result = _make_result(period_type="monthly")
        resp = build_quota_exceeded_response(result)
        assert resp.current_usage == 5.0
        assert "day(s)" in resp.reset_info

    def test_build_quota_exceeded_response_daily(self):
        from apis.shared.quota import build_quota_exceeded_response
        result = _make_result(period_type="daily")
        resp = build_quota_exceeded_response(result)
        assert "midnight UTC" in resp.reset_info

    def test_build_quota_warning_event_with_level(self):
        from apis.shared.quota import build_quota_warning_event
        result = _make_result(warning_level="90%")
        event = build_quota_warning_event(result)
        assert event is not None
        assert event.warning_level == "90%"

    def test_build_quota_warning_event_none(self):
        from apis.shared.quota import build_quota_warning_event
        result = _make_result(warning_level="none")
        assert build_quota_warning_event(result) is None

    def test_build_quota_warning_event_null(self):
        from apis.shared.quota import build_quota_warning_event
        result = _make_result(warning_level=None)
        assert build_quota_warning_event(result) is None

    def test_build_quota_exceeded_event_monthly(self):
        from apis.shared.quota import build_quota_exceeded_event
        result = _make_result(period_type="monthly")
        event = build_quota_exceeded_event(result)
        assert "Pro" in event.message
        assert event.period_type == "monthly"

    def test_build_quota_exceeded_event_daily(self):
        from apis.shared.quota import build_quota_exceeded_event
        result = _make_result(period_type="daily")
        event = build_quota_exceeded_event(result)
        assert "midnight UTC" in event.reset_info

    def test_build_no_quota_configured_event(self):
        from apis.shared.quota import build_no_quota_configured_event
        result = _make_result()
        event = build_no_quota_configured_event(result)
        assert event.current_usage == 0.0
        assert "administrator" in event.message
