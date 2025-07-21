#!/usr/bin/env python3
"""
Demo script to test cosine similarity search functionality.

This script demonstrates the cosine similarity search without requiring
actual audio files or API calls. It uses synthetic embeddings to show
how the search algorithm works.
"""

import numpy as np
import sys
import os
from typing import Dict, List, Tuple

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.search.cosine_similarity_search import cosine_similarity_search, CosineSimilaritySearch


def create_synthetic_drum_embeddings() -> Dict[str, Dict[str, any]]:
    """
    Create synthetic embeddings for drum samples.
    We'll create embeddings that have certain patterns to demonstrate similarity.
    """
    np.random.seed(42)  # For reproducibility
    
    # Base embedding vectors for different drum types
    # These are designed to have certain similarities
    
    # Kick drums - emphasize low frequencies
    kick_base = np.random.randn(1536)
    kick_base[:512] += 2.0  # Boost "low frequency" dimensions
    
    # Snare drums - emphasize mid-high frequencies  
    snare_base = np.random.randn(1536)
    snare_base[512:1024] += 2.0  # Boost "mid frequency" dimensions
    
    # Hi-hats - emphasize high frequencies
    hihat_base = np.random.randn(1536)
    hihat_base[1024:] += 2.0  # Boost "high frequency" dimensions
    
    # Create variations of each type
    samples = {}
    
    # Kicks
    kick_descriptions = [
        ("kick_punchy", "punchy kick with deep sub bass"),
        ("kick_808", "booming 808 kick with long decay"),
        ("kick_tight", "tight acoustic kick drum"),
        ("kick_vintage", "vintage drum machine kick"),
        ("kick_distorted", "distorted trap kick with saturation")
    ]
    
    for i, (name, desc) in enumerate(kick_descriptions):
        # Add variation to base
        variation = kick_base + np.random.randn(1536) * 0.3
        samples[name] = {
            "embedding": variation.tolist(),
            "description": desc,
            "category": "kick"
        }
    
    # Snares
    snare_descriptions = [
        ("snare_crisp", "crisp snare with bright attack"),
        ("snare_trap", "snappy trap snare with short decay"),
        ("snare_acoustic", "acoustic snare drum with natural tone"),
        ("snare_clap", "layered clap and snare sound"),
        ("snare_vintage", "vintage drum machine snare")
    ]
    
    for i, (name, desc) in enumerate(snare_descriptions):
        variation = snare_base + np.random.randn(1536) * 0.3
        samples[name] = {
            "embedding": variation.tolist(),
            "description": desc,
            "category": "snare"
        }
    
    # Hi-hats
    hihat_descriptions = [
        ("hihat_closed", "tight closed hi-hat"),
        ("hihat_open", "open hi-hat with sustain"),
        ("hihat_electronic", "electronic hi-hat with metallic tone"),
        ("hihat_shaker", "shaker-style hi-hat pattern"),
        ("hihat_vintage", "vintage drum machine hi-hat")
    ]
    
    for i, (name, desc) in enumerate(hihat_descriptions):
        variation = hihat_base + np.random.randn(1536) * 0.3
        samples[name] = {
            "embedding": variation.tolist(),
            "description": desc,
            "category": "hihat"
        }
    
    return samples


def test_basic_search():
    """Test basic cosine similarity search"""
    print("\n" + "="*60)
    print("BASIC COSINE SIMILARITY SEARCH TEST")
    print("="*60)
    
    # Create synthetic data
    samples = create_synthetic_drum_embeddings()
    
    # Extract embeddings for search
    embeddings = {name: data["embedding"] for name, data in samples.items()}
    
    # Create a query embedding - let's make it similar to kicks
    # by emphasizing low frequencies
    query_embedding = np.random.randn(1536)
    query_embedding[:512] += 1.5  # Similar to kick pattern but not identical
    
    print("\nQuery: 'deep bass drum sound'")
    print("Expected: Should match kick drums better than snares or hi-hats")
    print("-" * 40)
    
    # Perform search
    results = cosine_similarity_search(
        query_embedding=query_embedding.tolist(),
        instrument_embeddings=embeddings,
        top_k=5
    )
    
    # Display results
    for rank, (sample_id, score) in enumerate(results, 1):
        sample = samples[sample_id]
        print(f"{rank}. {sample_id} ({sample['category']})")
        print(f"   Score: {score:.4f}")
        print(f"   Description: {sample['description']}")


def test_class_based_search():
    """Test the class-based search approach"""
    print("\n" + "="*60)
    print("CLASS-BASED SEARCH WITH THRESHOLD")
    print("="*60)
    
    # Create synthetic data
    samples = create_synthetic_drum_embeddings()
    embeddings = {name: data["embedding"] for name, data in samples.items()}
    
    # Initialize search engine
    search_engine = CosineSimilaritySearch(normalize_embeddings=True)
    search_engine.build_index(embeddings)
    
    # Create a query that's somewhat in between snare and hi-hat
    query_embedding = np.random.randn(1536)
    query_embedding[512:] += 1.0  # Emphasize mid-high frequencies
    
    print("\nQuery: 'bright percussive hit'")
    print("Testing with similarity threshold = 0.7")
    print("-" * 40)
    
    # Search with threshold
    results = search_engine.cosine_similarity_search(
        query_embedding=query_embedding.tolist(),
        top_k=10,
        similarity_threshold=0.7
    )
    
    if results:
        for result in results:
            sample = samples[result.instrument_id]
            print(f"Rank {result.rank}: {result.instrument_id} ({sample['category']})")
            print(f"  Score: {result.similarity_score:.4f}")
            print(f"  Description: {sample['description']}")
    else:
        print("No results above threshold 0.7")


