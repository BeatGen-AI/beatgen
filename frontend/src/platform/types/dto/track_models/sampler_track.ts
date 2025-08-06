/* tslint:disable */
/* eslint-disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

/**
 * Sampler Track model for the database
 */
export interface SamplerTrack {
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
  user_id: string;
  drum_track_id?: string | null;
}
/**
 * Base model for sampler tracks
 */
export interface SamplerTrackBase {
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
}
/**
 * API request model for creating a sampler track
 */
export interface SamplerTrackCreate {
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
 * API request model for updating a sampler track
 */
export interface SamplerTrackUpdate {
  created_at?: string;
  updated_at?: string;
  id: string;
  name?: string;
  base_midi_note?: number;
  grain_size?: number;
  overlap?: number;
  audio_storage_key?: string;
  audio_file_format?: string;
  audio_file_size?: number;
  audio_file_name?: string;
  audio_file_duration?: number;
  audio_file_sample_rate?: number;
  storage_type?: "USER_AUDIO" | "USER_SAMPLE" | "PUBLIC_DRUM" | "PUBLIC_SOUNDFONT";
  midi_notes_json?: {
    [k: string]: unknown;
  };
  waveform_data?: number[] | null;
  drum_track_id?: string | null;
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
