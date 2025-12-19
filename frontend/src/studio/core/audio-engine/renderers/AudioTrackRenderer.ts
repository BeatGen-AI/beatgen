/**
 * AudioTrackRenderer - Handles playback for audio tracks.
 *
 * Phase 2 of the Audio Engine Refactor.
 *
 * Architecture:
 * - One Tone.Channel per track (shared by all regions, handles volume/pan)
 * - One Tone.Player per region (independent playback for each instance)
 * - Manual timing (unsynced from Transport for precise control)
 */

import * as Tone from 'tone';
import { ITrackRenderer } from './BaseRenderer';
import {
  PlaybackTrack,
  PlaybackState,
  PlaybackRegion,
  AudioResources,
} from '../types';

/**
 * Active player for a single region instance.
 */
interface RegionPlayer {
  player: Tone.Player;
  channel: Tone.Channel; // Reference to track's channel
  trackId: string;
  regionId: string;
  scheduledEventId?: number; // Transport event ID if scheduled for future
}

/**
 * Renderer for audio tracks (WAV, MP3, etc.).
 * Manages Tone.Player instances for each region and Tone.Channel for each track.
 */
export class AudioTrackRenderer implements ITrackRenderer {
  // Track mixing: trackId -> Tone.Channel
  private trackChannels: Map<string, Tone.Channel> = new Map();

  // Region players: regionId -> RegionPlayer
  private regionPlayers: Map<string, RegionPlayer> = new Map();

  // Scheduled Transport events (to cancel on seek/stop)
  private scheduledEvents: Set<number> = new Set();

  // Currently playing players (for quick access during pause)
  private activePlayers: Set<Tone.Player> = new Set();

  // References from constructor
  private buffers: Map<string, AudioBuffer>;
  private mainOutput: Tone.Channel;

  // State cache (updated in update())
  private currentBpm: number = 120;
  private currentPpq: number = 480;
  private currentTracks: PlaybackTrack[] = [];
  private isPlaying: boolean = false;

  // Constants
  private static readonly FADE_TIME = 0.01; // 10ms fade for pause

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
    // [DEBUG] Log update call
    console.log('[DEBUG] AudioTrackRenderer.update called', {
      trackCount: tracks.length,
      tracks: tracks.map(t => ({
        id: t.id,
        name: t.name,
        effectiveMute: t.effectiveMute,
        regionsCount: t.regions.length,
        regions: t.regions.map(r => ({ id: r.id, startTicks: r.startTicks, endTicks: r.endTicks })),
      })),
      availableBuffers: Array.from(this.buffers.keys()),
    });

    // Cache state values
    this.currentBpm = state.bpm;
    this.currentPpq = state.ppq;
    this.currentTracks = tracks;

    // Build lookup maps for efficient diffing
    const prevTrackMap = new Map(prevTracks?.map((t) => [t.id, t]) ?? []);
    const currentTrackMap = new Map(tracks.map((t) => [t.id, t]));

    // 1. Handle removed tracks - cleanup channels and players
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

      // Ensure channel exists
      this.ensureTrackChannel(track);

      // Update mixing controls
      this.updateTrackMixing(track, prevTrack);

