import * as Tone from 'tone';
import { Note } from '../../../types/note';
import { TrackPlayer } from './trackPlayer';

// NEW: Shared sampler track data
export interface SharedSamplerData {
  trackId: string;
  name: string;
  audioBuffer: Tone.ToneAudioBuffer | null;
  baseMidiNote: number;
  grainSize: number;
  overlap: number;
  midiNotes: Note[];
  audioUrl?: string;
}

// NEW: Sampler track instance
export interface SamplerTrackInstance {
  instanceId: string;
  trackId: string;
  samplers: Map<number, Tone.Sampler>; // noteNumber -> sampler
  position: {
    x: number; // Position in ticks
    y: number; // Track lane
  };
  isPlaying: boolean;
  // Volume, pan, mute inherited from shared track data
}

/**
 * Refactored Sampler Controller for Track Instances
 * 
 * Supports multiple instances of the same sampler track content,
 * each playing at different positions with shared audio samples.
 */
class SamplerControllerRefactored implements TrackPlayer {
  private static instance: SamplerControllerRefactored;
  
  // Audio output
  private mainOutput: Tone.Channel;
  
  // NEW: Separate storage for shared data vs instances
  private sharedTrackData: Map<string, SharedSamplerData> = new Map(); // trackId -> shared data
  private trackInstances: Map<string, SamplerTrackInstance> = new Map(); // instanceId -> instance
  private trackToInstances: Map<string, string[]> = new Map(); // trackId -> instanceId[]
  
  // Timing
  private bpm: number = 120;

  private constructor() {
    this.mainOutput = new Tone.Channel().toDestination();
  }

  public static getInstance(): SamplerControllerRefactored {
    if (!SamplerControllerRefactored.instance) {
      SamplerControllerRefactored.instance = new SamplerControllerRefactored();
    }
    return SamplerControllerRefactored.instance;
  }

  public async initialize(): Promise<void> {
    console.log('SamplerControllerRefactored: Initialized');
  }

  // =============================================================================
  // SHARED TRACK DATA MANAGEMENT
  // =============================================================================

  /**
   * Load shared sampler track data (audio sample, MIDI notes)
   */
  public async loadSharedTrackData(
    trackId: string,
    name: string,
    audioFile: File,
    baseMidiNote: number = 60,
    grainSize: number = 0.1,
    overlap: number = 0.1,
    midiNotes: Note[] = []
  ): Promise<SharedSamplerData> {
    console.log(`Loading shared sampler data for track ${trackId}`);

    // Check if already loaded
    if (this.sharedTrackData.has(trackId)) {
      return this.sharedTrackData.get(trackId)!;
    }

    let buffer: Tone.ToneAudioBuffer | null = null;
    let audioUrl: string | undefined;

    if (audioFile) {
      console.log(`Loading audio sample for sampler track ${trackId}`);
      const arrayBuffer = await audioFile.arrayBuffer();
      audioUrl = URL.createObjectURL(new Blob([arrayBuffer]));
      
      buffer = new Tone.ToneAudioBuffer();
      await buffer.load(audioUrl);
    }

    const sharedData: SharedSamplerData = {
      trackId,
      name,
      audioBuffer: buffer,
      baseMidiNote,
      grainSize,
      overlap,
      midiNotes,
      audioUrl
    };

    this.sharedTrackData.set(trackId, sharedData);
    console.log(`Shared sampler data loaded for track ${trackId}`);
    
    return sharedData;
  }

  /**
   * Update shared sampler data (affects all instances)
   */
  public async updateSharedTrackData(trackId: string, updates: Partial<SharedSamplerData>): Promise<void> {
    const existingData = this.sharedTrackData.get(trackId);
    if (!existingData) {
      throw new Error(`Shared sampler track data not found for track ${trackId}`);
    }

    const updatedData = { ...existingData, ...updates };
    this.sharedTrackData.set(trackId, updatedData);

    // If audio or MIDI notes updated, recreate samplers for all instances
    if (updates.audioBuffer || updates.midiNotes) {
      const instances = this.getInstancesByTrack(trackId);
      for (const instance of instances) {
        await this.recreateSamplersForInstance(instance.instanceId);
      }
    }
  }

  // =============================================================================
  // TRACK INSTANCE MANAGEMENT
  // =============================================================================

