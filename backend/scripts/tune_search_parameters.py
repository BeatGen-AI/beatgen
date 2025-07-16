#!/usr/bin/env python3
"""
Tune search parameters for optimal performance and quality.

This script:
1. Tests different similarity thresholds
2. Evaluates different result counts
3. Tests normalization strategies
4. Implements and evaluates fallback mechanisms
5. Finds optimal parameter combinations

Usage:
    python scripts/tune_search_parameters.py [options]
    
Options:
    --test-queries FILE    JSON file with test queries (default: use built-in)
    --export FILE         Export optimal parameters to JSON
    --quick               Run quick tuning (fewer iterations)
    --visualize           Generate visualization plots
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
import itertools

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app2.core.logging import get_logger
from scripts.search.instrument_search_service import InstrumentSearchService

logger = get_logger(__name__)


@dataclass
class ParameterSet:
    """Set of search parameters to test"""
    similarity_threshold: float
    top_k: int
    normalize_embeddings: bool
    fallback_threshold_reduction: float
    fallback_max_attempts: int


@dataclass
class TuningResult:
    """Result of parameter tuning"""
    parameters: ParameterSet
    avg_relevance: float
    avg_search_time: float
    empty_result_rate: float
    score: float  # Combined score


class SearchParameterTuner:
    """Tunes search parameters for optimal performance"""
    
    # Parameter ranges to test
    SIMILARITY_THRESHOLDS = [0.0, 0.3, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9]
    TOP_K_VALUES = [5, 10, 20]
    NORMALIZATION_OPTIONS = [True, False]
    FALLBACK_REDUCTIONS = [0.1, 0.15, 0.2]
    FALLBACK_MAX_ATTEMPTS = [1, 2, 3]
    
    # Quick mode uses fewer options
    QUICK_SIMILARITY_THRESHOLDS = [0.0, 0.5, 0.7, 0.8]
    QUICK_TOP_K_VALUES = [5, 10]
    
    # Test queries for tuning
    DEFAULT_TEST_QUERIES = [
        # Basic queries
        "bass", "piano", "drums", "guitar", "synth",
        # Descriptive queries
        "warm bass", "bright piano", "punchy drums", "clean guitar", "analog synth",
        # Complex queries
        "warm analog bass for hip-hop",
        "bright acoustic guitar for folk music",
        "punchy electronic drums",
        "atmospheric pad for ambient music",
        "vintage piano with character",
        # Edge cases
        "xyz123notfound",  # Should return no results
        "sound",  # Very generic
        "deep sub bass with analog warmth and vintage character"  # Very specific
    ]
    
    def __init__(self, quick_mode: bool = False):
        self.quick_mode = quick_mode
        self.service = None
        self.test_queries = self.DEFAULT_TEST_QUERIES
        self.results: List[TuningResult] = []
    
    async def initialize(self):
        """Initialize the search service"""
        logger.info("Initializing search service for tuning...")
        self.service = InstrumentSearchService(use_cache=True)
        await self.service.load_instruments()
    
    def get_parameter_combinations(self) -> List[ParameterSet]:
        """Generate all parameter combinations to test"""
        if self.quick_mode:
            thresholds = self.QUICK_SIMILARITY_THRESHOLDS
            top_k_values = self.QUICK_TOP_K_VALUES
            # Only test one fallback configuration in quick mode
            fallback_reductions = [0.15]
            fallback_attempts = [2]
        else:
            thresholds = self.SIMILARITY_THRESHOLDS
            top_k_values = self.TOP_K_VALUES
            fallback_reductions = self.FALLBACK_REDUCTIONS
            fallback_attempts = self.FALLBACK_MAX_ATTEMPTS
        
        combinations = []
        
        for threshold, top_k, normalize, fallback_red, fallback_max in itertools.product(
            thresholds, top_k_values, self.NORMALIZATION_OPTIONS, 
            fallback_reductions, fallback_attempts
        ):
            param_set = ParameterSet(
                similarity_threshold=threshold,
                top_k=top_k,
                normalize_embeddings=normalize,
                fallback_threshold_reduction=fallback_red,
                fallback_max_attempts=fallback_max
            )
            combinations.append(param_set)
        
        logger.info(f"Generated {len(combinations)} parameter combinations to test")
        return combinations
    
    async def evaluate_parameters(self, params: ParameterSet) -> TuningResult:
        """Evaluate a single parameter set"""
        # Reconfigure service with normalization setting
        self.service.search_engine.normalize_embeddings = params.normalize_embeddings
        if params.normalize_embeddings and not self.service.search_engine._is_normalized:
            self.service.search_engine._normalize_matrix()
            self.service.search_engine._is_normalized = True
        
        search_times = []
        result_counts = []
        empty_results = 0
        relevance_scores = []
        
        for query in self.test_queries:
            # Initial search
            start_time = time.time()
            results = await self.service.search(
                query=query,
                top_k=params.top_k,
                similarity_threshold=params.similarity_threshold
            )
            
            # Fallback mechanism if no results
            fallback_attempts = 0
            current_threshold = params.similarity_threshold
            
            while len(results) == 0 and fallback_attempts < params.fallback_max_attempts:
                current_threshold -= params.fallback_threshold_reduction
                if current_threshold < 0:
                    break
                
                results = await self.service.search(
                    query=query,
                    top_k=params.top_k,
                    similarity_threshold=current_threshold
                )
                fallback_attempts += 1
            
            search_time = time.time() - start_time
            search_times.append(search_time)
            result_counts.append(len(results))
            
            if len(results) == 0:
                empty_results += 1
            
            # Calculate relevance score (simplified automatic evaluation)
            if results:
                # Higher scores are better
                avg_similarity = statistics.mean([r.similarity_score for r in results])
                # Bonus for expected queries returning results
                if query not in ["xyz123notfound"]:
                    relevance_scores.append(avg_similarity)
        
        # Calculate metrics
        avg_search_time = statistics.mean(search_times)
        empty_result_rate = empty_results / len(self.test_queries)
        avg_relevance = statistics.mean(relevance_scores) if relevance_scores else 0.0
        
        # Calculate combined score (higher is better)
        # Weights: relevance (40%), speed (30%), non-empty results (30%)
        score = (
            0.4 * avg_relevance +
            0.3 * (1.0 - min(avg_search_time, 1.0)) +  # Normalize search time
            0.3 * (1.0 - empty_result_rate)
        )
        
        return TuningResult(
            parameters=params,
            avg_relevance=avg_relevance,
            avg_search_time=avg_search_time,
            empty_result_rate=empty_result_rate,
            score=score
        )
    
    async def tune_parameters(self) -> List[TuningResult]:
        """Run parameter tuning"""
        combinations = self.get_parameter_combinations()
        
        logger.info("Starting parameter tuning...")
        print(f"\nTesting {len(combinations)} parameter combinations...")
        print("This may take a while. Progress will be shown every 10 combinations.\n")
        
        self.results = []
        
        for i, params in enumerate(combinations):
            if i > 0 and i % 10 == 0:
                print(f"Progress: {i}/{len(combinations)} combinations tested...")
            
            result = await self.evaluate_parameters(params)
            self.results.append(result)
        
        # Sort by score (best first)
        self.results.sort(key=lambda x: x.score, reverse=True)
        
        return self.results
    
    def analyze_results(self) -> Dict[str, Any]:
        """Analyze tuning results"""
        if not self.results:
            return {}
        
        # Best parameters
        best_result = self.results[0]
        
        # Analyze impact of each parameter
        analysis = {
            "best_parameters": asdict(best_result.parameters),
            "best_score": best_result.score,
            "best_metrics": {
                "avg_relevance": best_result.avg_relevance,
                "avg_search_time": best_result.avg_search_time,
                "empty_result_rate": best_result.empty_result_rate
            },
            "parameter_impact": self._analyze_parameter_impact(),
            "top_5_configurations": [
                {
                    "parameters": asdict(r.parameters),
                    "score": r.score,
                    "relevance": r.avg_relevance,
                    "search_time": r.avg_search_time
                }
                for r in self.results[:5]
            ]
        }
        
        return analysis
    
    def _analyze_parameter_impact(self) -> Dict[str, Any]:
        """Analyze the impact of each parameter on results"""
        impact = {}
        
        # Similarity threshold impact
        threshold_scores = {}
        for result in self.results:
            threshold = result.parameters.similarity_threshold
            if threshold not in threshold_scores:
                threshold_scores[threshold] = []
            threshold_scores[threshold].append(result.score)
        
        impact["similarity_threshold"] = {
            str(k): statistics.mean(v) for k, v in threshold_scores.items()
        }
        
        # Top-k impact
        topk_scores = {}
        for result in self.results:
            top_k = result.parameters.top_k
            if top_k not in topk_scores:
                topk_scores[top_k] = []
            topk_scores[top_k].append(result.score)
        
        impact["top_k"] = {
            str(k): statistics.mean(v) for k, v in topk_scores.items()
        }
        
        # Normalization impact
        norm_scores = {"True": [], "False": []}
        for result in self.results:
            norm_scores[str(result.parameters.normalize_embeddings)].append(result.score)
        
        impact["normalization"] = {
            k: statistics.mean(v) for k, v in norm_scores.items() if v
        }
        
        return impact
    
    def generate_recommendations(self) -> List[str]:
        """Generate recommendations based on tuning results"""
        if not self.results:
            return ["No tuning results available"]
        
        best = self.results[0]
        recommendations = []
        
        # Threshold recommendation
        if best.parameters.similarity_threshold > 0.7:
            recommendations.append(
                f"Use a high similarity threshold ({best.parameters.similarity_threshold}) "
                "for more relevant but potentially fewer results"
            )
        elif best.parameters.similarity_threshold < 0.5:
            recommendations.append(
                f"Use a low similarity threshold ({best.parameters.similarity_threshold}) "
                "to ensure results are returned for most queries"
            )
        else:
            recommendations.append(
                f"Use a moderate similarity threshold ({best.parameters.similarity_threshold}) "
                "for balanced relevance and coverage"
            )
        
        # Top-k recommendation
        recommendations.append(f"Return {best.parameters.top_k} results for optimal user experience")
        
        # Normalization recommendation
        if best.parameters.normalize_embeddings:
            recommendations.append("Enable embedding normalization for better cosine similarity accuracy")
        
        # Fallback recommendation
        recommendations.append(
            f"Implement fallback with {best.parameters.fallback_threshold_reduction} threshold reduction "
            f"(max {best.parameters.fallback_max_attempts} attempts) to handle edge cases"
        )
        
        # Performance recommendation
        if best.avg_search_time > 0.1:
            recommendations.append("Consider additional optimization for search times above 100ms")
        
        return recommendations
    
    def export_optimal_parameters(self, filepath: Path) -> None:
        """Export optimal parameters to JSON file"""
        if not self.results:
            logger.error("No results to export")
            return
        
        best = self.results[0]
        
        config = {
            "optimal_parameters": {
                "similarity_threshold": best.parameters.similarity_threshold,
                "top_k": best.parameters.top_k,
                "normalize_embeddings": best.parameters.normalize_embeddings,
                "fallback": {
                    "threshold_reduction": best.parameters.fallback_threshold_reduction,
                    "max_attempts": best.parameters.fallback_max_attempts
                }
            },
            "metrics": {
                "score": best.score,
                "avg_relevance": best.avg_relevance,
                "avg_search_time": best.avg_search_time,
                "empty_result_rate": best.empty_result_rate
            },
            "tuning_info": {
                "timestamp": datetime.now().isoformat(),
                "combinations_tested": len(self.results),
                "test_queries_used": len(self.test_queries)
            }
        }
        
        with open(filepath, "w") as f:
            json.dump(config, f, indent=2)
        
        logger.info(f"Exported optimal parameters to {filepath}")


async def main():
    """Main function"""
    parser = argparse.ArgumentParser(description="Tune search parameters")
    parser.add_argument("--test-queries", help="JSON file with test queries")
    parser.add_argument("--export", help="Export optimal parameters to JSON")
    parser.add_argument("--quick", action="store_true", help="Quick tuning mode")
    parser.add_argument("--visualize", action="store_true", help="Generate visualizations")
    
    args = parser.parse_args()
    
    # Create tuner
    tuner = SearchParameterTuner(quick_mode=args.quick)
    
    # Load custom test queries if provided
    if args.test_queries:
        with open(args.test_queries, "r") as f:
            tuner.test_queries = json.load(f)
    
    # Initialize
    await tuner.initialize()
    
    # Run tuning
    print("\n" + "="*60)
    print("SEARCH PARAMETER TUNING")
    print("="*60)
    
    results = await tuner.tune_parameters()
    
    # Analyze results
    analysis = tuner.analyze_results()
    
    # Print results
    print("\n" + "="*60)
    print("TUNING RESULTS")
    print("="*60)
    
    print("\nBest Parameters:")
    for key, value in analysis["best_parameters"].items():
        print(f"  {key}: {value}")
    
    print("\nBest Metrics:")
    print(f"  Score: {analysis['best_score']:.3f}")
    print(f"  Relevance: {analysis['best_metrics']['avg_relevance']:.3f}")
    print(f"  Search Time: {analysis['best_metrics']['avg_search_time']*1000:.1f}ms")
    print(f"  Empty Results: {analysis['best_metrics']['empty_result_rate']:.1%}")
    
    print("\nParameter Impact Analysis:")
    for param, impact in analysis["parameter_impact"].items():
        print(f"\n  {param}:")
        for value, score in sorted(impact.items()):
            print(f"    {value}: {score:.3f}")
    
    print("\nTop 5 Configurations:")
    for i, config in enumerate(analysis["top_5_configurations"], 1):
        print(f"\n  {i}. Score: {config['score']:.3f}")
        print(f"     Threshold: {config['parameters']['similarity_threshold']}, "
              f"Top-K: {config['parameters']['top_k']}, "
              f"Normalized: {config['parameters']['normalize_embeddings']}")
    
    # Generate recommendations
    recommendations = tuner.generate_recommendations()
    print("\n" + "="*60)
    print("RECOMMENDATIONS")
    print("="*60)
    for rec in recommendations:
        print(f"• {rec}")
    
    # Export if requested
    if args.export:
        export_path = Path(args.export)
        tuner.export_optimal_parameters(export_path)
        print(f"\nOptimal parameters exported to: {export_path}")
    
    # Visualizations (if matplotlib is available)
    if args.visualize:
        try:
            import matplotlib.pyplot as plt
            
            # Create visualizations
            fig, axes = plt.subplots(2, 2, figsize=(12, 10))
            
            # Threshold impact
            threshold_impact = analysis["parameter_impact"]["similarity_threshold"]
            axes[0, 0].bar(threshold_impact.keys(), threshold_impact.values())
            axes[0, 0].set_xlabel("Similarity Threshold")
            axes[0, 0].set_ylabel("Average Score")
            axes[0, 0].set_title("Impact of Similarity Threshold")
            
            # Top-k impact
            topk_impact = analysis["parameter_impact"]["top_k"]
            axes[0, 1].bar(topk_impact.keys(), topk_impact.values())
            axes[0, 1].set_xlabel("Top-K Value")
            axes[0, 1].set_ylabel("Average Score")
            axes[0, 1].set_title("Impact of Result Count")
            
            # Score distribution
            scores = [r.score for r in results]
            axes[1, 0].hist(scores, bins=20)
            axes[1, 0].set_xlabel("Score")
            axes[1, 0].set_ylabel("Count")
            axes[1, 0].set_title("Score Distribution")
            
            # Relevance vs Speed scatter
            relevances = [r.avg_relevance for r in results]
            speeds = [r.avg_search_time for r in results]
            axes[1, 1].scatter(speeds, relevances, alpha=0.5)
            axes[1, 1].set_xlabel("Average Search Time (s)")
            axes[1, 1].set_ylabel("Average Relevance")
            axes[1, 1].set_title("Relevance vs Speed Trade-off")
            
            plt.tight_layout()
            plt.savefig("parameter_tuning_results.png")
            print("\nVisualizations saved to: parameter_tuning_results.png")
            
        except ImportError:
            print("\nMatplotlib not available - skipping visualizations")


if __name__ == "__main__":
    asyncio.run(main())