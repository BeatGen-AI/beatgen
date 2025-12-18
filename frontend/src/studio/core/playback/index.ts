/**
 * Playback Module - Public API
 *
 * This module exports the playback utilities that bridge the
 * application state to the AudioEngine.
 */

// State transformation
export { buildPlaybackState } from './buildPlaybackState';
export type { BuildPlaybackStateOptions } from './buildPlaybackState';

// React hook
export { usePlayback } from './usePlayback';
export type { UsePlaybackReturn } from './usePlayback';
