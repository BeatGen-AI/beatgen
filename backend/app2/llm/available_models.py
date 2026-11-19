"""The assistant's LLM lineup.

The frontend sends a model's *display name* as the wire value (`model` / `chatModel`). The backend maps it to a
provider and model ID here, and charges `MODEL_COSTS[display name]` credits (`app2/constants/credits.py`).
The lineup, its order (the UI order) and the credit costs are a shared contract with the frontend, recorded in
`.scratch/app-refresh/spec.md` ("Contract: assistant model lineup").

There is no default model: a missing or unknown display name raises `UnknownModelError`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Literal, Mapping, Optional

ProviderName = Literal["anthropic", "openai", "google-gla", "openrouter"]

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Opt-in to Anthropic's server-side refusal fallbacks: when the requested model's safety classifiers decline,
# the API re-runs the same request on the model Anthropic recommends for that refusal category, inside the same
# call. Supported on Claude Opus 5.5 and Claude Sonnet 5.5; Claude Haiku 5.5 has no server-side fallback.
ANTHROPIC_SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01"

# Effort for every Claude request. Claude Opus 5.5 and Haiku 5.5 default to `medium` and Sonnet 5.5 to `high`,
# so it is always sent explicitly. `high` suits the music agent's structured composition steps.
ANTHROPIC_EFFORT = "high"


class UnknownModelError(ValueError):
    """Raised for a missing model name or one that is not in the lineup."""


@dataclass(frozen=True)
class ModelInfo:
    provider_name: ProviderName
    display_name: str
    model_name: str
    api_key_env_var: str  # The environment variable holding the key; the key itself is read only when needed.
    base_url: Optional[str] = None
    # pydantic-ai `ModelSettings` sent with every request to this model.
    model_settings: Mapping[str, Any] = field(default_factory=lambda: MappingProxyType({}))

    def get_api_key(self) -> str:
        """Retrieve the API key only when needed."""
        key = os.getenv(self.api_key_env_var)
        if not key:
            raise ValueError(f"Missing API key: {self.api_key_env_var} not found in environment")
        return key


def _claude_settings(*, server_side_fallback: bool) -> Mapping[str, Any]:
    """Request settings for the Claude 5.5 models.

    Sent: an explicit `output_config.effort`, and (Opus/Sonnet) the server-side fallback opt-in.
    Never sent: `temperature`/`top_p`/`top_k` (400 on these models and on API version 2026-10-21),
    `thinking: {type: "disabled"}` or `budget_tokens` (400), and a forced `tool_choice` (400 on Opus/Sonnet 5.5).
    pydantic-ai leaves `thinking` unset (adaptive) unless asked, and its Claude 5.5 profiles drop sampling settings
    and never force `tool_choice`; `tests/llm/test_provider_requests.py` asserts the outgoing JSON.
    """
    settings: dict[str, Any] = {"anthropic_effort": ANTHROPIC_EFFORT}
    if server_side_fallback:
        settings["anthropic_betas"] = [ANTHROPIC_SERVER_SIDE_FALLBACK_BETA]
        settings["extra_body"] = {"fallbacks": "default"}
    return MappingProxyType(settings)


GOOGLE_GEMINI_4_CARBON = ModelInfo(
    provider_name="google-gla",
    display_name="Gemini 4 Carbon",
    model_name="gemini-4-carbon",
    api_key_env_var="GEMINI_API_KEY",
)

GOOGLE_GEMINI_3_8_FLASH = ModelInfo(
    provider_name="google-gla",
    display_name="Gemini 3.8 Flash",
    model_name="gemini-3.8-flash",
    api_key_env_var="GEMINI_API_KEY",
)

OPENROUTER_DEEPSEEK_V4_PRO = ModelInfo(
    provider_name="openrouter",
    display_name="DeepSeek V4 Pro",
    model_name="deepseek/deepseek-v4-pro",
    api_key_env_var="OPENROUTER_API_KEY",
    base_url=OPENROUTER_BASE_URL,
)

OPENROUTER_DEEPSEEK_V4_1_FLASH = ModelInfo(
    provider_name="openrouter",
    display_name="DeepSeek V4.1 Flash",
    model_name="deepseek/deepseek-v4.1-flash",
    api_key_env_var="OPENROUTER_API_KEY",
    base_url=OPENROUTER_BASE_URL,
)

ANTHROPIC_CLAUDE_SONNET_5_5 = ModelInfo(
    provider_name="anthropic",
    display_name="Claude Sonnet 5.5",
    model_name="claude-sonnet-5-5",
    api_key_env_var="ANTHROPIC_API_KEY",
    model_settings=_claude_settings(server_side_fallback=True),
)

ANTHROPIC_CLAUDE_OPUS_5_5 = ModelInfo(
    provider_name="anthropic",
    display_name="Claude Opus 5.5",
    model_name="claude-opus-5-5",
    api_key_env_var="ANTHROPIC_API_KEY",
    model_settings=_claude_settings(server_side_fallback=True),
)

ANTHROPIC_CLAUDE_HAIKU_5_5 = ModelInfo(
    provider_name="anthropic",
    display_name="Claude Haiku 5.5",
    model_name="claude-haiku-5-5",
    api_key_env_var="ANTHROPIC_API_KEY",
    # Haiku 5.5 has no server-side fallback: `fallbacks: "default"` would leave a refusal declined.
    model_settings=_claude_settings(server_side_fallback=False),
)

OPENAI_GPT_6_2_SOL = ModelInfo(
    provider_name="openai",
    display_name="GPT-6.2 Sol",
    model_name="gpt-6.2-sol",
    api_key_env_var="OPENAI_API_KEY",
)

OPENAI_GPT_6_1_TERRA = ModelInfo(
    provider_name="openai",
    display_name="GPT-6.1 Terra",
    model_name="gpt-6.1-terra",
    api_key_env_var="OPENAI_API_KEY",
)

OPENAI_GPT_6_2_ASTRA = ModelInfo(
    provider_name="openai",
    display_name="GPT-6.2 Astra",
    model_name="gpt-6.2-astra",
    api_key_env_var="OPENAI_API_KEY",
)

OPENAI_GPT_6_LUNA = ModelInfo(
    provider_name="openai",
    display_name="GPT-6 Luna",
    model_name="gpt-6-luna",
    api_key_env_var="OPENAI_API_KEY",
)

OPENROUTER_LLAMA_4_MAVERICK = ModelInfo(
    provider_name="openrouter",
    display_name="Llama 4 Maverick",
    model_name="meta-llama/llama-4-maverick",
    api_key_env_var="OPENROUTER_API_KEY",
    base_url=OPENROUTER_BASE_URL,
)

OPENROUTER_LLAMA_4_SCOUT = ModelInfo(
    provider_name="openrouter",
    display_name="Llama 4 Scout",
    model_name="meta-llama/llama-4-scout",
    api_key_env_var="OPENROUTER_API_KEY",
    base_url=OPENROUTER_BASE_URL,
)

# The lineup in UI order (the first entry is the chat window's default on the frontend).
ALL_MODELS: tuple[ModelInfo, ...] = (
    GOOGLE_GEMINI_4_CARBON,
    GOOGLE_GEMINI_3_8_FLASH,
    OPENROUTER_DEEPSEEK_V4_PRO,
    OPENROUTER_DEEPSEEK_V4_1_FLASH,
    ANTHROPIC_CLAUDE_SONNET_5_5,
    ANTHROPIC_CLAUDE_OPUS_5_5,
    ANTHROPIC_CLAUDE_HAIKU_5_5,
    OPENAI_GPT_6_2_SOL,
    OPENAI_GPT_6_1_TERRA,
    OPENAI_GPT_6_2_ASTRA,
    OPENAI_GPT_6_LUNA,
    OPENROUTER_LLAMA_4_MAVERICK,
    OPENROUTER_LLAMA_4_SCOUT,
)

MODELS_BY_DISPLAY_NAME: Mapping[str, ModelInfo] = MappingProxyType({m.display_name: m for m in ALL_MODELS})
if len(MODELS_BY_DISPLAY_NAME) != len(ALL_MODELS):
    raise RuntimeError("Duplicate display name in the model lineup")


def get_model_by_name(display_name: Optional[str]) -> ModelInfo:
    """Return the lineup entry for a display name (the wire value the frontend sends).

    Raises `UnknownModelError` for a missing name or one not in the lineup; there is no default model.
    """
    if not display_name:
        raise UnknownModelError(
            f"No model specified. Choose one of: {', '.join(MODELS_BY_DISPLAY_NAME)}"
        )
    try:
        return MODELS_BY_DISPLAY_NAME[display_name]
    except KeyError:
        raise UnknownModelError(
            f"Model not found: {display_name!r}. Choose one of: {', '.join(MODELS_BY_DISPLAY_NAME)}"
        ) from None
