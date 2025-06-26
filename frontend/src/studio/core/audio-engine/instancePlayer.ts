import * as Tone from 'tone';
import { AudioBufferManager } from './audioBufferManager';

/**
 * Represents trim settings for an audio instance
 */
export interface InstanceTrimSettings {
  trimStartTicks: number;
  trimEndTicks: number;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
}

/**
 * Lightweight player instance that shares buffer with other instances
 */
export class InstancePlayer {
  private player: Tone.Player;
  private trimSettings?: InstanceTrimSettings;
  private instanceId: string;
  private trackId: string;
  private fileId: string;
  private buffer: Tone.ToneAudioBuffer;
  private channel: Tone.Channel;
  private bufferManager: AudioBufferManager;
  private isPlaying: boolean = false;
  private xPosition: number = 0; // Position on timeline in ticks
  private trimStartTicks: number = 0;
  private trimEndTicks: number | null = null;
  
  constructor(
    instanceId: string,
    trackId: string,
    fileId: string,
    buffer: Tone.ToneAudioBuffer,
    channel: Tone.Channel
  ) {
    this.instanceId = instanceId;
    this.trackId = trackId;
    this.fileId = fileId;
    this.buffer = buffer;
    this.channel = channel;
    this.bufferManager = AudioBufferManager.getInstance();
    
    // Create player with shared buffer
    this.player = new Tone.Player({
      url: buffer,
      loop: false,
      autostart: false
    }).connect(channel);
    
    console.log(`InstancePlayer: Created player for instance ${instanceId}`);
  }
  
  /**
   * Set trim settings for this instance
   */
  setTrimSettings(settings: InstanceTrimSettings): void {
    this.trimSettings = settings;
    
    // Store trim settings on player for transport access
    (this.player as any)._trimSettings = {
      trimStartSeconds: settings.trimStartSeconds,
      trimEndSeconds: settings.trimEndSeconds,
      trimEnabled: true
    };
    
    console.log(`InstancePlayer: Set trim for instance ${this.instanceId}:`, settings);
  }
  
  /**
   * Start playback at a specific offset
   * @param time When to start (Tone.js time)
   * @param offset Offset within the audio in seconds
   */
  start(time?: number, offset?: number): void {
    if (this.player.state === "started") {
      console.warn(`InstancePlayer: Instance ${this.instanceId} already playing`);
      return;
    }
    
    this.player.start(time, offset);
  }
  
  /**
   * Stop playback
   */
  stop(): void {
    if (this.player.state === "started") {
      this.player.stop();
    }
  }
  
  /**
   * Sync player to transport
   */
  sync(): void {
    this.player.sync();
  }
  
  /**
   * Unsync player from transport
   */
  unsync(): void {
    this.player.unsync();
  }
  
  /**
   * Get player state
   */
  get state(): string {
    return this.player.state;
  }
  
  /**
   * Get the underlying Tone.js player
   */
  getPlayer(): Tone.Player {
    return this.player;
  }
  
  /**
   * Get instance ID
   */
  getInstanceId(): string {
    return this.instanceId;
  }
  
  /**
   * Get trim settings
   */
  getTrimSettings(): InstanceTrimSettings | undefined {
    return this.trimSettings;
  }
  
  /**
   * Set X position (timeline position in ticks)
   */
  setXPosition(xPosition: number): void {
    this.xPosition = xPosition;
  }
  
  /**
   * Get X position
   */
  getXPosition(): number {
    return this.xPosition;
  }
  
  /**
   * Reinitialize player with new data (for pooling)
   */
  async reinitialize(
    instanceId: string,
    trackId: string,
    fileId: string,
    buffer: Tone.ToneAudioBuffer,
    channel: Tone.Channel
  ): Promise<void> {
    this.dispose();
    
    this.instanceId = instanceId;
    this.trackId = trackId;
    this.fileId = fileId;
    this.buffer = buffer;
    this.channel = channel;
    
    // Create new player
    this.player = new Tone.Player({
      url: buffer,
      loop: false,
      autostart: false
    });
    
    this.player.connect(channel);
    
    // Reset state
    this.isPlaying = false;
    this.xPosition = 0;
    this.trimStartTicks = 0;
    this.trimEndTicks = null;
  }
  
  /**
   * Reset player state (for pooling)
   */
  reset(): void {
    this.stop();
    this.xPosition = 0;
    this.trimStartTicks = 0;
    this.trimEndTicks = null;
  }
  
  /**
   * Get track ID
   */
  getTrackId(): string {
    return this.trackId;
  }

  /**
   * Dispose the player and release buffer reference
   */
  dispose(): void {
    this.stop();
    this.unsync();
    this.player.dispose();
    
    // Release buffer reference
    this.bufferManager.releaseBuffer(this.fileId);
    
    console.log(`InstancePlayer: Disposed player for instance ${this.instanceId}`);
  }
}

/**
 * Factory for creating instance players with shared buffers
 */
export class InstancePlayerFactory {
  private bufferManager: AudioBufferManager;
  
  constructor() {
    this.bufferManager = AudioBufferManager.getInstance();
  }
  
  /**
   * Create a new instance player
   * @param instanceId Unique instance identifier
   * @param trackId Track this instance belongs to
   * @param fileId Audio file identifier
   * @param fileUrl URL to load audio from (if not cached)
   * @param channel Audio channel to connect to
   * @returns Instance player
   */
  async createInstancePlayer(
    instanceId: string,
    trackId: string,
    fileId: string,
    fileUrl: string,
    channel: Tone.Channel
  ): Promise<InstancePlayer> {
    // Get or load buffer
    const buffer = await this.bufferManager.getBuffer(fileId, fileUrl);
    
    // Create instance player with shared buffer
    const player = new InstancePlayer(
      instanceId,
      trackId,
      fileId,
      buffer,
      channel
    );
    
    return player;
  }
  
  /**
   * Create multiple instance players for a track
   * @param trackId Track identifier
   * @param fileId Audio file identifier
   * @param fileUrl URL to load audio from
   * @param channel Shared audio channel
   * @param instances Array of instance data
   * @returns Map of instance ID to player
   */
  async createInstancePlayers(
    trackId: string,
    fileId: string,
    fileUrl: string,
    channel: Tone.Channel,
    instances: Array<{
      id: string;
      trimStartTicks?: number;
      trimEndTicks?: number;
      xPosition?: number;
    }>
  ): Promise<Map<string, InstancePlayer>> {
    const players = new Map<string, InstancePlayer>();
    
    // Load buffer once
    const buffer = await this.bufferManager.getBuffer(fileId, fileUrl);
    
    // Create players for each instance
    for (const instance of instances) {
      const player = new InstancePlayer(
        instance.id,
        trackId,
        fileId,
        buffer,
        channel
      );
      
      // Set position if provided
      if (instance.xPosition !== undefined) {
        player.setXPosition(instance.xPosition);
      }
      
      // Set trim if provided
      if (instance.trimStartTicks !== undefined && instance.trimEndTicks !== undefined) {
        player.setTrimSettings({
          trimStartTicks: instance.trimStartTicks,
          trimEndTicks: instance.trimEndTicks
        });
      }
      
      players.set(instance.id, player);
    }
    
    console.log(`InstancePlayerFactory: Created ${players.size} instance players for track ${trackId}`);
    
    return players;
  }
}

export default InstancePlayerFactory;