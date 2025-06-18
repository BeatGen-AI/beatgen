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
 * Enum for track types
 */
export type TrackType1 = "MIDI" | "AUDIO" | "SAMPLER" | "DRUM";

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
 * Model for creating a new project-track relationship
 */
export interface ProjectTrackCreate {
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
  project_id: string;
  track_id: string;
}
/**
 * Base DTO for Project-Track relationships
 */
export interface ProjectTrackRead {
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
  project_id: string;
  track_id: string;
}
/**
 * Model for updating project-track settings
 */
export interface ProjectTrackUpdate {
  created_at?: string;
  updated_at?: string;
  name?: string;
  volume?: number;
  pan?: number;
  mute?: boolean;
  duration_ticks?: number;
  track_number?: number;
  track_type?: TrackType1;
  instance_metadata?: TrackInstance[] | null;
  project_id: string;
  track_id: string;
}
