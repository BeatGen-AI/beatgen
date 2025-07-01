/**
 * Main entry point for test utilities
 * 
 * This module re-exports all test utilities for convenient importing in tests
 */

// Audio context and Web Audio API mocks
export * from './audioContextMocks';

// MIDI test data generators
export * from './midiTestData';

// Audio file utilities
export * from './audioFileUtils';

// Time and timing utilities
export * from './timeUtils';

// Custom assertions
export * from './audioAssertions';

// Test factories
export * from './testFactories';

// Additional convenience exports
export { vi, expect, describe, it, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

/**
 * Common test setup function
 */
export function setupAudioTest() {
  // Setup global mocks
  const { setupGlobalAudioMocks } = require('./audioContextMocks');
  const { setupFileReaderMock } = require('./audioFileUtils');
  const { setupUrlMocks } = require('./audioFileUtils');
  
  setupGlobalAudioMocks();
  const fileReader = setupFileReaderMock();
  const urlMocks = setupUrlMocks();
  
  return {
    fileReader,
    urlMocks,
    cleanup: () => {
      const { cleanupGlobalAudioMocks } = require('./audioContextMocks');
      cleanupGlobalAudioMocks();
      urlMocks.cleanup();
    },
  };
}

/**
 * Helper to run tests with audio context
 */
export async function withAudioContext<T>(
  fn: (context: AudioContext) => T | Promise<T>
): Promise<T> {
  const { createMockAudioContext } = require('./audioContextMocks');
  const context = createMockAudioContext({ state: 'running' });
  
  try {
    return await fn(context as any);
  } finally {
    await context.close();
  }
}

/**
 * Helper to run tests with timing control
 */
export async function withTimingControl<T>(
  fn: (timer: import('./timeUtils').MockTimerController) => T | Promise<T>
): Promise<T> {
  const { createMockTimerController } = require('./timeUtils');
  const timer = createMockTimerController();
  
  timer.setupGlobalMocks();
  
  try {
    return await fn(timer);
  } finally {
    timer.restoreGlobalMocks();
  }
}

/**
 * Snapshot matcher for audio-specific objects
 */
export function toMatchAudioSnapshot(received: any, propertiesToMatch?: string[]) {
  const snapshot: any = {};
  
  if (received instanceof AudioBuffer) {
    snapshot.type = 'AudioBuffer';
    snapshot.duration = received.duration;
    snapshot.length = received.length;
    snapshot.numberOfChannels = received.numberOfChannels;
    snapshot.sampleRate = received.sampleRate;
  } else if (received instanceof AudioNode) {
    snapshot.type = 'AudioNode';
    snapshot.numberOfInputs = received.numberOfInputs;
    snapshot.numberOfOutputs = received.numberOfOutputs;
    snapshot.channelCount = received.channelCount;
  } else if (Array.isArray(received) && received.length > 0 && received[0].row !== undefined) {
    // Likely an array of notes
    snapshot.type = 'NoteArray';
    snapshot.count = received.length;
    snapshot.notes = received.map(note => ({
      row: note.row,
      column: note.column,
      length: note.length,
      velocity: note.velocity,
    }));
  } else if (propertiesToMatch) {
    propertiesToMatch.forEach(prop => {
      if (prop in received) {
        snapshot[prop] = received[prop];
      }
    });
  } else {
    return received; // Return as-is for standard snapshot matching
  }
  
  return snapshot;
}