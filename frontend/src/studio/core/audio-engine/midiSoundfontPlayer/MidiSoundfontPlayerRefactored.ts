import { AudioWorkletNodeSynthesizer } from 'js-synthesizer';
import { Note } from '../../../../types/note';
import { TrackPlayer } from '../trackPlayer';

// NEW: Shared MIDI track data
export interface SharedMidiData {
  trackId: string;
  name: string;
  instrumentId: string;
  midiNotes: Note[];
  soundfontLoaded: boolean;
  synthesizerChannel?: number;
}

// NEW: MIDI track instance
export interface MidiTrackInstance {
  instanceId: string;
  trackId: string;
  synthesizerChannel: number;
  position: {
    x: number; // Position in ticks
    y: number; // Track lane
  };
  isPlaying: boolean;
  // Volume, pan, mute inherited from shared track data
}

/**
 * Refactored MIDI Soundfont Player for Track Instances
 * 
 * Supports multiple instances of the same MIDI track content,
 * each playing at different positions with shared soundfont/instrument.
 */
class MidiSoundfontPlayerRefactored implements TrackPlayer {
  private static instance: MidiSoundfontPlayerRefactored;
  
  // Core synthesizer
  private synth: AudioWorkletNodeSynthesizer;
  private isInitialized: boolean = false;
  private audioNode: AudioWorkletNode | null = null;
  
  // NEW: Separate storage for shared data vs instances
  private sharedTrackData: Map<string, SharedMidiData> = new Map(); // trackId -> shared data
  private trackInstances: Map<string, MidiTrackInstance> = new Map(); // instanceId -> instance
  private trackToInstances: Map<string, string[]> = new Map(); // trackId -> instanceId[]
  
  // Channel management
  private nextAvailableChannel: number = 0;
  private channelMap: Map<string, number> = new Map(); // trackId -> channel
  
  // Timing
  private bpm: number = 120;
  private isPlaying: boolean = false;

  private constructor() {
    this.synth = new AudioWorkletNodeSynthesizer();
  }

