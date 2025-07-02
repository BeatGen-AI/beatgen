import { vi } from 'vitest';

// Mock AudioWorkletNode
export class MockAudioWorkletNode {
  public port: MessagePort;
  public parameters: Map<string, AudioParam>;
  
  constructor(public context: any, public name: string, public options?: any) {
    this.port = {
      postMessage: vi.fn(),
      onmessage: null,
      onmessageerror: null,
      close: vi.fn(),
      start: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as any;
    this.parameters = new Map();
  }
  
  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
}

// Mock AudioContext with worklet support
export const createMockAudioContext = () => {
  const mockContext = {
    createGain: vi.fn(() => ({
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      gain: { 
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn()
      }
    })),
    createOscillator: vi.fn(() => ({
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: { 
        value: 440,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn()
      },
      type: 'sine'
    })),
    createBufferSource: vi.fn(() => ({
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      buffer: null,
      playbackRate: { value: 1 },
      loop: false,
      loopStart: 0,
      loopEnd: 0
    })),
    audioWorklet: {
      addModule: vi.fn().mockResolvedValue(undefined)
    },
    destination: {},
    sampleRate: 48000,
    currentTime: 0,
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    decodeAudioData: vi.fn().mockImplementation((buffer) => 
      Promise.resolve({
        duration: 1,
        sampleRate: 48000,
        length: 48000,
        numberOfChannels: 2,
        getChannelData: vi.fn(() => new Float32Array(48000))
      })
    )
  };
  
  return mockContext;
};

// Mock js-synthesizer AudioWorkletNodeSynthesizer
export const createMockAudioWorkletNodeSynthesizer = () => {
  return vi.fn().mockImplementation(() => ({
    createAudioNode: vi.fn().mockImplementation((audioContext, options) => {
      const node = new MockAudioWorkletNode(audioContext, 'fluidsynth-processor', options);
      return node;
    }),
    loadSFont: vi.fn().mockResolvedValue(0), // Returns soundfont ID
    closePlayer: vi.fn(),
    getAudioNode: vi.fn(),
    createSequencer: vi.fn().mockReturnValue({
      scheduleNoteOn: vi.fn(),
      scheduleNoteOff: vi.fn(),
      scheduleCC: vi.fn(),
      scheduleProgramChange: vi.fn(),
      setTimeScale: vi.fn(),
      getTick: vi.fn().mockReturnValue(0),
      start: vi.fn(),
      stop: vi.fn(),
      continue: vi.fn(),
      setLoopEnabled: vi.fn(),
      allNotesOff: vi.fn(),
      allSoundsOff: vi.fn()
    }),
    setSoundFont: vi.fn(),
    setGain: vi.fn(),
    getGain: vi.fn().mockReturnValue(0.5),
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    allNotesOff: vi.fn(),
    allSoundsOff: vi.fn(),
    setBankOffset: vi.fn(),
    programSelect: vi.fn(),
    programChange: vi.fn(),
    setPlayerTempo: vi.fn(),
    getPlayerTempo: vi.fn().mockReturnValue(120),
    getPlayerBPM: vi.fn().mockReturnValue(120),
    setPlayerBPM: vi.fn()
  }));
};

// Mock SequencerWrapper
export const createMockSequencerWrapper = () => {
  const mock = {
    initialize: vi.fn().mockResolvedValue(undefined),
    updateWithNotes: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    seekToGlobalTime: vi.fn().mockResolvedValue(undefined),
    mute: vi.fn(),
    unmute: vi.fn(),
    setVolume: vi.fn(),
    setOffset: vi.fn(),
    getOffset: vi.fn().mockReturnValue(0),
    setBPM: vi.fn().mockResolvedValue(undefined),
    getBPM: vi.fn().mockReturnValue(120),
    resetPosition: vi.fn(),
    dispose: vi.fn(),
    getChannel: 0,
    isMuted: false,
    isPlaying: false,
    currentTick: 0,
    process: vi.fn().mockResolvedValue(undefined)
  };
  
  return vi.fn().mockImplementation(() => mock);
};

// Mock Tone.js components
export const mockTone = {
  Channel: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
    volume: { value: 0 },
    pan: { value: 0 },
    toDestination: vi.fn().mockReturnThis()
  })),
  
  Player: vi.fn().mockImplementation(() => {
    // Create player with writable properties
    const player = {
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      dispose: vi.fn(),
      stop: vi.fn(),
      start: vi.fn(),
      sync: vi.fn(),
      unsync: vi.fn(),
      volume: { value: 0 },
      state: 'stopped',
      buffer: { duration: 10 },
      loop: false,
      autostart: false
    };
    
    // Make loopStart and loopEnd writable by defining them as regular properties
    let _loopStart = 0;
    let _loopEnd = 10;
    
    Object.defineProperty(player, 'loopStart', {
      get: () => _loopStart,
      set: (value) => { _loopStart = value; },
      enumerable: true,
      configurable: true
    });
    
    Object.defineProperty(player, 'loopEnd', {
      get: () => _loopEnd,
      set: (value) => { _loopEnd = value; },
      enumerable: true,
      configurable: true
    });
    
    return player;
  }),
  
  Transport: {
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    schedule: vi.fn(),
    scheduleRepeat: vi.fn(),
    cancel: vi.fn(),
    clear: vi.fn(),
    position: 0,
    seconds: 0,
    state: 'stopped',
    bpm: { value: 120 },
    PPQ: 480, // Default PPQ should be 480 for tests
    getSecondsAtTime: vi.fn((time) => time),
    nextSubdivision: vi.fn(() => 0)
  },
  
  loaded: vi.fn().mockResolvedValue(undefined),
  start: vi.fn().mockResolvedValue(undefined),
  getContext: vi.fn(() => ({
    resume: vi.fn().mockResolvedValue(undefined),
    rawContext: createMockAudioContext()
  })),
  now: vi.fn(() => 0),
  immediate: vi.fn(() => 0),
  Time: vi.fn((value) => ({
    toSeconds: vi.fn(() => typeof value === 'number' ? value : 0)
  }))
};

