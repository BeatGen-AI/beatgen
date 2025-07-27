#!/usr/bin/env python3
"""
Build and maintain search index for instrument embeddings.

This script:
1. Loads all embeddings from database
2. Creates optimized search index
3. Saves index to disk for fast loading
4. Supports incremental updates
5. Provides index statistics and validation

Usage:
    python scripts/build_search_index.py [options]
    
Options:
    --output DIR       Output directory for index files (default: ./search_index)
    --incremental      Only update new/changed embeddings
    --validate         Validate index after building
    --compress         Compress index files
    --stats            Show detailed statistics
"""

import argparse
import json
import gzip
import logging
import os
import sys
import time
import numpy as np
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
import hashlib

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select, and_, func
from app2.infrastructure.database.sqlmodel_client import get_session
from app2.models.public_models.instrument_file import InstrumentFile
from app2.core.logging import get_logger

logger = get_logger(__name__)


class SearchIndexBuilder:
    """Builds and maintains search index for embeddings"""
    
    def __init__(self, output_dir: str = "./search_index"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        # Index files
        self.index_file = self.output_dir / "embeddings_index.npz"
        self.metadata_file = self.output_dir / "metadata.pkl"
        self.manifest_file = self.output_dir / "manifest.json"
        
        # Index data
        self.embeddings_matrix: Optional[np.ndarray] = None
        self.instrument_ids: List[str] = []
        self.metadata: Dict[str, Any] = {}
        self.manifest: Dict[str, Any] = {}
        
        self.load_manifest()
    
    def load_manifest(self) -> None:
        """Load index manifest"""
        if self.manifest_file.exists():
            try:
                with open(self.manifest_file, "r") as f:
                    self.manifest = json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load manifest: {e}")
                self.manifest = {}
        else:
            self.manifest = {
                "created_at": None,
                "updated_at": None,
                "total_instruments": 0,
                "embedding_dimension": 1536,
                "version": "1.0",
                "checksums": {}
            }
    
    def save_manifest(self) -> None:
        """Save index manifest"""
        with open(self.manifest_file, "w") as f:
            json.dump(self.manifest, f, indent=2)
    
    def calculate_checksum(self, data: Any) -> str:
        """Calculate checksum for data integrity"""
        if isinstance(data, np.ndarray):
            data_bytes = data.tobytes()
        else:
            data_bytes = pickle.dumps(data)
        return hashlib.sha256(data_bytes).hexdigest()
    
    def build_index(self, incremental: bool = False, validate: bool = True) -> Dict[str, Any]:
        """Build search index from database"""
        start_time = time.time()
        stats = {
            "status": "started",
            "start_time": datetime.now(timezone.utc).isoformat(),
            "incremental": incremental
        }
        
        # Load existing index for incremental updates
        existing_ids = set()
        if incremental and self.load_index():
            existing_ids = set(self.instrument_ids)
            logger.info(f"Loaded existing index with {len(existing_ids)} instruments")
        
        # Query instruments with embeddings
        with next(get_session()) as session:
            query = select(InstrumentFile).where(
                InstrumentFile.description_embedding.is_not(None)
            )
            
            # For incremental, only get new/updated instruments
            if incremental and existing_ids:
                # Get latest update time from manifest
                last_update = self.manifest.get("updated_at")
                if last_update:
                    last_update_dt = datetime.fromisoformat(last_update)
                    query = query.where(
                        InstrumentFile.description_generated_at > last_update_dt
                    )
            
            instruments = session.exec(query).all()
            stats["new_instruments"] = len(instruments)
            
            if not instruments and not existing_ids:
                logger.warning("No instruments with embeddings found")
                stats["status"] = "no_data"
                return stats
            
            logger.info(f"Found {len(instruments)} {'new' if incremental else ''} instruments to index")
        
        # Build embeddings matrix and metadata
        embeddings_list = []
        new_metadata = {}
        
        for instrument in instruments:
            instrument_id = str(instrument.id)
            
            # Skip if already in index (shouldn't happen with query filter)
            if incremental and instrument_id in existing_ids:
                continue
            
            # Add embedding
            embeddings_list.append(instrument.description_embedding)
            
            # Store metadata
            new_metadata[instrument_id] = {
                "id": instrument_id,
                "name": instrument.name,
                "category": instrument.category,
                "description": instrument.description_generated,
                "file_format": instrument.file_format,
                "storage_key": instrument.storage_key,
                "tags": instrument.tags,
                "indexed_at": datetime.now(timezone.utc).isoformat()
            }
        
        # Combine with existing data if incremental
        if incremental and self.embeddings_matrix is not None:
            # Append new embeddings
            if embeddings_list:
                new_embeddings = np.array(embeddings_list, dtype=np.float32)
                self.embeddings_matrix = np.vstack([self.embeddings_matrix, new_embeddings])
                self.instrument_ids.extend(list(new_metadata.keys()))
                self.metadata.update(new_metadata)
            stats["total_instruments"] = len(self.instrument_ids)
        else:
            # Create new index
            self.embeddings_matrix = np.array(embeddings_list, dtype=np.float32)
            self.instrument_ids = list(new_metadata.keys())
            self.metadata = new_metadata
            stats["total_instruments"] = len(self.instrument_ids)
        
        # Normalize embeddings for cosine similarity
        logger.info("Normalizing embeddings...")
        norms = np.linalg.norm(self.embeddings_matrix, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)  # Avoid division by zero
        self.embeddings_matrix = self.embeddings_matrix / norms
        
        # Save index
        logger.info("Saving index to disk...")
        self.save_index()
        
        # Update manifest
        now = datetime.now(timezone.utc).isoformat()
        self.manifest.update({
            "created_at": self.manifest.get("created_at") or now,
            "updated_at": now,
            "total_instruments": len(self.instrument_ids),
            "embedding_dimension": self.embeddings_matrix.shape[1],
            "checksums": {
                "embeddings": self.calculate_checksum(self.embeddings_matrix),
                "metadata": self.calculate_checksum(self.metadata)
            }
        })
        self.save_manifest()
        
        # Validate if requested
        if validate:
            logger.info("Validating index...")
            validation_result = self.validate_index()
            stats["validation"] = validation_result
        
        # Calculate statistics
        end_time = time.time()
        stats.update({
            "status": "success",
            "end_time": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": end_time - start_time,
            "index_size_mb": self.get_index_size() / 1024 / 1024
        })
        
        return stats
    
    def save_index(self, compress: bool = False) -> None:
        """Save index to disk"""
        # Save embeddings matrix
        if compress:
            np.savez_compressed(self.index_file, 
                              embeddings=self.embeddings_matrix,
                              ids=self.instrument_ids)
        else:
            np.savez(self.index_file,
                    embeddings=self.embeddings_matrix,
                    ids=self.instrument_ids)
        
        # Save metadata
        with open(self.metadata_file, "wb") as f:
            pickle.dump(self.metadata, f)
        
        logger.info(f"Saved index with {len(self.instrument_ids)} instruments")
    
    def load_index(self) -> bool:
        """Load index from disk"""
        try:
            if not self.index_file.exists() or not self.metadata_file.exists():
                return False
            
            # Load embeddings
            data = np.load(self.index_file)
            self.embeddings_matrix = data["embeddings"]
            self.instrument_ids = data["ids"].tolist()
            
            # Load metadata
            with open(self.metadata_file, "rb") as f:
                self.metadata = pickle.load(f)
            
            logger.info(f"Loaded index with {len(self.instrument_ids)} instruments")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load index: {e}")
            return False
    
    def validate_index(self) -> Dict[str, Any]:
        """Validate index integrity"""
        validation = {
            "is_valid": True,
            "checks": {}
        }
        
        # Check files exist
        validation["checks"]["files_exist"] = (
            self.index_file.exists() and 
            self.metadata_file.exists() and
            self.manifest_file.exists()
        )
        
        if not validation["checks"]["files_exist"]:
            validation["is_valid"] = False
            return validation
        
        # Load and verify
        try:
            # Verify dimensions
            validation["checks"]["dimensions_match"] = (
                len(self.instrument_ids) == len(self.metadata) == len(self.embeddings_matrix)
            )
            
            # Verify embedding dimension
            validation["checks"]["embedding_dimension"] = (
                self.embeddings_matrix.shape[1] == 1536
            )
            
            # Verify normalization
            norms = np.linalg.norm(self.embeddings_matrix, axis=1)
            validation["checks"]["normalized"] = np.allclose(norms, 1.0, atol=1e-6)
            
            # Verify checksums
            if "checksums" in self.manifest:
                embeddings_checksum = self.calculate_checksum(self.embeddings_matrix)
                metadata_checksum = self.calculate_checksum(self.metadata)
                
                validation["checks"]["embeddings_checksum"] = (
                    embeddings_checksum == self.manifest["checksums"].get("embeddings")
                )
                validation["checks"]["metadata_checksum"] = (
                    metadata_checksum == self.manifest["checksums"].get("metadata")
                )
            
            # Overall validity
            validation["is_valid"] = all(validation["checks"].values())
            
        except Exception as e:
            validation["is_valid"] = False
            validation["error"] = str(e)
        
        return validation
    
    def get_index_size(self) -> int:
        """Get total size of index files in bytes"""
        total_size = 0
        for file in [self.index_file, self.metadata_file, self.manifest_file]:
            if file.exists():
                total_size += file.stat().st_size
        return total_size
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get detailed index statistics"""
        if self.embeddings_matrix is None:
            return {"error": "Index not loaded"}
        
        # Calculate similarity statistics on a sample
        sample_size = min(1000, len(self.instrument_ids))
        sample_indices = np.random.choice(len(self.instrument_ids), sample_size, replace=False)
        sample_embeddings = self.embeddings_matrix[sample_indices]
        
        # Calculate pairwise similarities
        similarities = np.dot(sample_embeddings, sample_embeddings.T)
        upper_triangle = similarities[np.triu_indices(sample_size, k=1)]
        
        # Category distribution
        category_counts = {}
        for metadata in self.metadata.values():
            category = metadata.get("category", "unknown")
            category_counts[category] = category_counts.get(category, 0) + 1
        
        return {
            "index_info": {
                "total_instruments": len(self.instrument_ids),
                "embedding_dimension": self.embeddings_matrix.shape[1],
                "index_size_mb": self.get_index_size() / 1024 / 1024,
                "created_at": self.manifest.get("created_at"),
                "updated_at": self.manifest.get("updated_at")
            },
            "similarity_distribution": {
                "sample_size": sample_size,
                "mean": float(np.mean(upper_triangle)),
                "std": float(np.std(upper_triangle)),
                "min": float(np.min(upper_triangle)),
                "max": float(np.max(upper_triangle)),
                "percentiles": {
                    "10": float(np.percentile(upper_triangle, 10)),
                    "25": float(np.percentile(upper_triangle, 25)),
                    "50": float(np.percentile(upper_triangle, 50)),
                    "75": float(np.percentile(upper_triangle, 75)),
                    "90": float(np.percentile(upper_triangle, 90))
                }
            },
            "category_distribution": category_counts,
            "format_distribution": self._get_format_distribution()
        }
    
    def _get_format_distribution(self) -> Dict[str, int]:
        """Get distribution of file formats"""
        format_counts = {}
        for metadata in self.metadata.values():
            format = metadata.get("file_format", "unknown")
            format_counts[format] = format_counts.get(format, 0) + 1
        return format_counts
    
    def remove_instrument(self, instrument_id: str) -> bool:
        """Remove an instrument from the index"""
        if instrument_id not in self.metadata:
            return False
        
        # Find index
        try:
            idx = self.instrument_ids.index(instrument_id)
        except ValueError:
            return False
        
        # Remove from arrays
        self.embeddings_matrix = np.delete(self.embeddings_matrix, idx, axis=0)
        self.instrument_ids.pop(idx)
        del self.metadata[instrument_id]
        
        # Update manifest
        self.manifest["total_instruments"] = len(self.instrument_ids)
        self.manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        return True


async def main(args):
    """Main function"""
    builder = SearchIndexBuilder(args.output)
    
    # Build index
    logger.info("Building search index...")
    stats = builder.build_index(
        incremental=args.incremental,
        validate=args.validate
    )
    
    # Print summary
    print("\n" + "="*60)
    print("SEARCH INDEX BUILD COMPLETE")
    print("="*60)
    print(f"Status: {stats['status']}")
    print(f"Total instruments: {stats.get('total_instruments', 0)}")
    if args.incremental:
        print(f"New instruments added: {stats.get('new_instruments', 0)}")
    print(f"Duration: {stats.get('duration_seconds', 0):.2f} seconds")
    print(f"Index size: {stats.get('index_size_mb', 0):.2f} MB")
    
    if args.validate and "validation" in stats:
        print(f"\nValidation: {'✓ Passed' if stats['validation']['is_valid'] else '✗ Failed'}")
        if not stats['validation']['is_valid']:
            for check, result in stats['validation']['checks'].items():
                if not result:
                    print(f"  - {check}: Failed")
    
    # Show statistics if requested
    if args.stats:
        print("\n" + "="*60)
        print("INDEX STATISTICS")
        print("="*60)
        
        stats = builder.get_statistics()
        
        if "error" not in stats:
            # Index info
            print("\nIndex Information:")
            for key, value in stats["index_info"].items():
                print(f"  {key}: {value}")
            
            # Similarity distribution
            print("\nSimilarity Distribution:")
            sim_stats = stats["similarity_distribution"]
            print(f"  Sample size: {sim_stats['sample_size']}")
            print(f"  Mean: {sim_stats['mean']:.3f} ± {sim_stats['std']:.3f}")
            print(f"  Range: [{sim_stats['min']:.3f}, {sim_stats['max']:.3f}]")
            print("  Percentiles:")
            for p, value in sim_stats["percentiles"].items():
                print(f"    {p}%: {value:.3f}")
            
            # Category distribution
            print("\nCategory Distribution:")
            for category, count in sorted(stats["category_distribution"].items()):
                print(f"  {category}: {count}")
            
            # Format distribution
            print("\nFormat Distribution:")
            for format, count in sorted(stats["format_distribution"].items()):
                print(f"  {format}: {count}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build search index for instrument embeddings")
    parser.add_argument("--output", default="./search_index", help="Output directory")
    parser.add_argument("--incremental", action="store_true", help="Incremental update")
    parser.add_argument("--validate", action="store_true", help="Validate after building")
    parser.add_argument("--compress", action="store_true", help="Compress index files")
    parser.add_argument("--stats", action="store_true", help="Show detailed statistics")
    
    args = parser.parse_args()
    
    # Run async main
    import asyncio
    asyncio.run(main(args))