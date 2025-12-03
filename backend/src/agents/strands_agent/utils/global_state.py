"""
Global state management for stream processor

Note: This is a temporary solution for maintaining global stream processor reference.
Consider refactoring to dependency injection in the future.
"""
from typing import Optional
from agentcore.utils.event_processor import StreamEventProcessor


# Global stream processor instance
_global_stream_processor: Optional[StreamEventProcessor] = None


def set_global_stream_processor(processor: StreamEventProcessor) -> None:
    """Set the global stream processor instance"""
    global _global_stream_processor
    _global_stream_processor = processor


def get_global_stream_processor() -> Optional[StreamEventProcessor]:
    """Get the global stream processor instance"""
    return _global_stream_processor
