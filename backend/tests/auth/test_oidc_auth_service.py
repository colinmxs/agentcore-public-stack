"""Tests for GenericOIDCAuthService OIDC flow methods.

Covers: generate_state, build_authorization_url, exchange_code_for_tokens,
refresh_access_token, and build_logout_url.

Requirements: 10.1–10.10
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

import jwt
import pytest

from apis.app_api.auth.service import GenericOIDCAuthService
from apis.shared.auth.state_store import InMemoryStateStore, OIDCStateData


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_service(provider, pkce_enabled=True):
    """Create a GenericOIDCAuthService with an InMemoryStateStore."""
    provider.pkce_enabled = pkce_enabled
    return GenericOIDCAuthService(
        provider=provider,
        client_secret="test-secret",
        state_store=InMemoryStateStore(),
    )


def _make_httpx_response(status_code, json_body):
    """Build a mock httpx.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_body
    if status_code >= 400:
        import httpx as _httpx

        resp.raise_for_status.side_effect = _httpx.HTTPStatusError(
            message="error",
            request=MagicMock(),
            response=resp,
        )
    else:
        resp.raise_for_status.return_value = None
    return resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestGenerateState:
    """Requirement 10.2: generate_state stores state."""

    def test_generate_state_stores_state(self, make_provider):
        """generate_state should store state in the state store with provider_id,
        code_verifier, nonce, and optional redirect_uri."""
        provider = make_provider(pkce_enabled=True)
        svc = _build_service(provider, pkce_enabled=True)

        state, code_challenge, nonce = svc.generate_state(redirect_uri="http://localhost/cb")

        # State should be retrievable from the store
        is_valid, data = svc.state_store.get_and_delete_state(state)
        assert is_valid is True
        assert data is not None
        assert data.provider_id == provider.provider_id
        assert data.nonce == nonce
        assert data.redirect_uri == "http://localhost/cb"
        # PKCE enabled → code_verifier stored
        assert data.code_verifier is not None


class TestBuildAuthorizationUrl:
    """Requirements 10.3, 10.4: build_authorization_url with/without PKCE."""

    def test_build_authorization_url_with_pkce(self, make_provider):
        """With PKCE enabled, URL should include code_challenge and code_challenge_method."""
        provider = make_provider(pkce_enabled=True)
        svc = _build_service(provider, pkce_enabled=True)

        state, code_challenge, nonce = svc.generate_state()
        url = svc.build_authorization_url(state, code_challenge, nonce)

        parsed = urlparse(url)
        params = parse_qs(parsed.query)

        assert params["code_challenge"] == [code_challenge]
        assert params["code_challenge_method"] == ["S256"]
        assert params["state"] == [state]
        assert params["nonce"] == [nonce]
        assert params["client_id"] == [provider.client_id]

    def test_build_authorization_url_without_pkce(self, make_provider):
        """With PKCE disabled, URL should omit code_challenge and code_challenge_method."""
        provider = make_provider(pkce_enabled=False)
        svc = _build_service(provider, pkce_enabled=False)

        state, code_challenge, nonce = svc.generate_state()
        url = svc.build_authorization_url(state, code_challenge, nonce)

        parsed = urlparse(url)
        params = parse_qs(parsed.query)

        assert "code_challenge" not in params
        assert "code_challenge_method" not in params
        assert params["state"] == [state]
        assert params["nonce"] == [nonce]


class TestExchangeCodeInvalidState:
    """Requirement 10.5: exchange_code invalid state 400."""

    @pytest.mark.asyncio
    async def test_exchange_code_invalid_state_raises_400(self, make_provider):
        """exchange_code_for_tokens with an unknown state should raise 400."""
        from fastapi import HTTPException

        provider = make_provider()
        svc = _build_service(provider)

        with pytest.raises(HTTPException) as exc_info:
            await svc.exchange_code_for_tokens(code="auth-code", state="bogus-state")

        assert exc_info.value.status_code == 400
        assert "Invalid or expired state" in exc_info.value.detail


