"""
Local Session Buffer Manager
Wraps FileSessionManager with buffering and cancellation support for local development.
Similar to TurnBasedSessionManager but for local file-based storage.
"""

import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


class LocalSessionBuffer:
    """
    Wrapper around FileSessionManager that adds:
    1. Cancellation support (cancelled flag)
    2. Simple buffering to batch writes

    For local development only - mimics TurnBasedSessionManager behavior.
    """

    def __init__(
        self,
        base_manager,
        session_id: str,
        batch_size: int = 5
    ):
        self.base_manager = base_manager
        self.session_id = session_id
        self.batch_size = batch_size
        self.cancelled = False  # Flag to stop accepting new messages
        self.pending_messages: List[Dict[str, Any]] = []

        logger.info(f"✅ LocalSessionBuffer initialized (batch_size={batch_size})")

    def append_message(self, message, agent, message_id: Optional[str] = None, **kwargs):
        """
        Override append_message to buffer messages and check cancelled flag.

        Args:
            message: Message from Strands framework
            agent: Agent instance (not used in buffering)
            message_id: Optional UUID injected by MessageIdInjector wrapper
            **kwargs: Additional arguments
        """
        # If cancelled, don't accept new messages
        if self.cancelled:
            logger.warning(f"🚫 Session cancelled, ignoring message (role={message.get('role')})")
            return

        # Use provided ID or generate new one (fallback)
        if not message_id:
            import uuid
            message_id = str(uuid.uuid4())
            logger.warning(f"⚠️ No message_id provided, generated fallback: {message_id}")

        # Convert Message to dict format for buffering
        message_dict = {
            "message_id": message_id,  # Include UUID
            "role": message.get("role"),
            "content": message.get("content", [])
        }

        # Add to buffer
        self.pending_messages.append(message_dict)
        logger.debug(f"📝 Buffered message {message_id} (role={message_dict['role']}, total={len(self.pending_messages)})")

        # Periodic flush to prevent data loss
        if len(self.pending_messages) >= self.batch_size:
            logger.info(f"⏰ Batch size ({self.batch_size}) reached, flushing buffer")
            self.flush()

    def flush(self) -> Optional[int]:
        """
        Force flush pending messages to FileSessionManager

        Returns:
            Message ID of the last flushed message, or None if nothing was flushed
        """
        # Flush pending messages if any exist
        if self.pending_messages:
            logger.info(f"💾 Flushing {len(self.pending_messages)} messages to FileSessionManager")

            # Get current sequence number for file naming
            sequence_num = self._get_next_sequence_number()

            # Write each pending message to base manager
            for idx, message_dict in enumerate(self.pending_messages):
                # Convert dict back to Message-like object
                from strands.types.session import SessionMessage
                from strands.types.content import Message

                message_id = message_dict.get("message_id")  # UUID

                strands_message: Message = {
                    "role": message_dict["role"],
                    "content": message_dict["content"]
                }

                # Create SessionMessage and pass to base manager
                session_message = SessionMessage.from_message(strands_message, 0)

                try:
                    # Store with sequence number for filename and UUID as message_id
                    current_seq = sequence_num + idx
                    self._write_message_with_id(
                        session_message,
                        message_id=message_id,
                        sequence=current_seq
                    )
                    logger.debug(f"💾 Wrote message {message_id} to message_{current_seq}.json")
                except Exception as e:
                    logger.error(f"Failed to write message {message_id} to FileSessionManager: {e}")

            # Clear buffer after writing
            self.pending_messages = []

        # Always try to get the latest message ID from disk
        # This handles the case where messages were already flushed during streaming
        # (e.g., when batch_size was reached)
        last_message_id = self._get_latest_message_id()

        if last_message_id:
            logger.debug(f"✅ Flush complete (latest message ID: {last_message_id})")
        else:
            logger.debug(f"✅ Flush complete (no messages found)")

        return last_message_id

    def _get_latest_message_id(self) -> Optional[int]:
        """
        Get the ID of the most recently stored message in local file storage

        Returns:
            Message ID (1-indexed) or None if unavailable
        """
        try:
            from pathlib import Path
            from apis.app_api.storage.paths import get_messages_dir

            # Get messages directory
            messages_dir = get_messages_dir(self.session_id)

            if messages_dir.exists():
                # Get all message files sorted by number
                message_files = sorted(
                    messages_dir.glob("message_*.json"),
                    key=lambda p: int(p.stem.split("_")[1]) if p.stem.split("_")[1].isdigit() else 0
                )
                if message_files:
                    # Get the highest message number
                    latest_file = message_files[-1]
                    message_num = int(latest_file.stem.split("_")[1])
                    return message_num

        except Exception as e:
            logger.error(f"Failed to get latest message ID: {e}")

        return None

    def _get_next_sequence_number(self) -> int:
        """
        Get the next sequence number for file naming

        Returns:
            int: Next sequence number (1 for first message, increments from there)
        """
        try:
            from apis.app_api.storage.paths import get_messages_dir

            messages_dir = get_messages_dir(self.session_id)

            if messages_dir.exists():
                message_files = sorted(
                    messages_dir.glob("message_*.json"),
                    key=lambda p: int(p.stem.split("_")[1]) if p.stem.split("_")[1].isdigit() else 0
                )
                if message_files:
                    latest_file = message_files[-1]
                    last_seq = int(latest_file.stem.split("_")[1])
                    return last_seq + 1

            return 1  # First message
        except Exception as e:
            logger.error(f"Failed to get next sequence number: {e}")
            return 1

    def _write_message_with_id(self, session_message, message_id: str, sequence: int):
        """
        Write message to disk with UUID and sequence number

        Args:
            session_message: SessionMessage object from Strands
            message_id: UUID for the message (for API/client)
            sequence: Sequence number for file naming (for storage)
        """
        from apis.app_api.storage.paths import get_message_path
        import json
        from datetime import datetime, timezone

        message_path = get_message_path(self.session_id, sequence)
        message_path.parent.mkdir(parents=True, exist_ok=True)

        # Store both UUID and sequence
        message_data = {
            "message_id": message_id,      # UUID for API
            "sequence": sequence,           # For file ordering
            "created_at": datetime.now(timezone.utc).isoformat(),
            "message": {
                "role": session_message.role,
                "content": session_message.content
            }
        }

        with open(message_path, 'w') as f:
            json.dump(message_data, f, indent=2)

    # Delegate all other methods to base manager
    def __getattr__(self, name):
        """Delegate unknown methods to base FileSessionManager"""
        return getattr(self.base_manager, name)
