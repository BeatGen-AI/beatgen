/**
 * SamplerChannelPlayer - Per-track sampler player using Tone.GrainPlayer.
 *
 * Phase 4 of the Audio Engine Refactor.
 *
 * This class manages note scheduling and GrainPlayer instances for a single
 * sampler track. Each note creates an on-demand GrainPlayer with pitch shifting
 * via detune, allowing for polyphonic playback.
 *
 * Patterns adapted from:
 * - MidiChannelPlayer (note scheduling pattern)
 * - AudioTrackRenderer (Tone.js patterns, timing conversion)
 * - Legacy sampler.ts (GrainPlayer + detune pitch shifting)
 */

import * as Tone from 'tone';
import { PlaybackNote } from '../types';

/**
 * Manages sampler playback for a single track.
 */
export class SamplerChannelPlayer {
  private trackId: string;
  private buffer: AudioBuffer;
  private channel: Tone.Channel;
  private grainSize: number;
  private overlap: number;
  private baseMidiNote: number;

  private notes: PlaybackNote[] = [];
  private scheduledEvents: Set<number> = new Set();
  private activePlayers: Map<string, Tone.GrainPlayer> = new Map();
  private isPlaying: boolean = false;
  private isDisposed: boolean = false;

  // Timing (updated via setBpm/setPpq)
  private currentBpm: number = 120;
  private currentPpq: number = 480;

  // Constants
  private static readonly FADE_TIME = 0.01; // 10ms fade for pause

  constructor(
    trackId: string,
    buffer: AudioBuffer,
    channel: Tone.Channel,
    grainSize: number,
    overlap: number,
    baseMidiNote: number
  ) {
    this.trackId = trackId;
    this.buffer = buffer;
    this.channel = channel;
    this.grainSize = grainSize;
    this.overlap = overlap;
    this.baseMidiNote = baseMidiNote;

    console.log(
      `SamplerChannelPlayer: Created for track ${trackId} (baseMidiNote: ${baseMidiNote})`
    );
  }

  // ============================================================================
  // NOTE MANAGEMENT
  // ============================================================================

  /**
   * Update the notes for this track.
   */
  setNotes(notes: PlaybackNote[]): void {
    this.notes = notes;
    console.log(
      `SamplerChannelPlayer: Set ${notes.length} notes for track ${this.trackId}`
    );
  }

  /**
   * Update BPM for timing calculations.
   */
  setBpm(bpm: number): void {
    if (bpm <= 0) {
      console.warn(`SamplerChannelPlayer: Invalid BPM ${bpm}`);
      return;
    }
    this.currentBpm = bpm;
  }

  /**
   * Update PPQ for timing calculations.
   */
  setPpq(ppq: number): void {
    if (ppq <= 0) {
      console.warn(`SamplerChannelPlayer: Invalid PPQ ${ppq}`);
      return;
    }
    this.currentPpq = ppq;
  }

  // ============================================================================
  // PLAYBACK CONTROLS
  // ============================================================================

  /**
   * Start playback from a position.
   */
  play(fromTick: number): void {
    this.isPlaying = true;
    this.clearScheduledEvents();

    const positionSec = this.ticksToSeconds(fromTick);

    let scheduledCount = 0;
    let immediateCount = 0;

    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      const noteStartSec = this.ticksToSeconds(note.startTicks);
      const noteDurationSec = this.ticksToSeconds(note.durationTicks);
      const noteEndSec = noteStartSec + noteDurationSec;

      // Skip notes that have already ended
      if (positionSec >= noteEndSec) continue;

      if (positionSec >= noteStartSec) {
        // Note should be playing now - start immediately
        const elapsed = positionSec - noteStartSec;
        const remaining = noteDurationSec - elapsed;
        this.playNote(note, i, Tone.now(), remaining);
        immediateCount++;
      } else {
        // Note is in future - schedule via Transport
        const delay = noteStartSec - positionSec;
        const eventId = Tone.getTransport().schedule((time) => {
          // CRITICAL: Check if player was disposed (track may have been deleted)
          if (this.isDisposed) {
            console.log(`SamplerChannelPlayer: Track ${this.trackId} disposed, skipping note`);
            return;
          }
          if (!this.isPlaying) return;
          this.playNote(note, i, time, noteDurationSec);
        }, `+${delay}`);
        this.scheduledEvents.add(eventId);
        scheduledCount++;
      }
    }

