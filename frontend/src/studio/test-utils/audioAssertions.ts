import { expect, vi } from 'vitest';
import { Note } from '../../types/note';
import { MidiNote } from '../core/midi/types';

/**
 * Custom assertions and matchers for audio-specific testing
 */

/**
 * Assert that a note matches expected properties
 */
export function expectNote(actual: Note | undefined | null) {
  return {
    toMatchNote(expected: Partial<Note>) {
      expect(actual).toBeDefined();
      expect(actual).not.toBeNull();
      
      if (!actual) return;

      if (expected.id !== undefined) {
        expect(actual.id).toBe(expected.id);
      }
      if (expected.row !== undefined) {
        expect(actual.row).toBe(expected.row);
      }
      if (expected.column !== undefined) {
        expect(actual.column).toBe(expected.column);
      }
      if (expected.length !== undefined) {
        expect(actual.length).toBe(expected.length);
      }
      if (expected.velocity !== undefined) {
        expect(actual.velocity).toBe(expected.velocity);
      }
      if (expected.trackId !== undefined) {
        expect(actual.trackId).toBe(expected.trackId);
      }
    },
    
    toBeWithinRange(min: number, max: number, property: keyof Note = 'row') {
      expect(actual).toBeDefined();
      if (!actual) return;
      
      const value = actual[property];
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
    },
  };
}

/**
 * Assert that notes are in a specific order
 */
export function expectNotesInOrder(notes: Note[], orderBy: keyof Note = 'column') {
  for (let i = 1; i < notes.length; i++) {
    const prev = notes[i - 1][orderBy];
    const curr = notes[i][orderBy];
    
    if (typeof prev === 'number' && typeof curr === 'number') {
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  }
}

/**
 * Assert audio buffer properties
 */
export function expectAudioBuffer(buffer: AudioBuffer | null | undefined) {
  return {
    toHaveProperties(expected: {
      duration?: number;
      length?: number;
      numberOfChannels?: number;
      sampleRate?: number;
    }) {
      expect(buffer).toBeDefined();
      expect(buffer).not.toBeNull();
      
      if (!buffer) return;

      if (expected.duration !== undefined) {
        expect(buffer.duration).toBeCloseTo(expected.duration, 2);
      }
      if (expected.length !== undefined) {
        expect(buffer.length).toBe(expected.length);
      }
      if (expected.numberOfChannels !== undefined) {
        expect(buffer.numberOfChannels).toBe(expected.numberOfChannels);
      }
      if (expected.sampleRate !== undefined) {
        expect(buffer.sampleRate).toBe(expected.sampleRate);
      }
    },
    
    toHaveSilence(threshold: number = 0.001) {
      expect(buffer).toBeDefined();
      if (!buffer) return;
      
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        const maxAmplitude = Math.max(...data.map(Math.abs));
        expect(maxAmplitude).toBeLessThan(threshold);
      }
    },
    
    toHaveContent(threshold: number = 0.001) {
      expect(buffer).toBeDefined();
      if (!buffer) return;
      
      let hasContent = false;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        const maxAmplitude = Math.max(...data.map(Math.abs));
        if (maxAmplitude >= threshold) {
          hasContent = true;
          break;
        }
      }
      expect(hasContent).toBe(true);
    },
  };
}

/**
 * Assert MIDI note timing
 */
export function expectMidiNoteTiming(note: MidiNote) {
  return {
    toStartAt(expectedTime: number, tolerance: number = 0.001) {
      expect(note.time).toBeCloseTo(expectedTime, Math.abs(Math.log10(tolerance)));
    },
    
    toEndAt(expectedEndTime: number, tolerance: number = 0.001) {
      const actualEndTime = note.time + note.duration;
      expect(actualEndTime).toBeCloseTo(expectedEndTime, Math.abs(Math.log10(tolerance)));
    },
    
    toHaveDuration(expectedDuration: number, tolerance: number = 0.001) {
      expect(note.duration).toBeCloseTo(expectedDuration, Math.abs(Math.log10(tolerance)));
    },
    
    toOverlapWith(otherNote: MidiNote) {
      const thisEnd = note.time + note.duration;
      const otherEnd = otherNote.time + otherNote.duration;
      
      const overlaps = note.time < otherEnd && thisEnd > otherNote.time;
      expect(overlaps).toBe(true);
    },
  };
}

/**
 * Assert audio node connections
 */
export function expectAudioNodeConnection(
  source: any,
  destination: any,
  outputIndex?: number,
  inputIndex?: number
) {
  expect(source.connect).toHaveBeenCalled();
  
  if (outputIndex !== undefined && inputIndex !== undefined) {
    expect(source.connect).toHaveBeenCalledWith(destination, outputIndex, inputIndex);
  } else if (outputIndex !== undefined) {
    expect(source.connect).toHaveBeenCalledWith(destination, outputIndex);
  } else {
    expect(source.connect).toHaveBeenCalledWith(destination);
  }
}

/**
 * Assert audio param automation
 */
