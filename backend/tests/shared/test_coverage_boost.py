"""Messages pure function tests + OAuth service extended tests + state store tests."""

import base64
import pytest
from unittest.mock import MagicMock, AsyncMock, patch


class TestMessagesPureFunctions:
    """Cover _ensure_image_base64, _ensure_document_base64, _convert_content_block, etc."""

    def test_ensure_image_base64_raw_bytes(self):
        from apis.shared.sessions.messages import _ensure_image_base64
        result = _ensure_image_base64({"source": {"bytes": b"\x89PNG"}, "format": "png"})
        assert result["format"] == "png"
        assert result["data"] == base64.b64encode(b"\x89PNG").decode()

    def test_ensure_image_base64_string_bytes(self):
        from apis.shared.sessions.messages import _ensure_image_base64
        result = _ensure_image_base64({"source": {"bytes": "already_b64"}, "format": "jpg"})
        assert result["data"] == "already_b64"

    def test_ensure_image_base64_already_frontend(self):
        from apis.shared.sessions.messages import _ensure_image_base64
        data = {"format": "png", "data": "abc123"}
        assert _ensure_image_base64(data) is data

    def test_ensure_image_base64_empty(self):
        from apis.shared.sessions.messages import _ensure_image_base64
        assert _ensure_image_base64({}) == {}
        assert _ensure_image_base64(None) is None

    def test_ensure_document_base64_raw_bytes(self):
        from apis.shared.sessions.messages import _ensure_document_base64
        result = _ensure_document_base64({"source": {"bytes": b"PDF"}, "format": "pdf", "name": "doc.pdf"})
        assert result["data"] == base64.b64encode(b"PDF").decode()
        assert result["name"] == "doc.pdf"

    def test_ensure_document_base64_string_bytes(self):
        from apis.shared.sessions.messages import _ensure_document_base64
        result = _ensure_document_base64({"source": {"bytes": "b64str"}, "format": "txt", "name": "f.txt"})
        assert result["data"] == "b64str"

    def test_ensure_document_base64_already_frontend(self):
        from apis.shared.sessions.messages import _ensure_document_base64
        data = {"format": "pdf", "data": "abc", "name": "f.pdf"}
        assert _ensure_document_base64(data) is data

    def test_ensure_document_base64_empty(self):
        from apis.shared.sessions.messages import _ensure_document_base64
        assert _ensure_document_base64(None) is None

    def test_convert_content_block_text(self):
        from apis.shared.sessions.messages import _convert_content_block
        mc = _convert_content_block({"text": "hello"})
        assert mc.type == "text"
        assert mc.text == "hello"

    def test_convert_content_block_tool_use(self):
        from apis.shared.sessions.messages import _convert_content_block
        mc = _convert_content_block({"toolUse": {"name": "calc", "input": {}}})
        assert mc.type == "toolUse"

    def test_convert_content_block_tool_result(self):
        from apis.shared.sessions.messages import _convert_content_block
        mc = _convert_content_block({"toolResult": {"content": [{"text": "ok"}]}})
        assert mc.type == "toolResult"

    def test_convert_content_block_image(self):
        from apis.shared.sessions.messages import _convert_content_block
        mc = _convert_content_block({"image": {"format": "png", "data": "abc"}})
        assert mc.type == "image"

    def test_convert_content_block_document(self):
        from apis.shared.sessions.messages import _convert_content_block
        mc = _convert_content_block({"document": {"format": "pdf", "data": "abc"}})
        assert mc.type == "document"

    def test_convert_content_block_reasoning(self):
        from apis.shared.sessions.messages import _convert_content_block
        mc = _convert_content_block({"reasoningContent": {"reasoningText": "thinking..."}})
        assert mc.type == "reasoningContent"

    def test_convert_content_block_unknown(self):
        from apis.shared.sessions.messages import _convert_content_block
        mc = _convert_content_block({"weirdKey": "value"})
        assert mc.type == "text"

    def test_convert_content_block_non_dict(self):
        from apis.shared.sessions.messages import _convert_content_block
        mc = _convert_content_block("plain string")
        assert mc.type == "text"
        assert mc.text == "plain string"

    def test_process_tool_result_content_with_image(self):
        from apis.shared.sessions.messages import _process_tool_result_content
        result = _process_tool_result_content({
            "content": [{"image": {"source": {"bytes": b"img"}, "format": "png"}}]
        })
        assert result["content"][0]["image"]["data"] == base64.b64encode(b"img").decode()

    def test_process_tool_result_content_empty(self):
        from apis.shared.sessions.messages import _process_tool_result_content
        assert _process_tool_result_content(None) is None
        assert _process_tool_result_content({}) == {}

    def test_get_message_role_dict(self):
        from apis.shared.sessions.messages import _get_message_role
        assert _get_message_role({"role": "user"}) == "user"
        assert _get_message_role({}) == "assistant"

    def test_get_message_role_object(self):
        from apis.shared.sessions.messages import _get_message_role
        msg = MagicMock()
        msg.message = {"role": "user"}
        assert _get_message_role(msg) == "user"

    def test_get_message_role_object_nested(self):
        from apis.shared.sessions.messages import _get_message_role
        inner = MagicMock()
        inner.role = "assistant"
        msg = MagicMock()
        msg.message = inner
        assert _get_message_role(msg) == "assistant"

    def test_convert_message_dict(self):
        from apis.shared.sessions.messages import _convert_message
        msg = {"role": "user", "content": [{"text": "hi"}], "timestamp": "2026-01-01"}
        result = _convert_message(msg)
        assert result.role == "user"
        assert len(result.content) == 1

    def test_convert_message_string_content(self):
        from apis.shared.sessions.messages import _convert_message
        msg = {"role": "user", "content": "hello"}
        result = _convert_message(msg)
        assert result.content[0].text == "hello"

    def test_convert_message_with_metadata_dict(self):
        from apis.shared.sessions.messages import _convert_message
        msg = {"role": "assistant", "content": [{"text": "hi"}]}
        meta = {"totalTokens": 100, "inputTokens": 50, "outputTokens": 50}
        result = _convert_message(msg, metadata=meta)
        assert result.metadata is not None

    def test_convert_message_session_message_object(self):
        from apis.shared.sessions.messages import _convert_message
        msg = MagicMock()
        msg.message = {"role": "user", "content": [{"text": "hi"}]}
        msg.created_at = "2026-01-01"
        result = _convert_message(msg)
        assert result.role == "user"

    def test_apply_pagination_no_limit(self):
        from apis.shared.sessions.messages import _apply_pagination, Message, MessageContent
        msgs = [Message(role="user", content=[MessageContent(type="text", text=f"m{i}")]) for i in range(5)]
        result, token = _apply_pagination(msgs)
        assert len(result) == 5
        assert token is None

    def test_apply_pagination_with_limit(self):
        from apis.shared.sessions.messages import _apply_pagination, Message, MessageContent
        msgs = [Message(role="user", content=[MessageContent(type="text", text=f"m{i}")]) for i in range(10)]
        result, token = _apply_pagination(msgs, limit=3)
        assert len(result) == 3
        assert token is not None

    def test_apply_pagination_with_token(self):
        from apis.shared.sessions.messages import _apply_pagination, Message, MessageContent
        msgs = [Message(role="user", content=[MessageContent(type="text", text=f"m{i}")]) for i in range(10)]
        token = base64.b64encode(b"5").decode()
        result, _ = _apply_pagination(msgs, next_token=token)
        assert len(result) == 5

    def test_apply_pagination_invalid_token(self):
        from apis.shared.sessions.messages import _apply_pagination, Message, MessageContent
        msgs = [Message(role="user", content=[MessageContent(type="text", text="m")]) for _ in range(3)]
        result, _ = _apply_pagination(msgs, next_token="!!!invalid!!!")
        assert len(result) == 3  # falls back to start

    def test_convert_message_to_response(self):
        from apis.shared.sessions.messages import _convert_message_to_response, Message, MessageContent
        msg = Message(role="user", content=[MessageContent(type="text", text="hi")], timestamp="2026-01-01")
        resp = _convert_message_to_response(msg, "s1", 0)
        assert resp.id == "msg-s1-0"
        assert resp.role == "user"


