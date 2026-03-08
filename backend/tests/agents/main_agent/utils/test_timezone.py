"""
Tests for timezone utilities.
Requirements: 21.1–21.3
"""

import re
from unittest.mock import patch

import pytest

from agents.main_agent.utils.timezone import get_current_date_pacific


# Regex for "YYYY-MM-DD (DayName) HH:00 TZ"
DATE_FORMAT_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2} "           # YYYY-MM-DD
    r"\([A-Z][a-z]+\) "              # (DayName)
    r"\d{2}:00 "                     # HH:00
    r"[A-Z]{3,4}$"                   # TZ abbreviation
)

VALID_DAYS = {"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}


class TestGetCurrentDatePacific:
    """Req 21.1: Verify format matches 'YYYY-MM-DD (DayName) HH:00 TZ'."""

    def test_format_matches_expected_pattern(self):
        result = get_current_date_pacific()
        assert DATE_FORMAT_RE.match(result), f"Output '{result}' does not match expected format"

    def test_contains_valid_day_name(self):
        result = get_current_date_pacific()
        day = re.search(r"\((\w+)\)", result).group(1)
        assert day in VALID_DAYS, f"Day '{day}' is not a valid day name"

    def test_hour_is_zero_padded_with_00_minutes(self):
        result = get_current_date_pacific()
        hour_match = re.search(r"(\d{2}):00", result)
        assert hour_match is not None
        hour = int(hour_match.group(1))
        assert 0 <= hour <= 23


class TestTimezoneAbbreviation:
    """Req 21.2: Verify timezone abbreviation is PST or PDT."""

    def test_timezone_is_pst_or_pdt(self):
        result = get_current_date_pacific()
        tz = result.split()[-1]
        assert tz in ("PST", "PDT"), f"Timezone '{tz}' is not PST or PDT"


class TestUTCFallback:
    """Req 21.3: Verify UTC fallback when timezone libraries unavailable."""

    def test_falls_back_to_utc_when_timezone_unavailable(self):
        with patch("agents.main_agent.utils.timezone.TIMEZONE_AVAILABLE", False):
            result = get_current_date_pacific()
        assert result.endswith("UTC"), f"Expected UTC fallback, got '{result}'"
        assert DATE_FORMAT_RE.match(result), f"UTC fallback '{result}' does not match format"

    def test_utc_fallback_format_matches(self):
        with patch("agents.main_agent.utils.timezone.TIMEZONE_AVAILABLE", False):
            result = get_current_date_pacific()
        # Should still have YYYY-MM-DD (DayName) HH:00 UTC
        parts = result.split()
        assert len(parts) == 4
        assert parts[3] == "UTC"
