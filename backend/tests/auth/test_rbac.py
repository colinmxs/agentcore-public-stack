"""Tests for RBAC role-checking utilities.

Covers require_roles (OR-logic), require_all_roles (AND-logic),
has_any_role, has_all_roles, predefined checkers, and edge cases.

Requirements: 4.1–4.12
"""

import pytest
from fastapi import HTTPException

from apis.shared.auth.rbac import (
    has_all_roles,
    has_any_role,
    require_admin,
    require_all_roles,
    require_roles,
)


# ---------------------------------------------------------------------------
# require_roles — OR logic
# ---------------------------------------------------------------------------


class TestRequireRoles:
    """Tests for require_roles() OR-logic dependency."""

    @pytest.mark.asyncio
    async def test_or_logic_grant(self, make_user):
        """User with one of the required roles is granted access (4.2)."""
        user = make_user(roles=["Admin", "Viewer"])
        checker = require_roles("Admin", "SuperAdmin")
        result = await checker(user=user)
        assert result is user

    @pytest.mark.asyncio
    async def test_or_logic_deny(self, make_user):
        """User with none of the required roles is denied with 403 (4.3)."""
        user = make_user(roles=["Viewer"])
        checker = require_roles("Admin", "SuperAdmin")
        with pytest.raises(HTTPException) as exc_info:
            await checker(user=user)
        assert exc_info.value.status_code == 403
        assert "Required roles" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_empty_roles_403(self, make_user):
        """User with empty roles list gets 403 with specific message (4.6)."""
        user = make_user(roles=[])
        checker = require_roles("Admin")
        with pytest.raises(HTTPException) as exc_info:
            await checker(user=user)
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "User has no assigned roles."


# ---------------------------------------------------------------------------
# require_all_roles — AND logic
# ---------------------------------------------------------------------------


class TestRequireAllRoles:
    """Tests for require_all_roles() AND-logic dependency."""

    @pytest.mark.asyncio
    async def test_and_logic_grant(self, make_user):
        """User with all required roles is granted access (4.4)."""
        user = make_user(roles=["Admin", "Security", "Viewer"])
        checker = require_all_roles("Admin", "Security")
        result = await checker(user=user)
        assert result is user

    @pytest.mark.asyncio
    async def test_and_logic_deny_with_missing_detail(self, make_user):
        """User missing a role is denied with 403 listing missing roles (4.5)."""
        user = make_user(roles=["Admin"])
        checker = require_all_roles("Admin", "Security")
        with pytest.raises(HTTPException) as exc_info:
            await checker(user=user)
        assert exc_info.value.status_code == 403
        assert "Security" in exc_info.value.detail
        assert "Missing required roles" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_empty_roles_403(self, make_user):
        """User with empty roles list gets 403 with specific message (4.6)."""
        user = make_user(roles=[])
        checker = require_all_roles("Admin", "Security")
        with pytest.raises(HTTPException) as exc_info:
            await checker(user=user)
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "User has no assigned roles."


# ---------------------------------------------------------------------------
# has_any_role — helper
# ---------------------------------------------------------------------------


class TestHasAnyRole:
    """Tests for has_any_role() helper function."""

    def test_true_when_matching(self, make_user):
        """Returns True when user has at least one matching role (4.7)."""
        user = make_user(roles=["Faculty", "Viewer"])
        assert has_any_role(user, "Admin", "Faculty") is True

    def test_false_when_no_match(self, make_user):
        """Returns False when user has no matching role (4.8)."""
        user = make_user(roles=["Viewer"])
        assert has_any_role(user, "Admin") is False

    def test_empty_roles_returns_false(self, make_user):
        """Returns False when user has empty roles list (4.11)."""
        user = make_user(roles=[])
        assert has_any_role(user, "Admin") is False


# ---------------------------------------------------------------------------
# has_all_roles — helper
# ---------------------------------------------------------------------------


class TestHasAllRoles:
    """Tests for has_all_roles() helper function."""

    def test_true_when_all_present(self, make_user):
        """Returns True when user has all specified roles (4.9)."""
        user = make_user(roles=["Admin", "Security", "Viewer"])
        assert has_all_roles(user, "Admin", "Security") is True

    def test_false_when_missing_one(self, make_user):
        """Returns False when user is missing at least one role (4.10)."""
        user = make_user(roles=["Admin"])
        assert has_all_roles(user, "Admin", "Security") is False

    def test_empty_roles_returns_false(self, make_user):
        """Returns False when user has empty roles list (4.11)."""
        user = make_user(roles=[])
        assert has_all_roles(user, "Admin") is False


# ---------------------------------------------------------------------------
# Predefined checkers
# ---------------------------------------------------------------------------


class TestRequireAdmin:
    """Tests for the predefined require_admin checker (4.12)."""

    @pytest.mark.asyncio
    async def test_admin_role_granted(self, make_user):
        """User with Admin role passes require_admin."""
        user = make_user(roles=["Admin"])
        result = await require_admin(user=user)
        assert result is user

    @pytest.mark.asyncio
    async def test_superadmin_role_granted(self, make_user):
        """User with SuperAdmin role passes require_admin."""
        user = make_user(roles=["SuperAdmin"])
        result = await require_admin(user=user)
        assert result is user

    @pytest.mark.asyncio
    async def test_dotnetdevelopers_role_granted(self, make_user):
        """User with DotNetDevelopers role passes require_admin."""
        user = make_user(roles=["DotNetDevelopers"])
        result = await require_admin(user=user)
        assert result is user

    @pytest.mark.asyncio
    async def test_non_admin_denied(self, make_user):
        """User without any admin role is denied."""
        user = make_user(roles=["Viewer"])
        with pytest.raises(HTTPException) as exc_info:
            await require_admin(user=user)
        assert exc_info.value.status_code == 403
