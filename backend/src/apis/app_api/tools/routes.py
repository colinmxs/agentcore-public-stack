"""API routes for tool discovery, permissions, and admin management."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from apis.shared.auth import User, get_current_user, require_admin
from apis.shared.rbac.service import get_app_role_service

# Import legacy service for backward compatibility
from agents.strands_agent.tools import (
    get_tool_catalog_service as get_legacy_catalog_service,
    ToolCategory as LegacyToolCategory,
)

# Import new service and models
from .service import ToolCatalogService, get_tool_catalog_service
from .models import (
    UserToolAccess,
    UserToolsResponse,
    ToolPreferencesRequest,
    ToolCreateRequest,
    ToolUpdateRequest,
    ToolRolesResponse,
    SetToolRolesRequest,
    AddRemoveRolesRequest,
    AdminToolResponse,
    AdminToolListResponse,
    SyncResult,
    ToolDefinition,
    ToolCategory,
    ToolProtocol,
    ToolStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tools", tags=["tools"])


# =============================================================================
# Legacy Response Models (for backward compatibility)
# =============================================================================


class LegacyToolResponse(BaseModel):
    """Response model for a single tool (legacy format)."""

    tool_id: str = Field(..., alias="toolId")
    name: str
    description: str
    category: str
    is_gateway_tool: bool = Field(..., alias="isGatewayTool")
    requires_api_key: Optional[str] = Field(None, alias="requiresApiKey")
    icon: Optional[str] = None

    model_config = {"populate_by_name": True}


class LegacyToolListResponse(BaseModel):
    """Response model for listing tools (legacy format)."""

    tools: List[LegacyToolResponse]
    total: int


class UserToolPermissionsResponse(BaseModel):
    """Response model for user's tool permissions."""

    user_id: str = Field(..., alias="userId")
    allowed_tools: List[str] = Field(..., alias="allowedTools")
    has_wildcard: bool = Field(..., alias="hasWildcard")
    app_roles: List[str] = Field(..., alias="appRoles")

    model_config = {"populate_by_name": True}


# =============================================================================
# Public User Endpoints
# =============================================================================


@router.get("/", response_model=UserToolsResponse)
async def get_user_tools(
    user: User = Depends(get_current_user),
):
    """
    Get tools available to the current user with preferences merged.

    This is the main endpoint for the frontend to fetch user's tools.
    Returns tools based on AppRole permissions and user preferences.

    Args:
        user: Authenticated user (injected)

    Returns:
        UserToolsResponse with user's accessible tools
    """
    logger.info(f"User {user.email} getting tools with preferences")

    service = get_tool_catalog_service()
    tools = await service.get_user_accessible_tools(user)
    categories = await service.get_categories(user)

    # Get AppRoles applied
    role_service = get_app_role_service()
    permissions = await role_service.resolve_user_permissions(user)

    return UserToolsResponse(
        tools=tools,
        categories=categories,
        app_roles_applied=permissions.app_roles,
    )


