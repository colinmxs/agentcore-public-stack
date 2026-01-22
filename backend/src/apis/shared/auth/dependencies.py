"""FastAPI dependencies for authentication."""

import asyncio
import jwt
import logging
import os
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .jwt_validator import get_validator
from .models import User

logger = logging.getLogger(__name__)

# Lazy import to avoid circular dependencies
_user_sync_service = None


def _get_user_sync_service():
    """Get UserSyncService instance, creating it lazily on first use."""
    global _user_sync_service
    if _user_sync_service is None:
        try:
            from apis.shared.users.repository import UserRepository
            from apis.shared.users.sync import UserSyncService
            repository = UserRepository()
            _user_sync_service = UserSyncService(repository=repository)
            if _user_sync_service.enabled:
                logger.info("UserSyncService initialized for JWT sync")
            else:
                logger.debug("UserSyncService disabled - no table configured")
        except Exception as e:
            logger.warning(f"Failed to initialize UserSyncService: {e}")
            _user_sync_service = None
    return _user_sync_service

# HTTP Bearer token security scheme with auto_error=False to handle missing tokens manually
security = HTTPBearer(auto_error=False)


async def _sync_user_background(sync_service, user: User) -> None:
    """Sync user to DynamoDB in the background (fire-and-forget)."""
    try:
        await sync_service.sync_user_from_jwt(user)
        logger.debug(f"Synced user {user.user_id} to Users table")
    except Exception as e:
        # Log but don't fail - sync should never break authentication
        logger.warning(f"Failed to sync user {user.user_id}: {e}")

# Check if authentication is enabled (defaults to true for security)
ENABLE_AUTHENTICATION = os.environ.get('ENABLE_AUTHENTICATION', 'true').lower() == 'true'

# Environment check - only allow auth bypass in development
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'production').lower()
IS_DEVELOPMENT = ENVIRONMENT in ('development', 'dev', 'local')


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> User:
    """
    FastAPI dependency to get the current authenticated user.

    Extracts Bearer token from Authorization header and validates it.
    Returns 401 Unauthorized if token is missing or invalid.
    Returns 403 Forbidden if token is valid but user lacks required roles.

    When ENABLE_AUTHENTICATION=false AND ENVIRONMENT=development, bypasses
    authentication for local development only. In production, auth bypass
    is not allowed and will raise an error.

    Args:
        credentials: HTTP Bearer token credentials (None if missing)

    Returns:
        User object with authenticated user information

    Raises:
        HTTPException:
            - 401 if token is missing or invalid
            - 403 if user doesn't have required roles
            - 500 if auth is misconfigured (disabled in non-dev environment)
    """
    # Check if authentication is disabled
    if not ENABLE_AUTHENTICATION:
        if not IS_DEVELOPMENT:
            # Fail closed in non-development environments
            logger.error(
                "SECURITY ERROR: ENABLE_AUTHENTICATION=false in non-development environment. "
                "This is not allowed. Set ENVIRONMENT=development or enable authentication."
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication service misconfigured."
            )
        logger.warning(
            "⚠️ Authentication is DISABLED (ENABLE_AUTHENTICATION=false, ENVIRONMENT=development)"
        )
        return User(
            email="anonymous@local.dev",
            user_id="000000000",
            name="Anonymous User (Dev)",
            roles=["Developer"],  # Give dev role for local testing
            picture=None
        )
    
    # Check if credentials are missing
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token in the Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    validator = get_validator()
    
    # Validator should always be available when auth is enabled
    if validator is None:
        logger.error("Validator is None but authentication is enabled - this should not happen")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service misconfigured."
        )
    
    try:
        user = validator.validate_token(token)

        # Fire-and-forget sync to Users table
        sync_service = _get_user_sync_service()
        if sync_service and sync_service.enabled:
            # Use asyncio.create_task for fire-and-forget behavior
            asyncio.create_task(_sync_user_background(sync_service, user))

        return user
    except HTTPException:
        # Re-raise HTTPExceptions (401 for invalid tokens, 403 for missing roles)
        raise
    except Exception as e:
        logger.error(f"Unexpected error in authentication: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed."
        )


async def get_current_user_id(
    user: User = Depends(get_current_user)
) -> str:
    """
    FastAPI dependency to get the current user's ID as a string.
    
    This is a convenience wrapper around get_current_user that extracts
    just the user_id field. Useful when you only need the user ID and not
    the full User object.
    
    When ENABLE_AUTHENTICATION=false, returns "anonymous".
    
    Args:
        user: User object from get_current_user dependency
    
    Returns:
        User ID string (or "anonymous" if auth disabled)
    """
    return user.user_id


async def get_current_user_trusted(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> User:
    """
    FastAPI dependency to get current user from pre-validated JWT.
    
    Use this when JWT validation is already performed at the network level
    (e.g., by AWS Bedrock AgentCore Runtime's JWT authorizer). This method
    skips expensive signature verification and simply extracts claims from
    the token.
    
    Security: Only use this in services where the JWT validation
    is guaranteed. IE AgentCore Runtime with Inbound Auth. For services without pre-validation, use
    get_current_user() instead.
    
    When ENABLE_AUTHENTICATION=false AND ENVIRONMENT=development, bypasses
    authentication for local development only.
    
    Args:
        credentials: HTTP Bearer token credentials (None if missing)
    
    Returns:
        User object with authenticated user information
    
    Raises:
        HTTPException:
            - 401 if token is missing or malformed
            - 500 if auth is misconfigured (disabled in non-dev environment)
    """
    # Check if authentication is disabled
    if not ENABLE_AUTHENTICATION:
        if not IS_DEVELOPMENT:
            # Fail closed in non-development environments
            logger.error(
                "SECURITY ERROR: ENABLE_AUTHENTICATION=false in non-development environment. "
                "This is not allowed. Set ENVIRONMENT=development or enable authentication."
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication service misconfigured."
            )
        logger.warning(
            "⚠️ Authentication is DISABLED (ENABLE_AUTHENTICATION=false, ENVIRONMENT=development)"
        )
        return User(
            email="anonymous@local.dev",
            user_id="000000000",
            name="Anonymous User (Dev)",
            roles=["Developer"],  # Give dev role for local testing
            picture=None
        )
    
    # Check if credentials are missing
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token in the Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    
    try:
        # Decode JWT without verification (network layer already validated it)
        payload = jwt.decode(token, options={"verify_signature": False})
        
        # Extract user information from claims
        email = payload.get('email') or payload.get('preferred_username')
        name = payload.get('name') or (
            f"{payload.get('given_name', '')} {payload.get('family_name', '')}"
        ).strip()
        user_id = payload.get('http://schemas.boisestate.edu/claims/employeenumber')
        roles = payload.get('roles', [])
        picture = payload.get('picture')
        
        # Basic validation of user_id (should still be a 9-digit number)
        if not user_id or not user_id.isdigit() or len(user_id) != 9:
            logger.warning(f"Invalid emplId in network-validated token for user: {email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user."
            )
        
        user = User(
            email=email.lower() if email else "",
            name=name,
            user_id=user_id,
            roles=roles,
            picture=picture
        )
        
        # Fire-and-forget sync to Users table
        sync_service = _get_user_sync_service()
        if sync_service and sync_service.enabled:
            # Use asyncio.create_task for fire-and-forget behavior
            asyncio.create_task(_sync_user_background(sync_service, user))
        
        return user
        
    except jwt.DecodeError as e:
        logger.error(f"Failed to decode JWT token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token."
        )
    except Exception as e:
        logger.error(f"Unexpected error extracting user from token: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed."
        )

