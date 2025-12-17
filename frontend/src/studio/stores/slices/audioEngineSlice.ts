/**
 * audioEngineSlice - Manages playback state using the new AudioEngine.
 *
 * This slice replaces the legacy transportSlice by:
 * - Using the new AudioEngine singleton
 * - Transforming state via buildPlaybackState()
 * - Subscribing to engine events for time/state updates
 * - Providing play/pause/stop/seek actions
 *
 * Phase 6 of the Audio Engine Refactor.
 */

import { getAudioEngine, AudioEngine } from '../../core/audio-engine/AudioEngine';
import { buildPlaybackState } from '../../core/playback/buildPlaybackState';
import { Unsubscribe } from '../../core/audio-engine/types';
import { GetFn, StoreSliceCreator, PlaybackCommand } from '../types';

// ============================================================================
// SLICE INTERFACE
// ============================================================================

export interface AudioEngineSlice {
  // State
  isPlaying: boolean;
  currentTime: number; // In seconds (for backward compatibility)
  currentTicks: number; // In ticks (new)
  isAudioEngineReady: boolean;

  // Actions
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setCurrentTicks: (ticks: number) => void;
  initializeAudioEngine: () => Promise<void>;
  playPause: () => Promise<void>;
  stop: () => Promise<void>;
  seekToPosition: (ticks: number) => void;
  seekToSeconds: (seconds: number) => void;
  handlePlaybackCommand: (command: PlaybackCommand, arg?: any) => Promise<void>;
  syncEngineState: () => void; // Manually trigger state sync to engine

  // Engine access (for advanced use)
  getAudioEngineInstance: () => AudioEngine;

  // Internal - subscriptions cleanup
  _audioEngineCleanup: (() => void) | null;
}

// ============================================================================
// SLICE CREATOR
// ============================================================================

