"""
Tests for FilteredMCPClient, get_gateway_client_if_enabled, and create_filtered_gateway_client.

Requirements: 24.1–24.3
"""
import pytest
from unittest.mock import patch, MagicMock

from agents.main_agent.integrations.gateway_mcp_client import (
    FilteredMCPClient,
    get_gateway_client_if_enabled,
    create_filtered_gateway_client,
)


class TestFilteredMCPClient:
    """Tests for FilteredMCPClient initialization and attribute storage."""

    def test_stores_enabled_tool_ids(self):
        """Req 24.1: FilteredMCPClient stores the enabled_tool_ids."""
        tool_ids = ["gateway_wiki_search", "gateway_arxiv_search"]
        client = FilteredMCPClient(
            client_factory=MagicMock(),
            enabled_tool_ids=tool_ids,
        )
        assert client.enabled_tool_ids == tool_ids

    def test_stores_prefix(self):
        """Req 24.1: FilteredMCPClient stores the prefix."""
        client = FilteredMCPClient(
            client_factory=MagicMock(),
            enabled_tool_ids=["gateway_tool1"],
            prefix="custom_prefix",
        )
        assert client.prefix == "custom_prefix"

    def test_default_prefix_is_gateway(self):
        """Req 24.1: FilteredMCPClient defaults prefix to 'gateway'."""
        client = FilteredMCPClient(
            client_factory=MagicMock(),
            enabled_tool_ids=[],
        )
        assert client.prefix == "gateway"


class TestGetGatewayClientIfEnabled:
    """Tests for get_gateway_client_if_enabled environment gating."""

    @patch("agents.main_agent.integrations.gateway_mcp_client.GATEWAY_ENABLED", False)
    def test_returns_none_when_disabled(self):
        """Req 24.2: Returns None when AGENTCORE_GATEWAY_MCP_ENABLED is 'false'."""
        result = get_gateway_client_if_enabled(enabled_tool_ids=["gateway_tool1"])
        assert result is None

    @patch("agents.main_agent.integrations.gateway_mcp_client.GATEWAY_ENABLED", False)
    def test_returns_none_when_disabled_no_tool_ids(self):
        """Req 24.2: Returns None when disabled even without tool IDs."""
        result = get_gateway_client_if_enabled()
        assert result is None


class TestCreateFilteredGatewayClient:
    """Tests for create_filtered_gateway_client with no gateway tool IDs."""

    def test_returns_none_when_no_gateway_ids(self):
        """Req 24.3: WHEN no gateway tool IDs are provided, returns None."""
        result = create_filtered_gateway_client(enabled_tool_ids=[])
        assert result is None

    def test_returns_none_when_no_ids_match_prefix(self):
        """Req 24.3: WHEN enabled IDs don't start with prefix, returns None."""
        result = create_filtered_gateway_client(
            enabled_tool_ids=["local_calculator", "local_weather"],
        )
        assert result is None

    def test_returns_none_with_custom_prefix_no_match(self):
        """Req 24.3: WHEN using custom prefix and no IDs match, returns None."""
        result = create_filtered_gateway_client(
            enabled_tool_ids=["gateway_tool1", "gateway_tool2"],
            prefix="custom",
        )
        assert result is None