  /**
   * Create a new instance of existing sampler track content
   */
  public async createTrackInstance(
    trackId: string,
    instanceId: string,
    position: { x: number; y: number }
  ): Promise<SamplerTrackInstance> {
    console.log(`Creating sampler instance ${instanceId} for track ${trackId} at position (${position.x}, ${position.y})`);

    // Validate shared data exists
    const sharedData = this.sharedTrackData.get(trackId);
    if (!sharedData) {
      throw new Error(`Shared sampler track data not found for track ${trackId}. Load shared data first.`);
    }

    const instance: SamplerTrackInstance = {
      instanceId,
      trackId,
      samplers: new Map(),
      position,
      isPlaying: false
    };

    // Create samplers for all MIDI notes used in this track
    await this.createSamplersForInstance(instance, sharedData);

    // Store instance
    this.trackInstances.set(instanceId, instance);
    
    // Update trackId -> instanceIds mapping
    if (!this.trackToInstances.has(trackId)) {
      this.trackToInstances.set(trackId, []);
    }
    this.trackToInstances.get(trackId)!.push(instanceId);

    console.log(`Created sampler instance ${instanceId} for track ${trackId}`);
    return instance;
  }

  private async createSamplersForInstance(instance: SamplerTrackInstance, sharedData: SharedSamplerData): Promise<void> {
    if (!sharedData.audioBuffer) {
      console.warn(`No audio buffer for sampler track ${sharedData.trackId}`);
      return;
    }

    // Get all unique MIDI notes used in the track
    const uniqueNotes = new Set(sharedData.midiNotes.map(note => note.row)); // row = pitch
    
    // Create a sampler for each note
    for (const noteNumber of uniqueNotes) {
      // Calculate pitch shift from base note
      const pitchShift = noteNumber - sharedData.baseMidiNote;
      const playbackRate = Math.pow(2, pitchShift / 12); // Semitone = 2^(1/12)

      // Create Tone.Player configured as a sampler
      const player = new Tone.Player({
        url: sharedData.audioBuffer,
        loop: false,
        autostart: false,
        playbackRate: playbackRate
      }).connect(this.mainOutput);

      // Store as any since we're using Player instead of Sampler
      instance.samplers.set(noteNumber, player as any);
    }

    await Tone.loaded();
    console.log(`Created ${instance.samplers.size} samplers for instance ${instance.instanceId}`);
  }

  private async recreateSamplersForInstance(instanceId: string): Promise<void> {
    const instance = this.trackInstances.get(instanceId);
    if (!instance) return;

    // Dispose old samplers
    instance.samplers.forEach(sampler => sampler.dispose());
    instance.samplers.clear();

    // Create new samplers
    const sharedData = this.sharedTrackData.get(instance.trackId);
    if (sharedData) {
      await this.createSamplersForInstance(instance, sharedData);
    }
  }

  /**
   * Remove a specific sampler track instance
   */
  public removeTrackInstance(instanceId: string): void {
    console.log(`Removing sampler instance ${instanceId}`);
    
    const instance = this.trackInstances.get(instanceId);
    if (!instance) return;

    const trackId = instance.trackId;

    // Stop if playing
    if (instance.isPlaying) {
      this.stopInstance(instanceId);
    }

    // Dispose samplers
    instance.samplers.forEach(sampler => sampler.dispose());
    instance.samplers.clear();

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

  /**
   * Remove all instances of a track and its shared data
   */
  public removeTrack(trackId: string): void {
    console.log(`Removing all sampler instances of track ${trackId}`);
    
    const instances = this.trackToInstances.get(trackId) || [];
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
      if (sharedData.audioBuffer) {
        sharedData.audioBuffer.dispose();
      }
      
      this.sharedTrackData.delete(trackId);
      console.log(`Cleaned up shared sampler data for track ${trackId}`);
    }
  }

  // =============================================================================
  // PLAYBACK CONTROL
  // =============================================================================

