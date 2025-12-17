/**
 * buildPlaybackState - Transforms application state to engine state.
 *
 * This is the single point where all data transformations happen.
 * The resulting PlaybackState is the sole input to the AudioEngine.
 *
 * Key responsibilities:
 * - Convert CombinedTrackEntity[] to PlaybackTrack[]
 * - Pre-compute instance positions to absolute timeline
 * - Transform MIDI notes with trim/position offsets (via MidiManager)
 * - Resolve solo/mute logic (effectiveMute)
 *
 * This function is PURE - no side effects, memoizable by consumers.
 */

import {
  PlaybackState,
  PlaybackTrack,
  PlaybackTrackType,
  PlaybackRegion,
  PlaybackNote,
  AudioResources,
  MidiResources,
  SamplerResources,
  DrumResources,
} from '../audio-engine/types';
import { CombinedTrackEntity } from '@/platform/types/entities/project';
import {
  AudioTrackRead,
  MidiTrackRead,
  SamplerTrackRead,
  DrumTrackRead,
  TrackInstance,
} from '@/platform/types/dto/project';
import { MidiManager } from '../midi/MidiManagerNew';
import { MUSIC_CONSTANTS } from '@/studio/constants/musicConstants';

// ============================================================================
// PUBLIC API
// ============================================================================

export interface BuildPlaybackStateOptions {
  tracks: CombinedTrackEntity[];
  midiManager: MidiManager | null;
  bpm: number;
  timeSignature?: [number, number];
  masterVolume?: number;
}

/**
 * Transforms application state into playback state.
 * This is the single point where all data transformations happen.
 *
 * @param options - Application state to transform
 * @returns PlaybackState ready for the AudioEngine
 */
export function buildPlaybackState(options: BuildPlaybackStateOptions): PlaybackState {
  const {
    tracks,
    midiManager,
    bpm,
    timeSignature = [4, 4],
    masterVolume = 100,
  } = options;

  // Handle null MidiManager - can happen during initialization
  if (!midiManager) {
    console.warn('buildPlaybackState: MidiManager not available, returning empty state');
    return {
      bpm,
      timeSignature,
      ppq: MUSIC_CONSTANTS.pulsesPerQuarterNote,
      tracks: [],
      masterVolume,
    };
  }

  // Check if any track is soloed - affects effectiveMute for all tracks
  const hasSoloedTrack = tracks.some(t => t.solo);

  // Transform each track, filtering out any nulls from unknown types
  const playbackTracks: PlaybackTrack[] = [];

  for (const track of tracks) {
    // Skip invalid tracks
    if (!track.id || !track.track_type) {
      console.warn('buildPlaybackState: Skipping invalid track', track);
      continue;
    }

    try {
      const playbackTrack = transformTrack(track, midiManager, hasSoloedTrack);
      if (playbackTrack !== null) {
        playbackTracks.push(playbackTrack);
      }
    } catch (error) {
      // Log error but continue processing other tracks
      // Don't let one bad track break everything
      console.error(`buildPlaybackState: Error transforming track ${track.id}:`, error);
    }
  }

  return {
    bpm,
    timeSignature,
    ppq: MUSIC_CONSTANTS.pulsesPerQuarterNote,
    tracks: playbackTracks,
    masterVolume,
  };
}

// ============================================================================
// TRACK TRANSFORMATION
// ============================================================================

/**
 * Transform a single track to playback format.
 * Returns null for unknown track types.
 */
function transformTrack(
  track: CombinedTrackEntity,
  midiManager: MidiManager,
  hasSoloedTrack: boolean
): PlaybackTrack | null {
  // Compute effective mute (considering solo)
  // Muted if explicitly muted OR (any track is soloed AND this track isn't soloed)
  const effectiveMute = track.mute || (hasSoloedTrack && !track.solo);

  // Get instances - handle both Entity (instances) and DTO (instance_metadata) property names
  const instances: TrackInstance[] = track.instances || track.instance_metadata || [];

  // Build regions from instances
  const regions = buildRegions(track, instances);

  // Build type-specific resources
  const resources = buildResources(track, midiManager, instances);
  if (resources === null) {
    // Unknown track type
    return null;
  }

  // Convert track type to lowercase for the engine
  const type = track.track_type.toLowerCase() as PlaybackTrackType;

  return {
    id: track.id,
    type,
    name: track.name,
    volume: track.volume ?? 80,
    pan: track.pan ?? 0,
    mute: track.mute ?? false,
    solo: track.solo ?? false,
    effectiveMute,
    regions,
    resources,
  };
}

// ============================================================================
// REGION BUILDING
// ============================================================================

/**
 * Build playback regions from track instances.
 */
function buildRegions(track: CombinedTrackEntity, instances: TrackInstance[]): PlaybackRegion[] {
  if (instances.length === 0) {
    // Create a default region at position 0 with full track duration
    return [{
      id: `${track.id}_default`,
      startTicks: 0,
      endTicks: track.duration_ticks ?? 0,
      sourceOffsetTicks: 0,
      durationTicks: track.duration_ticks ?? 0,
    }];
  }

  return instances.map(instance => {
    const trimStart = instance.trim_start_ticks ?? 0;
    const trimEnd = instance.trim_end_ticks ?? track.duration_ticks ?? 0;
    const duration = trimEnd - trimStart;

    return {
      id: instance.id,
      startTicks: instance.x_position ?? 0,
      endTicks: (instance.x_position ?? 0) + duration,
      sourceOffsetTicks: trimStart,
      durationTicks: duration,
    };
  });
}

