import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { PlaybackNote } from '../types';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock Tone.js before importing the module under test
// Note: vi.mock is hoisted, so we can't use helper functions inside the factory
vi.mock('tone', () => {
  return {
    GrainPlayer: vi.fn(),
    getTransport: vi.fn(),
    now: vi.fn().mockReturnValue(0),
  };
});

// Import after mocking
import { SamplerChannelPlayer } from './SamplerChannelPlayer';
import * as Tone from 'tone';

// Mock GrainPlayer instance factory
const createMockGrainPlayer = () => ({
  connect: vi.fn().mockReturnThis(),
  detune: 0,
  volume: { value: 0, rampTo: vi.fn() },
  start: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
});

// Mock Transport factory
const createMockTransport = () => ({
  schedule: vi.fn().mockReturnValue(1),
  clear: vi.fn(),
});

// Store mock instances for access in tests
let mockTransport: ReturnType<typeof createMockTransport>;
let mockGrainPlayerInstances: ReturnType<typeof createMockGrainPlayer>[];

// ============================================================================
// TEST FACTORIES
// ============================================================================

const createPlaybackNote = (overrides: Partial<PlaybackNote> = {}): PlaybackNote => ({
  pitch: 60,
  startTicks: 0,
  durationTicks: 480,
  velocity: 100,
  ...overrides,
});

const createMockChannel = () => ({
  connect: vi.fn().mockReturnThis(),
  volume: { value: 0 },
  pan: { value: 0 },
  dispose: vi.fn(),
});

const createMockBuffer = (): AudioBuffer => ({
  length: 44100,
  duration: 1,
  sampleRate: 44100,
  numberOfChannels: 2,
  getChannelData: vi.fn().mockReturnValue(new Float32Array(44100)),
  copyFromChannel: vi.fn(),
  copyToChannel: vi.fn(),
}) as unknown as AudioBuffer;

// ============================================================================
// TESTS
// ============================================================================

