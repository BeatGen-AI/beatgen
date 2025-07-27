"""
DAW Integration API Routes.

This module provides specialized endpoints for DAW (Digital Audio Workstation)
integration, including context-aware search and batch operations.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any, Optional
from uuid import UUID
from pydantic import BaseModel, Field
import logging

from app2.api.dependencies import get_current_user_model
from app2.models.user import User
from app2.services.search_service import SearchService
from app2.core.exceptions import ServiceException, NotFoundException
from app2.repositories.project_repository import ProjectRepository
from app2.infrastructure.database.sqlmodel_client import get_async_session
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()


class MusicalContext(BaseModel):
    """Musical context for generating search queries"""
    genre: Optional[str] = Field(None, description="Musical genre (e.g., jazz, rock, electronic)")
    mood: Optional[str] = Field(None, description="Desired mood (e.g., dark, bright, mellow)")
    instrument_type: Optional[str] = Field(None, description="Type of instrument needed")
    style: Optional[str] = Field(None, description="Musical style (e.g., vintage, modern)")
    tempo: Optional[int] = Field(None, description="Tempo in BPM", ge=20, le=300)
    key: Optional[str] = Field(None, description="Musical key (e.g., C major, A minor)")
    time_signature: Optional[str] = Field(None, description="Time signature (e.g., 4/4, 3/4)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "genre": "jazz",
                "mood": "mellow",
                "instrument_type": "piano",
                "style": "vintage",
                "tempo": 120,
                "key": "C major",
                "time_signature": "4/4"
            }
        }


class DAWQueryRequest(BaseModel):
    """Request for DAW context-aware search"""
    context: MusicalContext
    search_type: str = Field("instrument", description="Type of search: instrument or drum_sample")
    top_k: int = Field(10, description="Number of results", ge=1, le=50)
    include_similar: bool = Field(False, description="Include similar items for each result")


class DAWQueryResponse(BaseModel):
    """Response from DAW query with generated search query and results"""
    generated_query: str
    search_type: str
    results: List[Dict[str, Any]]
    fallback_used: bool = False
    context: MusicalContext


class BatchInstrumentRequest(BaseModel):
    """Request for batch instrument retrieval"""
    instrument_ids: List[UUID] = Field(..., description="List of instrument IDs", max_items=100)
    include_metadata: bool = Field(True, description="Include full metadata")


class ProjectExportRequest(BaseModel):
    """Request for project export"""
    format: str = Field("json", description="Export format: json, midi, or daw_specific")
    include_audio: bool = Field(False, description="Include audio file references")
    daw_format: Optional[str] = Field(None, description="Specific DAW format (e.g., ableton, logic)")


@router.post("/query", response_model=DAWQueryResponse)
async def daw_context_search(
    request: DAWQueryRequest,
    current_user: User = Depends(get_current_user_model),
) -> DAWQueryResponse:
    """
    Perform a context-aware search based on musical parameters.
    
    This endpoint converts musical context (genre, mood, tempo, etc.) into
    an appropriate search query and returns relevant instruments or drum samples.
    """
    try:
        search_service = SearchService()
        
        # Generate query from musical context
        generated_query = await search_service.generate_query_from_context(
            request.context.model_dump()
        )
        
        # Perform search based on type
        if request.search_type == "instrument":
            results = await search_service.search_instruments(
                query=generated_query,
                top_k=request.top_k
            )
            
            # Convert results to dict format
            search_results = [
                {
                    "id": r.instrument_id,
                    "name": r.name,
                    "category": r.category,
                    "description": r.description,
                    "file_format": r.file_format,
                    "storage_key": r.storage_key,
                    "similarity_score": r.similarity_score,
                    "rank": r.rank,
                    "tags": r.tags
                }
                for r in results
            ]
            
        elif request.search_type == "drum_sample":
            results = await search_service.search_drum_samples(
                query=generated_query,
                top_k=request.top_k
            )
            
            # Convert results to dict format
            search_results = [
                {
                    "id": r.sample_id,
                    "name": r.name,
                    "category": r.category,
                    "description": r.description,
                    "file_format": r.file_format,
                    "storage_key": r.storage_key,
                    "similarity_score": r.similarity_score,
                    "rank": r.rank,
                    "tags": r.tags
                }
                for r in results
            ]
            
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid search_type: {request.search_type}"
            )
        
        # If requested, find similar items for each result
        if request.include_similar and request.search_type == "instrument":
            for result in search_results[:3]:  # Limit to top 3 to avoid too many queries
                try:
                    similar = await search_service.find_similar_instruments(
                        instrument_id=result["id"],
                        top_k=3
                    )
                    result["similar"] = [
                        {
                            "id": s.instrument_id,
                            "name": s.name,
                            "similarity_score": s.similarity_score
                        }
                        for s in similar
                    ]
                except Exception:
                    result["similar"] = []
        
        return DAWQueryResponse(
            generated_query=generated_query,
            search_type=request.search_type,
            results=search_results,
            fallback_used=False,
            context=request.context
        )
        
    except ServiceException as e:
        logger.error(f"Service error in DAW context search: {str(e)}")
        
        # Fallback to basic search
        fallback_query = request.context.instrument_type or "instrument"
        
        try:
            if request.search_type == "instrument":
                results = await search_service.search_instruments(
                    query=fallback_query,
                    top_k=request.top_k
                )
                search_results = [
                    {
                        "id": r.instrument_id,
                        "name": r.name,
                        "category": r.category,
                        "description": r.description,
                        "file_format": r.file_format,
                        "storage_key": r.storage_key,
                        "similarity_score": r.similarity_score,
                        "rank": r.rank,
                        "tags": r.tags
                    }
                    for r in results
                ]
            else:
                search_results = []
            
            return DAWQueryResponse(
                generated_query=fallback_query,
                search_type=request.search_type,
                results=search_results,
                fallback_used=True,
                context=request.context
            )
            
        except Exception:
            raise HTTPException(status_code=500, detail="Search failed with fallback")


@router.post("/instruments/batch")
async def get_instruments_batch(
    request: BatchInstrumentRequest,
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    Retrieve multiple instruments in a single request.
    
    This endpoint is optimized for DAWs that need to fetch metadata
    for multiple instruments at once.
    """
    try:
        # Import here to avoid circular imports
        from app2.models.public_models.instrument_file import InstrumentFile
        from sqlmodel import select
        
        results = {}
        not_found = []
        
        for instrument_id in request.instrument_ids:
            try:
                # Query instrument directly
                statement = select(InstrumentFile).where(InstrumentFile.id == instrument_id)
                result = await session.exec(statement)
                instrument = result.first()
                if instrument:
                    if request.include_metadata:
                        results[str(instrument_id)] = {
                            "id": str(instrument.id),
                            "name": instrument.name,
                            "category": instrument.category,
                            "description": instrument.description_generated,
                            "file_format": instrument.file_format,
                            "storage_key": instrument.storage_key,
                            "tags": instrument.tags,
                            "file_size": instrument.file_size,
                            "sample_rate": instrument.sample_rate,
                            "created_at": instrument.created_at.isoformat() if instrument.created_at else None
                        }
                    else:
                        results[str(instrument_id)] = {
                            "id": str(instrument.id),
                            "name": instrument.name,
                            "storage_key": instrument.storage_key
                        }
                else:
                    not_found.append(str(instrument_id))
            except Exception as e:
                logger.error(f"Error fetching instrument {instrument_id}: {str(e)}")
                not_found.append(str(instrument_id))
        
        return {
            "instruments": results,
            "not_found": not_found,
            "total_requested": len(request.instrument_ids),
            "total_found": len(results)
        }
        
    except Exception as e:
        logger.error(f"Error in batch instrument retrieval: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/projects/{project_id}/export")