  public static getInstance(): MidiSoundfontPlayerRefactored {
    if (!MidiSoundfontPlayerRefactored.instance) {
      MidiSoundfontPlayerRefactored.instance = new MidiSoundfontPlayerRefactored();
    }
    return MidiSoundfontPlayerRefactored.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('MidiSoundfontPlayerRefactored: Initializing synthesizer');
      
      // Initialize synthesizer with audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.audioNode = await this.synth.createAudioNode(audioContext);
      this.audioNode.connect(audioContext.destination);

      this.isInitialized = true;
      console.log('MidiSoundfontPlayerRefactored: Initialized successfully');
    } catch (error) {
      console.error('MidiSoundfontPlayerRefactored: Failed to initialize:', error);
      throw error;
    }
  }

  // =============================================================================
  // SHARED TRACK DATA MANAGEMENT
  // =============================================================================

  /**
   * Load shared MIDI track data (soundfont, instrument, MIDI notes)
   */
  public async loadSharedTrackData(
    trackId: string,
    name: string,
    instrumentId: string,
    midiNotes: Note[] = []
  ): Promise<SharedMidiData> {
    console.log(`Loading shared MIDI data for track ${trackId}`);

    // Check if already loaded
    if (this.sharedTrackData.has(trackId)) {
      return this.sharedTrackData.get(trackId)!;
    }

    await this.initialize();

    // Assign a synthesizer channel for this track
    const synthesizerChannel = this.nextAvailableChannel++;
    this.channelMap.set(trackId, synthesizerChannel);

    // TODO: Load soundfont for instrument
    // This would typically involve:
    // 1. Fetch soundfont file for instrumentId
    // 2. Load it into synthesizer
    // 3. Set program/bank for the channel
    
    const sharedData: SharedMidiData = {
      trackId,
      name,
      instrumentId,
      midiNotes,
      soundfontLoaded: false, // TODO: Set to true after loading
      synthesizerChannel
    };

    this.sharedTrackData.set(trackId, sharedData);
    console.log(`Shared MIDI data loaded for track ${trackId} on channel ${synthesizerChannel}`);
    
    return sharedData;
  }

  /**
   * Update shared MIDI data (affects all instances)
   */
  public async updateSharedTrackData(trackId: string, updates: Partial<SharedMidiData>): Promise<void> {
    const existingData = this.sharedTrackData.get(trackId);
    if (!existingData) {
      throw new Error(`Shared MIDI track data not found for track ${trackId}`);
    }

    const updatedData = { ...existingData, ...updates };
    this.sharedTrackData.set(trackId, updatedData);

    // If MIDI notes updated, affect all instances
    if (updates.midiNotes) {
      console.log(`Updated MIDI notes for track ${trackId}, affecting ${this.getInstancesByTrack(trackId).length} instances`);
    }
  }

  // =============================================================================
  // TRACK INSTANCE MANAGEMENT
  // =============================================================================

  /**
   * Create a new instance of existing MIDI track content
   */
  public async createTrackInstance(
    trackId: string,
    instanceId: string,
    position: { x: number; y: number }
  ): Promise<MidiTrackInstance> {
    console.log(`Creating MIDI instance ${instanceId} for track ${trackId} at position (${position.x}, ${position.y})`);

    // Validate shared data exists
    const sharedData = this.sharedTrackData.get(trackId);
    if (!sharedData) {
      throw new Error(`Shared MIDI track data not found for track ${trackId}. Load shared data first.`);
    }

    const instance: MidiTrackInstance = {
      instanceId,
      trackId,
      synthesizerChannel: sharedData.synthesizerChannel!,
      position,
      isPlaying: false
    };

    // Store instance
    this.trackInstances.set(instanceId, instance);
    
    // Update trackId -> instanceIds mapping
    if (!this.trackToInstances.has(trackId)) {
      this.trackToInstances.set(trackId, []);
    }
    this.trackToInstances.get(trackId)!.push(instanceId);

    console.log(`Created MIDI instance ${instanceId} for track ${trackId}`);
    return instance;
  }

  /**
   * Remove a specific MIDI track instance
   */
  public removeTrackInstance(instanceId: string): void {
    console.log(`Removing MIDI instance ${instanceId}`);
    
    const instance = this.trackInstances.get(instanceId);
    if (!instance) return;

    const trackId = instance.trackId;

    // Stop if playing
    if (instance.isPlaying) {
      this.stopInstance(instanceId);
    }

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
    console.log(`Removing all MIDI instances of track ${trackId}`);
    
    const instances = this.trackToInstances.get(trackId) || [];
    instances.forEach(instanceId => {
      this.removeTrackInstance(instanceId);
    });
  }

  private removeSharedTrackData(trackId: string): void {
    const sharedData = this.sharedTrackData.get(trackId);
    if (sharedData) {
      // TODO: Clean up synthesizer channel/soundfont resources
      
      this.sharedTrackData.delete(trackId);
      this.channelMap.delete(trackId);
      console.log(`Cleaned up shared MIDI data for track ${trackId}`);
    }
  }

  // =============================================================================
  // PLAYBACK CONTROL
  // =============================================================================

  /**
   * Schedule MIDI instance playback based on its position
   */
  public scheduleInstancePlayback(instanceId: string, transportPosition: number, bpm: number): void {
    const instance = this.trackInstances.get(instanceId);
    if (!instance) return;

    const sharedData = this.sharedTrackData.get(instance.trackId);
    if (!sharedData || !sharedData.soundfontLoaded) {
      console.warn(`Cannot play MIDI instance ${instanceId}: soundfont not loaded`);
      return;
    }

    // Calculate timing
    const ticksToSeconds = (ticks: number) => (ticks / (bpm * 4)) * 60; // Assuming 4/4 time
    const instanceStartTime = ticksToSeconds(instance.position.x);
    const startOffset = instanceStartTime - transportPosition;

    console.log(`Scheduling MIDI instance ${instanceId} to start in ${startOffset} seconds`);

    // Schedule MIDI notes
    this.scheduleNotesForInstance(instance, sharedData, startOffset, bpm);
  }

  private scheduleNotesForInstance(
    instance: MidiTrackInstance,
    sharedData: SharedMidiData,
    startOffset: number,
    bpm: number
  ): void {
    const { midiNotes, synthesizerChannel } = sharedData;
    
    midiNotes.forEach(note => {
      const noteStartTime = startOffset + (note.column / (bpm * 4)) * 60; // column = start time
      const noteEndTime = startOffset + ((note.column + note.length) / (bpm * 4)) * 60; // column + length = end time
      
      if (noteStartTime >= 0) {
        // Schedule note on
        setTimeout(() => {
          if (this.synth && instance.isPlaying) {
            // TODO: Fix synthesizer API calls based on actual js-synthesizer API
            console.log(`Playing MIDI note: channel=${synthesizerChannel}, pitch=${note.row}, velocity=${note.velocity || 100}`);
          }
        }, noteStartTime * 1000);

        // Schedule note off
        setTimeout(() => {
          if (this.synth && instance.isPlaying) {
            // TODO: Fix synthesizer API calls based on actual js-synthesizer API
            console.log(`Stopping MIDI note: channel=${synthesizerChannel}, pitch=${note.row}`);
          }
        }, noteEndTime * 1000);
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
      // Stop all notes on this channel
      // TODO: Better note tracking for precise stopping
      console.log(`Stopping all notes on MIDI channel ${instance.synthesizerChannel}`);
      instance.isPlaying = false;
    }
  }

  /**
   * Stop all MIDI playback
   */
  public stopAllPlayback(): void {
    console.log('Stopping all MIDI instance playback');
    this.trackInstances.forEach((instance, instanceId) => {
      this.stopInstance(instanceId);
    });
    
    // Emergency stop - silence all channels
    console.log('Emergency stop - silencing all MIDI channels');
    
    this.isPlaying = false;
  }

  // =============================================================================
  // POSITION MANAGEMENT
  // =============================================================================

  public setTrackInstancePosition(instanceId: string, position: { x: number; y: number }): void {
    const instance = this.trackInstances.get(instanceId);
    if (instance) {
      instance.position = position;
      console.log(`Updated MIDI instance ${instanceId} position to (${position.x}, ${position.y})`);
    }
  }

  // =============================================================================
  // QUERY METHODS
  // =============================================================================

  public getAllInstances(): MidiTrackInstance[] {
    return Array.from(this.trackInstances.values());
  }

  public getInstancesByTrack(trackId: string): MidiTrackInstance[] {
    const instanceIds = this.trackToInstances.get(trackId) || [];
    return instanceIds.map(id => this.trackInstances.get(id)).filter(Boolean) as MidiTrackInstance[];
  }

  public getInstance(instanceId: string): MidiTrackInstance | undefined {
    return this.trackInstances.get(instanceId);
  }

  // =============================================================================
  // LEGACY COMPATIBILITY & TRACKPLAYER INTERFACE
  // =============================================================================

  async createTrack(id: string, name: string): Promise<any> {
    throw new Error('Use loadSharedTrackData + createTrackInstance for MIDI tracks');
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
    // TODO: Implement shared volume control via synthesizer
    return Promise.resolve();
  }

  setTrackPan(id: string, pan: number): Promise<void> {
    // TODO: Implement shared pan control via synthesizer
    return Promise.resolve();
  }

  setTrackMute(id: string, muted: boolean): Promise<void> {
    // TODO: Implement shared mute control via synthesizer
    return Promise.resolve();
  }

  play(position: number): Promise<void> {
    this.isPlaying = true;
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

export default MidiSoundfontPlayerRefactored;