  /**
   * Schedule sampler instance playback based on its position
   */
  public scheduleInstancePlayback(instanceId: string, transportPosition: number, bpm: number): void {
    const instance = this.trackInstances.get(instanceId);
    if (!instance) return;

    const sharedData = this.sharedTrackData.get(instance.trackId);
    if (!sharedData) {
      console.warn(`Cannot play sampler instance ${instanceId}: shared data not found`);
      return;
    }

    // Calculate timing
    const ticksToSeconds = (ticks: number) => (ticks / (bpm * 4)) * 60; // Assuming 4/4 time
    const instanceStartTime = ticksToSeconds(instance.position.x);
    const startOffset = instanceStartTime - transportPosition;

    console.log(`Scheduling sampler instance ${instanceId} to start in ${startOffset} seconds`);

    // Schedule MIDI notes to trigger samples
    this.scheduleNotesForInstance(instance, sharedData, startOffset, bpm);
  }

  private scheduleNotesForInstance(
    instance: SamplerTrackInstance,
    sharedData: SharedSamplerData,
    startOffset: number,
    bpm: number
  ): void {
    const { midiNotes } = sharedData;
    
    midiNotes.forEach(note => {
      const noteStartTime = startOffset + (note.column / (bpm * 4)) * 60; // column = start time
      
      if (noteStartTime >= 0) {
        const sampler = instance.samplers.get(note.row); // row = pitch
        if (sampler) {
          // Schedule sample trigger
          setTimeout(() => {
            if (instance.isPlaying) {
              // Cast to Tone.Player to access start method
              (sampler as any).start();
            }
          }, noteStartTime * 1000);
        }
      }
    });

    instance.isPlaying = true;
  }

  /**
   * Stop a specific instance
   */
  public stopInstance(instanceId: string): void {
    const instance = this.trackInstances.get(instanceId);
    if (instance) {
      // Stop all samplers
      instance.samplers.forEach(sampler => {
        const player = sampler as any; // Cast to Tone.Player
        if (player.state === 'started') {
          player.stop();
        }
      });
      instance.isPlaying = false;
    }
  }

  /**
   * Stop all sampler playback
   */
  public stopAllPlayback(): void {
    console.log('Stopping all sampler instance playback');
    this.trackInstances.forEach((instance, instanceId) => {
      this.stopInstance(instanceId);
    });
  }

  // =============================================================================
  // POSITION MANAGEMENT
  // =============================================================================

  public setTrackInstancePosition(instanceId: string, position: { x: number; y: number }): void {
    const instance = this.trackInstances.get(instanceId);
    if (instance) {
      instance.position = position;
      console.log(`Updated sampler instance ${instanceId} position to (${position.x}, ${position.y})`);
    }
  }

  // =============================================================================
  // QUERY METHODS
  // =============================================================================

  public getAllInstances(): SamplerTrackInstance[] {
    return Array.from(this.trackInstances.values());
  }

  public getInstancesByTrack(trackId: string): SamplerTrackInstance[] {
    const instanceIds = this.trackToInstances.get(trackId) || [];
    return instanceIds.map(id => this.trackInstances.get(id)).filter(Boolean) as SamplerTrackInstance[];
  }

  public getInstance(instanceId: string): SamplerTrackInstance | undefined {
    return this.trackInstances.get(instanceId);
  }

  // =============================================================================
  // LEGACY COMPATIBILITY & TRACKPLAYER INTERFACE
  // =============================================================================

  async createTrack(id: string, name: string): Promise<any> {
    throw new Error('Use loadSharedTrackData + createTrackInstance for sampler tracks');
  }

  setTrackPositionTicks(id: string, position: number): Promise<void> {
    return Promise.resolve();
  }

  setTrackTrimStartTicks(id: string, start: number): Promise<void> {
    return Promise.resolve();
  }

  setTrackTrimEndTicks(id: string, end: number): Promise<void> {
    return Promise.resolve();
  }

  setTrackVolume(id: string, volume: number): Promise<void> {
    // TODO: Implement shared volume control
    return Promise.resolve();
  }

  setTrackPan(id: string, pan: number): Promise<void> {
    // TODO: Implement shared pan control
    return Promise.resolve();
  }

  setTrackMute(id: string, muted: boolean): Promise<void> {
    // TODO: Implement shared mute control
    return Promise.resolve();
  }

  play(position: number): Promise<void> {
    return Promise.resolve();
  }

  pause(): Promise<void> {
    this.stopAllPlayback();
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.stopAllPlayback();
    return Promise.resolve();
  }

  setBPM(bpm: number): void {
    this.bpm = bpm;
  }
}

export default SamplerControllerRefactored;