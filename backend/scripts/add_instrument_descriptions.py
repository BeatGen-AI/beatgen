#!/usr/bin/env python3
"""
Batch processing script to generate descriptions for instrument files.

This script:
1. Queries all instrument files from the database
2. Downloads audio files from Supabase storage
3. Generates descriptions using the AudioDescriptionService
4. Updates database records with generated descriptions
5. Supports concurrent processing for efficiency

Usage:
    python scripts/add_instrument_descriptions.py [options]
    
Options:
    --dry-run            Preview what would be processed without making changes
    --limit N            Process only N files (for testing)
    --category CATEGORY  Process only files in a specific category
    --force              Regenerate descriptions for files that already have them
    --concurrent N       Number of concurrent workers (default: 5)
"""

import asyncio
import argparse
import json
import logging
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any
from uuid import UUID

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select, and_
from app2.infrastructure.database.sqlmodel_client import get_session
from app2.models.public_models.instrument_file import InstrumentFile
from audio_ml.audio_description_service import AudioDescriptionService
from app2.infrastructure.storage.supabase_storage import SupabaseStorage
from app2.core.logging import get_logger
from app2.core.config import get_settings

# Configure logging
logger = get_logger(__name__)
settings = get_settings()

# Progress tracking
class ProgressTracker:
    def __init__(self):
        self.total = 0
        self.processed = 0
        self.successful = 0
        self.failed = 0
        self.skipped = 0
        self.errors: List[Dict[str, Any]] = []
        self.start_time = datetime.now(timezone.utc)
    
    def record_success(self, file_id: UUID, description: str):
        self.processed += 1
        self.successful += 1
        logger.info(f"✓ Processed {file_id}: {description[:50]}...")
        self._log_progress()
    
    def record_failure(self, file_id: UUID, error: str):
        self.processed += 1
        self.failed += 1
        self.errors.append({
            "file_id": str(file_id),
            "error": error,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        logger.error(f"✗ Failed {file_id}: {error}")
        self._log_progress()
    
    def record_skip(self, file_id: UUID, reason: str):
        self.processed += 1
        self.skipped += 1
        logger.info(f"→ Skipped {file_id}: {reason}")
        self._log_progress()
    
    def _log_progress(self):
        if self.processed % 10 == 0:
            elapsed = (datetime.now(timezone.utc) - self.start_time).total_seconds()
            rate = self.processed / elapsed if elapsed > 0 else 0
            remaining = (self.total - self.processed) / rate if rate > 0 else 0
            logger.info(
                f"Progress: {self.processed}/{self.total} "
                f"(Success: {self.successful}, Failed: {self.failed}, Skipped: {self.skipped}) "
                f"Rate: {rate:.1f}/s, ETA: {remaining:.0f}s"
            )
    
    def get_summary(self) -> Dict[str, Any]:
        elapsed = (datetime.now(timezone.utc) - self.start_time).total_seconds()
        return {
            "total_files": self.total,
            "processed": self.processed,
            "successful": self.successful,
            "failed": self.failed,
            "skipped": self.skipped,
            "success_rate": f"{(self.successful / self.processed * 100):.1f}%" if self.processed > 0 else "0%",
            "duration_seconds": elapsed,
            "duration_human": f"{elapsed//60:.0f}m {elapsed%60:.0f}s",
            "errors": self.errors[:10],  # First 10 errors
            "error_count": len(self.errors)
        }


async def process_instrument_file(
    file: InstrumentFile,
    audio_service: AudioDescriptionService,
    storage: SupabaseStorage,
    tracker: ProgressTracker,
    dry_run: bool = False
) -> bool:
    """Process a single instrument file."""
    try:
        # Download audio file to temporary location
        with tempfile.NamedTemporaryFile(suffix=f".{file.file_format}", delete=False) as tmp_file:
            tmp_path = Path(tmp_file.name)
            
            # Download from storage
            logger.debug(f"Downloading {file.storage_key}")
            # Run synchronous download in thread pool
            loop = asyncio.get_event_loop()
            file_data = await loop.run_in_executor(None, storage.download_file, file.storage_key)
            tmp_file.write(file_data)
            tmp_file.flush()
            
            # Generate description
            logger.debug(f"Generating description for {file.id}")
            # Run synchronous description generation in thread pool
            result = await loop.run_in_executor(
                None,
                audio_service.generate_description,
                str(tmp_path),
                file.category
            )
            
            if not result:
                tracker.record_failure(file.id, "Failed to generate description")
                return False
            
            if dry_run:
                logger.info(f"[DRY RUN] Would update {file.id} with description: {result.best_description[:100]}...")
                tracker.record_success(file.id, result.best_description)
                return True
            
            # Update database
            with next(get_session()) as session:
                db_file = session.get(InstrumentFile, file.id)
                if db_file:
                    db_file.description_generated = result.best_description
                    db_file.description_confidence = result.confidence_score
                    db_file.description_model = result.model_used
                    db_file.description_candidates = {
                        "descriptions": result.descriptions[:10],  # Top 10 candidates
                        "inference_time": result.inference_time
                    }
                    if result.embedding is not None:
                        db_file.description_embedding = result.embedding.tolist()
                    db_file.description_generated_at = datetime.now(timezone.utc)
                    session.commit()
                    
                    tracker.record_success(file.id, result.best_description)
                    return True
                else:
                    tracker.record_failure(file.id, "File not found in database")
                    return False
                    
    except Exception as e:
        tracker.record_failure(file.id, str(e))
        logger.exception(f"Error processing file {file.id}")
        return False
    finally:
        # Clean up temporary file
        if 'tmp_path' in locals() and tmp_path.exists():
            tmp_path.unlink()


async def process_batch(
    files: List[InstrumentFile],
    audio_service: AudioDescriptionService,
    storage: SupabaseStorage,
    tracker: ProgressTracker,
    dry_run: bool,
    concurrent_workers: int
) -> None:
    """Process a batch of files with concurrency control."""
    semaphore = asyncio.Semaphore(concurrent_workers)
    
    async def process_with_limit(file: InstrumentFile):
        async with semaphore:
            await process_instrument_file(file, audio_service, storage, tracker, dry_run)
    
    tasks = [process_with_limit(file) for file in files]
    await asyncio.gather(*tasks, return_exceptions=True)


async def main(args):
    """Main processing function."""
    tracker = ProgressTracker()
    
    # Initialize services
    audio_service = AudioDescriptionService()
    storage = SupabaseStorage()
    
    # Query files to process
    with next(get_session()) as session:
        query = select(InstrumentFile)
        
        # Apply filters
        conditions = []
        if not args.force:
            conditions.append(InstrumentFile.description_generated.is_(None))
        if args.category:
            conditions.append(InstrumentFile.category == args.category)
        
        if conditions:
            query = query.where(and_(*conditions))
        
        if args.limit:
            query = query.limit(args.limit)
        
        files = session.exec(query).all()
        tracker.total = len(files)
    
    if not files:
        logger.info("No files to process")
        return
    
    logger.info(f"Found {len(files)} files to process")
    
    if args.dry_run:
        logger.info("🔍 DRY RUN MODE - No changes will be made")
    
    # Process files
    await process_batch(
        files,
        audio_service,
        storage,
        tracker,
        args.dry_run,
        args.concurrent
    )
    
    # Print summary
    summary = tracker.get_summary()
    logger.info("\n" + "="*60)
    logger.info("PROCESSING COMPLETE")
    logger.info("="*60)
    for key, value in summary.items():
        if key not in ["errors", "error_count"]:
            logger.info(f"{key}: {value}")
    
    if summary["error_count"] > 0:
        logger.warning(f"\n{summary['error_count']} errors occurred. First 10:")
        for error in summary["errors"]:
            logger.warning(f"  - {error['file_id']}: {error['error']}")
    
    # Save detailed report
    report_path = Path("instrument_description_report.json")
    with open(report_path, "w") as f:
        json.dump(summary, f, indent=2)
    logger.info(f"\nDetailed report saved to: {report_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate descriptions for instrument files")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    parser.add_argument("--limit", type=int, help="Process only N files")
    parser.add_argument("--category", help="Process only files in specific category")
    parser.add_argument("--force", action="store_true", help="Regenerate existing descriptions")
    parser.add_argument("--concurrent", type=int, default=5, help="Number of concurrent workers")
    
    args = parser.parse_args()
    
    # Run async main
    asyncio.run(main(args))