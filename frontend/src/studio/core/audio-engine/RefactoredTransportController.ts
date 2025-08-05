import * as Tone from 'tone';
import { CombinedTrack } from '../../../platform/types/project';
import { InstancePlaybackManager } from './InstancePlaybackManager';
import { audioContextManager } from '../audio/audioContextManager';

/**
 * Refactored Transport Controller that uses the new unified playback system.
 * This is a much simpler implementation that delegates instance management
 * to the InstancePlaybackManager.
 */
export class RefactoredTransportController {
  private instanceManager: InstancePlaybackManager;
  private isStarting: boolean = false;
  private currentBpm: number = 120;
  
  constructor(initialBpm: number = 120) {
    this.currentBpm = initialBpm;
    Tone.getTransport().bpm.value = initialBpm;
    this.instanceManager = new InstancePlaybackManager(initialBpm);
  }
  
  /**
   * Get the instance manager for registering track players
   */
  getInstanceManager(): InstancePlaybackManager {
    return this.instanceManager;
  }
  
  /**
   * Get current transport position in seconds
   */
  get position(): number {
    return Tone.getTransport().seconds;
  }
  
  /**
   * Check if transport is playing
   */
  get isPlaying(): boolean {
    return Tone.getTransport().state === 'started';
  }
  
  /**
   * Get current tempo
   */
  get tempo(): number {
    return Tone.getTransport().bpm.value;
  }
  
  /**
   * Start playback
   * @param tracks Array of tracks with their instances
   */
  async play(tracks: CombinedTrack[]): Promise<void> {
    if (this.isStarting) return;
    this.isStarting = true;
    
    console.log(`[RefactoredTransport] Starting playback at position ${this.position}s`);
    
    try {
      // Ensure audio contexts are ready
      await audioContextManager.ensureContextsResumed();
      
      if (!audioContextManager.areContextsRunning()) {
        throw new Error('Audio contexts not running');
      }
      
      // Get current transport position
      const transportPosition = this.position;
      
      // Start all instances through the manager
      try {
        await this.instanceManager.playAllInstances(tracks, transportPosition);
      } catch (instanceError) {
        console.error('[RefactoredTransport] Error playing instances:', instanceError);
        // Continue with transport start even if some instances fail
      }
      
      // Start the transport
      if (Tone.getTransport().state !== 'started') {
        Tone.getTransport().start(undefined, transportPosition);
      }
      
      console.log(`[RefactoredTransport] Playback started successfully`);
    } catch (error) {
      console.error('[RefactoredTransport] Error starting playback:', error);
      await this.stop();
      throw error;
    } finally {
      this.isStarting = false;
    }
  }
  
  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    console.log(`[RefactoredTransport] Pausing at position ${this.position}s`);
    
    // Pause all instances
    await this.instanceManager.pauseAllInstances();
    
    // Pause the transport
    Tone.getTransport().pause();
  }
  
  /**
   * Stop playback and reset to beginning
   */
  async stop(): Promise<void> {
    console.log('[RefactoredTransport] Stopping and resetting to position 0');
    this.isStarting = false;
    
    // Stop all instances
    await this.instanceManager.stopAllInstances();
    
    // Stop and reset transport
    Tone.getTransport().stop();
    Tone.getTransport().seconds = 0;
  }
  
  /**
   * Seek to a specific position
   * @param position Position in seconds
   * @param tracks Current tracks for restarting if playing (optional for compatibility)
   */
  async seek(position: number, tracks?: CombinedTrack[]): Promise<void> {
    const wasPlaying = this.isPlaying;
    
    console.log(`[RefactoredTransport] Seeking to ${position}s`);
    
    // Stop transport
    Tone.getTransport().stop();
    
    // Seek all instances if tracks provided
    if (tracks) {
      await this.instanceManager.seekAllInstances(tracks, position);
    }
    
    // Set transport position
    Tone.getTransport().seconds = position;
    
    // Restart if was playing and tracks provided
    if (wasPlaying && tracks) {
      // Small delay to ensure clean restart
      setTimeout(() => {
        this.play(tracks);
      }, 30);
    }
  }
  
  /**
   * Set tempo/BPM
   * @param bpm Beats per minute
   */
  async setTempo(bpm: number): Promise<void> {
    const validBpm = Math.max(1, Math.min(bpm, 999));
    this.currentBpm = validBpm;
    
    // Update Tone transport
    Tone.getTransport().bpm.value = validBpm;
    
    // Update instance manager
    this.instanceManager.setBpm(validBpm);
    
    console.log(`[RefactoredTransport] Tempo set to ${validBpm} BPM`);
  }
  
  /**
   * Set volume for a specific track
   * @param trackId Track ID
   * @param volume Volume (0-100)
   */
  async setTrackVolume(trackId: string, volume: number): Promise<void> {
    await this.instanceManager.setTrackVolume(trackId, volume);
  }
  
  /**
   * Set mute state for a specific track
   * @param trackId Track ID
   * @param muted Mute state
   */
  async setTrackMute(trackId: string, muted: boolean): Promise<void> {
    await this.instanceManager.setTrackMute(trackId, muted);
  }
  
  /**
   * Handle track position change during playback
   * @param trackId Track that changed
   * @param tracks All tracks
   */
  async handleTrackPositionChange(trackId: string, tracks: CombinedTrack[]): Promise<void> {
    if (!this.isPlaying) return;
    
    const currentPosition = this.position;
    await this.instanceManager.handleTrackInstancesChanged(trackId, tracks, currentPosition);
  }
  
  /**
   * Set position (compatibility method for timeline interaction)
   * @param positionSeconds Position in seconds
   */
  setPosition(positionSeconds: number): void {
    console.log(`[RefactoredTransport] Setting position to ${positionSeconds}s`);
    // Cannot set this.position directly as it's a getter only
    Tone.getTransport().seconds = positionSeconds;
  }
  
  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    await this.stop();
    await this.instanceManager.dispose();
    Tone.getTransport().dispose();
    
    console.log('[RefactoredTransport] Disposed');
  }
}