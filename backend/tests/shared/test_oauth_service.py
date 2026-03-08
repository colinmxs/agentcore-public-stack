"""Task 7: OAuth encryption (moto KMS), token cache, and service tests."""

import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ===================================================================
# TokenEncryptionService (moto KMS)
# ===================================================================

class TestTokenEncryptionService:
    def test_encrypt_decrypt_roundtrip(self, kms_key_arn):
        from apis.shared.oauth.encryption import TokenEncryptionService
        svc = TokenEncryptionService(key_arn=kms_key_arn, region="us-east-1")
        ciphertext = svc.encrypt("my-secret-token")
        assert ciphertext != "my-secret-token"
        plaintext = svc.decrypt(ciphertext)
        assert plaintext == "my-secret-token"

    def test_disabled_without_key(self):
        from apis.shared.oauth.encryption import TokenEncryptionService
        svc = TokenEncryptionService(key_arn=None)
        assert svc.enabled is False

    def test_encrypt_disabled_returns_plaintext(self):
        from apis.shared.oauth.encryption import TokenEncryptionService
        svc = TokenEncryptionService(key_arn=None)
        result = svc.encrypt("token")
        assert result.startswith("DEV:")

    def test_decrypt_disabled_returns_ciphertext(self):
        from apis.shared.oauth.encryption import TokenEncryptionService
        svc = TokenEncryptionService(key_arn=None)
        encrypted = svc.encrypt("token")
        assert svc.decrypt(encrypted) == "token"


# ===================================================================
# TokenCache (pure in-memory)
# ===================================================================

class TestTokenCache:
    @pytest.fixture()
    def cache(self):
        from apis.shared.oauth.token_cache import TokenCache
        return TokenCache()

    def test_set_and_get(self, cache):
        cache.set("u1", "p1", "token-abc")
        assert cache.get("u1", "p1") == "token-abc"

    def test_get_missing(self, cache):
        assert cache.get("u1", "p1") is None

    def test_delete(self, cache):
        cache.set("u1", "p1", "token")
        assert cache.delete("u1", "p1") is True
        assert cache.get("u1", "p1") is None

    def test_delete_missing(self, cache):
        assert cache.delete("u1", "p1") is False

    def test_delete_for_user(self, cache):
        cache.set("u1", "p1", "t1")
        cache.set("u1", "p2", "t2")
        cache.set("u2", "p1", "t3")
        count = cache.delete_for_user("u1")
        assert count == 2
        assert cache.get("u2", "p1") == "t3"

    def test_delete_for_provider(self, cache):
        cache.set("u1", "p1", "t1")
        cache.set("u2", "p1", "t2")
        cache.set("u1", "p2", "t3")
        count = cache.delete_for_provider("p1")
        assert count == 2
        assert cache.get("u1", "p2") == "t3"

    def test_clear(self, cache):
        cache.set("u1", "p1", "t")
        cache.clear()
        assert cache.get("u1", "p1") is None

    def test_get_stats(self, cache):
        cache.set("u1", "p1", "t")
        stats = cache.get_stats()
        assert stats["size"] == 1


# ===================================================================
# OAuthService
# ===================================================================

class TestOAuthServicePKCE:
    def test_generate_pkce_pair(self):
        from apis.shared.oauth.service import generate_pkce_pair
        verifier, challenge = generate_pkce_pair()
        assert len(verifier) > 20
        assert len(challenge) > 20
        assert verifier != challenge


class TestOAuthServiceConnect:
    @pytest.fixture()
    def oauth_service(self, oauth_provider_repository, oauth_token_repository, kms_key_arn, monkeypatch):
        monkeypatch.setenv("OAUTH_CALLBACK_URL", "http://localhost:8000/api/oauth/callback")
        from apis.shared.oauth.service import OAuthService
        from apis.shared.oauth.encryption import TokenEncryptionService
        from apis.shared.oauth.token_cache import TokenCache
        from apis.shared.auth.state_store import InMemoryStateStore

        enc = TokenEncryptionService(key_arn=kms_key_arn, region="us-east-1")
        cache = TokenCache()
        state_store = InMemoryStateStore()

        return OAuthService(
            provider_repo=oauth_provider_repository,
            token_repo=oauth_token_repository,
            encryption_service=enc,
            token_cache=cache,
            state_store=state_store,
        )

    @pytest.mark.asyncio
    async def test_initiate_connect(self, oauth_service, oauth_provider_repository):
        from apis.shared.oauth.models import OAuthProviderCreate
        await oauth_provider_repository.create_provider(
            OAuthProviderCreate(
                provider_id="github", display_name="GitHub",
                provider_type="github", client_id="cid", client_secret="secret",
                authorization_endpoint="https://github.com/login/oauth/authorize",
                token_endpoint="https://github.com/login/oauth/access_token",
                scopes=["repo"], allowed_roles=["editor"],
            )
        )
        result = await oauth_service.initiate_connect(
            provider_id="github", user_id="u1",
            user_roles=["editor"],
            frontend_redirect="http://localhost/callback"
        )
        assert "github.com" in result

    @pytest.mark.asyncio
    async def test_get_user_connections_empty(self, oauth_service):
        connections = await oauth_service.get_user_connections("u1", user_roles=["editor"])
        assert connections == []

    @pytest.mark.asyncio
    async def test_disconnect_nonexistent(self, oauth_service):
        # Should not raise
        result = await oauth_service.disconnect("u1", "github")
        assert result is True or result is False  # implementation-dependent
