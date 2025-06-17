import { CombinedTrack, TrackInstance } from 'src/platform/types/project';

/**
 * Get the next available instance ID for a track
 */
export const getNextInstanceId = (track: CombinedTrack): number => {
  const instances = track.instance_metadata?.instances;
  if (!instances || instances.length === 0) return 1;
  
  // Find max ID and increment
  const maxId = Math.max(...instances.map(i => i.id));
  return maxId + 1;
};

/**
 * Calculate the visible width of an instance based on track duration and trims
 */
export const getInstanceWidth = (track: CombinedTrack, instance: TrackInstance): number => {
  const duration = track.duration_ticks || 0;
  const trimStart = instance.trim_start_ticks || 0;
  const trimEnd = instance.trim_end_ticks || 0;
  
  const width = duration - trimStart - trimEnd;
  
  // Ensure we return a valid positive number
  if (isNaN(width) || width <= 0) {
    console.warn('[getInstanceWidth] Invalid width calculated:', {
      trackId: track.id,
      duration,
      trimStart,
      trimEnd,
      calculatedWidth: width
    });
    return 100; // Default minimum width in ticks
  }
  
  return width;
};

/**
 * Create a new instance on a track
 */
export const createInstance = (
  track: CombinedTrack,
  x: number,
  y: number,
  trim_start_ticks = 0,
  trim_end_ticks = 0
): CombinedTrack => {
  const instances = track.instance_metadata?.instances || [];
  const newId = getNextInstanceId(track);
  
  const newInstance: TrackInstance = {
    id: newId,
    x,
    y,
    trim_start_ticks,
    trim_end_ticks
  };
  
  return {
    ...track,
    instance_metadata: {
      instances: [...instances, newInstance]
    },
    dirty: true
  };
};

/**
 * Update an existing instance
 */
export const updateInstance = (
  track: CombinedTrack,
  instanceId: number,
  updates: Partial<Omit<TrackInstance, 'id'>>
): CombinedTrack => {
  const instances = track.instance_metadata?.instances || [];
  
  return {
    ...track,
    instance_metadata: {
      instances: instances.map(inst =>
        inst.id === instanceId ? { ...inst, ...updates } : inst
      )
    },
    dirty: true
  };
};

/**
 * Delete an instance from a track
 */
export const deleteInstance = (
  track: CombinedTrack,
  instanceId: number
): CombinedTrack => {
  const instances = track.instance_metadata?.instances || [];
  
  return {
    ...track,
    instance_metadata: {
      instances: instances.filter(inst => inst.id !== instanceId)
    },
    dirty: true
  };
};

/**
 * Update multiple instances at once (for group operations)
 */
export const updateMultipleInstances = (
  track: CombinedTrack,
  updates: Array<{ id: number; changes: Partial<Omit<TrackInstance, 'id'>> }>
): CombinedTrack => {
  const instances = track.instance_metadata?.instances || [];
  const updateMap = new Map(updates.map(u => [u.id, u.changes]));
  
  return {
    ...track,
    instance_metadata: {
      instances: instances.map(inst => {
        const changes = updateMap.get(inst.id);
        return changes ? { ...inst, ...changes } : inst;
      })
    },
    dirty: true
  };
};

/**
 * Split an instance at a given position
 */
export const splitInstance = (
  track: CombinedTrack,
  instanceId: number,
  splitPosition: number // in ticks
): CombinedTrack => {
  const instances = track.instance_metadata?.instances || [];
  const instance = instances.find(i => i.id === instanceId);
  
  if (!instance) return track;
  
  const instanceWidth = getInstanceWidth(track, instance);
  const instanceEnd = instance.x + instanceWidth;
  
  if (splitPosition <= instance.x || splitPosition >= instanceEnd) {
    return track; // Invalid split position
  }
  
  const newId = getNextInstanceId(track);
  
  // Calculate how many ticks into the playing region the split occurs
  const ticksIntoPlayback = splitPosition - instance.x;
  
  // Left part: ends at split position
  const leftEndTrim = instance.trim_end_ticks + (instanceWidth - ticksIntoPlayback);
  
  // Right part: starts at split position
  const rightStartTrim = instance.trim_start_ticks + ticksIntoPlayback;
  
  const updatedInstances = instances.map(inst => {
    if (inst.id === instanceId) {
      // Update original instance to be the left part
      return { ...inst, trim_end_ticks: leftEndTrim };
    }
    return inst;
  });
  
  // Add new instance for the right part
  const rightInstance: TrackInstance = {
    id: newId,
    x: splitPosition,
    y: instance.y,
    trim_start_ticks: rightStartTrim,
    trim_end_ticks: instance.trim_end_ticks
  };
  
  return {
    ...track,
    instance_metadata: {
      instances: [...updatedInstances, rightInstance]
    },
    dirty: true
  };
};

/**
 * Get default instance for backward compatibility
 */
export const getDefaultInstance = (track: CombinedTrack): TrackInstance => {
  return {
    id: 1,
    x: track.x_position || 0,
    y: track.y_position || 0,
    trim_start_ticks: 0,
    trim_end_ticks: 0  // Full track plays
  };
};