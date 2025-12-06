"""Chat feature service layer

Contains business logic for chat operations, including agent creation and management.
"""

import logging
from typing import Optional, List

# from agentcore.agent.agent import ChatbotAgent
from agents.strands_agent.strands_agent import StrandsAgent

logger = logging.getLogger(__name__)


def get_agent(
    session_id: str,
    user_id: Optional[str] = None,
    enabled_tools: Optional[List[str]] = None,
    model_id: Optional[str] = None,
    temperature: Optional[float] = None,
    system_prompt: Optional[str] = None,
    caching_enabled: Optional[bool] = None
) -> StrandsAgent:
    """
    Create agent instance with current configuration for session

    No caching - creates new agent each time to reflect latest configuration.
    Session message history is managed by AgentCore Memory automatically.
    """
    # Create agent with AgentCore Memory - messages and preferences automatically loaded/saved
    agent = StrandsAgent(
        session_id=session_id,
        user_id=user_id,
        enabled_tools=enabled_tools,
        model_id=model_id,
        temperature=temperature,
        system_prompt=system_prompt,
        caching_enabled=caching_enabled
    )

    return agent

