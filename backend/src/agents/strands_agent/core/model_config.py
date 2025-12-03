"""
Model configuration for Bedrock models
"""
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class ModelConfig:
    """Configuration for Bedrock model"""
    model_id: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    temperature: float = 0.7
    caching_enabled: bool = True

    def to_bedrock_config(self) -> Dict[str, Any]:
        """
        Convert to BedrockModel configuration dictionary

        Returns:
            dict: Configuration for BedrockModel initialization
        """
        config = {
            "model_id": self.model_id,
            "temperature": self.temperature
        }

        # Add cache_prompt if caching is enabled (BedrockModel handles SystemContentBlock formatting)
        if self.caching_enabled:
            config["cache_prompt"] = "default"

        return config

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert to dictionary representation

        Returns:
            dict: Configuration as dictionary
        """
        return {
            "model_id": self.model_id,
            "temperature": self.temperature,
            "caching_enabled": self.caching_enabled
        }

    @classmethod
    def from_params(
        cls,
        model_id: Optional[str] = None,
        temperature: Optional[float] = None,
        caching_enabled: Optional[bool] = None
    ) -> "ModelConfig":
        """
        Create ModelConfig from optional parameters

        Args:
            model_id: Bedrock model ID
            temperature: Model temperature (0.0 - 1.0)
            caching_enabled: Whether to enable prompt caching

        Returns:
            ModelConfig: Configuration instance with defaults applied
        """
        return cls(
            model_id=model_id or cls.model_id,
            temperature=temperature if temperature is not None else cls.temperature,
            caching_enabled=caching_enabled if caching_enabled is not None else cls.caching_enabled
        )
