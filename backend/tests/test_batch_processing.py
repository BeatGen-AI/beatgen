"""
Unit tests for instrument description batch processing.
"""

import pytest
import asyncio
import tempfile
import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from uuid import uuid4
import sys
import os

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.add_instrument_descriptions import (
    ProgressTracker,
    process_instrument_file,
    process_batch,
    main
)
from scripts.quality_assurance_instruments import QualityReview
from scripts.generate_instrument_statistics import InstrumentStatistics

from app2.models.public_models.instrument_file import InstrumentFile
from audio_ml.audio_description_service import AudioDescriptionResult


class TestProgressTracker:
    """Test the ProgressTracker class."""
    
    def test_initialization(self):
        """Test ProgressTracker initialization."""
        tracker = ProgressTracker()
        assert tracker.total == 0
        assert tracker.processed == 0
        assert tracker.successful == 0
        assert tracker.failed == 0
        assert tracker.skipped == 0
        assert tracker.errors == []
    
    def test_record_success(self):
        """Test recording successful processing."""
        tracker = ProgressTracker()
        file_id = uuid4()
        description = "Test description"
        
        tracker.record_success(file_id, description)
        
        assert tracker.processed == 1
        assert tracker.successful == 1
        assert tracker.failed == 0
        assert tracker.skipped == 0
    
    def test_record_failure(self):
        """Test recording failed processing."""
        tracker = ProgressTracker()
        file_id = uuid4()
        error = "Test error"
        
        tracker.record_failure(file_id, error)
        
        assert tracker.processed == 1
        assert tracker.successful == 0
        assert tracker.failed == 1
        assert tracker.skipped == 0
        assert len(tracker.errors) == 1
        assert tracker.errors[0]["error"] == error
    
    def test_record_skip(self):
        """Test recording skipped files."""
        tracker = ProgressTracker()
        file_id = uuid4()
        reason = "Already processed"
        
        tracker.record_skip(file_id, reason)
        
        assert tracker.processed == 1
        assert tracker.successful == 0
        assert tracker.failed == 0
        assert tracker.skipped == 1
    
    def test_get_summary(self):
        """Test summary generation."""
        tracker = ProgressTracker()
        tracker.total = 10
        
        # Record various outcomes
        tracker.record_success(uuid4(), "desc1")
        tracker.record_success(uuid4(), "desc2")
        tracker.record_failure(uuid4(), "error1")
        tracker.record_skip(uuid4(), "reason1")
        
        summary = tracker.get_summary()
        
        assert summary["total_files"] == 10
        assert summary["processed"] == 4
        assert summary["successful"] == 2
        assert summary["failed"] == 1
        assert summary["skipped"] == 1
        assert summary["success_rate"] == "50.0%"
        assert summary["error_count"] == 1
        assert "duration_seconds" in summary
        assert "duration_human" in summary


class TestProcessInstrumentFile:
    """Test the process_instrument_file function."""
    
    @pytest.mark.asyncio
    async def test_successful_processing(self):
        """Test successful file processing."""
        # Mock objects
        file = Mock(spec=InstrumentFile)
        file.id = uuid4()
        file.file_format = "wav"
        file.storage_key = "test/file.wav"
        file.display_name = "Test Instrument"
        file.category = "piano"
        
        # Mock audio service result
        audio_result = Mock(spec=AudioDescriptionResult)
        audio_result.best_description = "Piano melody"
        audio_result.confidence_score = 0.95
        audio_result.model_used = "test-model"
        audio_result.descriptions = [
            {"text": "Piano melody", "confidence": 0.95, "rank": 1},
            {"text": "Piano sound", "confidence": 0.90, "rank": 2}
        ]
        audio_result.inference_time = 1.5
        audio_result.embedding = None
        
        audio_service = Mock()
        audio_service.generate_description.return_value = audio_result
        
        storage = Mock()
        storage.download_file.return_value = b"fake audio data"
        
        tracker = ProgressTracker()
        
        # Test dry run
        result = await process_instrument_file(
            file, audio_service, storage, tracker, dry_run=True
        )
        
        assert result is True
        assert tracker.successful == 1
        assert tracker.failed == 0
        
    @pytest.mark.asyncio
    async def test_failed_processing(self):
        """Test handling of processing failures."""
        file = Mock(spec=InstrumentFile)
        file.id = uuid4()
        file.file_format = "wav"
        file.storage_key = "test/file.wav"
        
        audio_service = Mock()
        audio_service.generate_description.return_value = None
        
        storage = Mock()
        storage.download_file.return_value = b"fake audio data"
        
        tracker = ProgressTracker()
        
        result = await process_instrument_file(
            file, audio_service, storage, tracker, dry_run=False
        )
        
        assert result is False
        assert tracker.successful == 0
        assert tracker.failed == 1
    
    @pytest.mark.asyncio
    async def test_download_failure(self):
        """Test handling of download failures."""
        file = Mock(spec=InstrumentFile)
        file.id = uuid4()
        file.file_format = "wav"
        file.storage_key = "test/file.wav"
        
        audio_service = Mock()
        storage = Mock()
        storage.download_file.side_effect = Exception("Download failed")
        
        tracker = ProgressTracker()
        
        result = await process_instrument_file(
            file, audio_service, storage, tracker, dry_run=False
        )
        
        assert result is False
        assert tracker.failed == 1
        assert "Download failed" in tracker.errors[0]["error"]


