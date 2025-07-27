#!/usr/bin/env python3
"""
Batch processing script to generate OpenAI embeddings for instrument descriptions.

This script:
1. Queries instrument files that already have descriptions
2. Generates embeddings using OpenAI's text-embedding-3-small model
3. Updates database records with embeddings
4. Tracks costs and provides detailed reporting
5. Supports concurrent processing with rate limiting

Usage:
    python scripts/add_instrument_descriptions_openai.py [options]
    
Options:
    --dry-run            Preview what would be processed without making changes
    --limit N            Process only N files (for testing)
    --category CATEGORY  Process only files in a specific category
    --force              Regenerate embeddings for files that already have them
    --concurrent N       Number of concurrent workers (default: 10)
    --estimate-cost      Only estimate the cost without processing
    --batch-size N       Batch size for OpenAI API calls (max 2048, default: 100)
"""

import asyncio
import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
from uuid import UUID

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select, and_
from app2.infrastructure.database.sqlmodel_client import get_session
from app2.models.public_models.instrument_file import InstrumentFile
from app2.services.credits_service import CreditsService
from app2.models.public_models.credit_transaction import CreditTransaction
from app2.core.logging import get_logger
from app2.core.config import get_settings
from scripts.services.openai_embedding_service import OpenAIEmbeddingService, BatchEmbeddingResult

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
        self.total_tokens = 0
        self.total_cost = 0.0
        self.embeddings_generated = 0
    
    def record_success(self, count: int, tokens: int, cost: float):
        self.processed += count
        self.successful += count
        self.embeddings_generated += count
        self.total_tokens += tokens
        self.total_cost += cost
        logger.info(f"✓ Processed batch of {count} items ({tokens} tokens, ${cost:.4f})")
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
        logger.debug(f"→ Skipped {file_id}: {reason}")
        self._log_progress()
    
    def _log_progress(self):
        if self.processed % 50 == 0 or self.processed == self.total:
            elapsed = (datetime.now(timezone.utc) - self.start_time).total_seconds()
            rate = self.processed / elapsed if elapsed > 0 else 0
            remaining = (self.total - self.processed) / rate if rate > 0 else 0
            logger.info(
                f"Progress: {self.processed}/{self.total} "
                f"(Success: {self.successful}, Failed: {self.failed}, Skipped: {self.skipped}) "
                f"Rate: {rate:.1f}/s, ETA: {remaining:.0f}s, "
                f"Cost: ${self.total_cost:.2f}"
            )
    
    def get_summary(self) -> Dict[str, Any]:
        elapsed = (datetime.now(timezone.utc) - self.start_time).total_seconds()
        return {
            "total_files": self.total,
            "processed": self.processed,
            "successful": self.successful,
            "failed": self.failed,
            "skipped": self.skipped,
            "embeddings_generated": self.embeddings_generated,
            "success_rate": f"{(self.successful / self.processed * 100):.1f}%" if self.processed > 0 else "0%",
            "total_tokens": self.total_tokens,
            "total_cost": f"${self.total_cost:.4f}",
            "avg_tokens_per_embedding": self.total_tokens / self.embeddings_generated if self.embeddings_generated > 0 else 0,
            "duration_seconds": elapsed,
            "duration_human": f"{elapsed//60:.0f}m {elapsed%60:.0f}s",
            "processing_rate": f"{self.embeddings_generated / elapsed:.1f} embeddings/s" if elapsed > 0 else "0",
            "errors": self.errors[:10],  # First 10 errors
            "error_count": len(self.errors)
        }


async def process_batch_embeddings(
    files: List[InstrumentFile],
    embedding_service: OpenAIEmbeddingService,
    tracker: ProgressTracker,
    dry_run: bool = False
) -> None:
    """Process a batch of files to generate embeddings."""
    # Extract descriptions
    descriptions = []
    file_map = {}
    
    for file in files:
        if file.description_generated:
            descriptions.append(file.description_generated)
            file_map[len(descriptions) - 1] = file
        else:
            tracker.record_skip(file.id, "No description available")
    
    if not descriptions:
        return
    
    try:
        # Generate embeddings
        logger.info(f"Generating embeddings for batch of {len(descriptions)} descriptions")
        batch_result = await embedding_service.generate_embeddings(descriptions, show_progress=False)
        
        if dry_run:
            logger.info(f"[DRY RUN] Would generate {len(batch_result.results)} embeddings "
                       f"({batch_result.total_tokens} tokens, ${batch_result.cost:.4f})")
            tracker.record_success(len(batch_result.results), batch_result.total_tokens, batch_result.cost)
            return
        
        # Update database
        with next(get_session()) as session:
            for result in batch_result.results:
                file = file_map[result.index]
                db_file = session.get(InstrumentFile, file.id)
                
                if db_file:
                    # Update embedding fields
                    db_file.description_embedding = result.embedding
                    
                    # Update or create metadata
                    if not db_file.description_candidates:
                        db_file.description_candidates = {}
                    
                    db_file.description_candidates.update({
                        "embedding_model": batch_result.model,
                        "embedding_dimension": batch_result.dimension,
                        "embedding_version": "1.0",
                        "embedding_generated_at": datetime.now(timezone.utc).isoformat()
                    })
                    
                    # Track the operation for credits (if needed)
                    # Note: In a production system, you'd integrate with CreditsService here
                    # For now, we just track in metadata
                    
                else:
                    tracker.record_failure(file.id, "File not found in database during update")
            
            session.commit()
            tracker.record_success(len(batch_result.results), batch_result.total_tokens, batch_result.cost)
            
    except Exception as e:
        for file in files:
            tracker.record_failure(file.id, str(e))
        logger.exception("Error processing batch")


