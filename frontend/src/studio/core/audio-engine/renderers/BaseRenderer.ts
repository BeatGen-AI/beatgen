/**
 * Interface for track-type-specific renderers.
 *
 * Each track type (audio, MIDI, sampler) has its own renderer implementation.
 * This interface defines the contract that all renderers must follow.
 *
 * Renderers are implemented in later phases:
 * - Phase 2: AudioTrackRenderer
 * - Phase 3: MidiTrackRenderer
 * - Phase 4: SamplerTrackRenderer
 */

import { PlaybackTrack, PlaybackState } from '../types';

/**
 * Interface for track renderers.
 * Handles playback for a specific track type.
 */
export interface ITrackRenderer {
  /**
   * Update renderer with new track state.
   * Called when setState() is called on the engine.
   * Renderer should diff against previous state and update accordingly.
   *
   * @param tracks - Tracks of this renderer's type
   * @param prevTracks - Previous tracks (for diffing), undefined on first call
   * @param state - Full playback state (for BPM, PPQ, etc.)
   */
  update(
    tracks: PlaybackTrack[],
    prevTracks: PlaybackTrack[] | undefined,
    state: PlaybackState
  ): void;

  /**
   * Start playback from a position.
   * Schedule all audio/notes that should play from this position.
   *
   * @param positionTicks - Current transport position in ticks
   */
  play(positionTicks: number): void;

  /**
   * Pause playback.
   * Stop all currently playing audio without resetting position.
   */
  pause(): void;

  /**
   * Stop playback and reset.
   * Stop all audio and clear any scheduled events.
   */
  stop(): void;

  /**
   * Seek to a position.
   * If playing, restart playback from the new position.
   *
   * @param positionTicks - Target position in ticks
   * @param isPlaying - Whether playback should continue after seek
   */
  seek(positionTicks: number, isPlaying: boolean): void;

  /**
   * Clean up resources for specific tracks.
   * Called when tracks are removed from state.
   *
   * @param trackIds - Track IDs to clean up
   */
  cleanup(trackIds: string[]): void;

  /**
   * Dispose all resources.
   * Called when engine is disposed.
   */
  dispose(): void;
}