// ============================================================================
// RESOURCE BUILDING
// ============================================================================

/**
 * Build type-specific resources.
 * Returns null for unknown track types.
 */
function buildResources(
  track: CombinedTrackEntity,
  midiManager: MidiManager,
  instances: TrackInstance[]
): AudioResources | MidiResources | SamplerResources | DrumResources | null {
  switch (track.track_type) {
    case 'AUDIO':
      return buildAudioResources(track);
    case 'MIDI':
      return buildMidiResources(track, midiManager, instances);
    case 'SAMPLER':
      return buildSamplerResources(track, midiManager, instances);
    case 'DRUM':
      return buildDrumResources(track);
    default:
      console.warn(`buildPlaybackState: Unknown track type: ${track.track_type}`);
      return null;
  }
}

/**
 * Build audio track resources.
 */
function buildAudioResources(track: CombinedTrackEntity): AudioResources {
  const audioTrack = track.track as AudioTrackRead;

  return {
    type: 'audio',
    bufferId: track.id,
    durationSeconds: audioTrack?.audio_file_duration ?? 0,
    sampleRate: audioTrack?.audio_file_sample_rate ?? 44100,
  };
}

/**
 * Build MIDI track resources with pre-transformed notes.
 */
function buildMidiResources(
  track: CombinedTrackEntity,
  midiManager: MidiManager,
  instances: TrackInstance[]
): MidiResources {
  const midiTrack = track.track as MidiTrackRead;
  const allNotes: PlaybackNote[] = [];

  // Get notes for each instance
  const effectiveInstances = instances.length > 0 ? instances : [{
    id: `${track.id}_default`,
    x_position: 0,
    y_position: 0,
    trim_start_ticks: 0,
    trim_end_ticks: track.duration_ticks ?? 0,
  }];

  for (const instance of effectiveInstances) {
    try {
      // MidiManager.getInstanceNotesForPlayback() returns notes with
      // absolute timeline positions (column already adjusted by x_position)
      const instanceNotes = midiManager.getInstanceNotesForPlayback(
        track.id,
        instance.id,
        instance.x_position ?? 0,
        instance.trim_start_ticks ?? 0,
        instance.trim_end_ticks ?? track.duration_ticks ?? 0
      );

      // Transform to PlaybackNote format
      for (const note of instanceNotes) {
        allNotes.push({
          pitch: note.row,
          startTicks: note.column, // Already absolute from getInstanceNotesForPlayback
          durationTicks: note.length,
          velocity: note.velocity ?? 100,
        });
      }
    } catch (error) {
      console.error(`buildMidiResources: Error getting notes for instance ${instance.id}:`, error);
    }
  }

  // Sort notes by start time for efficient playback
  allNotes.sort((a, b) => a.startTicks - b.startTicks);

  return {
    type: 'midi',
    soundfontId: -1, // Set when soundfont is loaded by renderer
    channel: -1, // Assigned by renderer
    instrumentId: midiTrack?.instrument_id ?? '',
    notes: allNotes,
  };
}

/**
 * Build sampler track resources with pre-transformed notes.
 */
function buildSamplerResources(
  track: CombinedTrackEntity,
  midiManager: MidiManager,
  instances: TrackInstance[]
): SamplerResources {
  const samplerTrack = track.track as SamplerTrackRead;
  const allNotes: PlaybackNote[] = [];

  const effectiveInstances = instances.length > 0 ? instances : [{
    id: `${track.id}_default`,
    x_position: 0,
    y_position: 0,
    trim_start_ticks: 0,
    trim_end_ticks: track.duration_ticks ?? 0,
  }];

  for (const instance of effectiveInstances) {
    try {
      const instanceNotes = midiManager.getInstanceNotesForPlayback(
        track.id,
        instance.id,
        instance.x_position ?? 0,
        instance.trim_start_ticks ?? 0,
        instance.trim_end_ticks ?? track.duration_ticks ?? 0
      );

      for (const note of instanceNotes) {
        allNotes.push({
          pitch: note.row,
          startTicks: note.column,
          durationTicks: note.length,
          velocity: note.velocity ?? 100,
        });
      }
    } catch (error) {
      console.error(`buildSamplerResources: Error getting notes for instance ${instance.id}:`, error);
    }
  }

  allNotes.sort((a, b) => a.startTicks - b.startTicks);

  return {
    type: 'sampler',
    bufferId: track.id,
    baseMidiNote: samplerTrack?.base_midi_note ?? 60,
    grainSize: samplerTrack?.grain_size ?? 0.1,
    overlap: samplerTrack?.overlap ?? 0.1,
    notes: allNotes,
  };
}

/**
 * Build drum track resources.
 * Drum tracks are just containers - their child sampler tracks are
 * separate entries in the tracks array and handled independently.
 */
function buildDrumResources(track: CombinedTrackEntity): DrumResources {
  const drumTrack = track.track as DrumTrackRead;

  return {
    type: 'drum',
    samplerTrackIds: drumTrack?.sampler_track_ids ?? [],
    pattern: [], // Pattern for UI purposes only, not used in playback
  };
}
