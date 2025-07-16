#!/usr/bin/env python3
"""
Command-line tool for searching instruments using embeddings.

Usage:
    # Interactive mode
    python scripts/search_instruments.py
    
    # Single query
    python scripts/search_instruments.py "warm analog bass for hip-hop"
    
    # With options
    python scripts/search_instruments.py "bright piano" --top-k 5 --category piano
    
Options:
    --top-k N              Number of results to return (default: 10)
    --threshold FLOAT      Minimum similarity score 0-1 (default: 0.0)
    --category CATEGORY    Filter by instrument category
    --format FORMAT        Filter by file format
    --output FORMAT        Output format: table, json, csv (default: table)
    --show-scores          Show similarity scores
    --show-descriptions    Show full descriptions
    --cache-dir DIR        Cache directory (default: ./search_cache)
    --no-cache            Don't use cached data
    --debug               Show debug information
"""

import argparse
import asyncio
import json
import csv
import sys
import os
from typing import List, Optional
from datetime import datetime
from pathlib import Path
import time

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app2.core.logging import get_logger
from scripts.search.instrument_search_service import InstrumentSearchService, InstrumentSearchResult

logger = get_logger(__name__)


class SearchCLI:
    """Command-line interface for instrument search"""
    
    def __init__(self, cache_dir: str = "./search_cache", use_cache: bool = True):
        self.service = InstrumentSearchService(cache_dir=cache_dir, use_cache=use_cache)
        self.last_search_time = 0.0
    
    async def initialize(self):
        """Initialize the search service"""
        print("Loading instrument database...", end="", flush=True)
        start_time = time.time()
        await self.service.load_instruments()
        load_time = time.time() - start_time
        
        stats = self.service.get_search_statistics()
        print(f" Done! ({load_time:.2f}s)")
        print(f"Loaded {stats['total_instruments']} instruments across {len(stats['categories'])} categories")
    
    async def search(self, 
                    query: str,
                    top_k: int = 10,
                    threshold: float = 0.0,
                    category: Optional[str] = None,
                    format: Optional[str] = None,
                    show_scores: bool = False,
                    show_descriptions: bool = False,
                    debug: bool = False) -> List[InstrumentSearchResult]:
        """Perform search and return results"""
        start_time = time.time()
        
        if debug:
            print(f"\nDebug: Searching for '{query}'")
            print(f"  Parameters: top_k={top_k}, threshold={threshold}, category={category}, format={format}")
        
        results = await self.service.search(
            query=query,
            top_k=top_k,
            similarity_threshold=threshold,
            category_filter=category,
            format_filter=format
        )
        
        self.last_search_time = time.time() - start_time
        
        if debug:
            print(f"  Search completed in {self.last_search_time:.3f}s")
            print(f"  Found {len(results)} results")
        
        return results
    
    def format_results_table(self, 
                           results: List[InstrumentSearchResult],
                           show_scores: bool = False,
                           show_descriptions: bool = False) -> str:
        """Format results as a table"""
        if not results:
            return "No results found."
        
        lines = []
        
        # Header
        header = f"{'#':>3} | {'Name':<40} | {'Category':<15} | {'Format':<8}"
        if show_scores:
            header += f" | {'Score':<6}"
        lines.append(header)
        lines.append("-" * len(header))
        
        # Results
        for result in results:
            name = result.name[:40].ljust(40)
            row = f"{result.rank:3d} | {name} | {result.category:<15} | {result.file_format:<8}"
            if show_scores:
                row += f" | {result.similarity_score:.4f}"
            lines.append(row)
            
            if show_descriptions and result.description:
                desc = result.description[:120]
                if len(result.description) > 120:
                    desc += "..."
                lines.append(f"     {desc}")
                lines.append("")
        
        # Footer
        lines.append("")
        lines.append(f"Search time: {self.last_search_time:.3f}s")
        
        return "\n".join(lines)
    
    def format_results_json(self, results: List[InstrumentSearchResult]) -> str:
        """Format results as JSON"""
        data = {
            "query_time": self.last_search_time,
            "total_results": len(results),
            "results": [result.to_dict() for result in results]
        }
        return json.dumps(data, indent=2)
    
    def format_results_csv(self, results: List[InstrumentSearchResult]) -> str:
        """Format results as CSV"""
        if not results:
            return ""
        
        output = []
        writer = csv.DictWriter(
            output, 
            fieldnames=["rank", "instrument_id", "name", "category", "file_format", 
                       "similarity_score", "description", "storage_key"]
        )
        writer.writeheader()
        
        for result in results:
            writer.writerow(result.to_dict())
        
        return "\n".join(output)
    
    async def interactive_mode(self, **search_kwargs):
        """Run in interactive mode"""
        print("\nInteractive Instrument Search")
        print("Type 'help' for commands, 'quit' to exit")
        print("-" * 50)
        
        while True:
            try:
                query = input("\nSearch> ").strip()
                
                if not query:
                    continue
                
                if query.lower() == "quit":
                    break
                
                if query.lower() == "help":
                    self.print_help()
                    continue
                
                if query.lower() == "stats":
                    self.print_stats()
                    continue
                
                if query.lower().startswith("similar "):
                    await self.find_similar(query[8:].strip())
                    continue
                
                # Perform search
                results = await self.search(query, **search_kwargs)
                
                # Display results
                print(self.format_results_table(
                    results, 
                    show_scores=search_kwargs.get("show_scores", False),
                    show_descriptions=search_kwargs.get("show_descriptions", False)
                ))
                
            except KeyboardInterrupt:
                print("\nUse 'quit' to exit")
            except Exception as e:
                print(f"Error: {e}")
    
    def print_help(self):
        """Print help message"""
        print("""
Available commands:
  <query>           - Search for instruments matching the query
  similar <id>      - Find instruments similar to the given instrument ID
  stats            - Show search index statistics
  help             - Show this help message
  quit             - Exit the program

Search examples:
  warm analog bass
  bright acoustic guitar for folk
  punchy electronic drums
  atmospheric pad for ambient music
  vintage piano with character
""")
    
    def print_stats(self):
        """Print search statistics"""
        stats = self.service.get_search_statistics()
        
        print("\nSearch Index Statistics")
        print("-" * 30)
        print(f"Total instruments: {stats['total_instruments']}")
        print(f"With embeddings: {stats['total_with_embeddings']}")
        
        print("\nCategories:")
        for category, count in sorted(stats['categories'].items()):
            print(f"  {category}: {count}")
        
        if 'embedding_stats' in stats:
            embed_stats = stats['embedding_stats']
            print(f"\nEmbedding Statistics:")
            print(f"  Dimension: {embed_stats['embedding_dimension']}")
            if 'similarity_stats' in embed_stats:
                sim_stats = embed_stats['similarity_stats']
                print(f"  Mean similarity: {sim_stats['mean']:.3f}")
                print(f"  Similarity range: [{sim_stats['min']:.3f}, {sim_stats['max']:.3f}]")
    
    async def find_similar(self, instrument_id: str):
        """Find similar instruments"""
        try:
            results = await self.service.search_similar_instruments(
                instrument_id, 
                top_k=5,
                exclude_same=True
            )
            
            print(f"\nInstruments similar to {instrument_id}:")
            print(self.format_results_table(results, show_scores=True))
            
        except ValueError as e:
            print(f"Error: {e}")


