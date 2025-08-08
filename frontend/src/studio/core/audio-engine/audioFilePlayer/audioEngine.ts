import * as Tone from 'tone';
import { convertVolumeToDecibels } from '../../../utils/audioProcessing';
import { TrackPlayer } from '../trackPlayer';
import { MUSIC_CONSTANTS } from '../../../constants/musicConstants';

export interface AudioPlayerInstance {
  id: string;              // Instance ID (e.g., "track_123_instance_2")
  trackId: string;         // Parent track ID (e.g., "track_123")
  player: Tone.Player;     // The Tone.js player for this instance
}

class AudioFilePlayer implements TrackPlayer {
  private static instance: AudioFilePlayer;
  private mainOutput: Tone.Channel;
  
  // New storage structure
  private playerInstances: Map<string, AudioPlayerInstance>;  // instanceId -> player
  private trackChannels: Map<string, Tone.Channel>;          // trackId -> channel (shared)
  private audioBuffers: Map<string, AudioBuffer>;            // trackId -> buffer (shared)
  
  // Store reference for accessing track/instance data
  private getStoreState?: () => any;

  private constructor() {
    this.mainOutput = new Tone.Channel().toDestination();
    this.playerInstances = new Map();
    this.trackChannels = new Map();
    this.audioBuffers = new Map();
  }

  public static getInstance(): AudioFilePlayer {
    if (!AudioFilePlayer.instance) {
      AudioFilePlayer.instance = new AudioFilePlayer();
    }
    return AudioFilePlayer.instance;
  }

  /**
   * Set store getter for accessing track/instance data
   */
  public setStoreGetter(getter: () => any): void {
    this.getStoreState = getter;
  }

  /**
   * Get track data from store
   */
  private getTrackFromStore(trackId: string): any {
    if (!this.getStoreState) return null;
    const state = this.getStoreState();
    return state.tracks?.find((t: any) => t.id === trackId);
  }

  /**
   * Get instance data from store
   */
  private getInstanceFromStore(instanceId: string): any {
    if (!this.getStoreState) return null;
    const state = this.getStoreState();
    
    // Extract track ID from instance ID (format: "trackId_instance_N")
    const parts = instanceId.split('_instance_');
    if (parts.length < 2) return null;
    
    const trackId = parts[0];
    const track = this.getTrackFromStore(trackId);
    return track?.instances?.find((i: any) => i.id === instanceId);
  }

