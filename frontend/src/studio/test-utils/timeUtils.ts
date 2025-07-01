import { vi } from 'vitest';

/**
 * Time and Timing Test Utilities
 */

/**
 * Mock timer controller for deterministic time-based testing
 */
export class MockTimerController {
  private currentTime = 0;
  private scheduledEvents: Array<{
    time: number;
    callback: () => void;
    id: number;
  }> = [];
  private nextId = 1;
  private rafCallbacks: Array<{ callback: FrameRequestCallback; id: number }> = [];
  private nextRafId = 1;

  constructor(private baseTime: number = 0) {
    this.currentTime = baseTime;
  }

  /**
   * Get current mock time
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Advance time and trigger scheduled events
   */
  advance(ms: number): void {
    const targetTime = this.currentTime + ms;
    
    // Process all events up to target time
    while (this.scheduledEvents.length > 0) {
      const nextEvent = this.scheduledEvents[0];
      if (nextEvent.time <= targetTime) {
        this.currentTime = nextEvent.time;
        this.scheduledEvents.shift();
        nextEvent.callback();
      } else {
        break;
      }
    }
    
    this.currentTime = targetTime;
    
    // Process RAF callbacks
    if (this.rafCallbacks.length > 0) {
      const callbacks = [...this.rafCallbacks];
      this.rafCallbacks = [];
      callbacks.forEach(({ callback }) => callback(this.currentTime));
    }
  }

  /**
   * Schedule a callback at a specific time
   */
  scheduleAt(time: number, callback: () => void): number {
    const id = this.nextId++;
    this.scheduledEvents.push({ time, callback, id });
    this.scheduledEvents.sort((a, b) => a.time - b.time);
    return id;
  }

  /**
   * Schedule a callback after a delay
   */
  scheduleAfter(delay: number, callback: () => void): number {
    return this.scheduleAt(this.currentTime + delay, callback);
  }

  /**
   * Cancel a scheduled event
   */
  cancel(id: number): void {
    this.scheduledEvents = this.scheduledEvents.filter(event => event.id !== id);
  }

  /**
   * Clear all scheduled events
   */
  clearAll(): void {
    this.scheduledEvents = [];
    this.rafCallbacks = [];
  }

  /**
   * Mock setTimeout
   */
  mockSetTimeout(callback: () => void, delay: number): number {
    return this.scheduleAfter(delay, callback);
  }

  /**
   * Mock clearTimeout
   */
  mockClearTimeout(id: number): void {
    this.cancel(id);
  }

  /**
   * Mock requestAnimationFrame
   */
  mockRequestAnimationFrame(callback: FrameRequestCallback): number {
    const id = this.nextRafId++;
    this.rafCallbacks.push({ callback, id });
    return id;
  }

  /**
   * Mock cancelAnimationFrame
   */
  mockCancelAnimationFrame(id: number): void {
    this.rafCallbacks = this.rafCallbacks.filter(cb => cb.id !== id);
  }

  /**
   * Run all pending timers
   */
  runAllTimers(): void {
    while (this.scheduledEvents.length > 0 || this.rafCallbacks.length > 0) {
      if (this.scheduledEvents.length > 0) {
        const nextEvent = this.scheduledEvents[0];
        this.advance(nextEvent.time - this.currentTime);
      } else {
        // Just process RAF callbacks
        this.advance(16); // Simulate 60fps
      }
    }
  }

  /**
   * Setup global timer mocks
   */
  setupGlobalMocks(): void {
    (global as any).setTimeout = this.mockSetTimeout.bind(this);
    (global as any).clearTimeout = this.mockClearTimeout.bind(this);
    (global as any).requestAnimationFrame = this.mockRequestAnimationFrame.bind(this);
    (global as any).cancelAnimationFrame = this.mockCancelAnimationFrame.bind(this);
    
    // Mock performance.now()
    (global as any).performance = {
      now: () => this.currentTime,
    };
  }

  /**
   * Restore original timer functions
   */
  restoreGlobalMocks(): void {
    // Vitest should handle this, but we can add cleanup if needed
  }
}

/**
 * Create a mock timer controller with convenience methods
 */
export function createMockTimerController(baseTime = 0): MockTimerController {
  return new MockTimerController(baseTime);
}

/**
 * Transport time utilities for music sequencing
 */
export class TransportTimeHelper {
  constructor(
    private bpm: number = 120,
    private timeSignature: [number, number] = [4, 4]
  ) {}

  /**
   * Convert beats to seconds
   */
  beatsToSeconds(beats: number): number {
    return (beats * 60) / this.bpm;
  }

  /**
   * Convert seconds to beats
   */
  secondsToBeats(seconds: number): number {
    return (seconds * this.bpm) / 60;
  }

  /**
   * Convert bars to seconds
   */
  barsToSeconds(bars: number): number {
    const beatsPerBar = this.timeSignature[0];
    return this.beatsToSeconds(bars * beatsPerBar);
  }

