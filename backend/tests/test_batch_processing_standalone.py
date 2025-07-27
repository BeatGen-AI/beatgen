"""
Standalone unit tests for batch processing that don't require SQLModel.
These tests focus on the core logic without database dependencies.
"""

import pytest
import asyncio
import tempfile
import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class MockInstrumentFile:
    """Mock InstrumentFile for testing without SQLModel."""
    def __init__(self, **kwargs):
        self.id = kwargs.get('id', 'test-id')
        self.file_format = kwargs.get('file_format', 'wav')
        self.storage_key = kwargs.get('storage_key', 'test/file.wav')
        self.display_name = kwargs.get('display_name', 'Test Instrument')
        self.category = kwargs.get('category', 'piano')
        self.description_generated = kwargs.get('description_generated', None)
        self.description_confidence = kwargs.get('description_confidence', None)
        self.description_model = kwargs.get('description_model', None)
        self.description_candidates = kwargs.get('description_candidates', None)
        self.description_embedding = kwargs.get('description_embedding', None)
        self.description_generated_at = kwargs.get('description_generated_at', None)


class MockAudioDescriptionResult:
    """Mock AudioDescriptionResult for testing."""
    def __init__(self):
        self.best_description = "Mock piano melody"
        self.confidence_score = 0.92
        self.model_used = "mock-clap-model"
        self.descriptions = [
            {"text": "Mock piano melody", "confidence": 0.92, "rank": 1},
            {"text": "Piano sound", "confidence": 0.85, "rank": 2}
        ]
        self.inference_time = 1.23
        self.embedding = None


class TestProgressTrackerStandalone:
    """Test the ProgressTracker without database dependencies."""
    
    def test_progress_tracker_basic(self):
        """Test basic ProgressTracker functionality."""
        # Import here to avoid issues at module level
        from scripts.add_instrument_descriptions import ProgressTracker
        
        tracker = ProgressTracker()
        tracker.total = 10
        
        # Test recording different outcomes
        tracker.record_success("id1", "Description 1")
        tracker.record_success("id2", "Description 2")
        tracker.record_failure("id3", "Connection error")
        tracker.record_skip("id4", "Already processed")
        
        assert tracker.processed == 4
        assert tracker.successful == 2
        assert tracker.failed == 1
        assert tracker.skipped == 1
        
        summary = tracker.get_summary()
        assert summary["total_files"] == 10
        assert summary["processed"] == 4
        assert summary["success_rate"] == "50.0%"
    
    def test_progress_tracker_error_collection(self):
        """Test error collection in ProgressTracker."""
        from scripts.add_instrument_descriptions import ProgressTracker
        
        tracker = ProgressTracker()
        
        # Record multiple failures
        tracker.record_failure("id1", "Error 1")
        tracker.record_failure("id2", "Error 2")
        tracker.record_failure("id3", "Error 3")
        
        assert len(tracker.errors) == 3
        assert tracker.errors[0]["file_id"] == "id1"
        assert tracker.errors[0]["error"] == "Error 1"
        assert "timestamp" in tracker.errors[0]
    
    def test_progress_logging(self):
        """Test progress logging at intervals."""
        from scripts.add_instrument_descriptions import ProgressTracker
        
        tracker = ProgressTracker()
        tracker.total = 100
        
        # Process exactly 10 items to trigger logging
        for i in range(10):
            tracker.record_success(f"id{i}", f"desc{i}")
        
        # Should have logged progress
        assert tracker.processed == 10
        assert tracker.successful == 10


class TestQualityReviewStandalone:
    """Test QualityReview without database dependencies."""
    
    def test_quality_review_basic(self):
        """Test basic QualityReview functionality."""
        from scripts.quality_assurance_instruments import QualityReview
        
        review = QualityReview()
        
        # Add reviews
        review.add_review("id1", "Piano sound", "approved")
        review.add_review("id2", "Guitar", "edited", "Acoustic guitar")
        review.add_review("id3", "Drum", "rejected", notes="Too vague")
        
        assert len(review.reviews) == 3
        
        stats = review.get_statistics()
        assert stats["total_reviewed"] == 3
        assert stats["approved"] == 1
        assert stats["edited"] == 1
        assert stats["rejected"] == 1
    
    def test_quality_review_export(self):
        """Test exporting quality review data."""
        from scripts.quality_assurance_instruments import QualityReview
        
        review = QualityReview()
        review.add_review("id1", "Description", "approved")
        
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_path = Path(f.name)
        
        try:
            review.export_to_file(temp_path)
            
            # Verify file was created and contains expected data
            with open(temp_path, 'r') as f:
                data = json.load(f)
            
            assert "metadata" in data
            assert "reviews" in data
            assert data["metadata"]["statistics"]["total_reviewed"] == 1
        finally:
            temp_path.unlink()


