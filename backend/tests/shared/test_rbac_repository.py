"""Task 5: RBAC repository tests (moto DynamoDB)."""

import pytest
from apis.shared.rbac.models import AppRole, EffectivePermissions


def _make_role(role_id="editor", **kw):
    defaults = dict(
        role_id=role_id, display_name="Editor", description="Can edit",
        jwt_role_mappings=["jwt-editor"], granted_tools=["tool-1"],
        granted_models=["model-1"], enabled=True,
    )
    defaults.update(kw)
    return AppRole(**defaults)


class TestAppRoleRepository:
    @pytest.mark.asyncio
    async def test_create_and_get(self, role_repository):
        role = _make_role()
        created = await role_repository.create_role(role)
        assert created.role_id == "editor"
        result = await role_repository.get_role("editor")
        assert result is not None
        assert result.display_name == "Editor"

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, role_repository):
        assert await role_repository.get_role("nope") is None

    @pytest.mark.asyncio
    async def test_list_roles(self, role_repository):
        await role_repository.create_role(_make_role("r1"))
        await role_repository.create_role(_make_role("r2"))
        roles = await role_repository.list_roles()
        assert len(roles) == 2

    @pytest.mark.asyncio
    async def test_list_enabled_only(self, role_repository):
        await role_repository.create_role(_make_role("r1", enabled=True))
        await role_repository.create_role(_make_role("r2", enabled=False))
        roles = await role_repository.list_roles(enabled_only=True)
        assert len(roles) == 1

    @pytest.mark.asyncio
    async def test_update_role(self, role_repository):
        await role_repository.create_role(_make_role())
        role = await role_repository.get_role("editor")
        role.display_name = "Senior Editor"
        updated = await role_repository.update_role(role)
        assert updated.display_name == "Senior Editor"

    @pytest.mark.asyncio
    async def test_delete_role(self, role_repository):
        await role_repository.create_role(_make_role())
        deleted = await role_repository.delete_role("editor")
        assert deleted is True
        assert await role_repository.get_role("editor") is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, role_repository):
        deleted = await role_repository.delete_role("nope")
        assert deleted is False

    @pytest.mark.asyncio
    async def test_role_exists(self, role_repository):
        await role_repository.create_role(_make_role())
        assert await role_repository.role_exists("editor") is True
        assert await role_repository.role_exists("nope") is False

    @pytest.mark.asyncio
    async def test_get_roles_for_jwt_role(self, role_repository):
        await role_repository.create_role(_make_role("r1", jwt_role_mappings=["admin"]))
        await role_repository.create_role(_make_role("r2", jwt_role_mappings=["user"]))
        roles = await role_repository.get_roles_for_jwt_role("admin")
        assert len(roles) == 1

    @pytest.mark.asyncio
    async def test_get_roles_for_tool(self, role_repository):
        await role_repository.create_role(_make_role("r1", granted_tools=["calc"]))
        roles = await role_repository.get_roles_for_tool("calc")
        assert len(roles) >= 1

    @pytest.mark.asyncio
    async def test_get_roles_for_model(self, role_repository):
        await role_repository.create_role(_make_role("r1", granted_models=["gpt4"]))
        roles = await role_repository.get_roles_for_model("gpt4")
        assert len(roles) >= 1


class TestRBACSeeder:
    @pytest.mark.asyncio
    async def test_seed_system_roles(self, role_repository):
        from apis.shared.rbac.seeder import seed_system_roles
        await seed_system_roles(role_repository)
        admin = await role_repository.get_role("system_admin")
        assert admin is not None
        assert admin.is_system_role is True
