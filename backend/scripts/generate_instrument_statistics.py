#!/usr/bin/env python3
"""
Generate comprehensive statistics and quality metrics for instrument descriptions.

This script:
1. Analyzes all instrument files and their descriptions
2. Generates distribution statistics by category
3. Creates quality metrics (confidence scores, processing times)
4. Produces visualizations and reports

Usage:
    python scripts/generate_instrument_statistics.py [options]
    
Options:
    --output FILE      Output report file (default: instrument_statistics.json)
    --format FORMAT    Output format: json, csv, markdown (default: json)
    --visualize        Generate charts and visualizations
"""

import argparse
import json
import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional
from collections import defaultdict
import statistics

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select, func
from app2.infrastructure.database.sqlmodel_client import get_session
from app2.models.public_models.instrument_file import InstrumentFile
from app2.core.logging import get_logger

logger = get_logger(__name__)


class InstrumentStatistics:
    """Container for instrument statistics."""
    
    def __init__(self):
        self.total_files = 0
        self.files_with_descriptions = 0
        self.files_without_descriptions = 0
        self.categories: Dict[str, int] = defaultdict(int)
        self.confidence_scores: List[float] = []
        self.description_lengths: List[int] = []
        self.models_used: Dict[str, int] = defaultdict(int)
        self.processing_times: List[float] = []
        self.top_descriptions: Dict[str, int] = defaultdict(int)
        self.generation_dates: List[datetime] = []
        
    def add_file(self, file: InstrumentFile):
        """Add a file to the statistics."""
        self.total_files += 1
        self.categories[file.category] += 1
        
        if file.description_generated:
            self.files_with_descriptions += 1
            self.confidence_scores.append(file.description_confidence or 0)
            self.description_lengths.append(len(file.description_generated))
            self.top_descriptions[file.description_generated] += 1
            
            if file.description_model:
                self.models_used[file.description_model] += 1
            
            if file.description_candidates:
                inference_time = file.description_candidates.get("inference_time", 0)
                if inference_time:
                    self.processing_times.append(inference_time)
            
            if file.description_generated_at:
                self.generation_dates.append(file.description_generated_at)
        else:
            self.files_without_descriptions += 1
    
    def get_summary(self) -> Dict[str, Any]:
        """Generate summary statistics."""
        coverage = (self.files_with_descriptions / self.total_files * 100) if self.total_files > 0 else 0
        
        summary = {
            "total_files": self.total_files,
            "files_with_descriptions": self.files_with_descriptions,
            "files_without_descriptions": self.files_without_descriptions,
            "coverage_percentage": f"{coverage:.1f}%",
            "categories": dict(self.categories),
            "models_used": dict(self.models_used)
        }
        
        # Confidence statistics
        if self.confidence_scores:
            summary["confidence_stats"] = {
                "mean": statistics.mean(self.confidence_scores),
                "median": statistics.median(self.confidence_scores),
                "min": min(self.confidence_scores),
                "max": max(self.confidence_scores),
                "std_dev": statistics.stdev(self.confidence_scores) if len(self.confidence_scores) > 1 else 0
            }
        
        # Description length statistics
        if self.description_lengths:
            summary["description_length_stats"] = {
                "mean": statistics.mean(self.description_lengths),
                "median": statistics.median(self.description_lengths),
                "min": min(self.description_lengths),
                "max": max(self.description_lengths)
            }
        
        # Processing time statistics
        if self.processing_times:
            summary["processing_time_stats"] = {
                "mean": statistics.mean(self.processing_times),
                "median": statistics.median(self.processing_times),
                "min": min(self.processing_times),
                "max": max(self.processing_times),
                "total": sum(self.processing_times)
            }
        
        # Top descriptions (most common)
        top_10_descriptions = sorted(
            self.top_descriptions.items(), 
            key=lambda x: x[1], 
            reverse=True
        )[:10]
        summary["most_common_descriptions"] = [
            {"description": desc, "count": count} 
            for desc, count in top_10_descriptions
        ]
        
        # Generation timeline
        if self.generation_dates:
            sorted_dates = sorted(self.generation_dates)
            summary["generation_timeline"] = {
                "first_generated": sorted_dates[0].isoformat(),
                "last_generated": sorted_dates[-1].isoformat(),
                "duration_days": (sorted_dates[-1] - sorted_dates[0]).days
            }
        
        return summary
    
    def get_category_breakdown(self) -> Dict[str, Dict[str, Any]]:
        """Get detailed breakdown by category."""
        breakdown = {}
        
        with next(get_session()) as session:
            for category in self.categories.keys():
                # Query category-specific statistics
                query = select(
                    func.count(InstrumentFile.id),
                    func.count(InstrumentFile.description_generated),
                    func.avg(InstrumentFile.description_confidence)
                ).where(InstrumentFile.category == category)
                
                result = session.exec(query).first()
                total, with_desc, avg_confidence = result
                
                breakdown[category] = {
                    "total_files": total,
                    "files_with_descriptions": with_desc or 0,
                    "coverage_percentage": f"{(with_desc / total * 100):.1f}%" if total > 0 else "0%",
                    "average_confidence": float(avg_confidence) if avg_confidence else 0
                }
        
        return breakdown


