import * as Tone from 'tone';
import { TrackInstance } from '../../../../platform/types/project';
import { 
  UnifiedTrackPlayer, 
  TrackPlayerConfig, 
  InstancePlaybackState 
} from '../unified/UnifiedTrackPlayer';
import { convertVolumeToDecibels } from '../../../utils/audioProcessing';

/**
 * Audio track player that manages multiple Tone.Player instances.
 * Each track instance gets its own Tone.Player for independent playback.
 */
export class AudioInstancePlayer implements UnifiedTrackPlayer {
  private config: TrackPlayerConfig;
  private audioBuffer: Tone.ToneAudioBuffer | null = null;
  private instancePlayers: Map<string, Tone.Player> = new Map();
  private instanceStates: Map<string, InstancePlaybackState> = new Map();
  private outputChannel: Tone.Channel;
  
  constructor(config: TrackPlayerConfig) {
    this.config = config;
    this.outputChannel = new Tone.Channel().toDestination();
    
    // Set initial volume and pan
    if (config.volume !== undefined) {
      this.outputChannel.volume.value = convertVolumeToDecibels(config.volume, config.muted || false);
    }
    if (config.pan !== undefined) {
      this.outputChannel.pan.value = config.pan / 100; // Convert -100..100 to -1..1
    }
  }
  
  async initialize(): Promise<void> {
    console.log(`[AudioInstancePlayer] Initializing for track ${this.config.trackId}`);
  }
  
