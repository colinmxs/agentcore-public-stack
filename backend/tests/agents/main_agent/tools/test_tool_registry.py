"""
Tests for ToolRegistry — tool registration, retrieval, and module discovery.

Requirements: 5.1–5.8
"""

from types import ModuleType
from unittest.mock import MagicMock

import pytest

from agents.main_agent.tools.tool_registry import ToolRegistry


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_tool(name: str = "tool") -> MagicMock:
    """Return a MagicMock that looks like a @tool-decorated function."""
    t = MagicMock()
    t.__name__ = name
    return t


def _make_module_with_all(tools: dict[str, object]) -> ModuleType:
    """Create a fake module with __all__ and matching attributes."""
    mod = ModuleType("fake_module")
    mod.__all__ = list(tools.keys())
    for name, obj in tools.items():
        setattr(mod, name, obj)
    return mod


def _make_module_without_all() -> ModuleType:
    """Create a fake module that has NO __all__ attribute."""
    mod = ModuleType("bare_module")
    # Attach some attributes, but no __all__
    mod.some_func = _mock_tool("some_func")
    return mod


# ---------------------------------------------------------------------------
# 5.1 — New ToolRegistry starts with zero tools
# ---------------------------------------------------------------------------

class TestEmptyRegistry:
    def test_new_registry_has_zero_tools(self):
        """Validates: Requirement 5.1"""
        registry = ToolRegistry()
        assert registry.get_tool_count() == 0
        assert registry.get_all_tool_ids() == []


# ---------------------------------------------------------------------------
# 5.2 — register_tool makes tool retrievable
# 5.3 — get_tool with unregistered tool_id returns None
# 5.4 — has_tool with unregistered tool_id returns False
# ---------------------------------------------------------------------------

class TestRegisterAndRetrieve:
    def test_register_tool_makes_it_retrievable(self):
        """Validates: Requirement 5.2"""
        registry = ToolRegistry()
        tool = _mock_tool("calc")
        registry.register_tool("calc", tool)

        assert registry.get_tool("calc") is tool
        assert registry.has_tool("calc") is True

    def test_get_tool_unregistered_returns_none(self):
        """Validates: Requirement 5.3"""
        registry = ToolRegistry()
        assert registry.get_tool("nonexistent") is None

    def test_has_tool_unregistered_returns_false(self):
        """Validates: Requirement 5.4"""
        registry = ToolRegistry()
        assert registry.has_tool("nonexistent") is False


# ---------------------------------------------------------------------------
# 5.5 — register_module_tools with __all__ registers exported tools
# 5.6 — register_module_tools without __all__ registers nothing
# ---------------------------------------------------------------------------

class TestRegisterModuleTools:
    def test_module_with_all_registers_exported_tools(self):
        """Validates: Requirement 5.5"""
        tool_a = _mock_tool("tool_a")
        tool_b = _mock_tool("tool_b")
        mod = _make_module_with_all({"tool_a": tool_a, "tool_b": tool_b})

        registry = ToolRegistry()
        registry.register_module_tools(mod)

        assert registry.has_tool("tool_a")
        assert registry.has_tool("tool_b")
        assert registry.get_tool("tool_a") is tool_a
        assert registry.get_tool("tool_b") is tool_b
        assert registry.get_tool_count() == 2

    def test_module_without_all_registers_nothing(self):
        """Validates: Requirement 5.6"""
        mod = _make_module_without_all()

        registry = ToolRegistry()
        registry.register_module_tools(mod)

        assert registry.get_tool_count() == 0


# ---------------------------------------------------------------------------
# 5.7 — get_all_tool_ids returns all registered tool IDs
# 5.8 — get_tool_count returns correct count
# ---------------------------------------------------------------------------

class TestToolIdsAndCount:
    def test_get_all_tool_ids_returns_registered_ids(self):
        """Validates: Requirement 5.7"""
        registry = ToolRegistry()
        registry.register_tool("alpha", _mock_tool("alpha"))
        registry.register_tool("beta", _mock_tool("beta"))
        registry.register_tool("gamma", _mock_tool("gamma"))

        ids = registry.get_all_tool_ids()
        assert set(ids) == {"alpha", "beta", "gamma"}

    def test_get_tool_count_after_registrations(self):
        """Validates: Requirement 5.8"""
        registry = ToolRegistry()
        assert registry.get_tool_count() == 0

        registry.register_tool("one", _mock_tool("one"))
        assert registry.get_tool_count() == 1

        registry.register_tool("two", _mock_tool("two"))
        assert registry.get_tool_count() == 2

    def test_duplicate_registration_overwrites_and_count_unchanged(self):
        """Validates: Requirement 5.8 (edge case — duplicate tool_id)"""
        registry = ToolRegistry()
        registry.register_tool("dup", _mock_tool("v1"))
        registry.register_tool("dup", _mock_tool("v2"))

        assert registry.get_tool_count() == 1
        assert registry.get_tool("dup").__name__ == "v2"


# ---------------------------------------------------------------------------
# Fixture-based smoke test (uses conftest tool_registry with 5 tools)
# ---------------------------------------------------------------------------

class TestWithFixture:
    def test_fixture_registry_has_five_tools(self, tool_registry: ToolRegistry):
        """Smoke test: conftest fixture provides 5 pre-registered tools."""
        assert tool_registry.get_tool_count() == 5
        assert set(tool_registry.get_all_tool_ids()) == {
            "calculator", "weather", "search", "code_interpreter", "browser",
        }
