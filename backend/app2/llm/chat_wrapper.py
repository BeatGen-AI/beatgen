import asyncio
import json
import uuid
from typing import Optional, Any, Dict, Type, List, Union, AsyncGenerator

import httpx2
from json_repair import repair_json
from pydantic_ai.messages import ModelMessage
from pydantic_ai.usage import UsageLimits

from app2.sse.sse_queue_manager import SSEQueueManager
from app2.core.logging import get_service_logger

from .available_models import ModelInfo
from .history import MessageHistory
from .adapters.base_adapter import ProviderAdapter
from .adapters.openai_adapter import OpenAIAdapter, OpenRouterAdapter
from .adapters.anthropic_adapter import AnthropicAdapter
from .adapters.gemini_adapter import GeminiAdapter
from .streaming import TextDeltaEvent, StreamEndEvent

logger = get_service_logger("chat_wrapper")

_ADAPTERS: Dict[str, Type[ProviderAdapter]] = {
    "anthropic": AnthropicAdapter,
    "openai": OpenAIAdapter,
    "openrouter": OpenRouterAdapter,
    "google-gla": GeminiAdapter,
}


def get_adapter_class(provider_name: str) -> Type[ProviderAdapter]:
    """The adapter for a lineup provider name. Raises for a provider without one."""
    try:
        return _ADAPTERS[provider_name]
    except KeyError:
        raise ValueError(f"Unsupported provider: {provider_name!r}. Supported: {sorted(_ADAPTERS)}") from None


