import { MidiManager, ZustandStoreAccessor } from '../midi/MidiManagerNew';
import { InstrumentManager } from '../instruments/InstrumentManager';
import { db } from '../db/dexie-client';
import SampleManager from '../samples/sampleManager';
import { audioContextManager } from '../audio/audioContextManager';
import { getAudioEngine } from '../audio-engine/AudioEngine';

export interface StoreInterface {
  initializeAudio(): Promise<void>;
  getInstrumentManager(): InstrumentManager;
  getMidiManager(): MidiManager;
  connectTrackToSoundfont(trackId: string, instrumentId: string): Promise<void>;
  connectTrackToSampler(trackId: string, baseMidiNote?: number): Promise<void>;
  connectMidiManagerToZustand(accessor: ZustandStoreAccessor): void;
}

export class Store implements StoreInterface {
  private initialized: boolean = false;
  private midiManager: MidiManager;
  private instrumentManager: InstrumentManager;
  private sampleManager: SampleManager;

  constructor() {
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

  // Add getter for SampleManager
  public getSampleManager(): SampleManager {
    return this.sampleManager;
  }

  /**
   * Connect the MidiManager to a Zustand store accessor
   * This enables the MidiManager to read/write notes from Zustand state
   * instead of its internal Map, enabling unified state management.
   * @param accessor The Zustand store accessor with note management methods
   */
  public connectMidiManagerToZustand(accessor: ZustandStoreAccessor): void {
    this.midiManager.setStoreAccessor(accessor);
    console.log('Store: MidiManager connected to Zustand store');
  }
}
