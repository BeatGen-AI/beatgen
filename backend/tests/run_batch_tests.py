#!/usr/bin/env python3
"""
Test runner for batch processing tests.

Usage:
    python tests/run_batch_tests.py [options]
    
Options:
    --unit        Run only unit tests
    --integration Run only integration tests  
    --performance Run only performance tests
    --coverage    Generate coverage report
    --verbose     Verbose output
"""

import subprocess
import sys
import argparse
from pathlib import Path


def run_tests(test_type=None, coverage=False, verbose=False):
    """Run the specified tests."""
    cmd = ["python", "-m", "pytest"]
    
    # Add test files based on type
    if test_type == "unit":
        cmd.append("tests/test_batch_processing_standalone.py")
    elif test_type == "integration":
        cmd.append("tests/test_batch_processing_integration.py")
    elif test_type == "performance":
        cmd.append("tests/test_batch_processing_performance.py")
    elif test_type == "standalone":
        cmd.append("tests/test_batch_processing_standalone.py")
    else:
        # Run standalone tests by default to avoid SQLModel issues
        cmd.append("tests/test_batch_processing_standalone.py")
    
    # Add options
    if verbose:
        cmd.extend(["-v", "-s"])
    else:
        cmd.append("-v")
    
    # Add coverage options
    if coverage:
        cmd.extend([
            "--cov=scripts",
            "--cov-report=term-missing",
            "--cov-report=html:htmlcov",
            "--cov-config=.coveragerc"
        ])
    
    # Run tests
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=Path(__file__).parent.parent)
    
    if coverage and result.returncode == 0:
        print("\nCoverage report generated in htmlcov/index.html")
    
    return result.returncode


def main():
    """Main test runner."""
    parser = argparse.ArgumentParser(description="Run batch processing tests")
    parser.add_argument("--unit", action="store_true", help="Run only unit tests")
    parser.add_argument("--integration", action="store_true", help="Run only integration tests")
    parser.add_argument("--performance", action="store_true", help="Run only performance tests")
    parser.add_argument("--standalone", action="store_true", help="Run standalone tests (no DB)")
    parser.add_argument("--coverage", action="store_true", help="Generate coverage report")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    
    args = parser.parse_args()
    
    # Determine test type
    test_type = None
    if args.unit:
        test_type = "unit"
    elif args.integration:
        test_type = "integration"
    elif args.performance:
        test_type = "performance"
    elif args.standalone:
        test_type = "standalone"
    
    # Run tests
    exit_code = run_tests(test_type, args.coverage, args.verbose)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()