class TestExchangeCodeNonceMismatch:
    """Requirement 10.6: exchange_code nonce mismatch 400."""

    @pytest.mark.asyncio
    async def test_exchange_code_nonce_mismatch_raises_400(self, make_provider):
        """If the ID token nonce doesn't match the stored nonce, raise 400."""
        from fastapi import HTTPException

        provider = make_provider()
        svc = _build_service(provider)

        state, _challenge, nonce = svc.generate_state()

        # Build a fake ID token with a WRONG nonce
        fake_id_token = jwt.encode({"nonce": "wrong-nonce"}, "secret", algorithm="HS256")

        token_response_body = {
            "access_token": "at-123",
            "refresh_token": "rt-123",
            "id_token": fake_id_token,
            "token_type": "Bearer",
            "expires_in": 3600,
            "scope": "openid",
        }

        mock_resp = _make_httpx_response(200, token_response_body)

        with patch("apis.app_api.auth.service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            with pytest.raises(HTTPException) as exc_info:
                await svc.exchange_code_for_tokens(code="auth-code", state=state)

        assert exc_info.value.status_code == 400
        assert "nonce validation failed" in exc_info.value.detail


class TestExchangeCodeSuccess:
    """Requirement 10.7: exchange_code success returns token dict."""

    @pytest.mark.asyncio
    async def test_exchange_code_success_returns_token_dict(self, make_provider):
        """Successful exchange should return dict with all expected keys."""
        provider = make_provider()
        svc = _build_service(provider)

        state, _challenge, nonce = svc.generate_state()

        # Build a fake ID token with the CORRECT nonce
        fake_id_token = jwt.encode({"nonce": nonce}, "secret", algorithm="HS256")

        token_response_body = {
            "access_token": "at-123",
            "refresh_token": "rt-123",
            "id_token": fake_id_token,
            "token_type": "Bearer",
            "expires_in": 3600,
            "scope": "openid profile",
        }

        mock_resp = _make_httpx_response(200, token_response_body)

        with patch("apis.app_api.auth.service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await svc.exchange_code_for_tokens(code="auth-code", state=state)

        assert result["access_token"] == "at-123"
        assert result["refresh_token"] == "rt-123"
        assert result["id_token"] == fake_id_token
        assert result["token_type"] == "Bearer"
        assert result["expires_in"] == 3600
        assert result["scope"] == "openid profile"
        assert result["provider_id"] == provider.provider_id


class TestRefreshAccessToken:
    """Requirement 10.8: refresh_access_token 400 response raises 401."""

    @pytest.mark.asyncio
    async def test_refresh_400_raises_401(self, make_provider):
        """A 400 from the token endpoint should raise HTTPException 401."""
        from fastapi import HTTPException

        provider = make_provider()
        svc = _build_service(provider)

        mock_resp = _make_httpx_response(400, {"error": "invalid_grant"})

        with patch("apis.app_api.auth.service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            with pytest.raises(HTTPException) as exc_info:
                await svc.refresh_access_token(refresh_token="expired-rt")

        assert exc_info.value.status_code == 401
        assert "Invalid or expired refresh token" in exc_info.value.detail


class TestBuildLogoutUrl:
    """Requirements 10.9, 10.10: build_logout_url."""

    def test_build_logout_url_with_redirect(self, make_provider):
        """build_logout_url should append post_logout_redirect_uri as a query param."""
        provider = make_provider(end_session_endpoint="https://login.example.com/logout")
        svc = _build_service(provider)

        url = svc.build_logout_url(post_logout_redirect_uri="http://localhost:4200")

        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        assert parsed.scheme == "https"
        assert "login.example.com" in parsed.netloc
        assert params["post_logout_redirect_uri"] == ["http://localhost:4200"]

    def test_build_logout_url_no_endpoint_returns_empty(self, make_provider):
        """If no end_session_endpoint is configured, return empty string."""
        provider = make_provider(end_session_endpoint=None)
        svc = _build_service(provider)

        url = svc.build_logout_url(post_logout_redirect_uri="http://localhost:4200")

        assert url == ""
