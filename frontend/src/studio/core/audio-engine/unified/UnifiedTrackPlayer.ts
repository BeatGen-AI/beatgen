import { TrackInstance } from '../../../../platform/types/project';

/**
 * Unified interface for all track players.
 * Each track type (AUDIO, MIDI, SAMPLER, DRUM) must implement this interface.
 * This provides a consistent API for managing playback of track instances.
 */
export interface UnifiedTrackPlayer {
  /**
   * Initialize the player with necessary resources
   */
  initialize(): Promise<void>;
  
  /**
   * Play a specific instance of the track
   * @param instance The instance to play
   * @param startTimeSeconds Global transport time in seconds
   * @param offsetSeconds How far into the instance to start playing
   */
  playInstance(
    instance: TrackInstance,
    startTimeSeconds: number,
    offsetSeconds: number
  ): Promise<void>;
  
  /**
   * Stop a specific instance
   * @param instanceId The instance to stop
   */
  stopInstance(instanceId: string): Promise<void>;
  
  /**
   * Stop all instances of this track
   */
  stopAllInstances(): Promise<void>;
  
  /**
   * Pause a specific instance
   * @param instanceId The instance to pause
   */
  pauseInstance(instanceId: string): Promise<void>;
  
  /**
   * Pause all instances
   */
  pauseAllInstances(): Promise<void>;
  
  /**
   * Seek a specific instance to a position
   * @param instanceId The instance to seek
   * @param positionSeconds Position in seconds relative to the instance start
   */
  seekInstance(instanceId: string, positionSeconds: number): Promise<void>;
  
  /**
   * Set volume for a specific instance
   * @param instanceId The instance ID
   * @param volume Volume level (0-100)
   */
  setInstanceVolume(instanceId: string, volume: number): Promise<void>;
  
  /**
   * Set pan for a specific instance
   * @param instanceId The instance ID
   * @param pan Pan value (-100 to 100, -100 = full left, 100 = full right)
   */
  setInstancePan(instanceId: string, pan: number): Promise<void>;
  
  /**
   * Set mute state for a specific instance
   * @param instanceId The instance ID
   * @param muted Whether the instance should be muted
   */
  setInstanceMute(instanceId: string, muted: boolean): Promise<void>;
  
  /**
   * Get all active instance IDs
   */
  getActiveInstanceIds(): string[];
  
  /**
   * Check if an instance is currently playing
   * @param instanceId The instance to check
   */
  isInstancePlaying(instanceId: string): boolean;
  
  /**
   * Clean up resources for a specific instance
   * @param instanceId The instance to clean up
   */
  disposeInstance(instanceId: string): Promise<void>;
  
  /**
   * Clean up all resources
   */
  dispose(): Promise<void>;
}

/**
 * Base configuration for track players
 */
export interface TrackPlayerConfig {
  trackId: string;
  trackType: 'AUDIO' | 'MIDI' | 'SAMPLER' | 'DRUM';
  volume?: number;
  pan?: number;
  muted?: boolean;
}

/**
 * Instance playback state
 */
export interface InstancePlaybackState {
  instanceId: string;
  isPlaying: boolean;
  isPaused: boolean;
  currentPosition: number; // in seconds
  startTime: number; // when playback started
  volume: number;
  pan: number;
  muted: boolean;
}