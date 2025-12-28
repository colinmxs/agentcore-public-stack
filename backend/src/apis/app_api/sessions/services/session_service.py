"""Session CRUD service for managing session lifecycle

This service provides operations for session management including:
- Get session by ID (via GSI lookup)
- Soft-delete session (transactional move from S#ACTIVE# to S#DELETED# prefix)

The service preserves cost records (C# prefix) for audit trails and billing accuracy.
"""

import logging
import os
from typing import Optional
from datetime import datetime, timezone
from decimal import Decimal

from apis.app_api.sessions.models import SessionMetadata

logger = logging.getLogger(__name__)


def _convert_decimal_to_float(obj):
    """Recursively convert Decimal to float for JSON serialization"""
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {k: _convert_decimal_to_float(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_decimal_to_float(item) for item in obj]
    else:
        return obj


def _convert_to_dynamodb_format(item: dict) -> dict:
    """
    Convert a Python dict to DynamoDB low-level format for transact_write_items

    Args:
        item: Python dict with native types

    Returns:
        Dict with DynamoDB type descriptors (e.g., {'S': 'value'}, {'N': '123'})
    """
    result = {}
    for key, value in item.items():
        if value is None:
            continue
        elif isinstance(value, str):
            result[key] = {'S': value}
        elif isinstance(value, bool):
            result[key] = {'BOOL': value}
        elif isinstance(value, (int, float, Decimal)):
            result[key] = {'N': str(value)}
        elif isinstance(value, list):
            if not value:
                result[key] = {'L': []}
            elif all(isinstance(v, str) for v in value):
                result[key] = {'SS': value} if value else {'L': []}
            else:
                result[key] = {'L': [_convert_single_value_to_dynamodb(v) for v in value]}
        elif isinstance(value, dict):
            result[key] = {'M': _convert_to_dynamodb_format(value)}
    return result


def _convert_single_value_to_dynamodb(value) -> dict:
    """Convert a single value to DynamoDB format"""
    if value is None:
        return {'NULL': True}
    elif isinstance(value, str):
        return {'S': value}
    elif isinstance(value, bool):
        return {'BOOL': value}
    elif isinstance(value, (int, float, Decimal)):
        return {'N': str(value)}
    elif isinstance(value, list):
        return {'L': [_convert_single_value_to_dynamodb(v) for v in value]}
    elif isinstance(value, dict):
        return {'M': _convert_to_dynamodb_format(value)}
    else:
        return {'S': str(value)}


class SessionService:
    """Service for session CRUD operations.

    Provides methods for:
    - get_session: Retrieve session by ID via GSI lookup
    - delete_session: Soft-delete session (move from S#ACTIVE# to S#DELETED#)

    DynamoDB Schema:
        PK: USER#{user_id}
        SK: S#ACTIVE#{last_message_at}#{session_id} (active sessions)
            S#DELETED#{deleted_at}#{session_id} (deleted sessions)

        GSI: SessionLookupIndex
            GSI_PK: SESSION#{session_id}
            GSI_SK: META
    """

    def __init__(self):
        self.table_name = os.environ.get(
            'DYNAMODB_SESSIONS_METADATA_TABLE_NAME',
            'SessionsMetadata'
        )
        self._dynamodb = None
        self._table = None

    @property
    def dynamodb(self):
        """Lazy-load DynamoDB resource"""
        if self._dynamodb is None:
            import boto3
            self._dynamodb = boto3.resource('dynamodb')
        return self._dynamodb

    @property
    def table(self):
        """Lazy-load DynamoDB table"""
        if self._table is None:
            self._table = self.dynamodb.Table(self.table_name)
        return self._table

    def _is_cloud_mode(self) -> bool:
        """Check if running in cloud mode (DynamoDB available)"""
        return bool(os.environ.get('DYNAMODB_SESSIONS_METADATA_TABLE_NAME'))

    async def get_session(self, user_id: str, session_id: str) -> Optional[SessionMetadata]:
        """
        Get session by ID using GSI.

        Uses the SessionLookupIndex GSI to look up sessions by ID without
        knowing the full SK (which contains the timestamp).

        Args:
            user_id: User identifier (for ownership verification)
            session_id: Session identifier

        Returns:
            SessionMetadata if found and owned by user, None otherwise
        """
        if not self._is_cloud_mode():
            # Fall back to local storage via metadata service
            from apis.app_api.sessions.services.metadata import get_session_metadata
            return await get_session_metadata(session_id, user_id)

        try:
            from boto3.dynamodb.conditions import Key

            response = self.table.query(
                IndexName='SessionLookupIndex',
                KeyConditionExpression=(
                    Key('GSI_PK').eq(f'SESSION#{session_id}') &
                    Key('GSI_SK').eq('META')
                )
            )

            items = response.get('Items', [])
            if not items:
                logger.info(f"Session not found: {session_id}")
                return None

            item = _convert_decimal_to_float(items[0])

            # Verify user ownership
            if item.get('userId') != user_id:
                logger.warning(f"Session {session_id} belongs to different user")
                return None

            # Remove DynamoDB keys
            for key in ['PK', 'SK', 'GSI_PK', 'GSI_SK']:
                item.pop(key, None)

            return SessionMetadata.model_validate(item)

        except Exception as e:
            logger.error(f"Failed to get session {session_id}: {e}", exc_info=True)
            return None

    async def delete_session(self, user_id: str, session_id: str) -> bool:
        """
        Soft-delete a session.

        Moves the session from S#ACTIVE# to S#DELETED# prefix using a
        transactional write. Cost records (C# prefix) are preserved for
        audit trails and billing accuracy.

        Args:
            user_id: User identifier
            session_id: Session identifier

        Returns:
            True if deletion was successful, False if session not found

        Raises:
            No exceptions raised - errors are logged and False is returned
        """
        if not self._is_cloud_mode():
            logger.warning("Session deletion not supported in local mode")
            return False

        try:
            # Get current session via GSI to find its SK
            session = await self.get_session(user_id, session_id)
            if not session:
                logger.info(f"Session not found for deletion: {session_id}")
                return False

            if session.deleted:
                logger.info(f"Session {session_id} already deleted")
                return True

            now = datetime.now(timezone.utc)
            deleted_at = now.isoformat()

            # Build old and new SKs
            old_sk = f'S#ACTIVE#{session.last_message_at}#{session_id}'
            new_sk = f'S#DELETED#{deleted_at}#{session_id}'
            pk = f'USER#{user_id}'

            # Build the deleted item with all fields
            deleted_item = {
                'PK': pk,
                'SK': new_sk,
                'GSI_PK': f'SESSION#{session_id}',
                'GSI_SK': 'META',
                'sessionId': session_id,
                'userId': user_id,
                'title': session.title or '',
                'status': 'deleted',
                'createdAt': session.created_at,
                'lastMessageAt': session.last_message_at,
                'messageCount': session.message_count or 0,
                'starred': session.starred or False,
                'tags': session.tags or [],
                'deleted': True,
                'deletedAt': deleted_at
            }

            # Include preferences if present
            if session.preferences:
                deleted_item['preferences'] = session.preferences.model_dump(by_alias=True)

            # Convert to DynamoDB format for transact_write_items
            dynamodb_item = _convert_to_dynamodb_format(deleted_item)

            # Transactional move: delete old + create new
            self.dynamodb.meta.client.transact_write_items(
                TransactItems=[
                    {
                        'Delete': {
                            'TableName': self.table_name,
                            'Key': {
                                'PK': {'S': pk},
                                'SK': {'S': old_sk}
                            },
                            'ConditionExpression': 'attribute_exists(PK)'
                        }
                    },
                    {
                        'Put': {
                            'TableName': self.table_name,
                            'Item': dynamodb_item
                        }
                    }
                ]
            )

            logger.info(f"Soft-deleted session {session_id} for user {user_id}")

            # Delete conversation content from AgentCore Memory (async, non-blocking)
            # This removes actual messages but NOT the cost records
            await self._delete_agentcore_memory(session_id)

            return True

        except self.dynamodb.meta.client.exceptions.TransactionCanceledException as e:
            # Transaction failed - likely the session was already deleted or modified
            logger.warning(f"Transaction cancelled for session {session_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}", exc_info=True)
            return False

    async def _delete_agentcore_memory(self, session_id: str) -> None:
        """
        Delete conversation content from AgentCore Memory.

        This removes the actual messages from AgentCore Memory storage
        but does NOT affect cost records (which are stored separately
        with C# SK prefix in SessionsMetadata table).

        Args:
            session_id: Session identifier

        Note:
            - This is a non-blocking, fire-and-forget operation
            - Failures are logged but don't affect the session deletion
            - Implementation requires AgentCore Memory SDK or boto3 direct calls
            - Currently a placeholder - full implementation pending SDK support
        """
        try:
            # Check if AgentCore Memory is available
            from agents.strands_agent.session.memory_config import load_memory_config

            config = load_memory_config()
            if not config.is_cloud_mode:
                logger.debug("AgentCore Memory not in cloud mode, skipping content deletion")
                return

            # TODO: Implement actual AgentCore Memory deletion
            # The AgentCore Memory SDK doesn't currently expose session deletion.
            # Options for implementation:
            #
            # 1. Use boto3 directly with bedrock-agentcore client:
            #    client = boto3.client('bedrock-agentcore', region_name=config.region)
            #    client.delete_session(sessionId=session_id, memoryId=config.memory_id)
            #
            # 2. Wait for SDK support:
            #    from bedrock_agentcore.memory import MemoryClient
            #    client = MemoryClient(region_name=config.region)
            #    client.delete_session(memory_id=config.memory_id, session_id=session_id)
            #
            # For now, log that content deletion is pending
            logger.info(
                f"AgentCore Memory content deletion for session {session_id} - "
                "pending SDK support. Session metadata soft-deleted successfully."
            )

        except ImportError:
            logger.debug("AgentCore Memory SDK not available, skipping content deletion")
        except Exception as e:
            # Log but don't raise - content deletion failures shouldn't block session deletion
            logger.error(f"Failed to delete AgentCore Memory content for session {session_id}: {e}")
