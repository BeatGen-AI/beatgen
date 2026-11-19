"""The assistant's real outgoing LLM requests, built by pydantic-ai and intercepted with an httpx2 mock transport.

No API keys or network: every request goes to a `httpx2.MockTransport`. The tests assert on the JSON and headers
each lineup model would send, and on how responses (refusals, server-side fallbacks) are handled.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import httpx2
import pytest

from app2.constants.credits import MODEL_COSTS, UnknownModelCostError, get_model_credit_cost
from app2.llm import available_models
from app2.llm.adapters.base_adapter import ModelRefusalError
from app2.llm.available_models import ALL_MODELS, UnknownModelError, get_model_by_name
from app2.llm.chat_session_manager import ChatSessionManager
from app2.llm.chat_wrapper import ChatSession
from app2.llm.tools.edit_tools import EDIT_TOOLS

# The contract in .scratch/app-refresh/spec.md, in UI order:
# (display name, pydantic-ai provider, model ID, credits)
SPEC_LINEUP = [
    ("Gemini 4 Carbon", "google-gla", "gemini-4-carbon", 80),
    ("Gemini 3.8 Flash", "google-gla", "gemini-3.8-flash", 33),
    ("DeepSeek V4 Pro", "openrouter", "deepseek/deepseek-v4-pro", 36),
    ("DeepSeek V4.1 Flash", "openrouter", "deepseek/deepseek-v4.1-flash", 12),
    ("Claude Sonnet 5.5", "anthropic", "claude-sonnet-5-5", 80),
    ("Claude Opus 5.5", "anthropic", "claude-opus-5-5", 160),
    ("Claude Haiku 5.5", "anthropic", "claude-haiku-5-5", 4),
    ("GPT-6.2 Sol", "openai", "gpt-6.2-sol", 80),
    ("GPT-6.1 Terra", "openai", "gpt-6.1-terra", 40),
    ("GPT-6.2 Astra", "openai", "gpt-6.2-astra", 320),
    ("GPT-6 Luna", "openai", "gpt-6-luna", 4),
    ("Llama 4 Maverick", "openrouter", "meta-llama/llama-4-maverick", 14),
    ("Llama 4 Scout", "openrouter", "meta-llama/llama-4-scout", 4),
]

# Where each provider's request goes.
EXPECTED_ENDPOINT = {
    "anthropic": ("api.anthropic.com", "/v1/messages"),
    "openai": ("api.openai.com", "/v1/responses"),
    "openrouter": ("openrouter.ai", "/api/v1/chat/completions"),
    "google-gla": ("generativelanguage.googleapis.com", None),  # path carries the model ID, checked separately
}

CLAUDE_WITH_FALLBACK = ["Claude Opus 5.5", "Claude Sonnet 5.5"]
SAMPLING_PARAMS = ("temperature", "top_p", "top_k")


@pytest.fixture(autouse=True)
def provider_keys(monkeypatch):
    for var in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.setenv(var, f"test-{var.lower()}")


@dataclass
class Recorder:
    """A mock transport that records requests and answers with `responder`."""

    responder: Callable[[httpx2.Request, Dict[str, Any]], httpx2.Response]
    requests: List[httpx2.Request] = field(default_factory=list)
    bodies: List[Dict[str, Any]] = field(default_factory=list)

    def handle(self, request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content) if request.content else {}
        self.requests.append(request)
        self.bodies.append(body)
        return self.responder(request, body)

    def client(self) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(transport=httpx2.MockTransport(self.handle), timeout=1200)


def reject_with_400(request: httpx2.Request, body: Dict[str, Any]) -> httpx2.Response:
    """Stop after capturing the request (400s are not retried by the SDKs)."""
    return httpx2.Response(400, json={"error": {"type": "invalid_request_error", "message": "captured by test"}})


def anthropic_sse(
    *,
    text_chunks: List[str],
    stop_reason: str = "end_turn",
    stop_details: Optional[Dict[str, Any]] = None,
    leading_blocks: Optional[List[Dict[str, Any]]] = None,
    model: str = "claude-opus-5-5",
) -> Callable[[httpx2.Request, Dict[str, Any]], httpx2.Response]:
    """An Anthropic Messages streaming response (SSE)."""

    def responder(request: httpx2.Request, body: Dict[str, Any]) -> httpx2.Response:
        assert body.get("stream") is True, "the adapter streams every Anthropic request"
        events: List[tuple[str, Dict[str, Any]]] = [
            (
                "message_start",
                {
                    "type": "message_start",
                    "message": {
                        "id": "msg_test",
                        "type": "message",
                        "role": "assistant",
                        "model": model,
                        "content": [],
                        "stop_reason": None,
                        "stop_sequence": None,
                        "usage": {"input_tokens": 11, "output_tokens": 1},
                    },
                },
            )
        ]
        index = 0
        for block in leading_blocks or []:
            events.append(("content_block_start", {"type": "content_block_start", "index": index, "content_block": block}))
            events.append(("content_block_stop", {"type": "content_block_stop", "index": index}))
            index += 1
        if text_chunks:
            events.append(
                ("content_block_start", {"type": "content_block_start", "index": index, "content_block": {"type": "text", "text": ""}})
            )
            for chunk in text_chunks:
                events.append(
                    (
                        "content_block_delta",
                        {"type": "content_block_delta", "index": index, "delta": {"type": "text_delta", "text": chunk}},
                    )
                )
            events.append(("content_block_stop", {"type": "content_block_stop", "index": index}))
        delta: Dict[str, Any] = {"stop_reason": stop_reason, "stop_sequence": None}
        if stop_details is not None:
            delta["stop_details"] = stop_details
        events.append(("message_delta", {"type": "message_delta", "delta": delta, "usage": {"output_tokens": 7}}))
        events.append(("message_stop", {"type": "message_stop"}))
        payload = "".join(f"event: {name}\ndata: {json.dumps(data)}\n\n" for name, data in events)
        return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=payload.encode())

    return responder


def make_session(display_name: str, recorder: Recorder, *, tools: Optional[list] = None) -> ChatSession:
    return ChatSession(
        model_info=get_model_by_name(display_name),
        queue=None,
        system_prompt="You are a music production assistant.",
        tools=tools,
        http_client=recorder.client(),
    )


async def send(session: ChatSession, *, stream: bool, **kwargs: Any) -> str:
    if stream:
        chunks = []
        async for chunk in await session.send_message_async("Make it jazzier", stream=True, **kwargs):
            chunks.append(chunk)
        return "".join(chunks)
    return await session.send_message_async("Make it jazzier", stream=False, **kwargs)


# --- Lineup contract ---------------------------------------------------------------------------------------------


def test_lineup_matches_the_spec_in_ui_order():
    assert [(m.display_name, m.provider_name, m.model_name) for m in ALL_MODELS] == [
        (name, provider, model_id) for name, provider, model_id, _ in SPEC_LINEUP
    ]
    assert MODEL_COSTS == {name: credits for name, _, _, credits in SPEC_LINEUP}


@pytest.mark.parametrize("display_name,provider,model_id,credits", SPEC_LINEUP)
def test_display_name_maps_to_provider_model_and_cost(display_name, provider, model_id, credits):
    info = get_model_by_name(display_name)
    assert (info.provider_name, info.model_name) == (provider, model_id)
    assert get_model_credit_cost(display_name) == credits
    if provider == "openrouter":
        assert info.base_url == "https://openrouter.ai/api/v1"
    else:
        assert info.base_url is None


@pytest.mark.parametrize("display_name,provider,model_id,credits", SPEC_LINEUP)
async def test_each_model_sends_its_model_id_to_its_provider(display_name, provider, model_id, credits):
    recorder = Recorder(reject_with_400)
    session = make_session(display_name, recorder)

    with pytest.raises(Exception):
        await send(session, stream=False)

    assert recorder.requests, "no request was sent"
    request, body = recorder.requests[0], recorder.bodies[0]
    host, path = EXPECTED_ENDPOINT[provider]
    assert request.url.host == host
    if provider == "google-gla":
        assert f"/models/{model_id}:" in request.url.path
    else:
        assert request.url.path == path
        assert body["model"] == model_id
    for param in SAMPLING_PARAMS:
        assert param not in body


@pytest.mark.parametrize(
    "name", [None, "", "GPT-3.5 Turbo", "Claude 4 Sonnet", "Gemini Pro 2.5", "o3", "claude-opus-5-5", "gpt-6.2-sol "]
)
def test_unknown_or_missing_model_raises(name):
    with pytest.raises(UnknownModelError):
        get_model_by_name(name)
    if name is not None:
        with pytest.raises(UnknownModelCostError):
            get_model_credit_cost(name)


async def test_chat_session_manager_has_no_default_model():
    manager = ChatSessionManager()
    for model in (None, "", "GPT-3.5 Turbo"):
        with pytest.raises(UnknownModelError):
            manager.get_or_create_session(project_id="p1", mode="edit", model=model, sse_queue=None)


def test_missing_provider_key_raises(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        make_session("Claude Opus 5.5", Recorder(reject_with_400))


# --- Claude 5.5 request settings -----------------------------------------------------------------------------------


@pytest.mark.parametrize("display_name", ["Claude Opus 5.5", "Claude Sonnet 5.5", "Claude Haiku 5.5"])
@pytest.mark.parametrize("stream", [False, True])
@pytest.mark.parametrize("with_tools", [False, True], ids=["no-tools", "edit-tools"])
async def test_claude_request_settings(display_name, stream, with_tools):
    recorder = Recorder(anthropic_sse(text_chunks=["Done."]))
    session = make_session(display_name, recorder, tools=EDIT_TOOLS if with_tools else None)

    # A per-call sampling setting must not reach the wire either.
    with pytest.warns(UserWarning, match="Sampling parameters"):
        assert await send(session, stream=stream, model_settings={"temperature": 0.2}) == "Done."

    (request,) = recorder.requests
    (body,) = recorder.bodies
    # No forced tool choice (a 400 on Opus/Sonnet 5.5).
    assert body.get("tool_choice", {"type": "auto"}).get("type") == "auto"
    if with_tools:
        assert {tool["name"] for tool in body["tools"]} >= {"adjust_volume", "change_bpm"}
    # No sampling parameters.
    for param in SAMPLING_PARAMS:
        assert param not in body
    # Thinking is never disabled and never given a budget (adaptive is the default when omitted).
    thinking = body.get("thinking")
    assert thinking is None or thinking == {"type": "adaptive"}
    assert "budget_tokens" not in json.dumps(body)
    # Explicit effort.
    assert body["output_config"]["effort"] == "high"
    # Server-side refusal fallback: Opus/Sonnet opt in, Haiku has none.
    betas = {b.strip() for b in request.headers.get("anthropic-beta", "").split(",") if b.strip()}
    if display_name in CLAUDE_WITH_FALLBACK:
        assert body["fallbacks"] == "default"
        assert "server-side-fallback-2026-07-01" in betas
    else:
        assert "fallbacks" not in body
        assert "server-side-fallback-2026-07-01" not in betas


# --- Refusals and fallbacks ----------------------------------------------------------------------------------------

REFUSAL_DETAILS = {"type": "refusal", "category": "cyber", "explanation": "This request was declined."}


@pytest.mark.parametrize("stream", [False, True])
@pytest.mark.parametrize("partial_text", [[], ["Here is the start of"]], ids=["before-output", "mid-stream"])
async def test_refusal_raises(stream, partial_text):
    recorder = Recorder(anthropic_sse(text_chunks=partial_text, stop_reason="refusal", stop_details=REFUSAL_DETAILS))
    session = make_session("Claude Opus 5.5", recorder)

    with pytest.raises(ModelRefusalError) as exc_info:
        await send(session, stream=stream)

    error = exc_info.value
    assert error.category == "cyber"
    assert "Claude Opus 5.5 declined this request" in str(error)
    assert "cyber" in str(error)
    # The declined (partial) text is never recorded as the assistant's answer.
    assert all(
        not (m.role == "assistant" and m.content == "".join(partial_text) and partial_text)
        for m in session.message_history.get_messages()
    )


async def test_refusal_without_details_still_raises():
    recorder = Recorder(anthropic_sse(text_chunks=[], stop_reason="refusal"))
    with pytest.raises(ModelRefusalError):
        await send(make_session("Claude Sonnet 5.5", recorder), stream=False)


@pytest.mark.parametrize("stream", [False, True])
async def test_server_side_fallback_response_is_used(stream):
    """A `fallback` block (the requested model declined, the fallback model answered) is not an error."""
    fallback_block = {
        "type": "fallback",
        "from": {"model": "claude-opus-5-5"},
        "to": {"model": "claude-opus-5"},
        "trigger": {"category": "cyber"},
    }
    recorder = Recorder(
        anthropic_sse(text_chunks=["Answer from ", "the fallback model."], leading_blocks=[fallback_block], model="claude-opus-5")
    )
    assert await send(make_session("Claude Opus 5.5", recorder), stream=stream) == "Answer from the fallback model."


async def test_music_agent_does_not_retry_a_refusal(monkeypatch):
    """`_focused_llm_call` retries malformed JSON, but a refusal is raised on the first attempt."""
    from pydantic import BaseModel

    from app2.llm.agents.music_agent import MusicGenerationAgent

    class Out(BaseModel):
        value: int

    recorder = Recorder(anthropic_sse(text_chunks=[], stop_reason="refusal", stop_details=REFUSAL_DETAILS))
    agent = MusicGenerationAgent.__new__(MusicGenerationAgent)
    with pytest.raises(ModelRefusalError):
        await agent._focused_llm_call("Return JSON", Out, chat_session=make_session("Claude Opus 5.5", recorder))
    assert len(recorder.requests) == 1
