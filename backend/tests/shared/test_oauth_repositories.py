"""Task 6: OAuth provider + token repositories (moto DynamoDB + Secrets Manager)."""

import pytest
from apis.shared.oauth.models import OAuthProvider, OAuthProviderType, OAuthUserToken, OAuthConnectionStatus


def _make_provider(provider_id="github", **kw):
    defaults = dict(
        provider_id=provider_id, display_name="GitHub", provider_type=OAuthProviderType.GITHUB,
        authorization_endpoint="https://github.com/login/oauth/authorize",
        token_endpoint="https://github.com/login/oauth/access_token",
        client_id="cid", scopes=["repo"], allowed_roles=["editor"],
    )
    defaults.update(kw)
    return defaults


def _make_token(user_id="u1", provider_id="github", **kw):
    defaults = dict(
        user_id=user_id, provider_id=provider_id,
        access_token_encrypted="enc-token", token_type="Bearer",
        scopes_hash="abc", status=OAuthConnectionStatus.CONNECTED,
    )
    defaults.update(kw)
    return OAuthUserToken(**defaults)


# ===================================================================
# OAuthProviderRepository
# ===================================================================

class TestOAuthProviderRepository:
    @pytest.mark.asyncio
    async def test_create_and_get(self, oauth_provider_repository):
        from apis.shared.oauth.models import OAuthProviderCreate
        data = OAuthProviderCreate(**_make_provider(), client_secret="secret")
        provider = await oauth_provider_repository.create_provider(data)
        assert provider.provider_id == "github"
        result = await oauth_provider_repository.get_provider("github")
        assert result is not None
        assert result.display_name == "GitHub"

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, oauth_provider_repository):
        assert await oauth_provider_repository.get_provider("nope") is None

    @pytest.mark.asyncio
    async def test_list_all(self, oauth_provider_repository):
        from apis.shared.oauth.models import OAuthProviderCreate
        await oauth_provider_repository.create_provider(OAuthProviderCreate(**_make_provider("p1"), client_secret="s"))
        await oauth_provider_repository.create_provider(OAuthProviderCreate(**_make_provider("p2"), client_secret="s"))
        providers = await oauth_provider_repository.list_providers()
        assert len(providers) == 2

    @pytest.mark.asyncio
    async def test_list_enabled_only(self, oauth_provider_repository):
        from apis.shared.oauth.models import OAuthProviderCreate
        await oauth_provider_repository.create_provider(OAuthProviderCreate(**_make_provider("p1"), client_secret="s"))
        await oauth_provider_repository.create_provider(OAuthProviderCreate(**_make_provider("p2", enabled=False), client_secret="s"))
        providers = await oauth_provider_repository.list_providers(enabled_only=True)
        assert len(providers) == 1

    @pytest.mark.asyncio
    async def test_delete_provider(self, oauth_provider_repository):
        from apis.shared.oauth.models import OAuthProviderCreate
        await oauth_provider_repository.create_provider(OAuthProviderCreate(**_make_provider(), client_secret="s"))
        assert await oauth_provider_repository.delete_provider("github") is True
        assert await oauth_provider_repository.get_provider("github") is None

    @pytest.mark.asyncio
    async def test_client_secret(self, oauth_provider_repository):
        from apis.shared.oauth.models import OAuthProviderCreate
        await oauth_provider_repository.create_provider(OAuthProviderCreate(**_make_provider(), client_secret="my-secret"))
        secret = await oauth_provider_repository.get_client_secret("github")
        assert secret == "my-secret"

    def test_disabled_when_no_table(self):
        from apis.shared.oauth.provider_repository import OAuthProviderRepository
        repo = OAuthProviderRepository(table_name=None)
        assert repo.enabled is False


# ===================================================================
# OAuthTokenRepository
# ===================================================================

class TestOAuthTokenRepository:
    @pytest.mark.asyncio
    async def test_save_and_get(self, oauth_token_repository):
        token = _make_token()
        saved = await oauth_token_repository.save_token(token)
        assert saved.user_id == "u1"
        result = await oauth_token_repository.get_token("u1", "github")
        assert result is not None
        assert result.access_token_encrypted == "enc-token"

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, oauth_token_repository):
        assert await oauth_token_repository.get_token("u1", "nope") is None

    @pytest.mark.asyncio
    async def test_list_user_tokens(self, oauth_token_repository):
        await oauth_token_repository.save_token(_make_token(provider_id="p1"))
        await oauth_token_repository.save_token(_make_token(provider_id="p2"))
        tokens = await oauth_token_repository.list_user_tokens("u1")
        assert len(tokens) == 2

    @pytest.mark.asyncio
    async def test_list_provider_tokens(self, oauth_token_repository):
        await oauth_token_repository.save_token(_make_token(user_id="u1"))
        await oauth_token_repository.save_token(_make_token(user_id="u2"))
        tokens = await oauth_token_repository.list_provider_tokens("github")
        assert len(tokens) == 2

    @pytest.mark.asyncio
    async def test_update_token_status(self, oauth_token_repository):
        await oauth_token_repository.save_token(_make_token())
        updated = await oauth_token_repository.update_token_status("u1", "github", OAuthConnectionStatus.EXPIRED)
        assert updated is not None
        assert updated.status == OAuthConnectionStatus.EXPIRED

    @pytest.mark.asyncio
    async def test_delete_token(self, oauth_token_repository):
        await oauth_token_repository.save_token(_make_token())
        assert await oauth_token_repository.delete_token("u1", "github") is True
        assert await oauth_token_repository.get_token("u1", "github") is None

    @pytest.mark.asyncio
    async def test_delete_user_tokens(self, oauth_token_repository):
        await oauth_token_repository.save_token(_make_token(provider_id="p1"))
        await oauth_token_repository.save_token(_make_token(provider_id="p2"))
        count = await oauth_token_repository.delete_user_tokens("u1")
        assert count == 2
        assert len(await oauth_token_repository.list_user_tokens("u1")) == 0

    @pytest.mark.asyncio
    async def test_delete_provider_tokens(self, oauth_token_repository):
        await oauth_token_repository.save_token(_make_token(user_id="u1"))
        await oauth_token_repository.save_token(_make_token(user_id="u2"))
        count = await oauth_token_repository.delete_provider_tokens("github")
        assert count == 2

    def test_disabled_when_no_table(self):
        from apis.shared.oauth.token_repository import OAuthTokenRepository
        repo = OAuthTokenRepository(table_name=None)
        assert repo.enabled is False
