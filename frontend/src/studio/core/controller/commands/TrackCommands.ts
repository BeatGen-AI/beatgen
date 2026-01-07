import {
  Patch,
  PatchOperation,
  CommandContext,
  TrackVolumeChangeCommand,
  TrackPanChangeCommand,
  TrackMuteToggleCommand,
  TrackSoloToggleCommand,
  TrackPositionChangeCommand,
} from '../types';
import { DrumTrackRead } from '@/platform/types/dto/track_models/drum_track';
import { SamplerTrackRead } from '@/platform/types/dto/track_models/sampler_track';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find track index by ID.
 * Throws if track not found (fail loudly as per project guidelines).
 */
function findTrackIndex(context: CommandContext, trackId: string): number {
  const state = context.getState();
  const index = state.tracks.findIndex((t) => t.id === trackId);
  if (index === -1) {
    throw new Error(`Track not found: ${trackId}`);
  }
  return index;
}

/**
 * Find child sampler track indices for a drum track.
 */
function findChildSamplerIndices(
  context: CommandContext,
  drumTrackId: string
): number[] {
  const state = context.getState();
  const indices: number[] = [];

  state.tracks.forEach((track, index) => {
    if (track.track_type === 'SAMPLER') {
      const samplerData = track.track as SamplerTrackRead;
      if (samplerData.drum_track_id === drumTrackId) {
        indices.push(index);
      }
    }
  });

  return indices;
}

// ============================================================================
// TRACK VOLUME CHANGE
// ============================================================================

export function handleTrackVolumeChange(
  command: TrackVolumeChangeCommand,
  context: CommandContext
): Patch {
  const { trackId, volume } = command.payload;
  const state = context.getState();
  const trackIndex = findTrackIndex(context, trackId);
  const track = state.tracks[trackIndex];
  const oldVolume = track.volume;

  const operations: PatchOperation[] = [
    { op: 'replace', path: ['tracks', trackIndex, 'volume'], value: volume },
    { op: 'replace', path: ['tracks', trackIndex, 'dirty'], value: true },
  ];

  const inverse: PatchOperation[] = [
    { op: 'replace', path: ['tracks', trackIndex, 'volume'], value: oldVolume },
    // Don't undo dirty flag - track stays dirty until saved
  ];

  // If this is a drum track, also update child sampler tracks
  if (track.track_type === 'DRUM') {
    const childIndices = findChildSamplerIndices(context, trackId);
    for (const childIndex of childIndices) {
      const childTrack = state.tracks[childIndex];
      const childOldVolume = childTrack.volume;

      operations.push({
        op: 'replace',
        path: ['tracks', childIndex, 'volume'],
        value: volume,
      });
      operations.push({
        op: 'replace',
        path: ['tracks', childIndex, 'dirty'],
        value: true,
      });

      inverse.push({
        op: 'replace',
        path: ['tracks', childIndex, 'volume'],
        value: childOldVolume,
      });
    }
  }

  return {
    operations,
    inverse,
    affectedPaths: ['tracks'],
  };
}

// ============================================================================
// TRACK PAN CHANGE
// ============================================================================

export function handleTrackPanChange(
  command: TrackPanChangeCommand,
  context: CommandContext
): Patch {
  const { trackId, pan } = command.payload;
  const state = context.getState();
  const trackIndex = findTrackIndex(context, trackId);
  const oldPan = state.tracks[trackIndex].pan;

  const operations: PatchOperation[] = [
    { op: 'replace', path: ['tracks', trackIndex, 'pan'], value: pan },
    { op: 'replace', path: ['tracks', trackIndex, 'dirty'], value: true },
  ];

  const inverse: PatchOperation[] = [
    { op: 'replace', path: ['tracks', trackIndex, 'pan'], value: oldPan },
  ];

  return {
    operations,
    inverse,
    affectedPaths: ['tracks'],
  };
}

// ============================================================================
// TRACK MUTE TOGGLE
// ============================================================================

export function handleTrackMuteToggle(
  command: TrackMuteToggleCommand,
  context: CommandContext
): Patch {
  const { trackId, muted } = command.payload;
  const state = context.getState();
  const trackIndex = findTrackIndex(context, trackId);
  const track = state.tracks[trackIndex];
  const oldMuted = track.mute;

  const operations: PatchOperation[] = [
    { op: 'replace', path: ['tracks', trackIndex, 'mute'], value: muted },
    { op: 'replace', path: ['tracks', trackIndex, 'muted'], value: muted }, // Legacy compatibility
    { op: 'replace', path: ['tracks', trackIndex, 'dirty'], value: true },
  ];

  const inverse: PatchOperation[] = [
    { op: 'replace', path: ['tracks', trackIndex, 'mute'], value: oldMuted },
    { op: 'replace', path: ['tracks', trackIndex, 'muted'], value: oldMuted },
  ];

  // If this is a drum track, also update child sampler tracks
  if (track.track_type === 'DRUM') {
    const childIndices = findChildSamplerIndices(context, trackId);
    for (const childIndex of childIndices) {
      const childTrack = state.tracks[childIndex];
      const childOldMuted = childTrack.mute;

      operations.push({
        op: 'replace',
        path: ['tracks', childIndex, 'mute'],
        value: muted,
      });
      operations.push({
        op: 'replace',
        path: ['tracks', childIndex, 'muted'],
        value: muted,
      });
      operations.push({
        op: 'replace',
        path: ['tracks', childIndex, 'dirty'],
        value: true,
      });

      inverse.push({
        op: 'replace',
        path: ['tracks', childIndex, 'mute'],
        value: childOldMuted,
      });
      inverse.push({
        op: 'replace',
        path: ['tracks', childIndex, 'muted'],
        value: childOldMuted,
      });
    }
  }

  return {
    operations,
    inverse,
    affectedPaths: ['tracks'],
  };
}

