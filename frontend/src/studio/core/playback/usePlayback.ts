/**
 * usePlayback - React hook bridging the store to the AudioEngine.
 *
 * This hook:
 * - Gets state from the Zustand store
 * - Transforms it via buildPlaybackState()
 * - Sends it to the AudioEngine via setState()
 * - Subscribes to engine events and returns current state
 * - Provides play/pause/stop/seek actions
 *
 * The hook handles the bridge between React/Zustand and the AudioEngine.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useStudioStore } from '@/studio/stores/studioStore';
import { getAudioEngine, AudioEngine } from '../audio-engine/AudioEngine';
import { buildPlaybackState } from './buildPlaybackState';
import { EnginePlaybackState } from '../audio-engine/types';

// ============================================================================
// TYPES
// ============================================================================

export interface UsePlaybackReturn {
  // State
  /** Whether the engine is currently playing */
  isPlaying: boolean;
  /** Whether the engine is paused */
  isPaused: boolean;
  /** Whether the engine is stopped */
  isStopped: boolean;
  /** Current playback position in ticks */
  currentTicks: number;
  /** Current playback position in seconds */
  currentSeconds: number;
  /** Whether the engine is initialized and ready */
  isReady: boolean;

  // Actions
  /** Start or resume playback */
  play: () => void;
  /** Pause playback at current position */
  pause: () => void;
  /** Stop playback and reset to beginning */
  stop: () => void;
  /** Seek to a specific position in ticks */
  seek: (ticks: number) => void;
  /** Toggle between play and pause */
  togglePlayPause: () => void;

  // Engine access (for advanced use)
  /** Direct access to the AudioEngine instance */
  engine: AudioEngine;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * React hook for controlling audio playback.
 * Bridges the Zustand store to the AudioEngine.
 */
export function usePlayback(): UsePlaybackReturn {
  const engineRef = useRef(getAudioEngine());

  // Get state from store using individual selectors for optimal re-rendering
  const tracks = useStudioStore(s => s.tracks);
  const store = useStudioStore(s => s.store);
  const bpm = useStudioStore(s => s.bpm ?? 120);
  const timeSignature = useStudioStore(s => s.timeSignature ?? [4, 4] as [number, number]);

  // Get MidiManager from store
  const midiManager = useMemo(() => {
    return store?.getMidiManager?.() ?? null;
  }, [store]);

  // Local state for current position (updated by engine events)
  const [currentTicks, setCurrentTicks] = useState(0);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [playbackState, setPlaybackState] = useState<EnginePlaybackState>('stopped');
  const [isReady, setIsReady] = useState(false);

  // Initialize engine on mount
  useEffect(() => {
    const engine = engineRef.current;

    const init = async () => {
      if (!engine.isReady()) {
        try {
          await engine.initialize();
          setIsReady(true);
        } catch (error) {
          console.error('usePlayback: Failed to initialize engine:', error);
        }
      } else {
        setIsReady(true);
      }
    };

    init();

    // Don't dispose on unmount - engine is a singleton that persists
    // This is intentional for the transition period
  }, []);

  // Subscribe to engine events
  useEffect(() => {
    const engine = engineRef.current;

    const unsubTime = engine.onTimeUpdate((ticks, seconds) => {
      setCurrentTicks(ticks);
      setCurrentSeconds(seconds);
    });

    const unsubState = engine.onStateChange((state) => {
      setPlaybackState(state);
    });

    const unsubError = engine.onError((error, context) => {
      console.error(`usePlayback error [${context}]:`, error);
    });

    return () => {
      unsubTime();
      unsubState();
      unsubError();
    };
  }, []);

  // Memoize the playback state to avoid unnecessary rebuilds
  const playbackStateData = useMemo(() => {
    // Don't build state if not ready
    if (!isReady) return null;

    return buildPlaybackState({
      tracks: tracks ?? [],
      midiManager,
      bpm,
      timeSignature,
    });
  }, [tracks, midiManager, bpm, timeSignature, isReady]);

  // Update engine state when playback state changes
  useEffect(() => {
    const engine = engineRef.current;

    if (!engine.isReady() || !playbackStateData) return;

    engine.setState(playbackStateData);
  }, [playbackStateData]);

  // Actions
  const play = useCallback(() => {
    const engine = engineRef.current;
    if (!engine.isReady()) {
      console.error('usePlayback: Cannot play, engine not ready');
      return;
    }
    engine.play();
  }, []);

  const pause = useCallback(() => {
    engineRef.current.pause();
  }, []);

  const stop = useCallback(() => {
    engineRef.current.stop();
  }, []);

  const seek = useCallback((ticks: number) => {
    engineRef.current.seek(ticks);
  }, []);

  const togglePlayPause = useCallback(() => {
    const engine = engineRef.current;
    if (engine.getPlaybackState() === 'playing') {
      engine.pause();
    } else {
      engine.play();
    }
  }, []);

  return {
    isPlaying: playbackState === 'playing',
    isPaused: playbackState === 'paused',
    isStopped: playbackState === 'stopped',
    currentTicks,
    currentSeconds,
    isReady,
    play,
    pause,
    stop,
    seek,
    togglePlayPause,
    engine: engineRef.current,
  };
}
