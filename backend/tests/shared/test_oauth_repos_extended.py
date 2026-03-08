"""Extended OAuth repository tests for deeper coverage."""

import pytest


class TestOAuthProviderRepositoryExtended:
    @pytest.fixture(autouse=True)
    def _setup(self, oauth_provider_repository):
        self.repo = oauth_provider_repository

    def _make_create(self, pid="github", **kw):
        from apis.shared.oauth.models import OAuthProviderCreate, OAuthProviderType
        defaults = dict(
            provider_id=pid, display_name="GitHub", provider_type=OAuthProviderType.GITHUB,
            authorization_endpoint="https://github.com/login/oauth/authorize",
            token_endpoint="https://github.com/login/oauth/access_token",
            client_id="cid", client_secret="secret", scopes=["repo"],
            allowed_roles=["viewer"],
        )
        defaults.update(kw)
        return OAuthProviderCreate(**defaults)

    @pytest.mark.asyncio
    async def test_create_and_get(self):
        p = await self.repo.create_provider(self._make_create())
        assert p.provider_id == "github"
        got = await self.repo.get_provider("github")
        assert got is not None
        assert got.display_name == "GitHub"

    @pytest.mark.asyncio
    async def test_get_nonexistent(self):
        assert await self.repo.get_provider("nope") is None

    @pytest.mark.asyncio
    async def test_create_duplicate_raises(self):
        await self.repo.create_provider(self._make_create())
        with pytest.raises(ValueError, match="already exists"):
            await self.repo.create_provider(self._make_create())

    @pytest.mark.asyncio
    async def test_list_all(self):
        await self.repo.create_provider(self._make_create("a"))
        await self.repo.create_provider(self._make_create("b"))
        providers = await self.repo.list_providers()
        assert len(providers) == 2

    @pytest.mark.asyncio
    async def test_list_enabled_only(self):
        await self.repo.create_provider(self._make_create("a", enabled=True))
        await self.repo.create_provider(self._make_create("b", enabled=False))
        enabled = await self.repo.list_providers(enabled_only=True)
        assert all(p.enabled for p in enabled)

    @pytest.mark.asyncio
    async def test_update_provider(self):
        from apis.shared.oauth.models import OAuthProviderUpdate
        await self.repo.create_provider(self._make_create())
        updated = await self.repo.update_provider("github", OAuthProviderUpdate(display_name="GH"))
        assert updated.display_name == "GH"

    @pytest.mark.asyncio
    async def test_update_nonexistent(self):
        from apis.shared.oauth.models import OAuthProviderUpdate
        assert await self.repo.update_provider("nope", OAuthProviderUpdate(display_name="X")) is None

    @pytest.mark.asyncio
    async def test_update_client_secret(self):
        from apis.shared.oauth.models import OAuthProviderUpdate
        await self.repo.create_provider(self._make_create())
        await self.repo.update_provider("github", OAuthProviderUpdate(client_secret="new_secret"))
        secret = await self.repo.get_client_secret("github")
        assert secret == "new_secret"

    @pytest.mark.asyncio
    async def test_delete_provider(self):
        await self.repo.create_provider(self._make_create())
        assert await self.repo.delete_provider("github") is True
        assert await self.repo.get_provider("github") is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self):
        assert await self.repo.delete_provider("nope") is False

    @pytest.mark.asyncio
    async def test_get_client_secret(self):
        await self.repo.create_provider(self._make_create())
        secret = await self.repo.get_client_secret("github")
        assert secret == "secret"

    @pytest.mark.asyncio
    async def test_get_client_secret_missing(self):
        secret = await self.repo.get_client_secret("nope")
        assert secret is None

    @pytest.mark.asyncio
    async def test_disabled_repo(self, monkeypatch):
        monkeypatch.delenv("DYNAMODB_OAUTH_PROVIDERS_TABLE_NAME", raising=False)
        from apis.shared.oauth.provider_repository import OAuthProviderRepository
        repo = OAuthProviderRepository(table_name=None)
        assert repo.enabled is False
        assert await repo.get_provider("x") is None
        assert await repo.list_providers() == []
        assert await repo.delete_provider("x") is False


