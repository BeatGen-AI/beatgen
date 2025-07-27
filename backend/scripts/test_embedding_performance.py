#!/usr/bin/env python3
"""
Performance testing script for OpenAI embedding generation.

This script:
1. Measures API response times for different batch sizes
2. Tests batch size optimization
3. Profiles memory usage
4. Verifies cost tracking accuracy
5. Tests rate limiting effectiveness

Usage:
    python scripts/test_embedding_performance.py [options]
    
Options:
    --test-sizes        Test different batch sizes (1, 10, 100, 500, 1000, 2048)
    --test-rate-limit   Test rate limiting behavior
    --test-memory       Profile memory usage
    --test-costs        Verify cost calculations
    --iterations N      Number of iterations per test (default: 3)
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
import tracemalloc
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Tuple
import statistics
import psutil
import gc

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app2.core.logging import get_logger
from scripts.services.openai_embedding_service import OpenAIEmbeddingService

# Configure logging
logger = get_logger(__name__)


class PerformanceTester:
    """Performance tester for embedding generation"""
    
    def __init__(self, iterations: int = 3):
        self.iterations = iterations
        self.results = {
            "batch_size_tests": [],
            "rate_limit_tests": [],
            "memory_tests": [],
            "cost_tests": [],
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        self.service = None
    
    def generate_test_texts(self, count: int) -> List[str]:
        """Generate test texts of varying lengths"""
        templates = [
            "A {adjective} {instrument} with {characteristic} and {effect}",
            "This is a {quality} sample of a {instrument} recorded in a {location} with {processing}",
            "{instrument} loop at {tempo} BPM featuring {technique} and {mood} vibes",
            "Professional {genre} {instrument} patch with {timbre} tone and {dynamics} response",
            "Vintage {era} {instrument} sound with authentic {character} and {texture}"
        ]
        
        adjectives = ["warm", "bright", "dark", "crisp", "smooth", "punchy", "ethereal", "gritty"]
        instruments = ["piano", "guitar", "bass", "drums", "synthesizer", "violin", "saxophone", "trumpet"]
        characteristics = ["deep resonance", "subtle harmonics", "rich overtones", "clear attack"]
        effects = ["reverb", "delay", "chorus", "compression", "distortion", "phaser"]
        
        texts = []
        for i in range(count):
            template = templates[i % len(templates)]
            text = template.format(
                adjective=adjectives[i % len(adjectives)],
                instrument=instruments[i % len(instruments)],
                characteristic=characteristics[i % len(characteristics)],
                effect=effects[i % len(effects)],
                quality=["high-quality", "professional", "studio-grade"][i % 3],
                location=["studio", "concert hall", "bedroom", "warehouse"][i % 4],
                processing=["analog warmth", "digital clarity", "tape saturation"][i % 3],
                tempo=[120, 128, 140, 90, 100][i % 5],
                technique=["fingerstyle", "strumming", "plucking", "bowing"][i % 4],
                mood=["chill", "energetic", "melancholic", "uplifting"][i % 4],
                genre=["jazz", "rock", "classical", "electronic", "hip-hop"][i % 5],
                timbre=["warm", "bright", "mellow", "aggressive"][i % 4],
                dynamics=["responsive", "compressed", "expressive", "limited"][i % 4],
                era=["1960s", "1970s", "1980s", "1990s"][i % 4],
                character=["analog warmth", "tube saturation", "transistor edge"][i % 3],
                texture=["smooth finish", "grainy texture", "pristine clarity"][i % 3]
            )
            texts.append(text)
        
        return texts
    
    async def test_batch_sizes(self) -> None:
        """Test performance with different batch sizes"""
        logger.info("Testing batch size performance...")
        
        if not self.service:
            self.service = OpenAIEmbeddingService()
        
        batch_sizes = [1, 10, 100, 500, 1000, 2048]
        
        for batch_size in batch_sizes:
            logger.info(f"\nTesting batch size: {batch_size}")
            
            # Generate test data
            texts = self.generate_test_texts(batch_size)
            
            # Run multiple iterations
            times = []
            tokens_list = []
            costs = []
            
            for iteration in range(self.iterations):
                logger.info(f"  Iteration {iteration + 1}/{self.iterations}")
                
                start_time = time.time()
                result = await self.service.generate_embeddings(texts, show_progress=False)
                end_time = time.time()
                
                elapsed = end_time - start_time
                times.append(elapsed)
                tokens_list.append(result.total_tokens)
                costs.append(result.cost)
                
                logger.info(f"    Time: {elapsed:.2f}s, Tokens: {result.total_tokens}, Cost: ${result.cost:.4f}")
                
                # Small delay between iterations
                await asyncio.sleep(2)
            
            # Calculate statistics
            avg_time = statistics.mean(times)
            avg_tokens = statistics.mean(tokens_list)
            avg_cost = statistics.mean(costs)
            throughput = batch_size / avg_time
            
            test_result = {
                "batch_size": batch_size,
                "iterations": self.iterations,
                "avg_time_seconds": avg_time,
                "min_time_seconds": min(times),
                "max_time_seconds": max(times),
                "throughput_per_second": throughput,
                "avg_tokens": avg_tokens,
                "avg_cost": avg_cost,
                "tokens_per_text": avg_tokens / batch_size,
                "cost_per_text": avg_cost / batch_size,
                "efficiency_score": throughput / avg_cost if avg_cost > 0 else 0
            }
            
            self.results["batch_size_tests"].append(test_result)
            
            logger.info(f"  Summary: {throughput:.1f} embeddings/s, ${avg_cost/batch_size:.6f} per embedding")
    
    async def test_rate_limiting(self) -> None:
        """Test rate limiting behavior"""
        logger.info("\nTesting rate limiting...")
        
        if not self.service:
            self.service = OpenAIEmbeddingService()
        
        # Generate enough requests to trigger rate limiting
        # We'll send 10 batches of 100 texts rapidly
        batch_count = 10
        batch_size = 100
        texts = self.generate_test_texts(batch_size)
        
        logger.info(f"Sending {batch_count} batches of {batch_size} texts rapidly...")
        
        results = []
        start_time = time.time()
        
        # Send all requests concurrently
        tasks = []
        for i in range(batch_count):
            async def process_batch(batch_num):
                batch_start = time.time()
                result = await self.service.generate_embeddings(texts, show_progress=False)
                batch_end = time.time()
                return {
                    "batch_num": batch_num,
                    "start_time": batch_start - start_time,
                    "end_time": batch_end - start_time,
                    "duration": batch_end - batch_start,
                    "tokens": result.total_tokens
                }
            
            tasks.append(process_batch(i))
        
        batch_results = await asyncio.gather(*tasks)
        end_time = time.time()
        total_duration = end_time - start_time
        
        # Analyze rate limiting behavior
        self.results["rate_limit_tests"] = {
            "total_batches": batch_count,
            "batch_size": batch_size,
            "total_duration": total_duration,
            "batches": batch_results,
            "avg_batch_duration": statistics.mean([b["duration"] for b in batch_results]),
            "requests_per_minute": (batch_count / total_duration) * 60
        }
        
        logger.info(f"  Completed in {total_duration:.1f}s")
        logger.info(f"  Effective rate: {(batch_count / total_duration) * 60:.1f} requests/minute")
    
    async def test_memory_usage(self) -> None:
        """Profile memory usage for large batches"""
        logger.info("\nTesting memory usage...")
        
        if not self.service:
            self.service = OpenAIEmbeddingService()
        
        # Test with increasingly large batches
        batch_sizes = [100, 500, 1000, 2048]
        
        for batch_size in batch_sizes:
            logger.info(f"\nTesting memory with batch size: {batch_size}")
            
            # Get baseline memory
            gc.collect()
            process = psutil.Process()
            baseline_memory = process.memory_info().rss / 1024 / 1024  # MB
            
            # Start memory tracing
            tracemalloc.start()
            
            # Generate test data
            texts = self.generate_test_texts(batch_size)
            
            # Process embeddings
            start_time = time.time()
            result = await self.service.generate_embeddings(texts, show_progress=False)
            end_time = time.time()
            
            # Get memory stats
            current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            
            current_memory = process.memory_info().rss / 1024 / 1024  # MB
            memory_increase = current_memory - baseline_memory
            
            memory_result = {
                "batch_size": batch_size,
                "baseline_memory_mb": baseline_memory,
                "peak_memory_mb": current_memory,
                "memory_increase_mb": memory_increase,
                "traced_current_mb": current / 1024 / 1024,
                "traced_peak_mb": peak / 1024 / 1024,
                "processing_time": end_time - start_time,
                "memory_per_embedding_kb": (memory_increase * 1024) / batch_size if batch_size > 0 else 0
            }
            
            self.results["memory_tests"].append(memory_result)
            
            logger.info(f"  Memory increase: {memory_increase:.1f} MB")
            logger.info(f"  Per embedding: {memory_result['memory_per_embedding_kb']:.1f} KB")
            
            # Clean up
            gc.collect()
            await asyncio.sleep(2)
    
    async def test_cost_accuracy(self) -> None:
        """Verify cost calculation accuracy"""
        logger.info("\nTesting cost calculation accuracy...")
        
        if not self.service:
            self.service = OpenAIEmbeddingService()
        
        # Test with known text lengths
        test_cases = [
            {
                "name": "Short texts",
                "texts": ["Hello world"] * 10,
                "description": "10 very short texts"
            },
            {
                "name": "Medium texts",
                "texts": self.generate_test_texts(50)[:50],
                "description": "50 medium-length descriptions"
            },
            {
                "name": "Long texts",
                "texts": [
                    "This is a very long description that contains many words and should use more tokens. " * 10
                    for _ in range(20)
                ],
                "description": "20 long texts"
            }
        ]
        
        for test_case in test_cases:
            logger.info(f"\nTesting: {test_case['name']}")
            
            # Estimate cost
            estimated_tokens, estimated_cost = self.service.estimate_cost(test_case["texts"])
            
            # Get actual cost
            result = await self.service.generate_embeddings(test_case["texts"], show_progress=False)
            
            # Calculate accuracy
            token_accuracy = (estimated_tokens / result.total_tokens * 100) if result.total_tokens > 0 else 0
            cost_accuracy = (estimated_cost / result.cost * 100) if result.cost > 0 else 0
            
            cost_result = {
                "test_name": test_case["name"],
                "text_count": len(test_case["texts"]),
                "estimated_tokens": estimated_tokens,
                "actual_tokens": result.total_tokens,
                "token_accuracy_percent": token_accuracy,
                "estimated_cost": estimated_cost,
                "actual_cost": result.cost,
                "cost_accuracy_percent": cost_accuracy,
                "description": test_case["description"]
            }
            
            self.results["cost_tests"].append(cost_result)
            
            logger.info(f"  Token accuracy: {token_accuracy:.1f}%")
            logger.info(f"  Cost accuracy: {cost_accuracy:.1f}%")
    
    def generate_report(self) -> Dict[str, Any]:
        """Generate performance test report"""
        report = {
            "test_summary": {
                "timestamp": self.results["timestamp"],
                "iterations_per_test": self.iterations,
                "tests_completed": {
                    "batch_sizes": len(self.results["batch_size_tests"]),
                    "rate_limiting": len(self.results["rate_limit_tests"]) > 0,
                    "memory_profiling": len(self.results["memory_tests"]),
                    "cost_accuracy": len(self.results["cost_tests"])
                }
            },
            "results": self.results,
            "recommendations": []
        }
        
        # Add recommendations based on results
        if self.results["batch_size_tests"]:
            # Find optimal batch size
            best_efficiency = max(self.results["batch_size_tests"], 
                                key=lambda x: x["efficiency_score"])
            report["recommendations"].append(
                f"Optimal batch size: {best_efficiency['batch_size']} "
                f"(efficiency: {best_efficiency['efficiency_score']:.2f})"
            )
        
        if self.results["memory_tests"]:
            # Check memory usage
            max_batch = max(self.results["memory_tests"], key=lambda x: x["batch_size"])
            if max_batch["memory_per_embedding_kb"] < 10:
                report["recommendations"].append(
                    "Memory usage is efficient; safe to use maximum batch size (2048)"
                )
        
        if self.results["cost_tests"]:
            # Check cost accuracy
            avg_accuracy = statistics.mean([t["cost_accuracy_percent"] for t in self.results["cost_tests"]])
            if avg_accuracy > 90:
                report["recommendations"].append(
                    f"Cost estimation is accurate ({avg_accuracy:.1f}% average)"
                )
        
        return report


async def main(args):
    """Main testing function."""
    tester = PerformanceTester(iterations=args.iterations)
    
    # Run requested tests
    if args.test_sizes:
        await tester.test_batch_sizes()
    
    if args.test_rate_limit:
        await tester.test_rate_limiting()
    
    if args.test_memory:
        await tester.test_memory_usage()
    
    if args.test_costs:
        await tester.test_cost_accuracy()
    
    # If no specific tests requested, run all
    if not any([args.test_sizes, args.test_rate_limit, args.test_memory, args.test_costs]):
        logger.info("No specific tests requested; running all tests...")
        await tester.test_batch_sizes()
        await tester.test_rate_limiting()
        await tester.test_memory_usage()
        await tester.test_cost_accuracy()
    
    # Generate and save report
    report = tester.generate_report()
    
    # Print summary
    print("\n" + "="*60)
    print("PERFORMANCE TEST SUMMARY")
    print("="*60)
    
    if report["results"]["batch_size_tests"]:
        print("\nBatch Size Performance:")
        for test in report["results"]["batch_size_tests"]:
            print(f"  Size {test['batch_size']:4d}: "
                  f"{test['throughput_per_second']:6.1f} emb/s, "
                  f"${test['cost_per_text']:.6f}/emb")
    
    if report["results"]["rate_limit_tests"]:
        print(f"\nRate Limiting:")
        print(f"  Effective rate: {report['results']['rate_limit_tests']['requests_per_minute']:.1f} req/min")
    
    if report["results"]["memory_tests"]:
        print("\nMemory Usage:")
        for test in report["results"]["memory_tests"]:
            print(f"  Size {test['batch_size']:4d}: "
                  f"{test['memory_increase_mb']:6.1f} MB, "
                  f"{test['memory_per_embedding_kb']:.1f} KB/emb")
    
    if report["results"]["cost_tests"]:
        print("\nCost Accuracy:")
        for test in report["results"]["cost_tests"]:
            print(f"  {test['test_name']}: {test['cost_accuracy_percent']:.1f}% accurate")
    
    print("\nRecommendations:")
    for rec in report["recommendations"]:
        print(f"  • {rec}")
    
    # Save detailed report
    report_path = Path("embedding_performance_report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nDetailed report saved to: {report_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test embedding generation performance")
    parser.add_argument("--test-sizes", action="store_true", help="Test different batch sizes")
    parser.add_argument("--test-rate-limit", action="store_true", help="Test rate limiting")
    parser.add_argument("--test-memory", action="store_true", help="Profile memory usage")
    parser.add_argument("--test-costs", action="store_true", help="Verify cost calculations")
    parser.add_argument("--iterations", type=int, default=3, help="Iterations per test")
    
    args = parser.parse_args()
    
    # Run async main
    asyncio.run(main(args))