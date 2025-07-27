# Batch Processing Tests

This directory contains comprehensive tests for the instrument description batch processing system.

## Test Files

### Core Logic Tests (Recommended)
- **`test_batch_core_logic.py`** - Tests the business logic without external dependencies
  - Progress tracking calculations
  - Quality review statistics
  - Coverage metrics
  - Performance calculations
  - No database or SQLModel dependencies

### Full Integration Tests (Python 3.12 or lower required)
- **`test_batch_processing.py`** - Unit tests with full dependencies
- **`test_batch_processing_integration.py`** - Integration tests with database
- **`test_batch_processing_performance.py`** - Performance and scalability tests
- **`test_batch_processing_standalone.py`** - Attempted standalone tests (has import issues)

## Running Tests

### Run Core Logic Tests (Works with Python 3.13)
```bash
cd backend
python -m pytest tests/test_batch_core_logic.py -v
```

### Run All Tests (Requires Python 3.12 or lower)
```bash
cd backend
python tests/run_batch_tests.py
```

### Run Specific Test Categories
```bash
# Core logic tests only
python -m pytest tests/test_batch_core_logic.py

# With coverage
python -m pytest tests/test_batch_core_logic.py --cov=scripts --cov-report=html
```

## Python 3.13 Compatibility Issue

There is currently a compatibility issue between SQLAlchemy/SQLModel and Python 3.13. The error:
```
AssertionError: Class <class 'sqlalchemy.sql.elements.SQLCoreOperations'> directly inherits TypingOnly but has additional attributes
```

This affects:
- All tests that import SQLModel
- The actual batch processing scripts

### Workarounds

1. **Use Python 3.12 or lower** for running the full test suite and batch processing scripts
2. **Use the core logic tests** (`test_batch_core_logic.py`) which test the business logic without SQLModel dependencies
3. **Wait for SQLAlchemy update** that fixes Python 3.13 compatibility

### Checking Python Version
```bash
python --version
```

If using Python 3.13, consider using pyenv or conda to install Python 3.12:
```bash
# Using pyenv
pyenv install 3.12.7
pyenv local 3.12.7

# Using conda
conda create -n beatgen python=3.12
conda activate beatgen
```

## Test Coverage

The test suite covers:

### Progress Tracking
- Success/failure/skip counting
- Progress percentage calculations
- ETA calculations
- Error collection and reporting

### Quality Review
- Review statistics (approval/edit/rejection rates)
- Export functionality
- Manual review workflow

### Statistics Generation
- Coverage calculations
- Confidence score statistics
- Category distributions
- Performance metrics

### Batch Processing
- Concurrent worker distribution
- Retry logic
- Filtering logic
- Throughput calculations
- Memory usage tracking

## Continuous Integration

When setting up CI/CD, ensure:
1. Use Python 3.12 or lower
2. Install all dependencies from requirements.txt
3. Run the core logic tests as a minimum
4. Run full test suite if SQLAlchemy compatibility is resolved