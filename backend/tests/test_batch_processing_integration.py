"""
Integration tests for instrument description batch processing.

These tests verify the integration between different components
of the batch processing system.
"""

import pytest
import tempfile
import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import numpy as np
import sys
import os

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, create_engine, SQLModel
from app2.models.public_models.instrument_file import InstrumentFile
from audio_ml.audio_description_service import AudioDescriptionResult


@pytest.fixture
def test_database():
    """Create a test database."""
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture
def sample_instrument_files(test_database):
    """Create sample instrument files in the test database."""
    files = []
    
    with Session(test_database) as session:
        # Create files with various states
        categories = ["piano", "guitar", "drums", "synth"]
        
        for i in range(10):
            file = InstrumentFile(
                id=f"test-id-{i}",
                file_name=f"instrument_{i}.wav",
                display_name=f"Test Instrument {i}",
                storage_key=f"test/instrument_{i}.wav",
                file_format="wav",
                file_size=1024 * (i + 1),
                category=categories[i % len(categories)],
                is_public=True,
                description=None,
                description_generated=None if i < 7 else f"Existing description {i}",
                description_confidence=None if i < 7 else 0.8 + i * 0.01,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            session.add(file)
            files.append(file)
        
        session.commit()
    
    return files


class TestBatchProcessingIntegration:
    """Integration tests for the batch processing workflow."""
    
    def test_progress_tracking_accuracy(self, sample_instrument_files):
        """Test that progress tracking accurately reflects processing results."""
        from scripts.add_instrument_descriptions import ProgressTracker
        
        tracker = ProgressTracker()
        tracker.total = len(sample_instrument_files)
        
        # Simulate processing
        for i, file in enumerate(sample_instrument_files):
            if i < 5:
                tracker.record_success(file.id, f"Generated description {i}")
            elif i < 7:
                tracker.record_failure(file.id, "Processing error")
            else:
                tracker.record_skip(file.id, "Already has description")
        
        summary = tracker.get_summary()
        
        assert summary["total_files"] == 10
        assert summary["successful"] == 5
        assert summary["failed"] == 2
        assert summary["skipped"] == 3
        assert summary["success_rate"] == "50.0%"
    
    def test_filtering_by_category(self, test_database, sample_instrument_files):
        """Test that category filtering works correctly."""
        from sqlmodel import select, and_
        from app2.models.public_models.instrument_file import InstrumentFile
        
        with Session(test_database) as session:
            # Query for piano files without descriptions
            query = select(InstrumentFile).where(
                and_(
                    InstrumentFile.category == "piano",
                    InstrumentFile.description_generated.is_(None)
                )
            )
            
            piano_files = session.exec(query).all()
            
            # Should find piano files (indices 0, 4, 8 minus 8 which has description)
            assert len(piano_files) == 2
            assert all(f.category == "piano" for f in piano_files)
            assert all(f.description_generated is None for f in piano_files)
    
    def test_dry_run_mode(self, test_database, sample_instrument_files):
        """Test that dry run mode doesn't modify the database."""
        from scripts.add_instrument_descriptions import process_instrument_file, ProgressTracker
        
        # Get a file without description
        with Session(test_database) as session:
            file = session.get(InstrumentFile, "test-id-0")
            original_desc = file.description_generated
            
            # Mock services
            audio_result = Mock(spec=AudioDescriptionResult)
            audio_result.best_description = "New piano sound"
            audio_result.confidence_score = 0.95
            audio_result.model_used = "test-model"
            audio_result.descriptions = []
            audio_result.inference_time = 1.0
            audio_result.embedding = None
            
            audio_service = Mock()
            audio_service.generate_description.return_value = audio_result
            
            storage = Mock()
            storage.download_file.return_value = b"fake audio data"
            
            tracker = ProgressTracker()
            
            # Process in dry run mode
            import asyncio
            result = asyncio.run(process_instrument_file(
                file, audio_service, storage, tracker, dry_run=True
            ))
            
            assert result is True
            
            # Verify database wasn't modified
            session.refresh(file)
            assert file.description_generated == original_desc
    
    def test_quality_review_workflow(self):
        """Test the quality review workflow."""
        from scripts.quality_assurance_instruments import QualityReview
        
        review = QualityReview()
        
        # Simulate a review session
        test_files = [
            ("id1", "Piano melody", "approved", None, "Good description"),
            ("id2", "Guitar sound", "edited", "Acoustic guitar strumming", "More specific"),
            ("id3", "Drum beat", "rejected", None, "Too generic"),
            ("id4", "Synth pad", "approved", None, None),
        ]
        
        for file_id, orig_desc, status, edited_desc, notes in test_files:
            review.add_review(file_id, orig_desc, status, edited_desc, notes)
        
        stats = review.get_statistics()
        
        assert stats["total_reviewed"] == 4
        assert stats["approved"] == 2
        assert stats["edited"] == 1
        assert stats["rejected"] == 1
        assert stats["approval_rate"] == "50.0%"
        
        # Test export
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_path = Path(f.name)
        
        try:
            review.export_to_file(temp_path)
            
            with open(temp_path, 'r') as f:
                data = json.load(f)
            
            assert len(data["reviews"]) == 4
            assert data["metadata"]["statistics"]["total_reviewed"] == 4
        finally:
            temp_path.unlink()
    
    def test_statistics_generation(self, test_database, sample_instrument_files):
        """Test statistics generation from processed files."""
        from scripts.generate_instrument_statistics import InstrumentStatistics
        
        stats = InstrumentStatistics()
        
        # Add all sample files to statistics
        for file in sample_instrument_files:
            stats.add_file(file)
        
        summary = stats.get_summary()
        
        assert summary["total_files"] == 10
        assert summary["files_with_descriptions"] == 3  # Files 7, 8, 9 have descriptions
        assert summary["files_without_descriptions"] == 7
        assert summary["coverage_percentage"] == "30.0%"
        
        # Check category distribution
        assert summary["categories"]["piano"] == 3
        assert summary["categories"]["guitar"] == 3
        assert summary["categories"]["drums"] == 2
        assert summary["categories"]["synth"] == 2
    
    def test_embedding_storage(self):
        """Test that embeddings are properly stored and retrieved."""
        # Create a file with embedding
        embedding_data = np.random.rand(512).tolist()
        
        file = InstrumentFile(
            id="test-embedding",
            file_name="test.wav",
            display_name="Test",
            storage_key="test/test.wav",
            file_format="wav",
            file_size=1024,
            category="piano",
            is_public=True,
            description_embedding=embedding_data,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        # Verify embedding is stored correctly
        assert file.description_embedding == embedding_data
        assert len(file.description_embedding) == 512
        assert all(isinstance(x, float) for x in file.description_embedding)
    
    def test_concurrent_processing_simulation(self):
        """Test concurrent processing behavior."""
        from scripts.add_instrument_descriptions import process_batch, ProgressTracker
        
        # Create mock files
        files = []
        for i in range(20):
            file = Mock(spec=InstrumentFile)
            file.id = f"concurrent-{i}"
            file.file_format = "wav"
            file.storage_key = f"test/file{i}.wav"
            file.display_name = f"Instrument {i}"
            file.category = "piano"
            files.append(file)
        
        # Mock services with variable processing times
        audio_service = Mock()
        storage = Mock()
        
        def mock_generate_description(path, category):
            # Simulate variable processing time
            import time
            import random
            time.sleep(random.uniform(0.01, 0.05))
            
            result = Mock(spec=AudioDescriptionResult)
            result.best_description = f"Description for {path}"
            result.confidence_score = random.uniform(0.7, 0.99)
            result.model_used = "test-model"
            result.descriptions = []
            result.inference_time = random.uniform(0.5, 2.0)
            result.embedding = None
            return result
        
        audio_service.generate_description.side_effect = mock_generate_description
        storage.download_file.return_value = b"fake audio data"
        
        tracker = ProgressTracker()
        tracker.total = len(files)
        
        # Process with different concurrency levels
        import asyncio
        
        # Test with 5 concurrent workers
        asyncio.run(process_batch(
            files[:10], audio_service, storage, tracker,
            dry_run=True, concurrent_workers=5
        ))
        
        assert tracker.processed == 10
        assert tracker.successful == 10
        
        # Test with 1 concurrent worker (sequential)
        tracker2 = ProgressTracker()
        tracker2.total = 10
        
        asyncio.run(process_batch(
            files[10:20], audio_service, storage, tracker2,
            dry_run=True, concurrent_workers=1
        ))
        
        assert tracker2.processed == 10
        assert tracker2.successful == 10


class TestErrorHandling:
    """Test error handling in various scenarios."""
    
    def test_storage_error_handling(self):
        """Test handling of storage access errors."""
        from scripts.add_instrument_descriptions import process_instrument_file, ProgressTracker
        
        file = Mock(spec=InstrumentFile)
        file.id = "error-test"
        file.file_format = "wav"
        file.storage_key = "test/error.wav"
        
        audio_service = Mock()
        storage = Mock()
        storage.download_file.side_effect = Exception("Storage access denied")
        
        tracker = ProgressTracker()
        
        import asyncio
        result = asyncio.run(process_instrument_file(
            file, audio_service, storage, tracker, dry_run=False
        ))
        
        assert result is False
        assert tracker.failed == 1
        assert "Storage access denied" in tracker.errors[0]["error"]
    
    def test_model_error_handling(self):
        """Test handling of model processing errors."""
        from scripts.add_instrument_descriptions import process_instrument_file, ProgressTracker
        
        file = Mock(spec=InstrumentFile)
        file.id = "model-error"
        file.file_format = "wav"
        file.storage_key = "test/model_error.wav"
        
        audio_service = Mock()
        audio_service.generate_description.side_effect = Exception("Model initialization failed")
        
        storage = Mock()
        storage.download_file.return_value = b"fake audio data"
        
        tracker = ProgressTracker()
        
        import asyncio
        result = asyncio.run(process_instrument_file(
            file, audio_service, storage, tracker, dry_run=False
        ))
        
        assert result is False
        assert tracker.failed == 1
        assert "Model initialization failed" in tracker.errors[0]["error"]
    
    def test_database_error_handling(self):
        """Test handling of database errors during update."""
        from scripts.add_instrument_descriptions import process_instrument_file, ProgressTracker
        
        file = Mock(spec=InstrumentFile)
        file.id = "db-error"
        file.file_format = "wav"
        file.storage_key = "test/db_error.wav"
        
        # Mock successful processing but database error
        audio_result = Mock(spec=AudioDescriptionResult)
        audio_result.best_description = "Test description"
        audio_result.confidence_score = 0.9
        audio_result.model_used = "test-model"
        audio_result.descriptions = []
        audio_result.inference_time = 1.0
        audio_result.embedding = None
        
        audio_service = Mock()
        audio_service.generate_description.return_value = audio_result
        
        storage = Mock()
        storage.download_file.return_value = b"fake audio data"
        
        tracker = ProgressTracker()
        
        # Mock database error
        with patch('scripts.add_instrument_descriptions.get_session') as mock_session:
            mock_session.return_value.__next__.return_value.get.return_value = None
            
            import asyncio
            result = asyncio.run(process_instrument_file(
                file, audio_service, storage, tracker, dry_run=False
            ))
            
            assert result is False
            assert tracker.failed == 1
            assert "not found in database" in tracker.errors[0]["error"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])