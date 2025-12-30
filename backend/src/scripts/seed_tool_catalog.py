#!/usr/bin/env python3
"""
Seed Tool Catalog

Populates the DynamoDB tool catalog from the existing in-memory TOOL_CATALOG.
This script should be run once during initial setup or migration.

Usage:
    python -m scripts.seed_tool_catalog [--dry-run]

Options:
    --dry-run    Show what would be created without making changes
"""

import asyncio
import argparse
import logging
import sys
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Import the models and repository
from apis.app_api.tools.models import (
    ToolDefinition,
    ToolCategory,
    ToolProtocol,
    ToolStatus,
)
from apis.app_api.tools.repository import ToolCatalogRepository

# Import the existing in-memory catalog
from agents.strands_agent.tools.tool_catalog import (
    TOOL_CATALOG,
    ToolCategory as LegacyToolCategory,
)


# Mapping from legacy categories to new categories
CATEGORY_MAP = {
    LegacyToolCategory.SEARCH: ToolCategory.SEARCH,
    LegacyToolCategory.BROWSER: ToolCategory.BROWSER,
    LegacyToolCategory.DATA: ToolCategory.DATA,
    LegacyToolCategory.UTILITIES: ToolCategory.UTILITY,
    LegacyToolCategory.CODE: ToolCategory.CODE,
    LegacyToolCategory.GATEWAY: ToolCategory.GATEWAY,
}

# Tools that should be public (available to all authenticated users)
PUBLIC_TOOLS = {
    "calculator",
    "get_current_weather",
    "ddg_web_search",
}

# Tools that should be enabled by default
ENABLED_BY_DEFAULT = {
    "fetch_url_content",
    "search_boise_state",
    "calculator",
}


def convert_tool(tool_id: str, legacy_tool) -> ToolDefinition:
    """Convert a legacy ToolMetadata to a ToolDefinition."""
    return ToolDefinition(
        tool_id=tool_id,
        display_name=legacy_tool.name,
        description=legacy_tool.description,
        category=CATEGORY_MAP.get(legacy_tool.category, ToolCategory.UTILITY),
        icon=legacy_tool.icon,
        protocol=ToolProtocol.MCP_GATEWAY if legacy_tool.is_gateway_tool else ToolProtocol.LOCAL,
        status=ToolStatus.ACTIVE,
        requires_api_key=legacy_tool.requires_api_key is not None,
        is_public=tool_id in PUBLIC_TOOLS,
        enabled_by_default=tool_id in ENABLED_BY_DEFAULT,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        created_by="system",
        updated_by="system",
    )


async def seed_catalog(dry_run: bool = False) -> None:
    """Seed the tool catalog from the in-memory TOOL_CATALOG."""
    repository = ToolCatalogRepository()

    logger.info(f"Found {len(TOOL_CATALOG)} tools in legacy catalog")

    created = 0
    skipped = 0
    errors = 0

    for tool_id, legacy_tool in TOOL_CATALOG.items():
        try:
            # Check if tool already exists
            existing = await repository.get_tool(tool_id)
            if existing:
                logger.info(f"Skipping existing tool: {tool_id}")
                skipped += 1
                continue

            # Convert to new format
            tool = convert_tool(tool_id, legacy_tool)

            if dry_run:
                logger.info(f"[DRY RUN] Would create tool: {tool_id}")
                logger.info(f"  - Display Name: {tool.display_name}")
                logger.info(f"  - Category: {tool.category}")
                logger.info(f"  - Protocol: {tool.protocol}")
                logger.info(f"  - Public: {tool.is_public}")
                logger.info(f"  - Enabled by Default: {tool.enabled_by_default}")
            else:
                await repository.create_tool(tool)
                logger.info(f"Created tool: {tool_id}")

            created += 1

        except Exception as e:
            logger.error(f"Error processing tool {tool_id}: {e}")
            errors += 1

    logger.info("=" * 60)
    logger.info("Seed Summary:")
    logger.info(f"  Created: {created}")
    logger.info(f"  Skipped (already exists): {skipped}")
    logger.info(f"  Errors: {errors}")
    if dry_run:
        logger.info("  (DRY RUN - no changes made)")


def main():
    parser = argparse.ArgumentParser(
        description="Seed the tool catalog from the existing in-memory TOOL_CATALOG."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be created without making changes",
    )
    args = parser.parse_args()

    asyncio.run(seed_catalog(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
