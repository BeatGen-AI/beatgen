/**
 * MidiTrackRenderer - Handles playback for MIDI tracks using js-synthesizer.
 *
 * Phase 3 of the Audio Engine Refactor.
 *
 * Architecture:
 * - Own AudioContext separate from Tone.js (required by js-synthesizer)
 * - Single AudioWorkletNodeSynthesizer shared by all tracks
 * - One MidiChannelPlayer per track (manages sequencer and channel)
 *
 * TIMING NOTE:
 * js-synthesizer runs on its own AudioContext clock, separate from Tone.js.
 * We synchronize by converting Tone.Transport ticks to seconds and scheduling
 * events relative to that position. Some drift may occur on very long sessions.
 * This is an accepted limitation of the dual-context architecture.
 *
 * CHANNEL LIMIT:
 * MIDI supports 16 channels (0-15). Channel 9 is reserved for drums.
 * Maximum of 15 simultaneous MIDI tracks. Exceeding this will throw an error.
 */

import { AudioWorkletNodeSynthesizer } from 'js-synthesizer';
import { ITrackRenderer } from './BaseRenderer';
import { MidiChannelPlayer, MidiChannelPlayerConfig } from './MidiChannelPlayer';
import {
  PlaybackTrack,
  PlaybackState,
  MidiResources,
} from '../types';

/**
 * Maximum number of MIDI channels available (excluding channel 9 for drums).
 */
const MAX_MIDI_CHANNELS = 15;

/**
 * Renderer for MIDI tracks using soundfont-based synthesis.
 */
export class MidiTrackRenderer implements ITrackRenderer {
  // Synthesizer
  private synth: AudioWorkletNodeSynthesizer | null = null;
  private audioContext: AudioContext | null = null;
  private audioNode: AudioWorkletNode | null = null;
  private isInitialized: boolean = false;

  // Track players: trackId -> MidiChannelPlayer
  private trackPlayers: Map<string, MidiChannelPlayer> = new Map();

  // Soundfont management: instrumentId -> soundfontId in synth
  private loadedSoundfonts: Map<string, number> = new Map();

  // Channel allocation
  private usedChannels: Set<number> = new Set();
  private trackChannels: Map<string, number> = new Map(); // trackId -> channel

  // Reference to soundfont data cache from AudioEngine
  private soundfontDataCache: Map<string, ArrayBuffer>;

  // State cache
  private currentBpm: number = 120;
  private currentPpq: number = 480;
  private currentTracks: PlaybackTrack[] = [];
  private isPlaying: boolean = false;

  // Error callback (set by AudioEngine)
  private errorCallback: ((error: Error, context: string) => void) | null = null;

  constructor(soundfontDataCache: Map<string, ArrayBuffer>) {
    this.soundfontDataCache = soundfontDataCache;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the renderer.
   * Creates AudioContext, loads AudioWorklet modules, and creates synthesizer.
   * Must be called before any other methods.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('MidiTrackRenderer: Already initialized');
      return;
    }

