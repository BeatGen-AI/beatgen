/**
 * SamplerTrackRenderer - Handles playback for sampler tracks.
 *
 * Phase 4 of the Audio Engine Refactor.
 *
 * Architecture:
 * - One Tone.Channel per track (manages volume/pan)
 * - One SamplerChannelPlayer per track (manages note scheduling and GrainPlayers)
 * - Follows AudioTrackRenderer pattern (constructor with buffers/mainOutput)
 */

import * as Tone from 'tone';
import { ITrackRenderer } from './BaseRenderer';
import {
  PlaybackTrack,
  PlaybackState,
  SamplerResources,
} from '../types';
import { SamplerChannelPlayer } from './SamplerChannelPlayer';

/**
 * Renderer for sampler tracks (granular synthesis with pitch shifting).
 * Manages Tone.Channel for volume/pan and SamplerChannelPlayer for note playback.
 */
export class SamplerTrackRenderer implements ITrackRenderer {
  // References from constructor
  private buffers: Map<string, AudioBuffer>;
  private mainOutput: Tone.Channel;

  // Track mixing: trackId -> Tone.Channel (handles volume/pan)
  private trackChannels: Map<string, Tone.Channel> = new Map();

  // Player instances: trackId -> SamplerChannelPlayer (handles notes)
  private players: Map<string, SamplerChannelPlayer> = new Map();

  // State cache
  private currentBpm: number = 120;
  private currentPpq: number = 480;
  private currentTracks: PlaybackTrack[] = [];

  constructor(buffers: Map<string, AudioBuffer>, mainOutput: Tone.Channel) {
    this.buffers = buffers;
    this.mainOutput = mainOutput;
  }

  // ============================================================================
  // ITrackRenderer Implementation
  // ============================================================================

  /**
   * Update renderer with new track state.
   * Called when setState() is called on the engine.
   */
  update(
    tracks: PlaybackTrack[],
    prevTracks: PlaybackTrack[] | undefined,
    state: PlaybackState
  ): void {
    // Cache state values
    this.currentBpm = state.bpm;
    this.currentPpq = state.ppq;
    this.currentTracks = tracks;

    // Build lookup maps for efficient diffing
    const prevTrackMap = new Map(prevTracks?.map((t) => [t.id, t]) ?? []);
    const currentTrackMap = new Map(tracks.map((t) => [t.id, t]));

    // 1. Handle removed tracks - cleanup players and channels
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
    for (const track of tracks) {
      const prevTrack = prevTrackMap.get(track.id);
      const resources = track.resources as SamplerResources;

      // Ensure channel exists
      this.ensureTrackChannel(track);

      // Update mixing controls
      this.updateTrackMixing(track, prevTrack);

      // Ensure player exists (throws if buffer not loaded)
      this.ensurePlayer(track, resources);

      // Update player state
      const player = this.players.get(track.id);
      if (player) {
        player.setNotes(resources.notes);
        player.setBpm(state.bpm);
        player.setPpq(state.ppq);
      }
    }

    console.log('SamplerTrackRenderer: Updated', {
      trackCount: tracks.length,
      playerCount: this.players.size,
    });
  }

  /**
   * Start playback from a position.
   */
  play(positionTicks: number): void {
    for (const track of this.currentTracks) {
      // Skip muted tracks
      if (track.effectiveMute) continue;

      const player = this.players.get(track.id);
      player?.play(positionTicks);
    }

    console.log('SamplerTrackRenderer: Playing from tick', positionTicks);
  }

  /**
   * Pause playback.
   */
  pause(): void {
    for (const player of this.players.values()) {
      player.pause();
    }

    console.log('SamplerTrackRenderer: Paused');
  }

  /**
   * Stop playback and reset.
   */
  stop(): void {
    for (const player of this.players.values()) {
      player.stop();
    }

    console.log('SamplerTrackRenderer: Stopped');
  }

  /**
   * Seek to a position.
   */
  seek(positionTicks: number, isPlaying: boolean): void {
    for (const player of this.players.values()) {
      player.seek(positionTicks, isPlaying);
    }

    console.log('SamplerTrackRenderer: Seeked to tick', positionTicks);
  }

  /**
   * Clean up resources for specific tracks.
   * Order: Stop players first, then dispose channel.
   */
  cleanup(trackIds: string[]): void {
    for (const trackId of trackIds) {
      // 1. First: Dispose the player
      const player = this.players.get(trackId);
      if (player) {
        player.dispose();
        this.players.delete(trackId);
      }

      // 2. Then: Dispose the channel
      const channel = this.trackChannels.get(trackId);
      if (channel) {
        channel.dispose();
        this.trackChannels.delete(trackId);
      }
    }

    console.log('SamplerTrackRenderer: Cleaned up tracks', trackIds);
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    // Dispose all players
    for (const player of this.players.values()) {
      player.dispose();
    }
    this.players.clear();

    // Dispose all channels
    for (const channel of this.trackChannels.values()) {
      channel.dispose();
    }
    this.trackChannels.clear();

    this.currentTracks = [];

    console.log('SamplerTrackRenderer: Disposed');
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Ensure a track channel exists for the given track.
   */
  private ensureTrackChannel(track: PlaybackTrack): void {
    if (!this.trackChannels.has(track.id)) {
      const channel = new Tone.Channel().connect(this.mainOutput);
      this.trackChannels.set(track.id, channel);
    }
  }

  /**
   * Ensure a player exists for the given track.
   * Throws Error if buffer is not loaded (fail loudly per CLAUDE.md).
   */
  private ensurePlayer(track: PlaybackTrack, resources: SamplerResources): void {
    if (this.players.has(track.id)) return;

    const buffer = this.buffers.get(resources.bufferId);
    if (!buffer) {
      throw new Error(
        `SamplerTrackRenderer: Buffer not loaded for track ${track.id} (bufferId: ${resources.bufferId})`
      );
    }

    const channel = this.trackChannels.get(track.id);
    if (!channel) {
      throw new Error(
        `SamplerTrackRenderer: No channel found for track ${track.id}`
      );
    }

    const player = new SamplerChannelPlayer(
      track.id,
      buffer,
      channel,
      resources.grainSize,
      resources.overlap,
      resources.baseMidiNote
    );
    this.players.set(track.id, player);
  }

  /**
   * Update mixing controls (volume/pan/mute) for a track.
   */
  private updateTrackMixing(
    track: PlaybackTrack,
    prevTrack?: PlaybackTrack
  ): void {
    const channel = this.trackChannels.get(track.id);
    if (!channel) return;

    // Only update if changed
    const volumeChanged = !prevTrack || prevTrack.volume !== track.volume;
    const panChanged = !prevTrack || prevTrack.pan !== track.pan;
    const muteChanged =
      !prevTrack || prevTrack.effectiveMute !== track.effectiveMute;

    if (volumeChanged || muteChanged) {
      channel.volume.value = this.convertVolumeToDb(
        track.volume,
        track.effectiveMute
      );
    }

    if (panChanged) {
      // Pan conversion: -100..100 to -1..1
      channel.pan.value = track.pan / 100;
    }
  }

  /**
   * Convert volume (0-100) to dB.
   * Matches AudioTrackRenderer formula.
   * Muted or 0% = -Infinity (silent)
   * 1% = -60dB, 100% = +6dB
   */
  private convertVolumeToDb(volume: number, muted: boolean): number {
    if (muted || volume <= 0) return -Infinity;
    const safeVolume = Math.min(100, volume);
    const position = safeVolume / 100;
    return -60 + position * 66; // Range: -60dB to +6dB
  }
}
