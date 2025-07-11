"""
Audio Description API Routes

This module provides API endpoints for generating audio descriptions
using CLAP models.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Dict, Any, Optional, TYPE_CHECKING
import logging
from datetime import datetime, timezone

from app2.infrastructure.database.sqlmodel_client import get_async_session
from app2.repositories.audio_track_repository import AudioTrackRepository
from app2.api.dependencies import get_current_user
from app2.models.user import User
from app2.models.track_models.audio_track import AudioTrackUpdate

if TYPE_CHECKING:
    from audio_ml.audio_description_service import AudioDescriptionService

logger = logging.getLogger(__name__)

router = APIRouter()

# Global service instance (can be optimized with dependency injection)
_audio_description_service: Optional["AudioDescriptionService"] = None


def get_audio_description_service() -> Optional["AudioDescriptionService"]:
    """Get or create the audio description service instance."""
    global _audio_description_service
    if _audio_description_service is None:
        try:
            from audio_ml.audio_description_service import AudioDescriptionService
            _audio_description_service = AudioDescriptionService()
        except ImportError as e:
            logger.error(f"Failed to import AudioDescriptionService: {e}")
            return None
    return _audio_description_service


@router.post("/audio-tracks/{audio_track_id}/generate-description")
async def generate_audio_description(
    audio_track_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    Generate an audio description for a specific audio track.
    
    This endpoint generates a description using CLAP models and stores it
    in the database. The generation happens in the background.
    """
    try:
        # Get the audio track
        audio_track_repo = AudioTrackRepository(session)
        audio_track = await audio_track_repo.get(audio_track_id)
        
        if not audio_track:
            raise HTTPException(status_code=404, detail="Audio track not found")
        
        # Check if user owns the audio track
        if audio_track.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this audio track")
        
        # Check if description already exists
        if audio_track.description:
            return {
                "message": "Description already exists",
                "description": audio_track.description,
                "confidence": audio_track.description_confidence,
                "model": audio_track.description_model,
                "generated_at": audio_track.description_generated_at,
                "regenerated": False
            }
        
        # Start background task to generate description
        background_tasks.add_task(
            _generate_and_store_description,
            audio_track_id,
            str(audio_track.audio_file_storage_key)
        )
        
        return {
            "message": "Description generation started",
            "audio_track_id": str(audio_track_id),
            "status": "processing"
        }
        
    except Exception as e:
        logger.error(f"Error in generate_audio_description: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/audio-tracks/{audio_track_id}/regenerate-description")
