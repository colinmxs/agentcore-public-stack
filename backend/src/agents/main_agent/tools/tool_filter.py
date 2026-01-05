"""
Tool filtering based on user preferences
"""
import logging
from typing import List, Optional, Any, Tuple
from agents.main_agent.tools.tool_registry import ToolRegistry

logger = logging.getLogger(__name__)


class ToolFilter:
    """Filters tools based on user-enabled tool lists"""

    def __init__(self, registry: ToolRegistry):
        """
        Initialize tool filter

        Args:
            registry: Tool registry to filter from
        """
        self.registry = registry

    def filter_tools(
        self,
        enabled_tool_ids: Optional[List[str]] = None
    ) -> Tuple[List[Any], List[str]]:
        """
        Filter tools based on enabled tool IDs

        Args:
            enabled_tool_ids: List of tool IDs to enable. If None/empty, returns empty list.

        Returns:
            Tuple of (filtered_tools, gateway_tool_ids):
                - filtered_tools: List of tool objects (local tools only, not gateway)
                - gateway_tool_ids: List of gateway tool IDs for separate handling
        """
        # If no enabled_tools specified (None or empty), return NO tools
        if enabled_tool_ids is None or len(enabled_tool_ids) == 0:
            logger.info("No enabled_tools specified - Agent will run WITHOUT any tools")
            return [], []

        filtered_tools = []
        gateway_tool_ids = []

        for tool_id in enabled_tool_ids:
            if self.registry.has_tool(tool_id):
                # Local tool from registry
                filtered_tools.append(self.registry.get_tool(tool_id))
            elif tool_id.startswith("gateway_"):
                # Gateway MCP tool - collect for separate handling
                gateway_tool_ids.append(tool_id)
            else:
                logger.warning(f"Tool '{tool_id}' not found in registry, skipping")

        logger.info(f"Local tools enabled: {len(filtered_tools)}")
        logger.info(f"Gateway tools enabled: {len(gateway_tool_ids)}")

        return filtered_tools, gateway_tool_ids

    def get_statistics(self, enabled_tool_ids: Optional[List[str]] = None) -> dict:
        """
        Get filtering statistics

        Args:
            enabled_tool_ids: List of tool IDs to analyze

        Returns:
            dict: Statistics about tool filtering
        """
        if not enabled_tool_ids:
            return {
                "total_requested": 0,
                "local_tools": 0,
                "gateway_tools": 0,
                "unknown_tools": 0
            }

        local_count = 0
        gateway_count = 0
        unknown_count = 0

        for tool_id in enabled_tool_ids:
            if self.registry.has_tool(tool_id):
                local_count += 1
            elif tool_id.startswith("gateway_"):
                gateway_count += 1
            else:
                unknown_count += 1

        return {
            "total_requested": len(enabled_tool_ids),
            "local_tools": local_count,
            "gateway_tools": gateway_count,
            "unknown_tools": unknown_count
        }