export const createAudioEngineSlice: StoreSliceCreator<AudioEngineSlice> = (set, get) => {
  const rootGet = get as GetFn;
  const engine = getAudioEngine();

  // Track cleanup functions for engine subscriptions
  let cleanupFunctions: Unsubscribe[] = [];

  // Utility to set state within this slice
  const setAudioEngineState = (partial: Partial<AudioEngineSlice>) => set(partial);

  /**
   * Updates the engine's playback state from current store state.
   * Called after tracks, bpm, or other playback-relevant state changes.
   */
  const updateEngineState = () => {
    const state = rootGet();

    // [DEBUG] Log state sync attempt
    console.log('[DEBUG] audioEngineSlice.updateEngineState called', {
      engineReady: engine.isReady(),
      storeExists: !!state.store,
      trackCount: state.tracks?.length ?? 0,
      bpm: state.bpm,
    });

    // Don't update if engine isn't ready or store not initialized
    if (!engine.isReady() || !state.store) {
      console.log('[DEBUG] audioEngineSlice.updateEngineState: Skipping - engine not ready or store not initialized');
      return;
    }

    const midiManager = state.store.getMidiManager();
    if (!midiManager) {
      console.warn('audioEngineSlice: MidiManager not available');
      return;
    }

    try {
      console.log('[DEBUG] audioEngineSlice.updateEngineState: Building playback state');
      const playbackState = buildPlaybackState({
        tracks: state.tracks ?? [],
        midiManager,
        bpm: state.bpm ?? 120,
        timeSignature: state.timeSignature ?? [4, 4],
        masterVolume: 100,
      });

      console.log('[DEBUG] audioEngineSlice.updateEngineState: Setting engine state');
      engine.setState(playbackState);
    } catch (error) {
      console.error('audioEngineSlice: Error building playback state:', error);
    }
  };

  /**
   * Initialize the audio engine and set up event subscriptions.
   */
  const initializeAudioEngine = async () => {
    if (engine.isReady()) {
      console.log('audioEngineSlice: Engine already initialized');
      setAudioEngineState({ isAudioEngineReady: true });
      return;
    }

    try {
      await engine.initialize();

      // Subscribe to time updates
      const unsubTime = engine.onTimeUpdate((ticks, seconds) => {
        setAudioEngineState({
          currentTicks: ticks,
          currentTime: seconds,
        });
      });
      cleanupFunctions.push(unsubTime);

      // Subscribe to state changes
      const unsubState = engine.onStateChange((state) => {
        setAudioEngineState({
          isPlaying: state === 'playing',
        });
      });
      cleanupFunctions.push(unsubState);

      // Subscribe to errors
      const unsubError = engine.onError((error, context) => {
        console.error(`AudioEngine error [${context}]:`, error);
      });
      cleanupFunctions.push(unsubError);

      // Set cleanup function in state
      setAudioEngineState({
        isAudioEngineReady: true,
        _audioEngineCleanup: () => {
          cleanupFunctions.forEach(fn => fn());
          cleanupFunctions = [];
        },
      });

      console.log('audioEngineSlice: Engine initialized successfully');

      // Initial state update
      updateEngineState();
    } catch (error) {
      console.error('audioEngineSlice: Failed to initialize engine:', error);
      throw error;
    }
  };

  /**
   * Handle playback commands (play, pause, stop, seek).
   */
  const handlePlaybackCommand = async (command: PlaybackCommand, arg?: any) => {
    // [DEBUG] Log command handling
    console.log('[DEBUG] audioEngineSlice.handlePlaybackCommand', {
      command,
      arg,
      engineReady: engine.isReady(),
    });

    if (!engine.isReady()) {
      console.error('audioEngineSlice: Engine not ready for command:', command);
      return;
    }

    // Update engine state before playing to ensure latest track state
    if (command === 'play') {
      console.log('[DEBUG] audioEngineSlice: Updating engine state before play');
      updateEngineState();
    }

    switch (command) {
      case 'play':
        console.log('[DEBUG] audioEngineSlice: Calling engine.play()');
        engine.play();
        break;
      case 'pause':
        engine.pause();
        break;
      case 'stop':
        engine.stop();
        // Reset time in store
        setAudioEngineState({ currentTime: 0, currentTicks: 0 });
        break;
      case 'seek':
        if (typeof arg === 'number') {
          engine.seek(arg);
        } else {
          console.error('audioEngineSlice: Seek command requires a numeric argument');
        }
        break;
      default:
        console.error(`audioEngineSlice: Unknown command: ${command}`);
    }
  };

  return {
    // Initial state
    isPlaying: false,
    currentTime: 0,
    currentTicks: 0,
    isAudioEngineReady: false,
    _audioEngineCleanup: null,

    // Basic setters
    setIsPlaying: (isPlaying) => setAudioEngineState({ isPlaying }),
    setCurrentTime: (time) => setAudioEngineState({ currentTime: time }),
    setCurrentTicks: (ticks) => setAudioEngineState({ currentTicks: ticks }),

    // Actions
    initializeAudioEngine,
    handlePlaybackCommand,

    playPause: async () => {
      const currentlyPlaying = rootGet().isPlaying;
      await handlePlaybackCommand(currentlyPlaying ? 'pause' : 'play');
    },

    stop: async () => {
      await handlePlaybackCommand('stop');
    },

    seekToPosition: (ticks) => {
      handlePlaybackCommand('seek', ticks);
    },

    seekToSeconds: (seconds) => {
      // Convert seconds to ticks: ticks = seconds * (bpm / 60) * ppq
      const state = rootGet();
      const bpm = state.bpm ?? 120;
      const ppq = 480; // MUSIC_CONSTANTS.pulsesPerQuarterNote
      const ticks = Math.round(seconds * (bpm / 60) * ppq);
      handlePlaybackCommand('seek', ticks);
    },

    syncEngineState: () => {
      updateEngineState();
    },

    // Engine access
    getAudioEngineInstance: () => engine,
  };
};

// ============================================================================
// HELPER FUNCTION FOR STATE SYNC
// ============================================================================

/**
 * Call this function when tracks, bpm, or other playback-relevant state changes.
 * This ensures the AudioEngine has the latest state.
 *
 * Can be called from track update actions, BPM changes, etc.
 */
export function syncAudioEngineState(get: GetFn): void {
  const engine = getAudioEngine();
  if (!engine.isReady()) {
    return;
  }

  const state = get();
  const midiManager = state.store?.getMidiManager();

  if (!midiManager) {
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

    engine.setState(playbackState);
  } catch (error) {
    console.error('syncAudioEngineState: Error:', error);
  }
}
