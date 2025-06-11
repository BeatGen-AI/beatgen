import * as Tone from 'tone';
import { convertVolumeToDecibels } from '../../../utils/audioProcessing';
import { TrackPlayer } from '../trackPlayer';

// NEW: Separate shared track data from instance data
export interface SharedAudioData {
  trackId: string;
  name: string;
  buffer: Tone.ToneAudioBuffer | null;
  originalDurationTicks: number;
  audioUrl?: string; // Keep reference for cleanup
}

// NEW: Instance-specific data only
export interface AudioTrackInstance {
  instanceId: string;
  trackId: string; // Reference to shared data
  player: Tone.Player;
  channel: Tone.Channel;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  position: {
    x: number; // Position in ticks
    y: number; // Track lane
  };
  trimStartTicks?: number;
  trimEndTicks?: number;
}

// Legacy interface for backward compatibility
export interface AudioTrack extends AudioTrackInstance {
  // Keep old interface working
  name: string;
  id: string; // Maps to instanceId for legacy code
}

class AudioFilePlayerRefactored implements TrackPlayer {
  private static instance: AudioFilePlayerRefactored;
  private mainOutput: Tone.Channel;
  
  // NEW: Separate storage for shared data vs instances
  private sharedTrackData: Map<string, SharedAudioData> = new Map(); // trackId -> shared data
  private trackInstances: Map<string, AudioTrackInstance> = new Map(); // instanceId -> instance
  private trackToInstances: Map<string, string[]> = new Map(); // trackId -> instanceId[]

  private constructor() {
    this.mainOutput = new Tone.Channel().toDestination();
  }

  public static getInstance(): AudioFilePlayerRefactored {
    if (!AudioFilePlayerRefactored.instance) {
      AudioFilePlayerRefactored.instance = new AudioFilePlayerRefactored();
    }
    return AudioFilePlayerRefactored.instance;
  }

  public async initialize(): Promise<void> {
    try {
      console.log('AudioEngine: Starting Tone.js');
      // Keep existing initialization
      console.log('AudioEngine: Tone.js started successfully');
    } catch (error) {
      console.error('AudioEngine: Failed to start Tone.js:', error);
      throw error;
    }
  }

  // NEW: Load shared track data (audio file) - called once per track
  public async loadSharedTrackData(trackId: string, name: string, audioFile?: File): Promise<SharedAudioData> {
    console.log(`Loading shared data for track ${trackId}`);
    
    // Check if already loaded
    if (this.sharedTrackData.has(trackId)) {
      return this.sharedTrackData.get(trackId)!;
    }

    let buffer: Tone.ToneAudioBuffer | null = null;
    let audioUrl: string | undefined;
    let originalDurationTicks = 0;

    if (audioFile) {
      console.log(`Loading audio file for shared track ${trackId}`);
      const arrayBuffer = await audioFile.arrayBuffer();
      audioUrl = URL.createObjectURL(new Blob([arrayBuffer]));
      
      buffer = new Tone.ToneAudioBuffer();
      await buffer.load(audioUrl);
      
      // Calculate duration in ticks (you'd get this from your project settings)
      // For now, using placeholder calculation
      originalDurationTicks = Math.floor(buffer.duration * 4800); // Assuming 120 BPM, 4/4 time
    }

    const sharedData: SharedAudioData = {
      trackId,
      name,
      buffer,
      originalDurationTicks,
      audioUrl
    };

    this.sharedTrackData.set(trackId, sharedData);
    return sharedData;
  }

  // NEW: Create instance of existing track data
  public async createTrackInstance(
    trackId: string, 
    instanceId: string, 
    position: { x: number; y: number },
    options: {
      volume?: number;
      pan?: number;
      muted?: boolean;
      trimStartTicks?: number;
      trimEndTicks?: number;
    } = {}
  ): Promise<AudioTrackInstance> {
    console.log(`Creating instance ${instanceId} for track ${trackId}`);

    // Get shared data (must exist)
    const sharedData = this.sharedTrackData.get(trackId);
    if (!sharedData) {
      throw new Error(`Shared track data not found for track ${trackId}. Call loadSharedTrackData first.`);
    }

    // Create new channel for this instance
    const channel = new Tone.Channel().connect(this.mainOutput);
    
    const defaultVolume = options.volume ?? 80;
    channel.volume.value = convertVolumeToDecibels(defaultVolume, options.muted ?? false);
    channel.pan.value = (options.pan ?? 0) / 100; // Convert to -1 to 1 range

    // Create new player sharing the same buffer
    let player: Tone.Player;
    if (sharedData.buffer) {
      player = new Tone.Player({
        url: sharedData.buffer,
        loop: false,
        autostart: false,
      }).connect(channel);
      
      await Tone.loaded();
    } else {
      // Create empty player for MIDI-only tracks
      player = new Tone.Player().connect(channel);
    }

    const instance: AudioTrackInstance = {
      instanceId,
      trackId,
      player,
      channel,
      volume: defaultVolume,
      pan: options.pan ?? 0,
      muted: options.muted ?? false,
      soloed: false,
      position,
      trimStartTicks: options.trimStartTicks,
      trimEndTicks: options.trimEndTicks
    };

    // Store instance
    this.trackInstances.set(instanceId, instance);
    
    // Update trackId -> instanceIds mapping
    if (!this.trackToInstances.has(trackId)) {
      this.trackToInstances.set(trackId, []);
    }
    this.trackToInstances.get(trackId)!.push(instanceId);

    console.log(`Created instance ${instanceId} for track ${trackId} at position (${position.x}, ${position.y})`);
    return instance;
  }

