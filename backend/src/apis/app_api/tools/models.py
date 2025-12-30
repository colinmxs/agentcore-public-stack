"""
Tool RBAC Models

Pydantic models for tool catalog, user tool access, and preferences.
Integrates with the existing AppRole RBAC system.
"""

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ToolCategory(str, Enum):
    """Categories for organizing tools in the UI."""

    SEARCH = "search"
    DATA = "data"
    VISUALIZATION = "visualization"
    DOCUMENT = "document"
    CODE = "code"
    BROWSER = "browser"
    UTILITY = "utility"
    RESEARCH = "research"
    FINANCE = "finance"
    GATEWAY = "gateway"
    CUSTOM = "custom"


class ToolProtocol(str, Enum):
    """Protocol used to invoke the tool."""

    LOCAL = "local"  # Direct function call
    AWS_SDK = "aws_sdk"  # AWS Bedrock services
    MCP_GATEWAY = "mcp"  # MCP via AgentCore Gateway
    A2A = "a2a"  # Agent-to-Agent


class ToolStatus(str, Enum):
    """Availability status of the tool."""

    ACTIVE = "active"
    DEPRECATED = "deprecated"
    DISABLED = "disabled"
    COMING_SOON = "coming_soon"


# =============================================================================
# Database Models (stored in DynamoDB)
# =============================================================================


class ToolDefinition(BaseModel):
    """
    Catalog entry for a tool stored in DynamoDB.

    NOTE: Access control is managed via AppRoles, not stored directly on tools.
    The `allowed_app_roles` field is computed for display purposes only.
    """

    # Identity
    tool_id: str = Field(
        ..., description="Unique identifier (e.g., 'get_current_weather')"
    )

    # Display metadata
    display_name: str = Field(
        ..., description="Human-readable name (e.g., 'Weather Lookup')"
    )
    description: str = Field(..., description="Description of what the tool does")
    category: ToolCategory = Field(default=ToolCategory.UTILITY)
    icon: Optional[str] = Field(
        None, description="Icon identifier for UI (e.g., 'heroCloud')"
    )

    # Technical metadata
    protocol: ToolProtocol = Field(..., description="How the tool is invoked")
    status: ToolStatus = Field(default=ToolStatus.ACTIVE)
    requires_api_key: bool = Field(
        default=False, description="Whether tool requires external API key"
    )

    # Access control
    is_public: bool = Field(
        default=False,
        description="If true, tool is available to all authenticated users regardless of role",
    )

    # Computed field - which AppRoles grant this tool (for admin UI display)
    allowed_app_roles: List[str] = Field(
        default_factory=list,
        description="AppRole IDs that grant access to this tool (computed from AppRoles)",
    )

    # Default behavior
    enabled_by_default: bool = Field(
        default=False,
        description="If true, tool is enabled when user first accesses it",
    )

    # Audit
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = Field(
        None, description="User ID of admin who created this entry"
    )
    updated_by: Optional[str] = Field(
        None, description="User ID of admin who last updated this"
    )

    model_config = {"use_enum_values": True}

    def to_dynamo_item(self) -> dict:
        """Convert to DynamoDB item format."""
        return {
            "PK": f"TOOL#{self.tool_id}",
            "SK": "METADATA",
            "GSI1PK": f"CATEGORY#{self.category}",
            "GSI1SK": f"TOOL#{self.tool_id}",
            "toolId": self.tool_id,
            "displayName": self.display_name,
            "description": self.description,
            "category": self.category if isinstance(self.category, str) else self.category.value,
            "icon": self.icon,
            "protocol": self.protocol if isinstance(self.protocol, str) else self.protocol.value,
            "status": self.status if isinstance(self.status, str) else self.status.value,
            "requiresApiKey": self.requires_api_key,
            "isPublic": self.is_public,
            "enabledByDefault": self.enabled_by_default,
            "createdAt": self.created_at.isoformat() + "Z" if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() + "Z" if self.updated_at else None,
            "createdBy": self.created_by,
            "updatedBy": self.updated_by,
        }

    @classmethod
    def from_dynamo_item(cls, item: dict) -> "ToolDefinition":
        """Create from DynamoDB item."""
        created_at = item.get("createdAt")
        updated_at = item.get("updatedAt")

        return cls(
            tool_id=item.get("toolId", ""),
            display_name=item.get("displayName", ""),
            description=item.get("description", ""),
            category=item.get("category", ToolCategory.UTILITY),
            icon=item.get("icon"),
            protocol=item.get("protocol", ToolProtocol.LOCAL),
            status=item.get("status", ToolStatus.ACTIVE),
            requires_api_key=item.get("requiresApiKey", False),
            is_public=item.get("isPublic", False),
            enabled_by_default=item.get("enabledByDefault", False),
            created_at=datetime.fromisoformat(created_at.rstrip("Z")) if created_at else datetime.utcnow(),
            updated_at=datetime.fromisoformat(updated_at.rstrip("Z")) if updated_at else datetime.utcnow(),
            created_by=item.get("createdBy"),
            updated_by=item.get("updatedBy"),
        )


