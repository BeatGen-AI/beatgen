import { SideEffect, Patch, Command, CommandContext } from '../types';
import { buildPlaybackState } from '../../playback/buildPlaybackState';

/**
 * AudioEngineSideEffect - Synchronizes audio engine state after mutations.
 *
 * This side effect replaces the scattered `syncEngineState()` calls that were
 * previously in tracksSlice and usePlayback.
 *
 * Key behaviors:
 * - Only syncs when playback is active (isPlaying === true)
 * - Only syncs for patches that affect playback-relevant state
 * - Uses buildPlaybackState to transform application state to engine state
 */
export class AudioEngineSideEffect implements SideEffect {
  name = 'AudioEngine';

  /**
   * Determine if this side effect should run for the given patch/command.
   * Only run for changes that affect playback.
   */
  shouldRun(patch: Patch, _command: Command): boolean {
    // Playback-relevant paths
    const playbackPaths = ['tracks', 'bpm', 'timeSignature'];

    return patch.affectedPaths.some((path) =>
      playbackPaths.some((playbackPath) => path.startsWith(playbackPath))
    );
  }

  /**
   * Sync the audio engine after a patch is applied.
   */
  afterPatch(
    _patch: Patch,
    _command: Command,
    context: CommandContext
  ): void {
    const { audioEngine, midiManager, getState } = context;
    const state = getState();

    // Only sync when playing
    if (!state.isPlaying) {
      return;
    }

    // Check if engine is ready
    if (!audioEngine.isReady()) {
      console.warn('AudioEngineSideEffect: Engine not ready, skipping sync');
      return;
    }

    try {
      const playbackState = buildPlaybackState({
        tracks: state.tracks ?? [],
        midiManager,
        bpm: state.bpm ?? 120,
        timeSignature: state.timeSignature ?? [4, 4],
        masterVolume: 100,
      });

      audioEngine.setState(playbackState);
    } catch (error) {
      console.error('AudioEngineSideEffect: Error syncing state:', error);
      // Don't rethrow - side effects shouldn't break the mutation
    }
  }
}
