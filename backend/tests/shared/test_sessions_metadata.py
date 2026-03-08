"""Task 10: Sessions metadata tests (moto DynamoDB)."""

import pytest
from apis.shared.sessions.models import SessionMetadata, MessageMetadata, TokenUsage, ModelInfo


def _make_session_metadata(session_id="s1", user_id="u1", **kw):
    defaults = dict(
        sessionId=session_id, userId=user_id, title="Test Session",
        status="active", createdAt="2026-01-01T00:00:00Z",
        lastMessageAt="2026-01-01T00:00:00Z", messageCount=1,
    )
    defaults.update(kw)
    return SessionMetadata(**defaults)


def _make_message_metadata(**kw):
    defaults = dict(
        token_usage=TokenUsage(inputTokens=100, outputTokens=50, totalTokens=150),
        model_info=ModelInfo(modelId="claude-3", modelName="Claude 3"),
        cost=0.0105,
    )
    defaults.update(kw)
    return MessageMetadata(**defaults)


class TestStoreMessageMetadata:
    @pytest.mark.asyncio
    async def test_store_cost_record(self, sessions_metadata_table):
        from apis.shared.sessions.metadata import store_message_metadata
        meta = _make_message_metadata()
        await store_message_metadata(session_id="s1", user_id="u1", message_id=1, message_metadata=meta)
        items = sessions_metadata_table.scan()["Items"]
        cost_items = [i for i in items if i["SK"].startswith("C#")]
        assert len(cost_items) == 1
        assert cost_items[0]["GSI_PK"] == "SESSION#s1"

    @pytest.mark.asyncio
    async def test_store_multiple_cost_records(self, sessions_metadata_table):
        from apis.shared.sessions.metadata import store_message_metadata
        for i in range(3):
            await store_message_metadata(session_id="s1", user_id="u1", message_id=i, message_metadata=_make_message_metadata())
        items = sessions_metadata_table.scan()["Items"]
        cost_items = [i for i in items if i["SK"].startswith("C#")]
        assert len(cost_items) == 3


class TestStoreSessionMetadata:
    @pytest.mark.asyncio
    async def test_create_session(self, sessions_metadata_table):
        from apis.shared.sessions.metadata import store_session_metadata, get_session_metadata
        meta = _make_session_metadata()
        await store_session_metadata(session_id="s1", user_id="u1", session_metadata=meta)
        result = await get_session_metadata("s1", "u1")
        assert result is not None
        assert result.title == "Test Session"

    @pytest.mark.asyncio
    async def test_update_session(self, sessions_metadata_table):
        from apis.shared.sessions.metadata import store_session_metadata, get_session_metadata
        await store_session_metadata(session_id="s1", user_id="u1", session_metadata=_make_session_metadata(title="V1"))
        await store_session_metadata(session_id="s1", user_id="u1", session_metadata=_make_session_metadata(title="V2", messageCount=5))
        result = await get_session_metadata("s1", "u1")
        assert result.title == "V2"


class TestGetSessionMetadata:
    @pytest.mark.asyncio
    async def test_get_nonexistent(self, sessions_metadata_table):
        from apis.shared.sessions.metadata import get_session_metadata
        result = await get_session_metadata("nope", "u1")
        assert result is None


class TestGetAllMessageMetadata:
    @pytest.mark.asyncio
    async def test_get_cost_records(self, sessions_metadata_table):
        from apis.shared.sessions.metadata import store_message_metadata, get_all_message_metadata
        await store_message_metadata(session_id="s1", user_id="u1", message_id=1, message_metadata=_make_message_metadata())
        result = await get_all_message_metadata("s1", "u1")
        assert len(result) >= 1
        assert any(isinstance(v, dict) for v in result.values())


class TestListUserSessions:
    @pytest.mark.asyncio
    async def test_list_sessions(self, sessions_metadata_table):
        from apis.shared.sessions.metadata import store_session_metadata, list_user_sessions
        for i in range(3):
            await store_session_metadata(
                session_id=f"s{i}", user_id="u1",
                session_metadata=_make_session_metadata(f"s{i}", lastMessageAt=f"2026-01-0{i+1}T00:00:00Z"),
            )
        sessions, token = await list_user_sessions("u1")
        assert len(sessions) == 3

    @pytest.mark.asyncio
    async def test_list_with_pagination(self, sessions_metadata_table):
        from apis.shared.sessions.metadata import store_session_metadata, list_user_sessions
        for i in range(5):
            await store_session_metadata(
                session_id=f"s{i}", user_id="u1",
                session_metadata=_make_session_metadata(f"s{i}", lastMessageAt=f"2026-01-0{i+1}T00:00:00Z"),
            )
        page1, token = await list_user_sessions("u1", limit=2)
        assert len(page1) == 2
        assert token is not None
        page2, _ = await list_user_sessions("u1", limit=2, next_token=token)
        assert len(page2) == 2

    @pytest.mark.asyncio
    async def test_list_empty(self, sessions_metadata_table):
        from apis.shared.sessions.metadata import list_user_sessions
        sessions, token = await list_user_sessions("u1")
        assert sessions == []
        assert token is None

    @pytest.mark.asyncio
    async def test_missing_env_raises(self, sessions_metadata_table, monkeypatch):
        monkeypatch.delenv("DYNAMODB_SESSIONS_METADATA_TABLE_NAME", raising=False)
        from apis.shared.sessions.metadata import list_user_sessions
        with pytest.raises(RuntimeError):
            await list_user_sessions("u1")
