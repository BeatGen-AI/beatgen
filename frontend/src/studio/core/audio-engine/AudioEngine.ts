/**
 * AudioEngine - The main audio engine class.
 *
 * This engine receives all data via setState(PlaybackState) and has
 * ZERO knowledge of the store. All data transformations happen in
 * buildPlaybackState() before data enters the engine.
 *
 * Phase 1 implements:
 * - Lifecycle management (initialize, dispose)
 * - State management (setState, getState)
 * - Transport controls (play, pause, stop, seek)
 * - Event subscriptions (onTimeUpdate, onStateChange, onError)
 * - Resource management (loadAudioBuffer, etc.)
 *
 * Phase 2 implements:
 * - AudioTrackRenderer for audio track playback (WAV, MP3, etc.)
 *
 * Remaining renderers (MIDI, Sampler) implemented in later phases.
 */

import * as Tone from 'tone';
import {
  PlaybackState,
  AudioEngineConfig,
  DEFAULT_ENGINE_CONFIG,
  EnginePlaybackState,
  Unsubscribe,
} from './types';
import { AudioTrackRenderer } from './renderers/AudioTrackRenderer';
import { MidiTrackRenderer } from './renderers/MidiTrackRenderer';
import { SamplerTrackRenderer } from './renderers/SamplerTrackRenderer';

export class AudioEngine {
  private config: AudioEngineConfig;
  private isInitialized: boolean = false;
  private currentState: PlaybackState | null = null;
  private playbackState: EnginePlaybackState = 'stopped';

  // Main output channel (connects all renderers to destination)
  private mainOutput: Tone.Channel | null = null;

  // Renderers
  private audioRenderer: AudioTrackRenderer | null = null; // Phase 2
  private midiRenderer: MidiTrackRenderer | null = null; // Phase 3
  private samplerRenderer: SamplerTrackRenderer | null = null; // Phase 4

  // Event subscribers
  private timeUpdateCallbacks: Set<(ticks: number, seconds: number) => void> = new Set();
  private stateChangeCallbacks: Set<(state: EnginePlaybackState) => void> = new Set();
  private errorCallbacks: Set<(error: Error, context: string) => void> = new Set();

  // Resource tracking
  private loadedBuffers: Map<string, AudioBuffer> = new Map();
  private loadedSoundfonts: Map<string, number> = new Map();
  private loadedSoundfontData: Map<string, ArrayBuffer> = new Map();

  // Animation frame for time updates
  private animationFrameId: number | null = null;

  constructor() {
    this.config = DEFAULT_ENGINE_CONFIG;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Initialize the audio engine.
   * Must be called after a user gesture (for AudioContext).
   */
  async initialize(config?: Partial<AudioEngineConfig>): Promise<void> {
    if (this.isInitialized) {
      console.warn('AudioEngine: Already initialized');
      return;
    }

    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };

    // Initialize Tone.js - this resumes the AudioContext
    await Tone.start();

    // Configure transport with default BPM (will be updated by setState)
    Tone.getTransport().bpm.value = 120;

    // Create main output channel (connects all renderers to destination)
    this.mainOutput = new Tone.Channel().toDestination();

    // Initialize audio renderer (Phase 2)
    this.audioRenderer = new AudioTrackRenderer(
      this.loadedBuffers,
      this.mainOutput
    );

    // Initialize MIDI renderer (Phase 3)
    this.midiRenderer = new MidiTrackRenderer(this.loadedSoundfontData);
    this.midiRenderer.setErrorCallback((error, context) => {
      this.emitError(error, context);
    });
    await this.midiRenderer.initialize();

    // Initialize sampler renderer (Phase 4)
    this.samplerRenderer = new SamplerTrackRenderer(
      this.loadedBuffers,
      this.mainOutput
    );

    this.isInitialized = true;
    console.log('AudioEngine: Initialized');
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.stop();

    // Clean up renderers
    this.audioRenderer?.dispose();
    this.midiRenderer?.dispose();
    this.samplerRenderer?.dispose();

    // Clean up main output
    this.mainOutput?.dispose();
    this.mainOutput = null;

    // Clean up resources
    this.loadedBuffers.clear();
    this.loadedSoundfonts.clear();
    this.loadedSoundfontData.clear();

    // Clear callbacks
    this.timeUpdateCallbacks.clear();
    this.stateChangeCallbacks.clear();
    this.errorCallbacks.clear();

    this.isInitialized = false;
    console.log('AudioEngine: Disposed');
  }