@router.put("/preferences")
async def update_tool_preferences(
    request: ToolPreferencesRequest,
    user: User = Depends(get_current_user),
):
    """
    Save user's tool enabled/disabled preferences.

    Only accepts preferences for tools the user has access to.

    Args:
        request: Tool preferences to save
        user: Authenticated user (injected)

    Returns:
        Success message
    """
    logger.info(f"User {user.email} updating tool preferences")

    service = get_tool_catalog_service()

    try:
        await service.save_user_preferences(user, request.preferences)
        return {"message": "Preferences saved successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# Legacy Public Endpoints (backward compatibility)
# =============================================================================


@router.get("/catalog", response_model=LegacyToolListResponse)
async def list_all_tools(
    category: Optional[str] = Query(
        None, description="Filter by category (search, browser, data, utilities, code, gateway)"
    ),
    user: User = Depends(get_current_user),
):
    """
    List all tools available in the system (legacy endpoint).

    This returns the complete tool catalog with metadata.
    Use GET /tools for the new format with user preferences.

    Args:
        category: Optional category filter
        user: Authenticated user (injected)

    Returns:
        LegacyToolListResponse with list of all tools
    """
    logger.info(f"User {user.email} listing tool catalog (legacy)")

    catalog_service = get_legacy_catalog_service()

    if category:
        try:
            cat = LegacyToolCategory(category.lower())
            tools = catalog_service.get_tools_by_category(cat)
        except ValueError:
            tools = []
    else:
        tools = catalog_service.get_all_tools()

    return LegacyToolListResponse(
        tools=[
            LegacyToolResponse(
                tool_id=t.tool_id,
                name=t.name,
                description=t.description,
                category=t.category.value,
                is_gateway_tool=t.is_gateway_tool,
                requires_api_key=t.requires_api_key,
                icon=t.icon,
            )
            for t in tools
        ],
        total=len(tools),
    )


@router.get("/my-permissions", response_model=UserToolPermissionsResponse)
async def get_my_tool_permissions(
    user: User = Depends(get_current_user),
):
    """
    Get the current user's tool permissions.

    Returns the list of tool IDs the user is allowed to use based on their AppRoles.
    A wildcard (*) in allowed_tools means all tools are allowed.

    Args:
        user: Authenticated user (injected)

    Returns:
        UserToolPermissionsResponse with user's allowed tools
    """
    logger.info(f"User {user.email} checking tool permissions")

    role_service = get_app_role_service()
    permissions = await role_service.resolve_user_permissions(user)

    return UserToolPermissionsResponse(
        user_id=user.user_id,
        allowed_tools=permissions.tools,
        has_wildcard="*" in permissions.tools,
        app_roles=permissions.app_roles,
    )


@router.get("/available", response_model=LegacyToolListResponse)
async def list_available_tools(
    category: Optional[str] = Query(
        None, description="Filter by category (search, browser, data, utilities, code, gateway)"
    ),
    user: User = Depends(get_current_user),
):
    """
    List tools available to the current user (legacy endpoint).

    This returns only tools the user is authorized to use based on their AppRoles.
    Use GET /tools for the new format with user preferences.

    Args:
        category: Optional category filter
        user: Authenticated user (injected)

    Returns:
        LegacyToolListResponse with user's available tools
    """
    logger.info(f"User {user.email} listing available tools (legacy)")

    catalog_service = get_legacy_catalog_service()
    role_service = get_app_role_service()

    permissions = await role_service.resolve_user_permissions(user)
    has_wildcard = "*" in permissions.tools
    allowed_tool_ids = set(permissions.tools)

    if category:
        try:
            cat = LegacyToolCategory(category.lower())
            all_tools = catalog_service.get_tools_by_category(cat)
        except ValueError:
            all_tools = []
    else:
        all_tools = catalog_service.get_all_tools()

    if has_wildcard:
        available_tools = all_tools
    else:
        available_tools = [t for t in all_tools if t.tool_id in allowed_tool_ids]

    return LegacyToolListResponse(
        tools=[
            LegacyToolResponse(
                tool_id=t.tool_id,
                name=t.name,
                description=t.description,
                category=t.category.value,
                is_gateway_tool=t.is_gateway_tool,
                requires_api_key=t.requires_api_key,
                icon=t.icon,
            )
            for t in available_tools
        ],
        total=len(available_tools),
    )


# =============================================================================
# Admin Endpoints - Tool Catalog CRUD
# =============================================================================


@router.get("/admin/", response_model=AdminToolListResponse)
async def admin_list_all_tools(
    status: Optional[str] = Query(None, description="Filter by status (active, deprecated, disabled)"),
    admin: User = Depends(require_admin),
):
    """
    List all tools in the catalog with their role assignments.

    Requires admin access.

    Args:
        status: Optional status filter
        admin: Authenticated admin user (injected)

    Returns:
        AdminToolListResponse with all tools
    """
    logger.info(f"Admin {admin.email} listing full tool catalog")

    service = get_tool_catalog_service()
    tools = await service.get_all_tools(status=status, include_roles=True)

    return AdminToolListResponse(
        tools=[AdminToolResponse.from_tool_definition(t) for t in tools],
        total=len(tools),
    )


@router.get("/admin/{tool_id}", response_model=AdminToolResponse)
async def admin_get_tool(
    tool_id: str,
    admin: User = Depends(require_admin),
):
    """
    Get a specific tool by ID.

    Requires admin access.

    Args:
        tool_id: Tool identifier
        admin: Authenticated admin user (injected)

    Returns:
        AdminToolResponse for the tool
    """
    logger.info(f"Admin {admin.email} getting tool: {tool_id}")

    service = get_tool_catalog_service()
    tool = await service.get_tool(tool_id)

    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_id}' not found")

    # Get roles for this tool
    roles = await service.get_roles_for_tool(tool_id)
    allowed_roles = [r.role_id for r in roles if r.grant_type == "direct"]

    return AdminToolResponse.from_tool_definition(tool, allowed_roles)


