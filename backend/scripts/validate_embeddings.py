#!/usr/bin/env python3
"""
Validation script for instrument file embeddings.

This script:
1. Checks all instruments have valid embeddings
2. Verifies embedding dimensions and format
3. Calculates similarity scores for quality checking
4. Reports missing or invalid embeddings
5. Provides detailed statistics and insights

Usage:
    python scripts/validate_embeddings.py [options]
    
Options:
    --category CATEGORY  Validate only files in a specific category
    --check-similarity   Calculate similarity scores between embeddings
    --sample-size N      Number of random pairs to check for similarity (default: 100)
    --export             Export validation results to JSON
"""

import argparse
import json
import logging
import os
import sys
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
from collections import defaultdict
import numpy as np

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select, and_, func
from app2.infrastructure.database.sqlmodel_client import get_session
from app2.models.public_models.instrument_file import InstrumentFile
from app2.core.logging import get_logger
from scripts.services.openai_embedding_service import OpenAIEmbeddingService

# Configure logging
logger = get_logger(__name__)


class EmbeddingValidator:
    """Validator for instrument embeddings"""
    
    def __init__(self):
        self.stats = {
            "total_files": 0,
            "files_with_descriptions": 0,
            "files_with_embeddings": 0,
            "valid_embeddings": 0,
            "invalid_embeddings": 0,
            "missing_embeddings": 0,
            "embedding_dimensions": defaultdict(int),
            "embedding_models": defaultdict(int),
            "categories": defaultdict(lambda: {
                "total": 0,
                "with_descriptions": 0,
                "with_embeddings": 0,
                "valid": 0
            }),
            "issues": [],
            "similarity_scores": []
        }
        self.embedding_service = OpenAIEmbeddingService()
    
    def validate_embedding(self, file: InstrumentFile) -> Tuple[bool, Optional[str]]:
        """Validate a single embedding"""
        if not file.description_embedding:
            return False, "No embedding found"
        
        if not isinstance(file.description_embedding, list):
            return False, f"Invalid type: {type(file.description_embedding)}"
        
        dimension = len(file.description_embedding)
        self.stats["embedding_dimensions"][dimension] += 1
        
        # Check expected dimension (1536 for text-embedding-3-small)
        if dimension != 1536:
            return False, f"Unexpected dimension: {dimension}"
        
        # Check all values are numbers
        if not all(isinstance(x, (int, float)) for x in file.description_embedding):
            return False, "Non-numeric values in embedding"
        
        # Check for NaN or infinity
        embedding_array = np.array(file.description_embedding)
        if np.any(np.isnan(embedding_array)) or np.any(np.isinf(embedding_array)):
            return False, "NaN or infinity values in embedding"
        
        # Check embedding is normalized (optional, but good practice)
        norm = np.linalg.norm(embedding_array)
        if abs(norm - 1.0) > 0.1:  # Allow some tolerance
            logger.debug(f"Embedding not normalized: norm={norm:.3f}")
        
        return True, None
    
    def extract_metadata(self, file: InstrumentFile) -> Dict[str, Any]:
        """Extract embedding metadata from description_candidates"""
        if not file.description_candidates:
            return {}
        
        metadata = {}
        if isinstance(file.description_candidates, dict):
            metadata["model"] = file.description_candidates.get("embedding_model", "unknown")
            metadata["dimension"] = file.description_candidates.get("embedding_dimension")
            metadata["version"] = file.description_candidates.get("embedding_version")
            metadata["generated_at"] = file.description_candidates.get("embedding_generated_at")
        
        return metadata
    
    def calculate_similarity_sample(self, files_with_embeddings: List[InstrumentFile], 
                                  sample_size: int = 100) -> None:
        """Calculate similarity scores for a random sample of embedding pairs"""
        if len(files_with_embeddings) < 2:
            logger.warning("Not enough embeddings to calculate similarities")
            return
        
        logger.info(f"Calculating similarity scores for {sample_size} random pairs...")
        
        # Take random pairs
        for _ in range(min(sample_size, len(files_with_embeddings) * (len(files_with_embeddings) - 1) // 2)):
            file1, file2 = random.sample(files_with_embeddings, 2)
            
            try:
                similarity = self.embedding_service.calculate_similarity(
                    file1.description_embedding,
                    file2.description_embedding
                )
                
                self.stats["similarity_scores"].append({
                    "file1_id": str(file1.id),
                    "file2_id": str(file2.id),
                    "file1_name": file1.name,
                    "file2_name": file2.name,
                    "file1_category": file1.category,
                    "file2_category": file2.category,
                    "same_category": file1.category == file2.category,
                    "similarity": similarity
                })
            except Exception as e:
                logger.error(f"Error calculating similarity: {e}")
    
    def analyze_similarities(self) -> Dict[str, Any]:
        """Analyze similarity score patterns"""
        if not self.stats["similarity_scores"]:
            return {}
        
        scores = [s["similarity"] for s in self.stats["similarity_scores"]]
        same_category_scores = [s["similarity"] for s in self.stats["similarity_scores"] if s["same_category"]]
        diff_category_scores = [s["similarity"] for s in self.stats["similarity_scores"] if not s["same_category"]]
        
        analysis = {
            "total_comparisons": len(scores),
            "overall": {
                "mean": float(np.mean(scores)),
                "std": float(np.std(scores)),
                "min": float(np.min(scores)),
                "max": float(np.max(scores)),
                "percentiles": {
                    "25": float(np.percentile(scores, 25)),
                    "50": float(np.percentile(scores, 50)),
                    "75": float(np.percentile(scores, 75))
                }
            }
        }
        
        if same_category_scores:
            analysis["same_category"] = {
                "count": len(same_category_scores),
                "mean": float(np.mean(same_category_scores)),
                "std": float(np.std(same_category_scores))
            }
        
        if diff_category_scores:
            analysis["different_category"] = {
                "count": len(diff_category_scores),
                "mean": float(np.mean(diff_category_scores)),
                "std": float(np.std(diff_category_scores))
            }
        
        # Find most similar pairs
        sorted_scores = sorted(self.stats["similarity_scores"], key=lambda x: x["similarity"], reverse=True)
        analysis["most_similar_pairs"] = sorted_scores[:5]
        analysis["least_similar_pairs"] = sorted_scores[-5:]
        
        return analysis
    
    def validate_all(self, files: List[InstrumentFile], check_similarity: bool = False,
                    sample_size: int = 100) -> Dict[str, Any]:
        """Validate all files and compile statistics"""
        self.stats["total_files"] = len(files)
        files_with_embeddings = []
        
        logger.info(f"Validating {len(files)} instrument files...")
        
        for file in files:
            # Update category stats
            cat_stats = self.stats["categories"][file.category]
            cat_stats["total"] += 1
            
            # Check description
            if file.description_generated:
                self.stats["files_with_descriptions"] += 1
                cat_stats["with_descriptions"] += 1
            
            # Check embedding
            if file.description_embedding:
                self.stats["files_with_embeddings"] += 1
                cat_stats["with_embeddings"] += 1
                
                # Validate embedding
                is_valid, issue = self.validate_embedding(file)
                if is_valid:
                    self.stats["valid_embeddings"] += 1
                    cat_stats["valid"] += 1
                    files_with_embeddings.append(file)
                    
                    # Extract metadata
                    metadata = self.extract_metadata(file)
                    if metadata.get("model"):
                        self.stats["embedding_models"][metadata["model"]] += 1
                else:
                    self.stats["invalid_embeddings"] += 1
                    self.stats["issues"].append({
                        "file_id": str(file.id),
                        "file_name": file.name,
                        "category": file.category,
                        "issue": issue
                    })
            else:
                if file.description_generated:
                    self.stats["missing_embeddings"] += 1
                    self.stats["issues"].append({
                        "file_id": str(file.id),
                        "file_name": file.name,
                        "category": file.category,
                        "issue": "Has description but no embedding"
                    })
        
        # Calculate coverage percentages
        self.stats["coverage"] = {
            "descriptions": f"{(self.stats['files_with_descriptions'] / self.stats['total_files'] * 100):.1f}%",
            "embeddings": f"{(self.stats['files_with_embeddings'] / self.stats['total_files'] * 100):.1f}%",
            "valid_embeddings": f"{(self.stats['valid_embeddings'] / self.stats['total_files'] * 100):.1f}%"
        }
        
        # Check similarities if requested
        if check_similarity and files_with_embeddings:
            self.calculate_similarity_sample(files_with_embeddings, sample_size)
            self.stats["similarity_analysis"] = self.analyze_similarities()
        
        return self.stats


async def main(args):
    """Main validation function."""
    # Query files
    with next(get_session()) as session:
        query = select(InstrumentFile)
        
        if args.category:
            query = query.where(InstrumentFile.category == args.category)
        
        files = session.exec(query).all()
    
    if not files:
        logger.info("No files found")
        return
    
    # Run validation
    validator = EmbeddingValidator()
    results = validator.validate_all(files, args.check_similarity, args.sample_size)
    
    # Print summary
    print("\n" + "="*60)
    print("EMBEDDING VALIDATION REPORT")
    print("="*60)
    print(f"Total files: {results['total_files']}")
    print(f"Files with descriptions: {results['files_with_descriptions']} ({results['coverage']['descriptions']})")
    print(f"Files with embeddings: {results['files_with_embeddings']} ({results['coverage']['embeddings']})")
    print(f"Valid embeddings: {results['valid_embeddings']} ({results['coverage']['valid_embeddings']})")
    print(f"Invalid embeddings: {results['invalid_embeddings']}")
    print(f"Missing embeddings: {results['missing_embeddings']}")
    
    # Print dimension distribution
    if results["embedding_dimensions"]:
        print("\nEmbedding Dimensions:")
        for dim, count in results["embedding_dimensions"].items():
            print(f"  {dim}D: {count} files")
    
    # Print model distribution
    if results["embedding_models"]:
        print("\nEmbedding Models:")
        for model, count in results["embedding_models"].items():
            print(f"  {model}: {count} files")
    
    # Print category breakdown
    print("\nCategory Breakdown:")
    for category, stats in results["categories"].items():
        print(f"  {category}:")
        print(f"    Total: {stats['total']}")
        print(f"    With descriptions: {stats['with_descriptions']}")
        print(f"    With embeddings: {stats['with_embeddings']}")
        print(f"    Valid embeddings: {stats['valid']}")
    
    # Print similarity analysis if available
    if "similarity_analysis" in results:
        analysis = results["similarity_analysis"]
        print("\nSimilarity Analysis:")
        print(f"  Comparisons made: {analysis['total_comparisons']}")
        print(f"  Overall similarity: {analysis['overall']['mean']:.3f} ± {analysis['overall']['std']:.3f}")
        if "same_category" in analysis:
            print(f"  Same category: {analysis['same_category']['mean']:.3f} ± {analysis['same_category']['std']:.3f}")
        if "different_category" in analysis:
            print(f"  Different category: {analysis['different_category']['mean']:.3f} ± {analysis['different_category']['std']:.3f}")
    
    # Print issues
    if results["issues"]:
        print(f"\nIssues Found ({len(results['issues'])} total):")
        for issue in results["issues"][:10]:  # First 10
            print(f"  - {issue['file_name']} ({issue['category']}): {issue['issue']}")
        if len(results["issues"]) > 10:
            print(f"  ... and {len(results['issues']) - 10} more")
    
    # Export if requested
    if args.export:
        report_path = Path("embedding_validation_report.json")
        with open(report_path, "w") as f:
            # Remove numpy arrays from similarity scores for JSON serialization
            export_results = results.copy()
            if "similarity_scores" in export_results:
                export_results["similarity_scores"] = export_results["similarity_scores"][:20]  # Limit to 20
            json.dump(export_results, f, indent=2)
        print(f"\nDetailed report exported to: {report_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate instrument file embeddings")
    parser.add_argument("--category", help="Validate only files in specific category")
    parser.add_argument("--check-similarity", action="store_true", help="Calculate similarity scores")
    parser.add_argument("--sample-size", type=int, default=100, help="Number of pairs for similarity check")
    parser.add_argument("--export", action="store_true", help="Export results to JSON")
    
    args = parser.parse_args()
    
    # Run async main
    import asyncio
    asyncio.run(main(args))