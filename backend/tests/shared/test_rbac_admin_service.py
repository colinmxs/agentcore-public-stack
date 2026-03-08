"""RBAC admin service tests (moto DynamoDB)."""

import pytest
from unittest.mock import MagicMock


def _make_admin():
    u = MagicMock()
    u.user_id = "admin1"
    u.email = "admin@test.com"
    u.roles = ["system_admin"]
    return u


class TestAppRoleAdminService:
    @pytest.fixture(autouse=True)
    def _setup(self, role_repository):
        from apis.shared.rbac.admin_service import AppRoleAdminService
        from apis.shared.rbac.cache import AppRoleCache
        self.repo = role_repository
        self.cache = AppRoleCache()
        self.svc = AppRoleAdminService(repository=self.repo, cache=self.cache)

    def _make_create(self, role_id="custom_role", **kw):
        from apis.shared.rbac.models import AppRoleCreate
        defaults = dict(
            role_id=role_id, display_name="Custom", jwt_role_mappings=["viewer"],
            granted_tools=["tool1"], granted_models=["model1"], priority=10,
        )
        defaults.update(kw)
        return AppRoleCreate(**defaults)

    @pytest.mark.asyncio
    async def test_create_and_get(self):
        role = await self.svc.create_role(self._make_create(), _make_admin())
        assert role.role_id == "custom_role"
        assert role.effective_permissions is not None
        got = await self.svc.get_role("custom_role")
        assert got is not None

    @pytest.mark.asyncio
    async def test_list_roles(self):
        await self.svc.create_role(self._make_create("role_one"), _make_admin())
        await self.svc.create_role(self._make_create("role_two"), _make_admin())
        roles = await self.svc.list_roles()
        assert len(roles) >= 2

    @pytest.mark.asyncio
    async def test_update_role(self):
        from apis.shared.rbac.models import AppRoleUpdate
        await self.svc.create_role(self._make_create(), _make_admin())
        updated = await self.svc.update_role(
            "custom_role", AppRoleUpdate(display_name="Updated"), _make_admin()
        )
        assert updated.display_name == "Updated"

    @pytest.mark.asyncio
    async def test_update_nonexistent(self):
        from apis.shared.rbac.models import AppRoleUpdate
        result = await self.svc.update_role("nope", AppRoleUpdate(display_name="X"), _make_admin())
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_role(self):
        await self.svc.create_role(self._make_create(), _make_admin())
        assert await self.svc.delete_role("custom_role", _make_admin()) is True
        assert await self.svc.get_role("custom_role") is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self):
        assert await self.svc.delete_role("nope", _make_admin()) is False

    @pytest.mark.asyncio
    async def test_delete_system_role_raises(self):
        from apis.shared.rbac.models import AppRoleCreate
        create = self._make_create("sys_role")
        role = await self.svc.create_role(create, _make_admin())
        # Manually mark as system role
        role.is_system_role = True
        await self.repo.update_role(role)
        with pytest.raises(ValueError, match="system role"):
            await self.svc.delete_role("sys_role", _make_admin())

    @pytest.mark.asyncio
    async def test_compute_effective_permissions_with_inheritance(self):
        # Create parent role
        await self.svc.create_role(
            self._make_create("parent_role", granted_tools=["parent_tool"], granted_models=["parent_model"]),
            _make_admin(),
        )
        # Create child that inherits from parent
        child_create = self._make_create(
            "child_role", granted_tools=["child_tool"], granted_models=["child_model"],
            inherits_from=["parent_role"],
        )
        child = await self.svc.create_role(child_create, _make_admin())
        assert "parent_tool" in child.effective_permissions.tools
        assert "child_tool" in child.effective_permissions.tools

    @pytest.mark.asyncio
    async def test_validate_inheritance_missing_parent(self):
        with pytest.raises(ValueError, match="does not exist"):
            await self.svc.create_role(
                self._make_create("child_role", inherits_from=["nonexistent_role"]),
                _make_admin(),
            )

    @pytest.mark.asyncio
    async def test_sync_effective_permissions(self):
        await self.svc.create_role(self._make_create(), _make_admin())
        synced = await self.svc.sync_effective_permissions("custom_role", _make_admin())
        assert synced is not None
        assert synced.effective_permissions is not None

    @pytest.mark.asyncio
    async def test_sync_nonexistent(self):
        assert await self.svc.sync_effective_permissions("nope", _make_admin()) is None
