"""
Test Runner for Audio Description Pipeline

This script runs the test suite for the audio description functionality.
"""

import subprocess
import sys
import os

def run_tests():
    """Run the audio description tests"""
    print("Running Audio Description Pipeline Tests...")
    print("=" * 50)
    
    # Change to the audio_ml directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    try:
        # Run pytest on the test file
        result = subprocess.run([
            sys.executable, "-m", "pytest", 
            "test_audio_description.py", 
            "-v", 
            "--tb=short"
        ], capture_output=True, text=True)
        
        print("STDOUT:")
        print(result.stdout)
        
        if result.stderr:
            print("STDERR:")
            print(result.stderr)
        
        if result.returncode == 0:
            print("\n✅ All tests passed!")
        else:
            print(f"\n❌ Some tests failed (exit code: {result.returncode})")
            
        return result.returncode
        
    except Exception as e:
        print(f"❌ Error running tests: {e}")
        return 1

if __name__ == "__main__":
    exit_code = run_tests()
    sys.exit(exit_code)