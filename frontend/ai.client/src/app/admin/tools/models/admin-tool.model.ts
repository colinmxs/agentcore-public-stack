/**
 * Tool category enum
 */
export type ToolCategory =
  | 'search'
  | 'data'
  | 'visualization'
  | 'document'
  | 'code'
  | 'browser'
  | 'utility'
  | 'research'
  | 'finance'
  | 'gateway'
  | 'custom';

/**
 * Tool protocol enum
 */
export type ToolProtocol = 'local' | 'aws_sdk' | 'mcp' | 'a2a';

/**
 * Tool status enum
 */
export type ToolStatus = 'active' | 'deprecated' | 'disabled' | 'coming_soon';

/**
 * Admin tool definition with role assignments.
 */
export interface AdminTool {
  toolId: string;
  displayName: string;
  description: string;
  category: ToolCategory;
  icon: string | null;
  protocol: ToolProtocol;
  status: ToolStatus;
  requiresApiKey: boolean;
  isPublic: boolean;
  allowedAppRoles: string[];
  enabledByDefault: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

/**
 * Response for listing admin tools.
 */
export interface AdminToolListResponse {
  tools: AdminTool[];
  total: number;
}

/**
 * Role assignment for a tool.
 */
export interface ToolRoleAssignment {
  roleId: string;
  displayName: string;
  grantType: 'direct' | 'inherited';
  inheritedFrom: string | null;
  enabled: boolean;
}

/**
 * Response for getting tool roles.
 */
export interface ToolRolesResponse {
  toolId: string;
  roles: ToolRoleAssignment[];
}

/**
 * Request for creating a new tool.
 */
export interface ToolCreateRequest {
  toolId: string;
  displayName: string;
  description: string;
  category?: ToolCategory;
  icon?: string;
  protocol?: ToolProtocol;
  status?: ToolStatus;
  requiresApiKey?: boolean;
  isPublic?: boolean;
  enabledByDefault?: boolean;
}

/**
 * Request for updating a tool.
 */
export interface ToolUpdateRequest {
  displayName?: string;
  description?: string;
  category?: ToolCategory;
  icon?: string;
  protocol?: ToolProtocol;
  status?: ToolStatus;
  requiresApiKey?: boolean;
  isPublic?: boolean;
  enabledByDefault?: boolean;
}

/**
 * Request for setting tool roles.
 */
export interface SetToolRolesRequest {
  appRoleIds: string[];
}

/**
 * Result of syncing tool catalog from registry.
 */
export interface SyncResult {
  discovered: { tool_id: string; display_name: string; action: string }[];
  orphaned: { tool_id: string; action: string }[];
  unchanged: string[];
  dryRun: boolean;
}

/**
 * Form data model for creating/editing a tool.
 */
export interface ToolFormData {
  toolId: string;
  displayName: string;
  description: string;
  category: ToolCategory;
  icon: string;
  protocol: ToolProtocol;
  status: ToolStatus;
  requiresApiKey: boolean;
  isPublic: boolean;
  enabledByDefault: boolean;
}

/**
 * Available tool categories for dropdowns.
 */
export const TOOL_CATEGORIES: { value: ToolCategory; label: string }[] = [
  { value: 'search', label: 'Search' },
  { value: 'data', label: 'Data' },
  { value: 'visualization', label: 'Visualization' },
  { value: 'document', label: 'Document' },
  { value: 'code', label: 'Code' },
  { value: 'browser', label: 'Browser' },
  { value: 'utility', label: 'Utility' },
  { value: 'research', label: 'Research' },
  { value: 'finance', label: 'Finance' },
  { value: 'gateway', label: 'Gateway' },
  { value: 'custom', label: 'Custom' },
];

/**
 * Available tool protocols for dropdowns.
 */
export const TOOL_PROTOCOLS: { value: ToolProtocol; label: string }[] = [
  { value: 'local', label: 'Local (Direct Function)' },
  { value: 'aws_sdk', label: 'AWS SDK (Bedrock)' },
  { value: 'mcp', label: 'MCP Gateway' },
  { value: 'a2a', label: 'Agent-to-Agent' },
];

/**
 * Available tool statuses for dropdowns.
 */
export const TOOL_STATUSES: { value: ToolStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'coming_soon', label: 'Coming Soon' },
];
