"""Local file storage implementation for development

This storage backend uses local JSON files to store message metadata and cost summaries.
It's designed for local development without requiring AWS services.

File Structure:
    sessions/
        session_{id}/
            message-metadata.json  - Message-level metadata (cost, tokens, latency)
            cost-summary.json      - Pre-aggregated cost summaries by period
"""

import json
import aiofiles
from typing import Optional, List, Dict, Any, cast
from datetime import datetime
from pathlib import Path
from decimal import Decimal

from .metadata_storage import MetadataStorage
from .paths import get_session_dir


class LocalFileStorage(MetadataStorage):
    """Local file storage for development environments"""

    def _get_message_metadata_path(self, session_id: str) -> Path:
        """Get path to message metadata file"""
        return get_session_dir(session_id) / "message-metadata.json"

    def _get_cost_summary_path(self, session_id: str) -> Path:
        """Get path to cost summary file"""
        return get_session_dir(session_id) / "cost-summary.json"

    async def store_message_metadata(
        self,
        user_id: str,
        session_id: str,
        message_id: int,
        metadata: Dict[str, Any]
    ) -> None:
        """
        Store message metadata in local file

        Stores in: sessions/session_{id}/message-metadata.json
        Format: { "0": {...}, "1": {...}, ... }
        """
        metadata_path = self._get_message_metadata_path(session_id)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)

        # Read existing metadata
        existing_metadata = {}
        if metadata_path.exists():
            async with aiofiles.open(metadata_path, 'r') as f:
                content = await f.read()
                if content.strip():
                    existing_metadata = json.loads(content)

        # Add new message metadata
        existing_metadata[str(message_id)] = metadata

        # Write back to file
        async with aiofiles.open(metadata_path, 'w') as f:
            await f.write(json.dumps(existing_metadata, indent=2))

    async def get_message_metadata(
        self,
        user_id: str,
        session_id: str,
        message_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get metadata for a specific message"""
        metadata_path = self._get_message_metadata_path(session_id)

        if not metadata_path.exists():
            return None

        async with aiofiles.open(metadata_path, 'r') as f:
            content = await f.read()
            if not content.strip():
                return None

            all_metadata = cast(Dict[str, Dict[str, Any]], json.loads(content))
            return all_metadata.get(str(message_id))

    async def get_session_metadata(
        self,
        user_id: str,
        session_id: str
    ) -> List[Dict[str, Any]]:
        """Get all message metadata for a session"""
        metadata_path = self._get_message_metadata_path(session_id)

        if not metadata_path.exists():
            return []

        async with aiofiles.open(metadata_path, 'r') as f:
            content = await f.read()
            if not content.strip():
                return []

            all_metadata = json.loads(content)
            # Return as list, sorted by message ID
            return [
                all_metadata[key]
                for key in sorted(all_metadata.keys(), key=int)
            ]

    async def get_user_cost_summary(
        self,
        user_id: str,
        period: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get pre-aggregated cost summary for a user

        Note: In local file storage, we don't have a global user index.
        This is a simplified implementation that returns None.
        For detailed reports, use get_user_messages_in_range instead.
        """
        # Local file storage doesn't maintain a global user cost summary
        # This would require scanning all session directories
        # For development, return None (quota checks disabled)
        return None

    async def update_user_cost_summary(
        self,
        user_id: str,
        period: str,
        cost_delta: float,
        usage_delta: Dict[str, int],
        timestamp: str
    ) -> None:
        """
        Update pre-aggregated cost summary

        Note: In local file storage, we don't maintain global summaries.
        This is a no-op in development mode.
        """
        # Local file storage doesn't maintain global summaries
        # This would require a central file or database
        # For development, this is a no-op
        pass

    async def get_user_messages_in_range(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Get all message metadata for a user in a date range

        Note: In local file storage, we don't have a global user index.
        This would require scanning all session directories.
        For development, this returns an empty list.
        """
        # Local file storage doesn't have a user-level index
        # Would need to scan all session directories and filter by:
        # 1. User ID (from attribution)
        # 2. Timestamp (from attribution)
        #
        # For development, return empty list
        # Production uses DynamoDB with proper indexing
        return []

    async def _get_session_cost_summary(
        self,
        session_id: str,
        period: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get cost summary for a specific session (local helper method)

        This is used internally for session-level aggregation.
        """
        summary_path = self._get_cost_summary_path(session_id)

        if not summary_path.exists():
            return None

        async with aiofiles.open(summary_path, 'r') as f:
            content = await f.read()
            if not content.strip():
                return None

            all_summaries = cast(Dict[str, Dict[str, Any]], json.loads(content))
            return all_summaries.get(period)

    async def _update_session_cost_summary(
        self,
        session_id: str,
        period: str,
        cost_delta: float,
        usage_delta: Dict[str, int],
        timestamp: str
    ) -> None:
        """
        Update session-level cost summary (local helper method)

        This maintains running totals per session for development.
        """
        summary_path = self._get_cost_summary_path(session_id)
        summary_path.parent.mkdir(parents=True, exist_ok=True)

        # Read existing summaries
        existing_summaries = {}
        if summary_path.exists():
            async with aiofiles.open(summary_path, 'r') as f:
                content = await f.read()
                if content.strip():
                    existing_summaries = json.loads(content)

        # Get or create period summary
        if period not in existing_summaries:
            existing_summaries[period] = {
                "periodStart": f"{period}-01T00:00:00Z",
                "periodEnd": f"{period}-31T23:59:59Z",
                "totalCost": 0.0,
                "totalRequests": 0,
                "totalInputTokens": 0,
                "totalOutputTokens": 0,
                "totalCacheReadTokens": 0,
                "totalCacheWriteTokens": 0,
                "lastUpdated": timestamp
            }

        # Update summary
        summary = existing_summaries[period]
        summary["totalCost"] += cost_delta
        summary["totalRequests"] += 1
        summary["totalInputTokens"] += usage_delta.get("inputTokens", 0)
        summary["totalOutputTokens"] += usage_delta.get("outputTokens", 0)
        summary["totalCacheReadTokens"] += usage_delta.get("cacheReadInputTokens", 0)
        summary["totalCacheWriteTokens"] += usage_delta.get("cacheWriteInputTokens", 0)
        summary["lastUpdated"] = timestamp

        # Write back
        async with aiofiles.open(summary_path, 'w') as f:
            await f.write(json.dumps(existing_summaries, indent=2))
