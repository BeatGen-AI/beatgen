from typing import Any, Dict, Optional

import httpx2

from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider

from .base_adapter import ProviderAdapter


class GeminiAdapter(ProviderAdapter):
    """Adapter for Google Gemini models on the Gemini API (provider name `google-gla`)."""

    def _build_model(
        self, *, api_key: str, settings: Dict[str, Any], http_client: Optional[httpx2.AsyncClient]
    ) -> GoogleModel:
        if self.model_info.provider_name != "google-gla":
            raise ValueError(
                f"{self.model_info.display_name}: GeminiAdapter supports provider 'google-gla', "
                f"not {self.model_info.provider_name!r}"
            )
        return GoogleModel(
            self.model_info.model_name,
            provider=GoogleProvider(api_key=api_key, http_client=http_client),
            settings=settings,
        )
