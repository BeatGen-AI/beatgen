import { TrackInstance } from '../../../../platform/types/project';
import { 
  UnifiedTrackPlayer, 
  TrackPlayerConfig, 
  InstancePlaybackState 
} from '../unified/UnifiedTrackPlayer';
import { SamplerInstancePlayer } from './SamplerInstancePlayer';
import { DrumTrackRead, SamplerTrackRead } from '../../../../platform/types/project';

/**
 * Drum track coordinator that manages multiple sampler instances for drum patterns.
 * A drum track is essentially a collection of sampler tracks that play together.
 */
export class DrumTrackCoordinator implements UnifiedTrackPlayer {
  private config: TrackPlayerConfig;
  private samplerPlayers: Map<string, SamplerInstancePlayer> = new Map();
  private instanceStates: Map<string, InstancePlaybackState> = new Map();
  private drumPattern: boolean[][] = []; // Pattern grid: [row][column]
  private samplerTracks: SamplerTrackRead[] = [];
  
  constructor(config: TrackPlayerConfig) {
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    console.log(`[DrumTrackCoordinator] Initializing for drum track ${this.config.trackId}`);
  }
  
  /**
   * Set the drum pattern grid
   * @param pattern 2D array of boolean values [row][column]
   */
  setDrumPattern(pattern: boolean[][]): void {
    this.drumPattern = pattern;
    console.log(`[DrumTrackCoordinator] Set drum pattern for track ${this.config.trackId}`);
  }
  
  /**
   * Set the sampler tracks that make up this drum track
   * @param samplerTracks Array of sampler track data
   */
  setSamplerTracks(samplerTracks: SamplerTrackRead[]): void {
    this.samplerTracks = samplerTracks;
    console.log(`[DrumTrackCoordinator] Set ${samplerTracks.length} sampler tracks for drum track ${this.config.trackId}`);
  }
  
  /**
   * Add a sampler player for a specific drum pad/row
   * @param samplerTrackId The sampler track ID
   * @param player The sampler player instance
   */
  async addSamplerPlayer(samplerTrackId: string, player: SamplerInstancePlayer): Promise<void> {
    this.samplerPlayers.set(samplerTrackId, player);
    await player.initialize();
    console.log(`[DrumTrackCoordinator] Added sampler player for track ${samplerTrackId}`);
  }
  
  /**
   * Create sampler players for all sampler tracks
   */
  private async ensureSamplerPlayers(): Promise<void> {
    for (const samplerTrack of this.samplerTracks) {
      if (!this.samplerPlayers.has(samplerTrack.id)) {
        const samplerConfig: TrackPlayerConfig = {
          trackId: samplerTrack.id,
          trackType: 'SAMPLER',
          volume: this.config.volume,
          pan: this.config.pan,
          muted: this.config.muted
        };
        
        const player = new SamplerInstancePlayer(samplerConfig);
        await player.initialize();
        
        // Load the sampler's audio file if available
        // This would need to be done from the actual file data
        // For now, we'll just initialize the player
        
        this.samplerPlayers.set(samplerTrack.id, player);
      }
    }
  }
  
  async playInstance(
    instance: TrackInstance, 
    startTimeSeconds: number, 
    offsetSeconds: number
  ): Promise<void> {
    console.log(`[DrumTrackCoordinator] Playing drum instance ${instance.id} at offset ${offsetSeconds}s`);
    
    // Ensure all sampler players are created
    await this.ensureSamplerPlayers();
    
    // Create state tracking for this drum instance
    const state: InstancePlaybackState = {
      instanceId: instance.id,
      isPlaying: true,
      isPaused: false,
      currentPosition: offsetSeconds,
      startTime: startTimeSeconds,
      volume: this.config.volume || 100,
      pan: this.config.pan || 0,
      muted: this.config.muted || false
    };
    this.instanceStates.set(instance.id, state);
    
    // Play each sampler track that's part of this drum track
    // Each sampler gets the same instance info but plays its own pattern row
    const playPromises: Promise<void>[] = [];
    
    let rowIndex = 0;
    for (const [samplerTrackId, player] of this.samplerPlayers) {
      // Create a virtual instance for each sampler
      const samplerInstance: TrackInstance = {
        ...instance,
        id: `${instance.id}_sampler_${samplerTrackId}`
      };
      
      // Convert drum pattern to notes for this sampler
      // This assumes the pattern is already set up correctly
      // In practice, this would need to extract the specific row for this sampler
      
      playPromises.push(
        player.playInstance(samplerInstance, startTimeSeconds, offsetSeconds)
      );
      
      rowIndex++;
    }
    
    await Promise.all(playPromises);
    
    console.log(`[DrumTrackCoordinator] Started ${this.samplerPlayers.size} samplers for drum instance ${instance.id}`);
  }
  
