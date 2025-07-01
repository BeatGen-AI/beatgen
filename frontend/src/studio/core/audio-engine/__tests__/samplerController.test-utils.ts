import { Note } from '../../../../types/note';
import { MidiManager } from '../../midi/MidiManagerNew';
import MidiSampler from '../midiSamplePlayer/sampler';
import { vi, Mock } from 'vitest';

/**
 * Test utilities for SamplerController tests
 */

/**
 * Creates a mock File object for testing
 */
export const createMockFile = (name: string = 'test.wav', size: number = 1024): File => {
    const content = new ArrayBuffer(size);
    return new File([content], name, { type: 'audio/wav' });
};

/**
 * Creates an array of mock Note objects
 */
export const createMockNotes = (config: {
    count?: number;
    startRow?: number;
    startColumn?: number;
    length?: number;
    velocity?: number;
} = {}): Note[] => {
    const {
        count = 3,
        startRow = 60,
        startColumn = 0,
        length = 4,
        velocity = 0.8
    } = config;

    return Array.from({ length: count }, (_, i) => ({
        id: i,
        row: startRow + i,
        column: startColumn + (i * length),
        length,
        velocity,
    }));
};

/**
 * Creates a mock MidiManager with common functionality
 */
export const createMockMidiManager = (config: {
    tracks?: Map<string, Note[]>;
    autoSubscribe?: boolean;
} = {}): Partial<MidiManager> & { mockSubscriptions: Map<string, Function> } => {
    const { tracks = new Map(), autoSubscribe = true } = config;
    const mockSubscriptions = new Map<string, Function>();

    return {
        hasTrack: vi.fn((trackId: string) => tracks.has(trackId)),
        createTrack: vi.fn((trackId: string) => {
            if (!tracks.has(trackId)) {
                tracks.set(trackId, []);
            }
        }),
        addNote: vi.fn((trackId: string, note: Note) => {
            const trackNotes = tracks.get(trackId) || [];
            trackNotes.push(note);
            tracks.set(trackId, trackNotes);
            
            // Trigger subscriptions if autoSubscribe is enabled
            if (autoSubscribe && mockSubscriptions.has(trackId)) {
                const callback = mockSubscriptions.get(trackId)!;
                callback(trackId, trackNotes);
            }
        }),
        removeNote: vi.fn((trackId: string, noteId: number) => {
            const trackNotes = tracks.get(trackId) || [];
            const filtered = trackNotes.filter(n => n.id !== noteId);
            tracks.set(trackId, filtered);
            
            // Trigger subscriptions
            if (autoSubscribe && mockSubscriptions.has(trackId)) {
                const callback = mockSubscriptions.get(trackId)!;
                callback(trackId, filtered);
            }
        }),
        getTrackNotes: vi.fn((trackId: string) => tracks.get(trackId) || []),
        subscribeToTrack: vi.fn((trackId: string, callback: Function) => {
            mockSubscriptions.set(trackId, callback);
            
            // Immediately call with current notes if autoSubscribe
            if (autoSubscribe && tracks.has(trackId)) {
                callback(trackId, tracks.get(trackId)!);
            }
            
            // Return unsubscribe function
            return () => {
                mockSubscriptions.delete(trackId);
            };
        }),
        mockSubscriptions, // Expose for testing
    };
};

/**
 * Creates a mock MidiSampler with all methods
 */
export const createMockMidiSampler = (config: {
    hasBuffer?: boolean;
    notes?: Note[];
} = {}): Partial<MidiSampler> => {
    const { hasBuffer = true, notes = [] } = config;
    
    return {
        initialize: vi.fn().mockResolvedValue(undefined),
        loadAudioFile: vi.fn().mockResolvedValue(undefined),
        setBaseNote: vi.fn(),
        setNotes: vi.fn(),
        getNotes: vi.fn().mockReturnValue(notes),
        getBaseNote: vi.fn().mockReturnValue(60),
        playNote: vi.fn(),
        playMidi: vi.fn(),
        stopPlayback: vi.fn(),
        dispose: vi.fn(),
        setGrainSize: vi.fn(),
        setOverlap: vi.fn(),
        setOffset: vi.fn(),
        getOffset: vi.fn().mockReturnValue(0),
        setVolume: vi.fn(),
        setMute: vi.fn(),
        buffer: hasBuffer ? {} : null,
    };
};

/**
 * Sets up Tone.js mocks with common functionality
 */
export const setupToneMocks = () => {
    const transportState = { value: 'stopped' };
    const transportEvents: Array<{ time: number; callback: Function }> = [];

    return {
        Transport: {
            state: transportState.value,
            start: vi.fn(() => { transportState.value = 'started'; }),
            stop: vi.fn(() => { transportState.value = 'stopped'; }),
            pause: vi.fn(() => { transportState.value = 'paused'; }),
            cancel: vi.fn(() => { transportEvents.length = 0; }),
            schedule: vi.fn((callback: Function, time: number) => {
                transportEvents.push({ time, callback });
            }),
            bpm: { value: 120 },
            seconds: 0,
        },
        GrainPlayer: vi.fn().mockImplementation(() => ({
            connect: vi.fn().mockReturnThis(),
            disconnect: vi.fn(),
            dispose: vi.fn(),
            start: vi.fn().mockReturnThis(),
            stop: vi.fn().mockReturnThis(),
            buffer: null,
            grainSize: 0.1,
            overlap: 0.1,
            detune: 0,
            volume: { value: 0 },
            disposed: false,
        })),
        Gain: vi.fn().mockImplementation(() => ({
            toDestination: vi.fn().mockReturnThis(),
            connect: vi.fn().mockReturnThis(),
            disconnect: vi.fn(),
            dispose: vi.fn(),
            gain: { value: 1 },
            disposed: false,
        })),
        now: vi.fn(() => 0),
        gainToDb: vi.fn((gain: number) => 20 * Math.log10(gain)),
        dbToGain: vi.fn((db: number) => Math.pow(10, db / 20)),
        Frequency: vi.fn().mockImplementation((note: number, type: string) => ({
            toNote: vi.fn(() => {
                const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                const octave = Math.floor(note / 12) - 1;
                const noteName = noteNames[note % 12];
                return `${noteName}${octave}`;
            }),
        })),
        start: vi.fn().mockResolvedValue(undefined),
        transportEvents, // Expose for testing
    };
};

