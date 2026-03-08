"""
Tests for PreviewSessionManager — in-memory session storage for assistant preview.

Requirements: 14.1–14.7
"""
from unittest.mock import MagicMock

import pytest
from strands.types.session import SessionMessage

from agents.main_agent.session.preview_session_manager import (
    PreviewSessionManager,
    is_preview_session,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_session_message(text: str, role: str = "user") -> SessionMessage:
    """Create a minimal SessionMessage for testing."""
    return SessionMessage(
        message_id=text,
        message={"role": role, "content": [{"text": text}]},
    )


# ---------------------------------------------------------------------------
# Req 14.1 — Initialization
# ---------------------------------------------------------------------------

class TestPreviewSessionManagerInit:
    """Verify PreviewSessionManager initializes with zero messages."""

    def test_init_zero_messages(self, preview_session: PreviewSessionManager):
        """Req 14.1: message_count is 0 after construction."""
        assert preview_session.message_count == 0

    def test_init_messages_list_empty(self, preview_session: PreviewSessionManager):
        """Req 14.1: messages property returns empty list after construction."""
        assert preview_session.messages == []

    def test_init_stores_session_id(self):
        """Verify session_id and user_id are stored."""
        mgr = PreviewSessionManager(session_id="preview-abc", user_id="u1")
        assert mgr.session_id == "preview-abc"
        assert mgr.user_id == "u1"


# ---------------------------------------------------------------------------
# Req 14.2 — create_message
# ---------------------------------------------------------------------------

class TestCreateMessage:
    """Verify create_message stores messages and increments count."""

    def test_single_message(self, preview_session: PreviewSessionManager):
        """Req 14.2: After one create_message, message_count is 1."""
        msg = _make_session_message("hello")
        preview_session.create_message(preview_session.session_id, "default", msg)

        assert preview_session.message_count == 1

    def test_multiple_messages(self, preview_session: PreviewSessionManager):
        """Req 14.2: After N create_message calls, message_count is N."""
        for i in range(3):
            preview_session.create_message(
                preview_session.session_id,
                "default",
                _make_session_message(f"msg-{i}"),
            )

        assert preview_session.message_count == 3

    def test_message_stored_in_memory(self, preview_session: PreviewSessionManager):
        """Req 14.2: The stored message is retrievable."""
        msg = _make_session_message("stored")
        preview_session.create_message(preview_session.session_id, "default", msg)

        messages = preview_session.read_session(preview_session.session_id)
        assert len(messages) == 1
        assert messages[0].message_id == "stored"


# ---------------------------------------------------------------------------
# Req 14.3 — read_session returns a copy
# ---------------------------------------------------------------------------

class TestReadSession:
    """Verify read_session returns a copy, not a reference."""

    def test_returns_copy(self, preview_session: PreviewSessionManager):
        """Req 14.3: Mutating the returned list does not affect internal state."""
        msg = _make_session_message("original")
        preview_session.create_message(preview_session.session_id, "default", msg)

        returned = preview_session.read_session(preview_session.session_id)
        returned.clear()  # mutate the returned list

        assert preview_session.message_count == 1
        assert len(preview_session.read_session(preview_session.session_id)) == 1

    def test_empty_session_returns_empty_list(self, preview_session: PreviewSessionManager):
        """Req 14.3: read_session on empty session returns []."""
        assert preview_session.read_session(preview_session.session_id) == []


# ---------------------------------------------------------------------------
# Req 14.4 — clear_session
# ---------------------------------------------------------------------------

class TestClearSession:
    """Verify clear_session removes all messages."""

    def test_clear_resets_count(self, preview_session: PreviewSessionManager):
        """Req 14.4: After clear_session, message_count is 0."""
        for i in range(3):
            preview_session.create_message(
                preview_session.session_id,
                "default",
                _make_session_message(f"m{i}"),
            )
        assert preview_session.message_count == 3

        preview_session.clear_session()

        assert preview_session.message_count == 0

    def test_clear_removes_messages(self, preview_session: PreviewSessionManager):
        """Req 14.4: After clear_session, read_session returns []."""
        preview_session.create_message(
            preview_session.session_id,
            "default",
            _make_session_message("gone"),
        )
        preview_session.clear_session()

        assert preview_session.read_session(preview_session.session_id) == []


# ---------------------------------------------------------------------------
# Req 14.5 — is_preview_session
# ---------------------------------------------------------------------------

class TestIsPreviewSession:
    """Verify is_preview_session checks the 'preview-' prefix."""

    @pytest.mark.parametrize(
        "session_id",
        ["preview-abc", "preview-123", "preview-", "preview-test-session-001"],
    )
    def test_returns_true_for_preview_prefix(self, session_id: str):
        """Req 14.5: Returns True for IDs starting with 'preview-'."""
        assert is_preview_session(session_id) is True

    @pytest.mark.parametrize(
        "session_id",
        ["session-123", "abc", "Preview-abc", "PREVIEW-abc", "previewabc", ""],
    )
    def test_returns_false_for_non_preview(self, session_id: str):
        """Req 14.5: Returns False for IDs not starting with 'preview-'."""
        assert is_preview_session(session_id) is False


# ---------------------------------------------------------------------------
# Req 14.6 & 14.7 — _initialize_agent
# ---------------------------------------------------------------------------

class TestInitializeAgent:
    """Verify _initialize_agent populates or empties the agent's messages."""

    def test_with_existing_messages(self, preview_session: PreviewSessionManager, mock_agent: MagicMock):
        """Req 14.6: Agent messages populated from existing session messages."""
        msg = _make_session_message("hi")
        preview_session.create_message(preview_session.session_id, "default", msg)

        preview_session._initialize_agent(mock_agent)

        assert len(mock_agent.messages) == 1
        # The agent receives the inner message dict (via .message attribute)
        assert mock_agent.messages[0] == msg.message

    def test_with_multiple_messages(self, preview_session: PreviewSessionManager, mock_agent: MagicMock):
        """Req 14.6: All existing messages are loaded into the agent."""
        for i in range(4):
            preview_session.create_message(
                preview_session.session_id,
                "default",
                _make_session_message(f"turn-{i}"),
            )

        preview_session._initialize_agent(mock_agent)

        assert len(mock_agent.messages) == 4

    def test_with_no_messages(self, preview_session: PreviewSessionManager, mock_agent: MagicMock):
        """Req 14.7: Agent messages list is empty when no messages exist."""
        preview_session._initialize_agent(mock_agent)

        assert mock_agent.messages == []
