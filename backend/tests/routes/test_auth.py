"""Tests for authentication routes.

Endpoints under test:
- GET  /auth/providers  → 200 with provider list (public, no auth)
- POST /auth/token      → 200 with tokens on valid exchange
- POST /auth/token      → 400 on invalid/expired state

Requirements: 6.1, 6.2, 6.3, 6.4
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from apis.app_api.auth.routes import router


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def app():
    """Minimal FastAPI app mounting only the auth router."""
    _app = FastAPI()
    _app.include_router(router)
    return _app


@pytest.fixture
def client(app):
    """TestClient bound to the minimal auth app."""
    return TestClient(app)


# ---------------------------------------------------------------------------
# Requirement 6.1: GET /auth/providers returns provider list
# ---------------------------------------------------------------------------


class TestListAuthProviders:
    """GET /auth/providers returns enabled providers."""

    def test_returns_200_with_provider_list(self, client):
        """Req 6.1: Should return 200 with a list of configured providers."""
        mock_repo = AsyncMock()
        mock_repo.enabled = True
        mock_repo.list_providers = AsyncMock(
            return_value=[
                MagicMock(
                    provider_id="okta",
                    display_name="Okta",
                    logo_url="https://example.com/okta.png",
                    button_color="#0066CC",
                ),
            ]
        )

        with patch(
            "apis.shared.auth_providers.repository.get_auth_provider_repository",
            return_value=mock_repo,
        ):
            resp = client.get("/auth/providers")

        assert resp.status_code == 200
        body = resp.json()
        assert len(body["providers"]) == 1
        p = body["providers"][0]
        assert p["provider_id"] == "okta"
        assert p["display_name"] == "Okta"

    # -------------------------------------------------------------------
    # Requirement 6.2: Empty list when none configured
    # -------------------------------------------------------------------

    def test_returns_200_with_empty_list_when_repo_disabled(self, client):
        """Req 6.2: Should return 200 with empty list when repo is disabled."""
        mock_repo = AsyncMock()
        mock_repo.enabled = False

        with patch(
            "apis.shared.auth_providers.repository.get_auth_provider_repository",
            return_value=mock_repo,
        ):
            resp = client.get("/auth/providers")

        assert resp.status_code == 200
        assert resp.json()["providers"] == []

    def test_returns_200_with_empty_list_when_no_providers(self, client):
        """Req 6.2: Should return 200 with empty list when no providers exist."""
        mock_repo = AsyncMock()
        mock_repo.enabled = True
        mock_repo.list_providers = AsyncMock(return_value=[])

        with patch(
            "apis.shared.auth_providers.repository.get_auth_provider_repository",
            return_value=mock_repo,
        ):
            resp = client.get("/auth/providers")

        assert resp.status_code == 200
        assert resp.json()["providers"] == []

    def test_returns_200_with_empty_list_on_exception(self, client):
        """Req 6.2: Should gracefully return empty list when repo raises."""
        with patch(
            "apis.shared.auth_providers.repository.get_auth_provider_repository",
            side_effect=RuntimeError("DynamoDB unavailable"),
        ):
            resp = client.get("/auth/providers")

        assert resp.status_code == 200
        assert resp.json()["providers"] == []


# ---------------------------------------------------------------------------
# Requirement 6.3: Valid auth callback returns tokens
# ---------------------------------------------------------------------------


class TestExchangeToken:
    """POST /auth/token exchanges authorization code for tokens."""

    def test_valid_exchange_returns_tokens(self, client):
        """Req 6.3: Should return 200 with tokens for valid code+state."""
        mock_service = MagicMock()
        mock_service.exchange_code_for_tokens = AsyncMock(
            return_value={
                "access_token": "at-123",
                "refresh_token": "rt-456",
                "id_token": "id-789",
                "token_type": "Bearer",
                "expires_in": 3600,
                "scope": "openid profile",
            }
        )

        with patch(
            "apis.app_api.auth.routes._peek_provider_from_state",
            return_value="test-provider",
        ), patch(
            "apis.app_api.auth.routes.get_generic_auth_service",
            new_callable=AsyncMock,
            return_value=mock_service,
        ):
            resp = client.post(
                "/auth/token",
                json={"code": "auth-code", "state": "valid-state"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["access_token"] == "at-123"
        assert body["refresh_token"] == "rt-456"
        assert body["id_token"] == "id-789"
        assert body["token_type"] == "Bearer"
        assert body["expires_in"] == 3600


# ---------------------------------------------------------------------------
# Requirement 6.4: Invalid/expired callback returns 400 or 401
# ---------------------------------------------------------------------------


class TestExchangeTokenErrors:
    """POST /auth/token rejects invalid or expired callbacks."""

    def test_invalid_state_returns_400(self, client):
        """Req 6.4: Should return 400 when state cannot resolve to a provider."""
        with patch(
            "apis.app_api.auth.routes._peek_provider_from_state",
            return_value=None,
        ):
            resp = client.post(
                "/auth/token",
                json={"code": "auth-code", "state": "bogus-state"},
            )

        assert resp.status_code == 400

    def test_expired_state_returns_400(self, client):
        """Req 6.4: Should return 400 when exchange raises HTTPException."""
        mock_service = MagicMock()
        mock_service.exchange_code_for_tokens = AsyncMock(
            side_effect=HTTPException(
                status_code=400, detail="Invalid or expired state"
            ),
        )

        with patch(
            "apis.app_api.auth.routes._peek_provider_from_state",
            return_value="test-provider",
        ), patch(
            "apis.app_api.auth.routes.get_generic_auth_service",
            new_callable=AsyncMock,
            return_value=mock_service,
        ):
            resp = client.post(
                "/auth/token",
                json={"code": "auth-code", "state": "expired-state"},
            )

        assert resp.status_code == 400

    def test_exchange_generic_error_returns_400(self, client):
        """Req 6.4: Should return 400 when exchange raises unexpected error."""
        mock_service = MagicMock()
        mock_service.exchange_code_for_tokens = AsyncMock(
            side_effect=RuntimeError("Connection refused"),
        )

        with patch(
            "apis.app_api.auth.routes._peek_provider_from_state",
            return_value="test-provider",
        ), patch(
            "apis.app_api.auth.routes.get_generic_auth_service",
            new_callable=AsyncMock,
            return_value=mock_service,
        ):
            resp = client.post(
                "/auth/token",
                json={"code": "auth-code", "state": "some-state"},
            )

        assert resp.status_code == 400
