import copy
import logging
from abc import ABC, abstractmethod
from typing import List, Any, AsyncGenerator, Dict, Optional, Sequence, Tuple

import httpx2
from pydantic_ai import Agent, AgentRunResultEvent
from pydantic_ai.exceptions import ContentFilterError
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models import Model
from pydantic_ai.run import AgentRunResult
from pydantic_ai.usage import RunUsage, UsageLimits

from app2.llm.available_models import ModelInfo
from app2.llm.history import ChatMessage, ToolResponseMessageContent
from app2.llm.streaming import AnyStreamEvent, StreamEndEvent, StreamStartEvent, TextDeltaEvent

logger = logging.getLogger(__name__)


class ModelRefusalError(RuntimeError):
    """The model (or its provider's safety system) declined the request.

    Raised instead of returning the empty or partial output of a declined request. For Anthropic this is
    `stop_reason == "refusal"` (after any server-side fallback also declined); other providers report the same
    `content_filter` finish reason through pydantic-ai.
    """

    def __init__(self, model_display_name: str, provider_details: Optional[Dict[str, Any]] = None) -> None:
        details = provider_details or {}
        self.model_display_name = model_display_name
        self.category: Optional[str] = details.get("refusal_category")
        self.explanation: Optional[str] = details.get("refusal")
        message = f"{model_display_name} declined this request"
        if self.category:
            message += f" (refusal category: {self.category})"
        message += "."
        if self.explanation:
            message += f" {self.explanation}"
        message += " Try rephrasing the request or choose another model."
        super().__init__(message)


def usage_to_dict(usage: RunUsage) -> Dict[str, int]:
    """The token counts the chat session and the music agent track, from a pydantic-ai `RunUsage`."""
    return {
        "request_tokens": usage.input_tokens,
        "response_tokens": usage.output_tokens,
        "total_tokens": usage.input_tokens + usage.output_tokens,
    }


