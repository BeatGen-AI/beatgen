/**
 * MidiChannelPlayer - Per-track MIDI player wrapping js-synthesizer sequencer.
 *
 * Phase 3 of the Audio Engine Refactor.
 *
 * This class manages a single MIDI channel's playback with its assigned soundfont.
 * It wraps the js-synthesizer ISequencer and handles note scheduling, tempo changes,
 * and playback controls.
 *
 * Patterns adapted from SequencerWrapper but simplified since buildPlaybackState()
 * already pre-transforms notes with absolute timeline positions.
 */

import { AudioWorkletNodeSynthesizer, ISequencer } from 'js-synthesizer';
import { PlaybackNote } from '../types';

/**
 * Event format for js-synthesizer sequencer.
 */
interface SequencerEvent {
  tick: number;
  event: {
    type: 'note';
    channel: number;
    key: number;
    vel: number;
    duration: number;
  };
}

/**
 * Configuration for creating a MidiChannelPlayer.
 */
export interface MidiChannelPlayerConfig {
  synth: AudioWorkletNodeSynthesizer;
  soundfontId: number;
  channel: number;
  bpm: number;
  ppq: number;
}

/**
 * Manages MIDI playback for a single track/channel.
 */
export class MidiChannelPlayer {
  private synth: AudioWorkletNodeSynthesizer;
  private sequencer: ISequencer | null = null;
  private channel: number;
  private soundfontId: number;
  private bpm: number;
  private ppq: number;

  private notes: PlaybackNote[] = [];
  private events: SequencerEvent[] = [];
  private isPlaying: boolean = false;
  private isMuted: boolean = false;
  private volume: number = 100; // 0-127

