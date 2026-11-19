import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import {
  PlaybackTrack,
  PlaybackState,
  SamplerResources,
  PlaybackNote,
} from '../types';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock SamplerChannelPlayer
const createMockPlayer = () => ({
  setNotes: vi.fn(),
  setBpm: vi.fn(),
  setPpq: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn(),
  dispose: vi.fn(),
});

let mockPlayerInstances: ReturnType<typeof createMockPlayer>[];

vi.mock('./SamplerChannelPlayer', () => {
  return {
    SamplerChannelPlayer: vi.fn().mockImplementation(function () {
      const instance = createMockPlayer();
      mockPlayerInstances.push(instance);
      return instance;
    }),
  };
});

// Mock Tone.js
const createMockChannel = () => ({
  connect: vi.fn().mockReturnThis(),
  volume: { value: 0 },
  pan: { value: 0 },
  dispose: vi.fn(),
});

let mockChannelInstances: ReturnType<typeof createMockChannel>[];

vi.mock('tone', () => {
  return {
    Channel: vi.fn().mockImplementation(function () {
      const instance = createMockChannel();
      mockChannelInstances.push(instance);
      return instance;
    }),
  };
});

// Import after mocking
import { SamplerTrackRenderer } from './SamplerTrackRenderer';
import { SamplerChannelPlayer } from './SamplerChannelPlayer';
import * as Tone from 'tone';

// ============================================================================
// TEST FACTORIES
// ============================================================================

const createMockBuffer = (): AudioBuffer =>
  ({
    length: 44100,
    duration: 1,
    sampleRate: 44100,
    numberOfChannels: 2,
    getChannelData: vi.fn().mockReturnValue(new Float32Array(44100)),
  }) as unknown as AudioBuffer;

const createMockMainOutput = () =>
  ({
    connect: vi.fn().mockReturnThis(),
    volume: { value: 0 },
    pan: { value: 0 },
    dispose: vi.fn(),
  }) as unknown as Tone.Channel;

const createPlaybackNote = (
  overrides: Partial<PlaybackNote> = {}
): PlaybackNote => ({
  pitch: 60,
  startTicks: 0,
  durationTicks: 480,
  velocity: 100,
  ...overrides,
});

const createSamplerResources = (
  overrides: Partial<SamplerResources> = {}
): SamplerResources => ({
  type: 'sampler',
  bufferId: 'buffer-1',
  baseMidiNote: 60,
  grainSize: 0.1,
  overlap: 0.2,
  notes: [],
  ...overrides,
});

const createPlaybackTrack = (
  overrides: Partial<PlaybackTrack> = {}
): PlaybackTrack => ({
  id: 'track-1',
  type: 'sampler',
  name: 'Sampler Track',
  volume: 80,
  pan: 0,
  mute: false,
  solo: false,
  effectiveMute: false,
  regions: [],
  resources: createSamplerResources(),
  ...overrides,
});

const createPlaybackState = (
  overrides: Partial<PlaybackState> = {}
): PlaybackState => ({
  bpm: 120,
  timeSignature: [4, 4],
  ppq: 480,
  tracks: [],
  masterVolume: 100,
  ...overrides,
});

// ============================================================================
// TESTS
// ============================================================================

