#!/usr/bin/env python3
"""
Quality assurance script for reviewing generated instrument descriptions.

This script:
1. Queries instrument files with generated descriptions
2. Creates an interactive review interface
3. Allows manual validation and editing of descriptions
4. Generates quality metrics and reports

Usage:
    python scripts/quality_assurance_instruments.py [options]
    
Options:
    --limit N          Review only N files (default: 50)
    --category CAT     Review only files in a specific category
    --export FILE      Export review results to file
    --confidence MIN   Only review files with confidence below MIN
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional
import random

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select, and_
from app2.infrastructure.database.sqlmodel_client import get_session
from app2.models.public_models.instrument_file import InstrumentFile
from app2.core.logging import get_logger
from app2.core.config import get_settings

logger = get_logger(__name__)
settings = get_settings()


class QualityReview:
    """Container for quality review data."""
    def __init__(self):
        self.reviews: List[Dict[str, Any]] = []
        self.start_time = datetime.now(timezone.utc)
        
    def add_review(self, file_id: str, original_desc: str, review_status: str, 
                   edited_desc: Optional[str] = None, notes: Optional[str] = None):
        """Add a review entry."""
        self.reviews.append({
            "file_id": file_id,
            "original_description": original_desc,
            "review_status": review_status,
            "edited_description": edited_desc,
            "notes": notes,
            "reviewed_at": datetime.now(timezone.utc).isoformat()
        })
    
    def get_statistics(self) -> Dict[str, Any]:
        """Calculate review statistics."""
        total = len(self.reviews)
        if total == 0:
            return {"total_reviewed": 0}
        
        approved = sum(1 for r in self.reviews if r["review_status"] == "approved")
        edited = sum(1 for r in self.reviews if r["review_status"] == "edited")
        rejected = sum(1 for r in self.reviews if r["review_status"] == "rejected")
        
        return {
            "total_reviewed": total,
            "approved": approved,
            "edited": edited,
            "rejected": rejected,
            "approval_rate": f"{(approved / total * 100):.1f}%",
            "edit_rate": f"{(edited / total * 100):.1f}%",
            "rejection_rate": f"{(rejected / total * 100):.1f}%",
            "duration_minutes": (datetime.now(timezone.utc) - self.start_time).total_seconds() / 60
        }
    
    def export_to_file(self, filepath: Path):
        """Export review data to JSON file."""
        data = {
            "metadata": {
                "review_date": self.start_time.isoformat(),
                "statistics": self.get_statistics()
            },
            "reviews": self.reviews
        }
        
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        
        logger.info(f"Review data exported to: {filepath}")


def display_instrument_info(file: InstrumentFile):
    """Display instrument file information for review."""
    print("\n" + "="*60)
    print(f"INSTRUMENT: {file.display_name}")
    print(f"Category: {file.category}")
    print(f"File: {file.file_name}")
    print(f"ID: {file.id}")
    
    if file.description_generated:
        print(f"\nGENERATED DESCRIPTION: {file.description_generated}")
        print(f"Confidence: {file.description_confidence:.3f}")
        print(f"Model: {file.description_model}")
        
        if file.description_candidates:
            print(f"\nTop 5 candidates:")
            candidates = file.description_candidates.get("descriptions", [])[:5]
            for i, candidate in enumerate(candidates, 1):
                print(f"  {i}. {candidate['text']} (confidence: {candidate['confidence']:.3f})")
    
    print("="*60)


def review_instrument(file: InstrumentFile, review: QualityReview) -> bool:
    """Interactive review of a single instrument."""
    display_instrument_info(file)
    
    print("\nReview Options:")
    print("  a - Approve description")
    print("  e - Edit description")
    print("  r - Reject description")
    print("  s - Skip this file")
    print("  q - Quit review session")
    
    while True:
        choice = input("\nYour choice [a/e/r/s/q]: ").lower().strip()
        
        if choice == 'a':
            notes = input("Notes (optional): ").strip()
            review.add_review(str(file.id), file.description_generated, "approved", notes=notes)
            print("✓ Description approved")
            return True
            
        elif choice == 'e':
            print(f"\nCurrent: {file.description_generated}")
            new_desc = input("New description: ").strip()
            if new_desc:
                notes = input("Notes (optional): ").strip()
                review.add_review(str(file.id), file.description_generated, "edited", 
                                edited_desc=new_desc, notes=notes)
                
                # Update database with edited description
                with next(get_session()) as session:
                    db_file = session.get(InstrumentFile, file.id)
                    if db_file:
                        db_file.description = new_desc  # Update manual description
                        session.commit()
                        print("✓ Description updated")
                return True
            else:
                print("No changes made")
                
        elif choice == 'r':
            notes = input("Reason for rejection: ").strip()
            review.add_review(str(file.id), file.description_generated, "rejected", notes=notes)
            print("✗ Description rejected")
            return True
            
        elif choice == 's':
            print("→ Skipped")
            return True
            
        elif choice == 'q':
            return False
            
        else:
            print("Invalid choice. Please try again.")


def main(args):
    """Main review function."""
    review = QualityReview()
    
    # Query files to review
    with next(get_session()) as session:
        query = select(InstrumentFile).where(
            InstrumentFile.description_generated.is_not(None)
        )
        
        # Apply filters
        conditions = []
        if args.category:
            conditions.append(InstrumentFile.category == args.category)
        if args.confidence:
            conditions.append(InstrumentFile.description_confidence < args.confidence)
        
        if conditions:
            query = query.where(and_(*conditions))
        
        files = session.exec(query).all()
        
        # Shuffle for random sampling
        files = list(files)
        random.shuffle(files)
        
        # Apply limit
        if args.limit:
            files = files[:args.limit]
    
    if not files:
        logger.info("No files to review")
        return
    
    print(f"\n🔍 QUALITY ASSURANCE SESSION")
    print(f"Files to review: {len(files)}")
    print(f"Press Ctrl+C to stop at any time\n")
    
    try:
        for i, file in enumerate(files, 1):
            print(f"\n[{i}/{len(files)}]")
            if not review_instrument(file, review):
                break
    except KeyboardInterrupt:
        print("\n\nReview session interrupted")
    
    # Display statistics
    stats = review.get_statistics()
    print("\n" + "="*60)
    print("REVIEW SUMMARY")
    print("="*60)
    for key, value in stats.items():
        print(f"{key}: {value}")
    
    # Export results
    if args.export:
        export_path = Path(args.export)
    else:
        export_path = Path(f"qa_review_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    
    review.export_to_file(export_path)
    
    # Generate quality report
    generate_quality_report(review)


def generate_quality_report(review: QualityReview):
    """Generate a detailed quality report."""
    report_path = Path("instrument_quality_report.md")
    
    stats = review.get_statistics()
    
    content = f"""# Instrument Description Quality Report

Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}