  constructor(config: MidiChannelPlayerConfig) {
    this.synth = config.synth;
    this.soundfontId = config.soundfontId;
    this.channel = config.channel;
    this.bpm = config.bpm;
    this.ppq = config.ppq;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the channel player.
   * Creates sequencer, sets bank offset, and selects program.
   */
  async initialize(): Promise<void> {
    // Set bank offset to prevent soundfont conflicts
    const bankOffset = this.soundfontId * 100;
    this.synth.setSFontBankOffset(this.soundfontId, bankOffset);

    // Create sequencer
    this.sequencer = await this.synth.createSequencer();
    await this.sequencer.registerSynthesizer(this.synth);

    // Apply tempo
    this.applyTimeScale();

    // Select program (first available preset)
    try {
      const soundfontObject = await this.synth.getSFontObject(this.soundfontId);
      const presetIterable = await soundfontObject.getPresetIterable();
      const presets = [...presetIterable];

      if (presets.length > 0) {
        const firstPreset = presets[0];
        const bankWithOffset = firstPreset.bankNum + bankOffset;
        this.synth.midiProgramSelect(
          this.channel,
          this.soundfontId,
          bankWithOffset,
          firstPreset.num
        );
        console.log(
          `MidiChannelPlayer: Channel ${this.channel} using preset ${firstPreset.num} from bank ${bankWithOffset}`
        );
      } else {
        console.warn(
          `MidiChannelPlayer: No presets found in soundfont ${this.soundfontId}`
        );
      }
    } catch (err) {
      console.error(
        `MidiChannelPlayer: Failed to select program for soundfont ${this.soundfontId}:`,
        err
      );
      throw err;
    }

    // Set initial volume
    this.applyVolume();

    console.log(
      `MidiChannelPlayer: Initialized channel ${this.channel} with soundfont ${this.soundfontId}`
    );
  }

  // ============================================================================
  // NOTE MANAGEMENT
  // ============================================================================

  /**
   * Update the notes for this track.
   * Converts PlaybackNote[] to sequencer events.
   */
  setNotes(notes: PlaybackNote[]): void {
    this.notes = notes;
    this.events = this.convertNotesToEvents(notes);

    // If playing, reschedule events
    if (this.isPlaying && this.sequencer) {
      // We need to get current position and reschedule
      // For simplicity, we'll let the next play() call handle rescheduling
      console.log(
        `MidiChannelPlayer: Updated ${notes.length} notes on channel ${this.channel}`
      );
    }
  }

  /**
   * Convert PlaybackNote array to sequencer events.
   */
  private convertNotesToEvents(notes: PlaybackNote[]): SequencerEvent[] {
    return notes.map((note) => ({
      tick: note.startTicks,
      event: {
        type: 'note' as const,
        channel: this.channel,
        key: note.pitch,
        vel: note.velocity,
        duration: note.durationTicks,
      },
    }));
  }

  // ============================================================================
  // PLAYBACK CONTROLS
  // ============================================================================

  /**
   * Start playback from a position.
   */
  async play(fromTick: number): Promise<void> {
    if (!this.sequencer) {
      console.error('MidiChannelPlayer: Cannot play - sequencer not initialized');
      return;
    }

    if (this.isMuted) {
      return;
    }

    this.isPlaying = true;

    // Get current sequencer tick
    const currentTick = await this.sequencer.getTick();

    // If sequencer position doesn't match where we want to start,
    // recreate it for clean state
    if (Math.abs(currentTick - fromTick) > 10) {
      await this.recreateSequencer();
    }

    // Schedule events from the given position
    this.scheduleEventsFrom(fromTick);

    console.log(
      `MidiChannelPlayer: Playing channel ${this.channel} from tick ${fromTick}`
    );
  }

  /**
   * Pause playback.
   */
  pause(): void {
    this.isPlaying = false;
    this.silence();
    console.log(`MidiChannelPlayer: Paused channel ${this.channel}`);
  }

  /**
   * Stop playback and reset.
   */
  async stop(): Promise<void> {
    this.isPlaying = false;
    this.silence();

    // Recreate sequencer for clean state
    await this.recreateSequencer();

    console.log(`MidiChannelPlayer: Stopped channel ${this.channel}`);
  }

  /**
   * Seek to a position.
   */
  async seek(toTick: number, shouldContinuePlaying: boolean): Promise<void> {
    // Stop current playback
    this.silence();

    // Recreate sequencer for clean state
    await this.recreateSequencer();

    // If should continue playing, schedule events from new position
    if (shouldContinuePlaying && !this.isMuted) {
      this.isPlaying = true;
      this.scheduleEventsFrom(toTick);
    }

    console.log(
      `MidiChannelPlayer: Seeked channel ${this.channel} to tick ${toTick}`
    );
  }

  // ============================================================================
  // MIXING CONTROLS
  // ============================================================================

  /**
   * Set volume (0-100, converted to 0-127 with dB curve matching AudioTrackRenderer).
   *
   * AudioTrackRenderer uses: dB = -60 + (volume/100) * 66
   * This gives: 0% = -60dB, 50% = -27dB, 100% = +6dB
   *
   * We match this by:
   * 1. Converting volume to dB using the same formula
   * 2. Converting dB to linear ratio: linear = 10^(dB/20)
   * 3. Scaling to MIDI 0-127
   */
  setVolume(volume: number): void {
    const safeVolume = Math.max(0, Math.min(100, volume));

    if (safeVolume <= 0) {
      this.volume = 0;
      this.applyVolume();
      return;
    }

    // Match AudioTrackRenderer's dB formula: -60dB to +6dB
    const dB = -60 + (safeVolume / 100) * 66;

    // Convert dB to linear ratio (0 to ~2 for +6dB)
    const linear = Math.pow(10, dB / 20);

    // Scale to MIDI 0-127
    // At +6dB, linear ≈ 2.0, so we normalize to make 100% = 127
    // linear at +6dB = 10^(6/20) ≈ 1.995
    const maxLinear = Math.pow(10, 6 / 20);
    const midiVolume = Math.round((linear / maxLinear) * 127);

    this.volume = Math.max(0, Math.min(127, midiVolume));
    this.applyVolume();
  }

  /**
   * Set mute state.
   */
  setMute(muted: boolean): void {
    const wasMuted = this.isMuted;
    this.isMuted = muted;

    if (muted && !wasMuted) {
      // Muting - silence notes and set volume to 0
      this.silence();
      this.synth.midiControl(this.channel, 7, 0);
    } else if (!muted && wasMuted) {
      // Unmuting - restore volume
      this.applyVolume();
    }
  }

  // ============================================================================
  // TEMPO
  // ============================================================================

  /**
   * Set BPM for tempo calculations.
   */
  setBpm(bpm: number): void {
    if (bpm <= 0) {
      console.warn(`MidiChannelPlayer: Invalid BPM ${bpm}`);
      return;
    }

    this.bpm = bpm;
    this.applyTimeScale();
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Dispose all resources.
   */
  async dispose(): Promise<void> {
    this.silence();

    if (this.sequencer) {
      this.sequencer.removeAllEvents();
      await this.sequencer.close();
      this.sequencer = null;
    }

    console.log(`MidiChannelPlayer: Disposed channel ${this.channel}`);
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getChannel(): number {
    return this.channel;
  }

  getSoundfontId(): number {
    return this.soundfontId;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Apply volume to the MIDI channel.
   */
  private applyVolume(): void {
    if (this.isMuted) {
      this.synth.midiControl(this.channel, 7, 0);
    } else {
      this.synth.midiControl(this.channel, 7, this.volume);
    }
  }

  /**
   * Apply time scale based on BPM and PPQ.
   */
  private applyTimeScale(): void {
    if (!this.sequencer) return;

    // ticksPerSecond = (BPM * PPQ) / 60
    const ticksPerSecond = (this.bpm * this.ppq) / 60;
    this.sequencer.setTimeScale(ticksPerSecond);
  }

  /**
   * Silence all notes on this channel.
   */
  private silence(): void {
    // All notes off
    this.synth.midiAllNotesOff(this.channel);

    // Clear scheduled events
    if (this.sequencer) {
      this.sequencer.removeAllEvents();
    }
  }

  /**
   * Recreate the sequencer for clean state.
   */
  private async recreateSequencer(): Promise<void> {
    if (this.sequencer) {
      this.silence();
      try {
        await this.sequencer.close();
      } catch (err) {
        console.warn('MidiChannelPlayer: Error closing sequencer:', err);
      }
    }

    this.sequencer = await this.synth.createSequencer();
    await this.sequencer.registerSynthesizer(this.synth);
    this.applyTimeScale();
  }

  /**
   * Schedule events starting from a tick position.
   */
  private scheduleEventsFrom(fromTick: number): void {
    if (!this.sequencer) return;

    // Clear any existing events
    this.sequencer.removeAllEvents();

    // Schedule events that start at or after fromTick
    let scheduledCount = 0;
    for (const event of this.events) {
      if (event.tick >= fromTick) {
        // Calculate relative position from current tick
        const relativeTick = event.tick - fromTick;
        this.sequencer.sendEventAt(event.event as any, relativeTick, false);
        scheduledCount++;
      }
    }

    console.log(
      `MidiChannelPlayer: Scheduled ${scheduledCount}/${this.events.length} events from tick ${fromTick} on channel ${this.channel}`
    );
  }
}
