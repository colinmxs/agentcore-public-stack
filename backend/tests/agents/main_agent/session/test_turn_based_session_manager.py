"""
Tests for TurnBasedSessionManager — the core runtime loop for agent sessions.

Covers: initialization, message helpers, truncation (Stage 1), summary injection,
DynamoDB state persistence, LTM retrieval, initialization flow, post-turn update
(Stage 2), session interface, and property-based tests.
"""

import copy
import json
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from agents.main_agent.session.compaction_models import CompactionConfig, CompactionState

from .conftest import (
    TABLE_NAME,
    REGION,
    TEST_SESSION_ID,
    TEST_USER_ID,
    make_user_message,
    make_assistant_message,
    make_tool_use_message,
    make_tool_result_message,
    make_tool_result_json_message,
    make_tool_result_image_message,
    make_image_message,
    make_tool_use_string_input_message,
    make_conversation,
    seed_session_record,
)


# ===========================================================================
# Task 1 — Smoke test: fixtures instantiate correctly
# ===========================================================================

class TestFixturesSmoke:

    def test_make_session_manager_no_compaction(self, make_session_manager):
        mgr = make_session_manager()
        assert mgr.message_count == 0
        assert mgr.cancelled is False
        assert mgr.compaction_config is None

    def test_make_session_manager_with_compaction(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        assert mgr.compaction_config.enabled is True
        assert mgr.compaction_config.token_threshold == 1000

    def test_message_builders(self):
        assert make_user_message("hi")["role"] == "user"
        assert make_assistant_message("yo")["role"] == "assistant"
        assert "toolUse" in make_tool_use_message("t1", "calc", {"x": 1})["content"][0]
        assert "toolResult" in make_tool_result_message("t1", "ok")["content"][0]
        assert "json" in make_tool_result_json_message("t1", {"a": 1})["content"][0]["toolResult"]["content"][0]
        assert "image" in make_tool_result_image_message("t1")["content"][0]["toolResult"]["content"][0]
        assert "image" in make_image_message()["content"][0]
        conv = make_conversation(3)
        assert len(conv) == 6


# ===========================================================================
# Task 2 — Message processing helpers
# ===========================================================================

class TestHasToolResult:

    def test_message_with_tool_result(self, make_session_manager):
        mgr = make_session_manager()
        msg = make_tool_result_message("t1", "result text")
        assert mgr._has_tool_result(msg) is True

    def test_message_without_tool_result(self, make_session_manager):
        mgr = make_session_manager()
        assert mgr._has_tool_result(make_user_message("hello")) is False

    def test_empty_content(self, make_session_manager):
        mgr = make_session_manager()
        assert mgr._has_tool_result({"role": "user", "content": []}) is False

    def test_non_list_content(self, make_session_manager):
        mgr = make_session_manager()
        assert mgr._has_tool_result({"role": "user", "content": "string"}) is False


class TestFindValidCutoffIndices:

    def test_simple_conversation(self, make_session_manager):
        mgr = make_session_manager()
        messages = make_conversation(3)  # u, a, u, a, u, a
        indices = mgr._find_valid_cutoff_indices(messages)
        assert indices == [0, 2, 4]

    def test_tool_results_excluded(self, make_session_manager):
        mgr = make_session_manager()
        messages = [
            make_user_message("q1"),
            make_assistant_message("a1"),
            make_tool_result_message("t1", "result"),  # user role but tool result
            make_assistant_message("a2"),
            make_user_message("q2"),
        ]
        indices = mgr._find_valid_cutoff_indices(messages)
        assert indices == [0, 4]

    def test_empty_messages(self, make_session_manager):
        mgr = make_session_manager()
        assert mgr._find_valid_cutoff_indices([]) == []

    def test_only_assistant_messages(self, make_session_manager):
        mgr = make_session_manager()
        messages = [make_assistant_message("a1"), make_assistant_message("a2")]
        assert mgr._find_valid_cutoff_indices(messages) == []


class TestFindProtectedIndices:

    def test_protect_last_2_turns(self, make_session_manager):
        mgr = make_session_manager()
        messages = make_conversation(4)  # indices 0-7, turns at 0,2,4,6
        protected = mgr._find_protected_indices(messages, 2)
        # Last 2 turn starts are at index 4 and 6, so protect 4..7
        assert protected == set(range(4, 8))

    def test_zero_protected_turns(self, make_session_manager):
        mgr = make_session_manager()
        messages = make_conversation(3)
        assert mgr._find_protected_indices(messages, 0) == set()

    def test_more_protected_than_available(self, make_session_manager):
        mgr = make_session_manager()
        messages = make_conversation(2)  # 4 messages, 2 turns
        protected = mgr._find_protected_indices(messages, 10)
        # All messages protected since we only have 2 turns
        assert protected == set(range(0, 4))

    def test_no_valid_cutoffs(self, make_session_manager):
        mgr = make_session_manager()
        messages = [make_assistant_message("a1")]
        assert mgr._find_protected_indices(messages, 2) == set()


# ===========================================================================
# Task 3 — Tool content truncation (Stage 1)
# ===========================================================================

class TestTruncateToolContents:

    def test_image_replacement_in_message(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        messages = [make_image_message(b"x" * 100, "png")]
        result, count, saved = mgr._truncate_tool_contents(messages)
        assert count == 1
        assert "Image placeholder" in result[0]["content"][0]["text"]
        assert "image" not in result[0]["content"][0]

    def test_tool_use_dict_input_truncation(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        big_input = {"data": "x" * 200}
        messages = [make_tool_use_message("t1", "calc", big_input)]
        result, count, _ = mgr._truncate_tool_contents(messages)
        assert count == 1
        assert "_truncated" in result[0]["content"][0]["toolUse"]["input"]

    def test_tool_use_dict_input_under_threshold(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        small_input = {"x": 1}
        messages = [make_tool_use_message("t1", "calc", small_input)]
        result, count, _ = mgr._truncate_tool_contents(messages)
        assert count == 0
        assert result[0]["content"][0]["toolUse"]["input"] == small_input

    def test_tool_use_string_input_truncation(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        messages = [make_tool_use_string_input_message("t1", "run", "y" * 200)]
        result, count, _ = mgr._truncate_tool_contents(messages)
        assert count == 1
        assert "truncated" in result[0]["content"][0]["toolUse"]["input"]

    def test_tool_result_text_truncation(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        messages = [make_tool_result_message("t1", "z" * 200)]
        result, count, _ = mgr._truncate_tool_contents(messages)
        assert count == 1
        text = result[0]["content"][0]["toolResult"]["content"][0]["text"]
        assert "truncated" in text

    def test_tool_result_json_truncation(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        big_json = {"key": "v" * 200}
        messages = [make_tool_result_json_message("t1", big_json)]
        result, count, _ = mgr._truncate_tool_contents(messages)
        assert count == 1
        block = result[0]["content"][0]["toolResult"]["content"][0]
        assert "json" not in block
        assert "truncated" in block["text"]

    def test_tool_result_image_replacement(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        messages = [make_tool_result_image_message("t1", b"img" * 50)]
        result, count, _ = mgr._truncate_tool_contents(messages)
        assert count == 1
        block = result[0]["content"][0]["toolResult"]["content"][0]
        assert "Image placeholder" in block["text"]

    def test_protected_indices_skipped(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        messages = [
            make_tool_result_message("t1", "a" * 200),
            make_tool_result_message("t2", "b" * 200),
        ]
        result, count, _ = mgr._truncate_tool_contents(messages, protected_indices={1})
        assert count == 1  # only index 0 truncated
        # Index 1 should be unchanged
        assert result[1]["content"][0]["toolResult"]["content"][0]["text"] == "b" * 200

    def test_mixed_content_types(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        messages = [
            make_image_message(b"x" * 100),
            make_tool_use_message("t1", "calc", {"data": "d" * 200}),
            make_tool_result_message("t2", "r" * 200),
            make_tool_result_json_message("t3", {"big": "j" * 200}),
            make_tool_result_image_message("t4", b"i" * 100),
        ]
        result, count, _ = mgr._truncate_tool_contents(messages)
        assert count == 5

    def test_compaction_disabled_returns_unchanged(self, make_session_manager):
        mgr = make_session_manager()  # no compaction_config
        messages = [make_tool_result_message("t1", "a" * 200)]
        result, count, saved = mgr._truncate_tool_contents(messages)
        assert count == 0
        assert saved == 0

    def test_does_not_mutate_original(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        original = [make_tool_result_message("t1", "a" * 200)]
        original_copy = copy.deepcopy(original)
        mgr._truncate_tool_contents(original)
        assert original == original_copy


# ===========================================================================
# Task 4 — Summary injection
# ===========================================================================

class TestPrependSummary:

    def test_prepends_to_text_block(self, make_session_manager):
        mgr = make_session_manager()
        messages = [make_user_message("hello")]
        result = mgr._prepend_summary_to_first_message(messages, "summary text")
        text = result[0]["content"][0]["text"]
        assert "summary text" in text
        assert "hello" in text
        assert text.index("summary text") < text.index("hello")

    def test_inserts_text_block_when_missing(self, make_session_manager):
        mgr = make_session_manager()
        messages = [{"role": "user", "content": [{"image": {"format": "png", "source": {"bytes": b"x"}}}]}]
        result = mgr._prepend_summary_to_first_message(messages, "summary")
        assert result[0]["content"][0]["text"].startswith("<conversation_summary>")

    def test_non_user_first_message_unchanged(self, make_session_manager):
        mgr = make_session_manager()
        messages = [make_assistant_message("hi")]
        result = mgr._prepend_summary_to_first_message(messages, "summary")
        assert result == messages

    def test_empty_messages_unchanged(self, make_session_manager):
        mgr = make_session_manager()
        assert mgr._prepend_summary_to_first_message([], "summary") == []

    def test_empty_summary_unchanged(self, make_session_manager):
        mgr = make_session_manager()
        messages = [make_user_message("hello")]
        result = mgr._prepend_summary_to_first_message(messages, "")
        assert result == messages

    def test_does_not_mutate_original(self, make_session_manager):
        mgr = make_session_manager()
        original = [make_user_message("hello")]
        original_copy = copy.deepcopy(original)
        mgr._prepend_summary_to_first_message(original, "summary")
        assert original == original_copy


# ===========================================================================
# Task 5 — DynamoDB state persistence with moto
# ===========================================================================

class TestGetDynamoDBTable:

    def test_lazy_init_with_env_var(self, make_session_manager, compaction_config, dynamodb_sessions_table, monkeypatch):
        monkeypatch.setenv("DYNAMODB_SESSIONS_METADATA_TABLE_NAME", TABLE_NAME)
        mgr = make_session_manager(compaction_config=compaction_config)
        table = mgr._get_dynamodb_table()
        assert table is not None

    def test_returns_none_without_env_var(self, make_session_manager, compaction_config, monkeypatch):
        monkeypatch.delenv("DYNAMODB_SESSIONS_METADATA_TABLE_NAME", raising=False)
        mgr = make_session_manager(compaction_config=compaction_config)
        # Reset class-level cache
        from agents.main_agent.session.turn_based_session_manager import TurnBasedSessionManager
        TurnBasedSessionManager._dynamodb_table = None
        TurnBasedSessionManager._dynamodb_table_name = None
        table = mgr._get_dynamodb_table()
        assert table is None


class TestGetSessionViaGSI:

    def test_finds_session(self, make_session_manager, compaction_config, dynamodb_sessions_table):
        mgr = make_session_manager(compaction_config=compaction_config)
        seed_session_record(dynamodb_sessions_table, TEST_SESSION_ID, TEST_USER_ID)
        # Inject the moto table directly
        from agents.main_agent.session.turn_based_session_manager import TurnBasedSessionManager
        TurnBasedSessionManager._dynamodb_table = dynamodb_sessions_table
        item = mgr._get_session_via_gsi(dynamodb_sessions_table)
        assert item is not None
        assert item["sessionId"] == TEST_SESSION_ID

    def test_returns_none_when_missing(self, make_session_manager, compaction_config, dynamodb_sessions_table):
        mgr = make_session_manager(compaction_config=compaction_config)
        item = mgr._get_session_via_gsi(dynamodb_sessions_table)
        assert item is None

    def test_rejects_wrong_user(self, make_session_manager, compaction_config, dynamodb_sessions_table):
        mgr = make_session_manager(compaction_config=compaction_config, user_id="wrong-user")
        seed_session_record(dynamodb_sessions_table, TEST_SESSION_ID, TEST_USER_ID)
        item = mgr._get_session_via_gsi(dynamodb_sessions_table)
        assert item is None


class TestCompactionStatePersistence:

    def test_load_returns_default_when_no_session(self, make_session_manager, compaction_config, dynamodb_sessions_table, monkeypatch):
        monkeypatch.setenv("DYNAMODB_SESSIONS_METADATA_TABLE_NAME", TABLE_NAME)
        mgr = make_session_manager(compaction_config=compaction_config)
        from agents.main_agent.session.turn_based_session_manager import TurnBasedSessionManager
        TurnBasedSessionManager._dynamodb_table = dynamodb_sessions_table
        state = mgr._load_compaction_state()
        assert state.checkpoint == 0
        assert state.summary is None

    def test_load_returns_default_when_no_compaction_attr(self, make_session_manager, compaction_config, dynamodb_sessions_table, monkeypatch):
        monkeypatch.setenv("DYNAMODB_SESSIONS_METADATA_TABLE_NAME", TABLE_NAME)
        mgr = make_session_manager(compaction_config=compaction_config)
        from agents.main_agent.session.turn_based_session_manager import TurnBasedSessionManager
        TurnBasedSessionManager._dynamodb_table = dynamodb_sessions_table
        seed_session_record(dynamodb_sessions_table, TEST_SESSION_ID, TEST_USER_ID)
        state = mgr._load_compaction_state()
        assert state.checkpoint == 0

    def test_load_existing_state(self, make_session_manager, compaction_config, dynamodb_sessions_table, monkeypatch):
        monkeypatch.setenv("DYNAMODB_SESSIONS_METADATA_TABLE_NAME", TABLE_NAME)
        mgr = make_session_manager(compaction_config=compaction_config)
        from agents.main_agent.session.turn_based_session_manager import TurnBasedSessionManager
        TurnBasedSessionManager._dynamodb_table = dynamodb_sessions_table
        seed_session_record(
            dynamodb_sessions_table, TEST_SESSION_ID, TEST_USER_ID,
            compaction={"checkpoint": 5, "summary": "test summary", "lastInputTokens": 999},
        )
        state = mgr._load_compaction_state()
        assert state.checkpoint == 5
        assert state.summary == "test summary"
        assert state.last_input_tokens == 999

    def test_save_and_load_roundtrip(self, make_session_manager, compaction_config, dynamodb_sessions_table, monkeypatch):
        monkeypatch.setenv("DYNAMODB_SESSIONS_METADATA_TABLE_NAME", TABLE_NAME)
        mgr = make_session_manager(compaction_config=compaction_config)
        from agents.main_agent.session.turn_based_session_manager import TurnBasedSessionManager
        TurnBasedSessionManager._dynamodb_table = dynamodb_sessions_table
        seed_session_record(dynamodb_sessions_table, TEST_SESSION_ID, TEST_USER_ID)

        state = CompactionState(checkpoint=10, summary="saved summary", last_input_tokens=5000)
        mgr._save_compaction_state(state)

        loaded = mgr._load_compaction_state()
        assert loaded.checkpoint == 10
        assert loaded.summary == "saved summary"
        assert loaded.last_input_tokens == 5000
        assert loaded.updated_at is not None

    def test_load_returns_default_when_no_user_id(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config, user_id=None)
        state = mgr._load_compaction_state()
        assert state.checkpoint == 0

    def test_load_returns_default_when_compaction_disabled(self, make_session_manager, compaction_config_disabled):
        mgr = make_session_manager(compaction_config=compaction_config_disabled)
        state = mgr._load_compaction_state()
        assert state.checkpoint == 0

    def test_save_noop_when_compaction_disabled(self, make_session_manager, compaction_config_disabled):
        mgr = make_session_manager(compaction_config=compaction_config_disabled)
        # Should not raise
        mgr._save_compaction_state(CompactionState(checkpoint=5))


# ===========================================================================
# Task 6 — LTM summary retrieval
# ===========================================================================

class TestGetSummarizationStrategyId:

    def test_returns_cached_id(self, make_session_manager):
        mgr = make_session_manager(summarization_strategy_id="strat-123")
        assert mgr._get_summarization_strategy_id() == "strat-123"

    def test_discovers_from_memory_config(self, make_session_manager):
        mgr = make_session_manager()
        mgr.base_manager.memory_client.gmcp_client.get_memory.return_value = {
            "memory": {
                "strategies": [
                    {"type": "EXTRACTION", "strategyId": "ext-1"},
                    {"type": "SUMMARIZATION", "strategyId": "sum-1"},
                ]
            }
        }
        assert mgr._get_summarization_strategy_id() == "sum-1"
        # Verify caching
        assert mgr.summarization_strategy_id == "sum-1"

    def test_returns_none_when_no_summarization_strategy(self, make_session_manager):
        mgr = make_session_manager()
        mgr.base_manager.memory_client.gmcp_client.get_memory.return_value = {
            "memory": {"strategies": [{"type": "EXTRACTION", "strategyId": "ext-1"}]}
        }
        assert mgr._get_summarization_strategy_id() is None

    def test_returns_none_on_error(self, make_session_manager):
        mgr = make_session_manager()
        mgr.base_manager.memory_client.gmcp_client.get_memory.side_effect = Exception("fail")
        assert mgr._get_summarization_strategy_id() is None


class TestRetrieveSessionSummaries:

    def test_returns_empty_when_no_strategy(self, make_session_manager):
        mgr = make_session_manager()
        mgr.base_manager.memory_client.gmcp_client.get_memory.return_value = {
            "memory": {"strategies": []}
        }
        assert mgr._retrieve_session_summaries() == []

    @patch("boto3.client")
    def test_parses_memory_records(self, mock_client_fn, make_session_manager):
        mgr = make_session_manager(summarization_strategy_id="strat-1")
        mock_client = MagicMock()
        mock_client_fn.return_value = mock_client
        mock_client.list_memory_records.return_value = {
            "memoryRecordSummaries": [
                {"content": {"text": "Summary point 1"}},
                {"content": {"text": "Summary point 2"}},
                {"content": {"text": "  "}},  # blank — should be skipped
            ]
        }
        summaries = mgr._retrieve_session_summaries()
        assert summaries == ["Summary point 1", "Summary point 2"]

    @patch("boto3.client")
    def test_returns_empty_on_error(self, mock_client_fn, make_session_manager):
        mgr = make_session_manager(summarization_strategy_id="strat-1")
        mock_client_fn.side_effect = Exception("boom")
        assert mgr._retrieve_session_summaries() == []


class TestGenerateFallbackSummary:

    def test_extracts_user_messages(self, make_session_manager):
        mgr = make_session_manager()
        messages = [
            make_user_message("How do I deploy?"),
            make_assistant_message("Use CDK"),
            make_user_message("What about testing?"),
        ]
        summary = mgr._generate_fallback_summary(messages)
        assert "deploy" in summary.lower()
        assert "testing" in summary.lower()

    def test_skips_tool_results(self, make_session_manager):
        mgr = make_session_manager()
        messages = [
            make_user_message("question"),
            make_tool_result_message("t1", "tool output"),
        ]
        summary = mgr._generate_fallback_summary(messages)
        assert "question" in summary.lower()
        # tool result user message has toolResult in block, not text — so it's skipped
        assert "tool output" not in (summary or "")

    def test_skips_xml_prefixed_lines(self, make_session_manager):
        mgr = make_session_manager()
        messages = [make_user_message("<system>ignore this")]
        summary = mgr._generate_fallback_summary(messages)
        assert summary is None

    def test_empty_messages_returns_none(self, make_session_manager):
        mgr = make_session_manager()
        assert mgr._generate_fallback_summary([]) is None

    def test_limits_to_10_points(self, make_session_manager):
        mgr = make_session_manager()
        messages = [make_user_message(f"Topic {i}") for i in range(20)]
        summary = mgr._generate_fallback_summary(messages)
        assert summary.count("- User asked about:") == 10


# ===========================================================================
# Task 7 — Initialization flow
# ===========================================================================

class TestInitialize:

    def test_compaction_disabled_delegates_only(self, make_session_manager):
        mgr = make_session_manager()
        agent = MagicMock()
        agent.messages = [make_user_message("hi")]
        mgr.initialize(agent)
        mgr._mock_base.initialize.assert_called_once_with(agent)

    def test_compaction_enabled_empty_messages(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        agent = MagicMock()
        agent.messages = []
        mgr.initialize(agent)
        assert mgr.compaction_state is not None
        assert mgr.compaction_state.checkpoint == 0

    def test_compaction_no_checkpoint_applies_truncation(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        # Patch _load_compaction_state to return default (no checkpoint)
        mgr._load_compaction_state = lambda: CompactionState()
        agent = MagicMock()
        agent.messages = [
            make_user_message("q1"),
            make_tool_result_message("t1", "x" * 200),
        ]
        mgr.initialize(agent)
        # Messages should still be length 2 (truncation doesn't remove messages)
        assert len(agent.messages) == 2

    def test_compaction_with_checkpoint_slices_messages(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        mgr._load_compaction_state = lambda: CompactionState(checkpoint=4, summary="old context")
        agent = MagicMock()
        agent.messages = make_conversation(4)  # 8 messages
        mgr.initialize(agent)
        # Should have sliced from index 4 onward = 4 messages
        assert len(agent.messages) == 4
        # Summary should be prepended to first message
        first_text = agent.messages[0]["content"][0]["text"]
        assert "old context" in first_text

    def test_compaction_checkpoint_plus_truncation(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        mgr._load_compaction_state = lambda: CompactionState(checkpoint=2)
        agent = MagicMock()
        # Build messages where post-checkpoint messages have truncatable content
        agent.messages = [
            make_user_message("old1"),
            make_assistant_message("old2"),
            make_user_message("new1"),
            make_tool_result_message("t1", "r" * 200),
        ]
        mgr.initialize(agent)
        # Sliced from index 2: 2 messages remain
        assert len(agent.messages) == 2


# ===========================================================================
# Task 8 — Post-turn update (Stage 2, async)
# ===========================================================================

class TestUpdateAfterTurn:

    @pytest.mark.asyncio
    async def test_noop_when_compaction_disabled(self, make_session_manager):
        mgr = make_session_manager()
        await mgr.update_after_turn(50000)
        # No compaction state should be set
        assert mgr.compaction_state is None

    @pytest.mark.asyncio
    async def test_below_threshold_saves_token_count(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        mgr.compaction_state = CompactionState()
        mgr._save_compaction_state = MagicMock()
        await mgr.update_after_turn(500)  # below 1000 threshold
        assert mgr.compaction_state.last_input_tokens == 500
        mgr._save_compaction_state.assert_called_once()

    @pytest.mark.asyncio
    async def test_above_threshold_creates_checkpoint(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        mgr.compaction_state = CompactionState()
        mgr._save_compaction_state = MagicMock()
        mgr._retrieve_session_summaries = MagicMock(return_value=[])

        # Return 5 turns of messages (10 messages) as dicts
        messages = make_conversation(5)
        mgr._mock_base.list_messages.return_value = messages

        await mgr.update_after_turn(2000)  # above 1000 threshold

        # With 5 turns and protected_turns=2, checkpoint should be at turn 3 start (index 6)
        assert mgr.compaction_state.checkpoint == 6
        assert mgr.compaction_state.last_input_tokens == 2000

    @pytest.mark.asyncio
    async def test_not_enough_turns_keeps_all(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        mgr.compaction_state = CompactionState()
        mgr._save_compaction_state = MagicMock()

        # Only 2 turns = protected_turns, so no compaction possible
        mgr._mock_base.list_messages.return_value = make_conversation(2)

        await mgr.update_after_turn(2000)
        assert mgr.compaction_state.checkpoint == 0

    @pytest.mark.asyncio
    async def test_checkpoint_unchanged_no_update(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        mgr.compaction_state = CompactionState(checkpoint=6)
        mgr._save_compaction_state = MagicMock()

        # Same 5 turns — checkpoint would be 6 again, same as current
        mgr._mock_base.list_messages.return_value = make_conversation(5)

        await mgr.update_after_turn(2000)
        # Checkpoint should remain 6 (no update)
        assert mgr.compaction_state.checkpoint == 6

    @pytest.mark.asyncio
    async def test_uses_ltm_summaries_when_available(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        mgr.compaction_state = CompactionState()
        mgr._save_compaction_state = MagicMock()
        mgr._retrieve_session_summaries = MagicMock(return_value=["LTM summary 1", "LTM summary 2"])

        mgr._mock_base.list_messages.return_value = make_conversation(5)

        await mgr.update_after_turn(2000)
        assert "LTM summary 1" in mgr.compaction_state.summary
        assert "LTM summary 2" in mgr.compaction_state.summary

    @pytest.mark.asyncio
    async def test_falls_back_to_generated_summary(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        mgr.compaction_state = CompactionState()
        mgr._save_compaction_state = MagicMock()
        mgr._retrieve_session_summaries = MagicMock(return_value=[])

        mgr._mock_base.list_messages.return_value = make_conversation(5)

        await mgr.update_after_turn(2000)
        assert mgr.compaction_state.summary is not None
        assert "Previous conversation topics" in mgr.compaction_state.summary

    @pytest.mark.asyncio
    async def test_message_fetch_failure_graceful(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        mgr.compaction_state = CompactionState()
        mgr._save_compaction_state = MagicMock()
        mgr._mock_base.list_messages.side_effect = Exception("network error")

        await mgr.update_after_turn(2000)
        # Should save state and not raise
        mgr._save_compaction_state.assert_called_once()
        assert mgr.compaction_state.checkpoint == 0

    @pytest.mark.asyncio
    async def test_no_messages_skips_checkpoint(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        mgr.compaction_state = CompactionState()
        mgr._save_compaction_state = MagicMock()
        mgr._mock_base.list_messages.return_value = []

        await mgr.update_after_turn(2000)
        assert mgr.compaction_state.checkpoint == 0

    @pytest.mark.asyncio
    async def test_initializes_compaction_state_if_none(self, make_session_manager, compaction_config):
        mgr = make_session_manager(compaction_config=compaction_config)
        mgr.compaction_state = None
        mgr._save_compaction_state = MagicMock()

        await mgr.update_after_turn(500)
        assert mgr.compaction_state is not None
        assert mgr.compaction_state.last_input_tokens == 500


# ===========================================================================
# Task 9 — Session interface
# ===========================================================================

class TestFlush:

    def test_returns_last_index_when_messages_exist(self, make_session_manager):
        mgr = make_session_manager()
        mgr.message_count = 5
        assert mgr.flush() == 4

    def test_returns_none_when_empty(self, make_session_manager):
        mgr = make_session_manager()
        assert mgr.flush() is None


class TestAppendMessage:

    def test_delegates_and_increments(self, make_session_manager):
        mgr = make_session_manager()
        agent = MagicMock()
        msg = {"role": "user", "content": [{"text": "hi"}]}
        mgr.append_message(msg, agent)
        mgr._mock_base.append_message.assert_called_once_with(msg, agent)
        assert mgr.message_count == 1

    def test_cancelled_skips_delegation(self, make_session_manager):
        mgr = make_session_manager()
        mgr.cancelled = True
        agent = MagicMock()
        msg = {"role": "user", "content": [{"text": "hi"}]}
        mgr.append_message(msg, agent)
        mgr._mock_base.append_message.assert_not_called()
        assert mgr.message_count == 0

    def test_increments_multiple_times(self, make_session_manager):
        mgr = make_session_manager()
        agent = MagicMock()
        for i in range(3):
            mgr.append_message({"role": "user", "content": [{"text": f"m{i}"}]}, agent)
        assert mgr.message_count == 3


class TestRegisterHooks:

    def test_registers_all_event_types(self, make_session_manager):
        mgr = make_session_manager()
        registry = MagicMock()
        mgr.register_hooks(registry)

        # Should have 5 add_callback calls:
        # AgentInitializedEvent, MessageAddedEvent (append), MessageAddedEvent (sync),
        # AfterInvocationEvent (sync), MessageAddedEvent (LTM)
        assert registry.add_callback.call_count == 5

    def test_init_hook_calls_our_initialize(self, make_session_manager):
        mgr = make_session_manager()
        registry = MagicMock()
        mgr.register_hooks(registry)

        # First callback registered is for AgentInitializedEvent
        first_call = registry.add_callback.call_args_list[0]
        callback = first_call[0][1]

        # Simulate the event
        event = MagicMock()
        event.agent = MagicMock()
        event.agent.messages = []

        with patch.object(mgr, "initialize") as mock_init:
            callback(event)
            mock_init.assert_called_once_with(event.agent)

    def test_message_hook_calls_our_append(self, make_session_manager):
        mgr = make_session_manager()
        registry = MagicMock()
        mgr.register_hooks(registry)

        # Second callback is MessageAddedEvent -> append_message
        second_call = registry.add_callback.call_args_list[1]
        callback = second_call[0][1]

        event = MagicMock()
        event.message = {"role": "user", "content": [{"text": "hi"}]}
        event.agent = MagicMock()

        with patch.object(mgr, "append_message") as mock_append:
            callback(event)
            mock_append.assert_called_once_with(event.message, event.agent)


class TestGetattr:

    def test_delegates_unknown_attributes(self, make_session_manager):
        mgr = make_session_manager()
        mgr._mock_base.some_method.return_value = "delegated"
        assert mgr.some_method() == "delegated"

    def test_delegates_unknown_property(self, make_session_manager):
        mgr = make_session_manager()
        mgr._mock_base.some_prop = 42
        assert mgr.some_prop == 42


# ===========================================================================
# Task 10 — Property-based tests
# ===========================================================================

try:
    from hypothesis import given, settings, HealthCheck, strategies as st

    _HAS_HYPOTHESIS = True
except ImportError:
    _HAS_HYPOTHESIS = False

if _HAS_HYPOTHESIS:

    # Strategy: generate a list of messages with random content types
    def _st_message_list():
        """Strategy that generates a list of messages with various content types."""
        text_msg = st.builds(
            lambda t: make_user_message(t),
            st.text(min_size=1, max_size=300),
        )
        assistant_msg = st.builds(
            lambda t: make_assistant_message(t),
            st.text(min_size=1, max_size=300),
        )
        tool_result_msg = st.builds(
            lambda t: make_tool_result_message("t1", t),
            st.text(min_size=1, max_size=300),
        )
        image_msg = st.just(make_image_message(b"x" * 50))
        return st.lists(
            st.one_of(text_msg, assistant_msg, tool_result_msg, image_msg),
            min_size=1,
            max_size=20,
        )

    class TestTruncationProperties:

        @given(messages=_st_message_list())
        @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
        def test_truncation_never_increases_message_count(self, messages, make_session_manager, compaction_config):
            mgr = make_session_manager(compaction_config=compaction_config)
            result, _, _ = mgr._truncate_tool_contents(messages)
            assert len(result) == len(messages)

        @given(messages=_st_message_list())
        @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
        def test_protected_indices_never_modified(self, messages, make_session_manager, compaction_config):
            mgr = make_session_manager(compaction_config=compaction_config)
            protected = set(range(len(messages)))  # protect everything
            original = copy.deepcopy(messages)
            result, count, _ = mgr._truncate_tool_contents(messages, protected_indices=protected)
            assert count == 0
            assert result == original
