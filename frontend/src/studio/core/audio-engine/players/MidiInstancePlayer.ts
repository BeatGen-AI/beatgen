import { TrackInstance } from '../../../../platform/types/project';
import { 
  UnifiedTrackPlayer, 
  TrackPlayerConfig, 
  InstancePlaybackState 
} from '../unified/UnifiedTrackPlayer';
import { EnhancedMidiPlayer } from '../midiSoundfontPlayer/EnhancedMidiPlayer';
import { Note } from '../../../../types/note';
import { TimingCalculator } from '../timing/TimingCalculator';
import { audioContextManager } from '../../audio/audioContextManager';

/**
 * MIDI track player that manages multiple sequencer instances.
 * Each track instance gets its own sequencer for independent playback.
 */
export class MidiInstancePlayer implements UnifiedTrackPlayer {
  private config: TrackPlayerConfig;
  private midiPlayer: EnhancedMidiPlayer | null = null;
  private instanceStates: Map<string, InstancePlaybackState> = new Map();
  private soundfontData: ArrayBuffer | null = null;
  private notes: Note[] = []; // Master note list for the track
  private currentBpm: number = 120;
  
  constructor(config: TrackPlayerConfig) {
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    console.log(`[MidiInstancePlayer] Initializing for track ${this.config.trackId}`);
    
    // Initialize the enhanced MIDI player
    if (!this.midiPlayer) {
      this.midiPlayer = new EnhancedMidiPlayer(this.currentBpm);
      
      // Get the audio context
      const audioContext = audioContextManager.getContext();
      if (audioContext) {
        await this.midiPlayer.initialize(audioContext);
      } else {
        console.warn('[MidiInstancePlayer] No audio context available yet');
      }
    }
  }
  
  /**
   * Set the MIDI notes for this track
   * @param notes Array of notes
   */
  setNotes(notes: Note[]): void {
    this.notes = notes;
    console.log(`[MidiInstancePlayer] Set ${notes.length} notes for track ${this.config.trackId}`);
  }
  
  /**
   * Load soundfont data
   * @param soundfontData The soundfont ArrayBuffer
   */
  async loadSoundfont(soundfontData: ArrayBuffer): Promise<void> {
    this.soundfontData = soundfontData;
    console.log(`[MidiInstancePlayer] Loaded soundfont for track ${this.config.trackId}`);
  }
  
  /**
   * Set the BPM for timing calculations
   * @param bpm The beats per minute
   */
  setBpm(bpm: number): void {
    this.currentBpm = bpm;
    if (this.midiPlayer) {
      this.midiPlayer.setBpm(bpm);
    }
  }
  
  /**
   * Get notes for a specific instance, adjusted for trim and position
   */
  private getInstanceNotes(instance: TrackInstance): Note[] {
    // Filter notes based on trim window
    const trimStartTicks = instance.trim_start_ticks;
    const trimEndTicks = instance.trim_end_ticks;
    
    return this.notes.filter(note => {
      const noteStart = note.column;
      const noteEnd = note.column + note.length;
      
      // Check if note overlaps with trim window
      return noteEnd > trimStartTicks && noteStart < trimEndTicks;
    }).map(note => {
      const noteStart = note.column;
      const noteEnd = note.column + note.length;
      
      // Adjust note position relative to instance
      let adjustedColumn = noteStart - trimStartTicks + instance.x_position;
      let adjustedLength = note.length;
      
      // Clip note if it extends beyond trim boundaries
      if (noteStart < trimStartTicks) {
        const clipAmount = trimStartTicks - noteStart;
        adjustedColumn = instance.x_position; // Start at instance beginning
        adjustedLength -= clipAmount;
      }
      
      if (noteEnd > trimEndTicks) {
        const clipAmount = noteEnd - trimEndTicks;
        adjustedLength -= clipAmount;
      }
      
      return {
        ...note,
        column: adjustedColumn,
        length: adjustedLength
      };
    });
  }
  