class TestOAuthServiceExtended:
    """Cover generate_pkce_pair, state management, disconnect, get_user_connections."""

    def test_generate_pkce_pair(self):
        from apis.shared.oauth.service import generate_pkce_pair
        verifier, challenge = generate_pkce_pair()
        assert len(verifier) > 20
        assert len(challenge) > 20
        assert verifier != challenge

    @pytest.mark.asyncio
    async def test_disconnect(self, oauth_providers_table, oauth_tokens_table, secrets_manager, kms_key_arn, monkeypatch):
        monkeypatch.setenv("OAUTH_CALLBACK_URL", "http://localhost/callback")
        from apis.shared.oauth.service import OAuthService
        from apis.shared.oauth.provider_repository import OAuthProviderRepository
        from apis.shared.oauth.token_repository import OAuthTokenRepository
        from apis.shared.oauth.encryption import TokenEncryptionService
        from apis.shared.oauth.token_cache import TokenCache
        from apis.shared.oauth.models import OAuthUserToken, OAuthConnectionStatus

        pr = OAuthProviderRepository(table_name="test-oauth-providers", secrets_arn="oauth-client-secrets", region="us-east-1")
        tr = OAuthTokenRepository(table_name="test-oauth-user-tokens", region="us-east-1")
        enc = TokenEncryptionService(key_arn=kms_key_arn, region="us-east-1")
        cache = TokenCache()

        # Save a token
        token = OAuthUserToken(
            user_id="u1", provider_id="github",
            access_token_encrypted=enc.encrypt("tok123"),
            status=OAuthConnectionStatus.CONNECTED,
            connected_at="2026-01-01",
        )
        await tr.save_token(token)

        svc = OAuthService(provider_repo=pr, token_repo=tr, encryption_service=enc, token_cache=cache)
        assert await svc.disconnect("u1", "github") is True
        assert await svc.disconnect("u1", "github") is False  # already deleted

    @pytest.mark.asyncio
    async def test_get_decrypted_token_cached(self, oauth_tokens_table, monkeypatch):
        monkeypatch.setenv("OAUTH_CALLBACK_URL", "http://localhost/callback")
        from apis.shared.oauth.service import OAuthService
        from apis.shared.oauth.token_cache import TokenCache

        cache = TokenCache()
        cache.set("u1", "github", "cached_token")
        svc = OAuthService(token_cache=cache)
        result = await svc.get_decrypted_token("u1", "github")
        assert result == "cached_token"

    @pytest.mark.asyncio
    async def test_get_user_connections(self, oauth_providers_table, oauth_tokens_table, secrets_manager, kms_key_arn, monkeypatch):
        monkeypatch.setenv("OAUTH_CALLBACK_URL", "http://localhost/callback")
        from apis.shared.oauth.service import OAuthService
        from apis.shared.oauth.provider_repository import OAuthProviderRepository
        from apis.shared.oauth.token_repository import OAuthTokenRepository
        from apis.shared.oauth.encryption import TokenEncryptionService
        from apis.shared.oauth.token_cache import TokenCache
        from apis.shared.oauth.models import OAuthProviderCreate, OAuthProviderType

        pr = OAuthProviderRepository(table_name="test-oauth-providers", secrets_arn="oauth-client-secrets", region="us-east-1")
        tr = OAuthTokenRepository(table_name="test-oauth-user-tokens", region="us-east-1")
        enc = TokenEncryptionService(key_arn=kms_key_arn, region="us-east-1")
        cache = TokenCache()

        # Create a provider
        await pr.create_provider(OAuthProviderCreate(
            provider_id="github", display_name="GitHub", provider_type=OAuthProviderType.GITHUB,
            authorization_endpoint="https://github.com/login/oauth/authorize",
            token_endpoint="https://github.com/login/oauth/access_token",
            client_id="cid", client_secret="csec", scopes=["repo"], allowed_roles=["viewer"],
        ))

        svc = OAuthService(provider_repo=pr, token_repo=tr, encryption_service=enc, token_cache=cache)
        connections = await svc.get_user_connections("u1", ["viewer"])
        assert len(connections) == 1
        assert connections[0].provider_id == "github"