// ============================================================================
// TRACK SOLO TOGGLE
// ============================================================================

export function handleTrackSoloToggle(
  command: TrackSoloToggleCommand,
  context: CommandContext
): Patch {
  const { trackId, soloed } = command.payload;
  const state = context.getState();
  const trackIndex = findTrackIndex(context, trackId);
  const track = state.tracks[trackIndex];
  const oldSoloed = (track as any).soloed ?? false;

  const operations: PatchOperation[] = [
    { op: 'replace', path: ['tracks', trackIndex, 'solo'], value: soloed },
    { op: 'replace', path: ['tracks', trackIndex, 'soloed'], value: soloed },
  ];

  const inverse: PatchOperation[] = [
    { op: 'replace', path: ['tracks', trackIndex, 'solo'], value: oldSoloed },
    { op: 'replace', path: ['tracks', trackIndex, 'soloed'], value: oldSoloed },
  ];

  // When toggling solo, we need to update the effective mute state of ALL tracks
  // If any track is soloed, all non-soloed tracks should be effectively muted
  // This is computed at audio engine sync time via buildPlaybackState, not stored
  // However, we track the solo state here for undo/redo

  // After this change, check if any track will be soloed
  const willAnySoloed = soloed || state.tracks.some((t, i) => {
    if (i === trackIndex) return soloed;
    return (t as any).soloed ?? false;
  });

  // Update mute states based on solo logic
  // If soloing: mute all non-soloed tracks
  // If un-soloing and no other track is soloed: restore original mute states
  state.tracks.forEach((t, i) => {
    if (i === trackIndex) return; // Already handled above

    const isSoloed = (t as any).soloed ?? false;
    const currentMute = t.mute;

    if (willAnySoloed) {
      // Some track is soloed - non-soloed tracks should be muted
      if (!isSoloed && !currentMute) {
        // This track is not soloed and not already muted - mute it
        // Note: We don't add these to inverse because we'll restore based on solo state
        // The audio engine computes effectiveMute from solo state
      }
    }
  });

  // Note: The actual mute behavior during solo is handled by buildPlaybackState
  // which computes effectiveMute based on solo state. We don't modify mute directly.

  return {
    operations,
    inverse,
    affectedPaths: ['tracks'],
  };
}

// ============================================================================
// TRACK POSITION CHANGE
// ============================================================================

export function handleTrackPositionChange(
  command: TrackPositionChangeCommand,
  context: CommandContext
): Patch {
  const { trackId, oldPosition, newPosition } = command.payload;
  const state = context.getState();
  const trackIndex = findTrackIndex(context, trackId);
  const track = state.tracks[trackIndex];

  const operations: PatchOperation[] = [];
  const inverse: PatchOperation[] = [];

  // Update position on track level (legacy)
  operations.push({
    op: 'replace',
    path: ['tracks', trackIndex, 'position'],
    value: { ...newPosition },
  });
  operations.push({
    op: 'replace',
    path: ['tracks', trackIndex, 'x_position'],
    value: newPosition.x,
  });
  operations.push({
    op: 'replace',
    path: ['tracks', trackIndex, 'y_position'],
    value: newPosition.y,
  });
  operations.push({
    op: 'replace',
    path: ['tracks', trackIndex, 'dirty'],
    value: true,
  });

  inverse.push({
    op: 'replace',
    path: ['tracks', trackIndex, 'position'],
    value: { ...oldPosition },
  });
  inverse.push({
    op: 'replace',
    path: ['tracks', trackIndex, 'x_position'],
    value: oldPosition.x,
  });
  inverse.push({
    op: 'replace',
    path: ['tracks', trackIndex, 'y_position'],
    value: oldPosition.y,
  });

  // Also update the first instance if it exists
  if (track.instances && track.instances.length > 0) {
    const firstInstance = track.instances[0];

    operations.push({
      op: 'replace',
      path: ['tracks', trackIndex, 'instances', 0, 'x_position'],
      value: newPosition.x,
    });

    inverse.push({
      op: 'replace',
      path: ['tracks', trackIndex, 'instances', 0, 'x_position'],
      value: firstInstance.x_position,
    });
  }

  return {
    operations,
    inverse,
    affectedPaths: ['tracks'],
  };
}

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

import { ProjectController } from '../ProjectController';

/**
 * Register all track command handlers with the controller.
 */
export function registerTrackCommands(controller: ProjectController): void {
  controller.registerHandler('TRACK_VOLUME_CHANGE', handleTrackVolumeChange);
  controller.registerHandler('TRACK_PAN_CHANGE', handleTrackPanChange);
  controller.registerHandler('TRACK_MUTE_TOGGLE', handleTrackMuteToggle);
  controller.registerHandler('TRACK_SOLO_TOGGLE', handleTrackSoloToggle);
  controller.registerHandler('TRACK_POSITION_CHANGE', handleTrackPositionChange);
}
