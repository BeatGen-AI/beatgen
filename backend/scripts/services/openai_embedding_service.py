"""
OpenAI Embedding Service for generating text embeddings using text-embedding-3-small model.
This service is designed for batch processing scripts, not production use.
"""

import asyncio
import os
import time
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import tiktoken
from openai import AsyncOpenAI
import numpy as np
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


@dataclass
class EmbeddingResult:
    """Result from embedding generation"""
    text: str
    embedding: List[float]
    token_count: int
    index: int


@dataclass
class BatchEmbeddingResult:
    """Result from batch embedding generation"""
    results: List[EmbeddingResult]
    total_tokens: int
    cost: float
    model: str
    dimension: int


class RateLimiter:
    """Simple rate limiter for OpenAI API"""
    def __init__(self, requests_per_minute: int = 3000, tokens_per_minute: int = 1_000_000):
        self.requests_per_minute = requests_per_minute
        self.tokens_per_minute = tokens_per_minute
        self.request_times: List[datetime] = []
        self.token_counts: List[Tuple[datetime, int]] = []
        self._lock = asyncio.Lock()
    
    async def wait_if_needed(self, token_count: int):
        """Wait if rate limits would be exceeded"""
        async with self._lock:
            now = datetime.now()
            one_minute_ago = now - timedelta(minutes=1)
            
            # Clean old entries
            self.request_times = [t for t in self.request_times if t > one_minute_ago]
            self.token_counts = [(t, c) for t, c in self.token_counts if t > one_minute_ago]
            
            # Check request limit
            while len(self.request_times) >= self.requests_per_minute:
                sleep_time = (self.request_times[0] + timedelta(minutes=1) - now).total_seconds()
                if sleep_time > 0:
                    logger.info(f"Rate limit: waiting {sleep_time:.1f}s for request limit")
                    await asyncio.sleep(sleep_time)
                    now = datetime.now()
                    one_minute_ago = now - timedelta(minutes=1)
                    self.request_times = [t for t in self.request_times if t > one_minute_ago]
            
            # Check token limit
            current_tokens = sum(c for _, c in self.token_counts)
            while current_tokens + token_count > self.tokens_per_minute:
                sleep_time = (self.token_counts[0][0] + timedelta(minutes=1) - now).total_seconds()
                if sleep_time > 0:
                    logger.info(f"Rate limit: waiting {sleep_time:.1f}s for token limit")
                    await asyncio.sleep(sleep_time)
                    now = datetime.now()
                    one_minute_ago = now - timedelta(minutes=1)
                    self.token_counts = [(t, c) for t, c in self.token_counts if t > one_minute_ago]
                    current_tokens = sum(c for _, c in self.token_counts)
            
            # Record this request
            self.request_times.append(now)
            self.token_counts.append((now, token_count))


