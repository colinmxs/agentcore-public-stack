"""
Memory storage configuration for AgentCore

This module provides dynamic configuration for AgentCore Memory storage,
supporting both local file-based storage and cloud DynamoDB storage.
"""
import os
import logging
from typing import Literal, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Memory storage types
MemoryStorageType = Literal["file", "dynamodb"]


@dataclass
class MemoryStorageConfig:
    """Configuration for AgentCore Memory storage"""
    storage_type: MemoryStorageType
    memory_id: Optional[str]
    region: str

    def __post_init__(self):
        """Validate configuration after initialization"""
        if self.storage_type == "dynamodb":
            if not self.memory_id:
                raise ValueError(
                    "AGENTCORE_MEMORY_ID is required when AGENTCORE_MEMORY_TYPE=dynamodb"
                )

    @property
    def is_cloud_mode(self) -> bool:
        """Check if using cloud DynamoDB storage"""
        return self.storage_type == "dynamodb"

    @property
    def is_local_mode(self) -> bool:
        """Check if using local file storage"""
        return self.storage_type == "file"


def load_memory_config() -> MemoryStorageConfig:
    """
    Load memory storage configuration from environment variables

    Environment Variables:
        AGENTCORE_MEMORY_TYPE: Storage type ("file" or "dynamodb", default: "file")
        AGENTCORE_MEMORY_ID: Memory ID (required for DynamoDB mode)
        AWS_REGION: AWS region (default: "us-west-2")

    Returns:
        MemoryStorageConfig: Validated configuration

    Raises:
        ValueError: If storage type is invalid or required config is missing

    Note:
        When using DynamoDB mode, this connects to AWS Bedrock AgentCore Memory service.
        The DynamoDB table is managed by AWS - you only need to provide the memory_id.
    """
    storage_type = os.environ.get("AGENTCORE_MEMORY_TYPE", "file").lower()
    memory_id = os.environ.get("AGENTCORE_MEMORY_ID") or None
    region = os.environ.get("AWS_REGION", "us-west-2")

    # Validate storage type
    if storage_type not in ["file", "dynamodb"]:
        raise ValueError(
            f"Invalid AGENTCORE_MEMORY_TYPE: '{storage_type}'. "
            f"Must be 'file' or 'dynamodb'"
        )

    config = MemoryStorageConfig(
        storage_type=storage_type,  # type: ignore
        memory_id=memory_id,
        region=region
    )

    # Log configuration
    if config.is_cloud_mode:
        logger.info(f"🚀 AgentCore Memory Config: AWS Bedrock AgentCore Memory")
        logger.info(f"   • Memory ID: {config.memory_id}")
        logger.info(f"   • Region: {config.region}")
        logger.info(f"   • Storage: AWS-managed DynamoDB")
    else:
        logger.info(f"💻 AgentCore Memory Config: File-based mode")
        logger.info(f"   • Memory ID: {config.memory_id or 'default'}")
        logger.info(f"   • Storage: Local file system")

    return config
