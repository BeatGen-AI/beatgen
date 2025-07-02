import { Note } from '../../types/note';
import { MidiNote, MidiTrack, MidiData } from '../core/midi/types';

/**
 * MIDI Test Data Generators and Utilities
 */

let noteIdCounter = 0;

/**
 * Generate a unique note ID for testing
 */
export function generateTestNoteId(): number {
  noteIdCounter++;
  return Date.now() * 1000 + noteIdCounter;
}

/**
 * Reset the note ID counter (useful between tests)
 */
export function resetNoteIdCounter(): void {
  noteIdCounter = 0;
}

/**
 * Create a single Note object for testing
 */
export function createTestNote(overrides?: Partial<Note>): Note {
  return {
    id: generateTestNoteId(),
    row: 60, // Middle C by default
    column: 0,
    length: 4,
    velocity: 100,
    trackId: 'test-track',
    ...overrides,
  };
}

/**
 * Create multiple Note objects with configurable patterns
 */
export function createTestNotes(config: {
  count?: number;
  startRow?: number;
  rowInterval?: number;
  startColumn?: number;
  columnInterval?: number;
  length?: number;
  velocity?: number;
  trackId?: string;
  pattern?: 'scale' | 'chord' | 'arpeggio' | 'custom';
  customPattern?: number[];
} = {}): Note[] {
  const {
    count = 4,
    startRow = 60,
    rowInterval = 1,
    startColumn = 0,
    columnInterval = 4,
    length = 4,
    velocity = 100,
    trackId = 'test-track',
    pattern = 'scale',
    customPattern,
  } = config;

  const notes: Note[] = [];

  switch (pattern) {
    case 'scale':
      for (let i = 0; i < count; i++) {
        notes.push(createTestNote({
          row: startRow + (i * rowInterval),
          column: startColumn + (i * columnInterval),
          length,
          velocity,
          trackId,
        }));
      }
      break;

    case 'chord':
      // Major chord pattern
      const chordIntervals = [0, 4, 7];
      for (let i = 0; i < count; i++) {
        const interval = chordIntervals[i % chordIntervals.length];
        notes.push(createTestNote({
          row: startRow + interval,
          column: startColumn,
          length,
          velocity,
          trackId,
        }));
      }
      break;

    case 'arpeggio':
      // Arpeggio pattern
      const arpeggioIntervals = [0, 4, 7, 12];
      for (let i = 0; i < count; i++) {
        const interval = arpeggioIntervals[i % arpeggioIntervals.length];
        notes.push(createTestNote({
          row: startRow + interval,
          column: startColumn + (i * columnInterval),
          length,
          velocity,
          trackId,
        }));
      }
      break;

    case 'custom':
      if (!customPattern) {
        throw new Error('customPattern must be provided when using custom pattern');
      }
      for (let i = 0; i < count; i++) {
        const row = customPattern[i % customPattern.length];
        notes.push(createTestNote({
          row,
          column: startColumn + (i * columnInterval),
          length,
          velocity,
          trackId,
        }));
      }
      break;
  }

  return notes;
}

/**
 * Create a MidiNote (extends Note with time-based properties)
 */
export function createTestMidiNote(overrides?: Partial<MidiNote>): MidiNote {
  const baseNote = createTestNote(overrides);
  return {
    ...baseNote,
    velocity: overrides?.velocity ?? 0.8,
    duration: overrides?.duration ?? 0.5, // 0.5 seconds by default
    time: overrides?.time ?? 0,
  };
}

/**
 * Create a MidiTrack with notes
 */
export function createTestMidiTrack(config: {
  id?: string;
  instrumentId?: string;
  name?: string;
  notes?: MidiNote[];
  noteCount?: number;
} = {}): MidiTrack {
  const {
    id = 'test-track-1',
    instrumentId = 'piano',
    name = 'Test Track',
    notes,
    noteCount = 4,
  } = config;

  const trackNotes = notes || Array.from({ length: noteCount }, (_, i) =>
    createTestMidiNote({
      time: i * 0.5,
      duration: 0.4,
      row: 60 + (i * 2),
    })
  );

  return {
    id,
    instrumentId,
    name,
    notes: trackNotes,
  };
}

/**
 * Create complete MidiData for testing
 */
export function createTestMidiData(config: {
  tracks?: MidiTrack[];
  trackCount?: number;
  bpm?: number;
  timeSignature?: [number, number];
} = {}): MidiData {
  const {
    tracks,
    trackCount = 1,
    bpm = 120,
    timeSignature = [4, 4],
  } = config;

  const midiTracks = tracks || Array.from({ length: trackCount }, (_, i) =>
    createTestMidiTrack({
      id: `track-${i}`,
      instrumentId: ['piano', 'bass', 'drums'][i % 3],
      name: `Track ${i + 1}`,
    })
  );

  return {
    tracks: midiTracks,
    bpm,
    timeSignature,
  };
}