class OpenAIEmbeddingService:
    """Service for generating OpenAI embeddings with batching and rate limiting"""
    
    # OpenAI pricing for text-embedding-3-small
    COST_PER_MILLION_TOKENS = 0.02
    MODEL_NAME = "text-embedding-3-small"
    EMBEDDING_DIMENSION = 1536
    MAX_BATCH_SIZE = 2048  # OpenAI limit
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the service with API key"""
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API key not provided and OPENAI_API_KEY env var not set")
        
        self.client = AsyncOpenAI(api_key=self.api_key)
        self.encoding = tiktoken.get_encoding("cl100k_base")  # encoding for embedding models
        self.rate_limiter = RateLimiter()
        self._initialized = True
    
    def count_tokens(self, text: str) -> int:
        """Count tokens in a text string"""
        return len(self.encoding.encode(text))
    
    def estimate_cost(self, texts: List[str]) -> Tuple[int, float]:
        """Estimate the cost of embedding a list of texts"""
        total_tokens = sum(self.count_tokens(text) for text in texts)
        cost = (total_tokens / 1_000_000) * self.COST_PER_MILLION_TOKENS
        return total_tokens, cost
    
    async def generate_embeddings(self, texts: List[str], 
                                 show_progress: bool = True) -> BatchEmbeddingResult:
        """Generate embeddings for a list of texts with batching"""
        if not texts:
            return BatchEmbeddingResult(
                results=[], 
                total_tokens=0, 
                cost=0.0,
                model=self.MODEL_NAME,
                dimension=self.EMBEDDING_DIMENSION
            )
        
        # Process in batches
        all_results = []
        total_tokens = 0
        
        for i in range(0, len(texts), self.MAX_BATCH_SIZE):
            batch = texts[i:i + self.MAX_BATCH_SIZE]
            batch_tokens = sum(self.count_tokens(text) for text in batch)
            
            # Rate limiting
            await self.rate_limiter.wait_if_needed(batch_tokens)
            
            if show_progress:
                logger.info(f"Processing batch {i//self.MAX_BATCH_SIZE + 1} "
                          f"({len(batch)} items, {batch_tokens} tokens)")
            
            try:
                # Make API call
                response = await self.client.embeddings.create(
                    model=self.MODEL_NAME,
                    input=batch
                )
                
                # Process results
                for j, embedding_data in enumerate(response.data):
                    result = EmbeddingResult(
                        text=batch[j],
                        embedding=embedding_data.embedding,
                        token_count=self.count_tokens(batch[j]),
                        index=i + j
                    )
                    all_results.append(result)
                
                total_tokens += response.usage.total_tokens
                
            except Exception as e:
                logger.error(f"Error processing batch starting at index {i}: {e}")
                raise
        
        # Calculate total cost
        total_cost = (total_tokens / 1_000_000) * self.COST_PER_MILLION_TOKENS
        
        return BatchEmbeddingResult(
            results=all_results,
            total_tokens=total_tokens,
            cost=total_cost,
            model=self.MODEL_NAME,
            dimension=self.EMBEDDING_DIMENSION
        )
    
    async def generate_single_embedding(self, text: str) -> EmbeddingResult:
        """Generate embedding for a single text"""
        result = await self.generate_embeddings([text], show_progress=False)
        return result.results[0]
    
    def validate_embedding(self, embedding: List[float]) -> bool:
        """Validate that an embedding has the correct format"""
        if not isinstance(embedding, list):
            return False
        if len(embedding) != self.EMBEDDING_DIMENSION:
            return False
        if not all(isinstance(x, (int, float)) for x in embedding):
            return False
        return True
    
    def calculate_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """Calculate cosine similarity between two embeddings"""
        if not (self.validate_embedding(embedding1) and self.validate_embedding(embedding2)):
            raise ValueError("Invalid embedding format")
        
        # Convert to numpy arrays
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)
        
        # Calculate cosine similarity
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))


# Example usage and testing
async def test_service():
    """Test the embedding service"""
    service = OpenAIEmbeddingService()
    
    # Test single embedding
    test_text = "A bright, punchy kick drum with a deep sub-bass layer"
    result = await service.generate_single_embedding(test_text)
    print(f"Generated embedding for: {result.text}")
    print(f"Embedding dimension: {len(result.embedding)}")
    print(f"Token count: {result.token_count}")
    
    # Test batch embeddings
    test_texts = [
        "A warm, analog synthesizer pad",
        "A crisp hi-hat with subtle reverb",
        "A deep, growling bass synth"
    ]
    
    # Estimate cost first
    total_tokens, estimated_cost = service.estimate_cost(test_texts)
    print(f"\nEstimated cost for {len(test_texts)} texts: ${estimated_cost:.4f} ({total_tokens} tokens)")
    
    # Generate embeddings
    batch_result = await service.generate_embeddings(test_texts)
    print(f"\nGenerated {len(batch_result.results)} embeddings")
    print(f"Actual cost: ${batch_result.cost:.4f} ({batch_result.total_tokens} tokens)")
    
    # Test similarity
    if len(batch_result.results) >= 2:
        sim = service.calculate_similarity(
            batch_result.results[0].embedding,
            batch_result.results[1].embedding
        )
        print(f"\nSimilarity between first two embeddings: {sim:.3f}")


if __name__ == "__main__":
    # Run test
    asyncio.run(test_service())