    try {
      // Create fresh AudioContext for js-synthesizer
      this.audioContext = new AudioContext({
        latencyHint: 'interactive',
      });

      // Load AudioWorklet modules
      await this.loadWorkletModules();

      // Create synthesizer
      this.synth = new AudioWorkletNodeSynthesizer();
      this.audioNode = this.synth.createAudioNode(this.audioContext, {
        polyphony: 256,
      });
      this.audioNode.connect(this.audioContext.destination);

      this.isInitialized = true;
      console.log('MidiTrackRenderer: Initialized');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emitError(error, 'initialize');
      throw error;
    }
  }

  /**
   * Load AudioWorklet modules required by js-synthesizer.
   */
  private async loadWorkletModules(): Promise<void> {
    if (!this.audioContext) {
      throw new Error('MidiTrackRenderer: AudioContext not created');
    }

    await this.audioContext.audioWorklet.addModule(
      '/js-synthesizer/libfluidsynth-2.3.0.js'
    );
    await this.audioContext.audioWorklet.addModule(
      '/js-synthesizer/js-synthesizer.worklet.js'
    );
  }

  /**
   * Set error callback for propagating errors to AudioEngine.
   */
  setErrorCallback(callback: (error: Error, context: string) => void): void {
    this.errorCallback = callback;
  }

  // ============================================================================
  // SOUNDFONT MANAGEMENT
  // ============================================================================

  /**
   * Load a soundfont into the synthesizer.
   * @returns The soundfont ID in the synth
   */
  async loadSoundfont(instrumentId: string, data: ArrayBuffer): Promise<number> {
    if (!this.synth) {
      throw new Error('MidiTrackRenderer: Synthesizer not initialized');
    }

    // Check if already loaded
    const existing = this.loadedSoundfonts.get(instrumentId);
    if (existing !== undefined) {
      return existing;
    }

    try {
      const sfontId = await this.synth.loadSFont(data);
      this.loadedSoundfonts.set(instrumentId, sfontId);
      console.log(
        `MidiTrackRenderer: Loaded soundfont ${instrumentId} -> sfontId ${sfontId}`
      );
      return sfontId;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emitError(error, `loadSoundfont(${instrumentId})`);
      throw error;
    }
  }

  /**
   * Check if a soundfont is loaded.
   */
  hasSoundfont(instrumentId: string): boolean {
    return this.loadedSoundfonts.has(instrumentId);
  }

  /**
   * Get the soundfont ID for an instrument.
   */
  getSoundfontId(instrumentId: string): number | undefined {
    return this.loadedSoundfonts.get(instrumentId);
  }

  // ============================================================================
  // ITrackRenderer IMPLEMENTATION
  // ============================================================================

  /**
   * Update renderer with new track state.
   * Note: Track creation is async but we fire-and-forget to match ITrackRenderer interface.
   * Tracks that fail to create will emit errors and be skipped in playback.
   */
  update(
    tracks: PlaybackTrack[],
    prevTracks: PlaybackTrack[] | undefined,
    state: PlaybackState
  ): void {
    if (!this.isInitialized) {
      this.emitError(
        new Error('MidiTrackRenderer: Not initialized'),
        'update'
      );
      return;
    }

    // Cache state values
    const bpmChanged = this.currentBpm !== state.bpm;
    this.currentBpm = state.bpm;
    this.currentPpq = state.ppq;
    this.currentTracks = tracks;

    // Build lookup maps
    const prevTrackMap = new Map(prevTracks?.map((t) => [t.id, t]) ?? []);
    const currentTrackMap = new Map(tracks.map((t) => [t.id, t]));

    // 1. Handle removed tracks
    if (prevTracks) {
      const removedTrackIds: string[] = [];
      for (const prevTrack of prevTracks) {
        if (!currentTrackMap.has(prevTrack.id)) {
          removedTrackIds.push(prevTrack.id);
        }
      }
      if (removedTrackIds.length > 0) {
        this.cleanup(removedTrackIds);
      }
    }

    // 2. Handle new and updated tracks
    // Collect all update promises and wait for them to complete
    const updatePromises: Promise<void>[] = [];
    for (const track of tracks) {
      const prevTrack = prevTrackMap.get(track.id);
      updatePromises.push(this.updateTrack(track, prevTrack, bpmChanged));
    }

    // Wait for all track updates to complete before allowing playback
    // This prevents race conditions where play() is called before tracks are ready
    Promise.all(updatePromises).catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emitError(error, 'update');
    });
  }

  /**
   * Update a single track.
   * Throws if player creation fails (errors propagate to update() Promise.all).
   */
  private async updateTrack(
    track: PlaybackTrack,
    prevTrack: PlaybackTrack | undefined,
    bpmChanged: boolean
  ): Promise<void> {
    const resources = track.resources as MidiResources;
    let player = this.trackPlayers.get(track.id);

    // Create player if it doesn't exist (throws on failure)
    if (!player) {
      player = await this.createTrackPlayer(track);
    }

    // Update notes if changed
    const prevResources = prevTrack?.resources as MidiResources | undefined;
    if (!prevTrack || prevResources?.notes !== resources.notes) {
      player.setNotes(resources.notes);
    }

    // Update mixing
    if (!prevTrack || prevTrack.volume !== track.volume) {
      player.setVolume(track.volume);
    }

    if (!prevTrack || prevTrack.effectiveMute !== track.effectiveMute) {
      player.setMute(track.effectiveMute);
    }

    // Update tempo if changed
    if (bpmChanged) {
      player.setBpm(this.currentBpm);
    }
  }

  /**
   * Create a MidiChannelPlayer for a track.
   * Throws on all errors (consistent error handling per CLAUDE.md - fail loudly).
   */
  private async createTrackPlayer(
    track: PlaybackTrack
  ): Promise<MidiChannelPlayer> {
    if (!this.synth) {
      const error = new Error('MidiTrackRenderer: Synthesizer not initialized');
      this.emitError(error, 'createTrackPlayer');
      throw error;
    }

    const resources = track.resources as MidiResources;

    // Ensure soundfont is loaded
    let soundfontId = this.loadedSoundfonts.get(resources.instrumentId);
    if (soundfontId === undefined) {
      // Try to load from cache
      const soundfontData = this.soundfontDataCache.get(resources.instrumentId);
      if (!soundfontData) {
        // Fail loudly per CLAUDE.md - no fallbacks
        const error = new Error(
          `MidiTrackRenderer: Soundfont not loaded for instrument ${resources.instrumentId}`
        );
        this.emitError(error, 'createTrackPlayer');
        throw error;
      }

      // loadSoundfont throws on error, so no try-catch needed
      soundfontId = await this.loadSoundfont(
        resources.instrumentId,
        soundfontData
      );
    }

    // Allocate channel
    const channel = this.allocateChannel(track.id);
    if (channel === -1) {
      // Fail loudly - exceeded channel limit
      const error = new Error(
        `MidiTrackRenderer: Cannot allocate channel for track ${track.id} - maximum ${MAX_MIDI_CHANNELS} MIDI tracks exceeded`
      );
      this.emitError(error, 'createTrackPlayer');
      throw error;
    }

    // Create player
    const config: MidiChannelPlayerConfig = {
      synth: this.synth,
      soundfontId,
      channel,
      bpm: this.currentBpm,
      ppq: this.currentPpq,
    };

    const player = new MidiChannelPlayer(config);

    try {
      await player.initialize();
    } catch (err) {
      // Release channel on failure
      this.releaseChannel(track.id);
      const error = err instanceof Error ? err : new Error(String(err));
      this.emitError(error, 'createTrackPlayer');
      throw error;
    }

    // Set initial state
    const trackResources = track.resources as MidiResources;
    player.setNotes(trackResources.notes);
    player.setVolume(track.volume);
    player.setMute(track.effectiveMute);

    this.trackPlayers.set(track.id, player);

    console.log(
      `MidiTrackRenderer: Created player for track ${track.id} on channel ${channel}`
    );

    return player;
  }

  /**
   * Start playback from a position.
   */
  play(positionTicks: number): void {
    if (!this.isInitialized) {
      this.emitError(
        new Error('MidiTrackRenderer: Not initialized'),
        'play'
      );
      return;
    }

    // Ensure AudioContext is running
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }

    this.isPlaying = true;

    // Start each track player
    for (const [trackId, player] of this.trackPlayers) {
      const track = this.currentTracks.find((t) => t.id === trackId);
      if (!track || track.effectiveMute) {
        continue;
      }

      player.play(positionTicks).catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emitError(error, `play(track=${trackId})`);
      });
    }

    console.log(
      `MidiTrackRenderer: Playing ${this.trackPlayers.size} tracks from tick ${positionTicks}`
    );
  }

  /**
   * Pause playback.
   */
  pause(): void {
    this.isPlaying = false;

    for (const player of this.trackPlayers.values()) {
      player.pause();
    }

    console.log('MidiTrackRenderer: Paused');
  }

  /**
   * Stop playback and reset.
   */
  stop(): void {
    this.isPlaying = false;

    for (const player of this.trackPlayers.values()) {
      player.stop().catch((err) => {
        console.warn('MidiTrackRenderer: Error stopping player:', err);
      });
    }

    console.log('MidiTrackRenderer: Stopped');
  }

  /**
   * Seek to a position.
   */
  seek(positionTicks: number, isPlaying: boolean): void {
    for (const player of this.trackPlayers.values()) {
      player.seek(positionTicks, isPlaying).catch((err) => {
        console.warn('MidiTrackRenderer: Error seeking player:', err);
      });
    }

    this.isPlaying = isPlaying;

    console.log(
      `MidiTrackRenderer: Seeked to tick ${positionTicks}, isPlaying=${isPlaying}`
    );
  }

  /**
   * Clean up resources for specific tracks.
   */
  cleanup(trackIds: string[]): void {
    for (const trackId of trackIds) {
      const player = this.trackPlayers.get(trackId);
      if (player) {
        player.dispose().catch((err) => {
          console.warn(
            `MidiTrackRenderer: Error disposing player for track ${trackId}:`,
            err
          );
        });
        this.trackPlayers.delete(trackId);
      }

      // Release channel
      this.releaseChannel(trackId);
    }

    console.log(`MidiTrackRenderer: Cleaned up ${trackIds.length} tracks`);
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    // Stop everything
    this.stop();

    // Dispose all players
    for (const [trackId, player] of this.trackPlayers) {
      player.dispose().catch((err) => {
        console.warn(
          `MidiTrackRenderer: Error disposing player for track ${trackId}:`,
          err
        );
      });
    }
    this.trackPlayers.clear();

    // Clear channel allocations
    this.usedChannels.clear();
    this.trackChannels.clear();

    // Close synthesizer
    if (this.synth) {
      this.synth.closePlayer();
      this.synth = null;
    }

    // Disconnect and close audio node
    if (this.audioNode) {
      this.audioNode.disconnect();
      this.audioNode = null;
    }

    // Close AudioContext
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Clear soundfont cache
    this.loadedSoundfonts.clear();

    this.isInitialized = false;

    console.log('MidiTrackRenderer: Disposed');
  }

  // ============================================================================
  // CHANNEL ALLOCATION
  // ============================================================================

  /**
   * Allocate a MIDI channel for a track.
   * @returns Channel number (0-15, excluding 9) or -1 if no channels available
   */
  private allocateChannel(trackId: string): number {
    // Check if track already has a channel
    const existing = this.trackChannels.get(trackId);
    if (existing !== undefined) {
      return existing;
    }

    // Find next available channel (0-15, skip 9)
    for (let ch = 0; ch <= 15; ch++) {
      if (ch === 9) continue; // Skip drums channel
      if (!this.usedChannels.has(ch)) {
        this.usedChannels.add(ch);
        this.trackChannels.set(trackId, ch);
        return ch;
      }
    }

    // No channels available
    return -1;
  }

  /**
   * Release a MIDI channel for a track.
   */
  private releaseChannel(trackId: string): void {
    const channel = this.trackChannels.get(trackId);
    if (channel !== undefined) {
      this.usedChannels.delete(channel);
      this.trackChannels.delete(trackId);
    }
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  /**
   * Emit an error to the registered callback.
   */
  private emitError(error: Error, context: string): void {
    console.error(`MidiTrackRenderer [${context}]:`, error);
    if (this.errorCallback) {
      this.errorCallback(error, `MidiTrackRenderer.${context}`);
    }
  }
}
