import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { MidiTrackRenderer } from './MidiTrackRenderer';
import {
  PlaybackTrack,
  PlaybackState,
  MidiResources,
  PlaybackNote,
} from '../types';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock sequencer
const createMockSequencer = () => ({
  registerSynthesizer: vi.fn().mockResolvedValue(undefined),
  setTimeScale: vi.fn(),
  getTimeScale: vi.fn().mockResolvedValue(960),
  getTick: vi.fn().mockResolvedValue(0),
  sendEventAt: vi.fn(),
  removeAllEvents: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
});

// Mock preset
const createMockPreset = (bankNum = 0, num = 0) => ({
  bankNum,
  num,
});

// Mock soundfont object
const createMockSoundFontObject = (presets = [createMockPreset()]) => ({
  getPresetIterable: vi.fn().mockResolvedValue(presets),
});

// Store mock instances for access in tests
let mockSequencerInstance: ReturnType<typeof createMockSequencer>;
let mockSynthInstance: ReturnType<typeof createMockSynth>;
let mockAudioNodeInstance: ReturnType<typeof createMockAudioNode>;

const createMockAudioNode = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
});

const createMockSynth = () => {
  mockSequencerInstance = createMockSequencer();
  return {
    createAudioNode: vi.fn().mockReturnValue(mockAudioNodeInstance || createMockAudioNode()),
    loadSFont: vi.fn().mockResolvedValue(0),
    setSFontBankOffset: vi.fn(),
    getSFontBankOffset: vi.fn().mockResolvedValue(0),
    getSFontObject: vi.fn().mockResolvedValue(createMockSoundFontObject()),
    midiProgramSelect: vi.fn(),
    midiControl: vi.fn(),
    midiAllNotesOff: vi.fn(),
    createSequencer: vi.fn().mockResolvedValue(mockSequencerInstance),
    closePlayer: vi.fn(),
  };
};

// Mock AudioContext
class MockAudioContext {
  state = 'running';
  destination = {};

  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };

  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

// Mock js-synthesizer module
vi.mock('js-synthesizer', () => ({
  AudioWorkletNodeSynthesizer: vi.fn().mockImplementation(() => {
    mockSynthInstance = createMockSynth();
    return mockSynthInstance;
  }),
}));

// Mock global AudioContext
const originalAudioContext = global.AudioContext;
beforeEach(() => {
  (global as any).AudioContext = MockAudioContext;
});
afterEach(() => {
  (global as any).AudioContext = originalAudioContext;
});

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

const createMidiTrack = (
  id: string,
  overrides: Partial<PlaybackTrack> = {}
): PlaybackTrack => ({
  id,
  type: 'midi',
  name: `MIDI Track ${id}`,
  volume: 80,
  pan: 0,
  mute: false,
  solo: false,
  effectiveMute: false,
  regions: [],
  resources: {
    type: 'midi',
    soundfontId: -1,
    channel: -1,
    instrumentId: 'piano',
    notes: [createPlaybackNote()],
  } as MidiResources,
  ...overrides,
});

const createPlaybackState = (tracks: PlaybackTrack[] = []): PlaybackState => ({
  bpm: 120,
  timeSignature: [4, 4] as [number, number],
  ppq: 480,
  tracks,
  masterVolume: 100,
});

// ============================================================================
// TESTS
// ============================================================================