// Mock MidiSampler
export const createMockMidiSampler = () => {
  const mock = {
    initialize: vi.fn().mockResolvedValue(undefined),
    loadAudioFile: vi.fn().mockResolvedValue(undefined),
    setNotes: vi.fn(),
    playNote: vi.fn(),
    playMidi: vi.fn(),
    stopPlayback: vi.fn(),
    setVolume: vi.fn(),
    setMute: vi.fn(),
    setOffset: vi.fn(),
    setGrainSize: vi.fn(),
    setOverlap: vi.fn(),
    setBaseNote: vi.fn(),
    dispose: vi.fn(),
    getNotes: vi.fn().mockReturnValue([]),
    buffer: { duration: 10 }
  };
  
  return vi.fn().mockImplementation(() => mock);
};

// Mock Note type helper
export const createMockNote = (overrides = {}) => ({
  id: 'note-1',
  pitch: 60,
  velocity: 80,
  startTicks: 0,
  durationTicks: 480,
  trackId: 'track-1',
  ...overrides
});

// Mock soundfont data generator
export const createMockSoundfontData = (size = 1024) => {
  return new ArrayBuffer(size);
};

// Mock File object for audio files
export const createMockAudioFile = (name = 'test.mp3', size = 1024) => {
  const buffer = new ArrayBuffer(size);
  const file = new File([buffer], name, { type: 'audio/mp3' });
  
  // Add arrayBuffer method
  Object.defineProperty(file, 'arrayBuffer', {
    value: vi.fn().mockResolvedValue(buffer)
  });
  
  return file;
};

// Time advancement utilities
export class MockTimer {
  private currentTime = 0;
  
  advance(ms: number) {
    this.currentTime += ms / 1000;
    if (mockTone.Transport) {
      mockTone.Transport.seconds = this.currentTime;
    }
  }
  
  getCurrentTime() {
    return this.currentTime;
  }
  
  reset() {
    this.currentTime = 0;
    if (mockTone.Transport) {
      mockTone.Transport.seconds = 0;
    }
  }
}

// Setup all audio mocks
export const setupAudioMocks = () => {
  // Mock AudioWorkletNode globally
  global.AudioWorkletNode = MockAudioWorkletNode as any;
  
  // Mock AudioContext
  global.AudioContext = vi.fn().mockImplementation(createMockAudioContext) as any;
  
  // Mock performance.now for timing
  global.performance = {
    ...global.performance,
    now: vi.fn(() => Date.now())
  };
  
  return {
    AudioWorkletNodeSynthesizer: createMockAudioWorkletNodeSynthesizer(),
    SequencerWrapper: createMockSequencerWrapper(),
    Tone: mockTone,
    MidiSampler: createMockMidiSampler(),
    timer: new MockTimer()
  };
};