  async stopInstance(instanceId: string): Promise<void> {
    // Stop all sampler instances associated with this drum instance
    const stopPromises: Promise<void>[] = [];
    
    for (const [samplerTrackId, player] of this.samplerPlayers) {
      const samplerInstanceId = `${instanceId}_sampler_${samplerTrackId}`;
      stopPromises.push(player.stopInstance(samplerInstanceId));
    }
    
    await Promise.all(stopPromises);
    
    this.instanceStates.delete(instanceId);
    console.log(`[DrumTrackCoordinator] Stopped drum instance ${instanceId}`);
  }
  
  async stopAllInstances(): Promise<void> {
    const stopPromises: Promise<void>[] = [];
    
    for (const player of this.samplerPlayers.values()) {
      stopPromises.push(player.stopAllInstances());
    }
    
    await Promise.all(stopPromises);
    
    this.instanceStates.clear();
    console.log(`[DrumTrackCoordinator] Stopped all drum instances`);
  }
  
  async pauseInstance(instanceId: string): Promise<void> {
    const pausePromises: Promise<void>[] = [];
    
    for (const [samplerTrackId, player] of this.samplerPlayers) {
      const samplerInstanceId = `${instanceId}_sampler_${samplerTrackId}`;
      pausePromises.push(player.pauseInstance(samplerInstanceId));
    }
    
    await Promise.all(pausePromises);
    
    const state = this.instanceStates.get(instanceId);
    if (state) {
      state.isPaused = true;
      state.isPlaying = false;
    }
    
    console.log(`[DrumTrackCoordinator] Paused drum instance ${instanceId}`);
  }
  
  async pauseAllInstances(): Promise<void> {
    const pausePromises: Promise<void>[] = [];
    
    for (const player of this.samplerPlayers.values()) {
      pausePromises.push(player.pauseAllInstances());
    }
    
    await Promise.all(pausePromises);
    
    for (const state of this.instanceStates.values()) {
      state.isPaused = true;
      state.isPlaying = false;
    }
  }
  
  async seekInstance(instanceId: string, positionSeconds: number): Promise<void> {
    const seekPromises: Promise<void>[] = [];
    
    for (const [samplerTrackId, player] of this.samplerPlayers) {
      const samplerInstanceId = `${instanceId}_sampler_${samplerTrackId}`;
      seekPromises.push(player.seekInstance(samplerInstanceId, positionSeconds));
    }
    
    await Promise.all(seekPromises);
    
    const state = this.instanceStates.get(instanceId);
    if (state) {
      state.currentPosition = positionSeconds;
    }
    
    console.log(`[DrumTrackCoordinator] Seeked drum instance ${instanceId} to ${positionSeconds}s`);
  }
  
  async setInstanceVolume(instanceId: string, volume: number): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [samplerTrackId, player] of this.samplerPlayers) {
      const samplerInstanceId = `${instanceId}_sampler_${samplerTrackId}`;
      promises.push(player.setInstanceVolume(samplerInstanceId, volume));
    }
    
    await Promise.all(promises);
    
    const state = this.instanceStates.get(instanceId);
    if (state) {
      state.volume = volume;
    }
  }
  
  async setInstancePan(instanceId: string, pan: number): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [samplerTrackId, player] of this.samplerPlayers) {
      const samplerInstanceId = `${instanceId}_sampler_${samplerTrackId}`;
      promises.push(player.setInstancePan(samplerInstanceId, pan));
    }
    
    await Promise.all(promises);
    
    const state = this.instanceStates.get(instanceId);
    if (state) {
      state.pan = pan;
    }
  }
  
  async setInstanceMute(instanceId: string, muted: boolean): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [samplerTrackId, player] of this.samplerPlayers) {
      const samplerInstanceId = `${instanceId}_sampler_${samplerTrackId}`;
      promises.push(player.setInstanceMute(samplerInstanceId, muted));
    }
    
    await Promise.all(promises);
    
    const state = this.instanceStates.get(instanceId);
    if (state) {
      state.muted = muted;
    }
  }
  
  getActiveInstanceIds(): string[] {
    return Array.from(this.instanceStates.keys());
  }
  
  isInstancePlaying(instanceId: string): boolean {
    const state = this.instanceStates.get(instanceId);
    return state?.isPlaying || false;
  }
  
  async disposeInstance(instanceId: string): Promise<void> {
    await this.stopInstance(instanceId);
  }
  
  async dispose(): Promise<void> {
    await this.stopAllInstances();
    
    // Dispose all sampler players
    const disposePromises: Promise<void>[] = [];
    for (const player of this.samplerPlayers.values()) {
      disposePromises.push(player.dispose());
    }
    
    await Promise.all(disposePromises);
    
    this.samplerPlayers.clear();
    this.instanceStates.clear();
    
    console.log(`[DrumTrackCoordinator] Disposed drum track ${this.config.trackId}`);
  }
}