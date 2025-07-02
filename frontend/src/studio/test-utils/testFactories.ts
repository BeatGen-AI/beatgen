import { vi } from 'vitest';
import { Note } from '../../types/note';
import { MidiNote, MidiTrack, MidiData } from '../core/midi/types';
import * as Tone from 'tone';

/**
 * Test factories for creating complex test objects
 */

/**
 * Project factory
 */
export interface TestProject {
  id: string;
  name: string;
  bpm: number;
  timeSignature: [number, number];
  tracks: TestTrack[];
  duration: number;
}

export interface TestTrack {
  id: string;
  name: string;
  type: 'midi' | 'audio' | 'drum';
  instrumentId?: string;
  notes?: Note[];
  audioFile?: File;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
}

export function createTestProject(overrides?: Partial<TestProject>): TestProject {
  return {
    id: 'test-project-1',
    name: 'Test Project',
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    duration: 30,
    ...overrides,
  };
}

export function createTestTrack(overrides?: Partial<TestTrack>): TestTrack {
  return {
    id: `test-track-${Date.now()}`,
    name: 'Test Track',
    type: 'midi',
    instrumentId: 'piano',
    notes: [],
    volume: 0,
    pan: 0,
    muted: false,
    solo: false,
    ...overrides,
  };
}

/**
 * Instrument factory
 */
export interface TestInstrument {
  id: string;
  name: string;
  category: string;
  presetId?: number;
  soundfontUrl?: string;
  samples?: Map<number, AudioBuffer>;
}

export function createTestInstrument(overrides?: Partial<TestInstrument>): TestInstrument {
  return {
    id: 'test-instrument',
    name: 'Test Piano',
    category: 'keyboard',
    presetId: 0,
    soundfontUrl: '/soundfonts/piano.sf2',
    samples: new Map(),
    ...overrides,
  };
}

/**
 * Audio engine factory
 */
export interface TestAudioEngine {
  context: AudioContext;
  masterGain: GainNode;
  tracks: Map<string, TestAudioTrack>;
  isPlaying: boolean;
  currentTime: number;
}

export interface TestAudioTrack {
  id: string;
  gain: GainNode;
  pan: StereoPannerNode;
  effects: AudioNode[];
}

export function createTestAudioEngine(
  context: AudioContext,
  overrides?: Partial<TestAudioEngine>
): TestAudioEngine {
  const masterGain = context.createGain();
  masterGain.connect(context.destination);

  return {
    context,
    masterGain,
    tracks: new Map(),
    isPlaying: false,
    currentTime: 0,
    ...overrides,
  };
}

/**
 * Sequencer factory
 */
export interface TestSequencer {
  tracks: Map<string, TestSequencerTrack>;
  currentPosition: number;
  isPlaying: boolean;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
}

export interface TestSequencerTrack {
  id: string;
  events: TestSequencerEvent[];
  muted: boolean;
}

export interface TestSequencerEvent {
  time: number;
  type: 'noteOn' | 'noteOff' | 'control';
  data: any;
}

export function createTestSequencer(overrides?: Partial<TestSequencer>): TestSequencer {
  return {
    tracks: new Map(),
    currentPosition: 0,
    isPlaying: false,
    loop: false,
    loopStart: 0,
    loopEnd: 16,
    ...overrides,
  };
}

/**
 * Mock Tone.js instrument factory
 */
export function createMockToneInstrument() {
  const instrument = {
    loaded: true,
    volume: { value: 0 },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
    triggerAttack: vi.fn(),
    triggerRelease: vi.fn(),
    triggerAttackRelease: vi.fn(),
    releaseAll: vi.fn(),
    toDestination: vi.fn().mockReturnThis(),
    chain: vi.fn().mockReturnThis(),
    fan: vi.fn().mockReturnThis(),
  };

  return instrument;
}

/**
 * Mock Tone.js sampler factory
 */
export function createMockToneSampler(samples?: { [note: string]: string | AudioBuffer }) {
  const sampler = createMockToneInstrument();
  
  return {
    ...sampler,
    _buffers: samples || {},
    add: vi.fn(),
    has: vi.fn((note: string) => !!samples?.[note]),
    loaded: true,
  };
}

/**
 * Mock soundfont player factory
 */
