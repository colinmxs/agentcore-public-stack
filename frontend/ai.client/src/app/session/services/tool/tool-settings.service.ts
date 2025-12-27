import { Injectable, signal, computed } from '@angular/core';

export interface Tool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ToolSettingsService {
  // Available tools with their enabled/disabled state
  private readonly _tools = signal<Tool[]>([
    {
      id: 'fetch_url_content',
      name: 'Web Fetch',
      description: 'Fetch and extract content from URLs',
      enabled: true
    },
    {
      id: 'search_boise_state',
      name: 'Boise State Search',
      description: 'Search Boise State University resources',
      enabled: true
    },
    {
      id: 'ddg_web_search',
      name: 'Web Search',
      description: 'Search the web using DuckDuckGo',
      enabled: false
    },
    {
      id: 'get_current_weather',
      name: 'Weather',
      description: 'Get current weather for a location',
      enabled: false
    },
    {
      id: 'create_visualization',
      name: 'Visualization',
      description: 'Create charts and data visualizations',
      enabled: false
    }
  ]);

  // Public read-only signal for tools
  readonly tools = this._tools.asReadonly();

  // Computed signal for enabled tool IDs
  readonly enabledToolIds = computed(() =>
    this._tools()
      .filter(tool => tool.enabled)
      .map(tool => tool.id)
  );

  // Computed signal for enabled tools count
  readonly enabledCount = computed(() =>
    this._tools().filter(tool => tool.enabled).length
  );

  /**
   * Toggle a tool's enabled state
   */
  toggleTool(toolId: string): void {
    this._tools.update(tools =>
      tools.map(tool =>
        tool.id === toolId
          ? { ...tool, enabled: !tool.enabled }
          : tool
      )
    );
  }

  /**
   * Enable a specific tool
   */
  enableTool(toolId: string): void {
    this._tools.update(tools =>
      tools.map(tool =>
        tool.id === toolId
          ? { ...tool, enabled: true }
          : tool
      )
    );
  }

  /**
   * Disable a specific tool
   */
  disableTool(toolId: string): void {
    this._tools.update(tools =>
      tools.map(tool =>
        tool.id === toolId
          ? { ...tool, enabled: false }
          : tool
      )
    );
  }

  /**
   * Enable all tools
   */
  enableAllTools(): void {
    this._tools.update(tools =>
      tools.map(tool => ({ ...tool, enabled: true }))
    );
  }

  /**
   * Disable all tools
   */
  disableAllTools(): void {
    this._tools.update(tools =>
      tools.map(tool => ({ ...tool, enabled: false }))
    );
  }

  /**
   * Get a tool by ID
   */
  getTool(toolId: string): Tool | undefined {
    return this._tools().find(tool => tool.id === toolId);
  }

  /**
   * Check if a tool is enabled
   */
  isToolEnabled(toolId: string): boolean {
    const tool = this.getTool(toolId);
    return tool?.enabled ?? false;
  }

  /**
   * Get the list of enabled tool IDs (for non-signal contexts)
   */
  getEnabledToolIds(): string[] {
    return this.enabledToolIds();
  }
}
