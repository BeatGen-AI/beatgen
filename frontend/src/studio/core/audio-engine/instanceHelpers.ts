import { TrackInstance } from '../../../platform/types/dto/project_track';
import { CombinedTrack } from '../../../types/combinedTrack';

/**
 * Helper functions for working with track instances in the audio engine
 */

/**
 * Get all instances for audio tracks from the store tracks
 * @param tracks Array of tracks from the store
 * @returns Map of track ID to instances
 */
export function getAudioTrackInstances(
  tracks: CombinedTrack[]
): Map<string, TrackInstance[]> {
  const instanceMap = new Map<string, TrackInstance[]>();
  
  tracks.forEach(track => {
    // Only process audio tracks
    if (track.type === 'audio' && track.instances && track.instances.length > 0) {
      instanceMap.set(track.id, track.instances);
    }
  });
  
  return instanceMap;
}

/**
 * Get all instances for MIDI tracks from the store tracks
 * @param tracks Array of tracks from the store
 * @returns Map of track ID to instances
 */
export function getMidiTrackInstances(
  tracks: CombinedTrack[]
): Map<string, TrackInstance[]> {
  const instanceMap = new Map<string, TrackInstance[]>();
  
  tracks.forEach(track => {
    // Process MIDI and instrument tracks
    if ((track.type === 'midi' || track.type === 'instrument') && 
        track.instances && track.instances.length > 0) {
      instanceMap.set(track.id, track.instances);
    }
  });
  
  return instanceMap;
}

/**
 * Get all instances for sampler tracks from the store tracks
 * @param tracks Array of tracks from the store
 * @returns Map of track ID to instances
 */
export function getSamplerTrackInstances(
  tracks: CombinedTrack[]
): Map<string, TrackInstance[]> {
  const instanceMap = new Map<string, TrackInstance[]>();
  
  tracks.forEach(track => {
    // Process drum tracks (which use samplers)
    if (track.type === 'drum' && track.instances && track.instances.length > 0) {
      instanceMap.set(track.id, track.instances);
    }
  });
  
  return instanceMap;
}

/**
 * Calculate if an instance should be playing at a given transport position
 * @param instance The track instance
 * @param transportPosition Current transport position in seconds
 * @param getTimeOffset Function to convert ticks to seconds
 * @param durationSeconds Duration of the audio in seconds
 * @returns Whether the instance should be playing
 */
export function shouldInstanceBePlaying(
  instance: TrackInstance,
  transportPosition: number,
  getTimeOffset: (ticks: number) => number,
  durationSeconds?: number
): boolean {
  const instanceStart = getTimeOffset(instance.x_position);
  
  // Calculate instance duration
  let instanceDuration: number;
  if (instance.trim_start_ticks !== undefined && instance.trim_end_ticks !== undefined) {
    const durationTicks = instance.trim_end_ticks - instance.trim_start_ticks;
    instanceDuration = getTimeOffset(durationTicks);
  } else if (durationSeconds) {
    instanceDuration = durationSeconds;
  } else {
    // Default to 10 seconds if no duration info
    instanceDuration = 10;
  }
  
  const instanceEnd = instanceStart + instanceDuration;
  
  return transportPosition >= instanceStart && transportPosition < instanceEnd;
}

/**
 * Calculate the playback offset for an instance at a given transport position
 * @param instance The track instance
 * @param transportPosition Current transport position in seconds
 * @param getTimeOffset Function to convert ticks to seconds
 * @returns The offset in seconds to start playback from, or -1 if shouldn't play
 */
export function calculateInstancePlaybackOffset(
  instance: TrackInstance,
  transportPosition: number,
  getTimeOffset: (ticks: number) => number
): number {
  const instanceStart = getTimeOffset(instance.x_position);
  
  if (transportPosition < instanceStart) {
    return -1; // Instance hasn't started yet
  }
  
  const offset = transportPosition - instanceStart;
  
  // If we have trim settings, adjust the offset
  if (instance.trim_start_ticks !== undefined) {
    const trimStartSeconds = getTimeOffset(instance.trim_start_ticks);
    return trimStartSeconds + offset;
  }
  
  return offset;
}

/**
 * Filter instances that are within a time range (for viewport culling)
 * @param instances Array of instances
 * @param startTime Start of the time range in seconds
 * @param endTime End of the time range in seconds
 * @param getTimeOffset Function to convert ticks to seconds
 * @param getDuration Function to get instance duration
 * @returns Filtered instances that overlap with the time range
 */
export function filterInstancesInTimeRange(
  instances: TrackInstance[],
  startTime: number,
  endTime: number,
  getTimeOffset: (ticks: number) => number,
  getDuration: (instance: TrackInstance) => number
): TrackInstance[] {
  return instances.filter(instance => {
    const instanceStart = getTimeOffset(instance.x_position);
    const instanceDuration = getDuration(instance);
    const instanceEnd = instanceStart + instanceDuration;
    
    // Check if instance overlaps with the time range
    return instanceEnd >= startTime && instanceStart <= endTime;
  });
}

/**
 * Sort instances by their start position
 * @param instances Array of instances
 * @returns Sorted array of instances
 */
export function sortInstancesByPosition(instances: TrackInstance[]): TrackInstance[] {
  return [...instances].sort((a, b) => a.x_position - b.x_position);
}

/**
 * Find the next instance that will play after a given time
 * @param instances Array of instances (should be sorted)
 * @param currentTime Current time in seconds
 * @param getTimeOffset Function to convert ticks to seconds
 * @returns The next instance or undefined
 */
export function findNextInstance(
  instances: TrackInstance[],
  currentTime: number,
  getTimeOffset: (ticks: number) => number
): TrackInstance | undefined {
  return instances.find(instance => {
    const instanceStart = getTimeOffset(instance.x_position);
    return instanceStart > currentTime;
  });
}

/**
 * Group instances by track ID for efficient processing
 * @param tracks Array of tracks with instances
 * @returns Map of track ID to sorted instances
 */
export function groupInstancesByTrack(
  tracks: CombinedTrack[]
): Map<string, TrackInstance[]> {
  const grouped = new Map<string, TrackInstance[]>();
  
  tracks.forEach(track => {
    if (track.instances && track.instances.length > 0) {
      // Sort instances by position for efficient processing
      grouped.set(track.id, sortInstancesByPosition(track.instances));
    }
  });
  
  return grouped;
}