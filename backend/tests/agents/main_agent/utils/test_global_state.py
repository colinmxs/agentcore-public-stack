"""Tests for deprecated global state functions.

Validates Requirements 22.1–22.2: Deprecated global state functions are safe no-ops.
"""

from agents.main_agent.utils.global_state import (
    get_global_stream_processor,
    set_global_stream_processor,
)


class TestSetGlobalStreamProcessor:
    """Requirement 22.1: set_global_stream_processor accepts any argument without raising."""

    def test_accepts_none(self):
        set_global_stream_processor(None)

    def test_accepts_string(self):
        set_global_stream_processor("some_processor")

    def test_accepts_object(self):
        set_global_stream_processor(object())

    def test_accepts_integer(self):
        set_global_stream_processor(42)


class TestGetGlobalStreamProcessor:
    """Requirement 22.2: get_global_stream_processor returns None."""

    def test_returns_none(self):
        assert get_global_stream_processor() is None

    def test_returns_none_after_set(self):
        set_global_stream_processor("anything")
        assert get_global_stream_processor() is None
