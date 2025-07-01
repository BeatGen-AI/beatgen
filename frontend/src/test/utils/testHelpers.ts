import { vi } from 'vitest';
import { Note } from '../../types/note';

// Generate test notes
export const generateTestNotes = (count: number, trackId: string = 'test-track'): Note[] => {
  const notes: Note[] = [];
  const ticksPerBeat = 480;
  
  for (let i = 0; i < count; i++) {
    notes.push({
      id: `note-${i}`,
      pitch: 60 + (i % 12), // C4 chromatic scale
      velocity: 80 + (i % 40), // Vary velocity
      startTicks: i * ticksPerBeat,
      durationTicks: ticksPerBeat,
      trackId
    });
  }
  
  return notes;
};

// Generate a chord
export const generateChord = (rootPitch: number, chordType: 'major' | 'minor' | '7th', startTicks: number, durationTicks: number, trackId: string = 'test-track'): Note[] => {
  const intervals = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    '7th': [0, 4, 7, 10]
  };
  
  return intervals[chordType].map((interval, i) => ({
    id: `chord-note-${i}`,
    pitch: rootPitch + interval,
    velocity: 90,
    startTicks,
    durationTicks,
    trackId
  }));
};

// Generate drum pattern
export const generateDrumPattern = (bars: number = 1, trackId: string = 'drums'): Note[] => {
  const notes: Note[] = [];
  const ticksPerBeat = 480;
  const ticksPerBar = ticksPerBeat * 4;
  
  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * ticksPerBar;
    
    // Kick on 1 and 3
    notes.push({
      id: `kick-${bar}-1`,
      pitch: 36, // C1 - Kick
      velocity: 100,
      startTicks: barStart,
      durationTicks: ticksPerBeat / 2,
      trackId
    });
    notes.push({
      id: `kick-${bar}-3`,
      pitch: 36,
      velocity: 100,
      startTicks: barStart + ticksPerBeat * 2,
      durationTicks: ticksPerBeat / 2,
      trackId
    });
    
    // Snare on 2 and 4
    notes.push({
      id: `snare-${bar}-2`,
      pitch: 38, // D1 - Snare
      velocity: 90,
      startTicks: barStart + ticksPerBeat,
      durationTicks: ticksPerBeat / 2,
      trackId
    });
    notes.push({
      id: `snare-${bar}-4`,
      pitch: 38,
      velocity: 90,
      startTicks: barStart + ticksPerBeat * 3,
      durationTicks: ticksPerBeat / 2,
      trackId
    });
    
    // Hi-hats on 8th notes
    for (let i = 0; i < 8; i++) {
      notes.push({
        id: `hihat-${bar}-${i}`,
        pitch: 42, // F#1 - Closed Hi-hat
        velocity: 60 + (i % 2) * 20, // Accent pattern
        startTicks: barStart + i * ticksPerBeat / 2,
        durationTicks: ticksPerBeat / 4,
        trackId
      });
    }
  }
  
  return notes;
};

// Mock MidiManager
export const createMockMidiManager = () => {
  const tracks = new Map<string, Note[]>();
  const subscribers = new Map<string, ((trackId: string, notes: Note[]) => void)[]>();
  
  return {
    hasTrack: vi.fn((trackId: string) => tracks.has(trackId)),
    createTrack: vi.fn((trackId: string) => {
      tracks.set(trackId, []);
    }),
    getTrackNotes: vi.fn((trackId: string) => tracks.get(trackId) || []),
    updateTrackNotes: vi.fn((trackId: string, notes: Note[]) => {
      tracks.set(trackId, notes);
      // Notify subscribers
      const trackSubscribers = subscribers.get(trackId) || [];
      trackSubscribers.forEach(callback => callback(trackId, notes));
    }),
    subscribeToTrack: vi.fn((trackId: string, callback: (trackId: string, notes: Note[]) => void) => {
      if (!subscribers.has(trackId)) {
        subscribers.set(trackId, []);
      }
      subscribers.get(trackId)!.push(callback);
      
      // Return unsubscribe function
      return vi.fn(() => {
        const subs = subscribers.get(trackId);
        if (subs) {
          const index = subs.indexOf(callback);
          if (index > -1) {
            subs.splice(index, 1);
          }
        }
      });
    }),
    // Test helper to trigger subscription
    _triggerUpdate: (trackId: string, notes: Note[]) => {
      tracks.set(trackId, notes);
      const trackSubscribers = subscribers.get(trackId) || [];
      trackSubscribers.forEach(callback => callback(trackId, notes));
    },
    // Test helper to clear all data
    _reset: () => {
      tracks.clear();
      subscribers.clear();
    }
  };
};

// Mock database
export const createMockDb = () => ({
  soundfonts: {
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue({
      id: 'test-soundfont',
      instrument_id: 'piano',
      data: new ArrayBuffer(1024),
      storage_key: 'soundfont-key'
    })
  }
});

// Mock SoundfontManager
export const createMockSoundfontManager = () => ({
  getInstance: vi.fn().mockReturnValue({
    getSoundfont: vi.fn().mockResolvedValue({
      data: new ArrayBuffer(1024),
      storage_key: 'test-soundfont-key'
    })
  })
});

// Assertion helpers
export const expectNoteAt = (notes: Note[], index: number, expectedProps: Partial<Note>) => {
  expect(notes[index]).toMatchObject(expectedProps);
};

export const expectNotesInTimeRange = (notes: Note[], startTicks: number, endTicks: number) => {
  const notesInRange = notes.filter(n => 
    n.startTicks >= startTicks && n.startTicks < endTicks
  );
  return notesInRange;
};

// Wait utilities
export const waitForCondition = async (
  condition: () => boolean, 
  timeout: number = 1000, 
  interval: number = 10
): Promise<void> => {
  const startTime = Date.now();
  
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
};

// Performance measurement
export class PerformanceTracker {
  private measurements: Map<string, number[]> = new Map();
  
  start(label: string): () => void {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      if (!this.measurements.has(label)) {
        this.measurements.set(label, []);
      }
      this.measurements.get(label)!.push(duration);
    };
  }
  
  getStats(label: string) {
    const times = this.measurements.get(label) || [];
    if (times.length === 0) return null;
    
    const sum = times.reduce((a, b) => a + b, 0);
    const avg = sum / times.length;
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    return {
      count: times.length,
      total: sum,
      average: avg,
      median,
      min: Math.min(...times),
      max: Math.max(...times)
    };
  }
  
  reset() {
    this.measurements.clear();
  }
}

// Console spy utilities
export const spyOnConsole = () => {
  const logs: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.log = vi.fn((...args) => {
    logs.push(args.map(arg => String(arg)).join(' '));
    originalLog(...args);
  });
  
  console.warn = vi.fn((...args) => {
    warnings.push(args.map(arg => String(arg)).join(' '));
    originalWarn(...args);
  });
  
  console.error = vi.fn((...args) => {
    errors.push(args.map(arg => String(arg)).join(' '));
    originalError(...args);
  });
  
  return {
    getLogs: () => logs,
    getWarnings: () => warnings,
    getErrors: () => errors,
    hasLog: (pattern: string | RegExp) => 
      logs.some(log => typeof pattern === 'string' ? log.includes(pattern) : pattern.test(log)),
    hasWarning: (pattern: string | RegExp) =>
      warnings.some(warn => typeof pattern === 'string' ? warn.includes(pattern) : pattern.test(warn)),
    hasError: (pattern: string | RegExp) =>
      errors.some(err => typeof pattern === 'string' ? err.includes(pattern) : pattern.test(err)),
    restore: () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
  };
};