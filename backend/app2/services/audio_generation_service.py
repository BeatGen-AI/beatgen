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
from app2.services.stability_ai_service import StabilityAIService, get_stability_ai_service

logger = get_service_logger("audio_generation_service")

# Type alias for audio generation services
AudioGenerationService = Union[FalAIService, VertexAIService, StabilityAIService]


def get_audio_generation_service(model: str = None) -> AudioGenerationService:
    """
    Get an audio generation service instance based on model or configuration.
    
    If model is provided, maps specific models to services:
    - 'stability/stable-audio-2' -> StabilityAIService
    - 'vertex-ai/lyria2' -> VertexAIService  
    - 'fal-ai/lyria2' -> FalAIService
    
    Otherwise uses the AUDIO_GENERATION_PROVIDER environment variable:
    - 'vertex' or 'vertex-ai' -> VertexAIService
    - 'fal' or 'fal-ai' -> FalAIService (default)
    - 'stability' or 'stability-ai' -> StabilityAIService
    
    Args:
        model: Optional model identifier to determine service
    
    Returns:
        An audio generation service instance
    """
    # Model-based service selection takes precedence
    if model:
        if model == 'stability/stable-audio-2':
            logger.info("Using Stability AI for audio generation (model-based)")
            return get_stability_ai_service()
        elif model == 'vertex-ai/lyria2':
            logger.info("Using Vertex AI for audio generation (model-based)")
            return get_vertex_ai_service()
        elif model == 'fal-ai/lyria2':
            logger.info("Using FAL-AI for audio generation (model-based)")
            return get_fal_ai_service()
        else:
            logger.warning(f"Unknown model '{model}', falling back to provider config")
    
    # Fallback to environment variable-based selection
    provider = os.getenv("AUDIO_GENERATION_PROVIDER", "fal").lower()
    
    if provider in ["vertex", "vertex-ai"]:
        logger.info("Using Vertex AI for audio generation")
        return get_vertex_ai_service()
    elif provider in ["fal", "fal-ai"]:
        logger.info("Using FAL-AI for audio generation")
        return get_fal_ai_service()
    elif provider in ["stability", "stability-ai"]:
        logger.info("Using Stability AI for audio generation")
        return get_stability_ai_service()
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


def get_stability_ai_service_compat() -> StabilityAIService:
    """Backwards compatibility wrapper for get_stability_ai_service"""
    return get_stability_ai_service()