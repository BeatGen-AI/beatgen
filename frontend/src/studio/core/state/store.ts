import { ProjectManager } from './project';
import { MidiManager } from '../midi/MidiManagerNew';
import { InstrumentManager } from '../instruments/InstrumentManager';
import * as Tone from 'tone';
import { MUSIC_CONSTANTS } from '../../constants/musicConstants';
import { DEFAULT_MEASURE_WIDTH } from './gridStore';
import { db } from '../db/dexie-client';
import SampleManager from '../samples/sampleManager';
import { audioContextManager } from '../audio/audioContextManager';
import { getAudioEngine } from '../audio-engine/AudioEngine';
/**
 * Interface for a drum pad in the drum machine grid
 */
interface DrumPad {
  row: number;    // Row position (which drum sound)
  column: number; // Column position (which beat)
  velocity: number; // Velocity/volume (0-127)
}

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
  // Map to store runtime data associated with track IDs
  private runtimeTrackData: Map<string, { channel: Tone.Channel; player?: Tone.Player }> = new Map();

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
      // Initialize runtime data for existing tracks if a project is loaded
      this.initializeRuntimeTrackData();
    } catch (error) {
      console.error('Store: Audio initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize runtime data (like Tone.Channel) for tracks already present
   * in the ProjectManager when the store initializes.
   */
  private initializeRuntimeTrackData(): void {
    const project = this.projectManager.getCurrentProject();
    if (!project) return;

    console.log('Initializing runtime data for existing tracks...');
    project.tracks.forEach(track => {
      if (!this.runtimeTrackData.has(track.id)) {
        //this.createRuntimeTrackData(track.id);
      }
    });
    console.log(`Runtime data initialized for ${this.runtimeTrackData.size} tracks.`);
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

  // Removed addListener, removeListener, _notifyListeners

  /**
   * Gets the persistent track data with the specified ID from ProjectManager.
   */
  // public getTrackDataById(trackId: string): CombinedTrack | undefined {
  //   return this.projectManager.getTrackById(trackId);
  // }

  /**
   * Gets the runtime data (e.g., Tone.Channel) for the specified track ID.
   */
  public getRuntimeTrackDataById(trackId: string): { channel: Tone.Channel; player?: Tone.Player; } | undefined {
    return this.runtimeTrackData.get(trackId);
  }

  /**
   * Gets the current drum pad state for a track by querying MidiManager.
   */
  // public getDrumPads(trackId: string): DrumPad[] {
  //   const track = this.projectManager.getTrackById(trackId);
  //   if (!track || track.type !== 'drum') {
  //     // console.warn(`Cannot get drum pads: Track ${trackId} not found or not a drum track`);
  //     return [];
  //   }

  //   const notes = this.midiManager.getTrackNotes(trackId);
  //   if (!notes) {
  //     // Track might exist in ProjectManager but not yet fully initialized in MidiManager
  //     // Or an error occurred fetching notes. MidiManager logs errors internally.
  //     return [];
  //   }

  //   // Map MIDI notes to DrumPad objects
  //   // Assuming row = pitch, column = time position
  //   return notes.map(note => ({
  //     row: note.row,
  //     column: note.column,
  //     velocity: note.velocity ?? 100 // Use note velocity or default
  //   }));
  // }

  /**
   * Toggles a drum pad on/off by adding or removing the corresponding MIDI note
   * via the MidiManager and HistoryManager.
   */
  // public async toggleDrumPad(trackId: string, column: number, row: number): Promise<void> {
  //   console.log(`Store.toggleDrumPad called for track ${trackId}, column ${column}, row ${row}`);

  //   const track = this.projectManager.getTrackById(trackId);
  //   if (!track || track.type !== 'drum') {
  //     console.warn(`Cannot toggle drum pad: Track ${trackId} not found or not a drum track`);
  //     return;
  //   }

  //   // Get current notes for the track from the source of truth
  //   const notes = this.midiManager.getTrackNotes(trackId);
  //   if (notes === null) {
  //     console.error(`Cannot toggle drum pad: Failed to get notes for track ${trackId}`);
  //     return;
  //   }

  //   // Find if a note already exists at this position (row = pitch, column = time)
  //   const existingNote = notes.find(note => note.column === column && note.row === row);

  //   // Use the proper action names from NoteActions
  //   const { AddNote, DeleteNote } = NoteActions;

  //   if (existingNote) {
  //     // Note exists - create and execute a DeleteNote action
  //     console.log(`Drum pad exists at [${column}, ${row}], removing note ID: ${existingNote.id}`);
  //     const deleteAction = new DeleteNote(
  //       this, // Pass the store instance
  //       trackId,
  //       String(existingNote.id), // Action expects string ID
  //       existingNote // Pass the full note object for undo
  //     );
  //     await historyManager.executeAction(deleteAction);

  //   } else {
  //     // Note does not exist - create and execute an AddNote action
  //     console.log(`Drum pad does not exist at [${column}, ${row}], adding note.`);

  //     // Create a new note object
  //     // WARNING: Using Date.now() for ID is not robust for rapid clicks.
  //     // Consider a more reliable ID generation strategy if needed.
  //     const newNoteId = Date.now();
  //     const newNote: Note = {
  //       id: newNoteId,
  //       row: row,         // Pitch
  //       column: column,   // Time position
  //       length: 1,        // Default length (e.g., 1 grid unit for drums)
  //       velocity: 100,    // Default velocity
  //       trackId: trackId
  //     };

  //     const addAction = new AddNote(
  //       this, // Pass the store instance
  //       trackId,
  //       String(newNoteId), // Action expects string ID
  //       newNote
  //     );
  //     await historyManager.executeAction(addAction);
  //   }
  // }

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