  /**
   * Load audio from a file
   * @param file The audio file to load
   */
  async loadAudioFile(file: File): Promise<void> {
    console.log(`[AudioInstancePlayer] Loading audio file for track ${this.config.trackId}`);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      const url = URL.createObjectURL(blob);
      
      // Load the audio buffer
      this.audioBuffer = new Tone.ToneAudioBuffer(url);
      await Tone.loaded();
      
      URL.revokeObjectURL(url);
      console.log(`[AudioInstancePlayer] Audio loaded successfully for track ${this.config.trackId}`);
    } catch (error) {
      console.error(`[AudioInstancePlayer] Failed to load audio for track ${this.config.trackId}:`, error);
      throw error;
    }
  }
  
  /**
   * Load audio from a URL
   * @param url The audio URL
   */
  async loadAudioFromUrl(url: string): Promise<void> {
    console.log(`[AudioInstancePlayer] Loading audio from URL for track ${this.config.trackId}`);
    
    try {
      this.audioBuffer = new Tone.ToneAudioBuffer(url);
      await Tone.loaded();
      console.log(`[AudioInstancePlayer] Audio loaded successfully from URL for track ${this.config.trackId}`);
    } catch (error) {
      console.error(`[AudioInstancePlayer] Failed to load audio from URL for track ${this.config.trackId}:`, error);
      throw error;
    }
  }
  
  async playInstance(
    instance: TrackInstance, 
    startTimeSeconds: number, 
    offsetSeconds: number
  ): Promise<void> {
    if (!this.audioBuffer) {
      console.warn(`[AudioInstancePlayer] No audio loaded for track ${this.config.trackId}`);
      return;
    }
    
    // Stop any existing player for this instance
    await this.stopInstance(instance.id);
    
    // Create a new player for this instance
    const player = new Tone.Player({
      url: this.audioBuffer,
      loop: false,
      autostart: false
    }).connect(this.outputChannel);
    
    // Store the player
    this.instancePlayers.set(instance.id, player);
    
    // Create state tracking
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
    
    // Wait for the player to be ready
    await Tone.loaded();
    
    // Start playback at the correct offset
    // offsetSeconds already accounts for trim_start from TimingCalculator
    player.start(undefined, offsetSeconds);
    
    // Sync with transport for consistent timing
    player.sync();
    
    console.log(`[AudioInstancePlayer] Started instance ${instance.id} at offset ${offsetSeconds}s`);
    
    // Schedule automatic cleanup when playback ends
    const duration = this.audioBuffer.duration - offsetSeconds;
    if (duration > 0) {
      setTimeout(() => {
        this.cleanupInstance(instance.id);
      }, duration * 1000);
    }
  }
  
  async stopInstance(instanceId: string): Promise<void> {
    const player = this.instancePlayers.get(instanceId);
    if (player) {
      player.stop();
      player.unsync();
      player.dispose();
      this.instancePlayers.delete(instanceId);
      this.instanceStates.delete(instanceId);
      console.log(`[AudioInstancePlayer] Stopped instance ${instanceId}`);
    }
  }
  
  async stopAllInstances(): Promise<void> {
    const instanceIds = Array.from(this.instancePlayers.keys());
    for (const instanceId of instanceIds) {
      await this.stopInstance(instanceId);
    }
  }
  
  async pauseInstance(instanceId: string): Promise<void> {
    const player = this.instancePlayers.get(instanceId);
    const state = this.instanceStates.get(instanceId);
    
    if (player && state) {
      // Tone.Player doesn't have a pause method, so we stop and track position
      player.stop();
      player.unsync();
      state.isPaused = true;
      state.isPlaying = false;
      // TODO: Track current position for resume
      console.log(`[AudioInstancePlayer] Paused instance ${instanceId}`);
    }
  }
  
  async pauseAllInstances(): Promise<void> {
    const instanceIds = Array.from(this.instancePlayers.keys());
    for (const instanceId of instanceIds) {
      await this.pauseInstance(instanceId);
    }
  }
  
  async seekInstance(instanceId: string, positionSeconds: number): Promise<void> {
    const player = this.instancePlayers.get(instanceId);
    const state = this.instanceStates.get(instanceId);
    
    if (player && state) {
      // Stop current playback
      player.stop();
      player.unsync();
      
      // Restart at new position
      player.start(undefined, positionSeconds);
      player.sync();
      
      state.currentPosition = positionSeconds;
      console.log(`[AudioInstancePlayer] Seeked instance ${instanceId} to ${positionSeconds}s`);
    }
  }
  
  async setInstanceVolume(instanceId: string, volume: number): Promise<void> {
    const player = this.instancePlayers.get(instanceId);
    const state = this.instanceStates.get(instanceId);
    
    if (player && state) {
      const volumeDb = convertVolumeToDecibels(volume, state.muted);
      player.volume.value = volumeDb;
      state.volume = volume;
      console.log(`[AudioInstancePlayer] Set instance ${instanceId} volume to ${volume}`);
    }
  }
  
  async setInstancePan(instanceId: string, pan: number): Promise<void> {
    // Individual instance panning would require per-instance channels
    // For now, this affects the track's output channel
    this.outputChannel.pan.value = pan / 100;
    
    const state = this.instanceStates.get(instanceId);
    if (state) {
      state.pan = pan;
    }
    console.log(`[AudioInstancePlayer] Set instance ${instanceId} pan to ${pan}`);
  }
  
  async setInstanceMute(instanceId: string, muted: boolean): Promise<void> {
    const player = this.instancePlayers.get(instanceId);
    const state = this.instanceStates.get(instanceId);
    
    if (player && state) {
      const volumeDb = convertVolumeToDecibels(state.volume, muted);
      player.volume.value = volumeDb;
      state.muted = muted;
      console.log(`[AudioInstancePlayer] Set instance ${instanceId} mute to ${muted}`);
    }
  }
  
  getActiveInstanceIds(): string[] {
    return Array.from(this.instancePlayers.keys());
  }
  
  isInstancePlaying(instanceId: string): boolean {
    const state = this.instanceStates.get(instanceId);
    return state?.isPlaying || false;
  }
  
  async disposeInstance(instanceId: string): Promise<void> {
    await this.stopInstance(instanceId);
  }
  
  private cleanupInstance(instanceId: string): void {
    const player = this.instancePlayers.get(instanceId);
    if (player) {
      player.unsync();
      player.dispose();
      this.instancePlayers.delete(instanceId);
      this.instanceStates.delete(instanceId);
      console.log(`[AudioInstancePlayer] Cleaned up instance ${instanceId} after playback ended`);
    }
  }
  
  async dispose(): Promise<void> {
    await this.stopAllInstances();
    
    if (this.audioBuffer) {
      this.audioBuffer.dispose();
      this.audioBuffer = null;
    }
    
    this.outputChannel.dispose();
    
    console.log(`[AudioInstancePlayer] Disposed track ${this.config.trackId}`);
  }
}