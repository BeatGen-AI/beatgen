import { AudioWorkletNodeSynthesizer, ISequencer } from 'js-synthesizer';
import { SequencerWrapper } from '../sequencerWrapper';
import { Note } from '../../../../../types/note';

/**
 * Mock AudioContext factory
 */
export const createMockAudioContext = (overrides?: Partial<AudioContext>) => ({
  destination: {},
  audioWorklet: {
    addModule: jest.fn().mockResolvedValue(undefined)
  },
  sampleRate: 44100,
  currentTime: 0,
  state: 'running' as AudioContextState,
  ...overrides
} as unknown as AudioContext);

/**
 * Mock AudioWorkletNode factory
 */
export const createMockAudioNode = (overrides?: Partial<AudioWorkletNode>) => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  port: {
    postMessage: jest.fn(),
    onmessage: null
  },
  ...overrides
} as unknown as AudioWorkletNode);

/**
 * Mock ISequencer factory
 */
export const createMockSequencer = (overrides?: Partial<ISequencer>): jest.Mocked<ISequencer> => ({
  registerSynthesizer: jest.fn().mockResolvedValue(undefined),
  setTimeScale: jest.fn(),
  getTimeScale: jest.fn().mockResolvedValue(1000),
  getTick: jest.fn().mockResolvedValue(0),
  sendEventAt: jest.fn(),
  removeAllEvents: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
  processSequencer: jest.fn(),
  ...overrides
} as any);

/**
 * Mock AudioWorkletNodeSynthesizer factory
 */
export const createMockSynth = (overrides?: Partial<AudioWorkletNodeSynthesizer>): jest.Mocked<AudioWorkletNodeSynthesizer> => {
  const mockSequencer = createMockSequencer();
  
  return {
    createAudioNode: jest.fn().mockReturnValue(createMockAudioNode()),
    loadSFont: jest.fn().mockResolvedValue(1),
    setSFontBankOffset: jest.fn(),
    getSFontBankOffset: jest.fn().mockResolvedValue(100),
    midiProgramSelect: jest.fn(),
    midiControl: jest.fn(),
    midiAllNotesOff: jest.fn(),
    closePlayer: jest.fn(),
    createSequencer: jest.fn().mockResolvedValue(mockSequencer),
    getSFontObject: jest.fn().mockResolvedValue({
      getPresetIterable: jest.fn().mockResolvedValue([
        { bankNum: 0, num: 0 } // Default preset
      ])
    }),
    ...overrides
  } as any;
};

/**
 * Mock SequencerWrapper factory
 */
export const createMockSequencerWrapper = (overrides?: Partial<SequencerWrapper>): jest.Mocked<SequencerWrapper> => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  mute: jest.fn(),
  unmute: jest.fn(),
  setVolume: jest.fn(),
  seekToGlobalTime: jest.fn().mockResolvedValue(undefined),
  resetPosition: jest.fn(),
  dispose: jest.fn().mockResolvedValue(undefined),
  setOffset: jest.fn(),
  getOffset: jest.fn().mockReturnValue(0),
  setBPM: jest.fn(),
  getBPM: jest.fn().mockReturnValue(120),
  getChannel: 0,
  isMuted: false,
  process: jest.fn(),
  silence: jest.fn(),
  getRawTickOffset: jest.fn().mockReturnValue(0),
  getSoundFontId: jest.fn().mockReturnValue(1),
  getBankOffset: jest.fn().mockReturnValue(100),
  updateWithNotes: jest.fn(),
  applyCurrentBPM: jest.fn(),
  prepareForPlayback: jest.fn().mockResolvedValue(undefined),
  globalToLocalTick: jest.fn().mockReturnValue(0),
  updateLocalPosition: jest.fn(),
  ...overrides
} as any);

/**
 * Test note factory
 */
export const createTestNote = (overrides?: Partial<Note>): Note => ({
  id: 1,
  row: 60, // Middle C
  column: 0,
  length: 500,
  velocity: 100,
  ...overrides
});

/**
 * Test notes array factory
 */
export const createTestNotes = (count: number = 5, startTime: number = 0): Note[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    row: 60 + i, // Sequential MIDI notes
    column: startTime + (i * 1000), // 1 second apart
    length: 500, // 500ms duration
    velocity: 100
  }));
};

