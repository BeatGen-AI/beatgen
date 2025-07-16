"""
Core cosine similarity search implementation for instrument embeddings.

This module provides efficient similarity search using numpy for vectorized operations.
"""

import numpy as np
from typing import List, Tuple, Dict, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Represents a single search result"""
    instrument_id: str
    similarity_score: float
    rank: int
    metadata: Optional[Dict[str, Any]] = None


class CosineSimilaritySearch:
    """Efficient cosine similarity search implementation"""
    
    def __init__(self, normalize_embeddings: bool = True):
        """
        Initialize the search engine.
        
        Args:
            normalize_embeddings: Whether to normalize embeddings for cosine similarity
        """
        self.normalize_embeddings = normalize_embeddings
        self._embeddings_matrix = None
        self._instrument_ids = None
        self._is_normalized = False
    
    def build_index(self, instrument_embeddings: Dict[str, List[float]]) -> None:
        """
        Build search index from instrument embeddings.
        
        Args:
            instrument_embeddings: Dict mapping instrument_id to embedding vector
        """
        if not instrument_embeddings:
            raise ValueError("No embeddings provided")
        
        # Extract IDs and embeddings in consistent order
        self._instrument_ids = list(instrument_embeddings.keys())
        embeddings_list = [instrument_embeddings[id] for id in self._instrument_ids]
        
        # Convert to numpy array for efficient computation
        self._embeddings_matrix = np.array(embeddings_list, dtype=np.float32)
        
        # Verify dimensions
        expected_dim = 1536  # OpenAI text-embedding-3-small
        if self._embeddings_matrix.shape[1] != expected_dim:
            logger.warning(f"Unexpected embedding dimension: {self._embeddings_matrix.shape[1]}")
        
        # Pre-normalize if requested
        if self.normalize_embeddings:
            self._normalize_matrix()
            self._is_normalized = True
        
        logger.info(f"Built index with {len(self._instrument_ids)} instruments")
    
    def _normalize_matrix(self) -> None:
        """Normalize embedding matrix for cosine similarity"""
        norms = np.linalg.norm(self._embeddings_matrix, axis=1, keepdims=True)
        # Avoid division by zero
        norms = np.where(norms == 0, 1, norms)
        self._embeddings_matrix = self._embeddings_matrix / norms
    
    def cosine_similarity_search(self, 
                               query_embedding: List[float], 
                               instrument_embeddings: Optional[Dict[str, List[float]]] = None,
                               top_k: int = 10,
                               similarity_threshold: float = 0.0,
                               filters: Optional[Dict[str, Any]] = None) -> List[SearchResult]:
        """
        Calculate cosine similarities and return top results.
        
        Args:
            query_embedding: 1536-dim embedding from query text
            instrument_embeddings: Optional dict of embeddings (uses index if not provided)
            top_k: Number of top results to return
            similarity_threshold: Minimum similarity score (0-1)
            filters: Optional filters to apply (not implemented in base version)
        
        Returns:
            List of SearchResult objects, sorted by similarity score descending
        """
        # Use provided embeddings or indexed ones
        if instrument_embeddings is not None:
            self.build_index(instrument_embeddings)
        
        if self._embeddings_matrix is None:
            raise ValueError("No embeddings indexed. Call build_index first.")
        
        # Convert query to numpy array
        query_vec = np.array(query_embedding, dtype=np.float32)
        
        # Normalize query if needed
        if self.normalize_embeddings or self._is_normalized:
            query_norm = np.linalg.norm(query_vec)
            if query_norm > 0:
                query_vec = query_vec / query_norm
        
        # Calculate similarities (dot product for normalized vectors = cosine similarity)
        similarities = np.dot(self._embeddings_matrix, query_vec)
        
        # Apply threshold
        valid_indices = np.where(similarities >= similarity_threshold)[0]
        
        if len(valid_indices) == 0:
            logger.warning(f"No results above threshold {similarity_threshold}")
            return []
        
        # Get top-k indices
        if len(valid_indices) > top_k:
            # Get indices of top-k similarities among valid ones
            top_k_valid_indices = np.argpartition(similarities[valid_indices], -top_k)[-top_k:]
            valid_indices = valid_indices[top_k_valid_indices]
        
        # Sort by similarity descending
        sorted_indices = valid_indices[np.argsort(similarities[valid_indices])[::-1]]
        
        # Create results
        results = []
        for rank, idx in enumerate(sorted_indices):
            result = SearchResult(
                instrument_id=self._instrument_ids[idx],
                similarity_score=float(similarities[idx]),
                rank=rank + 1
            )
            results.append(result)
        
        return results
    
    def batch_cosine_similarity(self, 
                               query_embeddings: List[List[float]], 
                               top_k: int = 10) -> List[List[SearchResult]]:
        """
        Perform batch similarity search for multiple queries.
        
        Args:
            query_embeddings: List of query embeddings
            top_k: Number of results per query
        
        Returns:
            List of result lists, one per query
        """
        if self._embeddings_matrix is None:
            raise ValueError("No embeddings indexed. Call build_index first.")
        
        # Convert queries to numpy array
        query_matrix = np.array(query_embeddings, dtype=np.float32)
        
        # Normalize if needed
        if self.normalize_embeddings or self._is_normalized:
            query_norms = np.linalg.norm(query_matrix, axis=1, keepdims=True)
            query_norms = np.where(query_norms == 0, 1, query_norms)
            query_matrix = query_matrix / query_norms
        
        # Calculate all similarities at once
        all_similarities = np.dot(query_matrix, self._embeddings_matrix.T)
        
        # Process results for each query
        all_results = []
        for query_idx, similarities in enumerate(all_similarities):
            # Get top-k indices
            if len(similarities) > top_k:
                top_indices = np.argpartition(similarities, -top_k)[-top_k:]
            else:
                top_indices = np.arange(len(similarities))
            
            # Sort by similarity
            sorted_indices = top_indices[np.argsort(similarities[top_indices])[::-1]]
            
            # Create results
            results = []
            for rank, idx in enumerate(sorted_indices):
                result = SearchResult(
                    instrument_id=self._instrument_ids[idx],
                    similarity_score=float(similarities[idx]),
                    rank=rank + 1
                )
                results.append(result)
            
            all_results.append(results)
        
        return all_results
    
    def rerank_results(self, 
                      results: List[SearchResult], 
                      boost_factors: Optional[Dict[str, float]] = None) -> List[SearchResult]:
        """
        Rerank results based on additional factors.
        
        Args:
            results: Original search results
            boost_factors: Dict of instrument_id to boost factor (multiplier)
        
        Returns:
            Reranked results
        """
        if not boost_factors:
            return results
        
        # Apply boost factors
        for result in results:
            if result.instrument_id in boost_factors:
                result.similarity_score *= boost_factors[result.instrument_id]
        
        # Re-sort by new scores
        results.sort(key=lambda x: x.similarity_score, reverse=True)
        
        # Update ranks
        for i, result in enumerate(results):
            result.rank = i + 1
        
        return results
    
    def get_similarity_statistics(self) -> Dict[str, Any]:
        """Get statistics about the indexed embeddings"""
        if self._embeddings_matrix is None:
            return {"status": "No index built"}
        
        # Calculate pairwise similarities sample
        sample_size = min(100, len(self._instrument_ids))
        sample_indices = np.random.choice(len(self._instrument_ids), sample_size, replace=False)
        sample_matrix = self._embeddings_matrix[sample_indices]
        
        # Calculate similarities
        similarities = np.dot(sample_matrix, sample_matrix.T)
        
        # Extract upper triangle (excluding diagonal)
        upper_triangle = similarities[np.triu_indices(sample_size, k=1)]
        
        return {
            "total_instruments": len(self._instrument_ids),
            "embedding_dimension": self._embeddings_matrix.shape[1],
            "is_normalized": self._is_normalized,
            "similarity_stats": {
                "mean": float(np.mean(upper_triangle)),
                "std": float(np.std(upper_triangle)),
                "min": float(np.min(upper_triangle)),
                "max": float(np.max(upper_triangle)),
                "percentiles": {
                    "25": float(np.percentile(upper_triangle, 25)),
                    "50": float(np.percentile(upper_triangle, 50)),
                    "75": float(np.percentile(upper_triangle, 75))
                }
            }
        }


# Standalone function matching the specification
def cosine_similarity_search(query_embedding: List[float], 
                           instrument_embeddings: Dict[str, List[float]], 
                           top_k: int = 10,
                           similarity_threshold: float = 0.0) -> List[Tuple[str, float]]:
    """
    Calculate cosine similarities between query and all instruments.
    
    This is a simplified interface matching the original specification.
    
    Args:
        query_embedding: 1536-dim embedding from query text
        instrument_embeddings: Dict mapping instrument_id to embedding
        top_k: Number of top results to return
        
    Returns:
        List of (instrument_id, similarity_score) tuples, sorted by score descending
    """
    search_engine = CosineSimilaritySearch(normalize_embeddings=True)
    results = search_engine.cosine_similarity_search(
        query_embedding, 
        instrument_embeddings, 
        top_k=top_k,
        similarity_threshold=similarity_threshold
    )
    
    return [(result.instrument_id, result.similarity_score) for result in results]


# Example usage and testing
if __name__ == "__main__":
    # Test with dummy data
    np.random.seed(42)
    
    # Create dummy embeddings
    n_instruments = 1000
    embedding_dim = 1536
    
    instrument_embeddings = {
        f"instrument_{i}": np.random.randn(embedding_dim).tolist()
        for i in range(n_instruments)
    }
    
    # Create query embedding
    query_embedding = np.random.randn(embedding_dim).tolist()
    
    # Test standalone function
    print("Testing standalone function...")
    results = cosine_similarity_search(query_embedding, instrument_embeddings, top_k=5)
    for instrument_id, score in results:
        print(f"  {instrument_id}: {score:.4f}")
    
    # Test class-based approach
    print("\nTesting class-based approach...")
    search_engine = CosineSimilaritySearch()
    search_engine.build_index(instrument_embeddings)
    
    results = search_engine.cosine_similarity_search(query_embedding, top_k=5)
    for result in results:
        print(f"  Rank {result.rank}: {result.instrument_id} (score: {result.similarity_score:.4f})")
    
    # Show statistics
    print("\nIndex statistics:")
    stats = search_engine.get_similarity_statistics()
    print(f"  Total instruments: {stats['total_instruments']}")
    print(f"  Mean similarity: {stats['similarity_stats']['mean']:.4f}")
    print(f"  Similarity range: [{stats['similarity_stats']['min']:.4f}, {stats['similarity_stats']['max']:.4f}]")