async def estimate_costs(
    files: List[InstrumentFile],
    embedding_service: OpenAIEmbeddingService
) -> Tuple[int, float, int]:
    """Estimate costs for processing files."""
    descriptions = [f.description_generated for f in files if f.description_generated]
    
    if not descriptions:
        return 0, 0.0, 0
    
    total_tokens, estimated_cost = embedding_service.estimate_cost(descriptions)
    return len(descriptions), total_tokens, estimated_cost


async def process_all_files(
    files: List[InstrumentFile],
    embedding_service: OpenAIEmbeddingService,
    tracker: ProgressTracker,
    dry_run: bool,
    batch_size: int,
    concurrent_workers: int
) -> None:
    """Process all files with concurrency control."""
    # Process in batches
    semaphore = asyncio.Semaphore(concurrent_workers)
    
    async def process_with_limit(batch: List[InstrumentFile]):
        async with semaphore:
            await process_batch_embeddings(batch, embedding_service, tracker, dry_run)
    
    # Create batches
    tasks = []
    for i in range(0, len(files), batch_size):
        batch = files[i:i + batch_size]
        tasks.append(process_with_limit(batch))
    
    await asyncio.gather(*tasks, return_exceptions=True)


async def main(args):
    """Main processing function."""
    tracker = ProgressTracker()
    
    # Initialize embedding service
    try:
        embedding_service = OpenAIEmbeddingService()
    except ValueError as e:
        logger.error(f"Failed to initialize OpenAI service: {e}")
        logger.error("Please ensure OPENAI_API_KEY environment variable is set")
        return
    
    # Query files to process
    with next(get_session()) as session:
        query = select(InstrumentFile)
        
        # Apply filters
        conditions = []
        # Only process files with descriptions
        conditions.append(InstrumentFile.description_generated.is_not(None))
        
        if not args.force:
            # Skip files that already have embeddings
            conditions.append(InstrumentFile.description_embedding.is_(None))
        
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
    
    # Estimate costs
    count, tokens, cost = await estimate_costs(files, embedding_service)
    logger.info(f"Estimated: {count} embeddings, {tokens:,} tokens, ${cost:.4f}")
    
    if args.estimate_cost:
        # Just show the estimate and exit
        print(f"\nCost Estimation:")
        print(f"  Files with descriptions: {count}")
        print(f"  Total tokens: {tokens:,}")
        print(f"  Estimated cost: ${cost:.4f}")
        print(f"  Cost per embedding: ${cost/count:.6f}" if count > 0 else "N/A")
        return
    
    if args.dry_run:
        logger.info("🔍 DRY RUN MODE - No changes will be made")
    
    # Process files
    await process_all_files(
        files,
        embedding_service,
        tracker,
        args.dry_run,
        args.batch_size,
        args.concurrent
    )
    
    # Print summary
    summary = tracker.get_summary()
    logger.info("\n" + "="*60)
    logger.info("EMBEDDING GENERATION COMPLETE")
    logger.info("="*60)
    for key, value in summary.items():
        if key not in ["errors", "error_count"]:
            logger.info(f"{key}: {value}")
    
    if summary["error_count"] > 0:
        logger.warning(f"\n{summary['error_count']} errors occurred. First 10:")
        for error in summary["errors"]:
            logger.warning(f"  - {error['file_id']}: {error['error']}")
    
    # Save detailed report
    report_path = Path("openai_embedding_report.json")
    with open(report_path, "w") as f:
        json.dump(summary, f, indent=2)
    logger.info(f"\nDetailed report saved to: {report_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate OpenAI embeddings for instrument descriptions")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    parser.add_argument("--limit", type=int, help="Process only N files")
    parser.add_argument("--category", help="Process only files in specific category")
    parser.add_argument("--force", action="store_true", help="Regenerate existing embeddings")
    parser.add_argument("--concurrent", type=int, default=10, help="Number of concurrent workers")
    parser.add_argument("--estimate-cost", action="store_true", help="Only estimate costs without processing")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size for API calls (max 2048)")
    
    args = parser.parse_args()
    
    # Validate batch size
    if args.batch_size > 2048:
        logger.warning("Batch size exceeds OpenAI limit of 2048, setting to 2048")
        args.batch_size = 2048
    
    # Run async main
    asyncio.run(main(args))