class TestProcessBatch:
    """Test the process_batch function."""
    
    @pytest.mark.asyncio
    async def test_batch_processing(self):
        """Test processing multiple files concurrently."""
        # Create test files
        files = []
        for i in range(5):
            file = Mock(spec=InstrumentFile)
            file.id = uuid4()
            file.file_format = "wav"
            file.storage_key = f"test/file{i}.wav"
            file.display_name = f"Instrument {i}"
            file.category = "piano"
            files.append(file)
        
        # Mock services
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
        tracker.total = len(files)
        
        # Process batch
        await process_batch(
            files, audio_service, storage, tracker, 
            dry_run=True, concurrent_workers=3
        )
        
        assert tracker.processed == 5
        assert tracker.successful == 5
        assert tracker.failed == 0


class TestQualityReview:
    """Test the QualityReview class."""
    
    def test_add_review(self):
        """Test adding review entries."""
        review = QualityReview()
        
        review.add_review(
            file_id="test-id",
            original_desc="Original description",
            review_status="approved",
            notes="Looks good"
        )
        
        assert len(review.reviews) == 1
        assert review.reviews[0]["file_id"] == "test-id"
        assert review.reviews[0]["review_status"] == "approved"
        assert review.reviews[0]["notes"] == "Looks good"
    
    def test_get_statistics(self):
        """Test statistics calculation."""
        review = QualityReview()
        
        # Add various reviews
        review.add_review("1", "desc1", "approved")
        review.add_review("2", "desc2", "approved")
        review.add_review("3", "desc3", "edited", edited_desc="new desc")
        review.add_review("4", "desc4", "rejected", notes="Poor quality")
        
        stats = review.get_statistics()
        
        assert stats["total_reviewed"] == 4
        assert stats["approved"] == 2
        assert stats["edited"] == 1
        assert stats["rejected"] == 1
        assert stats["approval_rate"] == "50.0%"
        assert stats["edit_rate"] == "25.0%"
        assert stats["rejection_rate"] == "25.0%"
    
    def test_export_to_file(self):
        """Test exporting review data."""
        review = QualityReview()
        review.add_review("1", "desc1", "approved")
        
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            temp_path = Path(f.name)
        
        try:
            review.export_to_file(temp_path)
            
            # Verify file contents
            with open(temp_path, 'r') as f:
                data = json.load(f)
            
            assert "metadata" in data
            assert "reviews" in data
            assert len(data["reviews"]) == 1
            assert data["reviews"][0]["file_id"] == "1"
        finally:
            temp_path.unlink()


