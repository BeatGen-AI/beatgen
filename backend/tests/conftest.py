"""
Pytest configuration and shared fixtures for batch processing tests.
"""

import pytest
import tempfile
import os
from pathlib import Path
from unittest.mock import Mock
import sys

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Conditional imports to handle SQLAlchemy compatibility issues
try:
    from sqlmodel import create_engine, SQLModel, Session
    from app2.models.public_models.instrument_file import InstrumentFile
    SQLMODEL_AVAILABLE = True
except (ImportError, AssertionError) as e:
    print(f"Warning: SQLModel import failed ({e}). Using mock objects for tests.")
    SQLMODEL_AVAILABLE = False
    # Create mock classes
    class InstrumentFile:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

try:
    from audio_ml.audio_description_service import AudioDescriptionService, AudioDescriptionResult
except ImportError:
    # Create mock classes if not available
    class AudioDescriptionService:
        pass
    class AudioDescriptionResult:
        pass


@pytest.fixture(scope="session")
def test_db_engine():
    """Create a test database engine that persists for the session."""
    if SQLMODEL_AVAILABLE:
        engine = create_engine("sqlite:///:memory:")
        SQLModel.metadata.create_all(engine)
        return engine
    else:
        return None


@pytest.fixture
def db_session(test_db_engine):
    """Create a database session for each test."""
    if SQLMODEL_AVAILABLE and test_db_engine:
        with Session(test_db_engine) as session:
            yield session
            session.rollback()
    else:
        yield None


@pytest.fixture
def mock_audio_service():
    """Create a mock audio description service."""
    service = Mock(spec=AudioDescriptionService)
    
    def generate_description(audio_path, category=None):
        result = Mock(spec=AudioDescriptionResult)
        result.audio_path = audio_path
        result.best_description = f"Mock description for {Path(audio_path).name}"
        result.confidence_score = 0.85
        result.model_used = "mock-model"
        result.descriptions = [
            {"text": result.best_description, "confidence": 0.85, "rank": 1},
            {"text": "Alternative description", "confidence": 0.75, "rank": 2}
        ]
        result.inference_time = 1.5
        result.embedding = [0.1] * 512  # Mock 512-dimensional embedding
        return result
    
    service.generate_description.side_effect = generate_description
    return service


@pytest.fixture
def mock_storage():
    """Create a mock storage service."""
    storage = Mock()
    storage.download_file.return_value = b"mock audio data"
    return storage


@pytest.fixture
def temp_audio_file():
    """Create a temporary audio file for testing."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        # Write some fake WAV header
        f.write(b"RIFF")
        f.write(b"\x00" * 100)  # Fake audio data
        temp_path = f.name
    
    yield temp_path
    
    # Cleanup
    os.unlink(temp_path)


@pytest.fixture
def sample_instrument_file():
    """Create a sample instrument file."""
    return InstrumentFile(
        id="test-instrument-1",
        file_name="piano_sample.wav",
        display_name="Grand Piano C4",
        storage_key="instruments/piano/grand_c4.wav",
        file_format="wav",
        file_size=1024000,
        category="piano",
        is_public=True,
        description="Manual description"
    )