async def regenerate_audio_description(
    audio_track_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    Regenerate an audio description for a specific audio track.
    
    This endpoint forces regeneration of the description even if one already exists.
    """
    try:
        # Get the audio track
        audio_track_repo = AudioTrackRepository(session)
        audio_track = await audio_track_repo.get(audio_track_id)
        
        if not audio_track:
            raise HTTPException(status_code=404, detail="Audio track not found")
        
        # Check if user owns the audio track
        if audio_track.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this audio track")
        
        # Start background task to regenerate description
        background_tasks.add_task(
            _generate_and_store_description,
            audio_track_id,
            str(audio_track.audio_file_storage_key),
            force_regenerate=True
        )
        
        return {
            "message": "Description regeneration started",
            "audio_track_id": str(audio_track_id),
            "status": "processing"
        }
        
    except Exception as e:
        logger.error(f"Error in regenerate_audio_description: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/audio-tracks/{audio_track_id}/description")
async def get_audio_description(
    audio_track_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    Get the audio description for a specific audio track.
    """
    try:
        # Get the audio track
        audio_track_repo = AudioTrackRepository(session)
        audio_track = await audio_track_repo.get(audio_track_id)
        
        if not audio_track:
            raise HTTPException(status_code=404, detail="Audio track not found")
        
        # Check if user owns the audio track
        if audio_track.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this audio track")
        
        if not audio_track.description:
            return {
                "message": "No description available",
                "audio_track_id": str(audio_track_id),
                "has_description": False
            }
        
        return {
            "audio_track_id": str(audio_track_id),
            "description": audio_track.description,
            "confidence": audio_track.description_confidence,
            "model": audio_track.description_model,
            "generated_at": audio_track.description_generated_at,
            "candidates": audio_track.description_candidates,
            "has_description": True
        }
        
    except Exception as e:
        logger.error(f"Error in get_audio_description: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/audio-tracks/{audio_track_id}/description")
async def delete_audio_description(
    audio_track_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    Delete the audio description for a specific audio track.
    """
    try:
        # Get the audio track
        audio_track_repo = AudioTrackRepository(session)
        audio_track = await audio_track_repo.get(audio_track_id)
        
        if not audio_track:
            raise HTTPException(status_code=404, detail="Audio track not found")
        
        # Check if user owns the audio track
        if audio_track.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this audio track")
        
        # Clear description fields
        update_data = AudioTrackUpdate(
            description=None,
            description_confidence=None,
            description_model=None,
            description_candidates=None,
            description_embedding=None,
            description_generated_at=None
        )
        
        await audio_track_repo.update(audio_track_id, update_data)
        
        return {
            "message": "Description deleted successfully",
            "audio_track_id": str(audio_track_id)
        }
        
    except Exception as e:
        logger.error(f"Error in delete_audio_description: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


async def _generate_and_store_description(
    audio_track_id: UUID,
    audio_file_storage_key: str,
    force_regenerate: bool = False
) -> None:
    """
    Background task to generate and store audio description.
    
    This function runs in the background and updates the database
    with the generated description.
    """
    import os
    
    try:
        # Get the audio description service
        service = get_audio_description_service()
        if service is None:
            logger.error("Audio description service not available")
            return
        
        # Log if this is a regeneration request
        if force_regenerate:
            logger.info(f"Force regenerating description for audio track {audio_track_id}")
        
        # For now, we'll use a placeholder path since we need to implement
        # the actual file retrieval from storage
        # TODO: Implement actual file retrieval from Supabase storage
        audio_file_path = f"/tmp/{audio_file_storage_key}"
        
        # Check if the file exists (placeholder implementation)
        if not os.path.exists(audio_file_path):
            logger.warning(f"Audio file not found at {audio_file_path}")
            # In a real implementation, we would download from Supabase storage
            return
        
        # Generate description
        result = service.generate_description(audio_file_path)
        
        if result:
            # Store the description in the database
            async with get_async_session() as session:
                audio_track_repo = AudioTrackRepository(session)
                
                # Prepare update data
                update_data = AudioTrackUpdate(
                    description=result.best_description,
                    description_confidence=result.confidence_score,
                    description_model=result.model_used,
                    description_candidates=[
                        {
                            "text": desc["text"],
                            "confidence": desc["confidence"],
                            "rank": desc["rank"]
                        }
                        for desc in result.descriptions[:10]  # Store top 10
                    ],
                    description_embedding=result.embedding.tolist() if result.embedding is not None else None,
                    description_generated_at=datetime.now(timezone.utc).isoformat()
                )
                
                # Update using repository's async method (which is actually sync internally)
                await audio_track_repo.update(audio_track_id, update_data.model_dump(exclude_none=True))
                
                logger.info(f"Generated and stored description for audio track {audio_track_id}: '{result.best_description}'")
        else:
            logger.error(f"Failed to generate description for audio track {audio_track_id}")
            
    except Exception as e:
        logger.error(f"Error in background description generation for {audio_track_id}: {e}")


@router.get("/audio-descriptions/models")
async def get_available_models() -> Dict[str, Any]:
    """
    Get information about available audio description models.
    """
    try:
        service = get_audio_description_service()
        model_info = service.get_model_info()
        
        return {
            "available_models": [
                {
                    "name": "laion/clap-htsat-unfused",
                    "description": "CLAP model with HTSAT encoder (unfused)",
                    "recommended": True
                },
                {
                    "name": "laion/clap-htsat-fused",
                    "description": "CLAP model with HTSAT encoder (fused)",
                    "recommended": False
                }
            ],
            "current_model": model_info["model_name"],
            "device": model_info["device"],
            "is_initialized": model_info["is_initialized"]
        }
        
    except Exception as e:
        logger.error(f"Error in get_available_models: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")