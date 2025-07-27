#!/usr/bin/env python3
"""
Test API server for instrument search functionality.

This is a standalone FastAPI server for testing search functionality.
NOT FOR PRODUCTION USE - this is only for development and testing.

Usage:
    python scripts/search_api_test.py [--port 8000] [--host 0.0.0.0]
    
Endpoints:
    GET  /                     - API documentation
    POST /search               - Search instruments
    GET  /search/similar/{id}  - Find similar instruments
    GET  /stats                - Get search statistics
    GET  /health               - Health check
"""

import argparse
import asyncio
import sys
import os
from typing import List, Optional, Dict, Any
from datetime import datetime
import time
import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app2.core.logging import get_logger
from scripts.search.instrument_search_service import InstrumentSearchService, InstrumentSearchResult

logger = get_logger(__name__)

# Global search service instance
search_service: Optional[InstrumentSearchService] = None


# Pydantic models
class SearchRequest(BaseModel):
    """Search request model"""
    query: str = Field(..., description="Search query text")
    top_k: int = Field(10, ge=1, le=100, description="Number of results to return")
    similarity_threshold: float = Field(0.0, ge=0.0, le=1.0, description="Minimum similarity score")
    category_filter: Optional[str] = Field(None, description="Filter by instrument category")
    format_filter: Optional[str] = Field(None, description="Filter by file format")


class SearchResultResponse(BaseModel):
    """Search result response model"""
    instrument_id: str
    similarity_score: float
    rank: int
    name: str
    category: str
    description: str
    file_format: str
    storage_key: str
    tags: Optional[List[str]] = None


class SearchResponse(BaseModel):
    """Search response model"""
    query: str
    total_results: int
    search_time_ms: float
    results: List[SearchResultResponse]


class StatsResponse(BaseModel):
    """Statistics response model"""
    total_instruments: int
    total_with_embeddings: int
    categories: Dict[str, int]
    cache_status: Dict[str, Any]
    embedding_stats: Optional[Dict[str, Any]] = None


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    timestamp: str
    service_loaded: bool
    instruments_loaded: int


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    global search_service
    
    # Startup
    logger.info("Starting search API test server...")
    search_service = InstrumentSearchService(cache_dir="./search_cache", use_cache=True)
    
    # Load instruments in background
    logger.info("Loading instruments...")
    await search_service.load_instruments()
    stats = search_service.get_search_statistics()
    logger.info(f"Loaded {stats['total_instruments']} instruments")
    
    yield
    
    # Shutdown
    logger.info("Shutting down search API test server...")


# Create FastAPI app
app = FastAPI(
    title="Instrument Search API (Test)",
    description="Test API for instrument search functionality. NOT FOR PRODUCTION USE.",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware for testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["General"])
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Instrument Search API (Test Server)",
        "warning": "This is a test server - NOT for production use",
        "endpoints": {
            "/docs": "Interactive API documentation",
            "/search": "Search instruments (POST)",
            "/search/similar/{id}": "Find similar instruments (GET)",
            "/stats": "Get search statistics (GET)",
            "/health": "Health check (GET)"
        }
    }


