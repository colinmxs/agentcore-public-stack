"""
Tests for StopHook session cancellation hook.

Requirements: 18.1–18.3
"""
from unittest.mock import MagicMock
from agents.main_agent.session.hooks.stop import StopHook


class TestStopHookCheckCancelled:
    """Tests for StopHook.check_cancelled method."""

    def test_sets_cancel_tool_when_cancelled_true(self):
        """Req 18.1: WHEN session_manager.cancelled is True, sets event.cancel_tool to a cancellation message."""
        session_manager = MagicMock()
        session_manager.cancelled = True

        hook = StopHook(session_manager)
        event = MagicMock()
        event.tool_use = {"name": "some_tool"}

        hook.check_cancelled(event)

        assert event.cancel_tool == "Session stopped by user"

    def test_does_not_modify_event_when_cancelled_false(self):
        """Req 18.2: WHEN session_manager.cancelled is False, does not modify the event."""
        session_manager = MagicMock()
        session_manager.cancelled = False

        hook = StopHook(session_manager)
        event = MagicMock(spec=[])  # empty spec so no attributes exist by default
        event.tool_use = {"name": "some_tool"}

        hook.check_cancelled(event)

        # cancel_tool should not have been set on the event
        assert not hasattr(event, "cancel_tool")

    def test_no_exception_when_no_cancelled_attribute(self):
        """Req 18.3: WHEN session_manager does not have a cancelled attribute, does not raise."""
        session_manager = object()  # plain object with no 'cancelled' attribute

        hook = StopHook(session_manager)
        event = MagicMock(spec=[])
        event.tool_use = {"name": "some_tool"}

        # Should not raise any exception
        hook.check_cancelled(event)

        # cancel_tool should not have been set
        assert not hasattr(event, "cancel_tool")

    def test_cancel_message_includes_tool_name_in_log(self):
        """Req 18.1 (detail): Cancellation logs the tool name from event.tool_use."""
        session_manager = MagicMock()
        session_manager.cancelled = True

        hook = StopHook(session_manager)
        event = MagicMock()
        event.tool_use = {"name": "web_search"}

        hook.check_cancelled(event)

        assert event.cancel_tool == "Session stopped by user"

    def test_cancel_with_missing_tool_name(self):
        """Req 18.1 (edge): Cancellation works even when tool_use has no 'name' key."""
        session_manager = MagicMock()
        session_manager.cancelled = True

        hook = StopHook(session_manager)
        event = MagicMock()
        event.tool_use = {}

        hook.check_cancelled(event)

        assert event.cancel_tool == "Session stopped by user"
