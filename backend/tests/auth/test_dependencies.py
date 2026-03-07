"""Tests for FastAPI auth dependencies.

Covers:
- get_current_user: Bearer token validation via GenericOIDCJWTValidator
- get_current_user_trusted: JWT decode without signature verification
- get_current_user_id: convenience wrapper returning user_id string

Requirements: 3.1–3.10
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import jwt as pyjwt
import pytest
from fastapi import HTTPException

from apis.shared.auth.dependencies import (
    get_current_user,
    get_current_user_id,
    get_current_user_trusted,
)
from apis.shared.auth.models import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _bearer(token: str):
    """Create a mock HTTPAuthorizationCredentials with the given token."""
    creds = MagicMock()
    creds.credentials = token
    return creds


# ---------------------------------------------------------------------------
# get_current_user tests
# ---------------------------------------------------------------------------


class TestGetCurrentUser:
    """Tests for the get_current_user dependency."""

    @pytest.mark.asyncio
    async def test_valid_bearer_token(self, make_jwt, make_provider, make_user):
        """Req 3.2: valid Bearer token resolves provider, validates, returns User with raw_token."""
        provider = make_provider()
        token = make_jwt(provider=provider)
        expected_user = make_user(raw_token=None)

        mock_validator = MagicMock()
        mock_validator.resolve_provider_from_token = AsyncMock(return_value=provider)
        mock_validator.validate_token = MagicMock(return_value=expected_user)

        with patch(
            "apis.shared.auth.dependencies._get_generic_validator",
            return_value=mock_validator,
        ), patch(
            "apis.shared.auth.dependencies._get_user_sync_service",
            return_value=None,
        ):
            user = await get_current_user(credentials=_bearer(token))

        assert isinstance(user, User)
        assert user.raw_token == token
        assert user.user_id == expected_user.user_id
        mock_validator.resolve_provider_from_token.assert_awaited_once_with(token)
        mock_validator.validate_token.assert_called_once_with(token, provider)

    @pytest.mark.asyncio
    async def test_no_credentials_401(self):
        """Req 3.3: None credentials raises 401 with WWW-Authenticate header."""
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=None)

        assert exc_info.value.status_code == 401
        assert "WWW-Authenticate" in (exc_info.value.headers or {})

    @pytest.mark.asyncio
    async def test_failed_validation_401(self, make_jwt, make_provider):
        """Req 3.4: token that fails validation raises 401."""
        provider = make_provider()
        token = make_jwt(provider=provider)

        mock_validator = MagicMock()
        mock_validator.resolve_provider_from_token = AsyncMock(return_value=provider)
        mock_validator.validate_token = MagicMock(
            side_effect=HTTPException(status_code=401, detail="Invalid token signature")
        )

        with patch(
            "apis.shared.auth.dependencies._get_generic_validator",
            return_value=mock_validator,
        ), patch(
            "apis.shared.auth.dependencies._get_user_sync_service",
            return_value=None,
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(credentials=_bearer(token))

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_no_validator_500(self, make_jwt):
        """Req 3.5: no generic validator available raises 500."""
        token = make_jwt()

        with patch(
            "apis.shared.auth.dependencies._get_generic_validator",
            return_value=None,
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(credentials=_bearer(token))

        assert exc_info.value.status_code == 500
        assert "Authentication service not configured" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_no_matching_provider_500(self, make_jwt):
        """When resolve_provider_from_token returns None, falls through to 500."""
        token = make_jwt()

        mock_validator = MagicMock()
        mock_validator.resolve_provider_from_token = AsyncMock(return_value=None)

        with patch(
            "apis.shared.auth.dependencies._get_generic_validator",
            return_value=mock_validator,
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(credentials=_bearer(token))

        # When provider is None, the if-block is skipped and we hit the 500
        assert exc_info.value.status_code == 500


# ---------------------------------------------------------------------------
# get_current_user_trusted tests
# ---------------------------------------------------------------------------


class TestGetCurrentUserTrusted:
    """Tests for the get_current_user_trusted dependency."""

    @pytest.mark.asyncio
    async def test_trusted_decode_success(self, make_jwt, make_provider):
        """Req 3.6: valid Bearer token decoded without signature verification, returns User."""
        provider = make_provider()
        token = make_jwt(
            claims={
                "sub": "trusted-user-001",
                "email": "trusted@example.com",
                "name": "Trusted User",
                "roles": ["Admin"],
            },
            provider=provider,
        )

        mock_validator = MagicMock()
        mock_validator.resolve_provider_from_token = AsyncMock(return_value=provider)

        with patch(
            "apis.shared.auth.dependencies._get_generic_validator",
            return_value=mock_validator,
        ), patch(
            "apis.shared.auth.dependencies._get_user_sync_service",
            return_value=None,
        ):
            user = await get_current_user_trusted(credentials=_bearer(token))

        assert isinstance(user, User)
        assert user.user_id == "trusted-user-001"
        assert user.email == "trusted@example.com"
        assert user.name == "Trusted User"
        assert user.roles == ["Admin"]
        assert user.raw_token == token

    @pytest.mark.asyncio
    async def test_trusted_malformed_token(self):
        """Req 3.7: malformed token raises 401 with 'Malformed token.'."""
        with patch(
            "apis.shared.auth.dependencies._get_generic_validator",
            return_value=None,
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user_trusted(credentials=_bearer("not.a.jwt"))

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Malformed token."

    @pytest.mark.asyncio
    async def test_trusted_no_validator_fallback(self, make_jwt, make_provider):
        """Req 3.8: no validator falls back to standard OIDC claims (sub, email, name, roles)."""
        provider = make_provider()
        token = make_jwt(
            claims={
                "sub": "fallback-user",
                "email": "fallback@example.com",
                "name": "Fallback User",
                "roles": ["Reader"],
            },
            provider=provider,
        )

        with patch(
            "apis.shared.auth.dependencies._get_generic_validator",
            return_value=None,
        ), patch(
            "apis.shared.auth.dependencies._get_user_sync_service",
            return_value=None,
        ):
            user = await get_current_user_trusted(credentials=_bearer(token))

        assert user.user_id == "fallback-user"
        assert user.email == "fallback@example.com"
        assert user.name == "Fallback User"
        assert user.roles == ["Reader"]

    @pytest.mark.asyncio
    async def test_trusted_missing_user_id(self, make_jwt, make_provider):
        """Req 3.9: missing user_id claim raises 401 with 'Invalid user.'."""
        provider = make_provider()
        # Create token without 'sub' claim
        token = make_jwt(
            claims={
                "sub": None,
                "email": "nouser@example.com",
                "name": "No User",
            },
            provider=provider,
        )

        with patch(
            "apis.shared.auth.dependencies._get_generic_validator",
            return_value=None,
        ), patch(
            "apis.shared.auth.dependencies._get_user_sync_service",
            return_value=None,
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user_trusted(credentials=_bearer(token))

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid user."

    @pytest.mark.asyncio
    async def test_trusted_missing_user_id_with_provider(self, make_jwt, make_provider):
        """Req 3.9 (provider path): missing user_id claim with provider raises 401."""
        provider = make_provider()
        token = make_jwt(
            claims={
                "sub": None,
                "email": "nouser@example.com",
                "name": "No User",
            },
            provider=provider,
        )

        mock_validator = MagicMock()
        mock_validator.resolve_provider_from_token = AsyncMock(return_value=provider)

        with patch(
            "apis.shared.auth.dependencies._get_generic_validator",
            return_value=mock_validator,
        ), patch(
            "apis.shared.auth.dependencies._get_user_sync_service",
            return_value=None,
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user_trusted(credentials=_bearer(token))

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid user."

    @pytest.mark.asyncio
    async def test_trusted_no_credentials_401(self):
        """Trusted path also rejects missing credentials with 401."""
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_trusted(credentials=None)

        assert exc_info.value.status_code == 401
        assert "WWW-Authenticate" in (exc_info.value.headers or {})


# ---------------------------------------------------------------------------
# get_current_user_id tests
# ---------------------------------------------------------------------------


class TestGetCurrentUserId:
    """Tests for the get_current_user_id dependency."""

    @pytest.mark.asyncio
    async def test_returns_string(self, make_jwt, make_provider, make_user):
        """Req 3.10: get_current_user_id returns the user_id string."""
        provider = make_provider()
        token = make_jwt(provider=provider)
        expected_user = make_user(user_id="uid-42")

        mock_validator = MagicMock()
        mock_validator.resolve_provider_from_token = AsyncMock(return_value=provider)
        mock_validator.validate_token = MagicMock(return_value=expected_user)

        with patch(
            "apis.shared.auth.dependencies._get_generic_validator",
            return_value=mock_validator,
        ), patch(
            "apis.shared.auth.dependencies._get_user_sync_service",
            return_value=None,
        ):
            user_id = await get_current_user_id(
                user=await get_current_user(credentials=_bearer(token))
            )

        assert user_id == "uid-42"
        assert isinstance(user_id, str)
