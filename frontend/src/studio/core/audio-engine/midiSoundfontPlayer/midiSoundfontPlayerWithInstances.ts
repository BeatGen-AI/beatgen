import { AudioWorkletNodeSynthesizer } from 'js-synthesizer';
import { SequencerWrapper } from './sequencerWrapper';
import { Note } from '../../../../types/note';
import { TrackInstance } from '../../../../platform/types/dto/project_track';
import { MUSIC_CONSTANTS } from '../../../constants/musicConstants';

/**
 * Options for adding a track instance
 */
export interface InstanceOptions {
  /** Instance position in ticks */
  x_position: number;
  /** Trim start in ticks */
  trim_start_ticks?: number;
  /** Trim end in ticks */
  trim_end_ticks?: number;
  /** Initial volume (0-127) */
  volume?: number;
}

/**
 * Track data for MIDI tracks
 */
interface MidiTrackData {
  trackId: string;
  notes: Note[];
  soundfontData: ArrayBuffer;
  sfontId?: number;
  instrumentId: string;
}

/**
 * Instance data for MIDI instances
 */
interface MidiInstance {
  instanceId: string;
  trackId: string;
  sequencer: SequencerWrapper;
  x_position: number;
  trim_start_ticks?: number;
  trim_end_ticks?: number;
}

/**
 * MIDI Soundfont Player with instance support
 */
export class MidiSoundfontPlayerWithInstances {
  private synth: AudioWorkletNodeSynthesizer;
  
  // Track data storage (shared across instances)
  private tracks: Map<string, MidiTrackData> = new Map();
  
  // Instance storage
  private instances: Map<string, MidiInstance> = new Map();
  
  // Track which instances belong to which track
  private trackInstances: Map<string, Set<string>> = new Map();
  
  // Channel allocation
  private usedChannels: Set<number> = new Set();
  
  private isPlaying: boolean = false;
  private masterTick: number = 0;
  private bpm: number = 120;
  private initPromise: Promise<void> | null = null;
  private audioNode: AudioWorkletNode | null = null;

  constructor(bpm: number = 120) {
    this.synth = new AudioWorkletNodeSynthesizer();
    this.bpm = bpm;
  }

  /**
   * Initialize the synthesizer
   */
  async initSynthesizer(audioContext: AudioContext): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = new Promise<void>((resolve, reject) => {
      const initialize = async () => {
        try {
          console.log('Initializing MidiSoundfontPlayerWithInstances...');
          await audioContext.audioWorklet.addModule('/js-synthesizer/libfluidsynth-2.3.0.js');
          await audioContext.audioWorklet.addModule('/js-synthesizer/js-synthesizer.worklet.js');
          
          this.audioNode = this.synth.createAudioNode(audioContext, {
            polyphony: 256
          });
          
          this.audioNode.connect(audioContext.destination);
          
          console.log('MidiSoundfontPlayerWithInstances initialized successfully');
          resolve();
        } catch (error) {
          console.error('Failed to initialize MidiSoundfontPlayerWithInstances:', error);
          this.initPromise = null;
          reject(error);
        }
      };
      
      initialize();
    });
    
