"""
Tests for MemoryStorageConfig and load_memory_config.

Requirements: 17.1–17.5
"""
import pytest
from agents.main_agent.session.memory_config import (
    MemoryStorageConfig,
    load_memory_config,
)


class TestLoadMemoryConfig:
    """Tests for load_memory_config function."""

    def test_returns_config_when_memory_id_set(self, monkeypatch):
        """Req 17.1: WHEN AGENTCORE_MEMORY_ID is set, returns MemoryStorageConfig with correct memory_id and region."""
        monkeypatch.setenv("AGENTCORE_MEMORY_ID", "mem-abc123")
        monkeypatch.setenv("AWS_REGION", "us-east-1")

        config = load_memory_config()

        assert isinstance(config, MemoryStorageConfig)
        assert config.memory_id == "mem-abc123"
        assert config.region == "us-east-1"

    def test_raises_when_memory_id_not_set(self, monkeypatch):
        """Req 17.2: IF AGENTCORE_MEMORY_ID is not set, raises RuntimeError."""
        monkeypatch.delenv("AGENTCORE_MEMORY_ID", raising=False)

        with pytest.raises(RuntimeError, match="AGENTCORE_MEMORY_ID"):
            load_memory_config()

    def test_raises_when_memory_id_empty(self, monkeypatch):
        """Req 17.2 (edge): IF AGENTCORE_MEMORY_ID is empty string, raises RuntimeError."""
        monkeypatch.setenv("AGENTCORE_MEMORY_ID", "")

        with pytest.raises(RuntimeError, match="AGENTCORE_MEMORY_ID"):
            load_memory_config()

    def test_uses_specified_region(self, monkeypatch):
        """Req 17.3: WHEN AWS_REGION is set, uses the specified region."""
        monkeypatch.setenv("AGENTCORE_MEMORY_ID", "mem-xyz")
        monkeypatch.setenv("AWS_REGION", "eu-west-1")

        config = load_memory_config()

        assert config.region == "eu-west-1"

    def test_defaults_region_to_us_west_2(self, monkeypatch):
        """Req 17.4: WHEN AWS_REGION is not set, defaults to 'us-west-2'."""
        monkeypatch.setenv("AGENTCORE_MEMORY_ID", "mem-xyz")
        monkeypatch.delenv("AWS_REGION", raising=False)

        config = load_memory_config()

        assert config.region == "us-west-2"


class TestMemoryStorageConfig:
    """Tests for MemoryStorageConfig dataclass."""

    def test_is_cloud_mode_returns_true(self):
        """Req 17.5: MemoryStorageConfig.is_cloud_mode always returns True."""
        config = MemoryStorageConfig(memory_id="mem-test", region="us-east-1")
        assert config.is_cloud_mode is True

    def test_is_cloud_mode_always_true_regardless_of_values(self):
        """Req 17.5: is_cloud_mode returns True regardless of memory_id or region values."""
        config = MemoryStorageConfig(memory_id="anything", region="any-region")
        assert config.is_cloud_mode is True
