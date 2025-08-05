import * as Tone from 'tone';
import { CombinedTrack, TrackInstance } from '../../../platform/types/project';
import { UnifiedTrackPlayer } from './unified/UnifiedTrackPlayer';
import { TimingCalculator } from './timing/TimingCalculator';

/**
 * Central manager for all track instance playback.
 * Coordinates between transport, track players, and instances.
 */
export class InstancePlaybackManager {
  private trackPlayers: Map<string, UnifiedTrackPlayer> = new Map();
  private activeInstances: Map<string, Set<string>> = new Map(); // trackId -> Set<instanceId>
  private currentBpm: number = 120;
  private isPlaying: boolean = false;
  
  constructor(initialBpm: number = 120) {
    this.currentBpm = initialBpm;
  }
  
  /**
   * Register a track player
   * @param trackId The track ID
   * @param player The unified track player implementation
   */
  registerTrackPlayer(trackId: string, player: UnifiedTrackPlayer): void {
    this.trackPlayers.set(trackId, player);
    this.activeInstances.set(trackId, new Set());
    console.log(`[InstancePlaybackManager] Registered player for track ${trackId}`);
  }
  
  /**
   * Unregister a track player
   * @param trackId The track ID
   */
  async unregisterTrackPlayer(trackId: string): Promise<void> {
    const player = this.trackPlayers.get(trackId);
    if (player) {
      await player.dispose();
      this.trackPlayers.delete(trackId);
      this.activeInstances.delete(trackId);
      console.log(`[InstancePlaybackManager] Unregistered player for track ${trackId}`);
    }
  }
  
  /**
   * Get a track player
   * @param trackId The track ID
   */
  getTrackPlayer(trackId: string): UnifiedTrackPlayer | undefined {
    return this.trackPlayers.get(trackId);
  }
  
  /**
   * Play all instances that should be active at the current transport position
   * @param tracks Array of tracks with their instances
   * @param transportSeconds Current transport position in seconds
   */
  async playAllInstances(tracks: CombinedTrack[], transportSeconds: number): Promise<void> {
    console.log(`[InstancePlaybackManager] Playing all instances at transport position ${transportSeconds}s`);
    this.isPlaying = true;
    
    // Process each track
    for (const track of tracks) {
      const player = this.trackPlayers.get(track.id);
      if (!player) {
        console.warn(`[InstancePlaybackManager] No player registered for track ${track.id}`);
        continue;
      }
      
      // Process each instance of the track
      if (track.instances && track.instances.length > 0) {
        for (const instance of track.instances) {
          await this.playInstance(track.id, instance, transportSeconds);
        }
      }
    }
  }
  
  /**
   * Play a specific instance
   * @param trackId The track ID
   * @param instance The instance to play
   * @param transportSeconds Current transport position
   */
  private async playInstance(
    trackId: string, 
    instance: TrackInstance, 
    transportSeconds: number
  ): Promise<void> {
    const player = this.trackPlayers.get(trackId);
    if (!player) return;
    
    // Calculate if and when this instance should play
    const playbackOffset = TimingCalculator.getInstancePlaybackOffset(
      instance, 
      transportSeconds, 
      this.currentBpm
    );
    
    if (playbackOffset === -1) {
      // Instance hasn't started yet - schedule it for later
      const delay = TimingCalculator.getInstanceScheduleDelay(
        instance, 
        transportSeconds, 
        this.currentBpm
      );
      
      if (delay > 0) {
        console.log(`[InstancePlaybackManager] Scheduling instance ${instance.id} to start in ${delay}s`);
        
        // Use Tone.js scheduling for precise timing
        Tone.getTransport().scheduleOnce(async () => {
          if (this.isPlaying) {
            await player.playInstance(instance, transportSeconds + delay, 0);
            this.markInstanceActive(trackId, instance.id);
          }
        }, `+${delay}`);
      }
    } else if (playbackOffset === -2) {
      // Instance has already finished
      console.log(`[InstancePlaybackManager] Instance ${instance.id} has already finished`);
    } else {
      // Instance should be playing now
      console.log(`[InstancePlaybackManager] Starting instance ${instance.id} at offset ${playbackOffset}s`);
      await player.playInstance(instance, transportSeconds, playbackOffset);
      this.markInstanceActive(trackId, instance.id);
    }
  }
  
  /**
   * Pause all active instances
   */
  async pauseAllInstances(): Promise<void> {
    console.log(`[InstancePlaybackManager] Pausing all instances`);
    this.isPlaying = false;
    
    for (const [trackId, player] of this.trackPlayers) {
      await player.pauseAllInstances();
    }
  }
  
