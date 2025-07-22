import { CombinedTrack, TrackInstance } from '../../platform/types/project';
import { getAudioDuration, calculateAudioDurationTicks } from './audioAnalysis';
import { GRID_CONSTANTS } from '../constants/gridConstants';

export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  start: number;
  end: number;
  width: number;
}

/**
 * Calculate the effective duration_ticks for a track based on its type and content
 * For audio tracks, calculates based on audio duration and BPM
 * For other tracks, uses existing duration_ticks
 */
export function getEffectiveDurationTicks(track: CombinedTrack, bpm: number = 120): number {
  // For audio tracks, calculate duration_ticks from audio duration
  if (track.track_type === 'AUDIO') {
    const audioDuration = getAudioDuration(track);
    if (audioDuration > 0) {
      return calculateAudioDurationTicks(audioDuration, bpm);
    }
  }
  
  // For other tracks or when audio duration is not available, use existing duration_ticks
  return track.duration_ticks ?? 0;
}

/**
 * Get a specific instance by ID from a track
 */
export function getInstanceById(track: CombinedTrack, instanceId: string): TrackInstance | undefined {
  return track.instances?.find(inst => inst.id === instanceId);
}

/**
 * Get the position of a specific instance
 */
export function getInstancePosition(track: CombinedTrack, instanceId: string): Position {
  const instance = getInstanceById(track, instanceId);
  return {
    x: instance?.x_position ?? 0,
    y: instance?.y_position ?? 0
  };
}

/**
 * Get the dimensions of a specific instance
 */
export function getInstanceDimensions(track: CombinedTrack, instanceId: string): Dimensions {
  const instance = getInstanceById(track, instanceId);
  return {
    start: instance?.trim_start_ticks ?? 0,
    end: instance?.trim_end_ticks ?? track.duration_ticks ?? 0,
    width: (instance?.trim_end_ticks ?? track.duration_ticks ?? 0) - 
           (instance?.trim_start_ticks ?? 0)
  };
}

/**
 * Update a specific instance in a track's instances array
 */
export function updateInstance(
  track: CombinedTrack, 
  instanceId: string, 
  updates: Partial<TrackInstance>
): TrackInstance[] {
  return (track.instances || []).map(instance =>
    instance.id === instanceId
      ? { ...instance, ...updates }
      : instance
  );
}

/**
 * Add a new instance to a track
 */
export function addInstance(
  track: CombinedTrack,
  position?: Position,
  sourceInstance?: Partial<TrackInstance>
): TrackInstance {
  const instances = track.instances || [];
  const nextNumber = instances.length + 1;
  
  const newInstance: TrackInstance = {
    id: `${track.id}_instance_${nextNumber}`,
    x_position: position?.x ?? sourceInstance?.x_position ?? 0,
    y_position: position?.y ?? sourceInstance?.y_position ?? 0,
    trim_start_ticks: sourceInstance?.trim_start_ticks ?? 0,
    trim_end_ticks: sourceInstance?.trim_end_ticks ?? track.duration_ticks ?? 0,
    ...sourceInstance
  };
  
  return newInstance;
}

/**
 * Remove an instance from a track
 */
export function removeInstance(
  track: CombinedTrack,
  instanceId: string
): TrackInstance[] {
  return (track.instances || []).filter(instance => instance.id !== instanceId);
}

/**
 * Get all instances for a track
 */
export function getTrackInstances(track: CombinedTrack): TrackInstance[] {
  return track.instances || [];
}

/**
 * Check if a track has any instances
 */
export function hasInstances(track: CombinedTrack): boolean {
  return (track.instances?.length ?? 0) > 0;
}

/**
 * Get the first instance of a track (for compatibility)
 */
export function getFirstInstance(track: CombinedTrack): TrackInstance | undefined {
  return track.instances?.[0];
}

/**
 * Find the next available y-position for new tracks by finding the maximum
 * y-position from all existing track instances and adding one track height
 */
export function getNextAvailableYPosition(tracks: CombinedTrack[]): number {
  if (tracks.length === 0) return 0;
  
  // Find all y-positions from all track instances
  const yPositions = tracks.flatMap(track => 
    track.instances?.map(inst => inst.y_position) || [0]
  );
  
  // Return the maximum y-position plus one track height
  return Math.max(...yPositions, 0) + GRID_CONSTANTS.trackHeight;
}

/**
 * Create a default instance for a track
 */
export function createDefaultInstance(
  trackId: string,
  position?: Position,
  duration?: number
): TrackInstance {
  const defaultDuration = 1920; // Default to 1 bar at 480 ticks per beat
  return {
    id: `${trackId}_instance_1`,
    x_position: position?.x ?? 0,
    y_position: position?.y ?? 0,
    trim_start_ticks: 0,
    trim_end_ticks: duration ?? defaultDuration
  };
}