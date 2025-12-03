"""
System prompt construction for agent
"""
import logging
from typing import Optional
from agents.strands_agent.utils.timezone import get_current_date_pacific

logger = logging.getLogger(__name__)


DEFAULT_SYSTEM_PROMPT = """You are an intelligent AI agent with dynamic tool capabilities. You can perform various tasks based on the combination of tools available to you.

Key guidelines:
- You can ONLY use tools that are explicitly provided to you in each conversation
- Available tools may change throughout the conversation based on user preferences
- When multiple tools are available, select and use the most appropriate combination in the optimal order to fulfill the user's request
- Break down complex tasks into steps and use multiple tools sequentially or in parallel as needed
- Always explain your reasoning when using tools
- If you don't have the right tool for a task, clearly inform the user about the limitation

Browser Automation Best Practices:
- **ALWAYS prefer direct URLs with search parameters** over multi-step form filling
- Examples:
  ✓ Use: "https://www.google.com/search?q=AI+news" (1 step)
  ✗ Avoid: Navigate to google.com → find search box → type → click search (3-4 steps)
  ✓ Use: "https://www.amazon.com/s?k=wireless+headphones"
  ✗ Avoid: Navigate to amazon.com → find search → type → submit
- This reduces steps, improves reliability, and bypasses CAPTCHA challenges more effectively
- Only use browser_act for interactions when direct URL navigation is not possible

Your goal is to be helpful, accurate, and efficient in completing user requests using the available tools."""


class SystemPromptBuilder:
    """Builds system prompts with optional date injection"""

    def __init__(self, base_prompt: Optional[str] = None):
        """
        Initialize prompt builder

        Args:
            base_prompt: Custom base prompt (if None, uses DEFAULT_SYSTEM_PROMPT)
        """
        self.base_prompt = base_prompt or DEFAULT_SYSTEM_PROMPT

    def build(self, include_date: bool = True) -> str:
        """
        Build system prompt with optional date

        Args:
            include_date: Whether to append current date to prompt

        Returns:
            str: Complete system prompt
        """
        if include_date:
            current_date = get_current_date_pacific()
            prompt = f"{self.base_prompt}\n\nCurrent date: {current_date}"
            logger.info(f"Built system prompt with current date: {current_date}")
            return prompt
        else:
            logger.info("Built system prompt without date")
            return self.base_prompt

    @classmethod
    def from_user_prompt(cls, user_prompt: str) -> "SystemPromptBuilder":
        """
        Create builder from user-provided prompt (assumed to already have date)

        Args:
            user_prompt: User-provided system prompt

        Returns:
            SystemPromptBuilder: Builder configured with user prompt
        """
        logger.info("Using user-provided system prompt (date already included by BFF)")
        return cls(base_prompt=user_prompt)
