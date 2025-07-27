# Instrument Description Batch Processing

This directory contains scripts for batch processing instrument files to generate AI-powered descriptions.

## Overview

The batch processing system consists of three main scripts:

1. **add_instrument_descriptions.py** - Main batch processing script
2. **quality_assurance_instruments.py** - Interactive quality review tool
3. **generate_instrument_statistics.py** - Statistics and reporting tool

## Prerequisites

Before running the batch processing:

1. Apply the database migration to add description columns:
   ```sql
   -- Run the migration script at: backend/migrations/add_description_fields.sql
   ```

2. Ensure the ML model is available:
   - The AudioDescriptionService will download the CLAP model on first use
   - Model cache is stored in `backend/audio_ml/model_cache/`

## Usage

### 1. Batch Processing

Generate descriptions for all instrument files:

```bash
cd backend
python scripts/add_instrument_descriptions.py
```

Options:
- `--dry-run` - Preview what would be processed without making changes
- `--limit N` - Process only N files (useful for testing)
- `--category CATEGORY` - Process only files in a specific category
- `--force` - Regenerate descriptions for files that already have them
- `--concurrent N` - Number of concurrent workers (default: 5)

Example:
```bash
# Test with 10 files in dry-run mode
python scripts/add_instrument_descriptions.py --dry-run --limit 10

# Process all piano instruments
python scripts/add_instrument_descriptions.py --category piano

# Regenerate all descriptions with 10 concurrent workers
python scripts/add_instrument_descriptions.py --force --concurrent 10
```

### 2. Quality Assurance

Manually review and edit generated descriptions:

```bash
python scripts/quality_assurance_instruments.py
```

Options:
- `--limit N` - Review only N files (default: 50)
- `--category CAT` - Review only files in a specific category
- `--confidence MIN` - Only review files with confidence below threshold
- `--export FILE` - Export review results to specific file

During review, you can:
- **a** - Approve the description
- **e** - Edit the description
- **r** - Reject the description
- **s** - Skip the file
- **q** - Quit the review session

### 3. Generate Statistics

Create comprehensive reports on description coverage and quality:

```bash
python scripts/generate_instrument_statistics.py
```

Options:
- `--output FILE` - Output file name (default: instrument_statistics)
- `--format FORMAT` - Output format: json, csv, or markdown
- `--visualize` - Generate charts and visualizations (requires matplotlib)

Examples:
```bash
# Generate JSON report
python scripts/generate_instrument_statistics.py --format json

# Generate Markdown report with visualizations
python scripts/generate_instrument_statistics.py --format markdown --visualize

# Generate CSV reports
python scripts/generate_instrument_statistics.py --format csv
```

## Workflow

### Initial Processing

1. Run a dry-run to verify setup:
   ```bash
   python scripts/add_instrument_descriptions.py --dry-run --limit 10
   ```

2. Process all files:
   ```bash
   python scripts/add_instrument_descriptions.py
   ```

3. Review a sample for quality:
   ```bash
   python scripts/quality_assurance_instruments.py --limit 50
   ```

4. Generate statistics report:
   ```bash
   python scripts/generate_instrument_statistics.py --format markdown
   ```

### Ongoing Maintenance

For new instrument files added to the system:

1. Process only new files (without descriptions):
   ```bash
   python scripts/add_instrument_descriptions.py
   ```

2. Review low-confidence descriptions:
   ```bash
   python scripts/quality_assurance_instruments.py --confidence 0.7
   ```

## Output Files

The scripts generate several output files:

- `instrument_description_report.json` - Processing summary from batch script
- `qa_review_YYYYMMDD_HHMMSS.json` - Quality review results
- `instrument_quality_report.md` - Human-readable quality report
- `instrument_statistics.json/csv/md` - Comprehensive statistics
- `instrument_statistics_visualizations/` - Chart images (if --visualize used)

## Performance Considerations

- The batch processor uses concurrent workers for efficiency
- Each audio file is downloaded to a temporary location for processing
- The ML model is loaded once and reused for all files
- Progress is logged every 10 files
- Failed files don't stop the batch - errors are logged and reported

## Troubleshooting

1. **Model download fails**: Check internet connection and disk space
2. **Storage access errors**: Verify Supabase credentials and permissions
3. **Out of memory**: Reduce concurrent workers with `--concurrent 2`
4. **Slow processing**: The CLAP model requires significant CPU/GPU resources

## Database Schema

The following columns are added to the `instrument_files` table:

- `description_generated` (TEXT) - AI-generated description
- `description_confidence` (FLOAT) - Confidence score (0-1)
- `description_model` (TEXT) - Model used for generation
- `description_candidates` (JSONB) - Top description candidates and scores
- `description_embedding` (JSONB) - Audio embedding vector
- `description_generated_at` (TIMESTAMP) - When description was generated

Note: The original `description` column remains for manual descriptions.