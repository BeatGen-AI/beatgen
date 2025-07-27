#!/usr/bin/env python3
"""
Validate search quality with predefined test queries.

This script:
1. Tests search functionality with diverse queries
2. Evaluates relevance of top results
3. Measures consistency across similar queries
4. Benchmarks performance
5. Provides quality metrics and recommendations

Usage:
    python scripts/validate_search_quality.py [options]
    
Options:
    --top-k N           Number of results to evaluate (default: 10)
    --manual            Enable manual relevance evaluation
    --export FILE       Export results to JSON file
    --test-consistency  Test consistency across query variations
    --benchmark         Run performance benchmarks
"""

import argparse
import asyncio
import json
import sys
import os
import time
import statistics
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from pathlib import Path
import numpy as np
from dataclasses import dataclass, asdict

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app2.core.logging import get_logger
from scripts.search.instrument_search_service import InstrumentSearchService

logger = get_logger(__name__)


@dataclass
class TestQuery:
    """Test query with expected characteristics"""
    query: str
    expected_categories: List[str]
    expected_keywords: List[str]
    description: str


@dataclass
class QueryResult:
    """Result of a test query"""
    query: str
    top_results: List[Dict[str, Any]]
    search_time: float
    relevance_scores: Optional[List[int]] = None  # Manual scores 1-5
    category_match_rate: float = 0.0
    keyword_match_rate: float = 0.0
    avg_similarity_score: float = 0.0