@router.post("/admin/", response_model=AdminToolResponse)
async def admin_create_tool(
    request: ToolCreateRequest,
    admin: User = Depends(require_admin),
):
    """
    Create a new tool catalog entry.

    Requires admin access. This only creates the catalog entry.
    To grant access to AppRoles, use the role management endpoints.

    Args:
        request: Tool creation data
        admin: Authenticated admin user (injected)

    Returns:
        Created AdminToolResponse
    """
    logger.info(f"Admin {admin.email} creating tool: {request.tool_id}")

    service = get_tool_catalog_service()

    tool = ToolDefinition(
        tool_id=request.tool_id,
        display_name=request.display_name,
        description=request.description,
        category=request.category,
        icon=request.icon,
        protocol=request.protocol,
        status=request.status,
        requires_api_key=request.requires_api_key,
        is_public=request.is_public,
        enabled_by_default=request.enabled_by_default,
    )

    try:
        created = await service.create_tool(tool, admin)
        return AdminToolResponse.from_tool_definition(created)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/admin/{tool_id}", response_model=AdminToolResponse)
async def admin_update_tool(
    tool_id: str,
    request: ToolUpdateRequest,
    admin: User = Depends(require_admin),
):
    """
    Update tool metadata.

    Requires admin access.

    Args:
        tool_id: Tool identifier
        request: Fields to update
        admin: Authenticated admin user (injected)

    Returns:
        Updated AdminToolResponse
    """
    logger.info(f"Admin {admin.email} updating tool: {tool_id}")

    service = get_tool_catalog_service()

    updates = request.model_dump(exclude_unset=True, by_alias=False)
    updated = await service.update_tool(tool_id, updates, admin)

    if not updated:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_id}' not found")

    return AdminToolResponse.from_tool_definition(updated)


@router.delete("/admin/{tool_id}")
async def admin_delete_tool(
    tool_id: str,
    hard: bool = Query(False, description="If true, permanently delete instead of soft delete"),
    admin: User = Depends(require_admin),
):
    """
    Delete a tool from the catalog.

    By default, performs a soft delete (sets status to disabled).
    Use hard=true to permanently delete.

    Requires admin access.

    Args:
        tool_id: Tool identifier
        hard: If true, permanently delete
        admin: Authenticated admin user (injected)

    Returns:
        Success message
    """
    logger.info(f"Admin {admin.email} deleting tool: {tool_id} (hard={hard})")

    service = get_tool_catalog_service()
    deleted = await service.delete_tool(tool_id, admin, soft=not hard)

    if not deleted:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_id}' not found")

    action = "deleted" if hard else "disabled"
    return {"message": f"Tool '{tool_id}' {action} successfully"}


# =============================================================================
# Admin Endpoints - Bidirectional Sync
# =============================================================================


@router.get("/admin/{tool_id}/roles", response_model=ToolRolesResponse)
async def get_tool_roles(
    tool_id: str,
    admin: User = Depends(require_admin),
):
    """
    Get AppRoles that grant access to this tool.

    Requires admin access.

    Args:
        tool_id: Tool identifier
        admin: Authenticated admin user (injected)

    Returns:
        ToolRolesResponse with role assignments
    """
    logger.info(f"Admin {admin.email} getting roles for tool: {tool_id}")

    service = get_tool_catalog_service()

    # Verify tool exists
    tool = await service.get_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_id}' not found")

    roles = await service.get_roles_for_tool(tool_id)

    return ToolRolesResponse(tool_id=tool_id, roles=roles)


