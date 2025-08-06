/* tslint:disable */
/* eslint-disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

/**
 * Enum for track types
 */
export type TrackType = "MIDI" | "AUDIO" | "SAMPLER" | "DRUM";

/**
 * API response model for audio track data
 */
export interface AudioTrackRead {
  created_at?: string;
  updated_at?: string;
  id: string;
  name: string;
  audio_file_storage_key: string;
  audio_file_format: string;
  audio_file_size: number;
  audio_file_duration: number;
  audio_file_sample_rate: number;
  storage_type?: "USER_AUDIO" | "USER_SAMPLE" | "PUBLIC_DRUM" | "PUBLIC_SOUNDFONT";
  waveform_data?: number[] | null;
}
/**
 * Model that combines Track and ProjectTrack data for API responses
 */
export interface CombinedTrack {
  created_at?: string;
  updated_at?: string;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  duration_ticks: number;
  track_number: number;
  track_type: TrackType;
  instance_metadata?: TrackInstance[] | null;
  id: string;
  track: AudioTrackRead | MidiTrackRead | SamplerTrackRead | DrumTrackRead;
}
/**
 * Represents a track instance within a project
 */
export interface TrackInstance {
  id: string;
  x_position: number;
  y_position: number;
  trim_start_ticks: number;
  trim_end_ticks: number;
}
/**
 * API response model for MIDI track data
 */
export interface MidiTrackRead {
  created_at?: string;
  updated_at?: string;
  id: string;
  name: string;
  instrument_id: string;
  midi_notes_json?: {
    [k: string]: unknown;
  };
  instrument_file: InstrumentFileRead;
}
/**
 * API response model for instrument file data
 */
export interface InstrumentFileRead {
  created_at?: string;
  updated_at?: string;
  id: string;
  file_name: string;
  display_name: string;
  storage_key: string;
  file_format: string;
  file_size: number;
  category: string;
  is_public: boolean;
  description?: string | null;
  [k: string]: unknown;
}
/**
 * API response model for sampler track data
 */
export interface SamplerTrackRead {
  created_at?: string;
  updated_at?: string;
  id: string;
  name: string;
  base_midi_note: number;
  grain_size: number;
  overlap: number;
  audio_storage_key: string;
  audio_file_format: string;
  audio_file_size: number;
  audio_file_name: string;
  audio_file_duration: number;
  audio_file_sample_rate: number;
  storage_type?: "USER_AUDIO" | "USER_SAMPLE" | "PUBLIC_DRUM" | "PUBLIC_SOUNDFONT";
  midi_notes_json?: {
    [k: string]: unknown;
  };
  waveform_data?: number[] | null;
  drum_track_id?: string | null;
}
/**
 * API response model for drum track data
 */
export interface DrumTrackRead {
  created_at?: string;
  updated_at?: string;
  id: string;
  name: string;
  sampler_track_ids?: string[];
  sampler_tracks?: SamplerTrackRead[];
}
/**
 * Project model for the database
 */
export interface Project {
  created_at?: string;
  updated_at?: string;
  id?: string;
  name: string;
  bpm: number;
  time_signature_numerator: number;
  time_signature_denominator: number;
  key_signature: string;
  version?: number;
  user_id: string;
}
/**
 * Base model for projects
 */
export interface ProjectBase {
  created_at?: string;
  updated_at?: string;
  id?: string;
  name: string;
  bpm: number;
  time_signature_numerator: number;
  time_signature_denominator: number;
  key_signature: string;
  version?: number;
}
/**
 * API request model for creating a project
 */
export interface ProjectCreate {
  created_at?: string;
  updated_at?: string;
  id?: string;
  name: string;
  bpm: number;
  time_signature_numerator: number;
  time_signature_denominator: number;
  key_signature: string;
  version?: number;
}
/**
 * API response model for project data
 */
export interface ProjectRead {
  created_at?: string;
  updated_at?: string;
  id?: string;
  name: string;
  bpm: number;
  time_signature_numerator: number;
  time_signature_denominator: number;
  key_signature: string;
  version?: number;
}
/**
 * Represents the association between a Project and a specific track type,
 * storing properties specific to this relationship (e.g., position, volume).
 */
export interface ProjectTrack {
  created_at?: string;
  updated_at?: string;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  duration_ticks: number;
  track_number: number;
  track_type: TrackType;
  instance_metadata?: TrackInstance[] | null;
  project_id?: string;
  track_id?: string;
}
/**
 * Base model for project tracks
 */
export interface ProjectTrackBase {
  created_at?: string;
  updated_at?: string;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  duration_ticks: number;
  track_number: number;
  track_type: TrackType;
  instance_metadata?: TrackInstance[] | null;
}
/**
 * API request model for updating a project
 */
export interface ProjectUpdate {
  name?: string | null;
  bpm?: number | null;
  time_signature_numerator?: number | null;
  time_signature_denominator?: number | null;
  key_signature?: string | null;
}
/**
 * API response model for project with lightweight track preview data
 */
export interface ProjectWithTrackPreviews {
  created_at?: string;
  updated_at?: string;
  id?: string;
  name: string;
  bpm: number;
  time_signature_numerator: number;
  time_signature_denominator: number;
  key_signature: string;
  version?: number;
  user_id: string;
  track_previews?: TrackPreview[];
}
/**
 * Minimal track data for project preview visualization
 */
export interface TrackPreview {
  id: string;
  name: string;
  track_type: TrackType;
  track_number: number;
  mute?: boolean;
  instance_metadata?: {
    [k: string]: unknown;
  }[];
}
/**
 * API response model for project with tracks data
 */
export interface ProjectWithTracks {
  created_at?: string;
  updated_at?: string;
  id?: string;
  name: string;
  bpm: number;
  time_signature_numerator: number;
  time_signature_denominator: number;
  key_signature: string;
  version?: number;
  user_id: string;
  tracks?: CombinedTrack[];
}
export interface SQLModel {}
