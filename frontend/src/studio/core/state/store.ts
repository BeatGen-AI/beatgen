import { ProjectManager } from './project';
import { MidiManager } from '../midi/MidiManagerNew';
import { InstrumentManager } from '../instruments/InstrumentManager';
import { MUSIC_CONSTANTS } from '../../constants/musicConstants';
import { DEFAULT_MEASURE_WIDTH } from './gridStore';
import { db } from '../db/dexie-client';
import SampleManager from '../samples/sampleManager';
import { audioContextManager } from '../audio/audioContextManager';
import { getAudioEngine } from '../audio-engine/AudioEngine';

export interface StoreInterface {
  projectManager: ProjectManager;
  initializeAudio(): Promise<void>;
  getInstrumentManager(): InstrumentManager;
  getMidiManager(): MidiManager;
  connectTrackToSoundfont(trackId: string, instrumentId: string): Promise<void>;
  connectTrackToSampler(trackId: string, baseMidiNote?: number): Promise<void>;
}

export class Store implements StoreInterface {
  public projectManager: ProjectManager;
  private initialized: boolean = false;
  private midiManager: MidiManager;
  private instrumentManager: InstrumentManager;
  private sampleManager: SampleManager;

  constructor() {
    this.projectManager = new ProjectManager();
    this.midiManager = new MidiManager();
    this.instrumentManager = new InstrumentManager();
    this.sampleManager = SampleManager.getInstance(db);
  }

  public async initializeAudio(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize new AudioEngine
      const audioEngine = getAudioEngine();
      await audioEngine.initialize();

      // Initialize the centralized AudioContextManager
      await audioContextManager.initialize();
      console.log('Store: AudioContextManager initialized successfully');

      this.initialized = true;
    } catch (error) {
      console.error('Store: Audio initialization failed:', error);
      throw error;
    }
  }

  public getInstrumentManager(): InstrumentManager {
    return this.instrumentManager;
  }

  public getMidiManager(): MidiManager {
    return this.midiManager;
  }

  /**
   * Helper method to load soundfont data
   */
  private async loadSoundfontData(instrumentId: string): Promise<ArrayBuffer> {
    const { default: SoundfontManager } = await import('../soundfont/soundfontManager');
    const soundfontManager = SoundfontManager.getInstance(db);
    const result = await soundfontManager.getSoundfont(instrumentId);
    return result.data;
  }
  
  /**
   * Connect a MIDI track to a soundfont instrument
   * Loads the soundfont into the new AudioEngine and ensures track exists in MidiManager
   * @param trackId The track ID to connect
   * @param instrumentId The instrument ID for the soundfont
   */
  public async connectTrackToSoundfont(
    trackId: string,
    instrumentId: string
  ): Promise<void> {
    if (!this.initialized) {
      console.error(`Store not initialized when connecting track ${trackId} to soundfont ${instrumentId}`);
      throw new Error(`Store must be initialized before connecting tracks to soundfonts. TrackId: ${trackId}, InstrumentId: ${instrumentId}`);
    }

    try {
      console.log(`Store: Connecting track ${trackId} to soundfont ${instrumentId}`);

      // Load soundfont into new AudioEngine
      const audioEngine = getAudioEngine();
      if (!audioEngine.hasSoundfont(instrumentId)) {
        const soundfontData = await this.loadSoundfontData(instrumentId);
        await audioEngine.loadSoundfont(instrumentId, soundfontData);
        console.log(`Store: Loaded soundfont ${instrumentId} into AudioEngine`);
      }

      // Ensure track exists in MidiManager
      if (!this.midiManager.hasTrack(trackId)) {
        this.midiManager.createTrack(trackId, instrumentId);
        console.log(`Store: Created track ${trackId} in MidiManager`);
      }

      console.log(`Store: Successfully connected track ${trackId} to soundfont ${instrumentId}`);
    } catch (error) {
      console.error(`Store: Failed to connect track ${trackId} to soundfont ${instrumentId}:`, error);
      throw error;
    }
  }

  /**
   * Connect a track to a sampler
   * Ensures track exists in MidiManager (audio buffer loaded by config.ts initEngine)
   * @param trackId The track ID to connect
   * @param baseMidiNote The MIDI note that represents the sample's original pitch
   */
  public async connectTrackToSampler(
    trackId: string,
    baseMidiNote?: number
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error('Store must be initialized before connecting tracks to samplers');
    }

    try {
      console.log(`Store: Connecting track ${trackId} to sampler with baseMidiNote ${baseMidiNote}`);

      // Ensure track exists in MidiManager
      if (!this.midiManager.hasTrack(trackId)) {
        this.midiManager.createTrack(trackId, 'sampler');
        console.log(`Store: Created track ${trackId} in MidiManager for sampler`);
      }

      console.log(`Store: Successfully connected track ${trackId} to sampler`);
    } catch (error) {
      console.error(`Store: Failed to connect track ${trackId} to sampler:`, error);
      throw error;
    }
  }

  public getProjectManager(): ProjectManager {
    return this.projectManager;
  }

  /**
   * Gets the ticks per pixel conversion rate based on current BPM and grid settings
   * Used for converting between pixel measurements and musical time
   * @returns Number of ticks per pixel at current settings
   */
  public getTicksPerPixel(): number {
    const bpm = this.projectManager.getTempo();
    const [beatsPerMeasure] = this.projectManager.getTimeSignature();
    
    // Standard MIDI ticks per beat (quarter note) is typically 480 or 960
    // We'll use 480 as it's common for DAWs
    const TICKS_PER_BEAT = MUSIC_CONSTANTS.pulsesPerQuarterNote;
    
    // Calculate measure width in pixels from grid constants
    const MEASURE_WIDTH = DEFAULT_MEASURE_WIDTH; // Matches GRID_CONSTANTS.measureWidth
    
    // Calculate beats per measure from time signature
    const beatWidth = MEASURE_WIDTH / beatsPerMeasure;
    
    // Calculate ticks per beat
    const ticksPerBeat = TICKS_PER_BEAT;
    
    // Calculate ticks per pixel
    const ticksPerPixel = ticksPerBeat / beatWidth;
    
    return ticksPerPixel;
  }

  /**
   * Gets the pixels per tick conversion rate based on current BPM and grid settings
   * Inverse of getTicksPerPixel() - used for converting from ticks to pixel measurements
   * @returns Number of pixels per tick at current settings
   */
  public getPixelsPerTick(): number {
    const ticksPerPixel = this.getTicksPerPixel();
    // Return the inverse of ticks per pixel
    return 1 / ticksPerPixel;
  }

  // Add getter for SampleManager
  public getSampleManager(): SampleManager {
    return this.sampleManager;
  }
}