async def export_project_for_daw(
    project_id: UUID,
    request: ProjectExportRequest,
    current_user: User = Depends(get_current_user_model),
    session: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    Export a project in a format suitable for DAW import.
    
    This endpoint prepares project data for import into various DAWs,
    including track information, MIDI data, and audio references.
    """
    try:
        project_repo = ProjectRepository(session)
        
        # Get the project
        project = await project_repo.get_user_project(project_id, current_user.id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Basic export structure
        export_data = {
            "project_id": str(project.id),
            "name": project.name,
            "bpm": project.bpm,
            "time_signature": {
                "numerator": project.time_signature_numerator,
                "denominator": project.time_signature_denominator
            },
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
            "tracks": []
        }
        
        # Add track information
        if hasattr(project, 'tracks') and project.tracks:
            for track in project.tracks:
                track_data = {
                    "id": str(track.id),
                    "name": track.name,
                    "type": track.track_type,
                    "order": track.order,
                    "volume": track.volume,
                    "pan": track.pan,
                    "muted": track.muted,
                    "solo": track.solo
                }
                
                # Add type-specific data
                if track.track_type == "audio" and track.audio_track:
                    track_data["audio"] = {
                        "storage_key": track.audio_track.audio_file_storage_key,
                        "duration": track.audio_track.duration,
                        "sample_rate": track.audio_track.sample_rate
                    }
                elif track.track_type == "midi" and track.midi_track:
                    track_data["midi"] = {
                        "storage_key": track.midi_track.midi_file_storage_key,
                        "instrument_id": str(track.midi_track.instrument_id) if track.midi_track.instrument_id else None
                    }
                elif track.track_type == "sampler" and track.sampler_track:
                    track_data["sampler"] = {
                        "instrument_id": str(track.sampler_track.instrument_id) if track.sampler_track.instrument_id else None
                    }
                elif track.track_type == "drum" and track.drum_track:
                    track_data["drum"] = {
                        "pattern": track.drum_track.pattern
                    }
                
                export_data["tracks"].append(track_data)
        
        # Format-specific processing
        if request.format == "midi":
            # Future: Convert to MIDI format
            export_data["format"] = "midi"
            export_data["note"] = "MIDI export not yet implemented"
            
        elif request.format == "daw_specific" and request.daw_format:
            # Future: Add DAW-specific formatting
            export_data["format"] = request.daw_format
            export_data["note"] = f"{request.daw_format} format not yet implemented"
            
        else:
            export_data["format"] = "json"
        
        # If audio references requested, add signed URLs
        if request.include_audio:
            # Future: Generate signed URLs for audio files
            export_data["audio_urls"] = {}
            export_data["note"] = "Audio URL generation not yet implemented"
        
        return {
            "export": export_data,
            "status": "success",
            "message": f"Project exported in {request.format} format"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/health")
async def daw_integration_health() -> Dict[str, Any]:
    """
    Health check for DAW integration endpoints.
    
    Verifies that search services and dependencies are working correctly.
    """
    try:
        search_service = SearchService()
        stats = await search_service.get_search_statistics()
        
        return {
            "status": "healthy",
            "search_index": {
                "instruments": stats.get("total_instruments", 0),
                "instruments_with_embeddings": stats.get("total_with_embeddings", 0),
                "drum_samples": stats.get("drum_samples", {}).get("total", 0)
            },
            "services": {
                "search": "operational",
                "export": "operational"
            }
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "degraded",
            "error": str(e),
            "services": {
                "search": "error",
                "export": "unknown"
            }
        }