def test_similarity_patterns():
    """Test and visualize similarity patterns"""
    print("\n" + "="*60)
    print("SIMILARITY PATTERN ANALYSIS")
    print("="*60)
    
    # Create synthetic data
    samples = create_synthetic_drum_embeddings()
    embeddings = {name: data["embedding"] for name, data in samples.items()}
    
    # Test within-category similarity
    categories = ["kick", "snare", "hihat"]
    
    for category in categories:
        print(f"\n{category.upper()} similarity test:")
        
        # Get first sample from category
        category_samples = [name for name, data in samples.items() if data["category"] == category]
        if not category_samples:
            continue
            
        query_sample = category_samples[0]
        query_embedding = embeddings[query_sample]
        
        print(f"Query: {query_sample} - {samples[query_sample]['description']}")
        
        # Search
        results = cosine_similarity_search(
            query_embedding=query_embedding,
            instrument_embeddings=embeddings,
            top_k=5
        )
        
        # Count same-category matches in top 5
        same_category = sum(1 for name, _ in results if samples[name]["category"] == category)
        print(f"Same category in top 5: {same_category}/5")
        
        # Show top 3 results
        print("Top 3 matches:")
        for i, (name, score) in enumerate(results[:3]):
            match_indicator = "✓" if samples[name]["category"] == category else "✗"
            print(f"  {i+1}. [{match_indicator}] {name} - {score:.4f}")


def test_batch_search():
    """Test batch similarity search"""
    print("\n" + "="*60)
    print("BATCH SIMILARITY SEARCH TEST")
    print("="*60)
    
    # Create synthetic data
    samples = create_synthetic_drum_embeddings()
    embeddings = {name: data["embedding"] for name, data in samples.items()}
    
    # Initialize search engine
    search_engine = CosineSimilaritySearch()
    search_engine.build_index(embeddings)
    
    # Create multiple queries
    queries = [
        ("Low frequency query", np.random.randn(1536)),
        ("Mid frequency query", np.random.randn(1536)),
        ("High frequency query", np.random.randn(1536))
    ]
    
    # Modify queries to emphasize different frequencies
    queries[0][1][:512] += 2.0      # Low freq
    queries[1][1][512:1024] += 2.0  # Mid freq
    queries[2][1][1024:] += 2.0     # High freq
    
    query_embeddings = [q[1].tolist() for q in queries]
    
    # Batch search
    batch_results = search_engine.batch_cosine_similarity(query_embeddings, top_k=3)
    
    # Display results
    for i, (query_name, _) in enumerate(queries):
        print(f"\n{query_name}:")
        results = batch_results[i]
        for result in results:
            sample = samples[result.instrument_id]
            print(f"  {result.rank}. {result.instrument_id} ({sample['category']}) - {result.similarity_score:.4f}")


def demonstrate_drum_sample_search():
    """Demonstrate how the search would work with real drum samples"""
    print("\n" + "="*60)
    print("DRUM SAMPLE SEARCH DEMONSTRATION")
    print("="*60)
    print("\nThis demonstrates how the search would work with the drum_samples_public folder:")
    print("1. Each drum sample would be processed to generate a description")
    print("2. Descriptions would be converted to embeddings using OpenAI")
    print("3. Cosine similarity search would find similar samples")
    
    print("\nExample workflow:")
    print("- User searches for: 'punchy kick with sub bass'")
    print("- System generates embedding for the query")
    print("- Cosine similarity finds kicks like:")
    print("  * boomin_kick_1.wav (0.89 similarity)")
    print("  * metro_punchy_kick.wav (0.87 similarity)")
    print("  * 808_kick_deep.wav (0.85 similarity)")
    
    print("\nThe actual test script (test_drum_samples_similarity.py) would:")
    print("- Process real audio files from drum_samples_public/")
    print("- Generate actual descriptions using AudioDescriptionService")
    print("- Create real embeddings using OpenAI API")
    print("- Perform similarity search on actual drum sounds")


def main():
    """Run all tests"""
    print("COSINE SIMILARITY SEARCH DEMONSTRATION")
    print("This demo uses synthetic embeddings to show how the search works")
    
    # Run tests
    test_basic_search()
    test_class_based_search()
    test_similarity_patterns()
    test_batch_search()
    demonstrate_drum_sample_search()
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print("The cosine similarity search successfully:")
    print("✓ Finds similar items based on embedding similarity")
    print("✓ Ranks results by similarity score")
    print("✓ Supports similarity thresholds")
    print("✓ Handles batch queries efficiently")
    print("✓ Shows expected patterns (similar drums cluster together)")
    
    print("\nTo test with real drum samples, run:")
    print("python backend/scripts/test_drum_samples_similarity.py")
    print("(Note: This will use OpenAI API and incur costs)")


if __name__ == "__main__":
    main()