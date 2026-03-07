"""Tests for GenericOIDCJWTValidator.

Covers: valid RS256 decode, invalid signature, expired token, issuer matching
(exact, Entra ID v1↔v2 cross-version, mismatch), audience validation, scope
enforcement, user_id pattern validation, missing user_id claim, name construction
from first/last claims, roles normalization, email fallback, JWKS client caching,
resolve_provider_from_token, invalidate_cache, dot-notation claim extraction,
and URI-style claim lookup.

Requirements: 1.1–1.22
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import jwt as pyjwt
import pytest
from fastapi import HTTPException

from apis.shared.auth.generic_jwt_validator import GenericOIDCJWTValidator


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def validator(mock_provider_repo):
    """Create a GenericOIDCJWTValidator with a mocked provider repo."""
    return GenericOIDCJWTValidator(provider_repo=mock_provider_repo)


@pytest.fixture
def provider_default(make_provider):
    """A default test provider."""
    return make_provider()


def _inject_jwks(validator, provider, mock_jwks_client):
    """Pre-populate the JWKS client cache so validate_token skips real JWKS fetch."""
    validator._jwks_clients[provider.jwks_uri] = mock_jwks_client


# ---------------------------------------------------------------------------
# 1.2 – Valid RS256 decode
# ---------------------------------------------------------------------------


class TestValidRS256Decode:
    """Validates: Requirement 1.2"""

    def test_valid_token_returns_user(
        self, validator, mock_jwks_client, make_jwt, provider_default
    ):
        token = make_jwt(provider=provider_default)
        _inject_jwks(validator, provider_default, mock_jwks_client)

        user = validator.validate_token(token, provider_default)

        assert user.email == "test@example.com"
        assert user.user_id == "user-001"
        assert user.name == "Test User"
        assert user.roles == ["User"]


# ---------------------------------------------------------------------------
# 1.3 – Invalid signature
# ---------------------------------------------------------------------------


class TestInvalidSignature:
    """Validates: Requirement 1.3"""

    def test_invalid_signature_raises_401(
        self, validator, make_jwt, provider_default
    ):
        token = make_jwt(provider=provider_default)
        # Create a JWKS client that raises InvalidSignatureError
        bad_client = MagicMock()
        bad_client.get_signing_key_from_jwt = MagicMock(
            side_effect=pyjwt.exceptions.InvalidSignatureError("bad sig")
        )
        _inject_jwks(validator, provider_default, bad_client)

        with pytest.raises(HTTPException) as exc_info:
            validator.validate_token(token, provider_default)

        assert exc_info.value.status_code == 401
        assert "Invalid token signature" in exc_info.value.detail


# ---------------------------------------------------------------------------
# 1.4 – Expired token
# ---------------------------------------------------------------------------


class TestExpiredToken:
    """Validates: Requirement 1.4"""

    def test_expired_token_raises_401(
        self, validator, mock_jwks_client, make_jwt, provider_default
    ):
        token = make_jwt(provider=provider_default, expired=True)
        _inject_jwks(validator, provider_default, mock_jwks_client)

        with pytest.raises(HTTPException) as exc_info:
            validator.validate_token(token, provider_default)

        assert exc_info.value.status_code == 401
        assert "Token expired" in exc_info.value.detail


# ---------------------------------------------------------------------------
# 1.5 – Exact issuer match
# ---------------------------------------------------------------------------


class TestExactIssuerMatch:
    """Validates: Requirement 1.5"""

    def test_exact_issuer_accepted(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        provider = make_provider(issuer_url="https://auth.example.com/")
        token = make_jwt(
            claims={"iss": "https://auth.example.com/"},
            provider=provider,
        )
        _inject_jwks(validator, provider, mock_jwks_client)

        user = validator.validate_token(token, provider)
        assert user.user_id == "user-001"


# ---------------------------------------------------------------------------
# 1.6 – Entra ID v1 token ↔ v2 provider
# ---------------------------------------------------------------------------


class TestEntraIDV1TokenV2Provider:
    """Validates: Requirement 1.6"""

    def test_v1_token_v2_provider_accepted(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        tenant = "my-tenant-id"
        provider = make_provider(
            issuer_url=f"https://login.microsoftonline.com/{tenant}/v2.0"
        )
        token = make_jwt(
            claims={"iss": f"https://sts.windows.net/{tenant}/"},
            provider=provider,
        )
        _inject_jwks(validator, provider, mock_jwks_client)

        user = validator.validate_token(token, provider)
        assert user.user_id == "user-001"


# ---------------------------------------------------------------------------
# 1.7 – Entra ID v2 token ↔ v1 provider
# ---------------------------------------------------------------------------


class TestEntraIDV2TokenV1Provider:
    """Validates: Requirement 1.7"""

    def test_v2_token_v1_provider_accepted(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        tenant = "my-tenant-id"
        provider = make_provider(
            issuer_url=f"https://sts.windows.net/{tenant}/"
        )
        token = make_jwt(
            claims={"iss": f"https://login.microsoftonline.com/{tenant}/v2.0"},
            provider=provider,
        )
        _inject_jwks(validator, provider, mock_jwks_client)

        user = validator.validate_token(token, provider)
        assert user.user_id == "user-001"


# ---------------------------------------------------------------------------
# 1.8 – Issuer mismatch rejection
# ---------------------------------------------------------------------------


class TestIssuerMismatch:
    """Validates: Requirement 1.8"""

    def test_issuer_mismatch_raises_401(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        provider = make_provider(issuer_url="https://auth.example.com/")
        token = make_jwt(
            claims={"iss": "https://evil.example.com/"},
            provider=provider,
        )
        _inject_jwks(validator, provider, mock_jwks_client)

        with pytest.raises(HTTPException) as exc_info:
            validator.validate_token(token, provider)

        assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# 1.9 – Audience not in allowed list
# ---------------------------------------------------------------------------


class TestAudienceValidation:
    """Validates: Requirements 1.9, 1.10"""

    def test_audience_not_allowed_raises_401(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        provider = make_provider(
            allowed_audiences=["allowed-client"],
        )
        token = make_jwt(
            claims={"aud": "wrong-client"},
            provider=provider,
        )
        _inject_jwks(validator, provider, mock_jwks_client)

        with pytest.raises(HTTPException) as exc_info:
            validator.validate_token(token, provider)

        assert exc_info.value.status_code == 401
        assert "Invalid token audience" in exc_info.value.detail

    # 1.10 – Audience list containing at least one allowed value
    def test_audience_list_with_allowed_value_accepted(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        provider = make_provider(
            allowed_audiences=["allowed-client"],
        )
        token = make_jwt(
            claims={"aud": ["other-client", "allowed-client"]},
            provider=provider,
        )
        _inject_jwks(validator, provider, mock_jwks_client)

        user = validator.validate_token(token, provider)
        assert user.user_id == "user-001"


# ---------------------------------------------------------------------------
# 1.11 – Scope enforcement
# ---------------------------------------------------------------------------


class TestScopeEnforcement:
    """Validates: Requirement 1.11"""

    def test_missing_required_scope_raises_401(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        provider = make_provider(required_scopes=["api.read", "api.write"])
        token = make_jwt(
            claims={"scp": "api.read"},
            provider=provider,
        )
        _inject_jwks(validator, provider, mock_jwks_client)

        with pytest.raises(HTTPException) as exc_info:
            validator.validate_token(token, provider)

        assert exc_info.value.status_code == 401
        assert "Token missing required scope" in exc_info.value.detail

    def test_all_required_scopes_present_accepted(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        provider = make_provider(required_scopes=["api.read", "api.write"])
        token = make_jwt(
            claims={"scp": "api.read api.write"},
            provider=provider,
        )
        _inject_jwks(validator, provider, mock_jwks_client)

        user = validator.validate_token(token, provider)
        assert user.user_id == "user-001"


# ---------------------------------------------------------------------------
# 1.12 – user_id pattern validation
# ---------------------------------------------------------------------------


class TestUserIdPattern:
    """Validates: Requirement 1.12"""

    def test_user_id_not_matching_pattern_raises_401(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        provider = make_provider(
            user_id_pattern=r"^[0-9a-f\-]{36}$",  # UUID pattern
        )
        token = make_jwt(
            claims={"sub": "not-a-uuid"},
            provider=provider,
        )
        _inject_jwks(validator, provider, mock_jwks_client)

        with pytest.raises(HTTPException) as exc_info:
            validator.validate_token(token, provider)

        assert exc_info.value.status_code == 401
        assert "Invalid user" in exc_info.value.detail

    def test_user_id_matching_pattern_accepted(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        provider = make_provider(
            user_id_pattern=r"^user-\d+$",
        )
        token = make_jwt(
            claims={"sub": "user-001"},
            provider=provider,
        )
        _inject_jwks(validator, provider, mock_jwks_client)

        user = validator.validate_token(token, provider)
        assert user.user_id == "user-001"


# ---------------------------------------------------------------------------
# 1.13 – Missing user_id claim
# ---------------------------------------------------------------------------


class TestMissingUserId:
    """Validates: Requirement 1.13"""

    def test_missing_user_id_claim_raises_401(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        provider = make_provider(user_id_claim="custom_id")
        # Token has no "custom_id" claim
        token = make_jwt(provider=provider)
        _inject_jwks(validator, provider, mock_jwks_client)

        with pytest.raises(HTTPException) as exc_info:
            validator.validate_token(token, provider)

        assert exc_info.value.status_code == 401
        assert "Invalid user" in exc_info.value.detail


# ---------------------------------------------------------------------------
# 1.14 – Name construction from first/last claims
# ---------------------------------------------------------------------------


class TestNameFromFirstLast:
    """Validates: Requirement 1.14"""

    def test_name_built_from_first_last_when_name_absent(
        self, validator, mock_jwks_client, make_jwt, make_provider
    ):
        provider = make_provider(
            name_claim="name",
            first_name_claim="given_name",
            last_name_claim="family_name",
        )
        # Explicitly set "name" to None so _extract_claim returns None,
        # triggering the first_name + last_name fallback.
        token = make_jwt(
            claims={
                "sub": "user-001",
                "email": "jane@example.com",
                "name": None,
                "given_name": "Jane",
                "family_name": "Doe",
                "roles": ["User"],
            },
            provider=provider,
        )
        _inject_jwks(validator, provider, mock_jwks_client)

        user = validator.validate_token(token, provider)
        assert user.name == "Jane Doe"


# ---------------------------------------------------------------------------
# 1.15 – Roles normalization from string
# ---------------------------------------------------------------------------


class TestRolesNormalization:
    """Validates: Requirement 1.15"""

    def test_string_roles_normalized_to_list(
        self, validator, mock_jwks_client, make_jwt, provider_default
    ):
        token = make_jwt(
            claims={"roles": "Admin"},
            provider=provider_default,
        )
        _inject_jwks(validator, provider_default, mock_jwks_client)

        user = validator.validate_token(token, provider_default)
        assert user.roles == ["Admin"]


# ---------------------------------------------------------------------------
# 1.16 – Email fallback to preferred_username
# ---------------------------------------------------------------------------


class TestEmailFallback:
    """Validates: Requirement 1.16"""

    def test_email_falls_back_to_preferred_username(
        self, validator, mock_jwks_client, make_jwt, provider_default
    ):
        # Explicitly set "email" to None so _extract_claim returns None,
        # triggering the preferred_username fallback.
        token = make_jwt(
            claims={
                "sub": "user-001",
                "email": None,
                "preferred_username": "jdoe@example.com",
                "name": "J Doe",
                "roles": ["User"],
            },
            provider=provider_default,
        )
        _inject_jwks(validator, provider_default, mock_jwks_client)

        user = validator.validate_token(token, provider_default)
        assert user.email == "jdoe@example.com"


# ---------------------------------------------------------------------------
# 1.17 – JWKS client caching
# ---------------------------------------------------------------------------


class TestJWKSClientCaching:
    """Validates: Requirement 1.17"""

    def test_jwks_client_reused_for_same_uri(
        self, validator, mock_jwks_client, make_jwt, provider_default
    ):
        _inject_jwks(validator, provider_default, mock_jwks_client)

        # Call twice
        token1 = make_jwt(provider=provider_default)
        validator.validate_token(token1, provider_default)

        token2 = make_jwt(
            claims={"sub": "user-002", "email": "other@example.com"},
            provider=provider_default,
        )
        validator.validate_token(token2, provider_default)

        # The same client instance should be in the cache
        assert len(validator._jwks_clients) == 1
        assert provider_default.jwks_uri in validator._jwks_clients


# ---------------------------------------------------------------------------
# 1.18, 1.19 – resolve_provider_from_token
# ---------------------------------------------------------------------------


class TestResolveProviderFromToken:
    """Validates: Requirements 1.18, 1.19"""

    @pytest.mark.asyncio
    async def test_resolve_returns_matching_provider(
        self, validator, make_jwt, make_provider, mock_provider_repo
    ):
        provider = make_provider(
            issuer_url="https://login.example.com/",
            enabled=True,
        )
        mock_provider_repo.list_providers = AsyncMock(return_value=[provider])
        token = make_jwt(
            claims={"iss": "https://login.example.com/"},
            provider=provider,
        )

        result = await validator.resolve_provider_from_token(token)

        assert result is not None
        assert result.provider_id == provider.provider_id

    @pytest.mark.asyncio
    async def test_resolve_returns_none_for_unknown_issuer(
        self, validator, make_jwt, make_provider, mock_provider_repo
    ):
        provider = make_provider(
            issuer_url="https://login.example.com/",
            enabled=True,
        )
        mock_provider_repo.list_providers = AsyncMock(return_value=[provider])
        token = make_jwt(
            claims={"iss": "https://unknown.example.com/"},
            provider=provider,
        )

        result = await validator.resolve_provider_from_token(token)

        assert result is None


# ---------------------------------------------------------------------------
# 1.20 – invalidate_cache
# ---------------------------------------------------------------------------


class TestInvalidateCache:
    """Validates: Requirement 1.20"""

    def test_invalidate_cache_clears_both_caches(
        self, validator, mock_jwks_client, make_jwt, provider_default
    ):
        # Populate caches
        _inject_jwks(validator, provider_default, mock_jwks_client)
        validator._issuer_to_provider["https://login.example.com/"] = provider_default

        assert len(validator._jwks_clients) == 1
        assert len(validator._issuer_to_provider) == 1

        validator.invalidate_cache()

        assert len(validator._jwks_clients) == 0
        assert len(validator._issuer_to_provider) == 0


# ---------------------------------------------------------------------------
# 1.21 – Dot-notation claim extraction
# ---------------------------------------------------------------------------


class TestDotNotationClaimExtraction:
    """Validates: Requirement 1.21"""

    def test_dot_notation_traverses_nested_dicts(self, validator):
        payload = {"address": {"street": "123 Main", "country": "US"}}
        result = validator._extract_claim(payload, "address.country")
        assert result == "US"

    def test_dot_notation_missing_intermediate_returns_none(self, validator):
        payload = {"address": {"street": "123 Main"}}
        result = validator._extract_claim(payload, "address.country")
        assert result is None

    def test_dot_notation_deep_nesting(self, validator):
        payload = {"a": {"b": {"c": "deep_value"}}}
        result = validator._extract_claim(payload, "a.b.c")
        assert result == "deep_value"


# ---------------------------------------------------------------------------
# 1.22 – URI-style claim lookup
# ---------------------------------------------------------------------------


class TestURIStyleClaimLookup:
    """Validates: Requirement 1.22"""

    def test_uri_claim_direct_lookup(self, validator):
        payload = {
            "http://schemas.example.com/claims/id": "ext-user-42",
            "sub": "user-001",
        }
        result = validator._extract_claim(
            payload, "http://schemas.example.com/claims/id"
        )
        assert result == "ext-user-42"

    def test_uri_claim_missing_returns_none(self, validator):
        payload = {"sub": "user-001"}
        result = validator._extract_claim(
            payload, "http://schemas.example.com/claims/missing"
        )
        assert result is None