  async playInstance(
    instance: TrackInstance, 
    startTimeSeconds: number, 
    offsetSeconds: number
  ): Promise<void> {
    if (!this.midiPlayer || !this.soundfontData) {
      console.warn(`[MidiInstancePlayer] MIDI player or soundfont not loaded for track ${this.config.trackId}`);
      return;
    }
    
    // Get notes for this instance
    const instanceNotes = this.getInstanceNotes(instance);
    
    if (instanceNotes.length === 0) {
      console.log(`[MidiInstancePlayer] No notes to play for instance ${instance.id}`);
      return;
    }
    
    // Create the instance in the enhanced player
    await this.midiPlayer.createInstance(instance.id, instanceNotes, this.soundfontData);
    
    // Apply volume and mute settings
    if (this.config.volume !== undefined) {
      this.midiPlayer.setInstanceVolume(instance.id, this.config.volume);
    }
    if (this.config.muted) {
      this.midiPlayer.muteInstance(instance.id, true);
    }
    
    // Convert offset from seconds to ticks
    const offsetTicks = TimingCalculator.secondsToTicks(offsetSeconds, this.currentBpm);
    
    // Start playback at the correct offset
    await this.midiPlayer.playInstance(instance.id, offsetTicks);
    
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
    
    console.log(`[MidiInstancePlayer] Started instance ${instance.id} with ${instanceNotes.length} notes at offset ${offsetSeconds}s (${offsetTicks} ticks)`);
  }
  
  async stopInstance(instanceId: string): Promise<void> {
    if (this.midiPlayer) {
      this.midiPlayer.stopInstance(instanceId);
      await this.midiPlayer.removeInstance(instanceId);
    }
    
    this.instanceStates.delete(instanceId);
    console.log(`[MidiInstancePlayer] Stopped instance ${instanceId}`);
  }
  
  async stopAllInstances(): Promise<void> {
    if (this.midiPlayer) {
      const instanceIds = this.midiPlayer.getActiveInstanceIds();
      for (const instanceId of instanceIds) {
        await this.stopInstance(instanceId);
      }
    }
    
    this.instanceStates.clear();
  }
  
  async pauseInstance(instanceId: string): Promise<void> {
    const state = this.instanceStates.get(instanceId);
    
    if (state && this.midiPlayer) {
      this.midiPlayer.pauseInstance(instanceId);
      state.isPaused = true;
      state.isPlaying = false;
      console.log(`[MidiInstancePlayer] Paused instance ${instanceId}`);
    }
  }
  
  async pauseAllInstances(): Promise<void> {
    if (this.midiPlayer) {
      const instanceIds = this.midiPlayer.getActiveInstanceIds();
      for (const instanceId of instanceIds) {
        await this.pauseInstance(instanceId);
      }
    }
  }
  
  async seekInstance(instanceId: string, positionSeconds: number): Promise<void> {
    const state = this.instanceStates.get(instanceId);
    
    if (state && this.midiPlayer) {
      // Convert to ticks
      const positionTicks = TimingCalculator.secondsToTicks(positionSeconds, this.currentBpm);
      
      // Seek to new position
      this.midiPlayer.seekInstance(instanceId, positionTicks);
      state.currentPosition = positionSeconds;
      console.log(`[MidiInstancePlayer] Seeked instance ${instanceId} to ${positionSeconds}s`);
    }
  }
  
  async setInstanceVolume(instanceId: string, volume: number): Promise<void> {
    const state = this.instanceStates.get(instanceId);
    
    if (state && this.midiPlayer) {
      this.midiPlayer.setInstanceVolume(instanceId, volume);
      state.volume = volume;
      console.log(`[MidiInstancePlayer] Set instance ${instanceId} volume to ${volume}`);
    }
  }
  
  async setInstancePan(instanceId: string, pan: number): Promise<void> {
    const state = this.instanceStates.get(instanceId);
    
    if (state) {
      // TODO: Implement pan in enhanced player if supported
      state.pan = pan;
      console.log(`[MidiInstancePlayer] Set instance ${instanceId} pan to ${pan}`);
    }
  }
  
  async setInstanceMute(instanceId: string, muted: boolean): Promise<void> {
    const state = this.instanceStates.get(instanceId);
    
    if (state && this.midiPlayer) {
      this.midiPlayer.muteInstance(instanceId, muted);
      state.muted = muted;
      console.log(`[MidiInstancePlayer] Set instance ${instanceId} mute to ${muted}`);
    }
  }
  
  getActiveInstanceIds(): string[] {
    return this.midiPlayer?.getActiveInstanceIds() || [];
  }
  
  isInstancePlaying(instanceId: string): boolean {
    return this.midiPlayer?.isInstancePlaying(instanceId) || false;
  }
  
  async disposeInstance(instanceId: string): Promise<void> {
    await this.stopInstance(instanceId);
  }
  
  async dispose(): Promise<void> {
    await this.stopAllInstances();
    
    if (this.midiPlayer) {
      this.midiPlayer.dispose();
      this.midiPlayer = null;
    }
    
    this.soundfontData = null;
    
    console.log(`[MidiInstancePlayer] Disposed track ${this.config.trackId}`);
  }
}