class TestStateStore:
    def test_in_memory_store_and_retrieve(self):
        from apis.shared.auth.state_store import InMemoryStateStore, OIDCStateData
        store = InMemoryStateStore()
        data = OIDCStateData(redirect_uri="/home", nonce="n1")
        store.store_state("abc", data, ttl_seconds=60)
        valid, retrieved = store.get_and_delete_state("abc")
        assert valid is True
        assert retrieved.redirect_uri == "/home"
        # Second retrieval should fail (one-time use)
        valid2, _ = store.get_and_delete_state("abc")
        assert valid2 is False

    def test_in_memory_expired(self):
        from apis.shared.auth.state_store import InMemoryStateStore, OIDCStateData
        store = InMemoryStateStore()
        store.store_state("abc", OIDCStateData(), ttl_seconds=-1)
        valid, _ = store.get_and_delete_state("abc")
        assert valid is False

    def test_in_memory_not_found(self):
        from apis.shared.auth.state_store import InMemoryStateStore
        store = InMemoryStateStore()
        valid, _ = store.get_and_delete_state("nope")
        assert valid is False

    def test_create_state_store_in_memory(self, monkeypatch):
        monkeypatch.delenv("DYNAMODB_OIDC_STATE_TABLE_NAME", raising=False)
        from apis.shared.auth.state_store import create_state_store, InMemoryStateStore
        store = create_state_store()
        assert isinstance(store, InMemoryStateStore)