class UserToolPreference(BaseModel):
    """
    User's explicit tool preferences stored per-user in DynamoDB.

    Overrides default enabled state for tools the user has access to.
    """

    user_id: str
    tool_preferences: Dict[str, bool] = Field(
        default_factory=dict, description="Map of tool_id -> enabled state"
    )
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_dynamo_item(self) -> dict:
        """Convert to DynamoDB item format."""
        return {
            "PK": f"USER#{self.user_id}",
            "SK": "TOOL_PREFERENCES",
            "userId": self.user_id,
            "toolPreferences": self.tool_preferences,
            "updatedAt": self.updated_at.isoformat() + "Z" if self.updated_at else None,
        }

    @classmethod
    def from_dynamo_item(cls, item: dict) -> "UserToolPreference":
        """Create from DynamoDB item."""
        updated_at = item.get("updatedAt")
        return cls(
            user_id=item.get("userId", ""),
            tool_preferences=item.get("toolPreferences", {}),
            updated_at=datetime.fromisoformat(updated_at.rstrip("Z")) if updated_at else datetime.utcnow(),
        )


# =============================================================================
# API Response Models
# =============================================================================


class UserToolAccess(BaseModel):
    """
    Computed tool access for a specific user.
    Returned by the GET /tools endpoint.
    """

    tool_id: str = Field(..., alias="toolId")
    display_name: str = Field(..., alias="displayName")
    description: str
    category: ToolCategory
    icon: Optional[str] = None
    protocol: ToolProtocol
    status: ToolStatus

    # Access info
    granted_by: List[str] = Field(
        ...,
        alias="grantedBy",
        description="List of sources that grant access (e.g., ['public', 'power_user', 'researcher'])",
    )
    enabled_by_default: bool = Field(..., alias="enabledByDefault")

    # Current user state
    user_enabled: Optional[bool] = Field(
        None,
        alias="userEnabled",
        description="User's explicit preference (None = use default)",
    )
    is_enabled: bool = Field(
        ...,
        alias="isEnabled",
        description="Computed: user_enabled if set, else enabled_by_default",
    )

    model_config = {"populate_by_name": True, "use_enum_values": True}


class UserToolsResponse(BaseModel):
    """Response model for GET /api/tools endpoint."""

    tools: List[UserToolAccess]
    categories: List[str]
    app_roles_applied: List[str] = Field(..., alias="appRolesApplied")

    model_config = {"populate_by_name": True}


# =============================================================================
# API Request Models
# =============================================================================


class ToolPreferencesRequest(BaseModel):
    """Request body for PUT /api/tools/preferences."""

    preferences: Dict[str, bool] = Field(
        ..., description="Map of tool_id -> enabled state"
    )


class ToolCreateRequest(BaseModel):
    """Request body for POST /api/admin/tools."""

    tool_id: str = Field(
        ..., pattern=r"^[a-z][a-z0-9_]{2,49}$", alias="toolId"
    )
    display_name: str = Field(
        ..., min_length=1, max_length=100, alias="displayName"
    )
    description: str = Field(..., max_length=500)
    category: ToolCategory = Field(default=ToolCategory.UTILITY)
    icon: Optional[str] = Field(None, max_length=50)
    protocol: ToolProtocol = Field(default=ToolProtocol.LOCAL)
    status: ToolStatus = Field(default=ToolStatus.ACTIVE)
    requires_api_key: bool = Field(default=False, alias="requiresApiKey")
    is_public: bool = Field(default=False, alias="isPublic")
    enabled_by_default: bool = Field(default=False, alias="enabledByDefault")

    model_config = {"populate_by_name": True}