  /**
   * Check if engine is initialized and ready.
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  /**
   * Set the complete playback state.
   * Engine will diff against previous state and update accordingly.
   *
   * @param state - Complete playback state
   */
  setState(state: PlaybackState): void {
    if (!this.isInitialized) {
      this.emitError(new Error('Engine not initialized'), 'setState');
      return;
    }

    const prevState = this.currentState;
    this.currentState = state;

    // Update transport BPM if changed
    if (!prevState || prevState.bpm !== state.bpm) {
      Tone.getTransport().bpm.value = state.bpm;
    }

    // Route tracks to appropriate renderers
    const audioTracks = state.tracks.filter(t => t.type === 'audio');
    const midiTracks = state.tracks.filter(t => t.type === 'midi');
    const samplerTracks = state.tracks.filter(t => t.type === 'sampler');
    // Drum tracks don't need their own renderer - their child sampler tracks
    // are separate entries in the tracks array

    const prevAudioTracks = prevState?.tracks.filter(t => t.type === 'audio');
    const prevMidiTracks = prevState?.tracks.filter(t => t.type === 'midi');
    const prevSamplerTracks = prevState?.tracks.filter(t => t.type === 'sampler');

    // Update renderers
    this.audioRenderer?.update(audioTracks, prevAudioTracks, state);
    this.midiRenderer?.update(midiTracks, prevMidiTracks, state);
    this.samplerRenderer?.update(samplerTracks, prevSamplerTracks, state);
  }

  /**
   * Get current playback state (for debugging).
   */
  getState(): PlaybackState | null {
    return this.currentState;
  }

  // ============================================================================
  // RESOURCE MANAGEMENT
  // ============================================================================

  /**
   * Load an audio buffer for use by audio/sampler tracks.
   *
   * @param bufferId - Unique identifier for this buffer (typically track ID)
   * @param source - Audio file or ArrayBuffer
   * @returns Promise resolving to buffer duration in seconds
   */
  async loadAudioBuffer(bufferId: string, source: File | ArrayBuffer): Promise<number> {
    const arrayBuffer = source instanceof File
      ? await source.arrayBuffer()
      : source;

    const audioBuffer = await Tone.getContext().decodeAudioData(arrayBuffer);
    this.loadedBuffers.set(bufferId, audioBuffer);

    console.log(`AudioEngine: Loaded buffer ${bufferId} (${audioBuffer.duration.toFixed(2)}s)`);
    return audioBuffer.duration;
  }

  /**
   * Check if an audio buffer is loaded.
   */
  hasAudioBuffer(bufferId: string): boolean {
    return this.loadedBuffers.has(bufferId);
  }

  /**
   * Unload an audio buffer.
   */
  unloadAudioBuffer(bufferId: string): void {
    this.loadedBuffers.delete(bufferId);
  }

  /**
   * Get a loaded audio buffer.
   */
  getAudioBuffer(bufferId: string): AudioBuffer | undefined {
    return this.loadedBuffers.get(bufferId);
  }

  /**
   * Load a soundfont for MIDI playback.
   *
   * @param instrumentId - Unique identifier for this soundfont
   * @param data - Soundfont file data
   * @returns Promise resolving to the soundfont ID in the synthesizer
   */
  async loadSoundfont(instrumentId: string, data: ArrayBuffer): Promise<number> {
    // Store in cache (so MidiTrackRenderer can access it later if needed)
    this.loadedSoundfontData.set(instrumentId, data);

    // If MIDI renderer is initialized, load into synthesizer
    if (this.midiRenderer) {
      const sfontId = await this.midiRenderer.loadSoundfont(instrumentId, data);
      this.loadedSoundfonts.set(instrumentId, sfontId);
      console.log(`AudioEngine: Loaded soundfont ${instrumentId} (sfontId: ${sfontId})`);
      return sfontId;
    }

    // Renderer not ready yet - data is cached for later
    console.log(`AudioEngine: Cached soundfont ${instrumentId} (renderer not ready)`);
    return -1;
  }

  /**
   * Check if a soundfont is loaded (either cached or in synthesizer).
   */
  hasSoundfont(instrumentId: string): boolean {
    return this.loadedSoundfontData.has(instrumentId) || this.loadedSoundfonts.has(instrumentId);
  }

  /**
   * Unload a soundfont from cache.
   * Note: Soundfonts loaded into the synthesizer cannot be unloaded individually.
   */
  unloadSoundfont(instrumentId: string): void {
    this.loadedSoundfonts.delete(instrumentId);
    this.loadedSoundfontData.delete(instrumentId);
  }

  // ============================================================================
  // TRANSPORT CONTROLS
  // ============================================================================

  /**
   * Start or resume playback from current position.
   */
  play(): void {
    if (!this.isInitialized || !this.currentState) {
      this.emitError(new Error('Cannot play: not initialized or no state'), 'play');
      return;
    }

    const positionTicks = Tone.getTransport().ticks;

    // Start renderers
    this.audioRenderer?.play(positionTicks);
    this.midiRenderer?.play(positionTicks);
    this.samplerRenderer?.play(positionTicks);

    // Start transport
    Tone.getTransport().start();

    // Start time update loop
    this.startTimeUpdateLoop();

    this.setPlaybackState('playing');
    console.log('AudioEngine: Playing from tick', positionTicks);
  }

