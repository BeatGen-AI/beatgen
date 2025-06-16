/**
 * Represents an instance (clip) of a track on the timeline
 * Each track can have multiple instances with different positions and trim settings
 */
export interface TrackInstance {
  /** Unique identifier for this instance */
  id: string;
  
  /** Position in ticks from the start of the timeline */
  x_position: number;
  
  /** Vertical position in pixels (track lane) */
  y_position: number;
  
  /** Start trim in ticks (how much to skip from the beginning) */
  trim_start_ticks: number;
  
  /** End trim in ticks (where to stop playing) */
  trim_end_ticks: number;
}

/**
 * Extended CombinedTrack interface that includes instances
 */
export interface CombinedTrackWithInstances {
  /** Array of instances (clips) of this track on the timeline */
  instances: TrackInstance[];
}