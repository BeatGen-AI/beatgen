import os
import logging
from typing import Type, TypeVar, Optional, List, Dict, Any, Generic, Callable, Awaitable, AsyncIterator, Union
from dataclasses import dataclass

from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
# from pydantic_ai.exceptions import UserError, ModelError, LLMError # For more specific error handling

# Use existing ChatSession infrastructure
from app2.llm.chat_wrapper import ChatSession
from app2.sse.sse_queue_manager import SSEQueueManager
from app2.llm.available_models import ModelInfo

logger = logging.getLogger(__name__)

# Define generic types
Dependencies = TypeVar("Dependencies")
ResponseModelType = TypeVar("ResponseModelType", bound=BaseModel)

# Example placeholder for dependencies if your tools/prompts need them
@dataclass
class DefaultAgentDependencies:
    pass


class PydanticAgentWrapper(Generic[Dependencies]):
    def __init__(
        self,
        model_info: ModelInfo,  # Always require ModelInfo for consistency with rest of codebase
        system_prompt: str = "",
        default_output_type: Optional[Type[BaseModel]] = None,
        deps_type: Optional[Type[Dependencies]] = None,
        initial_tools: Optional[List[Callable[..., Awaitable[Any]]]] = None,
        # Kwargs for the LLM (not used in ChatSession but kept for compatibility)
        llm_init_kwargs: Optional[Dict[str, Any]] = None,
    ):
        self.model_info = model_info
        self._system_prompt_content = system_prompt
        self.default_output_type = default_output_type
        self.deps_type = deps_type if deps_type else Type[DefaultAgentDependencies]
        self.llm_init_kwargs = llm_init_kwargs or {}
        
        # Store registered tools for tool-based functionality
        self.registered_tools: List[Callable[..., Awaitable[Any]]] = []
        if initial_tools:
            self.registered_tools.extend(initial_tools)

        self.messages: List[Dict[str, Any]] = []
        
        logger.info(
            f"PydanticAgentWrapper initialized for model: {model_info.display_name} "
            f"({model_info.provider_name}:{model_info.model_name}) "
            f"with system prompt: '{system_prompt[:50]}...'"
        )

    def set_system_prompt(self, system_prompt: str):
        """Updates the system prompt for future ChatSession instances."""
        logger.info(f"System prompt updated")
        self._system_prompt_content = system_prompt


    def append_user_message(self, content: str):
        self.messages.append({"role": "user", "content": content})

    def append_assistant_message(self, content: Any):
        if isinstance(content, BaseModel):
            # Storing as dict for broader compatibility if messages are passed around
            self.messages.append({"role": "assistant", "content": content.model_dump()})
        elif isinstance(content, list) and all(isinstance(item, BaseModel) for item in content):
             self.messages.append({"role": "assistant", "content": [item.model_dump() for item in content]})
        else:
            self.messages.append({"role": "assistant", "content": str(content)})

    def get_messages(self) -> List[Dict[str, Any]]:
        return self.messages

    def clear_messages(self):
        self.messages = []
        logger.info("Conversation history cleared.")

    async def send_message_async(
        self,
        message: Optional[str] = None,
        response_model: Optional[Type[ResponseModelType]] = None,
        deps: Optional[Dependencies] = None,
        # Kwargs for the LLM run method (not used with ChatSession but kept for compatibility)
        llm_run_kwargs: Optional[Dict[str, Any]] = None,
        queue: Optional[SSEQueueManager] = None,
        stream: bool = False,
    ) -> Union[ResponseModelType, str, List[ResponseModelType]]:
        if message:
            self.append_user_message(message)

        if not self.messages or self.messages[-1]["role"] != "user":
            raise ValueError("No user message available to send as query. Please provide a message or ensure history has a user message.")

        # Get the last user message
        query_message_content = None
        for msg in reversed(self.messages):
            if msg["role"] == "user":
                query_message_content = msg["content"]
                break
        
        if not query_message_content:
            raise ValueError("No user message found in history")

        # Use ChatSession for the actual LLM interaction - this handles all API keys and providers
        if not queue:
            # For non-streaming, create a dummy queue
            class DummyQueue:
                async def add_chunk(self, chunk): pass
                async def complete(self, data=None): pass
            queue = DummyQueue()

        chat_session = ChatSession(
            provider_name=self.model_info.provider_name,
            model_name=self.model_info.model_name,
            queue=queue,
            system_prompt=self._system_prompt_content,
            api_key=self.model_info.get_api_key(),
            base_url=self.model_info.base_url
        )

        logger.info(
            f"Running ChatSession query: '{str(query_message_content)[:50]}...'. "
            f"Model: {self.model_info.provider_name}:{self.model_info.model_name}. "
            f"Stream: {stream}"
        )

        # For tool-based functionality, we need to simulate tool calls
        if self.registered_tools and deps:
            # Check if the message might need tool usage
            # This is a simplified approach - in a full implementation you'd use proper tool parsing
            enhanced_prompt = f"""You are an AI assistant with access to tools. 

User message: {query_message_content}

Available tools: {[getattr(tool, '__name__', 'unknown') for tool in self.registered_tools]}

Please respond naturally to the user's request. If you need to use tools, call them appropriately."""

            response = await chat_session.send_message_async(enhanced_prompt, stream=stream)
        else:
            # Standard message processing
            response = await chat_session.send_message_async(query_message_content, stream=stream)

        # Store response in message history
        self.append_assistant_message(response)
        return response # type: ignore

    async def run_async(
        self,
        message: str,
        deps: Optional[Dependencies] = None,
        response_model: Optional[Type[ResponseModelType]] = None,
    ) -> Union[ResponseModelType, str]:
        """
        Simplified async run method for direct agent execution.
        """
        return await self.send_message_async(
            message=message,
            response_model=response_model,
            deps=deps,
            stream=False
        )

    def register_tool(self, tool_func: Callable[..., Awaitable[Any]]):
        """
        Registers an async tool function for potential use in responses.
        The tool's docstring and type hints are used to understand its purpose.
        """
        self.registered_tools.append(tool_func)
        logger.info(f"Registered tool: {getattr(tool_func, '__name__', 'N/A')}")

    def register_toolset(self, toolset):
        """
        Registers a toolset (collection of tools).
        """
        try:
            tools_registered = 0
            if hasattr(toolset, '__iter__'):
                # Try to iterate through the toolset and register each tool
                for tool_func in toolset:
                    if callable(tool_func):
                        self.register_tool(tool_func)
                        tools_registered += 1
            elif hasattr(toolset, 'tools'):
                # Some toolsets might have a tools attribute/method
                tools = toolset.tools() if callable(toolset.tools) else toolset.tools
                for tool_func in tools:
                    self.register_tool(tool_func)
                    tools_registered += 1
            else:
                logger.warning(f"Unknown toolset format: {type(toolset)}")
            
            logger.info(f"Registered {tools_registered} tools from toolset: {type(toolset).__name__}")
            
        except Exception as e:
            logger.error(f"Failed to register toolset: {e}")
            raise

    def get_model_id(self) -> str:
        return f"{self.model_info.provider_name}:{self.model_info.model_name}"
