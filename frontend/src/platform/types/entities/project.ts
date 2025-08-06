/**
 * Extended project types that build on the auto-generated DTOs
 * These types add client-side properties and behavior
 */

import { 
  CombinedTrack as CombinedTrackDTO,
  ProjectWithTracks as ProjectWithTracksDTO,
  TrackInstance
} from '../dto/project';

/**
 * Extended CombinedTrack with client-side properties
 */
export interface CombinedTrackEntity extends CombinedTrackDTO {
  dirty?: boolean; // Client-side only: true if track has unsaved changes
  instances?: TrackInstance[]; // Client-side only: array of track instances on timeline
  
  // Additional client-side properties for compatibility
  solo?: boolean;
  soloed?: boolean;
  position?: { x: number; y: number };
}

/**
 * Extended ProjectWithTracks using CombinedTrackEntity
 */
export interface ProjectWithTracksEntity extends Omit<ProjectWithTracksDTO, 'tracks'> {
  tracks?: CombinedTrackEntity[];
}

// Re-export commonly used DTOs that don't need extension
export type {
  TrackType,
  AudioTrackRead,
  MidiTrackRead,
  SamplerTrackRead,
  DrumTrackRead,
  InstrumentFileRead,
  Project,
  ProjectBase,
  ProjectCreate,
  ProjectRead,
  ProjectUpdate,
  ProjectTrack,
  TrackPreview,
  ProjectWithTrackPreviews
} from '../dto/project';