class TestInstrumentStatistics:
    """Test the InstrumentStatistics class."""
    
    def test_add_file_without_description(self):
        """Test adding a file without description."""
        stats = InstrumentStatistics()
        
        file = Mock(spec=InstrumentFile)
        file.category = "piano"
        file.description_generated = None
        
        stats.add_file(file)
        
        assert stats.total_files == 1
        assert stats.files_without_descriptions == 1
        assert stats.files_with_descriptions == 0
        assert stats.categories["piano"] == 1
    
    def test_add_file_with_description(self):
        """Test adding a file with description."""
        stats = InstrumentStatistics()
        
        file = Mock(spec=InstrumentFile)
        file.category = "guitar"
        file.description_generated = "Acoustic guitar strumming"
        file.description_confidence = 0.92
        file.description_model = "clap-model"
        file.description_candidates = {"inference_time": 2.5}
        file.description_generated_at = datetime.now(timezone.utc)
        
        stats.add_file(file)
        
        assert stats.total_files == 1
        assert stats.files_with_descriptions == 1
        assert stats.files_without_descriptions == 0
        assert stats.categories["guitar"] == 1
        assert stats.confidence_scores == [0.92]
        assert stats.description_lengths == [len("Acoustic guitar strumming")]
        assert stats.models_used["clap-model"] == 1
        assert stats.processing_times == [2.5]
    
    def test_get_summary(self):
        """Test summary generation."""
        stats = InstrumentStatistics()
        
        # Add files with different properties
        for i in range(5):
            file = Mock(spec=InstrumentFile)
            file.category = "piano" if i < 3 else "guitar"
            file.description_generated = f"Description {i}" if i < 4 else None
            file.description_confidence = 0.8 + i * 0.05 if i < 4 else None
            file.description_model = "test-model" if i < 4 else None
            file.description_candidates = {"inference_time": 1.0 + i * 0.5} if i < 4 else None
            file.description_generated_at = datetime.now(timezone.utc) if i < 4 else None
            
            stats.add_file(file)
        
        summary = stats.get_summary()
        
        assert summary["total_files"] == 5
        assert summary["files_with_descriptions"] == 4
        assert summary["files_without_descriptions"] == 1
        assert summary["coverage_percentage"] == "80.0%"
        assert summary["categories"]["piano"] == 3
        assert summary["categories"]["guitar"] == 2
        assert "confidence_stats" in summary
        assert "description_length_stats" in summary
        assert "processing_time_stats" in summary
        assert "most_common_descriptions" in summary


class TestMainFunction:
    """Test the main function with mocked dependencies."""
    
    @pytest.mark.asyncio
    async def test_main_with_no_files(self):
        """Test main function when no files need processing."""
        args = Mock()
        args.dry_run = False
        args.force = False
        args.category = None
        args.limit = None
        args.concurrent = 5
        
        with patch('scripts.add_instrument_descriptions.get_session') as mock_session:
            # Mock empty query result
            mock_exec = Mock()
            mock_exec.all.return_value = []
            mock_session.return_value.__next__.return_value.exec.return_value = mock_exec
            
            with patch('scripts.add_instrument_descriptions.AudioDescriptionService'):
                with patch('scripts.add_instrument_descriptions.SupabaseStorage'):
                    await main(args)
        
        # Should complete without errors when no files to process
        assert True
    
    @pytest.mark.asyncio
    async def test_main_with_limit(self):
        """Test main function with limit parameter."""
        args = Mock()
        args.dry_run = True
        args.force = False
        args.category = None
        args.limit = 2
        args.concurrent = 5
        
        # Create mock files
        files = []
        for i in range(5):
            file = Mock(spec=InstrumentFile)
            file.id = uuid4()
            file.file_format = "wav"
            file.storage_key = f"test/file{i}.wav"
            file.display_name = f"Instrument {i}"
            file.category = "piano"
            file.description_generated = None
            files.append(file)
        
        with patch('scripts.add_instrument_descriptions.get_session') as mock_session:
            mock_exec = Mock()
            mock_exec.all.return_value = files[:2]  # Should respect limit
            mock_session.return_value.__next__.return_value.exec.return_value = mock_exec
            
            with patch('scripts.add_instrument_descriptions.AudioDescriptionService'):
                with patch('scripts.add_instrument_descriptions.SupabaseStorage'):
                    with patch('scripts.add_instrument_descriptions.process_batch') as mock_process:
                        await main(args)
                        
                        # Verify only 2 files were processed
                        call_args = mock_process.call_args[0]
                        assert len(call_args[0]) == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])