class SearchQualityValidator:
    """Validates search quality with comprehensive tests"""
    
    # Predefined test queries as specified
    TEST_QUERIES = [
        TestQuery(
            query="warm analog bass for hip-hop",
            expected_categories=["bass", "synth bass", "sub bass"],
            expected_keywords=["warm", "analog", "bass", "hip-hop", "hip hop", "deep", "sub"],
            description="Bass sounds suitable for hip-hop production"
        ),
        TestQuery(
            query="bright acoustic guitar for folk music",
            expected_categories=["guitar", "acoustic guitar"],
            expected_keywords=["bright", "acoustic", "guitar", "folk", "clean", "clear"],
            description="Acoustic guitar sounds for folk music"
        ),
        TestQuery(
            query="punchy electronic drums",
            expected_categories=["drums", "drum kit", "electronic drums", "percussion"],
            expected_keywords=["punchy", "electronic", "drums", "kick", "snare", "digital"],
            description="Electronic drum sounds with punch"
        ),
        TestQuery(
            query="atmospheric pad for ambient music",
            expected_categories=["pad", "synth", "synthesizer"],
            expected_keywords=["atmospheric", "pad", "ambient", "texture", "evolving", "space"],
            description="Pad sounds for ambient music production"
        ),
        TestQuery(
            query="vintage piano with character",
            expected_categories=["piano", "keys", "keyboard"],
            expected_keywords=["vintage", "piano", "character", "old", "classic", "warm"],
            description="Piano sounds with vintage character"
        )
    ]
    
    def __init__(self):
        self.service = InstrumentSearchService()
        self.results: List[QueryResult] = []
    
    async def initialize(self):
        """Initialize the search service"""
        logger.info("Initializing search service...")
        await self.service.load_instruments()
        stats = self.service.get_search_statistics()
        logger.info(f"Loaded {stats['total_instruments']} instruments")
    
    async def run_test_queries(self, top_k: int = 10) -> List[QueryResult]:
        """Run all test queries and collect results"""
        logger.info(f"Running {len(self.TEST_QUERIES)} test queries...")
        self.results = []
        
        for test_query in self.TEST_QUERIES:
            logger.info(f"\nTesting: {test_query.query}")
            
            # Run search
            start_time = time.time()
            search_results = await self.service.search(
                query=test_query.query,
                top_k=top_k
            )
            search_time = time.time() - start_time
            
            # Extract top results
            top_results = []
            for result in search_results[:3]:  # Focus on top 3 for evaluation
                top_results.append({
                    "name": result.name,
                    "category": result.category,
                    "description": result.description,
                    "similarity_score": result.similarity_score,
                    "rank": result.rank
                })
            
            # Calculate automatic metrics
            category_matches = sum(
                1 for r in search_results 
                if any(cat in r.category.lower() for cat in test_query.expected_categories)
            )
            category_match_rate = category_matches / len(search_results) if search_results else 0
            
            keyword_matches = sum(
                1 for r in search_results
                if any(kw in (r.name + " " + r.description).lower() 
                      for kw in test_query.expected_keywords)
            )
            keyword_match_rate = keyword_matches / len(search_results) if search_results else 0
            
            avg_similarity = statistics.mean([r.similarity_score for r in search_results]) if search_results else 0
            
            # Create result
            query_result = QueryResult(
                query=test_query.query,
                top_results=top_results,
                search_time=search_time,
                category_match_rate=category_match_rate,
                keyword_match_rate=keyword_match_rate,
                avg_similarity_score=avg_similarity
            )
            
            self.results.append(query_result)
            
            # Print results
            print(f"\nQuery: {test_query.query}")
            print(f"Description: {test_query.description}")
            print(f"Search time: {search_time:.3f}s")
            print(f"Category match rate: {category_match_rate:.1%}")
            print(f"Keyword match rate: {keyword_match_rate:.1%}")
            print(f"Average similarity: {avg_similarity:.3f}")
            print("\nTop 3 results:")
            for i, result in enumerate(top_results, 1):
                print(f"  {i}. {result['name']} ({result['category']})")
                print(f"     Score: {result['similarity_score']:.3f}")
                print(f"     {result['description'][:80]}...")
        
        return self.results
    
    async def test_consistency(self) -> Dict[str, Any]:
        """Test consistency across query variations"""
        logger.info("\nTesting query consistency...")
        
        consistency_tests = [
            {
                "base": "warm bass",
                "variations": [
                    "warm bass sound",
                    "warm bass instrument",
                    "bass warm",
                    "warm low frequency bass"
                ]
            },
            {
                "base": "bright piano",
                "variations": [
                    "bright piano sound",
                    "piano bright",
                    "bright sounding piano",
                    "bright clear piano"
                ]
            }
        ]
        
        consistency_results = []
        
        for test in consistency_tests:
            base_query = test["base"]
            base_results = await self.service.search(base_query, top_k=5)
            base_ids = [r.instrument_id for r in base_results]
            
            variation_scores = []
            
            for variation in test["variations"]:
                var_results = await self.service.search(variation, top_k=5)
                var_ids = [r.instrument_id for r in var_results]
                
                # Calculate overlap
                overlap = len(set(base_ids) & set(var_ids)) / len(base_ids) if base_ids else 0
                variation_scores.append(overlap)
            
            avg_consistency = statistics.mean(variation_scores) if variation_scores else 0
            
            consistency_results.append({
                "base_query": base_query,
                "variations_tested": len(test["variations"]),
                "avg_consistency": avg_consistency,
                "min_consistency": min(variation_scores) if variation_scores else 0,
                "max_consistency": max(variation_scores) if variation_scores else 0
            })
            
            print(f"\nConsistency test: {base_query}")
            print(f"  Average consistency: {avg_consistency:.1%}")
            print(f"  Range: {min(variation_scores):.1%} - {max(variation_scores):.1%}")
        
        return {
            "tests": consistency_results,
            "overall_consistency": statistics.mean([r["avg_consistency"] for r in consistency_results])
        }
    
    async def run_performance_benchmark(self, iterations: int = 100) -> Dict[str, Any]:
        """Run performance benchmarks"""
        logger.info(f"\nRunning performance benchmark ({iterations} iterations)...")
        
        # Test different query types
        test_queries = [
            "bass",  # Single word
            "warm analog bass",  # Multi-word
            "bright acoustic guitar for folk music",  # Long query
            "atmospheric evolving pad texture for ambient electronic music production"  # Very long
        ]
        
        benchmark_results = []
        
        for query in test_queries:
            times = []
            
            for _ in range(iterations):
                start_time = time.time()
                await self.service.search(query, top_k=10)
                times.append(time.time() - start_time)
            
            result = {
                "query": query,
                "query_length": len(query.split()),
                "iterations": iterations,
                "avg_time": statistics.mean(times),
                "min_time": min(times),
                "max_time": max(times),
                "std_dev": statistics.stdev(times) if len(times) > 1 else 0,
                "p95_time": np.percentile(times, 95)
            }
            
            benchmark_results.append(result)
            
            print(f"\nBenchmark: {query[:50]}...")
            print(f"  Avg time: {result['avg_time']*1000:.1f}ms")
            print(f"  P95 time: {result['p95_time']*1000:.1f}ms")
        
        return {
            "results": benchmark_results,
            "overall_avg_time": statistics.mean([r["avg_time"] for r in benchmark_results])
        }
    
    def evaluate_manual_relevance(self) -> None:
        """Allow manual relevance evaluation"""
        print("\n" + "="*60)
        print("MANUAL RELEVANCE EVALUATION")
        print("="*60)
        print("Rate the relevance of top 3 results for each query")
        print("Scale: 1 (not relevant) to 5 (highly relevant)")
        print("Press Enter to skip")
        
        for i, result in enumerate(self.results):
            print(f"\nQuery {i+1}: {result.query}")
            print("-" * 40)
            
            relevance_scores = []
            
            for j, top_result in enumerate(result.top_results[:3]):
                print(f"\nResult {j+1}:")
                print(f"  Name: {top_result['name']}")
                print(f"  Category: {top_result['category']}")
                print(f"  Description: {top_result['description'][:100]}...")
                print(f"  Similarity: {top_result['similarity_score']:.3f}")
                
                while True:
                    score_input = input("  Relevance (1-5): ").strip()
                    if not score_input:
                        break
                    try:
                        score = int(score_input)
                        if 1 <= score <= 5:
                            relevance_scores.append(score)
                            break
                        else:
                            print("  Please enter a number between 1 and 5")
                    except ValueError:
                        print("  Invalid input")
            
            if relevance_scores:
                result.relevance_scores = relevance_scores
    
    def generate_report(self) -> Dict[str, Any]:
        """Generate comprehensive quality report"""
        report = {
            "timestamp": datetime.now().isoformat(),
            "test_queries": len(self.results),
            "query_results": [asdict(r) for r in self.results],
            "metrics": self.calculate_metrics(),
            "recommendations": self.generate_recommendations()
        }
        
        return report
    
    def calculate_metrics(self) -> Dict[str, Any]:
        """Calculate overall quality metrics"""
        if not self.results:
            return {}
        
        metrics = {
            "avg_search_time": statistics.mean([r.search_time for r in self.results]),
            "avg_category_match_rate": statistics.mean([r.category_match_rate for r in self.results]),
            "avg_keyword_match_rate": statistics.mean([r.keyword_match_rate for r in self.results]),
            "avg_similarity_score": statistics.mean([r.avg_similarity_score for r in self.results])
        }
        
        # Add manual scores if available
        manual_scores = []
        for result in self.results:
            if result.relevance_scores:
                manual_scores.extend(result.relevance_scores)
        
        if manual_scores:
            metrics["manual_relevance"] = {
                "avg_score": statistics.mean(manual_scores),
                "min_score": min(manual_scores),
                "max_score": max(manual_scores),
                "total_evaluations": len(manual_scores)
            }
        
        return metrics
    
    def generate_recommendations(self) -> List[str]:
        """Generate recommendations based on results"""
        recommendations = []
        
        metrics = self.calculate_metrics()
        
        # Search time recommendations
        if metrics.get("avg_search_time", 0) > 0.5:
            recommendations.append("Consider optimizing search performance - average time exceeds 500ms")
        
        # Category match recommendations
        if metrics.get("avg_category_match_rate", 0) < 0.5:
            recommendations.append("Category matching is low - consider improving category-specific embeddings")
        
        # Keyword match recommendations
        if metrics.get("avg_keyword_match_rate", 0) < 0.6:
            recommendations.append("Keyword matching could be improved - ensure descriptions contain relevant terms")
        
        # Similarity score recommendations
        if metrics.get("avg_similarity_score", 0) < 0.7:
            recommendations.append("Average similarity scores are low - consider adjusting similarity threshold")
        
        # Manual relevance recommendations
        if "manual_relevance" in metrics:
            avg_manual = metrics["manual_relevance"]["avg_score"]
            if avg_manual < 3.5:
                recommendations.append(f"Manual relevance score ({avg_manual:.1f}/5) indicates search quality needs improvement")
        
        if not recommendations:
            recommendations.append("Search quality appears to be good - no major issues detected")
        
        return recommendations


