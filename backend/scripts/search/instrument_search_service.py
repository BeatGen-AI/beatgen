"""
Instrument search service that handles embedding loading, query generation, and search.
"""

import os
import sys
import json
import pickle
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
import logging
from dataclasses import dataclass, asdict
import asyncio
from collections import defaultdict

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlmodel import Session, select, and_
from app2.infrastructure.database.sqlmodel_client import get_session
from app2.models.public_models.instrument_file import InstrumentFile
from app2.core.logging import get_logger
from scripts.services.openai_embedding_service import OpenAIEmbeddingService
from scripts.search.cosine_similarity_search import CosineSimilaritySearch, SearchResult

logger = get_logger(__name__)


@dataclass
class InstrumentSearchResult(SearchResult):
    """Extended search result with instrument metadata"""
    name: str
    category: str
    description: str
    file_format: str
    storage_key: str
    tags: Optional[List[str]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)


class InstrumentSearchService:
    """Service for searching instruments by text query using embeddings"""
    
    def __init__(self, 
                 cache_dir: str = "./search_cache",
                 use_cache: bool = True,
                 normalize_embeddings: bool = True):
        """
        Initialize the search service.
        
        Args:
            cache_dir: Directory for caching embeddings and index
            use_cache: Whether to use cached data
            normalize_embeddings: Whether to normalize embeddings
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)
        self.use_cache = use_cache
        
        # Initialize services
        self.embedding_service = OpenAIEmbeddingService()
        self.search_engine = CosineSimilaritySearch(normalize_embeddings=normalize_embeddings)
        
        # Data storage
        self.instruments: Dict[str, InstrumentFile] = {}
        self.embeddings: Dict[str, List[float]] = {}
        self.categories: Dict[str, List[str]] = defaultdict(list)  # category -> instrument_ids
        
        # Cache files
        self.embeddings_cache_file = self.cache_dir / "embeddings_cache.pkl"
        self.metadata_cache_file = self.cache_dir / "metadata_cache.pkl"
        
        # Query cache
        self.query_cache: Dict[str, Tuple[List[float], datetime]] = {}
        self.max_query_cache_size = 1000
        
        self._loaded = False
    
    async def load_instruments(self, force_reload: bool = False) -> None:
        """Load all instruments with embeddings from database"""
        if self._loaded and not force_reload:
            logger.info("Instruments already loaded")
            return
        
        # Try to load from cache first
        if self.use_cache and not force_reload and self._load_from_cache():
            logger.info("Loaded instruments from cache")
            self._loaded = True
            return
        
        logger.info("Loading instruments from database...")
        
        with next(get_session()) as session:
            # Query all instruments with embeddings
            query = select(InstrumentFile).where(
                InstrumentFile.description_embedding.is_not(None)
            )
            instruments = session.exec(query).all()
            
            if not instruments:
                logger.warning("No instruments with embeddings found")
                return
            
            # Store instruments and embeddings
            for instrument in instruments:
                instrument_id = str(instrument.id)
                self.instruments[instrument_id] = instrument
                self.embeddings[instrument_id] = instrument.description_embedding
                self.categories[instrument.category].append(instrument_id)
            
            logger.info(f"Loaded {len(self.instruments)} instruments with embeddings")
            
            # Build search index
            self.search_engine.build_index(self.embeddings)
            
            # Save to cache
            if self.use_cache:
                self._save_to_cache()
            
            self._loaded = True
    
    def _load_from_cache(self) -> bool:
        """Load embeddings and metadata from cache"""
        try:
            if not self.embeddings_cache_file.exists() or not self.metadata_cache_file.exists():
                return False
            
            # Load embeddings
            with open(self.embeddings_cache_file, "rb") as f:
                cache_data = pickle.load(f)
                self.embeddings = cache_data["embeddings"]
                cache_time = cache_data["timestamp"]
            
            # Load metadata
            with open(self.metadata_cache_file, "rb") as f:
                metadata = pickle.load(f)
                self.instruments = metadata["instruments"]
                self.categories = defaultdict(list, metadata["categories"])
            
            # Check cache age (invalidate after 24 hours)
            if (datetime.now(timezone.utc) - cache_time).total_seconds() > 86400:
                logger.info("Cache is older than 24 hours, will reload")
                return False
            
            # Build search index from cached embeddings
            self.search_engine.build_index(self.embeddings)
            
            return True
            
        except Exception as e:
            logger.warning(f"Failed to load from cache: {e}")
            return False
    
    def _save_to_cache(self) -> None:
        """Save embeddings and metadata to cache"""
        try:
            # Save embeddings with timestamp
            embeddings_data = {
                "embeddings": self.embeddings,
                "timestamp": datetime.now(timezone.utc)
            }
            with open(self.embeddings_cache_file, "wb") as f:
                pickle.dump(embeddings_data, f)
            
            # Save metadata (without SQLModel objects)
            metadata = {
                "instruments": {
                    id: {
                        "id": str(inst.id),
                        "name": inst.name,
                        "category": inst.category,
                        "description": inst.description_generated,
                        "file_format": inst.file_format,
                        "storage_key": inst.storage_key,
                        "tags": inst.tags
                    }
                    for id, inst in self.instruments.items()
                },
                "categories": dict(self.categories)
            }
            with open(self.metadata_cache_file, "wb") as f:
                pickle.dump(metadata, f)
            
            logger.info("Saved search data to cache")
            
        except Exception as e:
            logger.error(f"Failed to save cache: {e}")
    
    async def search(self, 
                    query: str,
                    top_k: int = 10,
                    similarity_threshold: float = 0.0,
                    category_filter: Optional[str] = None,
                    format_filter: Optional[str] = None) -> List[InstrumentSearchResult]:
        """
        Search for instruments matching the query.
        
        Args:
            query: Search query text
            top_k: Number of results to return
            similarity_threshold: Minimum similarity score
            category_filter: Filter by instrument category
            format_filter: Filter by file format
            
        Returns:
            List of search results with metadata
        """
        # Ensure instruments are loaded
        await self.load_instruments()
        
        if not self.embeddings:
            logger.warning("No embeddings available for search")
            return []
        
        # Generate query embedding
        query_embedding = await self._get_query_embedding(query)
        
        # Apply pre-filters if needed
        filtered_embeddings = self.embeddings
        filtered_ids = set(self.embeddings.keys())
        
        if category_filter:
            category_ids = set(self.categories.get(category_filter, []))
            filtered_ids &= category_ids
            filtered_embeddings = {id: self.embeddings[id] for id in filtered_ids}
        
        if format_filter and filtered_ids:
            format_ids = {
                id for id in filtered_ids 
                if self.instruments[id].file_format == format_filter
            }
            filtered_ids &= format_ids
            filtered_embeddings = {id: self.embeddings[id] for id in filtered_ids}
        
        if not filtered_embeddings:
            logger.info("No instruments match the filters")
            return []
        
        # Perform search
        search_results = self.search_engine.cosine_similarity_search(
            query_embedding,
            filtered_embeddings,
            top_k=top_k,
            similarity_threshold=similarity_threshold
        )
        
        # Enrich results with metadata
        enriched_results = []
        for result in search_results:
            instrument = self.instruments.get(result.instrument_id)
            if instrument:
                enriched_result = InstrumentSearchResult(
                    instrument_id=result.instrument_id,
                    similarity_score=result.similarity_score,
                    rank=result.rank,
                    name=instrument.name,
                    category=instrument.category,
                    description=instrument.description_generated or "",
                    file_format=instrument.file_format,
                    storage_key=instrument.storage_key,
                    tags=instrument.tags
                )
                enriched_results.append(enriched_result)
        
        return enriched_results
    
    async def _get_query_embedding(self, query: str) -> List[float]:
        """Get or generate embedding for query with caching"""
        # Check cache
        if query in self.query_cache:
            embedding, timestamp = self.query_cache[query]
            # Use cached embedding if less than 1 hour old
            if (datetime.now(timezone.utc) - timestamp).total_seconds() < 3600:
                logger.debug(f"Using cached embedding for query: {query}")
                return embedding
        
        # Generate new embedding
        logger.info(f"Generating embedding for query: {query}")
        result = await self.embedding_service.generate_single_embedding(query)
        embedding = result.embedding
        
        # Cache the embedding
        self.query_cache[query] = (embedding, datetime.now(timezone.utc))
        
        # Limit cache size
        if len(self.query_cache) > self.max_query_cache_size:
            # Remove oldest entries
            sorted_queries = sorted(
                self.query_cache.items(), 
                key=lambda x: x[1][1]
            )
            for old_query, _ in sorted_queries[:len(self.query_cache) - self.max_query_cache_size]:
                del self.query_cache[old_query]
        
        return embedding
    
    async def search_similar_instruments(self, 
                                       instrument_id: str,
                                       top_k: int = 10,
                                       exclude_same: bool = True) -> List[InstrumentSearchResult]:
        """Find instruments similar to a given instrument"""
        await self.load_instruments()
        
        if instrument_id not in self.embeddings:
            raise ValueError(f"Instrument {instrument_id} not found or has no embedding")
        
        # Use the instrument's embedding as query
        query_embedding = self.embeddings[instrument_id]
        
        # Search
        results = self.search_engine.cosine_similarity_search(
            query_embedding,
            self.embeddings,
            top_k=top_k + 1 if exclude_same else top_k
        )
        
        # Filter out the query instrument if requested
        if exclude_same:
            results = [r for r in results if r.instrument_id != instrument_id][:top_k]
        
        # Enrich results
        enriched_results = []
        for result in results:
            instrument = self.instruments.get(result.instrument_id)
            if instrument:
                enriched_result = InstrumentSearchResult(
                    instrument_id=result.instrument_id,
                    similarity_score=result.similarity_score,
                    rank=result.rank,
                    name=instrument.name,
                    category=instrument.category,
                    description=instrument.description_generated or "",
                    file_format=instrument.file_format,
                    storage_key=instrument.storage_key,
                    tags=instrument.tags
                )
                enriched_results.append(enriched_result)
        
        return enriched_results
    
    def get_search_statistics(self) -> Dict[str, Any]:
        """Get statistics about the search index"""
        stats = {
            "total_instruments": len(self.instruments),
            "total_with_embeddings": len(self.embeddings),
            "categories": {
                category: len(ids) 
                for category, ids in self.categories.items()
            },
            "cache_status": {
                "embeddings_cached": self.embeddings_cache_file.exists(),
                "query_cache_size": len(self.query_cache)
            }
        }
        
        if self.embeddings:
            stats["embedding_stats"] = self.search_engine.get_similarity_statistics()
        
        return stats
    
    def clear_cache(self) -> None:
        """Clear all caches"""
        # Clear query cache
        self.query_cache.clear()
        
        # Remove cache files
        if self.embeddings_cache_file.exists():
            self.embeddings_cache_file.unlink()
        if self.metadata_cache_file.exists():
            self.metadata_cache_file.unlink()
        
        logger.info("Cleared all caches")


# Example usage
async def test_search_service():
    """Test the search service"""
    service = InstrumentSearchService()
    
    # Load instruments
    await service.load_instruments()
    
    # Get statistics
    stats = service.get_search_statistics()
    print(f"Loaded {stats['total_instruments']} instruments")
    print(f"Categories: {list(stats['categories'].keys())}")
    
    # Test search
    test_queries = [
        "warm analog bass",
        "bright piano",
        "punchy drums",
        "atmospheric pad"
    ]
    
    for query in test_queries:
        print(f"\nSearching for: {query}")
        results = await service.search(query, top_k=3)
        
        for result in results:
            print(f"  [{result.rank}] {result.name} ({result.category})")
            print(f"      Score: {result.similarity_score:.3f}")
            print(f"      Description: {result.description[:100]}...")


if __name__ == "__main__":
    asyncio.run(test_search_service())