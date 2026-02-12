"""OIDC authentication routes with multi-provider support."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from .models import (
    LoginResponse,
    LogoutResponse,
    TokenExchangeRequest,
    TokenExchangeResponse,
    TokenRefreshRequest,
    TokenRefreshResponse,
)
from .service import get_auth_service, get_generic_auth_service
from apis.shared.auth_providers.models import (
    AuthProviderPublicInfo,
    AuthProviderPublicListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get(
    "/providers",
    response_model=AuthProviderPublicListResponse,
    summary="List enabled authentication providers",
)
async def list_auth_providers() -> AuthProviderPublicListResponse:
    """
    Public endpoint (no authentication required).

    Returns enabled auth providers for the login page to display
    provider selection buttons.
    """
    try:
        from apis.shared.auth_providers.repository import get_auth_provider_repository

        repo = get_auth_provider_repository()
        if not repo.enabled:
            return AuthProviderPublicListResponse(providers=[])

        providers = await repo.list_providers(enabled_only=True)
        return AuthProviderPublicListResponse(
            providers=[
                AuthProviderPublicInfo(
                    provider_id=p.provider_id,
                    display_name=p.display_name,
                    logo_url=p.logo_url,
                    button_color=p.button_color,
                )
                for p in providers
            ]
        )
    except Exception as e:
        logger.debug(f"Error listing auth providers (may not be configured): {e}")
        return AuthProviderPublicListResponse(providers=[])


@router.get(
    "/login",
    response_model=LoginResponse,
    summary="Initiate OIDC login",
)
async def login(
    provider_id: Optional[str] = Query(None, description="Auth provider ID (omit for legacy Entra ID)"),
    redirect_uri: str = Query(None, description="Optional redirect URI override"),
    prompt: str = Query("select_account", description="Prompt type (select_account, login, consent)")
) -> LoginResponse:
    """
    Generate authorization URL for OIDC login.

    If provider_id is specified, uses the configured auth provider.
    Otherwise falls back to the legacy Entra ID configuration.
    """
    try:
        if provider_id:
            # Use generic multi-provider auth service
            auth_service = await get_generic_auth_service(provider_id)
        else:
            # Fall back to legacy Entra ID auth service
            auth_service = get_auth_service()

        state, code_challenge, nonce = auth_service.generate_state(redirect_uri=redirect_uri)

        authorization_url = auth_service.build_authorization_url(
            state=state,
            code_challenge=code_challenge,
            nonce=nonce,
            redirect_uri=redirect_uri,
            prompt=prompt
        )

        logger.info(
            f"Generated authorization URL for OIDC login"
            f"{f' (provider: {provider_id})' if provider_id else ' (legacy Entra ID)'}"
        )

        return LoginResponse(
            authorization_url=authorization_url,
            state=state
        )

    except ValueError as e:
        logger.error(f"Authentication not configured: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating authorization URL: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate authorization URL"
        )


@router.post(
    "/token",
    response_model=TokenExchangeResponse,
    status_code=status.HTTP_200_OK,
    summary="Exchange authorization code for tokens",
)
async def exchange_token(request: TokenExchangeRequest) -> TokenExchangeResponse:
    """
    Exchange authorization code for access and refresh tokens.

    Resolves the auth provider from the stored state's provider_id.
    Falls back to legacy Entra ID if no provider_id is in state.
    """
    try:
        # Peek at the state to determine provider (without consuming it)
        # The actual state validation/consumption happens inside exchange_code_for_tokens
        provider_id = _peek_provider_from_state(request.state)

        if provider_id:
            auth_service = await get_generic_auth_service(provider_id)
        else:
            auth_service = get_auth_service()

        tokens = await auth_service.exchange_code_for_tokens(
            code=request.code,
            state=request.state,
            redirect_uri=request.redirect_uri
        )

        return TokenExchangeResponse(**tokens)
    except ValueError as e:
        logger.error(f"Authentication not configured: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exchanging token: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token exchange failed."
        )


@router.post(
    "/refresh",
    response_model=TokenRefreshResponse,
    status_code=status.HTTP_200_OK,
    summary="Refresh access token",
)
async def refresh_token(
    request: TokenRefreshRequest,
    provider_id: Optional[str] = Query(None, description="Auth provider ID"),
) -> TokenRefreshResponse:
    """
    Refresh access token using refresh token.

    If provider_id is specified, uses that provider's token endpoint.
    Otherwise falls back to legacy Entra ID.
    """
    try:
        if provider_id:
            auth_service = await get_generic_auth_service(provider_id)
        else:
            auth_service = get_auth_service()

        tokens = await auth_service.refresh_access_token(request.refresh_token)

        return TokenRefreshResponse(**tokens)
    except ValueError as e:
        logger.error(f"Authentication not configured: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing token: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token refresh failed."
        )


@router.get(
    "/logout",
    response_model=LogoutResponse,
    summary="Get logout URL",
)
async def logout(
    provider_id: Optional[str] = Query(None, description="Auth provider ID"),
    post_logout_redirect_uri: str = Query(
        None,
        description="URL to redirect to after logout"
    )
) -> LogoutResponse:
    """
    Get logout URL for ending the user's session.

    If provider_id is specified, returns that provider's end session URL.
    Otherwise returns the legacy Entra ID logout URL.
    """
    try:
        if provider_id:
            auth_service = await get_generic_auth_service(provider_id)
        else:
            auth_service = get_auth_service()

        logout_url = auth_service.build_logout_url(
            post_logout_redirect_uri=post_logout_redirect_uri
        )

        logger.info(
            f"Generated logout URL"
            f"{f' (provider: {provider_id})' if provider_id else ' (legacy Entra ID)'}"
        )

        return LogoutResponse(logout_url=logout_url)

    except ValueError as e:
        logger.error(f"Authentication not configured: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating logout URL: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate logout URL"
        )


def _peek_provider_from_state(state: str) -> Optional[str]:
    """
    Peek at the OIDC state to determine which provider initiated the flow.

    This reads the state from the store WITHOUT consuming it. The actual
    consumption happens inside the auth service's exchange_code_for_tokens.

    For the in-memory store we inspect the internal dict directly.
    For DynamoDB we do a GetItem without the atomic delete.
    """
    try:
        from apis.shared.auth.state_store import create_state_store

        store = create_state_store()

        # For InMemoryStateStore, peek at the internal dict
        if hasattr(store, '_store'):
            entry = store._store.get(state)
            if entry:
                _, data = entry
                return data.provider_id if data else None
            return None

        # For DynamoDBStateStore, do a non-destructive read
        if hasattr(store, 'table'):
            import time
            response = store.table.get_item(
                Key={
                    'PK': f'STATE#{state}',
                    'SK': f'STATE#{state}',
                },
                ConsistentRead=True,
            )
            item = response.get('Item')
            if item:
                expires_at = item.get('expiresAt', 0)
                if int(time.time()) <= expires_at:
                    return item.get('provider_id')
            return None

    except Exception as e:
        logger.debug(f"Could not peek provider from state: {e}")

    return None