## Summary Statistics

- **Total Reviewed**: {stats['total_reviewed']}
- **Approved**: {stats.get('approved', 0)} ({stats.get('approval_rate', '0%')})
- **Edited**: {stats.get('edited', 0)} ({stats.get('edit_rate', '0%')})
- **Rejected**: {stats.get('rejected', 0)} ({stats.get('rejection_rate', '0%')})
- **Review Duration**: {stats.get('duration_minutes', 0):.1f} minutes

## Common Issues Found

"""
    
    # Analyze common rejection reasons
    rejections = [r for r in review.reviews if r["review_status"] == "rejected"]
    if rejections:
        content += "### Rejection Reasons\n\n"
        for r in rejections[:5]:  # First 5 rejections
            content += f"- {r['file_id']}: {r.get('notes', 'No reason provided')}\n"
    
    # Analyze edits
    edits = [r for r in review.reviews if r["review_status"] == "edited"]
    if edits:
        content += "\n### Common Edits\n\n"
        for r in edits[:5]:  # First 5 edits
            content += f"- **Original**: {r['original_description']}\n"
            content += f"  **Edited**: {r['edited_description']}\n"
            if r.get('notes'):
                content += f"  **Notes**: {r['notes']}\n"
            content += "\n"
    
    content += """
## Recommendations

Based on the review results:
"""
    
    approval_rate = float(stats.get('approval_rate', '0').rstrip('%'))
    if approval_rate < 70:
        content += "- Consider improving the description generation model or prompts\n"
        content += "- Review the description candidates to ensure they match instrument types\n"
    elif approval_rate < 90:
        content += "- The system is performing reasonably well but could benefit from refinement\n"
        content += "- Focus on the specific categories or types that are being edited/rejected\n"
    else:
        content += "- The system is performing well with high approval rates\n"
        content += "- Continue monitoring for edge cases\n"
    
    with open(report_path, "w") as f:
        f.write(content)
    
    print(f"\nQuality report saved to: {report_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Quality assurance for instrument descriptions")
    parser.add_argument("--limit", type=int, default=50, help="Number of files to review")
    parser.add_argument("--category", help="Review only files in specific category")
    parser.add_argument("--export", help="Export review results to file")
    parser.add_argument("--confidence", type=float, help="Only review files with confidence below threshold")
    
    args = parser.parse_args()
    main(args)