@router.put("/admin/{tool_id}/roles")
async def set_tool_roles(
    tool_id: str,
    request: SetToolRolesRequest,
    admin: User = Depends(require_admin),
):
    """
    Set which AppRoles grant access to this tool.

    This replaces the current role assignments. Roles not in the list
    will have this tool removed from their grantedTools.

    Requires admin access.

    Args:
        tool_id: Tool identifier
        request: List of AppRole IDs
        admin: Authenticated admin user (injected)

    Returns:
        Success message
    """
    logger.info(f"Admin {admin.email} setting roles for tool: {tool_id}")

    service = get_tool_catalog_service()

    try:
        await service.set_roles_for_tool(tool_id, request.app_role_ids, admin)
        return {"message": f"Roles updated for tool '{tool_id}'"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/{tool_id}/roles/add")
async def add_roles_to_tool(
    tool_id: str,
    request: AddRemoveRolesRequest,
    admin: User = Depends(require_admin),
):
    """
    Add AppRoles to tool access (preserves existing).

    Requires admin access.

    Args:
        tool_id: Tool identifier
        request: List of AppRole IDs to add
        admin: Authenticated admin user (injected)

    Returns:
        Success message
    """
    logger.info(f"Admin {admin.email} adding roles to tool: {tool_id}")

    service = get_tool_catalog_service()

    try:
        await service.add_roles_to_tool(tool_id, request.app_role_ids, admin)
        return {"message": f"Roles added to tool '{tool_id}'"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/{tool_id}/roles/remove")
async def remove_roles_from_tool(
    tool_id: str,
    request: AddRemoveRolesRequest,
    admin: User = Depends(require_admin),
):
    """
    Remove AppRoles from tool access.

    Requires admin access.

    Args:
        tool_id: Tool identifier
        request: List of AppRole IDs to remove
        admin: Authenticated admin user (injected)

    Returns:
        Success message
    """
    logger.info(f"Admin {admin.email} removing roles from tool: {tool_id}")

    service = get_tool_catalog_service()

    try:
        await service.remove_roles_from_tool(tool_id, request.app_role_ids, admin)
        return {"message": f"Roles removed from tool '{tool_id}'"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/sync", response_model=SyncResult)
async def sync_from_registry(
    dry_run: bool = Query(True, description="If true, only report what would happen"),
    admin: User = Depends(require_admin),
):
    """
    Sync catalog from code registry.

    Discovers tools from the backend tool registry and updates the catalog:
    - Creates entries for new tools
    - Marks orphaned tools as deprecated

    Requires admin access.

    Args:
        dry_run: If true, only report changes without applying
        admin: Authenticated admin user (injected)

    Returns:
        SyncResult with discovered, orphaned, and unchanged tools
    """
    logger.info(f"Admin {admin.email} syncing tool catalog (dry_run={dry_run})")

    service = get_tool_catalog_service()
    result = await service.sync_catalog_from_registry(admin, dry_run=dry_run)

    return result


# =============================================================================
# Legacy Admin Endpoints (backward compatibility)
# =============================================================================


@router.get("/admin/catalog", response_model=LegacyToolListResponse)
async def legacy_admin_list_all_tools(
    admin: User = Depends(require_admin),
):
    """
    Admin endpoint to list all tools in the catalog (legacy format).

    Use GET /admin/ for the new format with role assignments.

    Requires admin access.

    Args:
        admin: Authenticated admin user (injected)

    Returns:
        LegacyToolListResponse with all tools
    """
    logger.info(f"Admin {admin.email} listing full tool catalog (legacy)")

    catalog_service = get_legacy_catalog_service()
    tools = catalog_service.get_all_tools()

    return LegacyToolListResponse(
        tools=[
            LegacyToolResponse(
                tool_id=t.tool_id,
                name=t.name,
                description=t.description,
                category=t.category.value,
                is_gateway_tool=t.is_gateway_tool,
                requires_api_key=t.requires_api_key,
                icon=t.icon,
            )
            for t in tools
        ],
        total=len(tools),
    )
