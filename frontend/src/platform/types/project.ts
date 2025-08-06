/**
 * Re-export project types from their appropriate sources
 * - DTOs come from the auto-generated dto folder
 * - Extended entities come from the entities folder
 */

// Re-export all DTOs
export * from './dto/project';

// Re-export extended entities
export type { 
  CombinedTrackEntity,
  ProjectWithTracksEntity,
} from './entities/project';

// Re-export DTOs that don't need extension
export type {
  TrackPreview,
  ProjectWithTrackPreviews
} from './dto/project';

// For backward compatibility, alias CombinedTrackEntity as CombinedTrack
export type { CombinedTrackEntity as CombinedTrack } from './entities/project';