  public async initialize(): Promise<void> {
    try {
      console.log('AudioEngine: Initializing');
      // Tone.js initialization is handled elsewhere
      console.log('AudioEngine: Initialized successfully');
    } catch (error) {
      console.error('AudioEngine: Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Load audio buffer for a track (shared by all instances)
   */
  public async loadAudioBuffer(trackId: string, audioFile: File): Promise<AudioBuffer> {
    console.log(`Loading audio buffer for track ${trackId}`);
    
    // Check if buffer already exists
    if (this.audioBuffers.has(trackId)) {
      console.log(`Audio buffer already exists for track ${trackId}`);
      return this.audioBuffers.get(trackId)!;
    }
    
    try {
      const buffer = await audioFile.arrayBuffer();
      const audioBuffer = await Tone.getContext().decodeAudioData(buffer);
      
      this.audioBuffers.set(trackId, audioBuffer);
      console.log(`Audio buffer loaded for track ${trackId}`);
      
      return audioBuffer;
    } catch (error) {
      console.error(`Failed to load audio buffer for track ${trackId}:`, error);
      throw error;
    }
  }

  /**
   * Get audio buffer for a track
   */
  public getAudioBuffer(trackId: string): AudioBuffer | undefined {
    return this.audioBuffers.get(trackId);
  }

  /**
   * Get channel for a track (for export purposes)
   */
  public getTrackChannel(trackId: string): Tone.Channel | undefined {
    return this.trackChannels.get(trackId);
  }

  /**
   * Create or get track channel (shared by all instances)
   */
  public async createTrackChannel(trackId: string, name: string): Promise<Tone.Channel> {
    // Check if channel already exists
    if (this.trackChannels.has(trackId)) {
      return this.trackChannels.get(trackId)!;
    }
    
    const channel = new Tone.Channel().connect(this.mainOutput);
    
    // Set default volume
    const defaultVolume = 80;
    channel.volume.value = convertVolumeToDecibels(defaultVolume, false);
    
    this.trackChannels.set(trackId, channel);
    console.log(`Created channel for track ${trackId} (${name})`);
    
    return channel;
  }

  /**
   * Create a player instance for a specific track instance
   */
  public async createInstance(trackId: string, instanceId: string): Promise<void> {
    console.log(`Creating player instance ${instanceId} for track ${trackId}`);
    
    // Check if instance already exists
    if (this.playerInstances.has(instanceId)) {
      console.log(`Player instance ${instanceId} already exists`);
      return;
    }
    
    // Get or create the shared channel for this track
    let channel = this.trackChannels.get(trackId);
    if (!channel) {
      const track = this.getTrackFromStore(trackId);
      channel = await this.createTrackChannel(trackId, track?.name || 'Audio Track');
    }
    
    // Get the shared buffer for this track
    const buffer = this.audioBuffers.get(trackId);
    if (!buffer) {
      throw new Error(`No audio buffer loaded for track ${trackId}`);
    }
    
    // Create a new player for this instance, connected to the shared channel
    const player = new Tone.Player({
      url: buffer,
      loop: false,
      autostart: false
    }).connect(channel);
    
    await Tone.loaded();
    
    this.playerInstances.set(instanceId, {
      id: instanceId,
      trackId,
      player
    });
    
    console.log(`Created player instance ${instanceId} for track ${trackId}`);
  }

  /**
   * Remove a specific instance
   */
  public removeInstance(instanceId: string): void {
    const instance = this.playerInstances.get(instanceId);
    if (instance) {
      instance.player.stop();
      instance.player.dispose();
      this.playerInstances.delete(instanceId);
      console.log(`Removed player instance ${instanceId}`);
    }
  }

  /**
   * Remove all instances and cleanup track resources
   */
  public removeTrack(trackId: string): void {
    console.log(`Removing track ${trackId} and all its instances`);
    
    // Remove all instances for this track
    const instancesToRemove: string[] = [];
    for (const [instanceId, instance] of this.playerInstances) {
      if (instance.trackId === trackId) {
        instancesToRemove.push(instanceId);
      }
    }
    
    instancesToRemove.forEach(instanceId => this.removeInstance(instanceId));
    
    // Remove track channel
    const channel = this.trackChannels.get(trackId);
    if (channel) {
      channel.dispose();
      this.trackChannels.delete(trackId);
    }
    
    // Remove audio buffer
    this.audioBuffers.delete(trackId);
    
    console.log(`Removed track ${trackId} and ${instancesToRemove.length} instances`);
  }

  /**
   * Get all instances for a track
   */
  public getPlayerInstances(trackId: string): AudioPlayerInstance[] {
    const instances: AudioPlayerInstance[] = [];
    for (const instance of this.playerInstances.values()) {
      if (instance.trackId === trackId) {
        instances.push(instance);
      }
    }
    return instances;
  }

  /**
   * Get all player instances
   */
  public getAllPlayerInstances(): AudioPlayerInstance[] {
    return Array.from(this.playerInstances.values());
  }

  /**
   * Get specific instance
   */
  public getPlayerInstance(instanceId: string): AudioPlayerInstance | undefined {
    return this.playerInstances.get(instanceId);
  }

  // Track-level controls (affect ALL instances via shared channel)
  
  public setTrackVolume(trackId: string, volume: number): Promise<void> {
    const channel = this.trackChannels.get(trackId);
    if (channel) {
      const track = this.getTrackFromStore(trackId);
      const muted = track?.mute || false;
      channel.volume.value = convertVolumeToDecibels(volume, muted);
    }
    return Promise.resolve();
  }

  public setTrackPan(trackId: string, pan: number): Promise<void> {
    const channel = this.trackChannels.get(trackId);
    if (channel) {
      channel.pan.value = pan / 100;
    }
    return Promise.resolve();
  }

  public setTrackMute(trackId: string, muted: boolean): Promise<void> {
    const channel = this.trackChannels.get(trackId);
    if (channel) {
      const track = this.getTrackFromStore(trackId);
      const volume = track?.volume || 80;
      channel.volume.value = convertVolumeToDecibels(volume, muted);
    }
    return Promise.resolve();
  }

  /**
   * Set solo state for a track
   */
  public setTrackSolo(trackId: string, soloed: boolean): void {
    // Solo logic would affect all tracks, muting non-soloed ones
    if (soloed) {
      // Mute all other tracks
      for (const [otherTrackId, channel] of this.trackChannels) {
        if (otherTrackId !== trackId) {
          channel.volume.value = -Infinity;
        }
      }
    } else {
      // Restore all track volumes
      for (const [otherTrackId, channel] of this.trackChannels) {
        const track = this.getTrackFromStore(otherTrackId);
        if (track) {
          channel.volume.value = convertVolumeToDecibels(track.volume || 80, track.mute || false);
        }
      }
    }
  }

  /**
   * Set master volume
   */
  public setMasterVolume(volume: number): void {
    this.mainOutput.volume.value = volume;
  }

  /**
   * Stop all playback
   */
  public stopAllPlayback(): void {
    console.log('Stopping all playback');
    for (const instance of this.playerInstances.values()) {
      if (instance.player.state === "started") {
        instance.player.stop();
      }
    }
  }

  /**
   * Pause all playback
   */
  public pauseAllPlayback(): void {
    console.log('Pausing all playback');
    // For pause, we just stop the players but maintain their state
    for (const instance of this.playerInstances.values()) {
      if (instance.player.state === "started") {
        instance.player.stop();
      }
    }
  }

  // Helper methods for conversion
  private ticksToSeconds(ticks: number): number {
    const ppq = MUSIC_CONSTANTS.pulsesPerQuarterNote;
    const bpm = Tone.Transport.bpm.value;
    const beats = ticks / ppq;
    const secondsPerBeat = 60 / bpm;
    return beats * secondsPerBeat;
  }

  // TrackPlayer interface implementations (these will be updated in Phase 2)
  
  setTrackPositionTicks(id: string, position: number): Promise<void> {
    // Position is now per-instance, not per-track
    console.warn('setTrackPositionTicks is deprecated - position is per-instance');
    return Promise.resolve();
  }
  
  setTrackTrimStartTicks(id: string, start: number): Promise<void> {
    // Trim is now per-instance, not per-track
    console.warn('setTrackTrimStartTicks is deprecated - trim is per-instance');
    return Promise.resolve();
  }
  
  setTrackTrimEndTicks(id: string, end: number): Promise<void> {
    // Trim is now per-instance, not per-track
    console.warn('setTrackTrimEndTicks is deprecated - trim is per-instance');
    return Promise.resolve();
  }
  
  play(position: number): Promise<void> {
    // This will be handled by Transport
    throw new Error('play should be called on Transport, not AudioFilePlayer directly');
  }
  
  pause(): Promise<void> {
    this.pauseAllPlayback();
    return Promise.resolve();
  }
  
  stop(): Promise<void> {
    this.stopAllPlayback();
    return Promise.resolve();
  }

  // Deprecated methods (for backward compatibility during transition)
  
  /**
   * @deprecated Use loadAudioBuffer and createInstance instead
   */
  public async createTrack(id: string, name: string, audioFile?: File): Promise<any> {
    console.warn('createTrack is deprecated - use loadAudioBuffer and createInstance instead');
    
    if (audioFile) {
      await this.loadAudioBuffer(id, audioFile);
    }
    await this.createTrackChannel(id, name);
    
    // Create a default instance for backward compatibility
    const instanceId = `${id}_instance_1`;
    if (audioFile) {
      await this.createInstance(id, instanceId);
    }
    
    return {
      id,
      name,
      channel: this.trackChannels.get(id),
      player: this.playerInstances.get(instanceId)?.player,
      volume: 80,
      pan: 0,
      muted: false,
      soloed: false
    };
  }

  /**
   * @deprecated Use removeInstance for instances or removeTrack for entire track
   */
  public getAllTracks(): any[] {
    console.warn('getAllTracks is deprecated - use getPlayerInstances or getAllPlayerInstances');
    
    // Return a legacy format for backward compatibility
    const tracks: any[] = [];
    const processedTrackIds = new Set<string>();
    
    for (const [trackId, channel] of this.trackChannels) {
      if (!processedTrackIds.has(trackId)) {
        const track = this.getTrackFromStore(trackId);
        const firstInstance = this.getPlayerInstances(trackId)[0];
        
        tracks.push({
          id: trackId,
          name: track?.name || 'Audio Track',
          channel,
          player: firstInstance?.player,
          volume: track?.volume || 80,
          pan: track?.pan || 0,
          muted: track?.mute || false,
          soloed: track?.solo || false,
          position: { x: 0, y: 0 }
        });
        
        processedTrackIds.add(trackId);
      }
    }
    
    return tracks;
  }

  /**
   * @deprecated Position is now per-instance
   */
  public setTrackPosition(trackId: string, x: number, y: number): void {
    console.warn('setTrackPosition is deprecated - position is per-instance in the store');
  }

  /**
   * @deprecated Trim is now per-instance
   */
  public setTrackTrim(trackId: string, trimStartTicks: number, trimEndTicks: number): void {
    console.warn('setTrackTrim is deprecated - trim is per-instance in the store');
  }

  /**
   * @deprecated Use setTrackVolume, setTrackPan, setTrackMute instead
   */
  public setTrackName(trackId: string, name: string): void {
    console.warn('setTrackName is deprecated - track name is managed in the store');
  }

  /**
   * @deprecated
   */
  public updateTrack(trackId: string, updatedTrack: any): void {
    console.warn('updateTrack is deprecated - use specific methods like setTrackVolume');
  }
}

export default AudioFilePlayer;