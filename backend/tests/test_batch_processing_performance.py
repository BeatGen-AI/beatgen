"""
Performance tests for batch processing to ensure it can handle large volumes.
"""

import pytest
import time
import asyncio
from unittest.mock import Mock, patch
from datetime import datetime, timezone
import sys
import os

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.add_instrument_descriptions import (
    ProgressTracker,
    process_batch
)
from scripts.generate_instrument_statistics import InstrumentStatistics
from app2.models.public_models.instrument_file import InstrumentFile
from audio_ml.audio_description_service import AudioDescriptionResult


class TestPerformance:
    """Performance tests for batch processing."""
    
    @pytest.mark.asyncio
    async def test_large_batch_processing(self):
        """Test processing a large batch of files."""
        # Create 1000 mock files
        files = []
        for i in range(1000):
            file = Mock(spec=InstrumentFile)
            file.id = f"perf-test-{i}"
            file.file_format = "wav"
            file.storage_key = f"test/file{i}.wav"
            file.display_name = f"Instrument {i}"
            file.category = ["piano", "guitar", "drums", "synth"][i % 4]
            files.append(file)
        
        # Mock services with minimal delay
        audio_service = Mock()
        storage = Mock()
        
        def mock_generate_fast(path, category):
            result = Mock(spec=AudioDescriptionResult)
            result.best_description = f"Fast description"
            result.confidence_score = 0.9
            result.model_used = "test-model"
            result.descriptions = []
            result.inference_time = 0.01
            result.embedding = None
            return result
        
        audio_service.generate_description.side_effect = mock_generate_fast
        storage.download_file.return_value = b"data"
        
        tracker = ProgressTracker()
        tracker.total = len(files)
        
        # Time the processing
        start_time = time.time()
        
        await process_batch(
            files, audio_service, storage, tracker,
            dry_run=True, concurrent_workers=50
        )
        
        elapsed = time.time() - start_time
        
        # Should process 1000 files quickly with high concurrency
        assert tracker.processed == 1000
        assert tracker.successful == 1000
        assert elapsed < 30  # Should complete within 30 seconds
        
        # Calculate throughput
        throughput = tracker.processed / elapsed
        print(f"\nThroughput: {throughput:.1f} files/second")
        assert throughput > 30  # Should process at least 30 files/second
    
    def test_progress_tracker_performance(self):
        """Test ProgressTracker performance with many entries."""
        tracker = ProgressTracker()
        tracker.total = 10000
        
        start_time = time.time()
        
        # Record many entries
        for i in range(10000):
            if i % 3 == 0:
                tracker.record_success(f"id-{i}", f"desc-{i}")
            elif i % 3 == 1:
                tracker.record_failure(f"id-{i}", f"error-{i}")
            else:
                tracker.record_skip(f"id-{i}", f"reason-{i}")
        
        elapsed = time.time() - start_time
        
        # Should handle 10k entries quickly
        assert elapsed < 5  # Should complete within 5 seconds
        
        # Verify summary generation is also fast
        summary_start = time.time()
        summary = tracker.get_summary()
        summary_elapsed = time.time() - summary_start
        
        assert summary_elapsed < 0.1  # Summary should generate in < 100ms
        assert summary["total_files"] == 10000
        assert summary["processed"] == 10000
    
    def test_statistics_performance(self):
        """Test statistics generation performance with many files."""
        stats = InstrumentStatistics()
        
        # Create many mock files
        files = []
        for i in range(5000):
            file = Mock(spec=InstrumentFile)
            file.category = ["piano", "guitar", "drums", "synth"][i % 4]
            file.description_generated = f"Description {i}" if i % 2 == 0 else None
            file.description_confidence = 0.7 + (i % 30) / 100 if i % 2 == 0 else None
            file.description_model = "test-model" if i % 2 == 0 else None
            file.description_candidates = {"inference_time": 1.0 + i % 5} if i % 2 == 0 else None
            file.description_generated_at = datetime.now(timezone.utc) if i % 2 == 0 else None
            files.append(file)
        
        # Time statistics generation
        start_time = time.time()
        
        for file in files:
            stats.add_file(file)
        
        summary = stats.get_summary()
        
        elapsed = time.time() - start_time
        
        # Should handle 5k files quickly
        assert elapsed < 2  # Should complete within 2 seconds
        assert summary["total_files"] == 5000
        assert summary["files_with_descriptions"] == 2500
    
    @pytest.mark.asyncio
    async def test_concurrent_workers_scaling(self):
        """Test how performance scales with different numbers of workers."""
        # Create test files
        files = []
        for i in range(100):
            file = Mock(spec=InstrumentFile)
            file.id = f"scale-test-{i}"
            file.file_format = "wav"
            file.storage_key = f"test/file{i}.wav"
            file.display_name = f"Instrument {i}"
            file.category = "piano"
            files.append(file)
        
        # Mock services with simulated processing delay
        audio_service = Mock()
        storage = Mock()
        
        def mock_generate_with_delay(path, category):
            # Simulate 100ms processing time
            time.sleep(0.1)
            result = Mock(spec=AudioDescriptionResult)
            result.best_description = "Description"
            result.confidence_score = 0.9
            result.model_used = "test-model"
            result.descriptions = []
            result.inference_time = 0.1
            result.embedding = None
            return result
        
        audio_service.generate_description.side_effect = mock_generate_with_delay
        storage.download_file.return_value = b"data"
        
        results = {}
        
        # Test with different worker counts
        for workers in [1, 5, 10, 20]:
            tracker = ProgressTracker()
            tracker.total = len(files)
            
            start_time = time.time()
            
            await process_batch(
                files, audio_service, storage, tracker,
                dry_run=True, concurrent_workers=workers
            )
            
            elapsed = time.time() - start_time
            throughput = tracker.processed / elapsed
            
            results[workers] = {
                "elapsed": elapsed,
                "throughput": throughput
            }
            
            print(f"\nWorkers: {workers}, Time: {elapsed:.1f}s, Throughput: {throughput:.1f} files/s")
        
        # Verify scaling improvements
        assert results[5]["throughput"] > results[1]["throughput"] * 3
        assert results[10]["throughput"] > results[5]["throughput"] * 1.5
    
    def test_memory_efficiency(self):
        """Test memory efficiency with large datasets."""
        import gc
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Create and process many items
        tracker = ProgressTracker()
        tracker.total = 50000
        
        for i in range(50000):
            tracker.record_success(f"id-{i}", f"Long description that takes up some memory {i}")
            
            # Periodically check memory
            if i % 10000 == 0:
                gc.collect()
                current_memory = process.memory_info().rss / 1024 / 1024
                memory_increase = current_memory - initial_memory
                print(f"\nAfter {i} items: Memory increase: {memory_increase:.1f} MB")
        
        # Final memory check
        gc.collect()
        final_memory = process.memory_info().rss / 1024 / 1024
        total_increase = final_memory - initial_memory
        
        print(f"\nTotal memory increase: {total_increase:.1f} MB")
        
        # Memory increase should be reasonable (less than 500MB for 50k items)
        assert total_increase < 500
    
    @pytest.mark.asyncio
    async def test_error_recovery_performance(self):
        """Test that errors don't significantly impact performance."""
        # Create files where some will fail
        files = []
        for i in range(500):
            file = Mock(spec=InstrumentFile)
            file.id = f"error-test-{i}"
            file.file_format = "wav"
            file.storage_key = f"test/file{i}.wav"
            file.display_name = f"Instrument {i}"
            file.category = "piano"
            files.append(file)
        
        # Mock services with some failures
        audio_service = Mock()
        storage = Mock()
        
        def mock_generate_with_errors(path, category):
            # Fail 20% of the time
            import random
            if random.random() < 0.2:
                raise Exception("Simulated processing error")
            
            result = Mock(spec=AudioDescriptionResult)
            result.best_description = "Description"
            result.confidence_score = 0.9
            result.model_used = "test-model"
            result.descriptions = []
            result.inference_time = 0.01
            result.embedding = None
            return result
        
        audio_service.generate_description.side_effect = mock_generate_with_errors
        storage.download_file.return_value = b"data"
        
        tracker = ProgressTracker()
        tracker.total = len(files)
        
        start_time = time.time()
        
        await process_batch(
            files, audio_service, storage, tracker,
            dry_run=False, concurrent_workers=20
        )
        
        elapsed = time.time() - start_time
        
        # Should still complete quickly despite errors
        assert elapsed < 10
        assert tracker.processed == 500
        assert tracker.failed > 50  # Should have some failures
        assert tracker.successful > 300  # But most should succeed
        
        # Error rate should be close to expected 20%
        error_rate = tracker.failed / tracker.processed
        assert 0.15 < error_rate < 0.25


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])