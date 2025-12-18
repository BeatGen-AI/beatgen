/**
 * Audio Engine - Public API
 *
 * This module exports the new decoupled audio engine that receives
 * all data via a declarative API (PlaybackState) rather than pulling
 * from the store.
 */

// Types
export * from './types';

// Engine
export { AudioEngine, getAudioEngine, resetAudioEngine } from './AudioEngine';

// Renderer interface (for implementing custom renderers)
export type { ITrackRenderer } from './renderers/BaseRenderer';

// Renderers
export { AudioTrackRenderer } from './renderers/AudioTrackRenderer';
export { MidiTrackRenderer } from './renderers/MidiTrackRenderer';
export { MidiChannelPlayer } from './renderers/MidiChannelPlayer';
export { SamplerTrackRenderer } from './renderers/SamplerTrackRenderer';
export { SamplerChannelPlayer } from './renderers/SamplerChannelPlayer';