export function createMockSoundfontPlayer() {
  return {
    loadSoundfont: vi.fn().mockResolvedValue(undefined),
    playNote: vi.fn(),
    stopNote: vi.fn(),
    stopAll: vi.fn(),
    setVolume: vi.fn(),
    setPan: vi.fn(),
    dispose: vi.fn(),
    isLoaded: vi.fn().mockReturnValue(true),
  };
}

/**
 * Session storage factory
 */
export interface TestSessionData {
  projectId: string;
  lastSaved: Date;
  unsavedChanges: boolean;
  history: any[];
  settings: TestSessionSettings;
}

export interface TestSessionSettings {
  snapToGrid: boolean;
  gridSize: number;
  autoSave: boolean;
  theme: 'light' | 'dark';
}

export function createTestSessionData(overrides?: Partial<TestSessionData>): TestSessionData {
  return {
    projectId: 'test-project',
    lastSaved: new Date(),
    unsavedChanges: false,
    history: [],
    settings: {
      snapToGrid: true,
      gridSize: 16,
      autoSave: true,
      theme: 'light',
    },
    ...overrides,
  };
}

/**
 * MIDI device factory
 */
export interface TestMidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  type: 'input' | 'output';
  state: 'connected' | 'disconnected';
  connection: 'open' | 'closed' | 'pending';
}

export function createTestMidiDevice(overrides?: Partial<TestMidiDevice>): TestMidiDevice {
  return {
    id: 'test-midi-device',
    name: 'Test MIDI Controller',
    manufacturer: 'Test Manufacturer',
    type: 'input',
    state: 'connected',
    connection: 'closed',
    ...overrides,
  };
}

/**
 * Web MIDI API mock factory
 */
export function createMockWebMidiApi() {
  const inputs = new Map<string, any>();
  const outputs = new Map<string, any>();

  return {
    requestMIDIAccess: vi.fn().mockResolvedValue({
      inputs,
      outputs,
      sysexEnabled: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  };
}

/**
 * Audio worklet processor factory
 */
export function createMockAudioWorkletProcessor() {
  return {
    port: {
      postMessage: vi.fn(),
      onmessage: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    process: vi.fn().mockReturnValue(true),
  };
}

/**
 * IndexedDB mock factory
 */
export function createMockIndexedDB() {
  const stores = new Map<string, Map<any, any>>();

  return {
    open: vi.fn().mockImplementation((name: string, version?: number) => {
      return {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: {
          objectStoreNames: { contains: vi.fn() },
          createObjectStore: vi.fn((storeName: string) => {
            stores.set(storeName, new Map());
            return {
              createIndex: vi.fn(),
            };
          }),
          transaction: vi.fn((storeNames: string[], mode?: string) => ({
            objectStore: vi.fn((storeName: string) => ({
              add: vi.fn((value: any, key?: any) => {
                const store = stores.get(storeName);
                if (store) {
                  store.set(key || Date.now(), value);
                }
              }),
              put: vi.fn((value: any, key?: any) => {
                const store = stores.get(storeName);
                if (store) {
                  store.set(key || Date.now(), value);
                }
              }),
              get: vi.fn((key: any) => ({
                onsuccess: null,
                result: stores.get(storeNames[0])?.get(key),
              })),
              delete: vi.fn((key: any) => {
                stores.get(storeName)?.delete(key);
              }),
              clear: vi.fn(() => {
                stores.get(storeName)?.clear();
              }),
            })),
          })),
          close: vi.fn(),
        },
      };
    }),
    deleteDatabase: vi.fn((name: string) => {
      stores.clear();
    }),
  };
}

/**
 * Performance monitoring factory
 */
export function createPerformanceMonitor() {
  const metrics: Map<string, number[]> = new Map();

  return {
    start: (label: string) => {
      const start = performance.now();
      return () => {
        const duration = performance.now() - start;
        if (!metrics.has(label)) {
          metrics.set(label, []);
        }
        metrics.get(label)!.push(duration);
      };
    },
    
    getMetrics: (label: string) => {
      const values = metrics.get(label) || [];
      if (values.length === 0) return null;
      
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      return { avg, min, max, count: values.length };
    },
    
    clear: (label?: string) => {
      if (label) {
        metrics.delete(label);
      } else {
        metrics.clear();
      }
    },
  };
}