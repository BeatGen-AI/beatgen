/* tslint:disable */
/* eslint-disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

/**
 * Audio Track model for the database
 */
export interface AudioTrack {
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
  user_id: string;
}
/**
 * Base model for audio tracks
 */
export interface AudioTrackBase {
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
 * API request model for creating an audio track
 */
export interface AudioTrackCreate {
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
 * API request model for deleting an audio track
 */
export interface AudioTrackDelete {}
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
 * API request model for updating an audio track
 */
export interface AudioTrackUpdate {
  created_at?: string;
  updated_at?: string;
  id: string;
  name?: string;
  audio_file_storage_key?: string;
  audio_file_format?: string;
  audio_file_size?: number;
  audio_file_duration?: number;
  audio_file_sample_rate?: number;
  storage_type?: "USER_AUDIO" | "USER_SAMPLE" | "PUBLIC_DRUM" | "PUBLIC_SOUNDFONT";
  waveform_data?: number[] | null;
}
export interface SQLModel {}
/**
 * Base model for tracks
 */
export interface TrackBase {
  created_at?: string;
  updated_at?: string;
  id: string;
  name: string;
}