      // Handle region changes
      this.updateRegions(track, prevTrack);
    }
  }

  /**
   * Start playback from a position.
   */
  play(positionTicks: number): void {
    // [DEBUG] Log play call
    console.log('[DEBUG] AudioTrackRenderer.play called', {
      positionTicks,
      currentTracksCount: this.currentTracks.length,
      regionPlayersCount: this.regionPlayers.size,
      trackChannelsCount: this.trackChannels.size,
    });

    this.isPlaying = true;

    // Clear any previously scheduled events
    this.clearScheduledEvents();

    // Reset all players to clean state
    for (const regionPlayer of this.regionPlayers.values()) {
      if (regionPlayer.player.state === 'started') {
        regionPlayer.player.stop();
      }
      regionPlayer.player.volume.cancelScheduledValues(Tone.now());
      regionPlayer.player.volume.value = 0;
    }

    // Clear active players set
    this.activePlayers.clear();

    // Schedule each region
    let scheduledCount = 0;
    let skippedMuted = 0;
    let skippedNoRegions = 0;
    for (const track of this.currentTracks) {
      // Skip muted tracks
      if (track.effectiveMute) {
        skippedMuted++;
        console.log(`[DEBUG] AudioTrackRenderer.play: Skipping muted track ${track.id}`);
        continue;
      }

      if (track.regions.length === 0) {
        skippedNoRegions++;
        console.log(`[DEBUG] AudioTrackRenderer.play: Track ${track.id} has no regions`);
        continue;
      }

      for (const region of track.regions) {
        this.scheduleRegion(track, region, positionTicks);
        scheduledCount++;
      }
    }

    console.log('[DEBUG] AudioTrackRenderer.play finished', {
      scheduledCount,
      skippedMuted,
      skippedNoRegions,
      activePlayersCount: this.activePlayers.size,
    });
  }

  /**
   * Pause playback with fade.
   */
  pause(): void {
    this.isPlaying = false;

    // Cancel scheduled future events
    this.clearScheduledEvents();

    // Quick fade out on all active players
    for (const player of this.activePlayers) {
      player.volume.rampTo(-Infinity, AudioTrackRenderer.FADE_TIME);
    }

    // Wait for fade, then stop
    setTimeout(() => {
      for (const player of this.activePlayers) {
        if (player.state === 'started') {
          player.stop();
        }
        // Reset volume for next play
        player.volume.cancelScheduledValues(Tone.now());
        player.volume.value = 0;
      }
      this.activePlayers.clear();
    }, AudioTrackRenderer.FADE_TIME * 1000 + 5); // +5ms buffer
  }

  /**
   * Stop playback and reset.
   */
  stop(): void {
    this.isPlaying = false;

    // Cancel all scheduled events
    this.clearScheduledEvents();

    // Fade and stop all players
    for (const regionPlayer of this.regionPlayers.values()) {
      const { player } = regionPlayer;
      player.volume.rampTo(-Infinity, AudioTrackRenderer.FADE_TIME);
    }

    setTimeout(() => {
      for (const regionPlayer of this.regionPlayers.values()) {
        const { player } = regionPlayer;
        if (player.state === 'started') {
          player.stop();
        }
        player.volume.cancelScheduledValues(Tone.now());
        player.volume.value = 0;
      }
      this.activePlayers.clear();
    }, AudioTrackRenderer.FADE_TIME * 1000 + 5);
  }

  /**
   * Seek to a position.
   * If playing, restart playback from the new position.
   */
  seek(positionTicks: number, isPlaying: boolean): void {
    // Cancel all scheduled events
    this.clearScheduledEvents();

    // Immediately stop all active players (no fade for responsive seek)
    for (const regionPlayer of this.regionPlayers.values()) {
      const { player } = regionPlayer;
      if (player.state === 'started') {
        player.stop(Tone.now());
      }
      player.volume.cancelScheduledValues(Tone.now());
      player.volume.value = 0;
    }
    this.activePlayers.clear();

    // If playing, restart from new position
    if (isPlaying) {
      this.play(positionTicks);
    }
  }

  /**
   * Clean up resources for specific tracks.
   * Order: Stop players first, then dispose channel.
   */
  cleanup(trackIds: string[]): void {
    for (const trackId of trackIds) {
      // 1. First: Stop and dispose region players for this track
      const regionsToRemove: string[] = [];
      for (const [regionId, regionPlayer] of this.regionPlayers) {
        if (regionPlayer.trackId === trackId) {
          regionsToRemove.push(regionId);
        }
      }
      for (const regionId of regionsToRemove) {
        this.removeRegionPlayer(regionId);
      }

      // 2. Then: Dispose the track channel
      const channel = this.trackChannels.get(trackId);
      if (channel) {
        channel.dispose();
        this.trackChannels.delete(trackId);
      }
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    // Stop everything first
    this.stop();

    // Wait for fade to complete
    setTimeout(() => {
      // Dispose all region players
      for (const regionPlayer of this.regionPlayers.values()) {
        regionPlayer.player.dispose();
      }
      this.regionPlayers.clear();

      // Dispose all channels
      for (const channel of this.trackChannels.values()) {
        channel.dispose();
      }
      this.trackChannels.clear();

      this.activePlayers.clear();
      this.scheduledEvents.clear();
      this.currentTracks = [];
    }, AudioTrackRenderer.FADE_TIME * 1000 + 10);
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
   * Update region players for a track.
   */
  private updateRegions(track: PlaybackTrack, prevTrack?: PlaybackTrack): void {
    const prevRegionIds = new Set(prevTrack?.regions.map((r) => r.id) ?? []);
    const currentRegionIds = new Set(track.regions.map((r) => r.id));

    // Remove players for regions that no longer exist
    for (const regionId of prevRegionIds) {
      if (!currentRegionIds.has(regionId)) {
        this.removeRegionPlayer(regionId);
      }
    }

    // Add players for new regions
    for (const region of track.regions) {
      if (!prevRegionIds.has(region.id)) {
        this.createRegionPlayer(track, region);
      }
    }
  }

  /**
   * Create a player for a region.
   */
  private createRegionPlayer(track: PlaybackTrack, region: PlaybackRegion): void {
    const resources = track.resources as AudioResources;
    const buffer = this.buffers.get(resources.bufferId);

    // [DEBUG] Log player creation attempt
    console.log('[DEBUG] AudioTrackRenderer.createRegionPlayer', {
      trackId: track.id,
      regionId: region.id,
      bufferId: resources.bufferId,
      bufferExists: !!buffer,
      availableBuffers: Array.from(this.buffers.keys()),
    });

    if (!buffer) {
      // Buffer not loaded yet - skip this region
      // This is not an error since buffers may load after tracks are added
      console.warn(
        `AudioTrackRenderer: Buffer not loaded for track ${track.id} (bufferId: ${resources.bufferId})`
      );
      return;
    }

    const channel = this.trackChannels.get(track.id);
    if (!channel) {
      console.error(`AudioTrackRenderer: No channel found for track ${track.id}`);
      return;
    }

    // Skip zero-duration regions
    if (region.endTicks <= region.startTicks) {
      console.warn(
        `AudioTrackRenderer: Skipping zero-duration region ${region.id}`
      );
      return;
    }

    const player = new Tone.Player({
      url: buffer,
      loop: false,
      autostart: false,
    }).connect(channel);

    // CRITICAL: Unsync from Transport - we manage timing manually
    player.unsync();

    this.regionPlayers.set(region.id, {
      player,
      channel,
      trackId: track.id,
      regionId: region.id,
    });

    console.log(`[DEBUG] AudioTrackRenderer.createRegionPlayer: Created player for region ${region.id}`);
  }

  /**
   * Remove and dispose a region player.
   */
  private removeRegionPlayer(regionId: string): void {
    const regionPlayer = this.regionPlayers.get(regionId);
    if (regionPlayer) {
      // Cancel any scheduled events
      if (regionPlayer.scheduledEventId !== undefined) {
        Tone.getTransport().clear(regionPlayer.scheduledEventId);
        this.scheduledEvents.delete(regionPlayer.scheduledEventId);
      }

      // Stop if playing
      if (regionPlayer.player.state === 'started') {
        regionPlayer.player.stop();
      }

      // Remove from active players
      this.activePlayers.delete(regionPlayer.player);

      // Dispose the player
      regionPlayer.player.dispose();
      this.regionPlayers.delete(regionId);
    }
  }

  /**
   * Schedule a single region for playback.
   */
  private scheduleRegion(
    track: PlaybackTrack,
    region: PlaybackRegion,
    positionTicks: number
  ): void {
    const regionPlayer = this.regionPlayers.get(region.id);
    if (!regionPlayer) {
      // Player might not exist if buffer wasn't loaded
      console.log(`[DEBUG] AudioTrackRenderer.scheduleRegion: No player for region ${region.id}`);
      return;
    }

    const { player } = regionPlayer;

    // Convert ticks to seconds
    const regionStartSec = this.ticksToSeconds(region.startTicks);
    const regionEndSec = this.ticksToSeconds(region.endTicks);
    const sourceOffsetSec = this.ticksToSeconds(region.sourceOffsetTicks);
    const regionDurationSec = regionEndSec - regionStartSec;
    const positionSec = this.ticksToSeconds(positionTicks);

    // [DEBUG] Log scheduling calculation
    console.log('[DEBUG] AudioTrackRenderer.scheduleRegion', {
      regionId: region.id,
      trackId: track.id,
      positionTicks,
      positionSec,
      regionStartTicks: region.startTicks,
      regionStartSec,
      regionEndTicks: region.endTicks,
      regionEndSec,
      regionDurationSec,
      sourceOffsetTicks: region.sourceOffsetTicks,
      sourceOffsetSec,
      playerLoaded: player.loaded,
      playerState: player.state,
    });

    if (positionSec >= regionEndSec) {
      // Already past this region - don't play
      console.log(`[DEBUG] AudioTrackRenderer.scheduleRegion: Skipping region ${region.id} - already past (position ${positionSec} >= end ${regionEndSec})`);
      return;
    }

    if (positionSec >= regionStartSec) {
      // Position is within this region - start immediately with offset
      const offsetIntoRegion = positionSec - regionStartSec;
      const actualSourceOffset = sourceOffsetSec + offsetIntoRegion;
      const remainingDuration = regionDurationSec - offsetIntoRegion;

      console.log(`[DEBUG] AudioTrackRenderer.scheduleRegion: Starting region ${region.id} IMMEDIATELY`, {
        offsetIntoRegion,
        actualSourceOffset,
        remainingDuration,
      });

      // Start immediately
      player.start(Tone.now(), actualSourceOffset, remainingDuration);

      this.activePlayers.add(player);
    } else {
      // Region is in the future - schedule it
      const delaySeconds = regionStartSec - positionSec;

      console.log(`[DEBUG] AudioTrackRenderer.scheduleRegion: Scheduling region ${region.id} for future`, {
        delaySeconds,
        sourceOffsetSec,
        regionDurationSec,
      });

      const eventId = Tone.getTransport().schedule((time) => {
        // Only play if we're still supposed to be playing
        if (!this.isPlaying) return;

        // CRITICAL: Check that the region player still exists (track may have been deleted)
        const currentRegionPlayer = this.regionPlayers.get(region.id);
        if (!currentRegionPlayer) {
          console.log(`[DEBUG] AudioTrackRenderer: Region ${region.id} no longer exists, skipping playback`);
          return;
        }

        // CRITICAL: Verify the track is still in currentTracks (not deleted)
        const trackStillExists = this.currentTracks.some(t => t.id === track.id);
        if (!trackStillExists) {
          console.log(`[DEBUG] AudioTrackRenderer: Track ${track.id} no longer exists, skipping playback`);
          return;
        }

        // CRITICAL: Check if track is now muted
        const currentTrack = this.currentTracks.find(t => t.id === track.id);
        if (currentTrack?.effectiveMute) {
          console.log(`[DEBUG] AudioTrackRenderer: Track ${track.id} is now muted, skipping playback`);
          return;
        }

        console.log(`[DEBUG] AudioTrackRenderer: Transport callback triggered for region ${region.id}`);

        // Start from source offset for full duration
        player.start(time, sourceOffsetSec, regionDurationSec);

        this.activePlayers.add(player);
      }, `+${delaySeconds}`);

      regionPlayer.scheduledEventId = eventId;
      this.scheduledEvents.add(eventId);
    }
  }

  /**
   * Clear all scheduled Transport events.
   */
  private clearScheduledEvents(): void {
    for (const eventId of this.scheduledEvents) {
      Tone.getTransport().clear(eventId);
    }
    this.scheduledEvents.clear();

    // Clear scheduled event IDs from region players
    for (const regionPlayer of this.regionPlayers.values()) {
      regionPlayer.scheduledEventId = undefined;
    }
  }

  /**
   * Convert ticks to seconds using cached BPM and PPQ.
   */
  private ticksToSeconds(ticks: number): number {
    const beats = ticks / this.currentPpq;
    const secondsPerBeat = 60 / this.currentBpm;
    return beats * secondsPerBeat;
  }

  /**
   * Convert volume (0-100) to dB.
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