export function expectAudioParamAutomation(param: any) {
  return {
    toHaveValueAt(time: number, expectedValue: number) {
      expect(param.setValueAtTime).toHaveBeenCalledWith(expectedValue, time);
    },
    
    toRampTo(endValue: number, endTime: number, type: 'linear' | 'exponential' = 'linear') {
      if (type === 'linear') {
        expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(endValue, endTime);
      } else {
        expect(param.exponentialRampToValueAtTime).toHaveBeenCalledWith(endValue, endTime);
      }
    },
    
    toHaveAutomationEvents(count: number) {
      const totalCalls = 
        (param.setValueAtTime?.mock?.calls?.length || 0) +
        (param.linearRampToValueAtTime?.mock?.calls?.length || 0) +
        (param.exponentialRampToValueAtTime?.mock?.calls?.length || 0) +
        (param.setTargetAtTime?.mock?.calls?.length || 0) +
        (param.setValueCurveAtTime?.mock?.calls?.length || 0);
      
      expect(totalCalls).toBe(count);
    },
  };
}

/**
 * Assert frequency/pitch conversions
 */
export function expectFrequency(frequency: number) {
  return {
    toBeNote(expectedNote: string, tolerance: number = 1) {
      // A4 = 440Hz
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const A4 = 440;
      const semitoneRatio = Math.pow(2, 1/12);
      
      // Calculate MIDI note number from frequency
      const midiNote = 69 + 12 * Math.log2(frequency / A4);
      const roundedMidiNote = Math.round(midiNote);
      
      const octave = Math.floor(roundedMidiNote / 12) - 1;
      const noteIndex = roundedMidiNote % 12;
      const actualNote = `${noteNames[noteIndex]}${octave}`;
      
      expect(actualNote).toBe(expectedNote);
      expect(Math.abs(midiNote - roundedMidiNote)).toBeLessThan(tolerance / 100);
    },
    
    toBeMidiNote(expectedMidiNote: number, tolerance: number = 0.5) {
      const A4 = 440;
      const midiNote = 69 + 12 * Math.log2(frequency / A4);
      expect(midiNote).toBeCloseTo(expectedMidiNote, 1);
    },
  };
}

/**
 * Assert timing precision
 */
export function expectTiming(actual: number) {
  return {
    toBeWithinMs(expected: number, toleranceMs: number = 1) {
      const tolerance = toleranceMs / 1000; // Convert to seconds
      expect(actual).toBeGreaterThanOrEqual(expected - tolerance);
      expect(actual).toBeLessThanOrEqual(expected + tolerance);
    },
    
    toBeOnBeat(bpm: number, beatNumber: number, tolerance: number = 0.01) {
      const expectedTime = (beatNumber * 60) / bpm;
      expect(actual).toBeCloseTo(expectedTime, 2);
    },
    
    toBeQuantizedTo(gridSize: number, bpm: number = 120) {
      const secondsPerBeat = 60 / bpm;
      const gridInterval = secondsPerBeat / (gridSize / 4); // gridSize is typically in 16ths
      const quantized = Math.round(actual / gridInterval) * gridInterval;
      expect(actual).toBeCloseTo(quantized, 3);
    },
  };
}

/**
 * Assert velocity values
 */
export function expectVelocity(velocity: number | undefined) {
  return {
    toBeValid() {
      expect(velocity).toBeDefined();
      expect(velocity).toBeGreaterThanOrEqual(0);
      expect(velocity).toBeLessThanOrEqual(127);
    },
    
    toBeInDynamicRange(range: 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff') {
      expect(velocity).toBeDefined();
      
      const ranges = {
        'ppp': [1, 15],
        'pp': [16, 31],
        'p': [32, 47],
        'mp': [48, 63],
        'mf': [64, 79],
        'f': [80, 95],
        'ff': [96, 111],
        'fff': [112, 127],
      };
      
      const [min, max] = ranges[range];
      expect(velocity).toBeGreaterThanOrEqual(min);
      expect(velocity).toBeLessThanOrEqual(max);
    },
  };
}

/**
 * Spy on console methods and assert outputs
 */
export function createConsoleSpy() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  const logs: any[] = [];
  const errors: any[] = [];
  const warnings: any[] = [];
  
  console.log = vi.fn((...args) => {
    logs.push(args);
    originalLog(...args);
  });
  
  console.error = vi.fn((...args) => {
    errors.push(args);
    originalError(...args);
  });
  
  console.warn = vi.fn((...args) => {
    warnings.push(args);
    originalWarn(...args);
  });
  
  return {
    logs,
    errors,
    warnings,
    
    expectLog(pattern: string | RegExp) {
      const found = logs.some(args => 
        args.some(arg => 
          typeof pattern === 'string' 
            ? String(arg).includes(pattern)
            : pattern.test(String(arg))
        )
      );
      expect(found).toBe(true);
    },
    
    expectNoErrors() {
      expect(errors).toHaveLength(0);
    },
    
    expectError(pattern: string | RegExp) {
      const found = errors.some(args => 
        args.some(arg => 
          typeof pattern === 'string' 
            ? String(arg).includes(pattern)
            : pattern.test(String(arg))
        )
      );
      expect(found).toBe(true);
    },
    
    restore() {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

/**
 * Assert that a function throws with specific error
 */
export async function expectToThrowAsync(
  fn: () => Promise<any>,
  expectedError?: string | RegExp | Error
) {
  let thrown = false;
  let error: any;
  
  try {
    await fn();
  } catch (e) {
    thrown = true;
    error = e;
  }
  
  expect(thrown).toBe(true);
  
  if (expectedError) {
    if (typeof expectedError === 'string') {
      expect(error.message).toContain(expectedError);
    } else if (expectedError instanceof RegExp) {
      expect(error.message).toMatch(expectedError);
    } else if (expectedError instanceof Error) {
      expect(error.message).toBe(expectedError.message);
    }
  }
}