  // MODIFIED: Legacy createTrack method for backward compatibility
  public async createTrack(id: string, name: string, audioFile?: File): Promise<AudioTrack> {
    console.log(`Creating legacy track ${id}`);
    
    // For legacy compatibility, create both shared data and first instance
    const trackId = id;
    const instanceId = `${id}_legacy_0`;
    
    // Load shared data
    await this.loadSharedTrackData(trackId, name, audioFile);
    
    // Create first instance at default position
    const instance = await this.createTrackInstance(trackId, instanceId, { x: 0, y: 0 });
    
    // Return legacy-compatible object
    const legacyTrack: AudioTrack = {
      ...instance,
      id: instanceId, // Legacy code expects 'id' field
      name: name
    };

    return legacyTrack;
  }

  // NEW: Remove specific instance
  public removeTrackInstance(instanceId: string): void {
    console.log(`Removing instance ${instanceId}`);
    
    const instance = this.trackInstances.get(instanceId);
    if (!instance) return;

    const trackId = instance.trackId;

    // Clean up Tone.js objects
    if (instance.player) {
      instance.player.stop();
      instance.player.dispose();
    }
    instance.channel.dispose();

    // Remove from instance tracking
    this.trackInstances.delete(instanceId);

    // Update trackId -> instanceIds mapping
    const instances = this.trackToInstances.get(trackId);
    if (instances) {
      const index = instances.indexOf(instanceId);
      if (index !== -1) {
        instances.splice(index, 1);
        
        // If no more instances, clean up shared data
        if (instances.length === 0) {
          this.removeSharedTrackData(trackId);
          this.trackToInstances.delete(trackId);
        }
      }
    }
  }

  // NEW: Remove all instances of a track and its shared data
  public removeTrack(id: string): void {
    console.log(`Removing all instances of track ${id}`);
    
    // Handle legacy single-instance removal
    if (this.trackInstances.has(id)) {
      this.removeTrackInstance(id);
      return;
    }

    // Remove all instances of this track
    const instances = this.trackToInstances.get(id) || [];
    instances.forEach(instanceId => {
      this.removeTrackInstance(instanceId);
    });
  }

  private removeSharedTrackData(trackId: string): void {
    const sharedData = this.sharedTrackData.get(trackId);
    if (sharedData) {
      // Clean up audio URL
      if (sharedData.audioUrl) {
        URL.revokeObjectURL(sharedData.audioUrl);
      }
      
      // Clean up buffer
      if (sharedData.buffer) {
        sharedData.buffer.dispose();
      }
      
      this.sharedTrackData.delete(trackId);
      console.log(`Cleaned up shared data for track ${trackId}`);
    }
  }

  // MODIFIED: Update specific instance
  public setTrackInstanceVolume(instanceId: string, volume: number): Promise<void> {
    const instance = this.trackInstances.get(instanceId);
    if (instance) {
      instance.volume = volume;
      const volumeInDB = convertVolumeToDecibels(volume, instance.muted);
      instance.channel.volume.value = volumeInDB;
      if (instance.player) {
        instance.player.volume.value = volumeInDB;
      }
    }
    return Promise.resolve();
  }

  public setTrackInstancePan(instanceId: string, pan: number): Promise<void> {
    const instance = this.trackInstances.get(instanceId);
    if (instance) {
      instance.pan = pan;
      instance.channel.pan.value = pan / 100; // Convert to -1 to 1
    }
    return Promise.resolve();
  }

  public setTrackInstanceMute(instanceId: string, muted: boolean): Promise<void> {
    const instance = this.trackInstances.get(instanceId);
    if (instance) {
      instance.muted = muted;
      instance.channel.volume.value = convertVolumeToDecibels(instance.volume, muted);
      if (instance.player) {
        instance.player.volume.value = convertVolumeToDecibels(instance.volume, muted);
      }
    }
    return Promise.resolve();
  }