class TestStatisticsStandalone:
    """Test InstrumentStatistics without database dependencies."""
    
    def test_statistics_basic(self):
        """Test basic statistics collection."""
        from scripts.generate_instrument_statistics import InstrumentStatistics
        
        stats = InstrumentStatistics()
        
        # Add files without descriptions
        for i in range(5):
            file = MockInstrumentFile(
                id=f"no-desc-{i}",
                category="piano" if i < 3 else "guitar"
            )
            stats.add_file(file)
        
        # Add files with descriptions
        for i in range(3):
            file = MockInstrumentFile(
                id=f"with-desc-{i}",
                category="drums",
                description_generated="Drum hit",
                description_confidence=0.8 + i * 0.05,
                description_model="test-model"
            )
            stats.add_file(file)
        
        assert stats.total_files == 8
        assert stats.files_with_descriptions == 3
        assert stats.files_without_descriptions == 5
        
        summary = stats.get_summary()
        assert summary["coverage_percentage"] == "37.5%"
        assert summary["categories"]["piano"] == 3
        assert summary["categories"]["guitar"] == 2
        assert summary["categories"]["drums"] == 3
    
    def test_statistics_metrics(self):
        """Test calculation of various metrics."""
        from scripts.generate_instrument_statistics import InstrumentStatistics
        
        stats = InstrumentStatistics()
        
        # Add files with varying confidence scores
        confidences = [0.7, 0.8, 0.9, 0.85, 0.95]
        for i, conf in enumerate(confidences):
            file = MockInstrumentFile(
                id=f"file-{i}",
                description_generated=f"Description {i}",
                description_confidence=conf,
                description_model="model-v1",
                description_candidates={"inference_time": 1.0 + i * 0.5}
            )
            stats.add_file(file)
        
        summary = stats.get_summary()
        
        # Check confidence statistics
        assert "confidence_stats" in summary
        conf_stats = summary["confidence_stats"]
        assert 0.84 < conf_stats["mean"] < 0.86  # Should be around 0.85
        assert conf_stats["min"] == 0.7
        assert conf_stats["max"] == 0.95


@pytest.mark.asyncio
class TestBatchProcessingAsync:
    """Test async batch processing functions."""
    
    async def test_process_instrument_file_mock(self):
        """Test processing a single file with mocked dependencies."""
        # Mock all dependencies
        with patch('scripts.add_instrument_descriptions.get_session'):
            with patch('scripts.add_instrument_descriptions.ProgressTracker') as MockTracker:
                with patch('scripts.add_instrument_descriptions.asyncio.get_event_loop') as mock_loop:
                    # Setup mocks
                    tracker = Mock()
                    MockTracker.return_value = tracker
                    
                    file = MockInstrumentFile(id="test-1")
                    audio_service = Mock()
                    audio_service.generate_description.return_value = MockAudioDescriptionResult()
                    storage = Mock()
                    storage.download_file.return_value = b"fake audio"
                    
                    # Mock the event loop
                    loop = Mock()
                    mock_loop.return_value = loop
                    
                    # Make run_in_executor return completed futures
                    async def mock_executor(executor, func, *args):
                        return func(*args)
                    
                    loop.run_in_executor.side_effect = mock_executor
                    
                    # Import and test
                    from scripts.add_instrument_descriptions import process_instrument_file
                    
                    result = await process_instrument_file(
                        file, audio_service, storage, tracker, dry_run=True
                    )
                    
                    # Should succeed in dry run mode
                    assert result is True
    
    async def test_concurrent_batch_processing(self):
        """Test concurrent processing of multiple files."""
        with patch('scripts.add_instrument_descriptions.process_instrument_file') as mock_process:
            # Make process_instrument_file return True
            async def mock_process_impl(*args, **kwargs):
                return True
            
            mock_process.side_effect = mock_process_impl
            
            from scripts.add_instrument_descriptions import process_batch, ProgressTracker
            
            # Create mock files
            files = [MockInstrumentFile(id=f"batch-{i}") for i in range(10)]
            
            audio_service = Mock()
            storage = Mock()
            tracker = ProgressTracker()
            
            await process_batch(
                files, audio_service, storage, tracker,
                dry_run=True, concurrent_workers=3
            )
            
            # Should have called process_instrument_file for each file
            assert mock_process.call_count == 10


class TestMainFunction:
    """Test the main function with mocked dependencies."""
    
    @pytest.mark.asyncio
    async def test_main_no_files(self):
        """Test main when no files need processing."""
        args = Mock()
        args.dry_run = False
        args.force = False
        args.category = None
        args.limit = None
        args.concurrent = 5
        
        with patch('scripts.add_instrument_descriptions.get_session') as mock_session:
            # Mock empty result
            mock_exec = Mock()
            mock_exec.all.return_value = []
            mock_session.return_value.__next__.return_value.exec.return_value = mock_exec
            
            with patch('scripts.add_instrument_descriptions.AudioDescriptionService'):
                with patch('scripts.add_instrument_descriptions.SupabaseStorage'):
                    from scripts.add_instrument_descriptions import main
                    
                    # Should complete without error
                    await main(args)


if __name__ == "__main__":
    # Run standalone tests
    pytest.main([__file__, "-v", "-s"])