/**
 * Helper to wait for async operations to complete
 */
export const waitForAsync = (ms: number = 10): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Creates a test scenario with multiple tracks
 */
export const createMultiTrackScenario = async (
    samplerController: any,
    config: {
        trackCount?: number;
        notesPerTrack?: number;
        baseNote?: number;
    } = {}
) => {
    const {
        trackCount = 3,
        notesPerTrack = 4,
        baseNote = 60,
    } = config;

    const tracks: Array<{
        id: string;
        file: File;
        notes: Note[];
        midiManager: ReturnType<typeof createMockMidiManager>;
    }> = [];

    for (let i = 0; i < trackCount; i++) {
        const trackId = `track-${i}`;
        const file = createMockFile(`track-${i}.wav`);
        const notes = createMockNotes({
            count: notesPerTrack,
            startRow: baseNote + (i * 12), // Each track an octave higher
        });
        
        const midiManager = createMockMidiManager({
            tracks: new Map([[trackId, notes]]),
        });

        await samplerController.connectTrackToSampler(
            trackId,
            file,
            midiManager as any,
            baseNote
        );

        tracks.push({ id: trackId, file, notes, midiManager });
    }

    return tracks;
};

/**
 * Asserts that console methods were called with expected patterns
 */
export const assertConsoleOutput = (
    spy: Mock,
    patterns: Array<string | RegExp>
): void => {
    patterns.forEach(pattern => {
        const found = spy.mock.calls.some(call => {
            const message = call[0];
            if (typeof pattern === 'string') {
                return message.includes(pattern);
            } else {
                return pattern.test(message);
            }
        });
        
        if (!found) {
            throw new Error(`Expected console output matching "${pattern}" not found`);
        }
    });
};

/**
 * Creates a valid WAV file for integration testing
 */
export const createValidWavFile = async (config: {
    duration?: number;
    sampleRate?: number;
    frequency?: number;
} = {}): Promise<File> => {
    const {
        duration = 0.5,
        sampleRate = 44100,
        frequency = 440,
    } = config;

    const numSamples = Math.floor(sampleRate * duration);
    const numChannels = 1;
    const bitsPerSample = 16;
    
    // Calculate sizes
    const blockAlign = numChannels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const fileSize = 44 + dataSize; // 44 bytes for header
    
    // Create buffer
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    
    // Helper to write string
    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };
    
    // Write RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, fileSize - 8, true); // File size - 8
    writeString(8, 'WAVE');
    
    // Write fmt chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // Audio format (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // Write data chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Generate audio data (sine wave)
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const sample = Math.sin(2 * Math.PI * frequency * t);
        const value = Math.floor(sample * 0x7FFF);
        view.setInt16(offset, value, true);
        offset += 2;
    }
    
    return new File([buffer], 'test.wav', { type: 'audio/wav' });
};

/**
 * Mock implementation of Web Audio API nodes for testing
 */
export class MockAudioContext {
    public state: string = 'suspended';
    public sampleRate: number = 44100;
    public currentTime: number = 0;
    
    createGain(): any {
        return {
            gain: { value: 1 },
            connect: vi.fn().mockReturnThis(),
            disconnect: vi.fn(),
        };
    }
    
    createBufferSource(): any {
        return {
            buffer: null,
            playbackRate: { value: 1 },
            detune: { value: 0 },
            connect: vi.fn().mockReturnThis(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
        };
    }
    
    decodeAudioData(buffer: ArrayBuffer): Promise<any> {
        return Promise.resolve({
            duration: 1,
            length: 44100,
            numberOfChannels: 1,
            sampleRate: 44100,
        });
    }
    
    resume(): Promise<void> {
        this.state = 'running';
        return Promise.resolve();
    }
}

/**
 * Snapshot testing helper for sampler state
 */
export const createSamplerSnapshot = (samplerController: any): object => {
    const activeSamplers = samplerController.getActiveSamplerIds();
    const snapshot: any = {
        activeSamplerCount: activeSamplers.length,
        samplers: {},
    };
    
    activeSamplers.forEach(id => {
        const sampler = samplerController.getSampler(id);
        if (sampler) {
            snapshot.samplers[id] = {
                hasBuffer: !!sampler.buffer,
                noteCount: sampler.getNotes?.()?.length || 0,
                baseNote: sampler.getBaseNote?.() || 60,
                offset: sampler.getOffset?.() || 0,
            };
        }
    });
    
    return snapshot;
};