import * as Tone from 'tone';
import { TrackInstance } from '../../../../platform/types/project';
import { 
  UnifiedTrackPlayer, 
  TrackPlayerConfig, 
  InstancePlaybackState 
} from '../unified/UnifiedTrackPlayer';
import MidiSampler from '../midiSamplePlayer/sampler';
import { Note } from '../../../../types/note';
import { TimingCalculator } from '../timing/TimingCalculator';
import { convertVolumeToDecibels } from '../../../utils/audioProcessing';

/**
 * Sampler track player that manages multiple sampler instances.
 * Each track instance gets its own sampler for independent playback.
 */
export class SamplerInstancePlayer implements UnifiedTrackPlayer {
  private config: TrackPlayerConfig;
  private audioFile: File | null = null;
  private instanceSamplers: Map<string, MidiSampler> = new Map();
  private instanceStates: Map<string, InstancePlaybackState> = new Map();
  private notes: Note[] = []; // Master note list for the track
  private baseMidiNote: number = 60; // Middle C
  private grainSize: number = 0.1; // 100ms
  private overlap: number = 0.1; // 10% overlap
  private currentBpm: number = 120;
  
  constructor(config: TrackPlayerConfig) {
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    console.log(`[SamplerInstancePlayer] Initializing for track ${this.config.trackId}`);
  }
  
  /**
   * Load audio file for sampling
   * @param file The audio file to use as sample source
   */
  async loadAudioFile(file: File): Promise<void> {
    this.audioFile = file;
    console.log(`[SamplerInstancePlayer] Loaded audio file for track ${this.config.trackId}`);
  }
  
  /**
   * Set the MIDI notes for this track
   * @param notes Array of notes
   */
  setNotes(notes: Note[]): void {
    this.notes = notes;
    console.log(`[SamplerInstancePlayer] Set ${notes.length} notes for track ${this.config.trackId}`);
  }
  
  /**
   * Set sampler parameters
   */
  setBaseMidiNote(note: number): void {
    this.baseMidiNote = note;
  }
  
  setGrainSize(size: number): void {
    this.grainSize = size;
  }
  
  setOverlap(overlap: number): void {
    this.overlap = overlap;
  }
  
  setBpm(bpm: number): void {
    this.currentBpm = bpm;
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
    if (!this.audioFile) {
      console.warn(`[SamplerInstancePlayer] No audio file loaded for track ${this.config.trackId}`);
      return;
    }
    
    // Stop any existing sampler for this instance
    await this.stopInstance(instance.id);
    
    // Create a new sampler for this instance
    const sampler = new MidiSampler(
      (message) => console.log(`[Sampler ${instance.id}] ${message}`),
      (isPlaying) => {
        const state = this.instanceStates.get(instance.id);
        if (state) {
          state.isPlaying = isPlaying;
        }
      }
    );
    
    // Initialize and configure the sampler
    await sampler.initialize();
    await sampler.loadAudioFile(this.audioFile, this.grainSize, this.overlap);
    sampler.setBaseNote(this.baseMidiNote);
    
    // Get notes for this instance
    const instanceNotes = this.getInstanceNotes(instance);
    sampler.setNotes(instanceNotes);
    
    // Apply volume and mute settings
    if (this.config.volume !== undefined) {
      sampler.setVolume(this.config.volume);
    }
    if (this.config.muted) {
      sampler.setMute(true);
    }
    
    // Store the sampler
    this.instanceSamplers.set(instance.id, sampler);
    
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
    
    // Start playback
    // The sampler's playMidi method expects BPM and start time
    sampler.playMidi(this.currentBpm, offsetSeconds);
    
    console.log(`[SamplerInstancePlayer] Started instance ${instance.id} with ${instanceNotes.length} notes at offset ${offsetSeconds}s`);
  }
  
  async stopInstance(instanceId: string): Promise<void> {
    const sampler = this.instanceSamplers.get(instanceId);
    if (sampler) {
      sampler.stopPlayback();
      sampler.dispose();
      this.instanceSamplers.delete(instanceId);
      this.instanceStates.delete(instanceId);
      console.log(`[SamplerInstancePlayer] Stopped instance ${instanceId}`);
    }
  }
  
  async stopAllInstances(): Promise<void> {
    const instanceIds = Array.from(this.instanceSamplers.keys());
    for (const instanceId of instanceIds) {
      await this.stopInstance(instanceId);
    }
  }
  
  async pauseInstance(instanceId: string): Promise<void> {
    const sampler = this.instanceSamplers.get(instanceId);
    const state = this.instanceStates.get(instanceId);
    
    if (sampler && state) {
      sampler.stopPlayback(); // Sampler doesn't have pause, so we stop
      state.isPaused = true;
      state.isPlaying = false;
      console.log(`[SamplerInstancePlayer] Paused instance ${instanceId}`);
    }
  }
  
  async pauseAllInstances(): Promise<void> {
    const instanceIds = Array.from(this.instanceSamplers.keys());
    for (const instanceId of instanceIds) {
      await this.pauseInstance(instanceId);
    }
  }
  
  async seekInstance(instanceId: string, positionSeconds: number): Promise<void> {
    const sampler = this.instanceSamplers.get(instanceId);
    const state = this.instanceStates.get(instanceId);
    
    if (sampler && state) {
      // Stop current playback
      sampler.stopPlayback();
      
      // Restart at new position
      sampler.playMidi(this.currentBpm, positionSeconds);
      
      state.currentPosition = positionSeconds;
      console.log(`[SamplerInstancePlayer] Seeked instance ${instanceId} to ${positionSeconds}s`);
    }
  }
  
  async setInstanceVolume(instanceId: string, volume: number): Promise<void> {
    const sampler = this.instanceSamplers.get(instanceId);
    const state = this.instanceStates.get(instanceId);
    
    if (sampler && state) {
      sampler.setVolume(volume);
      state.volume = volume;
      console.log(`[SamplerInstancePlayer] Set instance ${instanceId} volume to ${volume}`);
    }
  }
  
  async setInstancePan(instanceId: string, pan: number): Promise<void> {
    const state = this.instanceStates.get(instanceId);
    
    if (state) {
      // TODO: Implement pan in sampler if supported
      state.pan = pan;
      console.log(`[SamplerInstancePlayer] Set instance ${instanceId} pan to ${pan}`);
    }
  }
  
  async setInstanceMute(instanceId: string, muted: boolean): Promise<void> {
    const sampler = this.instanceSamplers.get(instanceId);
    const state = this.instanceStates.get(instanceId);
    
    if (sampler && state) {
      sampler.setMute(muted);
      state.muted = muted;
      console.log(`[SamplerInstancePlayer] Set instance ${instanceId} mute to ${muted}`);
    }
  }
  
  getActiveInstanceIds(): string[] {
    return Array.from(this.instanceSamplers.keys());
  }
  
  isInstancePlaying(instanceId: string): boolean {
    const state = this.instanceStates.get(instanceId);
    return state?.isPlaying || false;
  }
  
  async disposeInstance(instanceId: string): Promise<void> {
    await this.stopInstance(instanceId);
  }
  
  async dispose(): Promise<void> {
    await this.stopAllInstances();
    
    this.audioFile = null;
    
    console.log(`[SamplerInstancePlayer] Disposed track ${this.config.trackId}`);
  }
}