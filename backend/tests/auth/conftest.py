"""Shared fixtures for auth test suite.

Provides:
- RSA key pair generation for JWT signing/verification
- make_user() factory for creating User objects
- make_provider() factory for creating AuthProvider objects
- Mock AuthProviderRepository
- Mock PyJWKClient
- make_jwt() helper that signs tokens with the test RSA key
"""

import time
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from apis.shared.auth.models import User
from apis.shared.auth_providers.models import AuthProvider


# ---------------------------------------------------------------------------
# RSA key pair (generated once per test session for speed)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def rsa_key_pair():
    """Generate an RSA key pair for signing/verifying test JWTs."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_key = private_key.public_key()
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return {"private_key": private_key, "private_pem": private_pem, "public_key": public_key, "public_pem": public_pem}


# ---------------------------------------------------------------------------
# User factory
# ---------------------------------------------------------------------------

@pytest.fixture
def make_user():
    """Factory fixture that creates User objects with sensible defaults."""

    def _make_user(
        email: str = "test@example.com",
        user_id: str = "user-001",
        name: str = "Test User",
        roles: Optional[List[str]] = None,
        picture: Optional[str] = None,
        raw_token: Optional[str] = None,
    ) -> User:
        return User(
            email=email,
            user_id=user_id,
            name=name,
            roles=roles if roles is not None else ["User"],
            picture=picture,
            raw_token=raw_token,
        )

    return _make_user


# ---------------------------------------------------------------------------
# AuthProvider factory
# ---------------------------------------------------------------------------

@pytest.fixture
def make_provider():
    """Factory fixture that creates AuthProvider objects with sensible defaults."""

    def _make_provider(
        provider_id: str = "test-provider",
        display_name: str = "Test Provider",
        provider_type: str = "oidc",
        enabled: bool = True,
        issuer_url: str = "https://login.example.com/",
        client_id: str = "test-client-id",
        jwks_uri: str = "https://login.example.com/.well-known/jwks.json",
        authorization_endpoint: str = "https://login.example.com/authorize",
        token_endpoint: str = "https://login.example.com/token",
        end_session_endpoint: Optional[str] = "https://login.example.com/logout",
        scopes: str = "openid profile email",
        pkce_enabled: bool = True,
        user_id_claim: str = "sub",
        email_claim: str = "email",
        name_claim: str = "name",
        roles_claim: str = "roles",
        first_name_claim: Optional[str] = "given_name",
        last_name_claim: Optional[str] = "family_name",
        user_id_pattern: Optional[str] = None,
        required_scopes: Optional[List[str]] = None,
        allowed_audiences: Optional[List[str]] = None,
        redirect_uri: Optional[str] = "http://localhost:4200/auth/callback",
        **kwargs: Any,
    ) -> AuthProvider:
        return AuthProvider(
            provider_id=provider_id,
            display_name=display_name,
            provider_type=provider_type,
            enabled=enabled,
            issuer_url=issuer_url,
            client_id=client_id,
            jwks_uri=jwks_uri,
            authorization_endpoint=authorization_endpoint,
            token_endpoint=token_endpoint,
            end_session_endpoint=end_session_endpoint,
            scopes=scopes,
            pkce_enabled=pkce_enabled,
            user_id_claim=user_id_claim,
            email_claim=email_claim,
            name_claim=name_claim,
            roles_claim=roles_claim,
            first_name_claim=first_name_claim,
            last_name_claim=last_name_claim,
            user_id_pattern=user_id_pattern,
            required_scopes=required_scopes,
            allowed_audiences=allowed_audiences,
            redirect_uri=redirect_uri,
            **kwargs,
        )

    return _make_provider


# ---------------------------------------------------------------------------
# Mock AuthProviderRepository
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_provider_repo(make_provider):
    """Mock AuthProviderRepository that returns a default test provider."""
    provider = make_provider()
    repo = AsyncMock()
    repo.get_provider = AsyncMock(return_value=provider)
    repo.list_providers = AsyncMock(return_value=[provider])
    repo.enabled = True
    return repo


# ---------------------------------------------------------------------------
# Mock PyJWKClient
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_jwks_client(rsa_key_pair):
    """Mock PyJWKClient that returns the test RSA public key."""
    mock_client = MagicMock()
    mock_signing_key = MagicMock()
    mock_signing_key.key = rsa_key_pair["public_key"]
    mock_client.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)
    return mock_client


# ---------------------------------------------------------------------------
# JWT helper
# ---------------------------------------------------------------------------

@pytest.fixture
def make_jwt(rsa_key_pair, make_provider):
    """Factory fixture that creates signed JWT tokens using the test RSA key.

    Returns a function that accepts optional claim overrides and returns
    a (token_string, provider) tuple.
    """

    def _make_jwt(
        claims: Optional[Dict[str, Any]] = None,
        provider: Optional[AuthProvider] = None,
        headers: Optional[Dict[str, Any]] = None,
        expired: bool = False,
    ) -> str:
        prov = provider or make_provider()
        now = int(time.time())
        default_claims: Dict[str, Any] = {
            "sub": "user-001",
            "email": "test@example.com",
            "name": "Test User",
            "roles": ["User"],
            "iss": prov.issuer_url,
            "aud": prov.client_id,
            "iat": now,
            "exp": now - 3600 if expired else now + 3600,
        }
        if claims:
            default_claims.update(claims)

        default_headers = {"kid": "test-key-id"}
        if headers:
            default_headers.update(headers)

        token = jwt.encode(
            default_claims,
            rsa_key_pair["private_pem"],
            algorithm="RS256",
            headers=default_headers,
        )
        return token

    return _make_jwt