class ProviderAdapter(ABC):
    """
    Base class for provider adapters.

    A concrete adapter only builds the pydantic-ai `Model` for its provider. Running the agent, streaming,
    refusal detection and usage reporting are shared.

    Every request is streamed under the hood (`Agent.run_stream_events`), also when the caller asks for a complete
    response: long, high-effort requests then can't hit non-streaming HTTP timeouts, and the response is parsed
    from the same events in both modes.
    """

    def __init__(
        self,
        model_info: ModelInfo,
        system_prompt: Optional[str] = None,
        tools: Optional[List[Any]] = None,
        http_client: Optional[httpx2.AsyncClient] = None,
    ) -> None:
        """
        Args:
            model_info: The lineup entry to use (provider, model ID, API key variable, per-model request settings).
            system_prompt: Optional instructions for the agent.
            tools: Optional pydantic-ai tools the model may call.
            http_client: Optional HTTP client for the provider SDK (tests pass one with a mock transport);
                the provider's default client is used when omitted.
        """
        self.model_info = model_info
        self.model_name = model_info.model_name
        self.system_prompt = system_prompt
        self.tools = tools
        self.model = self._build_model(
            api_key=model_info.get_api_key(),
            http_client=http_client,
            # A copy, so nothing pydantic-ai does with the settings can touch the shared lineup entry.
            settings=copy.deepcopy(dict(model_info.model_settings)),
        )
        self.agent = Agent(
            model=self.model,
            instructions=system_prompt,
            tools=tools or (),
        )

    @abstractmethod
    def _build_model(
        self, *, api_key: str, settings: Dict[str, Any], http_client: Optional[httpx2.AsyncClient]
    ) -> Model:
        """Build the pydantic-ai model for `self.model_info`, with `settings` as its default request settings."""

    async def send_message_async(
        self,
        user_prompt: str,
        history: Sequence[ModelMessage],
        stream: bool = False,
        model_settings: Optional[Dict[str, Any]] = None,
        usage_limits: Optional[UsageLimits] = None,
    ) -> Any:
        """
        Sends a message to the model.

        Returns:
            If stream is False, a tuple of (response text, usage dict with request_tokens, response_tokens and
            total_tokens).
            If stream is True, an async generator of `StreamStartEvent`, `TextDeltaEvent` (one per new chunk of
            text) and a final `StreamEndEvent`. Errors are raised from the generator, never yielded.

        Raises:
            ModelRefusalError: if the model declined the request.
        """
        events = self._run_events(user_prompt, history, model_settings, usage_limits)
        if stream:
            return self._stream(events)
        result: Optional[AgentRunResult[str]] = None
        async for event in events:
            if isinstance(event, AgentRunResult):
                result = event
        if result is None:
            raise RuntimeError(f"{self.model_info.display_name}: the agent run ended without a result")
        return result.output, usage_to_dict(result.usage())

    async def _stream(self, events: AsyncGenerator[Any, None]) -> AsyncGenerator[AnyStreamEvent, None]:
        yield StreamStartEvent(metadata={"model": self.model_name, "provider": self.model_info.provider_name})
        result: Optional[AgentRunResult[str]] = None
        async for event in events:
            if isinstance(event, str):
                yield TextDeltaEvent(delta=event)
            elif isinstance(event, AgentRunResult):
                result = event
        if result is None:
            raise RuntimeError(f"{self.model_info.display_name}: the agent run ended without a result")
        yield StreamEndEvent(final_usage=usage_to_dict(result.usage()))

    async def _run_events(
        self,
        user_prompt: str,
        history: Sequence[ModelMessage],
        model_settings: Optional[Dict[str, Any]],
        usage_limits: Optional[UsageLimits],
    ) -> AsyncGenerator[Any, None]:
        """Yield each new chunk of response text (`str`), then the `AgentRunResult` once refusals are ruled out."""
        try:
            async with self.agent.run_stream_events(
                user_prompt,
                message_history=list(history),
                model_settings=model_settings or None,
                usage_limits=usage_limits,
            ) as run_events:
                async for event in run_events:
                    if isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
                        if event.part.content:
                            yield event.part.content
                    elif isinstance(event, PartDeltaEvent) and isinstance(event.delta, TextPartDelta):
                        if event.delta.content_delta:
                            yield event.delta.content_delta
                    elif isinstance(event, AgentRunResultEvent):
                        self._raise_on_refusal(event.result.new_messages())
                        yield event.result
        except ContentFilterError as e:
            # pydantic-ai raises this itself when a declined response carries no text.
            responses = [m for m in self._messages_from_error(e) if isinstance(m, ModelResponse)]
            raise ModelRefusalError(
                self.model_info.display_name, responses[-1].provider_details if responses else None
            ) from e

    def _raise_on_refusal(self, messages: Sequence[ModelMessage]) -> None:
        """Fail loudly when any response of the run was declined: its text is partial or empty, never a result."""
        for message in messages:
            if isinstance(message, ModelResponse) and message.finish_reason == "content_filter":
                raise ModelRefusalError(self.model_info.display_name, message.provider_details)

    @staticmethod
    def _messages_from_error(error: ContentFilterError) -> List[ModelMessage]:
        from pydantic_ai.messages import ModelMessagesTypeAdapter

        body = getattr(error, "body", None)
        if not body:
            return []
        return list(ModelMessagesTypeAdapter.validate_json(body))

    def format_pydantic_ai_messages(self, chat_history: List[ChatMessage]) -> List[ModelMessage]:
        """
        Converts a list of our internal ChatMessage objects to a list of
        Pydantic AI ModelMessage objects suitable for message_history.
        """
        pydantic_ai_history: List[ModelMessage] = []
        for msg in chat_history:
            if msg.role == "user":
                pydantic_ai_history.append(ModelRequest(parts=[UserPromptPart(content=str(msg.content))]))
            elif msg.role == "assistant":
                if isinstance(msg.content, dict) and "tool_name" in msg.content and "args" in msg.content and "tool_call_id" in msg.content:
                    pydantic_ai_history.append(
                        ModelResponse(parts=[
                            ToolCallPart(
                                tool_name=msg.content["tool_name"],
                                args=msg.content["args"],
                                tool_call_id=msg.content["tool_call_id"]
                            )
                        ])
                    )
                else:
                    pydantic_ai_history.append(ModelResponse(parts=[TextPart(content=str(msg.content))]))
            elif msg.role == "system":
                # System instructions are set on the agent, not replayed as history.
                logger.warning(f"System role in ChatMessage history is handled by the agent's instructions. Skipping: {msg.content}")
            elif msg.role == "tool":
                if isinstance(msg.content, ToolResponseMessageContent):
                    pydantic_ai_history.append(
                        ModelRequest(parts=[
                            ToolReturnPart(
                                tool_name=msg.content.tool_name,
                                tool_call_id=msg.content.tool_call_id,
                                content=msg.content.output
                            )
                        ])
                    )
                else:
                    logger.warning(f"Tool role in ChatMessage history does not have ToolResponseMessageContent. Skipping: {msg.content}")
            else:
                logger.warning(f"Unknown role '{msg.role}' in ChatMessage history. Skipping: {msg.content}")

        return pydantic_ai_history
