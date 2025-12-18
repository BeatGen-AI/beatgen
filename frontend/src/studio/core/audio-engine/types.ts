/**
 * Type definitions for the new decoupled Audio Engine.
 *
 * This engine receives all data via a declarative API (PlaybackState)
 * rather than pulling from the store. All transformations happen
 * in buildPlaybackState() before data enters the engine.
 */

// ============================================================================
// PLAYBACK STATE - The complete state needed for playback
// ============================================================================

/**
 * Complete state snapshot for playback.
 * This is the single input to the AudioEngine.
 */
export interface PlaybackState {
  /** Tempo in beats per minute */
  bpm: number;

  /** Time signature [numerator, denominator] e.g. [4, 4] */
  timeSignature: [number, number];

  /** Pulses per quarter note (typically 480) */
  ppq: number;

  /** All tracks ready for playback */
  tracks: PlaybackTrack[];

  /** Global master volume (0-100) */
  masterVolume: number;
}

// ============================================================================
// PLAYBACK TRACK - A track ready for playback
// ============================================================================

/** Track types in lowercase for the engine */
export type PlaybackTrackType = 'audio' | 'midi' | 'sampler' | 'drum';

/**
 * A track with all data pre-transformed for playback.
 */
export interface PlaybackTrack {
  /** Unique track identifier */
  id: string;

  /** Track type determines which renderer handles it */
  type: PlaybackTrackType;

  /** Display name (for debugging) */
  name: string;

  /** Volume level 0-100 */
  volume: number;

  /** Pan position -100 (left) to 100 (right) */
  pan: number;

  /** Whether track is muted */
  mute: boolean;

  /** Whether track is soloed */
  solo: boolean;

  /**
   * Effective mute state after solo logic is applied.
   * true if muted OR (any track is soloed AND this track isn't soloed).
   * Pre-computed by buildPlaybackState().
   */
  effectiveMute: boolean;

  /** Playback regions (from instances) */
  regions: PlaybackRegion[];

  /** Type-specific resources */
  resources: AudioResources | MidiResources | SamplerResources | DrumResources;
}

// ============================================================================
// PLAYBACK REGION - A segment of content on the timeline
// ============================================================================

/**
 * A region represents an instance's placement on the timeline.
 * Positions are absolute (in ticks from project start).
 */
export interface PlaybackRegion {
  /** Instance ID this region came from */
  id: string;

  /** Absolute start position on timeline (in ticks) */
  startTicks: number;

  /** Absolute end position on timeline (in ticks) */
  endTicks: number;

  /**
   * Offset into the source content (in ticks).
   * For trimmed regions, this is where to start reading from the source.
   * Corresponds to trim_start_ticks on the instance.
   */
  sourceOffsetTicks: number;

  /** Duration of this region (endTicks - startTicks) */
  durationTicks: number;
}

// ============================================================================
// PLAYBACK NOTE - A note ready for playback
// ============================================================================

/**
 * A MIDI note with absolute timeline position.
 * Pre-transformed from instance positions + trim by getInstanceNotesForPlayback().
 */
export interface PlaybackNote {
  /** MIDI pitch (0-127) */
  pitch: number;

  /** Absolute start position on timeline (in ticks) */
  startTicks: number;

  /** Duration in ticks */
  durationTicks: number;

  /** Velocity (0-127) */
  velocity: number;
}

// ============================================================================
// TYPE-SPECIFIC RESOURCES
// ============================================================================

/**
 * Resources for audio tracks (WAV, MP3, etc.)
 */
export interface AudioResources {
  type: 'audio';

  /** Reference to the loaded AudioBuffer (buffer ID = track ID) */
  bufferId: string;

  /** Total duration of the audio file in seconds */
  durationSeconds: number;

  /** Sample rate of the audio file */
  sampleRate: number;
}

/**
 * Resources for MIDI tracks (soundfont-based)
 */
export interface MidiResources {
  type: 'midi';

  /** Soundfont ID in the synthesizer (-1 until loaded) */
  soundfontId: number;

  /** Assigned MIDI channel (0-15, -1 until assigned by renderer) */
  channel: number;

  /** Instrument ID for reference */
  instrumentId: string;

  /**
   * Notes with ABSOLUTE timeline positions.
   * Pre-transformed from instance positions + trim.
   */
  notes: PlaybackNote[];
}

/**
 * Resources for sampler tracks (granular synthesis)
 */
export interface SamplerResources {
  type: 'sampler';

  /** Reference to the loaded sample buffer (buffer ID = track ID) */
  bufferId: string;

  /** Base MIDI note for pitch calculation (default 60 = Middle C) */
  baseMidiNote: number;

  /** Granular synthesis grain size in seconds */
  grainSize: number;

  /** Granular synthesis overlap (0-1) */
  overlap: number;

  /**
   * Notes with ABSOLUTE timeline positions.
   * Pre-transformed from instance positions + trim.
   */
  notes: PlaybackNote[];
}

/**
 * Resources for drum tracks.
 * Drum tracks are containers - their child sampler tracks are separate
 * entries in the tracks array. No special handling needed in playback.
 */
export interface DrumResources {
  type: 'drum';

  /** IDs of child sampler tracks (actual playback handled by those tracks) */
  samplerTrackIds: string[];

  /** Drum pattern as boolean grid (for UI purposes only) */
  pattern: boolean[][];
}

// ============================================================================
// ENGINE EVENTS
// ============================================================================

/** Playback state of the engine */
export type EnginePlaybackState = 'stopped' | 'playing' | 'paused';

/**
 * Event callbacks the engine can emit.
 */
export interface EngineEvents {
  /** Called on each animation frame with current position */
  onTimeUpdate: (ticks: number, seconds: number) => void;

  /** Called when playback state changes */
  onStateChange: (state: EnginePlaybackState) => void;

  /** Called when playback reaches the end */
  onEnd: () => void;

  /** Called on errors */
  onError: (error: Error, context: string) => void;
}

/** Function to unsubscribe from an event */
export type Unsubscribe = () => void;

// ============================================================================
// ENGINE CONFIGURATION
// ============================================================================

/**
 * Configuration options for the AudioEngine.
 */
export interface AudioEngineConfig {
  /** Latency hint for AudioContext */
  latencyHint: 'interactive' | 'balanced' | 'playback';

  /** Sample rate (defaults to system default if undefined) */
  sampleRate?: number;

  /** Lookahead time for scheduling in seconds */
  lookAhead: number;

  /** Update interval for time updates in ms */
  updateInterval: number;
}

/**
 * Default engine configuration.
 */
export const DEFAULT_ENGINE_CONFIG: AudioEngineConfig = {
  latencyHint: 'interactive',
  lookAhead: 0.1,
  updateInterval: 16.67, // ~60fps
};
