from typing import Any, Dict, Optional

import httpx2

from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider

from .base_adapter import ProviderAdapter


class OpenAIAdapter(ProviderAdapter):
    """Adapter for OpenAI models (Responses API, pydantic-ai's default for OpenAI)."""

    def _build_model(
        self, *, api_key: str, settings: Dict[str, Any], http_client: Optional[httpx2.AsyncClient]
    ) -> Model:
        if self.model_info.base_url is not None:
            raise ValueError(
                f"{self.model_info.display_name}: a custom base_url is not supported for provider 'openai'"
            )
        return OpenAIResponsesModel(
            self.model_info.model_name,
            provider=OpenAIProvider(api_key=api_key, http_client=http_client),
            settings=settings,
        )


class OpenRouterAdapter(ProviderAdapter):
    """Adapter for models served through OpenRouter's OpenAI-compatible API."""

    def _build_model(
        self, *, api_key: str, settings: Dict[str, Any], http_client: Optional[httpx2.AsyncClient]
    ) -> Model:
        if not self.model_info.base_url:
            raise ValueError(f"{self.model_info.display_name}: OpenRouter models need a base_url")
        return OpenRouterModel(
            self.model_info.model_name,
            provider=OpenRouterProvider(api_key=api_key, base_url=self.model_info.base_url, http_client=http_client),
            settings=settings,
        )