@app.post("/search", response_model=SearchResponse, tags=["Search"])
async def search_instruments(request: SearchRequest):
    """
    Search for instruments using text query.
    
    Returns ranked results based on embedding similarity.
    """
    if not search_service:
        raise HTTPException(status_code=503, detail="Search service not initialized")
    
    start_time = time.time()
    
    try:
        # Perform search
        results = await search_service.search(
            query=request.query,
            top_k=request.top_k,
            similarity_threshold=request.similarity_threshold,
            category_filter=request.category_filter,
            format_filter=request.format_filter
        )
        
        search_time_ms = (time.time() - start_time) * 1000
        
        # Convert results to response format
        response_results = [
            SearchResultResponse(
                instrument_id=result.instrument_id,
                similarity_score=result.similarity_score,
                rank=result.rank,
                name=result.name,
                category=result.category,
                description=result.description,
                file_format=result.file_format,
                storage_key=result.storage_key,
                tags=result.tags
            )
            for result in results
        ]
        
        return SearchResponse(
            query=request.query,
            total_results=len(results),
            search_time_ms=search_time_ms,
            results=response_results
        )
        
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search/similar/{instrument_id}", response_model=SearchResponse, tags=["Search"])
async def find_similar_instruments(
    instrument_id: str,
    top_k: int = Query(10, ge=1, le=100, description="Number of results")
):
    """
    Find instruments similar to the given instrument.
    
    Uses the instrument's embedding to find similar items.
    """
    if not search_service:
        raise HTTPException(status_code=503, detail="Search service not initialized")
    
    start_time = time.time()
    
    try:
        # Find similar instruments
        results = await search_service.search_similar_instruments(
            instrument_id=instrument_id,
            top_k=top_k,
            exclude_same=True
        )
        
        search_time_ms = (time.time() - start_time) * 1000
        
        # Convert results
        response_results = [
            SearchResultResponse(
                instrument_id=result.instrument_id,
                similarity_score=result.similarity_score,
                rank=result.rank,
                name=result.name,
                category=result.category,
                description=result.description,
                file_format=result.file_format,
                storage_key=result.storage_key,
                tags=result.tags
            )
            for result in results
        ]
        
        return SearchResponse(
            query=f"similar:{instrument_id}",
            total_results=len(results),
            search_time_ms=search_time_ms,
            results=response_results
        )
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Similar search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats", response_model=StatsResponse, tags=["Statistics"])
async def get_statistics():
    """Get search index statistics"""
    if not search_service:
        raise HTTPException(status_code=503, detail="Search service not initialized")
    
    stats = search_service.get_search_statistics()
    
    return StatsResponse(
        total_instruments=stats.get("total_instruments", 0),
        total_with_embeddings=stats.get("total_with_embeddings", 0),
        categories=stats.get("categories", {}),
        cache_status=stats.get("cache_status", {}),
        embedding_stats=stats.get("embedding_stats")
    )


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint"""
    global search_service
    
    instruments_loaded = 0
    if search_service:
        stats = search_service.get_search_statistics()
        instruments_loaded = stats.get("total_instruments", 0)
    
    return HealthResponse(
        status="healthy" if search_service else "not_ready",
        timestamp=datetime.utcnow().isoformat(),
        service_loaded=search_service is not None,
        instruments_loaded=instruments_loaded
    )


# Example requests endpoint for testing
@app.get("/examples", tags=["Examples"])
async def get_examples():
    """Get example search queries for testing"""
    return {
        "search_examples": [
            {
                "description": "Basic search",
                "request": {
                    "query": "warm analog bass",
                    "top_k": 10
                }
            },
            {
                "description": "Search with category filter",
                "request": {
                    "query": "bright sound",
                    "top_k": 5,
                    "category_filter": "piano"
                }
            },
            {
                "description": "Search with similarity threshold",
                "request": {
                    "query": "punchy electronic drums",
                    "top_k": 10,
                    "similarity_threshold": 0.7
                }
            },
            {
                "description": "Search with format filter",
                "request": {
                    "query": "atmospheric pad",
                    "top_k": 10,
                    "format_filter": "wav"
                }
            }
        ],
        "test_queries": [
            "warm analog bass for hip-hop",
            "bright acoustic guitar for folk music",
            "punchy electronic drums",
            "atmospheric pad for ambient music",
            "vintage piano with character"
        ]
    }


def main():
    """Main function"""
    parser = argparse.ArgumentParser(description="Run test search API server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    
    args = parser.parse_args()
    
    print(f"""
╔══════════════════════════════════════════════════╗
║       Instrument Search API Test Server          ║
║                                                  ║
║  WARNING: This is for testing only!              ║
║  Do NOT use in production!                       ║
╚══════════════════════════════════════════════════╝

Starting server at http://{args.host}:{args.port}
API documentation at http://{args.host}:{args.port}/docs

Press CTRL+C to stop
""")
    
    # Run server
    uvicorn.run(
        "search_api_test:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info"
    )


if __name__ == "__main__":
    main()