  /**
   * Stop all active instances
   */
  async stopAllInstances(): Promise<void> {
    console.log(`[InstancePlaybackManager] Stopping all instances`);
    this.isPlaying = false;
    
    // Clear all scheduled events
    Tone.getTransport().cancel();
    
    for (const [trackId, player] of this.trackPlayers) {
      await player.stopAllInstances();
      // Clear active instances tracking
      this.activeInstances.get(trackId)?.clear();
    }
  }
  
  /**
   * Seek all tracks to a new position
   * @param tracks Array of tracks with their instances
   * @param positionSeconds New position in seconds
   */
  async seekAllInstances(tracks: CombinedTrack[], positionSeconds: number): Promise<void> {
    console.log(`[InstancePlaybackManager] Seeking to ${positionSeconds}s`);
    
    // Stop everything first
    await this.stopAllInstances();
    
    // If we were playing, restart from new position
    if (this.isPlaying) {
      await this.playAllInstances(tracks, positionSeconds);
    }
  }
  
  /**
   * Update BPM for timing calculations
   * @param bpm New BPM value
   */
  setBpm(bpm: number): void {
    this.currentBpm = bpm;
    console.log(`[InstancePlaybackManager] BPM updated to ${bpm}`);
  }
  
  /**
   * Set volume for a specific track (affects all instances)
   * @param trackId The track ID
   * @param volume Volume level (0-100)
   */
  async setTrackVolume(trackId: string, volume: number): Promise<void> {
    const player = this.trackPlayers.get(trackId);
    if (!player) return;
    
    // Apply to all active instances of this track
    const activeInstanceIds = this.activeInstances.get(trackId);
    if (activeInstanceIds) {
      for (const instanceId of activeInstanceIds) {
        await player.setInstanceVolume(instanceId, volume);
      }
    }
  }
  
  /**
   * Set mute state for a specific track (affects all instances)
   * @param trackId The track ID
   * @param muted Whether to mute
   */
  async setTrackMute(trackId: string, muted: boolean): Promise<void> {
    const player = this.trackPlayers.get(trackId);
    if (!player) return;
    
    // Apply to all active instances of this track
    const activeInstanceIds = this.activeInstances.get(trackId);
    if (activeInstanceIds) {
      for (const instanceId of activeInstanceIds) {
        await player.setInstanceMute(instanceId, muted);
      }
    }
  }
  
  /**
   * Handle when a track's instances change (position, trim, etc.)
   * @param trackId The track that changed
   * @param tracks Current tracks state
   * @param transportSeconds Current transport position
   */
  async handleTrackInstancesChanged(
    trackId: string, 
    tracks: CombinedTrack[], 
    transportSeconds: number
  ): Promise<void> {
    if (!this.isPlaying) return;
    
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const player = this.trackPlayers.get(trackId);
    if (!player) return;
    
    // Stop all instances of this track
    await player.stopAllInstances();
    this.activeInstances.get(trackId)?.clear();
    
    // Restart instances with new positions/trims
    if (track.instances) {
      for (const instance of track.instances) {
        await this.playInstance(trackId, instance, transportSeconds);
      }
    }
  }
  
  /**
   * Mark an instance as active
   */
  private markInstanceActive(trackId: string, instanceId: string): void {
    const instances = this.activeInstances.get(trackId);
    if (instances) {
      instances.add(instanceId);
    }
  }
  
  /**
   * Mark an instance as inactive
   */
  private markInstanceInactive(trackId: string, instanceId: string): void {
    const instances = this.activeInstances.get(trackId);
    if (instances) {
      instances.delete(instanceId);
    }
  }
  
  /**
   * Get all active instance IDs for a track
   */
  getActiveInstances(trackId: string): string[] {
    const instances = this.activeInstances.get(trackId);
    return instances ? Array.from(instances) : [];
  }
  
  /**
   * Check if any instances are currently playing
   */
  hasActiveInstances(): boolean {
    for (const instances of this.activeInstances.values()) {
      if (instances.size > 0) return true;
    }
    return false;
  }
  
  /**
   * Clean up all resources
   */
  async dispose(): Promise<void> {
    await this.stopAllInstances();
    
    for (const [trackId, player] of this.trackPlayers) {
      await player.dispose();
    }
    
    this.trackPlayers.clear();
    this.activeInstances.clear();
    
    console.log(`[InstancePlaybackManager] Disposed`);
  }
}