class TestOAuthTokenRepositoryExtended:
    @pytest.fixture(autouse=True)
    def _setup(self, oauth_token_repository):
        self.repo = oauth_token_repository

    def _make_token(self, user_id="u1", provider_id="github", **kw):
        from apis.shared.oauth.models import OAuthUserToken, OAuthConnectionStatus
        defaults = dict(
            user_id=user_id, provider_id=provider_id,
            access_token_encrypted="enc_tok",
            status=OAuthConnectionStatus.CONNECTED,
            connected_at="2026-01-01",
        )
        defaults.update(kw)
        return OAuthUserToken(**defaults)

    @pytest.mark.asyncio
    async def test_save_and_get(self):
        token = self._make_token()
        saved = await self.repo.save_token(token)
        assert saved.updated_at is not None
        got = await self.repo.get_token("u1", "github")
        assert got is not None
        assert got.access_token_encrypted == "enc_tok"

    @pytest.mark.asyncio
    async def test_get_nonexistent(self):
        assert await self.repo.get_token("u1", "nope") is None

    @pytest.mark.asyncio
    async def test_list_user_tokens(self):
        await self.repo.save_token(self._make_token(provider_id="a"))
        await self.repo.save_token(self._make_token(provider_id="b"))
        tokens = await self.repo.list_user_tokens("u1")
        assert len(tokens) == 2

    @pytest.mark.asyncio
    async def test_list_provider_tokens(self):
        await self.repo.save_token(self._make_token(user_id="u1"))
        await self.repo.save_token(self._make_token(user_id="u2"))
        tokens = await self.repo.list_provider_tokens("github")
        assert len(tokens) == 2

    @pytest.mark.asyncio
    async def test_update_token_status(self):
        from apis.shared.oauth.models import OAuthConnectionStatus
        await self.repo.save_token(self._make_token())
        updated = await self.repo.update_token_status("u1", "github", OAuthConnectionStatus.EXPIRED)
        assert updated.status == OAuthConnectionStatus.EXPIRED

    @pytest.mark.asyncio
    async def test_update_token_status_nonexistent(self):
        from apis.shared.oauth.models import OAuthConnectionStatus
        assert await self.repo.update_token_status("u1", "nope", OAuthConnectionStatus.EXPIRED) is None

    @pytest.mark.asyncio
    async def test_delete_token(self):
        await self.repo.save_token(self._make_token())
        assert await self.repo.delete_token("u1", "github") is True
        assert await self.repo.get_token("u1", "github") is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self):
        assert await self.repo.delete_token("u1", "nope") is False

    @pytest.mark.asyncio
    async def test_delete_user_tokens(self):
        await self.repo.save_token(self._make_token(provider_id="a"))
        await self.repo.save_token(self._make_token(provider_id="b"))
        count = await self.repo.delete_user_tokens("u1")
        assert count == 2
        assert await self.repo.list_user_tokens("u1") == []

    @pytest.mark.asyncio
    async def test_delete_provider_tokens(self):
        await self.repo.save_token(self._make_token(user_id="u1"))
        await self.repo.save_token(self._make_token(user_id="u2"))
        count = await self.repo.delete_provider_tokens("github")
        assert count == 2

    @pytest.mark.asyncio
    async def test_disabled_repo(self, monkeypatch):
        monkeypatch.delenv("DYNAMODB_OAUTH_USER_TOKENS_TABLE_NAME", raising=False)
        from apis.shared.oauth.token_repository import OAuthTokenRepository
        repo = OAuthTokenRepository(table_name=None)
        assert repo.enabled is False
        assert await repo.get_token("u1", "x") is None
        assert await repo.list_user_tokens("u1") == []
        assert await repo.list_provider_tokens("x") == []
        assert await repo.delete_token("u1", "x") is False
        assert await repo.delete_user_tokens("u1") == 0
        assert await repo.delete_provider_tokens("x") == 0