  /**
   * Convert seconds to bars
   */
  secondsToBars(seconds: number): number {
    const beatsPerBar = this.timeSignature[0];
    const beats = this.secondsToBeats(seconds);
    return beats / beatsPerBar;
  }

  /**
   * Convert musical time notation (e.g., "1:0:0") to seconds
   */
  notationToSeconds(notation: string): number {
    const parts = notation.split(':').map(Number);
    const [bars = 0, beats = 0, sixteenths = 0] = parts;
    
    const beatsPerBar = this.timeSignature[0];
    const totalBeats = bars * beatsPerBar + beats + sixteenths / 4;
    
    return this.beatsToSeconds(totalBeats);
  }

  /**
   * Convert seconds to musical time notation
   */
  secondsToNotation(seconds: number): string {
    const beats = this.secondsToBeats(seconds);
    const beatsPerBar = this.timeSignature[0];
    
    const bars = Math.floor(beats / beatsPerBar);
    const remainingBeats = beats % beatsPerBar;
    const wholeBeats = Math.floor(remainingBeats);
    const sixteenths = Math.round((remainingBeats - wholeBeats) * 4);
    
    return `${bars}:${wholeBeats}:${sixteenths}`;
  }

  /**
   * Get grid position from time
   */
  secondsToGridPosition(seconds: number, subdivision: number = 16): number {
    const beats = this.secondsToBeats(seconds);
    const gridUnitsPerBeat = subdivision / 4; // 16th notes = 4 per beat
    return Math.round(beats * gridUnitsPerBeat);
  }

  /**
   * Get time from grid position
   */
  gridPositionToSeconds(position: number, subdivision: number = 16): number {
    const gridUnitsPerBeat = subdivision / 4;
    const beats = position / gridUnitsPerBeat;
    return this.beatsToSeconds(beats);
  }

  /**
   * Update BPM
   */
  setBPM(bpm: number): void {
    this.bpm = bpm;
  }

  /**
   * Update time signature
   */
  setTimeSignature(timeSignature: [number, number]): void {
    this.timeSignature = timeSignature;
  }
}

/**
 * Mock Tone.js Transport for testing
 */
export function createMockToneTransport() {
  let state: 'started' | 'stopped' | 'paused' = 'stopped';
  let position = 0;
  let bpm = 120;
  const scheduledEvents: Array<{ time: number; callback: () => void }> = [];

  return {
    state,
    position,
    seconds: position,
    bpm: {
      value: bpm,
      rampTo: vi.fn(),
    },
    
    start: vi.fn((time?: number) => {
      state = 'started';
      return this;
    }),
    
    stop: vi.fn((time?: number) => {
      state = 'stopped';
      position = 0;
      return this;
    }),
    
    pause: vi.fn((time?: number) => {
      state = 'paused';
      return this;
    }),
    
    schedule: vi.fn((callback: () => void, time: number | string) => {
      const timeInSeconds = typeof time === 'string' 
        ? new TransportTimeHelper(bpm).notationToSeconds(time)
        : time;
      scheduledEvents.push({ time: timeInSeconds, callback });
      return this;
    }),
    
    scheduleRepeat: vi.fn((callback: () => void, interval: number | string, startTime?: number | string) => {
      // Simplified version for testing
      return this;
    }),
    
    cancel: vi.fn((after?: number) => {
      if (after === undefined) {
        scheduledEvents.length = 0;
      } else {
        const index = scheduledEvents.findIndex(e => e.time >= after);
        if (index !== -1) {
          scheduledEvents.splice(index);
        }
      }
      return this;
    }),
    
    // Test helper methods
    _processTo: (time: number) => {
      position = time;
      const toProcess = scheduledEvents.filter(e => e.time <= time);
      toProcess.forEach(e => e.callback());
      scheduledEvents.splice(0, toProcess.length);
    },
    
    _setState: (newState: typeof state) => {
      state = newState;
    },
    
    _setBPM: (newBPM: number) => {
      bpm = newBPM;
    },
  };
}

/**
 * Wait for a number of animation frames
 */
export async function waitForFrames(count: number = 1): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
}

/**
 * Wait for next tick (microtask)
 */
export async function waitForNextTick(): Promise<void> {
  return new Promise(resolve => queueMicrotask(resolve));
}

/**
 * Create a deterministic async delay for testing
 */
export function createTestDelay(ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    // Store timer ID for potential cleanup
    (createTestDelay as any).lastTimerId = timer;
  });
}

/**
 * Measure execution time of a function
 */
export async function measureExecutionTime<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * Create a mock audio worklet processor time
 */
export function createMockAudioWorkletTime(sampleRate: number = 44100) {
  let currentFrame = 0;
  
  return {
    currentTime: 0,
    currentFrame,
    
    advance(frames: number) {
      currentFrame += frames;
      this.currentTime = currentFrame / sampleRate;
    },
    
    advanceSeconds(seconds: number) {
      const frames = Math.floor(seconds * sampleRate);
      this.advance(frames);
    },
    
    reset() {
      currentFrame = 0;
      this.currentTime = 0;
    },
  };
}