async def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description="Search for instruments using text queries",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument("query", nargs="?", help="Search query (interactive mode if not provided)")
    parser.add_argument("--top-k", type=int, default=10, help="Number of results")
    parser.add_argument("--threshold", type=float, default=0.0, help="Minimum similarity (0-1)")
    parser.add_argument("--category", help="Filter by category")
    parser.add_argument("--format", help="Filter by file format")
    parser.add_argument("--output", choices=["table", "json", "csv"], default="table", 
                       help="Output format")
    parser.add_argument("--show-scores", action="store_true", help="Show similarity scores")
    parser.add_argument("--show-descriptions", action="store_true", help="Show descriptions")
    parser.add_argument("--cache-dir", default="./search_cache", help="Cache directory")
    parser.add_argument("--no-cache", action="store_true", help="Don't use cache")
    parser.add_argument("--debug", action="store_true", help="Show debug info")
    
    args = parser.parse_args()
    
    # Create CLI
    cli = SearchCLI(
        cache_dir=args.cache_dir,
        use_cache=not args.no_cache
    )
    
    # Initialize
    await cli.initialize()
    
    # Prepare search kwargs
    search_kwargs = {
        "top_k": args.top_k,
        "threshold": args.threshold,
        "category": args.category,
        "format": args.format,
        "show_scores": args.show_scores,
        "show_descriptions": args.show_descriptions,
        "debug": args.debug
    }
    
    if args.query:
        # Single query mode
        results = await cli.search(args.query, **search_kwargs)
        
        # Format output
        if args.output == "json":
            print(cli.format_results_json(results))
        elif args.output == "csv":
            print(cli.format_results_csv(results))
        else:
            print(cli.format_results_table(
                results, 
                show_scores=args.show_scores,
                show_descriptions=args.show_descriptions
            ))
    else:
        # Interactive mode
        await cli.interactive_mode(**search_kwargs)


if __name__ == "__main__":
    asyncio.run(main())