    console.log(
      `SamplerChannelPlayer: Playing track ${this.trackId} from tick ${fromTick} ` +
        `(${immediateCount} immediate, ${scheduledCount} scheduled)`
    );
  }

  /**
   * Pause playback.
   */
  pause(): void {
    this.isPlaying = false;
    this.clearScheduledEvents();

    // Fade out active players
    for (const player of this.activePlayers.values()) {
      player.volume.rampTo(-Infinity, SamplerChannelPlayer.FADE_TIME);
    }

    // Dispose after fade
    setTimeout(() => {
      for (const [noteId, player] of this.activePlayers) {
        try {
          player.stop();
          player.dispose();
        } catch (err) {
          // Player may already be disposed
        }
      }
      this.activePlayers.clear();
    }, SamplerChannelPlayer.FADE_TIME * 1000 + 5);

    console.log(`SamplerChannelPlayer: Paused track ${this.trackId}`);
  }

  /**
   * Stop playback and reset.
   */
  stop(): void {
    this.pause(); // Same behavior as pause
    console.log(`SamplerChannelPlayer: Stopped track ${this.trackId}`);
  }

  /**
   * Seek to a position.
   */
  seek(toTick: number, shouldContinuePlaying: boolean): void {
    // Stop current playback
    this.isPlaying = false;
    this.clearScheduledEvents();

    // Immediately stop active players (no fade for responsive seek)
    for (const [noteId, player] of this.activePlayers) {
      try {
        player.stop();
        player.dispose();
      } catch (err) {
        // Player may already be disposed
      }
    }
    this.activePlayers.clear();

    // If should continue playing, restart from new position
    if (shouldContinuePlaying) {
      this.play(toTick);
    }

    console.log(
      `SamplerChannelPlayer: Seeked track ${this.trackId} to tick ${toTick}`
    );
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.isDisposed = true; // CRITICAL: Set first to prevent scheduled callbacks from firing
    this.isPlaying = false;
    this.clearScheduledEvents();

    // Dispose all active players
    for (const [noteId, player] of this.activePlayers) {
      try {
        player.stop();
        player.dispose();
      } catch (err) {
        // Player may already be disposed
      }
    }
    this.activePlayers.clear();

    console.log(`SamplerChannelPlayer: Disposed track ${this.trackId}`);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Play a single note by creating a GrainPlayer.
   */
  private playNote(
    note: PlaybackNote,
    noteIndex: number,
    time: number,
    duration: number
  ): void {
    const noteId = `${this.trackId}_${noteIndex}_${note.startTicks}`;

    // Create GrainPlayer with buffer
    const player = new Tone.GrainPlayer({
      url: this.buffer,
      grainSize: this.grainSize,
      overlap: this.overlap,
      loop: false,
    }).connect(this.channel);

    // Set pitch via detune (100 cents = 1 semitone)
    player.detune = (note.pitch - this.baseMidiNote) * 100;

    // Apply velocity as gain multiplier (0.5 to 1.0 range for natural dynamics)
    const velocityGain = 0.5 + (note.velocity / 127) * 0.5;
    player.volume.value = 20 * Math.log10(velocityGain);

    // Start player
    player.start(time, 0, duration);
    this.activePlayers.set(noteId, player);

    // Schedule cleanup after note ends
    const cleanupDelay = (time - Tone.now() + duration) * 1000 + 50;
    setTimeout(() => {
      this.disposePlayer(noteId);
    }, Math.max(0, cleanupDelay));
  }

  /**
   * Dispose a specific player by note ID.
   */
  private disposePlayer(noteId: string): void {
    const player = this.activePlayers.get(noteId);
    if (player) {
      try {
        player.stop();
        player.dispose();
      } catch (err) {
        // Player may already be disposed
      }
      this.activePlayers.delete(noteId);
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
  }

  /**
   * Convert ticks to seconds using cached BPM and PPQ.
   */
  private ticksToSeconds(ticks: number): number {
    const beats = ticks / this.currentPpq;
    const secondsPerBeat = 60 / this.currentBpm;
    return beats * secondsPerBeat;
  }
}
