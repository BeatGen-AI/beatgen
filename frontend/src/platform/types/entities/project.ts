/**
 * Extended project types that build on the auto-generated DTOs
 * These types add client-side properties and behavior
 */

import {
  CombinedTrack as CombinedTrackDTO,
  ProjectWithTracks as ProjectWithTracksDTO,
  TrackInstance
} from '../dto/project';
import { Note } from '../../../types/note';

/**
 * Extended CombinedTrack with client-side properties
 */
export interface CombinedTrackEntity extends CombinedTrackDTO {
  dirty?: boolean; // Client-side only: true if track has unsaved changes
  instances?: TrackInstance[]; // Client-side only: array of track instances on timeline
  notes?: Note[]; // Client-side only: MIDI notes for this track (source of truth for note data)

  // Additional client-side properties for compatibility
  solo?: boolean;
  soloed?: boolean;
  // Note: Tracks do NOT have position - only instances have position (x_position, y_position)
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