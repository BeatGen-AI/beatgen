"""Search functionality for instrument embeddings"""

from .cosine_similarity_search import (
    CosineSimilaritySearch,
    SearchResult,
    cosine_similarity_search
)

__all__ = [
    'CosineSimilaritySearch',
    'SearchResult', 
    'cosine_similarity_search'
]