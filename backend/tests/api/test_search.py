"""
Unit tests for the search API endpoints.
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from uuid import uuid4
from typing import List

from fastapi.testclient import TestClient
from app2.main_with_search import app
from app2.models.user import User
from scripts.search.instrument_search_service import InstrumentSearchResult


# Mock user for authentication
mock_user = User(
    id=uuid4(),
    email="test@example.com",
    username="testuser",
    display_name="Test User"
)


class TestSearchAPI:
    """Test suite for search API endpoints"""
    
    @pytest.fixture
    def client(self):
        """Create test client"""
        return TestClient(app)
    
    @pytest.fixture
    def auth_headers(self):
        """Mock authentication headers"""
        return {"Authorization": "Bearer mock_token"}
    
    @pytest.fixture
    def mock_search_service(self):
        """Mock the search service"""
        with patch("app2.api.routes.search.SearchService") as mock:
            yield mock
    
    @pytest.fixture
    def mock_current_user(self):
        """Mock the current user dependency"""
        with patch("app2.api.routes.search.get_current_user") as mock:
            mock.return_value = mock_user
            yield mock
    
    def test_search_instruments_success(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test successful instrument search"""
        # Mock search results
        mock_results = [
            InstrumentSearchResult(
                instrument_id="inst1",
                name="Grand Piano",
                category="keyboards",
                description="A beautiful grand piano sound",
                file_format="sf2",
                storage_key="instruments/piano.sf2",
                similarity_score=0.95,
                rank=1,
                tags=["acoustic", "piano"]
            ),
            InstrumentSearchResult(
                instrument_id="inst2",
                name="Electric Piano",
                category="keyboards",
                description="Vintage electric piano",
                file_format="sf2",
                storage_key="instruments/epiano.sf2",
                similarity_score=0.85,
                rank=2,
                tags=["electric", "vintage"]
            )
        ]
        
        # Configure mock
        mock_instance = mock_search_service.return_value
        mock_instance.search_instruments = AsyncMock(return_value=mock_results)
        
        # Make request
        response = client.get(
            "/search/instruments",
            params={"query": "piano", "top_k": 10},
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Grand Piano"
        assert data[0]["similarity_score"] == 0.95
        assert data[1]["name"] == "Electric Piano"
        
        # Verify service was called correctly
        mock_instance.search_instruments.assert_called_once_with(
            query="piano",
            top_k=10,
            similarity_threshold=0.0,
            category_filter=None,
            format_filter=None
        )
    
    def test_search_instruments_with_filters(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test instrument search with category and format filters"""
        # Configure mock
        mock_instance = mock_search_service.return_value
        mock_instance.search_instruments = AsyncMock(return_value=[])
        
        # Make request with filters
        response = client.get(
            "/search/instruments",
            params={
                "query": "bass",
                "category": "strings",
                "format": "sf2",
                "similarity_threshold": 0.7
            },
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        
        # Verify filters were passed
        mock_instance.search_instruments.assert_called_once_with(
            query="bass",
            top_k=10,
            similarity_threshold=0.7,
            category_filter="strings",
            format_filter="sf2"
        )
    
    def test_search_instruments_empty_query(
        self, client, auth_headers, mock_current_user
    ):
        """Test search with empty query"""
        response = client.get(
            "/search/instruments",
            params={"query": ""},
            headers=auth_headers
        )
        
        assert response.status_code == 422  # Validation error
    
    def test_find_similar_instruments_success(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test finding similar instruments"""
        instrument_id = uuid4()
        
        # Mock results
        mock_results = [
            InstrumentSearchResult(
                instrument_id="inst2",
                name="Similar Piano",
                category="keyboards",
                description="A similar piano",
                file_format="sf2",
                storage_key="instruments/similar.sf2",
                similarity_score=0.92,
                rank=1,
                tags=[]
            )
        ]
        
        # Configure mock
        mock_instance = mock_search_service.return_value
        mock_instance.find_similar_instruments = AsyncMock(return_value=mock_results)
        
        # Make request
        response = client.get(
            f"/search/instruments/{instrument_id}/similar",
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Similar Piano"
        
        # Verify service was called
        mock_instance.find_similar_instruments.assert_called_once_with(
            instrument_id=str(instrument_id),
            top_k=10
        )
    
    def test_find_similar_instruments_not_found(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test similar instruments when instrument not found"""
        instrument_id = uuid4()
        
        # Configure mock to raise ValueError
        mock_instance = mock_search_service.return_value
        mock_instance.find_similar_instruments = AsyncMock(
            side_effect=ValueError("Instrument not found")
        )
        
        # Make request
        response = client.get(
            f"/search/instruments/{instrument_id}/similar",
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 404
        assert "Instrument not found" in response.json()["detail"]
    
    def test_search_drum_samples_success(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test drum sample search"""
        # Mock results
        mock_results = [
            Mock(
                sample_id="sample1",
                name="808 Kick",
                category="kicks",
                description="Deep 808 kick drum",
                file_format="wav",
                storage_key="drums/808kick.wav",
                similarity_score=0.88,
                rank=1,
                tags=["808", "kick"]
            )
        ]
        
        # Configure mock
        mock_instance = mock_search_service.return_value
        mock_instance.search_drum_samples = AsyncMock(return_value=mock_results)
        
        # Make request
        response = client.get(
            "/search/drum-samples",
            params={"query": "808 kick"},
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "808 Kick"
        assert data[0]["category"] == "kicks"
    
    def test_get_search_statistics(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test getting search statistics"""
        # Mock statistics
        mock_stats = {
            "total_instruments": 1000,
            "total_with_embeddings": 950,
            "categories": {
                "keyboards": 200,
                "strings": 150,
                "brass": 100
            },
            "cache_status": {
                "embeddings_cached": True,
                "query_cache_size": 50
            },
            "embedding_stats": {
                "mean_similarity": 0.75,
                "std_similarity": 0.15
            }
        }
        
        # Configure mock
        mock_instance = mock_search_service.return_value
        mock_instance.get_search_statistics = AsyncMock(return_value=mock_stats)
        
        # Make request
        response = client.get(
            "/search/statistics",
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert data["total_instruments"] == 1000
        assert data["total_with_embeddings"] == 950
        assert data["categories"]["keyboards"] == 200
        assert data["cache_status"]["embeddings_cached"] is True
    
    def test_clear_search_cache(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test clearing search cache"""
        # Configure mock
        mock_instance = mock_search_service.return_value
        mock_instance.clear_cache = AsyncMock()
        
        # Make request
        response = client.post(
            "/search/cache/clear",
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        assert response.json()["message"] == "Search cache cleared successfully"
        
        # Verify service was called
        mock_instance.clear_cache.assert_called_once()
    
    def test_search_unauthorized(self, client):
        """Test search without authentication"""
        response = client.get(
            "/search/instruments",
            params={"query": "piano"}
        )
        
        # Should fail without auth headers
        assert response.status_code in [401, 403]
    
    def test_search_service_error(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test handling of service errors"""
        # Configure mock to raise exception
        mock_instance = mock_search_service.return_value
        mock_instance.search_instruments = AsyncMock(
            side_effect=Exception("Service unavailable")
        )
        
        # Make request
        response = client.get(
            "/search/instruments",
            params={"query": "piano"},
            headers=auth_headers
        )
        
        # Should return 500 error
        assert response.status_code == 500
        assert "Internal server error" in response.json()["detail"]


@pytest.mark.asyncio
class TestSearchAPIAsync:
    """Async tests for search API"""
    
    async def test_concurrent_searches(self, mock_search_service):
        """Test handling concurrent search requests"""
        # This would test the service's ability to handle multiple
        # concurrent requests efficiently
        pass