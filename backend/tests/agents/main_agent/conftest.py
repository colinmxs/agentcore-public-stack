"""
Shared fixtures for all main_agent tests.

Provides pre-configured instances of core components (ToolRegistry, ToolFilter,
ModelConfig, RetryConfig, PreviewSessionManager) and mock objects (agent, files)
used across the test suite.
"""

import base64
from dataclasses import dataclass
from unittest.mock import MagicMock

import pytest

from agents.main_agent.core.model_config import ModelConfig, ModelProvider, RetryConfig
from agents.main_agent.tools.tool_registry import ToolRegistry
from agents.main_agent.tools.tool_filter import ToolFilter
from agents.main_agent.session.preview_session_manager import PreviewSessionManager


# ---------------------------------------------------------------------------
# Lightweight stand-in for file objects consumed by PromptBuilder
# ---------------------------------------------------------------------------
@dataclass
class FakeFileContent:
    """Minimal file-content object matching the interface used by PromptBuilder."""

    filename: str
    content_type: str
    bytes: str  # base64-encoded string


# ---------------------------------------------------------------------------
# Core configuration fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def model_config() -> ModelConfig:
    """Default ModelConfig instance (Bedrock, caching on, default model)."""
    return ModelConfig()


@pytest.fixture
def retry_config() -> RetryConfig:
    """Default RetryConfig instance with standard defaults."""
    return RetryConfig()


# ---------------------------------------------------------------------------
# Tool fixtures
# ---------------------------------------------------------------------------
def _make_mock_tool(name: str) -> MagicMock:
    """Create a MagicMock that looks like a @tool-decorated function."""
    tool = MagicMock()
    tool.__name__ = name
    tool.__qualname__ = name
    return tool


@pytest.fixture
def tool_registry() -> ToolRegistry:
    """ToolRegistry pre-populated with 5 mock tools.

    Registered tool IDs: calculator, weather, search, code_interpreter, browser
    """
    registry = ToolRegistry()
    for name in ("calculator", "weather", "search", "code_interpreter", "browser"):
        registry.register_tool(name, _make_mock_tool(name))
    return registry


@pytest.fixture
def tool_filter(tool_registry: ToolRegistry) -> ToolFilter:
    """ToolFilter wrapping the pre-populated tool_registry fixture."""
    return ToolFilter(tool_registry)


# ---------------------------------------------------------------------------
# Session fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def preview_session() -> PreviewSessionManager:
    """PreviewSessionManager with a test session ID."""
    return PreviewSessionManager(
        session_id="preview-test-session-001",
        user_id="test-user-001",
    )


# ---------------------------------------------------------------------------
# Mock agent fixture
# ---------------------------------------------------------------------------
@pytest.fixture
def mock_agent() -> MagicMock:
    """MagicMock standing in for a strands.Agent with a .messages list."""
    agent = MagicMock()
    agent.messages = []
    return agent


# ---------------------------------------------------------------------------
# Sample files fixture (for multimodal / PromptBuilder tests)
# ---------------------------------------------------------------------------
@pytest.fixture
def sample_files() -> list[FakeFileContent]:
    """List of FakeFileContent objects: one image, one document, one unsupported.

    Each ``bytes`` field is a valid base64-encoded string so that
    ``base64.b64decode`` works in PromptBuilder.
    """
    raw = b"fake-file-content"
    b64 = base64.b64encode(raw).decode()

    return [
        FakeFileContent(
            filename="photo.png",
            content_type="image/png",
            bytes=b64,
        ),
        FakeFileContent(
            filename="report.pdf",
            content_type="application/pdf",
            bytes=b64,
        ),
        FakeFileContent(
            filename="script.py",
            content_type="text/x-python",
            bytes=b64,
        ),
    ]