/**
 * Create test soundfont data
 */
export const createTestSoundfont = (size: number = 1024): ArrayBuffer => {
  return new ArrayBuffer(size);
};

/**
 * Mock preset factory
 */
export const createMockPreset = (bankNum: number = 0, num: number = 0) => ({
  bankNum,
  num,
  name: `Preset ${num}`,
  library: 0,
  genre: 0,
  morphology: 0
});

/**
 * Create a mock soundfont object with presets
 */
export const createMockSoundfontObject = (presets: any[] = [createMockPreset()]) => ({
  getPresetIterable: jest.fn().mockResolvedValue(presets),
  getName: jest.fn().mockReturnValue('Test Soundfont'),
  getPresetCount: jest.fn().mockReturnValue(presets.length)
});

/**
 * State verification helper
 */
export interface PlayerState {
  isPlaying: boolean;
  trackCount: number;
  currentTick: number;
  bpm: number;
}

export const verifyPlayerState = (
  player: { 
    isPlayerPlaying: () => boolean;
    getTrackIds: () => string[];
    getCurrentTick: () => number;
    getGlobalBPM: () => number;
  }, 
  expected: PlayerState
) => {
  expect(player.isPlayerPlaying()).toBe(expected.isPlaying);
  expect(player.getTrackIds()).toHaveLength(expected.trackCount);
  expect(player.getCurrentTick()).toBe(expected.currentTick);
  expect(player.getGlobalBPM()).toBe(expected.bpm);
};

/**
 * Track state verification helper
 */
export interface TrackState {
  channel: number;
  isMuted: boolean;
  bpm: number;
  offset: number;
}

export const verifyTrackState = (
  track: {
    getChannel: number;
    isMuted: boolean;
    getBPM: () => number;
    getOffset: () => number;
  },
  expected: TrackState
) => {
  expect(track.getChannel).toBe(expected.channel);
  expect(track.isMuted).toBe(expected.isMuted);
  expect(track.getBPM()).toBe(expected.bpm);
  expect(track.getOffset()).toBe(expected.offset);
};

/**
 * Async test helper - wait for condition with timeout
 */
export const waitForCondition = async (
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> => {
  const startTime = Date.now();
  
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Condition not met within timeout');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
};

/**
 * Mock timer helper for testing time-based operations
 */
export class MockTimer {
  private currentTime: number = 0;
  private timers: Map<number, { callback: () => void; time: number }> = new Map();
  private nextId: number = 1;

  advanceTime(ms: number): void {
    this.currentTime += ms;
    
    // Execute any timers that should fire
    for (const [id, timer] of this.timers.entries()) {
      if (timer.time <= this.currentTime) {
        timer.callback();
        this.timers.delete(id);
      }
    }
  }

  setTimeout(callback: () => void, delay: number): number {
    const id = this.nextId++;
    this.timers.set(id, { callback, time: this.currentTime + delay });
    return id;
  }

  clearTimeout(id: number): void {
    this.timers.delete(id);
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  reset(): void {
    this.currentTime = 0;
    this.timers.clear();
    this.nextId = 1;
  }
}

/**
 * Error tracking helper
 */
export class ErrorTracker {
  private errors: Error[] = [];

  track = (error: Error): void => {
    this.errors.push(error);
  };

  getErrors(): Error[] {
    return [...this.errors];
  }

  getErrorCount(): number {
    return this.errors.length;
  }

  hasError(message: string): boolean {
    return this.errors.some(e => e.message.includes(message));
  }

  clear(): void {
    this.errors = [];
  }
}

/**
 * Performance measurement helper
 */
export class PerformanceTracker {
  private measurements: Map<string, number[]> = new Map();

  startMeasurement(name: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      if (!this.measurements.has(name)) {
        this.measurements.set(name, []);
      }
      this.measurements.get(name)!.push(duration);
    };
  }

  getAverage(name: string): number {
    const times = this.measurements.get(name) || [];
    if (times.length === 0) return 0;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }

  getMax(name: string): number {
    const times = this.measurements.get(name) || [];
    return Math.max(...times, 0);
  }

  getMin(name: string): number {
    const times = this.measurements.get(name) || [];
    return times.length > 0 ? Math.min(...times) : 0;
  }

  clear(): void {
    this.measurements.clear();
  }
}