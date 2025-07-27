"""
Search Service wrapper for instrument and drum sample search functionality.

This service provides a clean interface to the existing search infrastructure
while adding request validation, error handling, and caching.
"""

import os
import sys
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import asyncio
from dataclasses import dataclass
import logging

# Add the backend directory to the Python path for script imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app2.core.logging import get_service_logger
from app2.core.exceptions import ServiceException, NotFoundException
from scripts.search.instrument_search_service import InstrumentSearchService, InstrumentSearchResult
from scripts.search.cosine_similarity_search import SearchResult
from sqlmodel import Session, select
from app2.infrastructure.database.sqlmodel_client import get_session
from app2.models.public_models.drum_samples import DrumSamplePublic
from scripts.services.openai_embedding_service import OpenAIEmbeddingService

logger = get_service_logger("search_service")


@dataclass
class DrumSampleSearchResult:
    """Search result for drum samples"""
    sample_id: str
    name: str
    category: str
    description: str
    file_format: str
    storage_key: str
    similarity_score: float
    rank: int
    tags: Optional[List[str]] = None


class SearchService:
    """
    Unified search service for instruments and drum samples.
    
    This service wraps the existing search infrastructure and provides
    a consistent interface for the API layer.
    """
    
    def __init__(self):
        """Initialize the search service with underlying services."""
        self.instrument_search = InstrumentSearchService(
            cache_dir="./search_cache",
            use_cache=True,
            normalize_embeddings=True
        )
        self.embedding_service = OpenAIEmbeddingService()
        self._initialized = False
        
    async def _ensure_initialized(self):
        """Ensure the search service is initialized."""
        if not self._initialized:
            await self.instrument_search.load_instruments()
            self._initialized = True
    
    async def search_instruments(
        self,
        query: str,
        top_k: int = 10,
        similarity_threshold: float = 0.0,
        category_filter: Optional[str] = None,
        format_filter: Optional[str] = None
    ) -> List[InstrumentSearchResult]:
        """
        Search for instruments using natural language queries.
        
        Args:
            query: Search query text
            top_k: Number of results to return
            similarity_threshold: Minimum similarity score
            category_filter: Filter by category
            format_filter: Filter by file format
            
        Returns:
            List of instrument search results
        """
        try:
            await self._ensure_initialized()
            
            logger.info(f"Searching instruments with query: {query}")
            
            results = await self.instrument_search.search(
                query=query,
                top_k=top_k,
                similarity_threshold=similarity_threshold,
                category_filter=category_filter,
                format_filter=format_filter
            )
            
            logger.info(f"Found {len(results)} instruments for query: {query}")
            
            return results
            
        except Exception as e:
            logger.error(f"Error searching instruments: {str(e)}")
            raise ServiceException(f"Failed to search instruments: {str(e)}")
    
    async def find_similar_instruments(
        self,
        instrument_id: str,
        top_k: int = 10
    ) -> List[InstrumentSearchResult]:
        """
        Find instruments similar to a given instrument.
        
        Args:
            instrument_id: ID of the reference instrument
            top_k: Number of results to return
            
        Returns:
            List of similar instruments
        """
        try:
            await self._ensure_initialized()
            
            logger.info(f"Finding instruments similar to: {instrument_id}")
            
            results = await self.instrument_search.search_similar_instruments(
                instrument_id=instrument_id,
                top_k=top_k,
                exclude_same=True
            )
            
            logger.info(f"Found {len(results)} similar instruments")
            
            return results
            
        except ValueError as e:
            logger.warning(f"Instrument not found: {instrument_id}")
            raise ValueError(str(e))
        except Exception as e:
            logger.error(f"Error finding similar instruments: {str(e)}")
            raise ServiceException(f"Failed to find similar instruments: {str(e)}")
    
    async def search_drum_samples(
        self,
        query: str,
        top_k: int = 10,
        similarity_threshold: float = 0.0,
        category_filter: Optional[str] = None
    ) -> List[DrumSampleSearchResult]:
        """
        Search for drum samples using natural language queries.
        
        Note: This is a simplified implementation that searches by name/description.
        Future enhancement would add embedding-based search for drum samples.
        
        Args:
            query: Search query text
            top_k: Number of results to return
            similarity_threshold: Minimum similarity score (not used in current implementation)
            category_filter: Filter by category
            
        Returns:
            List of drum sample search results
        """
        try:
            logger.info(f"Searching drum samples with query: {query}")
            
            # For now, we'll do a simple database search
            # Future enhancement: Add embedding-based search like instruments
            with next(get_session()) as session:
                stmt = select(DrumSamplePublic)
                
                # Apply category filter if provided
                if category_filter:
                    stmt = stmt.where(DrumSamplePublic.category == category_filter)
                
                # Simple text search on name and description
                # Future: Use embeddings for semantic search
                search_term = f"%{query.lower()}%"
                stmt = stmt.where(
                    (DrumSamplePublic.name.ilike(search_term)) |
                    (DrumSamplePublic.description.ilike(search_term))
                )
                
                stmt = stmt.limit(top_k)
                
                samples = session.exec(stmt).all()
                
                # Convert to search results with mock similarity scores
                results = []
                for i, sample in enumerate(samples):
                    result = DrumSampleSearchResult(
                        sample_id=str(sample.id),
                        name=sample.name,
                        category=sample.category or "uncategorized",
                        description=sample.description or "",
                        file_format=sample.file_format,
                        storage_key=sample.storage_key,
                        similarity_score=1.0 - (i * 0.1),  # Mock decreasing scores
                        rank=i + 1,
                        tags=sample.tags
                    )
                    results.append(result)
                
                logger.info(f"Found {len(results)} drum samples for query: {query}")
                
                return results
                
        except Exception as e:
            logger.error(f"Error searching drum samples: {str(e)}")
            raise ServiceException(f"Failed to search drum samples: {str(e)}")
    
    async def get_search_statistics(self) -> Dict[str, Any]:
        """
        Get statistics about the search index.
        
        Returns:
            Dictionary containing search statistics
        """
        try:
            await self._ensure_initialized()
            
            stats = self.instrument_search.get_search_statistics()
            
            # Add drum sample statistics
            with next(get_session()) as session:
                drum_sample_count = session.exec(
                    select(DrumSamplePublic)
                ).count()
                
                stats["drum_samples"] = {
                    "total": drum_sample_count,
                    "with_embeddings": 0  # Future: Track when we add embeddings
                }
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting search statistics: {str(e)}")
            raise ServiceException(f"Failed to get search statistics: {str(e)}")
    
    async def clear_cache(self) -> None:
        """Clear all search caches."""
        try:
            self.instrument_search.clear_cache()
            self._initialized = False
            logger.info("Search cache cleared successfully")
            
        except Exception as e:
            logger.error(f"Error clearing search cache: {str(e)}")
            raise ServiceException(f"Failed to clear search cache: {str(e)}")
    
    async def generate_query_from_context(
        self,
        musical_context: Dict[str, Any]
    ) -> str:
        """
        Generate a search query from musical context.
        
        This method can be enhanced with AI to generate better queries
        based on the musical context provided by the DAW.
        
        Args:
            musical_context: Dictionary containing musical context
                (e.g., genre, mood, tempo, key, etc.)
                
        Returns:
            Generated search query string
        """
        try:
            # Extract relevant context
            genre = musical_context.get("genre", "")
            mood = musical_context.get("mood", "")
            instrument_type = musical_context.get("instrument_type", "")
            style = musical_context.get("style", "")
            
            # Build query from context
            query_parts = []
            
            if instrument_type:
                query_parts.append(instrument_type)
            if style:
                query_parts.append(style)
            if mood:
                query_parts.append(mood)
            if genre:
                query_parts.append(f"{genre} style")
            
            query = " ".join(query_parts).strip()
            
            if not query:
                query = "general purpose instrument"
            
            logger.info(f"Generated query from context: {query}")
            
            return query
            
        except Exception as e:
            logger.error(f"Error generating query from context: {str(e)}")
            # Return a fallback query
            return "general purpose instrument"