  /**
   * Pause playback at current position.
   */
  pause(): void {
    // Stop time update loop
    this.stopTimeUpdateLoop();

    // Pause transport
    Tone.getTransport().pause();

    // Pause renderers
    this.audioRenderer?.pause();
    this.midiRenderer?.pause();
    this.samplerRenderer?.pause();

    this.setPlaybackState('paused');
    console.log('AudioEngine: Paused at tick', Tone.getTransport().ticks);
  }

  /**
   * Stop playback and reset to beginning.
   */
  stop(): void {
    // Stop time update loop
    this.stopTimeUpdateLoop();

    // Stop transport and reset position
    Tone.getTransport().stop();
    Tone.getTransport().ticks = 0;

    // Stop renderers
    this.audioRenderer?.stop();
    this.midiRenderer?.stop();
    this.samplerRenderer?.stop();

    this.setPlaybackState('stopped');
    console.log('AudioEngine: Stopped');
  }

  /**
   * Seek to a specific position.
   *
   * @param ticks - Position in ticks
   */
  seek(ticks: number): void {
    const isPlaying = this.playbackState === 'playing';

    // Stop time updates during seek
    this.stopTimeUpdateLoop();

    // Pause transport
    Tone.getTransport().pause();

    // Set position
    Tone.getTransport().ticks = Math.max(0, ticks);

    // Seek renderers
    this.audioRenderer?.seek(ticks, isPlaying);
    this.midiRenderer?.seek(ticks, isPlaying);
    this.samplerRenderer?.seek(ticks, isPlaying);

    // Resume if was playing
    if (isPlaying) {
      Tone.getTransport().start();
      this.startTimeUpdateLoop();
    }

    console.log('AudioEngine: Seeked to tick', ticks);
  }

  /**
   * Get current playback position in ticks.
   */
  getPositionTicks(): number {
    return Tone.getTransport().ticks;
  }

  /**
   * Get current playback position in seconds.
   */
  getPositionSeconds(): number {
    return Tone.getTransport().seconds;
  }

  /**
   * Get current playback state.
   */
  getPlaybackState(): EnginePlaybackState {
    return this.playbackState;
  }

  // ============================================================================
  // EVENT SUBSCRIPTIONS
  // ============================================================================

  /**
   * Subscribe to time updates.
   * Called on each animation frame during playback.
   *
   * @param callback - Function receiving (ticks, seconds)
   * @returns Unsubscribe function
   */
  onTimeUpdate(callback: (ticks: number, seconds: number) => void): Unsubscribe {
    this.timeUpdateCallbacks.add(callback);
    return () => this.timeUpdateCallbacks.delete(callback);
  }

  /**
   * Subscribe to playback state changes.
   *
   * @param callback - Function receiving new state
   * @returns Unsubscribe function
   */
  onStateChange(callback: (state: EnginePlaybackState) => void): Unsubscribe {
    this.stateChangeCallbacks.add(callback);
    return () => this.stateChangeCallbacks.delete(callback);
  }

  /**
   * Subscribe to errors.
   *
   * @param callback - Function receiving error and context
   * @returns Unsubscribe function
   */
  onError(callback: (error: Error, context: string) => void): Unsubscribe {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private setPlaybackState(state: EnginePlaybackState): void {
    if (this.playbackState !== state) {
      this.playbackState = state;
      this.stateChangeCallbacks.forEach(cb => cb(state));
    }
  }

  private emitError(error: Error, context: string): void {
    console.error(`AudioEngine [${context}]:`, error);
    this.errorCallbacks.forEach(cb => cb(error, context));
  }

  private startTimeUpdateLoop(): void {
    if (this.animationFrameId !== null) return;

    const update = () => {
      const ticks = Tone.getTransport().ticks;
      const seconds = Tone.getTransport().seconds;

      this.timeUpdateCallbacks.forEach(cb => cb(ticks, seconds));

      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  private stopTimeUpdateLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let engineInstance: AudioEngine | null = null;

/**
 * Get the singleton AudioEngine instance.
 * Creates a new instance if one doesn't exist.
 */
export function getAudioEngine(): AudioEngine {
  if (!engineInstance) {
    engineInstance = new AudioEngine();
  }
  return engineInstance;
}

/**
 * Reset the singleton AudioEngine instance.
 * Useful for testing. Disposes the current instance if it exists.
 */
export function resetAudioEngine(): void {
  if (engineInstance) {
    engineInstance.dispose();
    engineInstance = null;
  }
}