class ToolUpdateRequest(BaseModel):
    """Request body for PUT /api/admin/tools/{tool_id}."""

    display_name: Optional[str] = Field(
        None, min_length=1, max_length=100, alias="displayName"
    )
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[ToolCategory] = None
    icon: Optional[str] = Field(None, max_length=50)
    protocol: Optional[ToolProtocol] = None
    status: Optional[ToolStatus] = None
    requires_api_key: Optional[bool] = Field(None, alias="requiresApiKey")
    is_public: Optional[bool] = Field(None, alias="isPublic")
    enabled_by_default: Optional[bool] = Field(None, alias="enabledByDefault")

    model_config = {"populate_by_name": True}


class ToolRoleAssignment(BaseModel):
    """Role assignment info for a tool."""

    role_id: str = Field(..., alias="roleId")
    display_name: str = Field(..., alias="displayName")
    grant_type: str = Field(
        ..., alias="grantType", description="'direct' or 'inherited'"
    )
    inherited_from: Optional[str] = Field(None, alias="inheritedFrom")
    enabled: bool

    model_config = {"populate_by_name": True}


class ToolRolesResponse(BaseModel):
    """Response for GET /api/admin/tools/{tool_id}/roles."""

    tool_id: str = Field(..., alias="toolId")
    roles: List[ToolRoleAssignment]

    model_config = {"populate_by_name": True}


class SetToolRolesRequest(BaseModel):
    """Request body for PUT /api/admin/tools/{tool_id}/roles."""

    app_role_ids: List[str] = Field(..., alias="appRoleIds")

    model_config = {"populate_by_name": True}


class AddRemoveRolesRequest(BaseModel):
    """Request body for POST /api/admin/tools/{tool_id}/roles/add or /remove."""

    app_role_ids: List[str] = Field(..., alias="appRoleIds")

    model_config = {"populate_by_name": True}


class AdminToolResponse(BaseModel):
    """Response model for admin tool listing."""

    tool_id: str = Field(..., alias="toolId")
    display_name: str = Field(..., alias="displayName")
    description: str
    category: ToolCategory
    icon: Optional[str] = None
    protocol: ToolProtocol
    status: ToolStatus
    requires_api_key: bool = Field(..., alias="requiresApiKey")
    is_public: bool = Field(..., alias="isPublic")
    allowed_app_roles: List[str] = Field(..., alias="allowedAppRoles")
    enabled_by_default: bool = Field(..., alias="enabledByDefault")
    created_at: str = Field(..., alias="createdAt")
    updated_at: str = Field(..., alias="updatedAt")
    created_by: Optional[str] = Field(None, alias="createdBy")
    updated_by: Optional[str] = Field(None, alias="updatedBy")

    model_config = {"populate_by_name": True, "use_enum_values": True}

    @classmethod
    def from_tool_definition(
        cls, tool: ToolDefinition, allowed_roles: Optional[List[str]] = None
    ) -> "AdminToolResponse":
        """Create response from ToolDefinition."""
        return cls(
            tool_id=tool.tool_id,
            display_name=tool.display_name,
            description=tool.description,
            category=tool.category,
            icon=tool.icon,
            protocol=tool.protocol,
            status=tool.status,
            requires_api_key=tool.requires_api_key,
            is_public=tool.is_public,
            allowed_app_roles=allowed_roles or tool.allowed_app_roles,
            enabled_by_default=tool.enabled_by_default,
            created_at=tool.created_at.isoformat() + "Z" if tool.created_at else "",
            updated_at=tool.updated_at.isoformat() + "Z" if tool.updated_at else "",
            created_by=tool.created_by,
            updated_by=tool.updated_by,
        )


class AdminToolListResponse(BaseModel):
    """Response for GET /api/admin/tools."""

    tools: List[AdminToolResponse]
    total: int


class SyncResult(BaseModel):
    """Result of syncing tool catalog from registry."""

    discovered: List[dict] = Field(
        default_factory=list, description="Tools found in registry but not in catalog"
    )
    orphaned: List[dict] = Field(
        default_factory=list, description="Tools in catalog but not in registry"
    )
    unchanged: List[str] = Field(
        default_factory=list, description="Tools that exist in both"
    )
    dry_run: bool = Field(..., alias="dryRun")

    model_config = {"populate_by_name": True}
