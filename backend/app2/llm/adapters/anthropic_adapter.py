from typing import Any, Dict, Optional

import httpx2

from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.providers.anthropic import AnthropicProvider

from .base_adapter import ProviderAdapter


class AnthropicAdapter(ProviderAdapter):
    """Adapter for Anthropic (Claude) models.

    The Claude request settings (explicit effort, server-side refusal fallback opt-in) come from the lineup entry
    in `app2/llm/available_models.py`.
    """

    def _build_model(
        self, *, api_key: str, settings: Dict[str, Any], http_client: Optional[httpx2.AsyncClient]
    ) -> AnthropicModel:
        return AnthropicModel(
            self.model_info.model_name,
            provider=AnthropicProvider(api_key=api_key, http_client=http_client),
            settings=settings,
        )