    return this.initPromise;
  }

  /**
   * Add or update track data (notes and soundfont)
   */
  async addTrackData(
    trackId: string,
    notes: Note[],
    soundfontData: ArrayBuffer,
    instrumentId: string
  ): Promise<void> {
    await this.waitForInitialization();
    
    let trackData = this.tracks.get(trackId);
    
    if (!trackData) {
      // Load soundfont if new track
      console.log(`Loading soundfont for track "${trackId}"...`);
      const sfontId = await this.synth.loadSFont(soundfontData);
      
      trackData = {
        trackId,
        notes,
        soundfontData,
        sfontId,
        instrumentId
      };
      
      this.tracks.set(trackId, trackData);
      this.trackInstances.set(trackId, new Set());
      
      console.log(`Track data added for "${trackId}" with soundfont ID ${sfontId}`);
    } else {
      // Update existing track data
      trackData.notes = notes;
      console.log(`Track data updated for "${trackId}"`);
    }
  }

  /**
   * Add an instance of a track
   */
  async addInstance(
    trackId: string,
    instanceId: string,
    options: InstanceOptions
  ): Promise<void> {
    const trackData = this.tracks.get(trackId);
    if (!trackData || !trackData.sfontId) {
      throw new Error(`Track ${trackId} not found or soundfont not loaded`);
    }
    
    // Remove existing instance if it exists
    this.removeInstance(instanceId);
    
    // Find a free channel
    const channel = this.findFreeChannel();
    
    // Calculate offset in ticks
    const offsetTicks = options.x_position;
    
    // Get notes to use (apply trim if needed)
    let notesToUse = trackData.notes;
    if (options.trim_start_ticks !== undefined || options.trim_end_ticks !== undefined) {
      notesToUse = this.applyTrimToNotes(
        trackData.notes,
        options.trim_start_ticks || 0,
        options.trim_end_ticks || Infinity
      );
    }
    
    // Create sequencer for this instance
    const sequencer = new SequencerWrapper(
      this.synth,
      trackData.sfontId,
      channel,
      offsetTicks,
      options.volume || 100
    );
    
    await sequencer.initialize(notesToUse);
    
    // Store instance
    const instance: MidiInstance = {
      instanceId,
      trackId,
      sequencer,
      x_position: options.x_position,
      trim_start_ticks: options.trim_start_ticks,
      trim_end_ticks: options.trim_end_ticks
    };
    
    this.instances.set(instanceId, instance);
    
    // Track instance-track relationship
    const trackInstanceSet = this.trackInstances.get(trackId);
    if (trackInstanceSet) {
      trackInstanceSet.add(instanceId);
    }
    
    // Mark channel as used
    this.usedChannels.add(channel);
    
    console.log(`Instance "${instanceId}" added for track "${trackId}" on channel ${channel}`);
  }

  /**
   * Remove an instance
   */
  removeInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    // Free the channel
    const channel = instance.sequencer.getChannel;
    this.usedChannels.delete(channel);
    
    // Dispose sequencer
    instance.sequencer.dispose();
    
    // Remove from maps
    this.instances.delete(instanceId);
    
    const trackInstanceSet = this.trackInstances.get(instance.trackId);
    if (trackInstanceSet) {
      trackInstanceSet.delete(instanceId);
    }
    
    console.log(`Instance "${instanceId}" removed`);
  }

  /**
   * Remove all instances of a track
   */
  removeTrackInstances(trackId: string): void {
    const instanceIds = this.trackInstances.get(trackId);
    if (!instanceIds) return;
    
    instanceIds.forEach(instanceId => {
      this.removeInstance(instanceId);
    });
    
    this.trackInstances.delete(trackId);
  }

  /**
   * Remove track data and all its instances
   */
  removeTrack(trackId: string): void {
    this.removeTrackInstances(trackId);
    this.tracks.delete(trackId);
    console.log(`Track "${trackId}" and all its instances removed`);
  }

  /**
   * Apply trim to notes
   */
  private applyTrimToNotes(
    notes: Note[],
    trimStartTicks: number,
    trimEndTicks: number
  ): Note[] {
    return notes.filter(note => {
      const noteStart = note.column;
      const noteEnd = note.column + note.length;
      
      // Note must start within trim bounds
      return noteStart >= trimStartTicks && noteStart < trimEndTicks;
    }).map(note => {
      // Adjust note position relative to trim start
      return {
        ...note,
        column: note.column - trimStartTicks
      };
    });
  }

  /**
   * Find a free MIDI channel
   */
  private findFreeChannel(): number {
    for (let i = 0; i < 16; i++) {
      if (i !== 9 && !this.usedChannels.has(i)) {
        return i;
      }
    }
    
    // If all channels are used, reuse channel 1
    console.warn('All non-drum MIDI channels are in use, reusing channel 1');
    return 1;
  }

  /**
   * Convert ticks to milliseconds
   */
  private ticksToMs(ticks: number): number {
    const ticksPerSecond = (this.bpm * MUSIC_CONSTANTS.pulsesPerQuarterNote) / 60;
    return (ticks / ticksPerSecond) * 1000;
  }

  /**
   * Start or resume playback
   */
  async play(): Promise<void> {
    if (this.isPlaying) return;
    
    console.log(`Starting playback from tick ${this.masterTick}`);
    
    // Start each instance
    const playPromises = Array.from(this.instances.entries()).map(async ([id, instance]) => {
      console.log(`Starting instance "${id}" for playback`);
      await instance.sequencer.play(this.masterTick);
    });
    
    await Promise.all(playPromises);
    
    this.isPlaying = true;
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.isPlaying) return;
    
    console.log('Pausing playback');
    
    // Pause all instances
    this.instances.forEach(instance => {
      instance.sequencer.pause();
    });
    
    this.isPlaying = false;
  }

  /**
   * Stop playback and reset position
   */
  async stop(): Promise<void> {
    console.log('Stopping playback and resetting position');
    
    // Stop each instance
    const stopPromises = Array.from(this.instances.values()).map(instance => 
      instance.sequencer.stop()
    );
    
    await Promise.all(stopPromises);
    
    this.isPlaying = false;
    this.masterTick = 0;
  }

  /**
   * Seek to a specific position
   */
  async seek(globalTimeMs: number): Promise<void> {
    console.log(`Seeking to ${globalTimeMs}ms`);
    
    const wasPlaying = this.isPlaying;
    
    if (wasPlaying) {
      this.pause();
    }
    
    this.masterTick = globalTimeMs;
    
    // Seek each instance
    const seekPromises = Array.from(this.instances.entries()).map(async ([id, instance]) => {
      console.log(`Seeking instance "${id}" to ${globalTimeMs}ms`);
      return instance.sequencer.seekToGlobalTime(globalTimeMs);
    });
    
    await Promise.all(seekPromises);
    
    if (wasPlaying) {
      this.play();
    }
  }

  /**
   * Set volume for an instance
   */
  setInstanceVolume(instanceId: string, volume: number): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.sequencer.setVolume(volume);
    }
  }

  /**
   * Mute/unmute an instance
   */
  muteInstance(instanceId: string, muted: boolean): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      if (muted) {
        instance.sequencer.mute();
      } else {
        instance.sequencer.unmute();
      }
    }
  }

  /**
   * Set global BPM
   */
  async setGlobalBPM(bpm: number): Promise<void> {
    if (bpm <= 0) {
      console.warn(`Invalid BPM value: ${bpm}, ignoring`);
      return;
    }
    
    console.log(`Setting global BPM to ${bpm}`);
    this.bpm = bpm;
    
    // Update all instances
    const promises = Array.from(this.instances.values()).map(instance =>
      instance.sequencer.setBPM(bpm)
    );
    
    await Promise.all(promises);
  }

  /**
   * Get all instance IDs for a track
   */
  getTrackInstanceIds(trackId: string): string[] {
    const instanceSet = this.trackInstances.get(trackId);
    return instanceSet ? Array.from(instanceSet) : [];
  }

  /**
   * Get all instance IDs
   */
  getAllInstanceIds(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Wait for initialization
   */
  async waitForInitialization(): Promise<void> {
    if (!this.initPromise) {
      throw new Error('Synthesizer initialization not started. Call initSynthesizer() first.');
    }
    return this.initPromise;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    console.log('Disposing MidiSoundfontPlayerWithInstances');
    
    this.pause();
    
    // Disconnect audio node
    if (this.audioNode) {
      try {
        this.audioNode.disconnect();
      } catch (e) {
        console.error("Error disconnecting audio node:", e);
      }
      this.audioNode = null;
    }
    
    // Dispose all instances
    this.instances.forEach(instance => {
      instance.sequencer.dispose();
    });
    
    this.synth.closePlayer();
    this.instances.clear();
    this.tracks.clear();
    this.trackInstances.clear();
    this.usedChannels.clear();
    
    console.log('MidiSoundfontPlayerWithInstances disposed');
  }
}