def export_json(stats: InstrumentStatistics, filepath: Path):
    """Export statistics as JSON."""
    data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": stats.get_summary(),
        "category_breakdown": stats.get_category_breakdown()
    }
    
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
    
    logger.info(f"Statistics exported to: {filepath}")


def export_csv(stats: InstrumentStatistics, filepath: Path):
    """Export statistics as CSV."""
    summary = stats.get_summary()
    
    # Create main summary CSV
    with open(filepath, "w", newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["Metric", "Value"])
        
        # Basic metrics
        writer.writerow(["Total Files", summary["total_files"]])
        writer.writerow(["Files with Descriptions", summary["files_with_descriptions"]])
        writer.writerow(["Files without Descriptions", summary["files_without_descriptions"]])
        writer.writerow(["Coverage Percentage", summary["coverage_percentage"]])
        
        # Confidence stats
        if "confidence_stats" in summary:
            conf_stats = summary["confidence_stats"]
            writer.writerow(["Average Confidence", f"{conf_stats['mean']:.3f}"])
            writer.writerow(["Median Confidence", f"{conf_stats['median']:.3f}"])
            writer.writerow(["Min Confidence", f"{conf_stats['min']:.3f}"])
            writer.writerow(["Max Confidence", f"{conf_stats['max']:.3f}"])
    
    # Create category breakdown CSV
    category_file = filepath.parent / f"{filepath.stem}_categories.csv"
    breakdown = stats.get_category_breakdown()
    
    with open(category_file, "w", newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["Category", "Total Files", "With Descriptions", "Coverage %", "Avg Confidence"])
        
        for category, data in breakdown.items():
            writer.writerow([
                category,
                data["total_files"],
                data["files_with_descriptions"],
                data["coverage_percentage"],
                f"{data['average_confidence']:.3f}"
            ])
    
    logger.info(f"Statistics exported to: {filepath} and {category_file}")


def export_markdown(stats: InstrumentStatistics, filepath: Path):
    """Export statistics as Markdown report."""
    summary = stats.get_summary()
    breakdown = stats.get_category_breakdown()
    
    content = f"""# Instrument Description Statistics Report

Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}

## Overall Summary

- **Total Instrument Files**: {summary['total_files']:,}
- **Files with Descriptions**: {summary['files_with_descriptions']:,}
- **Files without Descriptions**: {summary['files_without_descriptions']:,}
- **Coverage**: {summary['coverage_percentage']}

"""
    
    # Confidence statistics
    if "confidence_stats" in summary:
        conf = summary["confidence_stats"]
        content += f"""## Confidence Score Statistics

- **Mean**: {conf['mean']:.3f}
- **Median**: {conf['median']:.3f}
- **Min**: {conf['min']:.3f}
- **Max**: {conf['max']:.3f}
- **Std Dev**: {conf['std_dev']:.3f}

"""
    
    # Processing time statistics
    if "processing_time_stats" in summary:
        proc = summary["processing_time_stats"]
        content += f"""## Processing Performance

- **Average Time**: {proc['mean']:.2f}s
- **Median Time**: {proc['median']:.2f}s
- **Total Processing Time**: {proc['total']:.1f}s ({proc['total']/60:.1f} minutes)

"""
    
    # Category breakdown
    content += "## Category Breakdown\n\n"
    content += "| Category | Total Files | With Descriptions | Coverage | Avg Confidence |\n"
    content += "|----------|-------------|-------------------|----------|----------------|\n"
    
    for category, data in sorted(breakdown.items()):
        content += f"| {category} | {data['total_files']} | {data['files_with_descriptions']} | "
        content += f"{data['coverage_percentage']} | {data['average_confidence']:.3f} |\n"
    
    # Most common descriptions
    if summary.get("most_common_descriptions"):
        content += "\n## Most Common Descriptions\n\n"
        for i, item in enumerate(summary["most_common_descriptions"][:10], 1):
            content += f"{i}. **{item['description']}** - {item['count']} occurrences\n"
    
    # Models used
    if summary.get("models_used"):
        content += "\n## Models Used\n\n"
        for model, count in summary["models_used"].items():
            content += f"- **{model}**: {count} files\n"
    
    # Generation timeline
    if "generation_timeline" in summary:
        timeline = summary["generation_timeline"]
        content += f"\n## Generation Timeline\n\n"
        content += f"- **First Generated**: {timeline['first_generated']}\n"
        content += f"- **Last Generated**: {timeline['last_generated']}\n"
        content += f"- **Duration**: {timeline['duration_days']} days\n"
    
    with open(filepath, "w") as f:
        f.write(content)
    
    logger.info(f"Statistics report exported to: {filepath}")


