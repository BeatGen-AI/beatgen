"""
Search API Routes for instrument and drum sample discovery.

This module provides RESTful endpoints for searching instruments and drum samples
using text-based queries and similarity search.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
from uuid import UUID
import logging

from app2.api.dependencies import get_current_user
from app2.models.user import User
from app2.services.search_service import SearchService
from app2.core.exceptions import ServiceException, NotFoundException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


class InstrumentSearchResult(BaseModel):
    """Search result for an instrument"""
    instrument_id: str = Field(description="Unique identifier for the instrument")
    name: str = Field(description="Name of the instrument")
    category: str = Field(description="Category of the instrument")
    description: str = Field(description="Generated description of the instrument")
    file_format: str = Field(description="File format (e.g., sf2, sfz)")
    storage_key: str = Field(description="Storage key for the instrument file")
    similarity_score: float = Field(description="Similarity score (0-1)")
    rank: int = Field(description="Rank in search results")
    tags: Optional[List[str]] = Field(default=None, description="Associated tags")


class DrumSampleSearchResult(BaseModel):
    """Search result for a drum sample"""
    sample_id: str = Field(description="Unique identifier for the drum sample")
    name: str = Field(description="Name of the drum sample")
    category: str = Field(description="Category of the drum sample")
    description: str = Field(description="Description of the drum sample")
    file_format: str = Field(description="File format (e.g., wav, flac)")
    storage_key: str = Field(description="Storage key for the sample file")
    similarity_score: float = Field(description="Similarity score (0-1)")
    rank: int = Field(description="Rank in search results")
    tags: Optional[List[str]] = Field(default=None, description="Associated tags")


class SearchStatistics(BaseModel):
    """Statistics about the search index"""
    total_instruments: int
    total_with_embeddings: int
    categories: Dict[str, int]
    cache_status: Dict[str, Any]
    embedding_stats: Optional[Dict[str, Any]] = None


@router.get("/instruments", response_model=List[InstrumentSearchResult])
async def search_instruments(
    query: str = Query(..., description="Search query text", min_length=1),
    top_k: int = Query(10, description="Number of results to return", ge=1, le=100),
    similarity_threshold: float = Query(0.0, description="Minimum similarity score", ge=0.0, le=1.0),
    category: Optional[str] = Query(None, description="Filter by category"),
    format: Optional[str] = Query(None, description="Filter by file format"),
    current_user: User = Depends(get_current_user),
) -> List[InstrumentSearchResult]:
    """
    Search for instruments using natural language queries.
    
    This endpoint uses semantic search to find instruments that match the query.
    Results are ranked by similarity to the search query.
    
    Example queries:
    - "warm analog bass"
    - "bright piano sound"
    - "vintage electric piano"
    - "punchy kick drum"
    """
    try:
        search_service = SearchService()
        
        results = await search_service.search_instruments(
            query=query,
            top_k=top_k,
            similarity_threshold=similarity_threshold,
            category_filter=category,
            format_filter=format
        )
        
        return [
            InstrumentSearchResult(
                instrument_id=result.instrument_id,
                name=result.name,
                category=result.category,
                description=result.description,
                file_format=result.file_format,
                storage_key=result.storage_key,
                similarity_score=result.similarity_score,
                rank=result.rank,
                tags=result.tags
            )
            for result in results
        ]
        
    except ServiceException as e:
        logger.error(f"Service error in instrument search: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in instrument search: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/instruments/{instrument_id}/similar", response_model=List[InstrumentSearchResult])
async def find_similar_instruments(
    instrument_id: UUID,
    top_k: int = Query(10, description="Number of results to return", ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> List[InstrumentSearchResult]:
    """
    Find instruments similar to a given instrument.
    
    This endpoint uses the embedding of the specified instrument to find
    other instruments with similar characteristics.
    """
    try:
        search_service = SearchService()
        
        results = await search_service.find_similar_instruments(
            instrument_id=str(instrument_id),
            top_k=top_k
        )
        
        return [
            InstrumentSearchResult(
                instrument_id=result.instrument_id,
                name=result.name,
                category=result.category,
                description=result.description,
                file_format=result.file_format,
                storage_key=result.storage_key,
                similarity_score=result.similarity_score,
                rank=result.rank,
                tags=result.tags
            )
            for result in results
        ]
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ServiceException as e:
        logger.error(f"Service error in similar instrument search: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in similar instrument search: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/drum-samples", response_model=List[DrumSampleSearchResult])
async def search_drum_samples(
    query: str = Query(..., description="Search query text", min_length=1),
    top_k: int = Query(10, description="Number of results to return", ge=1, le=100),
    similarity_threshold: float = Query(0.0, description="Minimum similarity score", ge=0.0, le=1.0),
    category: Optional[str] = Query(None, description="Filter by category"),
    current_user: User = Depends(get_current_user),
) -> List[DrumSampleSearchResult]:
    """
    Search for drum samples using natural language queries.
    
    This endpoint uses semantic search to find drum samples that match the query.
    Results are ranked by similarity to the search query.
    
    Example queries:
    - "punchy kick drum"
    - "crispy snare"
    - "808 bass"
    - "vintage drum machine"
    """
    try:
        search_service = SearchService()
        
        results = await search_service.search_drum_samples(
            query=query,
            top_k=top_k,
            similarity_threshold=similarity_threshold,
            category_filter=category
        )
        
        return [
            DrumSampleSearchResult(
                sample_id=result.sample_id,
                name=result.name,
                category=result.category,
                description=result.description,
                file_format=result.file_format,
                storage_key=result.storage_key,
                similarity_score=result.similarity_score,
                rank=result.rank,
                tags=result.tags
            )
            for result in results
        ]
        
    except ServiceException as e:
        logger.error(f"Service error in drum sample search: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in drum sample search: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/statistics", response_model=SearchStatistics)
async def get_search_statistics(
    current_user: User = Depends(get_current_user),
) -> SearchStatistics:
    """
    Get statistics about the search index.
    
    Returns information about indexed instruments, categories, and cache status.
    """
    try:
        search_service = SearchService()
        stats = await search_service.get_search_statistics()
        
        return SearchStatistics(
            total_instruments=stats["total_instruments"],
            total_with_embeddings=stats["total_with_embeddings"],
            categories=stats["categories"],
            cache_status=stats["cache_status"],
            embedding_stats=stats.get("embedding_stats")
        )
        
    except Exception as e:
        logger.error(f"Error getting search statistics: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/cache/clear")
async def clear_search_cache(
    current_user: User = Depends(get_current_user),
) -> Dict[str, str]:
    """
    Clear the search cache.
    
    This endpoint clears all cached embeddings and query results.
    Use with caution as it will force regeneration of the search index.
    """
    try:
        search_service = SearchService()
        await search_service.clear_cache()
        
        return {"message": "Search cache cleared successfully"}
        
    except Exception as e:
        logger.error(f"Error clearing search cache: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")