/* tslint:disable */
/* eslint-disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

/**
 * Drum Track model for the database
 */
export interface DrumTrack {
  created_at?: string;
  updated_at?: string;
  id: string;
  name: string;
  user_id: string;
}
/**
 * Base model for drum tracks
 */
export interface DrumTrackBase {
  created_at?: string;
  updated_at?: string;
  id: string;
  name: string;
}
/**
 * API request model for creating a drum track
 */
export interface DrumTrackCreate {
  created_at?: string;
  updated_at?: string;
  id: string;
  name: string;
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
 * API request model for updating a drum track
 */
export interface DrumTrackUpdate {
  created_at?: string;
  updated_at?: string;
  id: string;
  name?: string;
}
/**
 * Base model for tracks
 */
export interface TrackBase {
  created_at?: string;
  updated_at?: string;
  id: string;
  name: string;
}