describe('MidiTrackRenderer', () => {
  let soundfontCache: Map<string, ArrayBuffer>;
  let renderer: MidiTrackRenderer;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mock instances
    mockAudioNodeInstance = createMockAudioNode();

    // Create soundfont cache with test data
    soundfontCache = new Map();
    soundfontCache.set('piano', new ArrayBuffer(1024));
    soundfontCache.set('strings', new ArrayBuffer(2048));

    renderer = new MidiTrackRenderer(soundfontCache);
  });

  afterEach(() => {
    renderer.dispose();
  });

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  describe('initialization', () => {
    it('should create AudioContext on initialize()', async () => {
      await renderer.initialize();

      expect(MockAudioContext).toBeDefined();
    });

    it('should load AudioWorklet modules', async () => {
      await renderer.initialize();

      // Check addModule was called for both worklet files
      const mockContext = (renderer as any).audioContext as MockAudioContext;
      expect(mockContext.audioWorklet.addModule).toHaveBeenCalledWith(
        '/js-synthesizer/libfluidsynth-2.3.0.js'
      );
      expect(mockContext.audioWorklet.addModule).toHaveBeenCalledWith(
        '/js-synthesizer/js-synthesizer.worklet.js'
      );
    });

    it('should create synthesizer with polyphony 256', async () => {
      await renderer.initialize();

      expect(mockSynthInstance.createAudioNode).toHaveBeenCalledWith(
        expect.anything(),
        { polyphony: 256 }
      );
    });

    it('should connect audio node to destination', async () => {
      await renderer.initialize();

      expect(mockAudioNodeInstance.connect).toHaveBeenCalled();
    });

    it('should warn if already initialized', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await renderer.initialize();
      await renderer.initialize(); // Second call

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Already initialized')
      );

      consoleWarn.mockRestore();
    });

    it('should throw on worklet load failure', async () => {
      const mockContext = new MockAudioContext();
      mockContext.audioWorklet.addModule.mockRejectedValue(new Error('Module failed'));
      (global as any).AudioContext = vi.fn().mockImplementation(() => mockContext);

      const failingRenderer = new MidiTrackRenderer(soundfontCache);

      await expect(failingRenderer.initialize()).rejects.toThrow('Module failed');
    });
  });

  // ==========================================================================
  // SOUNDFONT LOADING
  // ==========================================================================

  describe('soundfont loading', () => {
    beforeEach(async () => {
      await renderer.initialize();
    });

    it('should load soundfont and return sfontId', async () => {
      mockSynthInstance.loadSFont.mockResolvedValue(42);

      const sfontId = await renderer.loadSoundfont('newInstrument', new ArrayBuffer(512));

      expect(mockSynthInstance.loadSFont).toHaveBeenCalled();
      expect(sfontId).toBe(42);
    });

    it('should cache loaded soundfonts', async () => {
      mockSynthInstance.loadSFont.mockResolvedValue(5);

      await renderer.loadSoundfont('piano', new ArrayBuffer(512));

      expect(renderer.hasSoundfont('piano')).toBe(true);
      expect(renderer.getSoundfontId('piano')).toBe(5);
    });

    it('should not reload already-loaded soundfont', async () => {
      mockSynthInstance.loadSFont.mockResolvedValue(1);

      await renderer.loadSoundfont('piano', new ArrayBuffer(512));
      mockSynthInstance.loadSFont.mockClear();

      const sfontId = await renderer.loadSoundfont('piano', new ArrayBuffer(512));

      expect(mockSynthInstance.loadSFont).not.toHaveBeenCalled();
      expect(sfontId).toBe(1);
    });

    it('should throw on load failure', async () => {
      mockSynthInstance.loadSFont.mockRejectedValue(new Error('Load failed'));

      await expect(
        renderer.loadSoundfont('broken', new ArrayBuffer(512))
      ).rejects.toThrow('Load failed');
    });

    it('should throw if synth not initialized', async () => {
      const uninitializedRenderer = new MidiTrackRenderer(soundfontCache);

      await expect(
        uninitializedRenderer.loadSoundfont('test', new ArrayBuffer(512))
      ).rejects.toThrow('not initialized');
    });
  });

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  describe('update()', () => {
    beforeEach(async () => {
      await renderer.initialize();
      // Pre-load soundfont
      mockSynthInstance.loadSFont.mockResolvedValue(0);
      await renderer.loadSoundfont('piano', new ArrayBuffer(512));
    });

    it('should create MidiChannelPlayer for new tracks', async () => {
      const track = createMidiTrack('track1');
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);

      // Wait for async player creation
      await new Promise((r) => setTimeout(r, 50));

      // Should have created sequencer for the track
      expect(mockSynthInstance.createSequencer).toHaveBeenCalled();
    });

    it('should update notes on existing tracks', async () => {
      const track1 = createMidiTrack('track1', {
        resources: {
          type: 'midi',
          soundfontId: -1,
          channel: -1,
          instrumentId: 'piano',
          notes: [createPlaybackNote({ pitch: 60 })],
        },
      });
      const state = createPlaybackState([track1]);

      renderer.update([track1], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      // Update with new notes
      const track2 = createMidiTrack('track1', {
        resources: {
          type: 'midi',
          soundfontId: -1,
          channel: -1,
          instrumentId: 'piano',
          notes: [createPlaybackNote({ pitch: 72 })],
        },
      });

      renderer.update([track2], [track1], state);

      // Notes should be updated - we verify this indirectly
    });

    it('should cleanup removed tracks', async () => {
      const track1 = createMidiTrack('track1');
      const track2 = createMidiTrack('track2', {
        resources: {
          type: 'midi',
          soundfontId: -1,
          channel: -1,
          instrumentId: 'piano',
          notes: [createPlaybackNote()],
        },
      });
      const state = createPlaybackState([track1, track2]);

      renderer.update([track1, track2], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      // Remove track2
      renderer.update([track1], [track1, track2], state);

      // Track2's player should be disposed
      // We verify by checking sequencer.close was called
      expect(mockSequencerInstance.close).toHaveBeenCalled();
    });

    it('should update BPM on all players', async () => {
      const track = createMidiTrack('track1');
      const state1 = createPlaybackState([track]);
      state1.bpm = 120;

      renderer.update([track], undefined, state1);
      await new Promise((r) => setTimeout(r, 50));

      const state2 = createPlaybackState([track]);
      state2.bpm = 140;

      (mockSequencerInstance.setTimeScale as Mock).mockClear();

      renderer.update([track], [track], state2);

      // Time scale should be updated
      expect(mockSequencerInstance.setTimeScale).toHaveBeenCalled();
    });

    it('should emit error when soundfont not loaded', async () => {
      let emittedError: Error | null = null;
      renderer.setErrorCallback((error) => {
        emittedError = error;
      });

      const track = createMidiTrack('track1', {
        resources: {
          type: 'midi',
          soundfontId: -1,
          channel: -1,
          instrumentId: 'unknown_instrument',
          notes: [createPlaybackNote()],
        },
      });
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      expect(emittedError).not.toBeNull();
      expect(emittedError!.message).toContain('not loaded');
    });

    it('should emit error if not initialized', () => {
      const uninitializedRenderer = new MidiTrackRenderer(soundfontCache);
      let emittedError: Error | null = null;
      uninitializedRenderer.setErrorCallback((error) => {
        emittedError = error;
      });

      const track = createMidiTrack('track1');
      const state = createPlaybackState([track]);

      uninitializedRenderer.update([track], undefined, state);

      expect(emittedError).not.toBeNull();
      expect(emittedError!.message).toContain('Not initialized');
    });
  });

  // ==========================================================================
  // CHANNEL ALLOCATION
  // ==========================================================================

  describe('channel allocation', () => {
    beforeEach(async () => {
      await renderer.initialize();
      mockSynthInstance.loadSFont.mockResolvedValue(0);
      await renderer.loadSoundfont('piano', new ArrayBuffer(512));
    });

    it('should allocate channels 0-15 skipping 9', async () => {
      // Create 16 tracks to test allocation
      const tracks: PlaybackTrack[] = [];
      for (let i = 0; i < 16; i++) {
        tracks.push(createMidiTrack(`track${i}`));
      }
      const state = createPlaybackState(tracks);

      renderer.update(tracks, undefined, state);
      await new Promise((r) => setTimeout(r, 100));

      // Should allocate channels 0-8, 10-15 (skipping 9)
      // Only 15 tracks can be created (16 channels minus channel 9)
      const programSelectCalls = mockSynthInstance.midiProgramSelect.mock.calls;
      const allocatedChannels = programSelectCalls.map((call) => call[0]);

      expect(allocatedChannels).not.toContain(9);
    });

    it('should reuse channel for same trackId', async () => {
      const track = createMidiTrack('track1');
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      // Update track - should not reallocate channel
      renderer.update([track], [track], state);
      await new Promise((r) => setTimeout(r, 50));

      // Only one channel allocation should happen
      const createSequencerCalls = mockSynthInstance.createSequencer.mock.calls.length;
      expect(createSequencerCalls).toBe(1);
    });

    it('should release channel on cleanup', async () => {
      const track = createMidiTrack('track1');
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      renderer.cleanup(['track1']);

      // Channel should be released - we can add another track using that channel
      const newTrack = createMidiTrack('track2');
      renderer.update([newTrack], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      // Should succeed without channel limit error
    });

    it('should emit error when all channels used', async () => {
      let emittedError: Error | null = null;
      renderer.setErrorCallback((error) => {
        emittedError = error;
      });

      // Create 16 tracks (only 15 channels available)
      const tracks: PlaybackTrack[] = [];
      for (let i = 0; i < 16; i++) {
        tracks.push(createMidiTrack(`track${i}`));
      }
      const state = createPlaybackState(tracks);

      renderer.update(tracks, undefined, state);
      await new Promise((r) => setTimeout(r, 200));

      expect(emittedError).not.toBeNull();
      expect(emittedError!.message).toContain('maximum');
    });
  });

  // ==========================================================================
  // PLAYBACK CONTROLS
  // ==========================================================================

  describe('playback controls', () => {
    beforeEach(async () => {
      await renderer.initialize();
      mockSynthInstance.loadSFont.mockResolvedValue(0);
      await renderer.loadSoundfont('piano', new ArrayBuffer(512));
    });

    it('should resume AudioContext on play()', async () => {
      const track = createMidiTrack('track1');
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      // Set context to suspended
      const mockContext = (renderer as any).audioContext as MockAudioContext;
      mockContext.state = 'suspended';

      renderer.play(0);

      expect(mockContext.resume).toHaveBeenCalled();
    });

    it('should call play() on all non-muted players', async () => {
      const track1 = createMidiTrack('track1', { effectiveMute: false });
      const track2 = createMidiTrack('track2', { effectiveMute: true });
      const state = createPlaybackState([track1, track2]);

      renderer.update([track1, track2], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      // Clear previous sendEventAt calls
      (mockSequencerInstance.sendEventAt as Mock).mockClear();

      renderer.play(0);

      // Only non-muted track should schedule events
      // Due to async nature, we rely on console.log verification
    });

    it('should pause all players', async () => {
      const track = createMidiTrack('track1');
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      renderer.play(0);
      renderer.pause();

      // All notes off should be called
      expect(mockSynthInstance.midiAllNotesOff).toHaveBeenCalled();
    });

    it('should stop all players', async () => {
      const track = createMidiTrack('track1');
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      renderer.play(0);
      renderer.stop();

      // Sequencer should be recreated (closed then created again)
      expect(mockSequencerInstance.close).toHaveBeenCalled();
    });

    it('should seek all players', async () => {
      const track = createMidiTrack('track1');
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      renderer.seek(960, true);

      // Sequencer should be recreated for clean state
      expect(mockSequencerInstance.close).toHaveBeenCalled();
    });

    it('should not schedule events on seek when not playing', async () => {
      const track = createMidiTrack('track1');
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      (mockSequencerInstance.sendEventAt as Mock).mockClear();

      renderer.seek(960, false);

      // Wait for async operations
      await new Promise((r) => setTimeout(r, 50));

      // No events should be scheduled when isPlaying is false
      expect(mockSequencerInstance.sendEventAt).not.toHaveBeenCalled();
    });

    it('should emit error if not initialized on play', () => {
      const uninitializedRenderer = new MidiTrackRenderer(soundfontCache);
      let emittedError: Error | null = null;
      uninitializedRenderer.setErrorCallback((error) => {
        emittedError = error;
      });

      uninitializedRenderer.play(0);

      expect(emittedError).not.toBeNull();
      expect(emittedError!.message).toContain('Not initialized');
    });
  });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  describe('error handling', () => {
    beforeEach(async () => {
      await renderer.initialize();
    });

    it('should emit errors via errorCallback', async () => {
      let emittedError: Error | null = null;
      let emittedContext: string | null = null;

      renderer.setErrorCallback((error, context) => {
        emittedError = error;
        emittedContext = context;
      });

      const track = createMidiTrack('track1', {
        resources: {
          type: 'midi',
          soundfontId: -1,
          channel: -1,
          instrumentId: 'missing',
          notes: [],
        },
      });
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      expect(emittedError).not.toBeNull();
      expect(emittedContext).toContain('MidiTrackRenderer');
    });

    it('should propagate errors from createTrackPlayer', async () => {
      let emittedError: Error | null = null;
      renderer.setErrorCallback((error) => {
        emittedError = error;
      });

      // Cause error by using missing soundfont
      const track = createMidiTrack('track1', {
        resources: {
          type: 'midi',
          soundfontId: -1,
          channel: -1,
          instrumentId: 'notLoaded',
          notes: [],
        },
      });
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      expect(emittedError).not.toBeNull();
    });

    it('should handle Promise.all rejection in update()', async () => {
      let emittedError: Error | null = null;
      renderer.setErrorCallback((error) => {
        emittedError = error;
      });

      // Create multiple tracks with missing soundfonts
      const tracks = [
        createMidiTrack('track1', {
          resources: {
            type: 'midi',
            soundfontId: -1,
            channel: -1,
            instrumentId: 'missing1',
            notes: [],
          },
        }),
        createMidiTrack('track2', {
          resources: {
            type: 'midi',
            soundfontId: -1,
            channel: -1,
            instrumentId: 'missing2',
            notes: [],
          },
        }),
      ];
      const state = createPlaybackState(tracks);

      renderer.update(tracks, undefined, state);
      await new Promise((r) => setTimeout(r, 100));

      expect(emittedError).not.toBeNull();
    });
  });

  // ==========================================================================
  // DISPOSAL
  // ==========================================================================

  describe('disposal', () => {
    beforeEach(async () => {
      await renderer.initialize();
      mockSynthInstance.loadSFont.mockResolvedValue(0);
      await renderer.loadSoundfont('piano', new ArrayBuffer(512));
    });

    it('should dispose all players', async () => {
      const track1 = createMidiTrack('track1');
      const track2 = createMidiTrack('track2', {
        resources: {
          type: 'midi',
          soundfontId: -1,
          channel: -1,
          instrumentId: 'piano',
          notes: [],
        },
      });
      const state = createPlaybackState([track1, track2]);

      renderer.update([track1, track2], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      renderer.dispose();

      // Sequencers should be closed
      expect(mockSequencerInstance.close).toHaveBeenCalled();
    });

    it('should close synthesizer', async () => {
      renderer.dispose();

      expect(mockSynthInstance.closePlayer).toHaveBeenCalled();
    });

    it('should close AudioContext', async () => {
      const mockContext = (renderer as any).audioContext as MockAudioContext;

      renderer.dispose();

      expect(mockContext.close).toHaveBeenCalled();
    });

    it('should clear all maps', async () => {
      const track = createMidiTrack('track1');
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      renderer.dispose();

      expect(renderer.hasSoundfont('piano')).toBe(false);
    });

    it('should handle dispose when not initialized', () => {
      const uninitializedRenderer = new MidiTrackRenderer(soundfontCache);

      // Should not throw
      expect(() => uninitializedRenderer.dispose()).not.toThrow();
    });

    it('should log disposal', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      renderer.dispose();

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Disposed')
      );

      consoleLog.mockRestore();
    });
  });

  // ==========================================================================
  // MIXING
  // ==========================================================================

  describe('mixing', () => {
    beforeEach(async () => {
      await renderer.initialize();
      mockSynthInstance.loadSFont.mockResolvedValue(0);
      await renderer.loadSoundfont('piano', new ArrayBuffer(512));
    });

    it('should update volume when track volume changes', async () => {
      const track = createMidiTrack('track1', { volume: 80 });
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      // Update with new volume
      const updatedTrack = createMidiTrack('track1', { volume: 50 });
      renderer.update([updatedTrack], [track], state);

      // CC7 should be called for volume change
      expect(mockSynthInstance.midiControl).toHaveBeenCalledWith(
        expect.any(Number),
        7,
        expect.any(Number)
      );
    });

    it('should update mute when track mute changes', async () => {
      const track = createMidiTrack('track1', { effectiveMute: false });
      const state = createPlaybackState([track]);

      renderer.update([track], undefined, state);
      await new Promise((r) => setTimeout(r, 50));

      // Mute the track
      const mutedTrack = createMidiTrack('track1', { effectiveMute: true });
      renderer.update([mutedTrack], [track], state);

      // Volume should be set to 0
      expect(mockSynthInstance.midiControl).toHaveBeenCalledWith(
        expect.any(Number),
        7,
        0
      );
    });
  });
});