/**
 * Common test patterns for MIDI sequences
 */
export const MIDI_TEST_PATTERNS = {
  // C Major Scale
  C_MAJOR_SCALE: [60, 62, 64, 65, 67, 69, 71, 72],
  
  // C Major Chord
  C_MAJOR_CHORD: [60, 64, 67],
  
  // Common drum pattern (kick, snare, hihat)
  BASIC_DRUM_PATTERN: [36, 38, 42],
  
  // Bass line pattern
  BASS_LINE: [36, 36, 43, 43, 41, 41, 43, 43],
  
  // Chromatic scale
  CHROMATIC: Array.from({ length: 12 }, (_, i) => 60 + i),
};

/**
 * Create a MIDI file blob for testing file operations
 */
export function createTestMidiFileBlob(midiData?: MidiData): Blob {
  // This is a simplified MIDI file structure for testing
  // In real tests, you might want to use a proper MIDI library
  const data = midiData || createTestMidiData();
  
  // Create a simple JSON representation (not actual MIDI format)
  const jsonData = JSON.stringify(data);
  
  return new Blob([jsonData], { type: 'audio/midi' });
}

/**
 * Create test audio file metadata
 */
export function createTestAudioFileMetadata(overrides?: {
  name?: string;
  size?: number;
  type?: string;
  duration?: number;
  sampleRate?: number;
}) {
  return {
    name: overrides?.name || 'test-audio.wav',
    size: overrides?.size || 1024 * 1024, // 1MB
    type: overrides?.type || 'audio/wav',
    duration: overrides?.duration || 10, // 10 seconds
    sampleRate: overrides?.sampleRate || 44100,
  };
}

/**
 * Generate velocity curve for humanization
 */
export function generateVelocityCurve(noteCount: number, config: {
  baseVelocity?: number;
  variation?: number;
  pattern?: 'constant' | 'crescendo' | 'decrescendo' | 'random' | 'accent';
  accentInterval?: number;
} = {}): number[] {
  const {
    baseVelocity = 80,
    variation = 20,
    pattern = 'constant',
    accentInterval = 4,
  } = config;

  const velocities: number[] = [];

  for (let i = 0; i < noteCount; i++) {
    let velocity = baseVelocity;

    switch (pattern) {
      case 'crescendo':
        velocity = baseVelocity + (variation * i / noteCount);
        break;
      case 'decrescendo':
        velocity = baseVelocity - (variation * i / noteCount);
        break;
      case 'random':
        velocity = baseVelocity + (Math.random() * variation - variation / 2);
        break;
      case 'accent':
        velocity = i % accentInterval === 0 ? baseVelocity + variation : baseVelocity;
        break;
    }

    // Clamp to MIDI velocity range
    velocities.push(Math.max(1, Math.min(127, Math.round(velocity))));
  }

  return velocities;
}

/**
 * Convert grid-based notes to time-based MIDI notes
 */
export function convertGridNotesToMidi(
  notes: Note[],
  bpm: number = 120,
  subdivision: number = 16
): MidiNote[] {
  const secondsPerBeat = 60 / bpm;
  const secondsPerSubdivision = secondsPerBeat / (subdivision / 4);

  return notes.map(note => ({
    ...note,
    velocity: (note.velocity || 100) / 127, // Convert to 0-1 range
    time: note.column * secondsPerSubdivision,
    duration: note.length * secondsPerSubdivision,
  }));
}

/**
 * Create a chord progression
 */
export function createChordProgression(config: {
  progression?: string[]; // e.g., ['C', 'Am', 'F', 'G']
  startTime?: number;
  chordDuration?: number;
  baseOctave?: number;
} = {}): MidiNote[] {
  const {
    progression = ['C', 'Am', 'F', 'G'],
    startTime = 0,
    chordDuration = 1,
    baseOctave = 4,
  } = config;

  const chordMap: { [key: string]: number[] } = {
    'C': [0, 4, 7],
    'Dm': [2, 5, 9],
    'Em': [4, 7, 11],
    'F': [5, 9, 0],
    'G': [7, 11, 2],
    'Am': [9, 0, 4],
    'Bdim': [11, 2, 5],
  };

  const notes: MidiNote[] = [];
  let currentTime = startTime;

  progression.forEach((chordName) => {
    const intervals = chordMap[chordName] || [0, 4, 7];
    const baseNote = baseOctave * 12;

    intervals.forEach((interval) => {
      notes.push(createTestMidiNote({
        row: baseNote + interval,
        time: currentTime,
        duration: chordDuration * 0.9, // Slight gap between chords
        velocity: 0.7,
      }));
    });

    currentTime += chordDuration;
  });

  return notes;
}