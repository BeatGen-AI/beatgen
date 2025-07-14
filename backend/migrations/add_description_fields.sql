-- Migration: Add description fields to instrument_files table
-- Date: 2025-07-14

-- Add new columns for AI-generated descriptions
ALTER TABLE instrument_files
ADD COLUMN IF NOT EXISTS description_generated TEXT,
ADD COLUMN IF NOT EXISTS description_confidence FLOAT,
ADD COLUMN IF NOT EXISTS description_model TEXT,
ADD COLUMN IF NOT EXISTS description_candidates JSONB,
ADD COLUMN IF NOT EXISTS description_embedding JSONB,
ADD COLUMN IF NOT EXISTS description_generated_at TIMESTAMP WITH TIME ZONE;

-- Create index on generated_at for efficient querying
CREATE INDEX IF NOT EXISTS idx_instrument_files_description_generated_at 
ON instrument_files(description_generated_at);

-- Create index on confidence for quality filtering
CREATE INDEX IF NOT EXISTS idx_instrument_files_description_confidence 
ON instrument_files(description_confidence);

-- Create GIN index on candidates for JSONB search (optional, for advanced queries)
CREATE INDEX IF NOT EXISTS idx_instrument_files_description_candidates 
ON instrument_files USING GIN (description_candidates);