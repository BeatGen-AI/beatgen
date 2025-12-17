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
 * Key behaviors for drum tracks:
 * - Drum tracks are containers and do NOT go to the audio engine
 * - Drum track mute/solo/volume state is propagated to child sampler tracks
 * - If drum is muted, all children are effectively muted
 * - If drum is soloed, all children play (and other non-soloed tracks are muted)
 * - Child volume is multiplied by parent drum volume
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

  // [DEBUG] Log input
  console.log('[DEBUG] buildPlaybackState called', {
    inputTrackCount: tracks.length,
    inputTracks: tracks.map(t => ({
      id: t.id,
      name: t.name,
      track_type: t.track_type,
      mute: t.mute,
      solo: t.solo,
      instanceCount: (t.instances || t.instance_metadata || []).length,
      instances: (t.instances || t.instance_metadata || []).map((i: TrackInstance) => ({
        id: i.id,
        x_position: i.x_position,
        trim_start_ticks: i.trim_start_ticks,
        trim_end_ticks: i.trim_end_ticks,
      })),
    })),
    bpm,
    hasMidiManager: !!midiManager,
  });

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

  // 1. Build parent-child map for drum tracks (samplerTrackId -> drumTrackId)
  const drumChildMap = new Map<string, string>();
  for (const track of tracks) {
    if (track.track_type === 'DRUM') {
      const drumTrack = track.track as DrumTrackRead;
      for (const childId of drumTrack?.sampler_track_ids ?? []) {
        drumChildMap.set(childId, track.id);
      }
    }
  }

  // 2. Build drum track lookup (drumTrackId -> track)
  const drumTrackMap = new Map<string, CombinedTrackEntity>(
    tracks.filter(t => t.track_type === 'DRUM').map(t => [t.id, t])
  );

  // 3. Check if any track (including drum tracks) is soloed
  const hasSoloedTrack = tracks.some(t => t.solo);

  // 4. Transform tracks, applying parent drum state to children
  const playbackTracks: PlaybackTrack[] = [];

  for (const track of tracks) {
    // Skip invalid tracks
    if (!track.id || !track.track_type) {
      console.warn('buildPlaybackState: Skipping invalid track', track);
      continue;
    }

    // Skip drum tracks - they are containers and don't go to the engine
    // Their state is propagated to child sampler tracks below
    if (track.track_type === 'DRUM') {
      continue;
    }

    try {
      // Check if this track is a drum child
      const parentDrumId = drumChildMap.get(track.id);
      const parentDrum = parentDrumId ? drumTrackMap.get(parentDrumId) : undefined;

      // Compute effective mute considering parent drum track
      // Muted if: explicit mute OR parent muted OR (any solo AND neither this nor parent soloed)
      const effectiveMute =
        track.mute ||
        (parentDrum?.mute ?? false) ||
        (hasSoloedTrack && !track.solo && !(parentDrum?.solo ?? false));

      // Compute effective volume (multiply with parent drum volume)
      const effectiveVolume = parentDrum
        ? ((track.volume ?? 80) / 100) * ((parentDrum.volume ?? 80) / 100) * 100
        : (track.volume ?? 80);

      const playbackTrack = transformTrack(
        track,
        midiManager,
        effectiveMute,
        effectiveVolume
      );
      if (playbackTrack !== null) {
        playbackTracks.push(playbackTrack);
      }
    } catch (error) {
      // Log error but continue processing other tracks
      // Don't let one bad track break everything
      console.error(`buildPlaybackState: Error transforming track ${track.id}:`, error);
    }
  }

  // [DEBUG] Log output
  console.log('[DEBUG] buildPlaybackState output', {
    bpm,
    outputTrackCount: playbackTracks.length,
    outputTracks: playbackTracks.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      effectiveMute: t.effectiveMute,
      regionsCount: t.regions.length,
      regions: t.regions.map(r => ({
        id: r.id,
        startTicks: r.startTicks,
        endTicks: r.endTicks,
        sourceOffsetTicks: r.sourceOffsetTicks,
        durationTicks: r.durationTicks,
      })),
    })),
  });

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
 *
 * @param track - The track to transform
 * @param midiManager - MidiManager for note transformation
 * @param effectiveMute - Pre-computed effective mute (considers solo + parent drum state)
 * @param effectiveVolume - Pre-computed effective volume (considers parent drum state)
 */
function transformTrack(
  track: CombinedTrackEntity,
  midiManager: MidiManager,
  effectiveMute: boolean,
  effectiveVolume: number
): PlaybackTrack | null {
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
    volume: effectiveVolume,
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
): AudioResources | MidiResources | SamplerResources | null {
  switch (track.track_type) {
    case 'AUDIO':
      return buildAudioResources(track);
    case 'MIDI':
      return buildMidiResources(track, midiManager, instances);
    case 'SAMPLER':
      return buildSamplerResources(track, midiManager, instances);
    case 'DRUM':
      // Drum tracks are skipped in buildPlaybackState() - they don't go to the engine.
      // If we reach here, something is wrong.
      throw new Error(`buildResources: DRUM tracks should be filtered out before this point`);
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

