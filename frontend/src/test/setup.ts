import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import '@testing-library/jest-dom';
import { setupAudioMocks } from './mocks/audioMocks';

// Setup audio mocks before all tests
const mocks = setupAudioMocks();

// Mock modules
vi.mock('js-synthesizer', () => ({
  AudioWorkletNodeSynthesizer: mocks.AudioWorkletNodeSynthesizer
}));

vi.mock('tone', () => mocks.Tone);

vi.mock('../studio/core/audio-engine/midiSamplePlayer/sampler', () => ({
  default: mocks.MidiSampler
}));

vi.mock('../studio/core/audio-engine/midiSoundfontPlayer/sequencerWrapper', () => ({
  SequencerWrapper: mocks.SequencerWrapper
}));

// Mock Web Audio API if not available
beforeAll(() => {
  // Mock performance.now if not available
  if (!global.performance) {
    global.performance = {
      now: vi.fn(() => Date.now())
    } as any;
  }

  // Mock URL.createObjectURL
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = vi.fn();

  // Mock console methods to reduce noise in tests
  global.console = {
    ...console,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
});

afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks();
  
  // Clear any timers
  vi.clearAllTimers();
  
  // Reset mock implementations if needed
  if (vi.isMockFunction(global.console.log)) {
    (global.console.log as any).mockClear();
  }
  if (vi.isMockFunction(global.console.warn)) {
    (global.console.warn as any).mockClear();
  }
  if (vi.isMockFunction(global.console.error)) {
    (global.console.error as any).mockClear();
  }
});

afterAll(() => {
  // Global cleanup
  vi.restoreAllMocks();
});

// Setup global test utilities
global.testUtils = {
  waitFor: (ms: number = 10) => new Promise(resolve => setTimeout(resolve, ms)),
  
  createMockFile: (name: string, type: string, size: number = 1024) => {
    const buffer = new ArrayBuffer(size);
    return new File([buffer], name, { type });
  },
  
  createMockAudioBuffer: (duration: number = 10, sampleRate: number = 44100) => ({
    duration,
    sampleRate,
    length: duration * sampleRate,
    numberOfChannels: 2,
    getChannelData: vi.fn((channel: number) => new Float32Array(duration * sampleRate))
  })
};

// Extend global type definitions
declare global {
  var testUtils: {
    waitFor: (ms?: number) => Promise<void>;
    createMockFile: (name: string, type: string, size?: number) => File;
    createMockAudioBuffer: (duration?: number, sampleRate?: number) => any;
  };
}