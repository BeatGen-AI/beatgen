/* tslint:disable */
/* eslint-disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

/**
 * Enum for different generation steps in music creation
 */
export type GenerationStep =
  | "RESEARCH_MUSICAL_CONTEXT"
  | "DETERMINE_MUSICAL_PARAMS"
  | "DETERMINE_MUSICAL_PARAMS_TOOL"
  | "INSTRUMENT_SELECTION"
  | "INSTRUMENT_SELECTION_TOOL"
  | "DRUM_SELECTION"
  | "DRUM_SELECTION_TOOL"
  | "DRUM_BEAT_GENERATION_TOOL"
  | "CHORD_GENERATION_TOOL"
  | "MELODY_GENERATION_TOOL"
  | "COMPLETE";

/**
 * Model for storing assistant chat messages and responses.
 *
 * This table stores both user messages and assistant responses,
 * distinguished by the 'role' field.
 */
export interface AssistantMessage {
  created_at?: string;
  updated_at?: string;
  id?: string;
  project_id: string;
  request_id?: string | null;
  role: string;
  content?: string | null;
  mode?: string | null;
  step?: GenerationStep | null;
  message_metadata?: {
    [k: string]: unknown;
  };
  completed_at?: string | null;
}
/**
 * API response model for assistant message data
 */
export interface AssistantMessageRead {
  id: string;
  project_id: string;
  request_id?: string | null;
  role: string;
  content?: string | null;
  mode?: string | null;
  step?: GenerationStep | null;
  message_metadata?: {
    [k: string]: unknown;
  };
  completed_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}
/**
 * Base model with default UUID primary key and default timestamp fields
 */
export interface DefaultUUIDStandardBase {
  created_at?: string;
  updated_at?: string;
  id?: string;
}