class ChatSession:
    """
    Manages a chat conversation, including history and provider interaction.
    """

    def __init__(
        self,
        model_info: ModelInfo,
        queue: Optional[SSEQueueManager],
        system_prompt: Optional[str] = None,
        tools: Optional[List[Any]] = None,  # Pydantic AI tool functions
        project_id: Optional[str] = None,  # For saving messages to database
        db_session: Optional[Any] = None,  # Database session for saving messages
        request_id: Optional[str] = None,  # Request ID for message metadata
        mode: Optional[str] = None,  # Mode for message saving
        step: Optional[str] = None,  # Generation step for message saving
        http_client: Optional[httpx2.AsyncClient] = None,  # Provider HTTP client (tests); provider default if None
    ) -> None:
        """
        Initializes a new chat session.

        Args:
            model_info: The lineup entry to talk to (see `app2.llm.available_models`).
            queue: The SSE queue of the current request.
            system_prompt: Optional instructions for the agent.
            tools: Optional pydantic-ai tools the model may call.
            project_id: Optional project ID for saving messages to database.
            db_session: Optional database session for saving messages.
            request_id: Optional request ID for message metadata.
            mode: Optional mode for message saving.
            step: Optional generation step for message saving.
        """
        self.message_history = MessageHistory()
        self.model_info = model_info
        self.queue = queue
        self.current_tools = tools
        self.is_cancelled = False

        # Database saving context
        self.project_id = project_id
        self.db_session = db_session
        self.request_id = request_id
        self.mode = mode
        self.step = step

        # Token tracking
        self.total_request_tokens: int = 0
        self.total_response_tokens: int = 0
        self.total_tokens: int = 0
        self.last_request_tokens: int = 0
        self.last_response_tokens: int = 0

        self._system_prompt = system_prompt
        self._http_client = http_client
        self.adapter: ProviderAdapter = self._load_adapter()

    @property
    def current_provider_name(self) -> str:
        return self.model_info.provider_name

    @property
    def current_model_name(self) -> str:
        return self.model_info.model_name

    @property
    def current_system_prompt(self) -> Optional[str]:
        return self._system_prompt

    @current_system_prompt.setter
    def current_system_prompt(self, system_prompt: Optional[str]) -> None:
        """Change the instructions for later messages; the conversation history is kept."""
        self._system_prompt = system_prompt
        self.adapter = self._load_adapter()

    def switch_model(self, model_info: ModelInfo) -> None:
        """Use another lineup model for later messages; the (text) conversation history is kept."""
        self.model_info = model_info
        self.adapter = self._load_adapter()

    def _load_adapter(self) -> ProviderAdapter:
        adapter_class = get_adapter_class(self.model_info.provider_name)
        return adapter_class(
            model_info=self.model_info,
            system_prompt=self._system_prompt,
            tools=self.current_tools,
            http_client=self._http_client,
        )

    def _prepare_pydantic_ai_history(self) -> List[ModelMessage]:
        """The history before the current user message, in pydantic-ai's format."""
        return self.adapter.format_pydantic_ai_messages(self.message_history.get_messages())

    def cancel(self) -> None:
        """Sets the cancellation flag to stop ongoing streaming."""
        logger.info(f"ChatSession received cancel signal for {self.model_info.display_name}")
        self.is_cancelled = True

    def _record_usage(self, usage: Dict[str, int]) -> None:
        self.last_request_tokens = usage["request_tokens"]
        self.last_response_tokens = usage["response_tokens"]
        self.total_request_tokens += self.last_request_tokens
        self.total_response_tokens += self.last_response_tokens
        self.total_tokens = self.total_request_tokens + self.total_response_tokens
        logger.info(
            f"ChatSession token usage - Request: {self.last_request_tokens}, "
            f"Response: {self.last_response_tokens}, Total: {self.total_tokens}"
        )

    async def send_message_async(
        self,
        user_prompt_content: str,
        stream: bool = False,
        model_settings: Optional[Dict[str, Any]] = None,
        usage_limits: Optional[UsageLimits] = None,
        expect_json: bool = False,
    ) -> Union[str, AsyncGenerator[str, None]]:
        """
        Sends a message from the user to the LLM and gets a response, potentially streaming.

        Args:
            user_prompt_content: The text of the user's message.
            stream: Whether to stream the response. Defaults to False.
            model_settings: Optional per-call pydantic-ai model settings (merged over the model's own).
            usage_limits: Optional usage limits for the request.
            expect_json: If True, will attempt to parse and repair JSON output from the LLM.

        Returns:
            If stream is False, returns the complete assistant response text.
            If stream is True, returns an async generator yielding each new chunk of response text.

        Raises:
            ModelRefusalError: if the model declined the request (raised from the generator when streaming).
        """
        if self.is_cancelled:
            logger.info(f"ChatSession ({self.current_model_name}): send_message_async called but session is already cancelled.")
            raise asyncio.CancelledError("ChatSession operation cancelled because session was already flagged.")

        try:
            # History for pydantic-ai *before* adding the current user message to our internal history.
            pydantic_ai_formatted_history = self._prepare_pydantic_ai_history()
            self.message_history.add_message(role="user", content=user_prompt_content)

            if stream:
                async def stream_wrapper() -> AsyncGenerator[str, None]:
                    full_response_text_chunks: List[str] = []
                    try:
                        if self.is_cancelled:
                            raise asyncio.CancelledError("ChatSession streaming cancelled before adapter call.")

                        async_gen = await self.adapter.send_message_async(
                            user_prompt=user_prompt_content,
                            history=pydantic_ai_formatted_history,
                            stream=True,
                            model_settings=model_settings,
                            usage_limits=usage_limits,
                        )
                        async for event in async_gen:
                            if self.is_cancelled:
                                logger.info("ChatSession streaming cancelled mid-stream (event loop).")
                                break
                            if isinstance(event, TextDeltaEvent):
                                full_response_text_chunks.append(event.delta)
                                yield event.delta
                            elif isinstance(event, StreamEndEvent):
                                self._record_usage(event.final_usage)
                    except Exception as e_stream_inner:
                        logger.error(f"ChatSession ({self.current_model_name}): Error during streaming adapter call: {e_stream_inner}", exc_info=True)
                        error_text = f"Error during streaming: {e_stream_inner}"
                        self.message_history.add_message(role="assistant", content=error_text)
                        await self._save_assistant_message_to_db(error_text, is_tool_response=False)
                        raise
                    else:
                        response_text = "".join(full_response_text_chunks)
                        if response_text:
                            logger.info(f"🔍 Adding streaming assistant message to history (length: {len(response_text)}): {response_text[:100]}...")
                            self.message_history.add_message(role="assistant", content=response_text)
                            await self._save_assistant_message_to_db(response_text, is_tool_response=expect_json)

                return stream_wrapper()

            response_text, usage = await self.adapter.send_message_async(
                user_prompt=user_prompt_content,
                history=pydantic_ai_formatted_history,
                stream=False,
                model_settings=model_settings,
                usage_limits=usage_limits,
            )
            self._record_usage(usage)

            if self.is_cancelled:
                logger.info(f"ChatSession ({self.current_model_name}): Non-streaming call cancelled during/after adapter await; not adding to history.")
                raise asyncio.CancelledError("ChatSession operation cancelled while waiting for the model.")

            logger.info(f"🔍 Adding assistant message to history (length: {len(response_text)}): {response_text[:100]}...")
            self.message_history.add_message(role="assistant", content=response_text)
            await self._save_assistant_message_to_db(response_text, is_tool_response=expect_json)

            if expect_json:
                try:
                    json.loads(response_text)
                    return response_text
                except json.JSONDecodeError:
                    repaired = repair_json(response_text)
                    json.loads(repaired)  # raises if the repair did not produce JSON
                    return repaired
            return response_text

        except asyncio.CancelledError:
            logger.info(f"ChatSession ({self.current_model_name}): send_message_async task cancelled.")
            self.is_cancelled = True
            raise
        except Exception as e_outer:
            logger.error(f"ChatSession ({self.current_model_name}): Unhandled error in send_message_async: {e_outer}", exc_info=True)
            self.message_history.add_message(role="assistant", content=f"Error in ChatSession: {e_outer}")
            raise

    def get_token_usage(self) -> Dict[str, int]:
        """Get the accumulated token usage for this session."""
        return {
            "request_tokens": self.total_request_tokens,
            "response_tokens": self.total_response_tokens,
            "total_tokens": self.total_tokens
        }

    def get_last_call_usage(self) -> Dict[str, int]:
        """Get token usage for the last LLM call only."""
        return {
            "request_tokens": self.last_request_tokens,
            "response_tokens": self.last_response_tokens,
            "total_tokens": self.last_request_tokens + self.last_response_tokens
        }

    def reset_token_usage(self) -> None:
        """Reset all token counters to zero."""
        self.total_request_tokens = 0
        self.total_response_tokens = 0
        self.total_tokens = 0
        self.last_request_tokens = 0
        self.last_response_tokens = 0

    async def _save_assistant_message_to_db(self, content: str, is_tool_response: bool = False) -> None:
        """Save assistant message to database if context is available"""
        logger.info(f"🔍 CHAT SESSION: About to save message (project_id: {self.project_id}, request_id: {self.request_id}, mode: {self.mode}, step: {self.step}, is_tool_response: {is_tool_response})")

        if not all([self.project_id, self.db_session]):
            logger.warning(f"🔍 CHAT SESSION: Skipping DB save - missing project_id: {self.project_id}, db_session: {self.db_session is not None}")
            return

        step_to_save = self.step
        if is_tool_response and self.step and not self.step.endswith('_TOOL'):
            step_to_save = f"{self.step}_TOOL"

        try:
            from app2.services.assistant_message_service import AssistantMessageService

            message_service = AssistantMessageService(self.db_session)
            await message_service.save_assistant_message(
                project_id=uuid.UUID(self.project_id),
                request_id=self.request_id or "unknown",
                content=content,
                mode=self.mode or 'chat',
                step=step_to_save,
                metadata={
                    'model': self.current_model_name,
                    'provider': self.current_provider_name,
                    'tokens': self.get_last_call_usage()
                }
            )
            logger.info(f"💾 CHAT SESSION: Saved assistant message to project_id: {self.project_id} (mode: {self.mode}, step: {self.step})")

        except Exception as e:
            # Don't break chat flow if DB save fails
            logger.error(f"Failed to save assistant message to DB: {e}")
