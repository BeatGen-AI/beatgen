import { vi } from 'vitest';

/**
 * Mock AudioContext and related Web Audio API classes
 */

export interface MockAudioBuffer {
  duration: number;
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  getChannelData: (channel: number) => Float32Array;
  copyFromChannel: (destination: Float32Array, channelNumber: number, startInChannel?: number) => void;
  copyToChannel: (source: Float32Array, channelNumber: number, startInChannel?: number) => void;
}

export interface MockAudioNode {
  context: MockAudioContext;
  numberOfInputs: number;
  numberOfOutputs: number;
  channelCount: number;
  channelCountMode: string;
  channelInterpretation: string;
  connect: (destination: any, outputIndex?: number, inputIndex?: number) => any;
  disconnect: (outputOrDestination?: any, output?: number, input?: number) => void;
  addEventListener: (type: string, listener: EventListener | EventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListener | EventListenerObject) => void;
  dispatchEvent: (event: Event) => boolean;
}

export interface MockAudioParam {
  value: number;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  setValueAtTime: (value: number, startTime: number) => MockAudioParam;
  linearRampToValueAtTime: (value: number, endTime: number) => MockAudioParam;
  exponentialRampToValueAtTime: (value: number, endTime: number) => MockAudioParam;
  setTargetAtTime: (target: number, startTime: number, timeConstant: number) => MockAudioParam;
  setValueCurveAtTime: (values: Float32Array | number[], startTime: number, duration: number) => MockAudioParam;
  cancelScheduledValues: (cancelTime: number) => MockAudioParam;
  cancelAndHoldAtTime: (cancelTime: number) => MockAudioParam;
}

export class MockAudioContext implements Partial<AudioContext> {
  public state: AudioContextState = 'suspended';
  public sampleRate: number = 44100;
  public currentTime: number = 0;
  public listener: AudioListener = {} as AudioListener;
  public destination: AudioDestinationNode = {
    maxChannelCount: 2,
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 2,
    channelCountMode: 'max',
    channelInterpretation: 'speakers',
    context: this as any,
    connect: vi.fn(),
    disconnect: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as any;
  public audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };

  private _timeOffset = 0;
  private _running = false;
  private _startTime = 0;

  constructor(options?: AudioContextOptions) {
    if (options?.sampleRate) {
      this.sampleRate = options.sampleRate;
    }
  }

  createGain(): GainNode {
    const gain: MockAudioParam = {
      value: 1,
      defaultValue: 1,
      minValue: -3.4028235e38,
      maxValue: 3.4028235e38,
      setValueAtTime: vi.fn().mockReturnThis(),
      linearRampToValueAtTime: vi.fn().mockReturnThis(),
      exponentialRampToValueAtTime: vi.fn().mockReturnThis(),
      setTargetAtTime: vi.fn().mockReturnThis(),
      setValueCurveAtTime: vi.fn().mockReturnThis(),
      cancelScheduledValues: vi.fn().mockReturnThis(),
      cancelAndHoldAtTime: vi.fn().mockReturnThis(),
    };

    return {
      gain,
      context: this as any,
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'speakers',
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as any;
  }

  createBufferSource(): AudioBufferSourceNode {
    const playbackRate = this.createMockAudioParam(1, 0.0625, 16);
    const detune = this.createMockAudioParam(0, -1200, 1200);

    const source = {
      buffer: null as AudioBuffer | null,
      playbackRate,
      detune,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      context: this as any,
      numberOfInputs: 0,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'speakers',
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onended: null,
    };

    return source as any;
  }

  createOscillator(): OscillatorNode {
    const frequency = this.createMockAudioParam(440, -22050, 22050);
    const detune = this.createMockAudioParam(0, -1200, 1200);

    return {
      type: 'sine' as OscillatorType,
      frequency,
      detune,
      context: this as any,
      numberOfInputs: 0,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'speakers',
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onended: null,
    } as any;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    const channelData: Float32Array[] = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channelData.push(new Float32Array(length));
    }

    return {
      duration: length / sampleRate,
      length,
      numberOfChannels,
      sampleRate,
      getChannelData: (channel: number) => channelData[channel],
      copyFromChannel: vi.fn(),
      copyToChannel: vi.fn(),
    } as any;
  }

