#!/usr/bin/env python3
"""
Backup and recovery script for instrument embeddings.

This script:
1. Exports embeddings to JSON files for backup
2. Supports incremental backups (only new/changed embeddings)
3. Provides restore functionality
4. Includes compression for large datasets
5. Validates backup integrity

Usage:
    # Backup embeddings
    python scripts/backup_embeddings.py backup [options]
    
    # Restore embeddings
    python scripts/backup_embeddings.py restore <backup_file> [options]
    
    # List backups
    python scripts/backup_embeddings.py list
    
Options:
    --output DIR        Output directory for backups (default: ./backups)
    --incremental       Only backup new/changed embeddings since last backup
    --compress          Compress backup files with gzip
    --category CATEGORY Process only specific category
    --dry-run          Preview operations without making changes
    --validate         Validate backup integrity after creation
"""

import argparse
import json
import gzip
import logging
import os
import sys
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
from uuid import UUID
import shutil

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select, and_
from app2.infrastructure.database.sqlmodel_client import get_session
from app2.models.public_models.instrument_file import InstrumentFile
from app2.core.logging import get_logger

# Configure logging
logger = get_logger(__name__)


class EmbeddingBackup:
    """Handles backup and restore of embeddings"""
    
    def __init__(self, backup_dir: str = "./backups"):
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(exist_ok=True)
        self.metadata_file = self.backup_dir / "backup_metadata.json"
        self.load_metadata()
    
    def load_metadata(self) -> None:
        """Load backup metadata"""
        self.metadata = {}
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, "r") as f:
                    self.metadata = json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load metadata: {e}")
                self.metadata = {}
    
    def save_metadata(self) -> None:
        """Save backup metadata"""
        with open(self.metadata_file, "w") as f:
            json.dump(self.metadata, f, indent=2)
    
    def calculate_checksum(self, data: Dict[str, Any]) -> str:
        """Calculate checksum for data integrity"""
        json_str = json.dumps(data, sort_keys=True)
        return hashlib.sha256(json_str.encode()).hexdigest()
    
    def get_last_backup_time(self, category: Optional[str] = None) -> Optional[datetime]:
        """Get timestamp of last backup"""
        key = f"last_backup_{category}" if category else "last_backup_all"
        if key in self.metadata:
            return datetime.fromisoformat(self.metadata[key])
        return None
    
    def create_backup(self, 
                     files: List[InstrumentFile],
                     compress: bool = False,
                     incremental: bool = False,
                     category: Optional[str] = None,
                     validate: bool = True) -> Tuple[Path, Dict[str, Any]]:
        """Create backup of embeddings"""
        timestamp = datetime.now(timezone.utc)
        
        # Prepare backup data
        backup_data = {
            "version": "1.0",
            "timestamp": timestamp.isoformat(),
            "category": category,
            "incremental": incremental,
            "total_files": len(files),
            "embeddings": []
        }
        
        # Filter files for incremental backup
        if incremental:
            last_backup = self.get_last_backup_time(category)
            if last_backup:
                logger.info(f"Creating incremental backup since {last_backup}")
                files = [f for f in files if f.description_generated_at and f.description_generated_at > last_backup]
                backup_data["incremental_since"] = last_backup.isoformat()
                backup_data["incremental_files"] = len(files)
        
        # Extract embedding data
        for file in files:
            if file.description_embedding:
                embedding_data = {
                    "id": str(file.id),
                    "name": file.name,
                    "category": file.category,
                    "storage_key": file.storage_key,
                    "description": file.description_generated,
                    "embedding": file.description_embedding,
                    "embedding_metadata": {}
                }
                
                # Extract metadata if available
                if file.description_candidates and isinstance(file.description_candidates, dict):
                    embedding_data["embedding_metadata"] = {
                        "model": file.description_candidates.get("embedding_model"),
                        "dimension": file.description_candidates.get("embedding_dimension"),
                        "version": file.description_candidates.get("embedding_version"),
                        "generated_at": file.description_candidates.get("embedding_generated_at")
                    }
                
                backup_data["embeddings"].append(embedding_data)
        
        # Calculate checksum
        backup_data["checksum"] = self.calculate_checksum(backup_data["embeddings"])
        
        # Generate filename
        date_str = timestamp.strftime("%Y%m%d_%H%M%S")
        backup_type = "incremental" if incremental else "full"
        category_str = f"_{category}" if category else ""
        filename = f"embeddings_{backup_type}{category_str}_{date_str}.json"
        if compress:
            filename += ".gz"
        
        filepath = self.backup_dir / filename
        
        # Write backup
        logger.info(f"Writing backup to {filepath}")
        if compress:
            with gzip.open(filepath, "wt", encoding="utf-8") as f:
                json.dump(backup_data, f, indent=2)
        else:
            with open(filepath, "w") as f:
                json.dump(backup_data, f, indent=2)
        
        # Validate if requested
        if validate:
            logger.info("Validating backup integrity...")
            is_valid, validation_msg = self.validate_backup(filepath)
            if not is_valid:
                logger.error(f"Backup validation failed: {validation_msg}")
                filepath.unlink()  # Delete invalid backup
                raise ValueError(f"Backup validation failed: {validation_msg}")
        
        # Update metadata
        key = f"last_backup_{category}" if category else "last_backup_all"
        self.metadata[key] = timestamp.isoformat()
        self.metadata[f"backup_{filename}"] = {
            "timestamp": timestamp.isoformat(),
            "category": category,
            "incremental": incremental,
            "files_count": len(backup_data["embeddings"]),
            "compressed": compress,
            "size_bytes": filepath.stat().st_size
        }
        self.save_metadata()
        
        # Generate summary
        summary = {
            "backup_file": str(filepath),
            "timestamp": timestamp.isoformat(),
            "type": backup_type,
            "category": category or "all",
            "files_backed_up": len(backup_data["embeddings"]),
            "total_files_checked": backup_data["total_files"],
            "compressed": compress,
            "size_mb": filepath.stat().st_size / 1024 / 1024,
            "checksum": backup_data["checksum"]
        }
        
        return filepath, summary
    
    def validate_backup(self, backup_path: Path) -> Tuple[bool, str]:
        """Validate backup file integrity"""
        try:
            # Load backup
            if backup_path.suffix == ".gz":
                with gzip.open(backup_path, "rt", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                with open(backup_path, "r") as f:
                    data = json.load(f)
            
            # Check required fields
            required_fields = ["version", "timestamp", "embeddings", "checksum"]
            for field in required_fields:
                if field not in data:
                    return False, f"Missing required field: {field}"
            
            # Verify checksum
            calculated_checksum = self.calculate_checksum(data["embeddings"])
            if calculated_checksum != data["checksum"]:
                return False, "Checksum mismatch"
            
            # Validate embedding data
            for i, embedding in enumerate(data["embeddings"]):
                if "id" not in embedding:
                    return False, f"Embedding {i} missing ID"
                if "embedding" not in embedding or not isinstance(embedding["embedding"], list):
                    return False, f"Embedding {i} has invalid embedding data"
                if len(embedding["embedding"]) != 1536:  # Expected dimension
                    return False, f"Embedding {i} has wrong dimension: {len(embedding['embedding'])}"
            
            return True, "Backup is valid"
            
        except Exception as e:
            return False, f"Failed to validate: {str(e)}"
    
    def restore_embeddings(self, 
                          backup_path: Path,
                          dry_run: bool = False,
                          category: Optional[str] = None) -> Dict[str, Any]:
        """Restore embeddings from backup"""
        logger.info(f"Restoring from {backup_path}")
        
        # Validate backup first
        is_valid, validation_msg = self.validate_backup(backup_path)
        if not is_valid:
            raise ValueError(f"Invalid backup: {validation_msg}")
        
        # Load backup
        if backup_path.suffix == ".gz":
            with gzip.open(backup_path, "rt", encoding="utf-8") as f:
                data = json.load(f)
        else:
            with open(backup_path, "r") as f:
                data = json.load(f)
        
        # Filter by category if specified
        embeddings_to_restore = data["embeddings"]
        if category:
            embeddings_to_restore = [e for e in embeddings_to_restore if e["category"] == category]
        
        # Restore statistics
        stats = {
            "total_in_backup": len(data["embeddings"]),
            "to_restore": len(embeddings_to_restore),
            "restored": 0,
            "skipped": 0,
            "errors": 0
        }
        
        if dry_run:
            logger.info(f"[DRY RUN] Would restore {len(embeddings_to_restore)} embeddings")
            stats["restored"] = len(embeddings_to_restore)
            return stats
        
        # Restore embeddings
        with next(get_session()) as session:
            for embedding_data in embeddings_to_restore:
                try:
                    file_id = UUID(embedding_data["id"])
                    file = session.get(InstrumentFile, file_id)
                    
                    if not file:
                        logger.warning(f"File {file_id} not found in database")
                        stats["skipped"] += 1
                        continue
                    
                    # Restore embedding
                    file.description_embedding = embedding_data["embedding"]
                    
                    # Restore metadata
                    if not file.description_candidates:
                        file.description_candidates = {}
                    
                    if "embedding_metadata" in embedding_data:
                        file.description_candidates.update(embedding_data["embedding_metadata"])
                    
                    stats["restored"] += 1
                    
                except Exception as e:
                    logger.error(f"Error restoring {embedding_data.get('id')}: {e}")
                    stats["errors"] += 1
            
            session.commit()
        
        logger.info(f"Restored {stats['restored']} embeddings")
        return stats
    
    def list_backups(self) -> List[Dict[str, Any]]:
        """List all available backups"""
        backups = []
        
        for file in self.backup_dir.glob("embeddings_*.json*"):
            info = {
                "filename": file.name,
                "path": str(file),
                "size_mb": file.stat().st_size / 1024 / 1024,
                "modified": datetime.fromtimestamp(file.stat().st_mtime, tz=timezone.utc).isoformat(),
                "compressed": file.suffix == ".gz"
            }
            
            # Add metadata if available
            if file.name in self.metadata:
                info.update(self.metadata[file.name])
            
            backups.append(info)
        
        # Sort by modification time (newest first)
        backups.sort(key=lambda x: x["modified"], reverse=True)
        return backups


async def main(args):
    """Main function"""
    backup_manager = EmbeddingBackup(args.output)
    
    if args.command == "backup":
        # Query files to backup
        with next(get_session()) as session:
            query = select(InstrumentFile).where(
                InstrumentFile.description_embedding.is_not(None)
            )
            
            if args.category:
                query = query.where(InstrumentFile.category == args.category)
            
            files = session.exec(query).all()
        
        if not files:
            logger.info("No embeddings to backup")
            return
        
        logger.info(f"Found {len(files)} files with embeddings")
        
        if args.dry_run:
            logger.info("[DRY RUN] Would create backup with:")
            logger.info(f"  Files: {len(files)}")
            logger.info(f"  Type: {'incremental' if args.incremental else 'full'}")
            logger.info(f"  Compression: {args.compress}")
            return
        
        # Create backup
        try:
            backup_path, summary = backup_manager.create_backup(
                files,
                compress=args.compress,
                incremental=args.incremental,
                category=args.category,
                validate=args.validate
            )
            
            print("\n" + "="*60)
            print("BACKUP COMPLETE")
            print("="*60)
            for key, value in summary.items():
                print(f"{key}: {value}")
                
        except Exception as e:
            logger.error(f"Backup failed: {e}")
            sys.exit(1)
    
    elif args.command == "restore":
        backup_path = Path(args.backup_file)
        if not backup_path.exists():
            logger.error(f"Backup file not found: {backup_path}")
            sys.exit(1)
        
        # Restore embeddings
        try:
            stats = backup_manager.restore_embeddings(
                backup_path,
                dry_run=args.dry_run,
                category=args.category
            )
            
            print("\n" + "="*60)
            print("RESTORE COMPLETE" if not args.dry_run else "RESTORE PREVIEW (DRY RUN)")
            print("="*60)
            for key, value in stats.items():
                print(f"{key}: {value}")
                
        except Exception as e:
            logger.error(f"Restore failed: {e}")
            sys.exit(1)
    
    elif args.command == "list":
        backups = backup_manager.list_backups()
        
        if not backups:
            print("No backups found")
            return
        
        print("\n" + "="*60)
        print("AVAILABLE BACKUPS")
        print("="*60)
        
        for backup in backups:
            print(f"\n{backup['filename']}")
            print(f"  Size: {backup['size_mb']:.2f} MB")
            print(f"  Modified: {backup['modified']}")
            if "files_count" in backup:
                print(f"  Files: {backup['files_count']}")
            if "category" in backup:
                print(f"  Category: {backup['category'] or 'all'}")
            if "incremental" in backup:
                print(f"  Type: {'incremental' if backup['incremental'] else 'full'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backup and restore instrument embeddings")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Backup command
    backup_parser = subparsers.add_parser("backup", help="Create embedding backup")
    backup_parser.add_argument("--output", default="./backups", help="Output directory")
    backup_parser.add_argument("--incremental", action="store_true", help="Incremental backup")
    backup_parser.add_argument("--compress", action="store_true", help="Compress with gzip")
    backup_parser.add_argument("--category", help="Backup specific category only")
    backup_parser.add_argument("--dry-run", action="store_true", help="Preview without creating")
    backup_parser.add_argument("--validate", action="store_true", default=True, help="Validate after creation")
    
    # Restore command
    restore_parser = subparsers.add_parser("restore", help="Restore embeddings from backup")
    restore_parser.add_argument("backup_file", help="Path to backup file")
    restore_parser.add_argument("--category", help="Restore specific category only")
    restore_parser.add_argument("--dry-run", action="store_true", help="Preview without restoring")
    restore_parser.add_argument("--output", default="./backups", help="Backup directory")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List available backups")
    list_parser.add_argument("--output", default="./backups", help="Backup directory")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    # Run async main
    import asyncio
    asyncio.run(main(args))