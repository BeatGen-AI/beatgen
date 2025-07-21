#!/usr/bin/env python3
"""
Test cosine similarity search on drum samples from drum_samples_public folder.

This script:
1. Processes drum samples from the test folder
2. Generates descriptions using existing audio description service
3. Creates embeddings using OpenAI
4. Tests similarity search to find similar drum sounds
"""

import asyncio
import argparse
import os
import sys
from pathlib import Path
from typing import List, Dict, Any
import json
import random
import numpy as np

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app2.core.logging import get_logger
from audio_ml.audio_description_service import AudioDescriptionService
from scripts.services.openai_embedding_service import OpenAIEmbeddingService
from scripts.search.cosine_similarity_search import cosine_similarity_search

logger = get_logger(__name__)


class DrumSampleSimilarityTester:
    """Tests cosine similarity on drum samples"""
    
    def __init__(self, samples_dir: str = "drum_samples_public"):
        self.samples_dir = Path(samples_dir)
        if not self.samples_dir.exists():
            raise ValueError(f"Samples directory not found: {samples_dir}")
        
        self.audio_service = AudioDescriptionService()
        
        # Try to initialize OpenAI service, but allow mock mode if no API key
        try:
            self.embedding_service = OpenAIEmbeddingService()
            self.use_mock_embeddings = False
        except ValueError as e:
            logger.warning(f"OpenAI service not available: {e}")
            logger.warning("Using mock embeddings for testing")
            self.embedding_service = None
            self.use_mock_embeddings = True
        
        # Storage for samples data
        self.samples: Dict[str, Dict[str, Any]] = {}
        self.embeddings: Dict[str, List[float]] = {}
    
    def generate_mock_embedding(self, text: str, category: str) -> List[float]:
        """Generate a mock embedding for testing when OpenAI is not available"""
        np.random.seed(hash(text) % 2**32)  # Consistent embeddings for same text
        
        # Create base embedding
        embedding = np.random.randn(1536) * 0.1
        
        # Add category-specific patterns (similar to the demo script)
        if category == "kick":
            embedding[:512] += 0.5  # Emphasize "low frequencies"
        elif category == "snare":
            embedding[512:1024] += 0.5  # Emphasize "mid frequencies"
        elif category == "closed_hh":
            embedding[1024:] += 0.5  # Emphasize "high frequencies"
        
        # Add some variation based on the text
        text_hash = hash(text) % 100
        embedding += np.random.randn(1536) * 0.05 * (text_hash / 100)
        
        # Normalize
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
            
        return embedding.tolist()
    
    def discover_samples(self) -> Dict[str, List[Path]]:
        """Discover all drum samples organized by category"""
        categories = {}
        
        for category_dir in self.samples_dir.iterdir():
            if category_dir.is_dir() and category_dir.name in ["kick", "snare", "closed_hh"]:
                samples = []
                
                # Each subdirectory contains one sample
                for sample_dir in category_dir.iterdir():
                    if sample_dir.is_dir():
                        # Find audio files in the directory
                        audio_files = list(sample_dir.glob("*.wav")) + list(sample_dir.glob("*.aiff"))
                        if audio_files:
                            samples.append(audio_files[0])  # Take first audio file
                
                categories[category_dir.name] = samples
                logger.info(f"Found {len(samples)} {category_dir.name} samples")
        
        return categories
    
    async def process_samples(self, limit_per_category: int = 10) -> None:
        """Process samples to generate descriptions and embeddings"""
        categories = self.discover_samples()
        
        all_descriptions = []
        sample_ids = []
        
        for category, sample_paths in categories.items():
            # Limit samples per category for testing
            selected_samples = random.sample(sample_paths, min(limit_per_category, len(sample_paths)))
            
            logger.info(f"\nProcessing {len(selected_samples)} {category} samples...")
            
            for sample_path in selected_samples:
                try:
                    # Generate description using audio description service
                    logger.info(f"Processing: {sample_path.name}")
                    result = self.audio_service.generate_description(str(sample_path), category)
                    
                    if result and result.best_description:
                        sample_id = f"{category}_{sample_path.parent.name}"
                        
                        # Store sample data
                        self.samples[sample_id] = {
                            "path": str(sample_path),
                            "name": sample_path.name,
                            "category": category,
                            "description": result.best_description,
                            "confidence": result.confidence_score
                        }
                        
                        all_descriptions.append(result.best_description)
                        sample_ids.append(sample_id)
                        
                        logger.info(f"  Description: {result.best_description[:80]}...")
                    else:
                        logger.warning(f"  Failed to generate description for {sample_path.name}")
                        
                except Exception as e:
                    logger.error(f"Error processing {sample_path}: {e}")
        
        # Generate embeddings for all descriptions
        if all_descriptions:
            if self.use_mock_embeddings:
                logger.info(f"\nGenerating mock embeddings for {len(all_descriptions)} descriptions...")
                
                # Generate mock embeddings
                for i, (description, sample_id) in enumerate(zip(all_descriptions, sample_ids)):
                    category = self.samples[sample_id]["category"]
                    embedding = self.generate_mock_embedding(description, category)
                    self.embeddings[sample_id] = embedding
                    self.samples[sample_id]["embedding"] = embedding
                
                logger.info(f"Generated {len(self.embeddings)} mock embeddings (no API cost)")
            else:
                logger.info(f"\nGenerating embeddings for {len(all_descriptions)} descriptions...")
                batch_result = await self.embedding_service.generate_embeddings(all_descriptions)
                
                # Store embeddings
                for i, result in enumerate(batch_result.results):
                    sample_id = sample_ids[i]
                    self.embeddings[sample_id] = result.embedding
                    self.samples[sample_id]["embedding"] = result.embedding
                
                logger.info(f"Generated {len(self.embeddings)} embeddings")
                logger.info(f"Total cost: ${batch_result.cost:.4f}")
    
    def test_similarity_search(self) -> None:
        """Test similarity search with various queries"""
        if not self.embeddings:
            logger.error("No embeddings available. Run process_samples first.")
            return
        
        # Test queries
        test_queries = [
            "punchy kick with deep sub bass",
            "crisp snare with bright attack",
            "tight closed hi-hat",
            "booming 808 kick",
            "snappy trap snare",
            "vintage drum machine kick",
            "acoustic snare drum",
            "electronic hi-hat"
        ]
        
        print("\n" + "="*60)
        print("DRUM SAMPLE SIMILARITY SEARCH TEST")
        print("="*60)
        
        for query in test_queries:
            print(f"\nQuery: {query}")
            print("-" * 40)
            
            # Generate embedding for query
            if self.use_mock_embeddings:
                # Generate mock embedding for query
                # Determine category based on keywords
                category = "kick" if "kick" in query.lower() or "808" in query.lower() else \
                          "snare" if "snare" in query.lower() else \
                          "closed_hh" if "hi-hat" in query.lower() or "hat" in query.lower() else \
                          "kick"  # default
                query_embedding = self.generate_mock_embedding(query, category)
            else:
                loop = asyncio.get_event_loop()
                query_result = loop.run_until_complete(
                    self.embedding_service.generate_single_embedding(query)
                )
                query_embedding = query_result.embedding
            
            # Search using cosine similarity
            results = cosine_similarity_search(
                query_embedding=query_embedding,
                instrument_embeddings=self.embeddings,
                top_k=5
            )
            
            # Display results
            for rank, (sample_id, score) in enumerate(results, 1):
                sample = self.samples[sample_id]
                print(f"{rank}. {sample['name']} ({sample['category']})")
                print(f"   Score: {score:.3f}")
                print(f"   Description: {sample['description'][:80]}...")
    
    def find_similar_samples(self, sample_id: str, top_k: int = 5) -> None:
        """Find samples similar to a given sample"""
        if sample_id not in self.embeddings:
            logger.error(f"Sample {sample_id} not found")
            return
        
        sample = self.samples[sample_id]
        print(f"\nFinding samples similar to: {sample['name']} ({sample['category']})")
        print(f"Description: {sample['description']}")
        print("-" * 60)
        
        # Use the sample's embedding as query
        results = cosine_similarity_search(
            query_embedding=self.embeddings[sample_id],
            instrument_embeddings=self.embeddings,
            top_k=top_k + 1  # +1 to exclude self
        )
        
        # Display results (skip the first one as it's the query sample itself)
        for rank, (result_id, score) in enumerate(results[1:], 1):
            result_sample = self.samples[result_id]
            print(f"{rank}. {result_sample['name']} ({result_sample['category']})")
            print(f"   Score: {score:.3f}")
            print(f"   Description: {result_sample['description'][:80]}...")
    
    def analyze_category_similarity(self) -> None:
        """Analyze similarity patterns within and across categories"""
        print("\n" + "="*60)
        print("CATEGORY SIMILARITY ANALYSIS")
        print("="*60)
        
        # Group samples by category
        categories = {}
        for sample_id, sample in self.samples.items():
            category = sample['category']
            if category not in categories:
                categories[category] = []
            categories[category].append(sample_id)
        
        # Analyze within-category similarity
        for category, sample_ids in categories.items():
            if len(sample_ids) < 2:
                continue
                
            print(f"\n{category.upper()} samples:")
            
            # Pick a random sample from the category
            query_id = random.choice(sample_ids)
            query_sample = self.samples[query_id]
            
            print(f"Query: {query_sample['name']}")
            print(f"Description: {query_sample['description'][:100]}...")
            
            # Search for similar samples
            results = cosine_similarity_search(
                query_embedding=self.embeddings[query_id],
                instrument_embeddings=self.embeddings,
                top_k=10
            )
            
            # Count how many of top 5 results are from same category
            same_category_count = 0
            for i, (result_id, score) in enumerate(results[1:6]):  # Skip self, check next 5
                if self.samples[result_id]['category'] == category:
                    same_category_count += 1
            
            print(f"Same category in top 5: {same_category_count}/5")
            print("Top 5 similar samples:")
            
            for i, (result_id, score) in enumerate(results[1:6]):
                result_sample = self.samples[result_id]
                category_match = "✓" if result_sample['category'] == category else "✗"
                print(f"  {i+1}. [{category_match}] {result_sample['name']} ({result_sample['category']}) - {score:.3f}")
    
    def save_results(self, output_file: str = "drum_samples_analysis.json") -> None:
        """Save analysis results to file"""
        results = {
            "total_samples": len(self.samples),
            "categories": {},
            "samples": []
        }
        
        # Group by category
        for sample_id, sample in self.samples.items():
            category = sample['category']
            if category not in results['categories']:
                results['categories'][category] = 0
            results['categories'][category] += 1
            
            # Add sample info (without full embedding)
            sample_info = {
                "id": sample_id,
                "name": sample['name'],
                "category": sample['category'],
                "description": sample['description'],
                "confidence": sample['confidence']
            }
            results['samples'].append(sample_info)
        
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        print(f"\nResults saved to: {output_file}")


async def main():
    """Main function"""
    parser = argparse.ArgumentParser(description="Test cosine similarity on drum samples")
    parser.add_argument("--samples-dir", default="drum_samples_public", help="Directory containing drum samples")
    parser.add_argument("--limit", type=int, default=10, help="Max samples per category to process")
    parser.add_argument("--save", action="store_true", help="Save results to JSON file")
    
    args = parser.parse_args()
    
    # Create tester
    tester = DrumSampleSimilarityTester(args.samples_dir)
    
    # Process samples
    await tester.process_samples(limit_per_category=args.limit)
    
    # Run tests
    tester.test_similarity_search()
    tester.analyze_category_similarity()
    
    # Test finding similar samples
    if tester.samples:
        # Pick a random sample to test
        sample_id = random.choice(list(tester.samples.keys()))
        tester.find_similar_samples(sample_id)
    
    # Save results if requested
    if args.save:
        tester.save_results()


if __name__ == "__main__":
    asyncio.run(main())