def generate_visualizations(stats: InstrumentStatistics, output_dir: Path):
    """Generate visualization charts (requires matplotlib)."""
    try:
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError:
        logger.warning("matplotlib not installed. Skipping visualizations.")
        return
    
    output_dir.mkdir(exist_ok=True)
    
    # Category distribution pie chart
    plt.figure(figsize=(10, 8))
    categories = list(stats.categories.keys())
    counts = list(stats.categories.values())
    plt.pie(counts, labels=categories, autopct='%1.1f%%')
    plt.title('Instrument Files by Category')
    plt.savefig(output_dir / 'category_distribution.png')
    plt.close()
    
    # Confidence score histogram
    if stats.confidence_scores:
        plt.figure(figsize=(10, 6))
        plt.hist(stats.confidence_scores, bins=20, edgecolor='black')
        plt.xlabel('Confidence Score')
        plt.ylabel('Count')
        plt.title('Distribution of Confidence Scores')
        plt.savefig(output_dir / 'confidence_distribution.png')
        plt.close()
    
    # Processing time distribution
    if stats.processing_times:
        plt.figure(figsize=(10, 6))
        plt.hist(stats.processing_times, bins=20, edgecolor='black')
        plt.xlabel('Processing Time (seconds)')
        plt.ylabel('Count')
        plt.title('Distribution of Processing Times')
        plt.savefig(output_dir / 'processing_time_distribution.png')
        plt.close()
    
    logger.info(f"Visualizations saved to: {output_dir}")


def main(args):
    """Main statistics generation function."""
    stats = InstrumentStatistics()
    
    # Query all instrument files
    with next(get_session()) as session:
        query = select(InstrumentFile)
        files = session.exec(query).all()
        
        for file in files:
            stats.add_file(file)
    
    logger.info(f"Analyzed {stats.total_files} instrument files")
    
    # Export based on format
    output_path = Path(args.output)
    
    if args.format == "json":
        export_json(stats, output_path.with_suffix('.json'))
    elif args.format == "csv":
        export_csv(stats, output_path.with_suffix('.csv'))
    elif args.format == "markdown":
        export_markdown(stats, output_path.with_suffix('.md'))
    
    # Generate visualizations if requested
    if args.visualize:
        viz_dir = output_path.parent / f"{output_path.stem}_visualizations"
        generate_visualizations(stats, viz_dir)
    
    # Print summary to console
    summary = stats.get_summary()
    print("\n" + "="*60)
    print("INSTRUMENT DESCRIPTION STATISTICS")
    print("="*60)
    print(f"Total Files: {summary['total_files']:,}")
    print(f"With Descriptions: {summary['files_with_descriptions']:,}")
    print(f"Coverage: {summary['coverage_percentage']}")
    
    if "confidence_stats" in summary:
        print(f"\nAverage Confidence: {summary['confidence_stats']['mean']:.3f}")
    
    print("\nDetailed report saved to:", output_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate statistics for instrument descriptions")
    parser.add_argument("--output", default="instrument_statistics", help="Output file name")
    parser.add_argument("--format", choices=["json", "csv", "markdown"], 
                       default="json", help="Output format")
    parser.add_argument("--visualize", action="store_true", 
                       help="Generate visualization charts")
    
    args = parser.parse_args()
    main(args)