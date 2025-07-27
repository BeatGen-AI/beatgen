"""
Unit tests for the DAW integration API endpoints.
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from uuid import uuid4
from typing import List, Dict, Any

from fastapi.testclient import TestClient
from app2.main_with_search import app
from app2.models.user import User
from app2.models.project import Project


# Mock user for authentication
mock_user = User(
    id=uuid4(),
    email="test@example.com",
    username="testuser",
    display_name="Test User"
)


class TestDAWIntegrationAPI:
    """Test suite for DAW integration API endpoints"""
    
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
        with patch("app2.api.routes.daw_integration.SearchService") as mock:
            yield mock
    
    @pytest.fixture
    def mock_current_user(self):
        """Mock the current user dependency"""
        with patch("app2.api.routes.daw_integration.get_current_user") as mock:
            mock.return_value = mock_user
            yield mock
    
    @pytest.fixture
    def mock_project_repo(self):
        """Mock project repository"""
        with patch("app2.api.routes.daw_integration.ProjectRepository") as mock:
            yield mock
    
    def test_daw_context_search_instruments(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test DAW context search for instruments"""
        # Request data
        request_data = {
            "context": {
                "genre": "jazz",
                "mood": "mellow",
                "instrument_type": "piano",
                "style": "vintage",
                "tempo": 120,
                "key": "C major"
            },
            "search_type": "instrument",
            "top_k": 5
        }
        
        # Mock search results
        mock_results = [
            Mock(
                instrument_id="inst1",
                name="Vintage Jazz Piano",
                category="keyboards",
                description="Mellow vintage piano",
                file_format="sf2",
                storage_key="instruments/jazz_piano.sf2",
                similarity_score=0.92,
                rank=1,
                tags=["jazz", "vintage"]
            )
        ]
        
        # Configure mocks
        mock_instance = mock_search_service.return_value
        mock_instance.generate_query_from_context = AsyncMock(
            return_value="vintage mellow piano jazz style"
        )
        mock_instance.search_instruments = AsyncMock(return_value=mock_results)
        
        # Make request
        response = client.post(
            "/daw/query",
            json=request_data,
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert data["generated_query"] == "vintage mellow piano jazz style"
        assert data["search_type"] == "instrument"
        assert len(data["results"]) == 1
        assert data["results"][0]["name"] == "Vintage Jazz Piano"
        assert data["fallback_used"] is False
        
        # Verify service calls
        mock_instance.generate_query_from_context.assert_called_once()
        mock_instance.search_instruments.assert_called_once()
    
    def test_daw_context_search_drum_samples(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test DAW context search for drum samples"""
        # Request data
        request_data = {
            "context": {
                "genre": "hip-hop",
                "mood": "aggressive",
                "instrument_type": "drums",
                "tempo": 90
            },
            "search_type": "drum_sample",
            "top_k": 3
        }
        
        # Mock search results
        mock_results = [
            Mock(
                sample_id="sample1",
                name="808 Kick Heavy",
                category="kicks",
                description="Heavy 808 kick",
                file_format="wav",
                storage_key="drums/808_heavy.wav",
                similarity_score=0.88,
                rank=1,
                tags=["808", "heavy"]
            )
        ]
        
        # Configure mocks
        mock_instance = mock_search_service.return_value
        mock_instance.generate_query_from_context = AsyncMock(
            return_value="drums aggressive hip-hop style"
        )
        mock_instance.search_drum_samples = AsyncMock(return_value=mock_results)
        
        # Make request
        response = client.post(
            "/daw/query",
            json=request_data,
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert data["search_type"] == "drum_sample"
        assert len(data["results"]) == 1
        assert data["results"][0]["name"] == "808 Kick Heavy"
    
    def test_daw_context_search_with_similar(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test DAW context search with similar items included"""
        # Request data
        request_data = {
            "context": {
                "instrument_type": "bass"
            },
            "search_type": "instrument",
            "top_k": 2,
            "include_similar": True
        }
        
        # Mock main results
        mock_results = [
            Mock(
                instrument_id="inst1",
                name="Electric Bass",
                category="bass",
                description="Electric bass guitar",
                file_format="sf2",
                storage_key="instruments/ebass.sf2",
                similarity_score=0.95,
                rank=1,
                tags=[]
            )
        ]
        
        # Mock similar results
        mock_similar = [
            Mock(
                instrument_id="inst2",
                name="Synth Bass",
                similarity_score=0.85
            )
        ]
        
        # Configure mocks
        mock_instance = mock_search_service.return_value
        mock_instance.generate_query_from_context = AsyncMock(return_value="bass")
        mock_instance.search_instruments = AsyncMock(return_value=mock_results)
        mock_instance.find_similar_instruments = AsyncMock(return_value=mock_similar)
        
        # Make request
        response = client.post(
            "/daw/query",
            json=request_data,
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) == 1
        assert "similar" in data["results"][0]
        assert len(data["results"][0]["similar"]) == 1
        assert data["results"][0]["similar"][0]["name"] == "Synth Bass"
    
    def test_daw_context_search_fallback(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test DAW context search with fallback on error"""
        # Request data
        request_data = {
            "context": {
                "instrument_type": "guitar",
                "genre": "rock"
            },
            "search_type": "instrument"
        }
        
        # Configure mocks to fail first, then succeed with fallback
        mock_instance = mock_search_service.return_value
        mock_instance.generate_query_from_context = AsyncMock(
            side_effect=Exception("Query generation failed")
        )
        mock_instance.search_instruments = AsyncMock(return_value=[])
        
        # Make request
        response = client.post(
            "/daw/query",
            json=request_data,
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert data["fallback_used"] is True
        assert data["generated_query"] == "guitar"  # Fallback to instrument_type
    
    def test_batch_instruments_retrieval(
        self, client, auth_headers, mock_current_user
    ):
        """Test batch instrument retrieval"""
        # Mock instrument IDs
        inst_ids = [uuid4() for _ in range(3)]
        
        # Request data
        request_data = {
            "instrument_ids": inst_ids,
            "include_metadata": True
        }
        
        # Mock repository
        with patch("app2.api.routes.daw_integration.InstrumentRepository") as mock_repo_class:
            mock_repo = mock_repo_class.return_value
            
            # Mock instruments
            mock_instruments = [
                Mock(
                    id=inst_ids[0],
                    name="Piano",
                    category="keyboards",
                    description_generated="Grand piano",
                    file_format="sf2",
                    storage_key="piano.sf2",
                    tags=["acoustic"],
                    file_size=1024000,
                    sample_rate=44100,
                    created_at=Mock(isoformat=Mock(return_value="2024-01-01T00:00:00"))
                ),
                Mock(
                    id=inst_ids[1],
                    name="Guitar",
                    category="strings",
                    description_generated="Electric guitar",
                    file_format="sf2",
                    storage_key="guitar.sf2",
                    tags=["electric"],
                    file_size=2048000,
                    sample_rate=48000,
                    created_at=Mock(isoformat=Mock(return_value="2024-01-02T00:00:00"))
                ),
                None  # Third one not found
            ]
            
            # Configure mock to return instruments
            async def mock_get_by_id(inst_id):
                for inst in mock_instruments:
                    if inst and inst.id == inst_id:
                        return inst
                return None
            
            mock_repo.get_by_id = mock_get_by_id
            
            # Make request
            response = client.post(
                "/daw/instruments/batch",
                json=request_data,
                headers=auth_headers
            )
            
            # Assertions
            assert response.status_code == 200
            data = response.json()
            assert len(data["instruments"]) == 2
            assert len(data["not_found"]) == 1
            assert data["total_requested"] == 3
            assert data["total_found"] == 2
            
            # Check instrument data
            assert str(inst_ids[0]) in data["instruments"]
            assert data["instruments"][str(inst_ids[0])]["name"] == "Piano"
            assert data["instruments"][str(inst_ids[1])]["name"] == "Guitar"
            assert str(inst_ids[2]) in data["not_found"]
    
    def test_batch_instruments_minimal_metadata(
        self, client, auth_headers, mock_current_user
    ):
        """Test batch instrument retrieval with minimal metadata"""
        inst_id = uuid4()
        
        request_data = {
            "instrument_ids": [inst_id],
            "include_metadata": False
        }
        
        with patch("app2.api.routes.daw_integration.InstrumentRepository") as mock_repo_class:
            mock_repo = mock_repo_class.return_value
            mock_repo.get_by_id = AsyncMock(return_value=Mock(
                id=inst_id,
                name="Test Instrument",
                storage_key="test.sf2"
            ))
            
            response = client.post(
                "/daw/instruments/batch",
                json=request_data,
                headers=auth_headers
            )
            
            assert response.status_code == 200
            data = response.json()
            instrument = data["instruments"][str(inst_id)]
            assert "name" in instrument
            assert "storage_key" in instrument
            assert "description" not in instrument  # Not included with minimal metadata
    
    def test_project_export_json(
        self, client, auth_headers, mock_current_user, mock_project_repo
    ):
        """Test project export in JSON format"""
        project_id = uuid4()
        
        # Mock project with tracks
        mock_project = Mock(
            id=project_id,
            name="Test Project",
            bpm=120.0,
            time_signature_numerator=4,
            time_signature_denominator=4,
            created_at=Mock(isoformat=Mock(return_value="2024-01-01T00:00:00")),
            updated_at=Mock(isoformat=Mock(return_value="2024-01-02T00:00:00")),
            tracks=[
                Mock(
                    id=uuid4(),
                    name="Piano Track",
                    track_type="midi",
                    order=0,
                    volume=0.8,
                    pan=0.0,
                    muted=False,
                    solo=False,
                    audio_track=None,
                    midi_track=Mock(
                        midi_file_storage_key="midi/piano.mid",
                        instrument_id=uuid4()
                    ),
                    sampler_track=None,
                    drum_track=None
                )
            ]
        )
        
        # Configure mock
        mock_repo = mock_project_repo.return_value
        mock_repo.get_user_project = AsyncMock(return_value=mock_project)
        
        # Request data
        request_data = {
            "format": "json",
            "include_audio": False
        }
        
        # Make request
        response = client.post(
            f"/daw/projects/{project_id}/export",
            json=request_data,
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["export"]["project_id"] == str(project_id)
        assert data["export"]["name"] == "Test Project"
        assert data["export"]["bpm"] == 120.0
        assert len(data["export"]["tracks"]) == 1
        assert data["export"]["tracks"][0]["name"] == "Piano Track"
        assert data["export"]["format"] == "json"
    
    def test_project_export_not_found(
        self, client, auth_headers, mock_current_user, mock_project_repo
    ):
        """Test project export when project not found"""
        project_id = uuid4()
        
        # Configure mock to return None
        mock_repo = mock_project_repo.return_value
        mock_repo.get_user_project = AsyncMock(return_value=None)
        
        # Make request
        response = client.post(
            f"/daw/projects/{project_id}/export",
            json={"format": "json"},
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]
    
    def test_daw_health_check(
        self, client, auth_headers, mock_search_service, mock_current_user
    ):
        """Test DAW integration health check"""
        # Mock statistics
        mock_stats = {
            "total_instruments": 500,
            "total_with_embeddings": 450,
            "drum_samples": {"total": 200}
        }
        
        # Configure mock
        mock_instance = mock_search_service.return_value
        mock_instance.get_search_statistics = AsyncMock(return_value=mock_stats)
        
        # Make request
        response = client.get(
            "/daw/health",
            headers=auth_headers
        )
        
        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["search_index"]["instruments"] == 500
        assert data["search_index"]["drum_samples"] == 200
        assert data["services"]["search"] == "operational"
        assert data["services"]["export"] == "operational"
    
    def test_invalid_search_type(
        self, client, auth_headers, mock_current_user
    ):
        """Test DAW context search with invalid search type"""
        request_data = {
            "context": {"instrument_type": "piano"},
            "search_type": "invalid_type"
        }
        
        response = client.post(
            "/daw/query",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        assert "Invalid search_type" in response.json()["detail"]


@pytest.mark.asyncio
class TestDAWIntegrationAsync:
    """Async tests for DAW integration"""
    
    async def test_concurrent_batch_requests(self):
        """Test handling concurrent batch instrument requests"""
        # This would test the service's ability to handle multiple
        # concurrent batch requests efficiently
        pass