async def main():
    """Main function"""
    parser = argparse.ArgumentParser(description="Validate search quality")
    parser.add_argument("--top-k", type=int, default=10, help="Number of results to evaluate")
    parser.add_argument("--manual", action="store_true", help="Enable manual evaluation")
    parser.add_argument("--export", help="Export results to JSON file")
    parser.add_argument("--test-consistency", action="store_true", help="Test query consistency")
    parser.add_argument("--benchmark", action="store_true", help="Run performance benchmarks")
    
    args = parser.parse_args()
    
    # Create validator
    validator = SearchQualityValidator()
    await validator.initialize()
    
    # Run test queries
    print("\n" + "="*60)
    print("SEARCH QUALITY VALIDATION")
    print("="*60)
    
    await validator.run_test_queries(top_k=args.top_k)
    
    # Manual evaluation if requested
    if args.manual:
        validator.evaluate_manual_relevance()
    
    # Consistency testing if requested
    consistency_results = None
    if args.test_consistency:
        consistency_results = await validator.test_consistency()
    
    # Performance benchmark if requested
    benchmark_results = None
    if args.benchmark:
        benchmark_results = await validator.run_performance_benchmark()
    
    # Generate report
    report = validator.generate_report()
    
    if consistency_results:
        report["consistency_tests"] = consistency_results
    
    if benchmark_results:
        report["performance_benchmark"] = benchmark_results
    
    # Print summary
    print("\n" + "="*60)
    print("VALIDATION SUMMARY")
    print("="*60)
    
    metrics = report["metrics"]
    print(f"Average search time: {metrics['avg_search_time']*1000:.1f}ms")
    print(f"Average category match: {metrics['avg_category_match_rate']:.1%}")
    print(f"Average keyword match: {metrics['avg_keyword_match_rate']:.1%}")
    print(f"Average similarity score: {metrics['avg_similarity_score']:.3f}")
    
    if "manual_relevance" in metrics:
        manual = metrics["manual_relevance"]
        print(f"Manual relevance score: {manual['avg_score']:.1f}/5")
    
    if consistency_results:
        print(f"Overall consistency: {consistency_results['overall_consistency']:.1%}")
    
    print("\nRecommendations:")
    for rec in report["recommendations"]:
        print(f"  • {rec}")
    
    # Export if requested
    if args.export:
        export_path = Path(args.export)
        with open(export_path, "w") as f:
            json.dump(report, f, indent=2)
        print(f"\nReport exported to: {export_path}")


if __name__ == "__main__":
    asyncio.run(main())