  public setTrackInstancePosition(instanceId: string, position: { x: number; y: number }): Promise<void> {
    const instance = this.trackInstances.get(instanceId);
    if (instance) {
      instance.position = position;
      console.log(`Updated instance ${instanceId} position to (${position.x}, ${position.y})`);
    }
    return Promise.resolve();
  }

  // NEW: Update all instances of a track (for shared property changes)
  public updateAllInstancesOfTrack(trackId: string, updates: Partial<AudioTrackInstance>): void {
    const instances = this.trackToInstances.get(trackId) || [];
    instances.forEach(instanceId => {
      const instance = this.trackInstances.get(instanceId);
      if (instance) {
        Object.assign(instance, updates);
        
        // Apply audio changes
        if (updates.volume !== undefined) {
          this.setTrackInstanceVolume(instanceId, updates.volume);
        }
        if (updates.pan !== undefined) {
          this.setTrackInstancePan(instanceId, updates.pan);
        }
        if (updates.muted !== undefined) {
          this.setTrackInstanceMute(instanceId, updates.muted);
        }
      }
    });
  }

  // Legacy compatibility methods
  public setTrackVolume(id: string, volume: number): Promise<void> {
    return this.setTrackInstanceVolume(id, volume);
  }

  public setTrackPan(id: string, pan: number): Promise<void> {
    return this.setTrackInstancePan(id, pan);
  }

  public setTrackMute(id: string, muted: boolean): Promise<void> {
    return this.setTrackInstanceMute(id, muted);
  }

  // NEW: Get all instances
  public getAllInstances(): AudioTrackInstance[] {
    return Array.from(this.trackInstances.values());
  }

  public getInstancesByTrack(trackId: string): AudioTrackInstance[] {
    const instanceIds = this.trackToInstances.get(trackId) || [];
    return instanceIds.map(id => this.trackInstances.get(id)).filter(Boolean) as AudioTrackInstance[];
  }

  public getInstance(instanceId: string): AudioTrackInstance | undefined {
    return this.trackInstances.get(instanceId);
  }

  // Legacy compatibility
  public getAllTracks(): AudioTrack[] {
    return this.getAllInstances().map(instance => ({
      ...instance,
      id: instance.instanceId,
      name: this.sharedTrackData.get(instance.trackId)?.name || ''
    }));
  }

  public setMasterVolume(volume: number): void {
    this.mainOutput.volume.value = volume;
  }

  public stopAllPlayback(): void {
    console.log('Stopping all instance playback');
    this.trackInstances.forEach((instance, instanceId) => {
      if (instance.player && instance.player.state === "started") {
        console.log(`Stopping player for instance ${instanceId}`);
        instance.player.stop();
      }
    });
  }

  // NEW: Advanced scheduling for position-aware playback
  public scheduleInstancePlayback(instanceId: string, transportPosition: number, bpm: number): void {
    const instance = this.trackInstances.get(instanceId);
    if (!instance || !instance.player) return;

    // Calculate when this instance should start based on its position
    const ticksToSeconds = (ticks: number) => (ticks / (bpm * 4)) * 60; // Assuming 4/4 time
    const instanceStartTime = ticksToSeconds(instance.position.x);
    const startOffset = instanceStartTime - transportPosition;

    if (startOffset >= 0) {
      // Instance starts in the future
      console.log(`Scheduling instance ${instanceId} to start in ${startOffset} seconds`);
      instance.player.start(`+${startOffset}`);
    } else if (Math.abs(startOffset) < instance.player.buffer.duration) {
      // Instance should have already started, calculate current position
      const currentOffset = Math.abs(startOffset);
      console.log(`Starting instance ${instanceId} at offset ${currentOffset} seconds`);
      instance.player.start('+0', currentOffset);
    }
    // If startOffset is too negative, the instance has already finished playing
  }

  // Interface methods (keep existing signatures for compatibility)
  setTrackPositionTicks(id: string, position: number): Promise<void> {
    throw new Error('Method not implemented - use setTrackInstancePosition instead');
  }

  setTrackTrimStartTicks(id: string, start: number): Promise<void> {
    const instance = this.trackInstances.get(id);
    if (instance) {
      instance.trimStartTicks = start;
    }
    return Promise.resolve();
  }

  setTrackTrimEndTicks(id: string, end: number): Promise<void> {
    const instance = this.trackInstances.get(id);
    if (instance) {
      instance.trimEndTicks = end;
    }
    return Promise.resolve();
  }

  play(position: number): Promise<void> {
    throw new Error('Method not implemented - use scheduleInstancePlayback instead');
  }

  pause(): Promise<void> {
    this.stopAllPlayback();
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.stopAllPlayback();
    return Promise.resolve();
  }
}

export default AudioFilePlayerRefactored;