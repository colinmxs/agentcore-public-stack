"""
Session hooks for agent lifecycle events

Note: These hooks are imported from the existing agentcore.agent.hooks module
to maintain compatibility and avoid code duplication.
"""
from agentcore.agent.hooks import StopHook, ConversationCachingHook

__all__ = [
    "StopHook",
    "ConversationCachingHook",
]
