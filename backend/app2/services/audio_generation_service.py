"""
Audio Generation Service Factory

This module provides a unified interface for audio generation services,
allowing easy switching between different providers (FAL-AI, Vertex AI, etc.)
"""

import os
from typing import Union
from app2.core.logging import get_service_logger
from app2.services.fal_ai_service import FalAIService, get_fal_ai_service
from app2.services.vertex_ai_service import VertexAIService, get_vertex_ai_service

logger = get_service_logger("audio_generation_service")

# Type alias for audio generation services
AudioGenerationService = Union[FalAIService, VertexAIService]


def get_audio_generation_service() -> AudioGenerationService:
    """
    Get an audio generation service instance based on configuration.
    
    Uses the AUDIO_GENERATION_PROVIDER environment variable to determine
    which service to return:
    - 'vertex' or 'vertex-ai' -> VertexAIService
    - 'fal' or 'fal-ai' -> FalAIService (default)
    
    Returns:
        An audio generation service instance
    """
    provider = os.getenv("AUDIO_GENERATION_PROVIDER", "fal").lower()
    
    if provider in ["vertex", "vertex-ai"]:
        logger.info("Using Vertex AI for audio generation")
        return get_vertex_ai_service()
    elif provider in ["fal", "fal-ai"]:
        logger.info("Using FAL-AI for audio generation")
        return get_fal_ai_service()
    else:
        logger.warning(f"Unknown audio generation provider '{provider}', defaulting to FAL-AI")
        return get_fal_ai_service()


# Backwards compatibility aliases
def get_fal_ai_service_compat() -> FalAIService:
    """Backwards compatibility wrapper for get_fal_ai_service"""
    return get_fal_ai_service()


def get_vertex_ai_service_compat() -> VertexAIService:
    """Backwards compatibility wrapper for get_vertex_ai_service"""
    return get_vertex_ai_service()