describe('SamplerTrackRenderer', () => {
  let mockMainOutput: Tone.Channel;
  let buffers: Map<string, AudioBuffer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayerInstances = [];
    mockChannelInstances = [];

    mockMainOutput = createMockMainOutput();
    buffers = new Map([['buffer-1', createMockBuffer()]]);

    // Reset mock implementations
    (SamplerChannelPlayer as unknown as Mock).mockImplementation(function () {
      const instance = createMockPlayer();
      mockPlayerInstances.push(instance);
      return instance;
    });

    (Tone.Channel as unknown as Mock).mockImplementation(function () {
      const instance = createMockChannel();
      mockChannelInstances.push(instance);
      return instance;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // CONSTRUCTOR
  // ==========================================================================

  describe('constructor', () => {
    it('should store buffers and mainOutput references', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      expect(renderer).toBeDefined();
    });
  });

  // ==========================================================================
  // UPDATE - TRACK LIFECYCLE
  // ==========================================================================

  describe('update - track lifecycle', () => {
    it('should create channel for new track', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack();
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);

      // Should create a channel connected to mainOutput
      expect(Tone.Channel).toHaveBeenCalled();
      expect(mockChannelInstances.length).toBe(1);
      expect(mockChannelInstances[0].connect).toHaveBeenCalledWith(mockMainOutput);
    });

    it('should create player for new track', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const resources = createSamplerResources({
        baseMidiNote: 60,
        grainSize: 0.15,
        overlap: 0.25,
      });
      const track = createPlaybackTrack({ resources });
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);

      // Should create a SamplerChannelPlayer with correct params
      expect(SamplerChannelPlayer).toHaveBeenCalledWith(
        'track-1',
        expect.any(Object), // buffer
        expect.any(Object), // channel
        0.15, // grainSize
        0.25, // overlap
        60 // baseMidiNote
      );
    });

    it('should remove player for removed track', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack();
      const state = createPlaybackState({ tracks: [track] });

      // First update: add track
      renderer.update([track], undefined, state);
      expect(mockPlayerInstances.length).toBe(1);

      // Second update: remove track
      renderer.update([], [track], createPlaybackState());

      // Player should be disposed
      expect(mockPlayerInstances[0].dispose).toHaveBeenCalled();
    });

    it('should remove channel for removed track', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack();
      const state = createPlaybackState({ tracks: [track] });

      // First update: add track
      renderer.update([track], undefined, state);
      expect(mockChannelInstances.length).toBe(1);

      // Second update: remove track
      renderer.update([], [track], createPlaybackState());

      // Channel should be disposed
      expect(mockChannelInstances[0].dispose).toHaveBeenCalled();
    });

    it('should update existing player with new notes', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack();
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);

      // Update with new notes
      const notes = [createPlaybackNote({ pitch: 64 })];
      const updatedResources = createSamplerResources({ notes });
      const updatedTrack = createPlaybackTrack({ resources: updatedResources });

      renderer.update([updatedTrack], [track], state);

      // Player should receive new notes
      expect(mockPlayerInstances[0].setNotes).toHaveBeenCalledWith(notes);
    });

    it('should update player BPM and PPQ from state', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack();
      const state = createPlaybackState({ bpm: 140, ppq: 960, tracks: [track] });

      renderer.update([track], undefined, state);

      expect(mockPlayerInstances[0].setBpm).toHaveBeenCalledWith(140);
      expect(mockPlayerInstances[0].setPpq).toHaveBeenCalledWith(960);
    });
  });

  // ==========================================================================
  // UPDATE - FAIL LOUDLY
  // ==========================================================================

  describe('update - fail loudly', () => {
    it('should throw Error if buffer not found for track', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);

      // Track references a buffer that doesn't exist
      const resources = createSamplerResources({ bufferId: 'nonexistent-buffer' });
      const track = createPlaybackTrack({ resources });
      const state = createPlaybackState({ tracks: [track] });

      expect(() => {
        renderer.update([track], undefined, state);
      }).toThrow(
        'SamplerTrackRenderer: Buffer not loaded for track track-1 (bufferId: nonexistent-buffer)'
      );
    });
  });

  // ==========================================================================
  // UPDATE - MIXING
  // ==========================================================================

  describe('update - mixing', () => {
    it('should update channel volume with dB formula', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack({ volume: 50 });
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);

      // At 50%: dB = -60 + (50/100) * 66 = -27
      expect(mockChannelInstances[0].volume.value).toBeCloseTo(-27, 1);
    });

    it('should update channel volume on volume change', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack({ volume: 80 });
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);

      // At 80%: dB = -60 + (80/100) * 66 = -60 + 52.8 = -7.2
      expect(mockChannelInstances[0].volume.value).toBeCloseTo(-7.2, 1);
    });

    it('should set volume to -Infinity when muted', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack({ volume: 80, effectiveMute: true });
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);

      expect(mockChannelInstances[0].volume.value).toBe(-Infinity);
    });

    it('should set volume to -Infinity when volume is 0', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack({ volume: 0 });
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);

      expect(mockChannelInstances[0].volume.value).toBe(-Infinity);
    });

    it('should update channel pan normalized to -1..1', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);

      // Pan left
      const trackLeft = createPlaybackTrack({ id: 'left', pan: -100 });
      const state = createPlaybackState({ tracks: [trackLeft] });

      renderer.update([trackLeft], undefined, state);
      expect(mockChannelInstances[0].pan.value).toBe(-1);

      // Pan right
      buffers.set('buffer-2', createMockBuffer());
      const trackRight = createPlaybackTrack({
        id: 'right',
        pan: 100,
        resources: createSamplerResources({ bufferId: 'buffer-2' }),
      });

      renderer.update([trackLeft, trackRight], [trackLeft], state);
      expect(mockChannelInstances[1].pan.value).toBe(1);
    });

    it('should update channel pan centered', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack({ pan: 0 });
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);

      expect(mockChannelInstances[0].pan.value).toBe(0);
    });
  });

  // ==========================================================================
  // TRANSPORT CONTROLS
  // ==========================================================================

  describe('transport controls', () => {
    it('should call play on players for non-muted tracks', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack({ effectiveMute: false });
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);
      renderer.play(480);

      expect(mockPlayerInstances[0].play).toHaveBeenCalledWith(480);
    });

    it('should not call play on players for muted tracks', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack({ effectiveMute: true });
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);
      renderer.play(480);

      expect(mockPlayerInstances[0].play).not.toHaveBeenCalled();
    });

    it('should call pause on all players', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);

      buffers.set('buffer-2', createMockBuffer());
      const track1 = createPlaybackTrack({ id: 'track-1' });
      const track2 = createPlaybackTrack({
        id: 'track-2',
        resources: createSamplerResources({ bufferId: 'buffer-2' }),
      });
      const state = createPlaybackState({ tracks: [track1, track2] });

      renderer.update([track1, track2], undefined, state);
      renderer.pause();

      expect(mockPlayerInstances[0].pause).toHaveBeenCalled();
      expect(mockPlayerInstances[1].pause).toHaveBeenCalled();
    });

    it('should call stop on all players', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack();
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);
      renderer.stop();

      expect(mockPlayerInstances[0].stop).toHaveBeenCalled();
    });

    it('should call seek on all players with correct params', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack();
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);
      renderer.seek(960, true);

      expect(mockPlayerInstances[0].seek).toHaveBeenCalledWith(960, true);
    });

    it('should call seek with isPlaying=false', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack();
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);
      renderer.seek(480, false);

      expect(mockPlayerInstances[0].seek).toHaveBeenCalledWith(480, false);
    });
  });

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  describe('cleanup', () => {
    it('should dispose player for specified track', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);

      buffers.set('buffer-2', createMockBuffer());
      const track1 = createPlaybackTrack({ id: 'track-1' });
      const track2 = createPlaybackTrack({
        id: 'track-2',
        resources: createSamplerResources({ bufferId: 'buffer-2' }),
      });
      const state = createPlaybackState({ tracks: [track1, track2] });

      renderer.update([track1, track2], undefined, state);

      // Cleanup track-1
      renderer.cleanup(['track-1']);

      // Only track-1's player should be disposed
      expect(mockPlayerInstances[0].dispose).toHaveBeenCalled();
      expect(mockPlayerInstances[1].dispose).not.toHaveBeenCalled();
    });

    it('should dispose channel for specified track', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack();
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);
      renderer.cleanup(['track-1']);

      expect(mockChannelInstances[0].dispose).toHaveBeenCalled();
    });

    it('should dispose player before channel', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);
      const track = createPlaybackTrack();
      const state = createPlaybackState({ tracks: [track] });

      renderer.update([track], undefined, state);

      const disposeOrder: string[] = [];
      mockPlayerInstances[0].dispose = vi.fn(() => disposeOrder.push('player'));
      mockChannelInstances[0].dispose = vi.fn(() => disposeOrder.push('channel'));

      renderer.cleanup(['track-1']);

      expect(disposeOrder).toEqual(['player', 'channel']);
    });
  });

  // ==========================================================================
  // DISPOSE
  // ==========================================================================

  describe('dispose', () => {
    it('should dispose all players', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);

      buffers.set('buffer-2', createMockBuffer());
      const track1 = createPlaybackTrack({ id: 'track-1' });
      const track2 = createPlaybackTrack({
        id: 'track-2',
        resources: createSamplerResources({ bufferId: 'buffer-2' }),
      });
      const state = createPlaybackState({ tracks: [track1, track2] });

      renderer.update([track1, track2], undefined, state);
      renderer.dispose();

      expect(mockPlayerInstances[0].dispose).toHaveBeenCalled();
      expect(mockPlayerInstances[1].dispose).toHaveBeenCalled();
    });

    it('should dispose all channels', () => {
      const renderer = new SamplerTrackRenderer(buffers, mockMainOutput);

      buffers.set('buffer-2', createMockBuffer());
      const track1 = createPlaybackTrack({ id: 'track-1' });
      const track2 = createPlaybackTrack({
        id: 'track-2',
        resources: createSamplerResources({ bufferId: 'buffer-2' }),
      });
      const state = createPlaybackState({ tracks: [track1, track2] });

      renderer.update([track1, track2], undefined, state);
      renderer.dispose();

      expect(mockChannelInstances[0].dispose).toHaveBeenCalled();
      expect(mockChannelInstances[1].dispose).toHaveBeenCalled();
    });
  });
});