  decodeAudioData(
    audioData: ArrayBuffer,
    successCallback?: (decodedData: AudioBuffer) => void,
    errorCallback?: (error: DOMException) => void
  ): Promise<AudioBuffer> {
    const buffer = this.createBuffer(2, 44100, 44100); // 1 second stereo buffer
    
    if (successCallback) {
      setTimeout(() => successCallback(buffer), 0);
    }
    
    return Promise.resolve(buffer);
  }

  resume(): Promise<void> {
    this.state = 'running';
    this._running = true;
    this._startTime = performance.now() - this._timeOffset;
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.state = 'suspended';
    this._running = false;
    this._timeOffset = performance.now() - this._startTime;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = 'closed';
    this._running = false;
    return Promise.resolve();
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    return {
      threshold: this.createMockAudioParam(-24, -100, 0),
      knee: this.createMockAudioParam(30, 0, 40),
      ratio: this.createMockAudioParam(12, 1, 20),
      attack: this.createMockAudioParam(0.003, 0, 1),
      release: this.createMockAudioParam(0.25, 0, 1),
      reduction: 0,
      context: this as any,
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'speakers',
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as any;
  }

  createConvolver(): ConvolverNode {
    return {
      buffer: null,
      normalize: true,
      context: this as any,
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'clamped-max',
      channelInterpretation: 'speakers',
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as any;
  }

  private createMockAudioParam(defaultValue: number, minValue: number, maxValue: number): MockAudioParam {
    return {
      value: defaultValue,
      defaultValue,
      minValue,
      maxValue,
      setValueAtTime: vi.fn().mockReturnThis(),
      linearRampToValueAtTime: vi.fn().mockReturnThis(),
      exponentialRampToValueAtTime: vi.fn().mockReturnThis(),
      setTargetAtTime: vi.fn().mockReturnThis(),
      setValueCurveAtTime: vi.fn().mockReturnThis(),
      cancelScheduledValues: vi.fn().mockReturnThis(),
      cancelAndHoldAtTime: vi.fn().mockReturnThis(),
    };
  }

  // Utility method to advance time in tests
  advanceTime(seconds: number): void {
    if (this._running) {
      this.currentTime += seconds;
    }
  }

  // Utility method to get all connected nodes for testing
  getConnectedNodes(): any[] {
    // This would be implemented based on your specific needs
    return [];
  }
}

/**
 * Create a mock AudioContext with pre-configured behavior
 */
export function createMockAudioContext(options?: {
  state?: AudioContextState;
  sampleRate?: number;
  currentTime?: number;
}): MockAudioContext {
  const context = new MockAudioContext({ sampleRate: options?.sampleRate });
  
  if (options?.state) {
    context.state = options.state;
  }
  
  if (options?.currentTime !== undefined) {
    context.currentTime = options.currentTime;
  }
  
  return context;
}

/**
 * Create a mock for the global Audio constructor
 */
export function createMockAudioConstructor() {
  return vi.fn().mockImplementation(() => ({
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    load: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    src: '',
    currentTime: 0,
    duration: 0,
    paused: true,
    ended: false,
    error: null,
    volume: 1,
    muted: false,
    loop: false,
    playbackRate: 1,
  }));
}

/**
 * Setup global audio mocks for testing
 */
export function setupGlobalAudioMocks() {
  // Mock the global Audio constructor
  (global as any).Audio = createMockAudioConstructor();
  
  // Mock the AudioContext constructor
  (global as any).AudioContext = MockAudioContext;
  (global as any).webkitAudioContext = MockAudioContext;
  
  // Mock MediaDevices if needed
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('Not supported in test environment')),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
      writable: true,
    });
  }
}

/**
 * Clean up global audio mocks
 */
export function cleanupGlobalAudioMocks() {
  delete (global as any).Audio;
  delete (global as any).AudioContext;
  delete (global as any).webkitAudioContext;
}