describe('SamplerChannelPlayer', () => {
  let mockChannel: ReturnType<typeof createMockChannel>;
  let mockBuffer: AudioBuffer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel = createMockChannel();
    mockBuffer = createMockBuffer();
    mockGrainPlayerInstances = [];
    mockTransport = createMockTransport();

    // Reset the mock implementations
    (Tone.getTransport as Mock).mockReturnValue(mockTransport);
    (Tone.GrainPlayer as unknown as Mock).mockImplementation(() => {
      const instance = createMockGrainPlayer();
      mockGrainPlayerInstances.push(instance);
      return instance;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  describe('initialization', () => {
    it('should store all constructor parameters', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,  // grainSize
        0.2,  // overlap
        60    // baseMidiNote
      );

      // Can verify by testing behavior that depends on these values
      expect(player).toBeDefined();
    });

    it('should initialize with empty notes array', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      // Should not throw when playing with no notes
      player.play(0);

      // No GrainPlayer instances should be created
      expect(mockGrainPlayerInstances.length).toBe(0);
    });
  });

  // ==========================================================================
  // NOTE MANAGEMENT
  // ==========================================================================

  describe('note management', () => {
    it('should store notes via setNotes()', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [
        createPlaybackNote({ pitch: 60, startTicks: 0 }),
        createPlaybackNote({ pitch: 64, startTicks: 480 }),
      ];

      player.setNotes(notes);

      // Play should now create players for notes
      player.play(0);

      // First note plays immediately, second is scheduled
      expect(mockGrainPlayerInstances.length).toBe(1);
      expect(mockTransport.schedule).toHaveBeenCalledTimes(1);
    });

    it('should update BPM via setBpm()', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      // Should not throw
      player.setBpm(140);
    });

    it('should warn on invalid BPM', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      player.setBpm(0);
      player.setBpm(-10);

      expect(consoleWarn).toHaveBeenCalledTimes(2);
      consoleWarn.mockRestore();
    });

    it('should update PPQ via setPpq()', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      // Should not throw
      player.setPpq(960);
    });

    it('should warn on invalid PPQ', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      player.setPpq(0);
      player.setPpq(-10);

      expect(consoleWarn).toHaveBeenCalledTimes(2);
      consoleWarn.mockRestore();
    });
  });

  // ==========================================================================
  // TIMING CONVERSION
  // ==========================================================================

  describe('timing conversion', () => {
    it('should convert ticks to seconds correctly at 120 BPM, 480 PPQ', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      player.setBpm(120);
      player.setPpq(480);

      // Note at tick 480 (1 beat at 120 BPM = 0.5 seconds)
      const notes = [createPlaybackNote({ startTicks: 480, durationTicks: 480 })];
      player.setNotes(notes);

      player.play(0);

      // Note is in future, should be scheduled with delay of 0.5 seconds
      expect(mockTransport.schedule).toHaveBeenCalledWith(
        expect.any(Function),
        '+0.5'
      );
    });

    it('should convert ticks to seconds correctly at 60 BPM, 480 PPQ', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      player.setBpm(60);
      player.setPpq(480);

      // Note at tick 480 (1 beat at 60 BPM = 1 second)
      const notes = [createPlaybackNote({ startTicks: 480, durationTicks: 480 })];
      player.setNotes(notes);

      player.play(0);

      // Note is in future, should be scheduled with delay of 1 second
      expect(mockTransport.schedule).toHaveBeenCalledWith(
        expect.any(Function),
        '+1'
      );
    });
  });

  // ==========================================================================
  // PITCH CALCULATION
  // ==========================================================================

  describe('pitch calculation', () => {
    it('should set detune to 0 when note pitch equals baseMidiNote', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60  // baseMidiNote = 60 (C4)
      );

      const notes = [createPlaybackNote({ pitch: 60, startTicks: 0 })];
      player.setNotes(notes);
      player.play(0);

      // GrainPlayer should be created with detune = 0
      expect(mockGrainPlayerInstances.length).toBe(1);
      expect(mockGrainPlayerInstances[0].detune).toBe(0);
    });

    it('should set positive detune when note pitch is higher than baseMidiNote', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60  // baseMidiNote = 60 (C4)
      );

      // D4 = MIDI 62, should be +200 cents (2 semitones up)
      const notes = [createPlaybackNote({ pitch: 62, startTicks: 0 })];
      player.setNotes(notes);
      player.play(0);

      expect(mockGrainPlayerInstances.length).toBe(1);
      expect(mockGrainPlayerInstances[0].detune).toBe(200);
    });

    it('should set negative detune when note pitch is lower than baseMidiNote', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60  // baseMidiNote = 60 (C4)
      );

      // A3 = MIDI 57, should be -300 cents (3 semitones down)
      const notes = [createPlaybackNote({ pitch: 57, startTicks: 0 })];
      player.setNotes(notes);
      player.play(0);

      expect(mockGrainPlayerInstances.length).toBe(1);
      expect(mockGrainPlayerInstances[0].detune).toBe(-300);
    });

    it('should handle octave shifts correctly', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60  // baseMidiNote = 60 (C4)
      );

      // C5 = MIDI 72, should be +1200 cents (1 octave up)
      const notes = [createPlaybackNote({ pitch: 72, startTicks: 0 })];
      player.setNotes(notes);
      player.play(0);

      expect(mockGrainPlayerInstances.length).toBe(1);
      expect(mockGrainPlayerInstances[0].detune).toBe(1200);
    });
  });

  // ==========================================================================
  // NOTE SCHEDULING
  // ==========================================================================

  describe('note scheduling', () => {
    it('should play notes at position 0 immediately', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ startTicks: 0 })];
      player.setNotes(notes);
      player.play(0);

      // Should create player and start immediately
      expect(mockGrainPlayerInstances.length).toBe(1);
      expect(mockGrainPlayerInstances[0].start).toHaveBeenCalled();

      // Should not schedule via Transport
      expect(mockTransport.schedule).not.toHaveBeenCalled();
    });

    it('should schedule future notes via Transport', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ startTicks: 480 })];
      player.setNotes(notes);
      player.play(0);

      // Should not create player immediately
      expect(mockGrainPlayerInstances.length).toBe(0);

      // Should schedule via Transport
      expect(mockTransport.schedule).toHaveBeenCalledTimes(1);
    });

    it('should skip notes that have already ended', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      // Note from 0-480 ticks
      const notes = [createPlaybackNote({ startTicks: 0, durationTicks: 480 })];
      player.setNotes(notes);

      // Start playback at tick 960 (past the note's end)
      player.play(960);

      // Should not create any players or schedule any events
      expect(mockGrainPlayerInstances.length).toBe(0);
      expect(mockTransport.schedule).not.toHaveBeenCalled();
    });

    it('should play partial notes when starting mid-note', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      // Note from 0-960 ticks (2 beats at default 120 BPM = 1 second)
      const notes = [createPlaybackNote({ startTicks: 0, durationTicks: 960 })];
      player.setNotes(notes);

      // Start playback at tick 480 (middle of the note)
      player.play(480);

      // Should create player and start with remaining duration
      expect(mockGrainPlayerInstances.length).toBe(1);
      expect(mockGrainPlayerInstances[0].start).toHaveBeenCalled();
    });

    it('should create GrainPlayer with correct grainSize and overlap', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.15,  // grainSize
        0.25,  // overlap
        60
      );

      const notes = [createPlaybackNote({ startTicks: 0 })];
      player.setNotes(notes);
      player.play(0);

      // GrainPlayer should be created with correct options
      expect(Tone.GrainPlayer).toHaveBeenCalledWith({
        url: mockBuffer,
        grainSize: 0.15,
        overlap: 0.25,
        loop: false,
      });
    });

    it('should connect GrainPlayer to channel', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ startTicks: 0 })];
      player.setNotes(notes);
      player.play(0);

      expect(mockGrainPlayerInstances[0].connect).toHaveBeenCalledWith(mockChannel);
    });
  });

  // ==========================================================================
  // VELOCITY
  // ==========================================================================

  describe('velocity', () => {
    it('should apply velocity to volume', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ velocity: 127 })];
      player.setNotes(notes);
      player.play(0);

      // At velocity 127, gain should be 1.0, which is 0 dB
      // volumeGain = 0.5 + (127/127) * 0.5 = 1.0
      // volume = 20 * log10(1.0) = 0
      expect(mockGrainPlayerInstances[0].volume.value).toBe(0);
    });

    it('should reduce volume for lower velocity', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ velocity: 0 })];
      player.setNotes(notes);
      player.play(0);

      // At velocity 0, gain should be 0.5
      // volume = 20 * log10(0.5) ≈ -6.02
      expect(mockGrainPlayerInstances[0].volume.value).toBeCloseTo(-6.02, 1);
    });
  });

  // ==========================================================================
  // PAUSE AND STOP
  // ==========================================================================

  describe('pause and stop', () => {
    it('should clear scheduled events on pause', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ startTicks: 480 })];
      player.setNotes(notes);
      player.play(0);

      // Should have scheduled an event
      expect(mockTransport.schedule).toHaveBeenCalledTimes(1);

      player.pause();

      // Should clear the scheduled event
      expect(mockTransport.clear).toHaveBeenCalled();
    });

    it('should fade out active players on pause', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ startTicks: 0 })];
      player.setNotes(notes);
      player.play(0);

      // Should have an active player
      expect(mockGrainPlayerInstances.length).toBe(1);

      player.pause();

      // Should fade out
      expect(mockGrainPlayerInstances[0].volume.rampTo).toHaveBeenCalledWith(
        -Infinity,
        0.01
      );
    });

    it('should stop and dispose players after fade', async () => {
      vi.useFakeTimers();

      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ startTicks: 0 })];
      player.setNotes(notes);
      player.play(0);

      player.pause();

      // Fast-forward past the fade time
      vi.advanceTimersByTime(20);

      expect(mockGrainPlayerInstances[0].stop).toHaveBeenCalled();
      expect(mockGrainPlayerInstances[0].dispose).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should have same behavior for stop() as pause()', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ startTicks: 0 })];
      player.setNotes(notes);
      player.play(0);

      player.stop();

      // Should fade out like pause
      expect(mockGrainPlayerInstances[0].volume.rampTo).toHaveBeenCalledWith(
        -Infinity,
        0.01
      );
    });
  });

  // ==========================================================================
  // SEEK
  // ==========================================================================

  describe('seek', () => {
    it('should stop and restart from new position when shouldContinuePlaying is true', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [
        createPlaybackNote({ startTicks: 0 }),
        createPlaybackNote({ startTicks: 960 }),
      ];
      player.setNotes(notes);
      player.play(0);

      // First note should be playing
      expect(mockGrainPlayerInstances.length).toBe(1);
      expect(mockTransport.schedule).toHaveBeenCalledTimes(1);

      // Clear mocks
      (mockTransport.schedule as Mock).mockClear();
      mockGrainPlayerInstances.length = 0;

      // Seek to position 480 with continue playing
      player.seek(480, true);

      // Should schedule the second note (now closer)
      expect(mockTransport.schedule).toHaveBeenCalledTimes(1);
    });

    it('should only clear events when shouldContinuePlaying is false', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ startTicks: 480 })];
      player.setNotes(notes);
      player.play(0);

      // Should have scheduled an event
      expect(mockTransport.schedule).toHaveBeenCalledTimes(1);

      // Clear mocks
      (mockTransport.schedule as Mock).mockClear();

      player.seek(0, false);

      // Should not schedule new events
      expect(mockTransport.schedule).not.toHaveBeenCalled();
      // Should have cleared old events
      expect(mockTransport.clear).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // DISPOSE
  // ==========================================================================

  describe('dispose', () => {
    it('should clear all scheduled events', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ startTicks: 480 })];
      player.setNotes(notes);
      player.play(0);

      player.dispose();

      expect(mockTransport.clear).toHaveBeenCalled();
    });

    it('should dispose all active players', () => {
      const player = new SamplerChannelPlayer(
        'track-1',
        mockBuffer,
        mockChannel as unknown as Tone.Channel,
        0.1,
        0.2,
        60
      );

      const notes = [createPlaybackNote({ startTicks: 0 })];
      player.setNotes(notes);
      player.play(0);

      expect(mockGrainPlayerInstances.length).toBe(1);

      player.dispose();

      expect(mockGrainPlayerInstances[0].stop).toHaveBeenCalled();
      expect(mockGrainPlayerInstances[0].dispose).toHaveBeenCalled();
    });
  });
});
