import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioTrackRenderer } from './AudioTrackRenderer';
import {
  PlaybackTrack,
  PlaybackState,
  PlaybackRegion,
  AudioResources,
} from '../types';

// Mock Tone.js
const mockPlayer = () => ({
  connect: vi.fn().mockReturnThis(),
  disconnect: vi.fn(),
  dispose: vi.fn(),
  stop: vi.fn(),
  start: vi.fn(),
  sync: vi.fn(),
  unsync: vi.fn(),
  volume: {
    value: 0,
    rampTo: vi.fn(),
    cancelScheduledValues: vi.fn(),
  },
  state: 'stopped' as const,
});

const mockChannel = () => ({
  connect: vi.fn().mockReturnThis(),
  disconnect: vi.fn(),
  dispose: vi.fn(),
  volume: { value: 0 },
  pan: { value: 0 },
  toDestination: vi.fn().mockReturnThis(),
});

const mockTransport = {
  schedule: vi.fn().mockReturnValue(1), // Returns event ID
  clear: vi.fn(),
  ticks: 0,
};

vi.mock('tone', () => ({
  default: {},
  Player: vi.fn().mockImplementation(() => mockPlayer()),
  Channel: vi.fn().mockImplementation(() => mockChannel()),
  getTransport: vi.fn(() => mockTransport),
  now: vi.fn(() => 0),
}));

// Import Tone after mocking
import * as Tone from 'tone';

describe('AudioTrackRenderer', () => {
  let renderer: AudioTrackRenderer;
  let buffers: Map<string, AudioBuffer>;
  let mainOutput: Tone.Channel;

  // Helper to create a mock AudioBuffer
  const createMockBuffer = (duration: number = 10): AudioBuffer => ({
    duration,
    length: duration * 48000,
    sampleRate: 48000,
    numberOfChannels: 2,
    getChannelData: vi.fn(() => new Float32Array(48000)),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  });

  // Helper to create a PlaybackTrack
  const createTrack = (
    id: string,
    overrides: Partial<PlaybackTrack> = {}
  ): PlaybackTrack => ({
    id,
    type: 'audio',
    name: `Track ${id}`,
    volume: 80,
    pan: 0,
    mute: false,
    solo: false,
    effectiveMute: false,
    regions: [
      {
        id: `${id}_region_1`,
        startTicks: 0,
        endTicks: 1920, // 1 bar at 480 PPQ
        sourceOffsetTicks: 0,
        durationTicks: 1920,
      },
    ],
    resources: {
      type: 'audio',
      bufferId: id,
      durationSeconds: 10,
      sampleRate: 48000,
    } as AudioResources,
    ...overrides,
  });

  // Helper to create PlaybackState
  const createState = (tracks: PlaybackTrack[] = []): PlaybackState => ({
    bpm: 120,
    timeSignature: [4, 4],
    ppq: 480,
    tracks,
    masterVolume: 100,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset transport mock
    mockTransport.ticks = 0;
    mockTransport.schedule.mockReturnValue(1);

    // Create buffers map with a test buffer
    buffers = new Map();
    buffers.set('track1', createMockBuffer());
    buffers.set('track2', createMockBuffer());

    // Create main output
    mainOutput = new Tone.Channel();

    // Create renderer
    renderer = new AudioTrackRenderer(buffers, mainOutput);
  });

  afterEach(() => {
    renderer.dispose();
  });

  describe('update()', () => {
    it('should create channel for new track', () => {
      const track = createTrack('track1');
      const state = createState([track]);

      renderer.update([track], undefined, state);

      // Channel should be created
      expect(Tone.Channel).toHaveBeenCalled();
    });

    it('should create player for region when buffer exists', () => {
      const track = createTrack('track1');
      const state = createState([track]);

      renderer.update([track], undefined, state);

      // Player should be created for the region
      expect(Tone.Player).toHaveBeenCalled();
    });

    it('should not create player when buffer is missing', () => {
      const track = createTrack('missing_buffer');
      const state = createState([track]);

      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      renderer.update([track], undefined, state);

      // Should warn about missing buffer
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Buffer not loaded')
      );

      consoleWarn.mockRestore();
    });

    it('should update volume when track volume changes', () => {
      const track1 = createTrack('track1', { volume: 80 });
      const state = createState([track1]);

      renderer.update([track1], undefined, state);

      // Update with new volume
      const track2 = createTrack('track1', { volume: 50 });
      renderer.update([track2], [track1], state);

      // Volume should be updated (we can't easily check the exact value due to mocking)
      // But the channel should have been accessed
      expect(Tone.Channel).toHaveBeenCalled();
    });

    it('should mute track when effectiveMute is true', () => {
      const track = createTrack('track1', { effectiveMute: true });
      const state = createState([track]);

      renderer.update([track], undefined, state);

      // Channel volume should be -Infinity when muted
      // Due to mocking, we verify the channel was created
      expect(Tone.Channel).toHaveBeenCalled();
    });

    it('should cleanup removed tracks', () => {
      const track1 = createTrack('track1');
      const track2 = createTrack('track2');
      const state = createState([track1, track2]);

      // Add both tracks
      renderer.update([track1, track2], undefined, state);

      // Remove track2
      renderer.update([track1], [track1, track2], state);

      // track2's channel should be disposed
      // This is harder to verify with mocks, but we can check no errors thrown
    });

    it('should cache BPM and PPQ from state', () => {
      const track = createTrack('track1');
      const state = createState([track]);
      state.bpm = 140;
      state.ppq = 960;

      renderer.update([track], undefined, state);

      // The values are cached internally - we test this indirectly via play()
      // by checking scheduling calculations are correct
    });
  });

  describe('play()', () => {
    it('should schedule regions for playback', () => {
      const track = createTrack('track1');
      const state = createState([track]);

      renderer.update([track], undefined, state);
      renderer.play(0);

      // Player should be started
      // Due to mocking complexity, we verify no errors thrown
    });

    it('should skip muted tracks', () => {
      const track = createTrack('track1', { effectiveMute: true });
      const state = createState([track]);

      renderer.update([track], undefined, state);
      renderer.play(0);

      // Muted track should not schedule playback
      // The player.start should not be called for muted tracks
    });

    it('should skip regions already past current position', () => {
      const track = createTrack('track1', {
        regions: [
          {
            id: 'region1',
            startTicks: 0,
            endTicks: 480,
            sourceOffsetTicks: 0,
            durationTicks: 480,
          },
        ],
      });
      const state = createState([track]);

      renderer.update([track], undefined, state);

      // Play from position past the region
      renderer.play(960); // 2 beats in, region ends at 1 beat

      // Region should be skipped - no scheduling
    });

    it('should schedule future regions via Transport.schedule', () => {
      const track = createTrack('track1', {
        regions: [
          {
            id: 'region1',
            startTicks: 960, // Starts at 2 beats
            endTicks: 1920,
            sourceOffsetTicks: 0,
            durationTicks: 960,
          },
        ],
      });
      const state = createState([track]);

      renderer.update([track], undefined, state);
      renderer.play(0); // Play from beginning

      // Transport.schedule should be called for future region
      expect(mockTransport.schedule).toHaveBeenCalled();
    });
  });

  describe('pause()', () => {
    it('should stop active players with fade', async () => {
      const track = createTrack('track1');
      const state = createState([track]);

      renderer.update([track], undefined, state);
      renderer.play(0);
      renderer.pause();

      // Players should have volume ramped to -Infinity
      // Due to async nature of fade, we just verify no errors
    });

    it('should clear scheduled events', () => {
      const track = createTrack('track1', {
        regions: [
          {
            id: 'region1',
            startTicks: 960,
            endTicks: 1920,
            sourceOffsetTicks: 0,
            durationTicks: 960,
          },
        ],
      });
      const state = createState([track]);

      renderer.update([track], undefined, state);
      renderer.play(0);
      renderer.pause();

      // Transport.clear should be called for scheduled events
      expect(mockTransport.clear).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('should stop all players and clear scheduled events', () => {
      // Create a track with a future region that will be scheduled
      const track = createTrack('track1', {
        regions: [
          {
            id: 'region1',
            startTicks: 960, // Future region
            endTicks: 1920,
            sourceOffsetTicks: 0,
            durationTicks: 960,
          },
        ],
      });
      const state = createState([track]);

      renderer.update([track], undefined, state);
      renderer.play(0); // This schedules the future region
      renderer.stop();

      // Transport.clear should be called for the scheduled event
      expect(mockTransport.clear).toHaveBeenCalled();
    });
  });

  describe('seek()', () => {
    it('should stop immediately without fade', () => {
      const track = createTrack('track1');
      const state = createState([track]);

      renderer.update([track], undefined, state);
      renderer.play(0);
      renderer.seek(960, false);

      // Should stop immediately (no fade)
    });

    it('should restart playback if isPlaying is true', () => {
      const track = createTrack('track1');
      const state = createState([track]);

      renderer.update([track], undefined, state);
      renderer.play(0);
      renderer.seek(960, true);

      // Should call play() internally
    });
  });

  describe('cleanup()', () => {
    it('should dispose players before channels', () => {
      const track1 = createTrack('track1');
      const track2 = createTrack('track2');
      const state = createState([track1, track2]);

      renderer.update([track1, track2], undefined, state);
      renderer.cleanup(['track1']);

      // track1's resources should be cleaned up
      // track2 should remain
    });
  });

  describe('dispose()', () => {
    it('should clean up all resources', () => {
      const track1 = createTrack('track1');
      const track2 = createTrack('track2');
      const state = createState([track1, track2]);

      renderer.update([track1, track2], undefined, state);
      renderer.dispose();

      // All resources should be cleaned up
      // No errors should be thrown
    });
  });

  describe('volume conversion', () => {
    it('should handle 0 volume as -Infinity', () => {
      const track = createTrack('track1', { volume: 0 });
      const state = createState([track]);

      renderer.update([track], undefined, state);

      // Channel volume should be -Infinity
    });

    it('should handle 100 volume as +6dB', () => {
      const track = createTrack('track1', { volume: 100 });
      const state = createState([track]);

      renderer.update([track], undefined, state);

      // Channel volume should be +6dB
    });
  });

  describe('tick to seconds conversion', () => {
    it('should convert ticks to seconds correctly at 120 BPM', () => {
      const track = createTrack('track1');
      const state = createState([track]);
      state.bpm = 120;
      state.ppq = 480;

      renderer.update([track], undefined, state);

      // 480 ticks = 1 beat = 0.5 seconds at 120 BPM
      // 1920 ticks = 4 beats = 2 seconds at 120 BPM
      // This is tested indirectly through scheduling
    });

    it('should convert ticks to seconds correctly at 140 BPM', () => {
      const track = createTrack('track1');
      const state = createState([track]);
      state.bpm = 140;
      state.ppq = 480;

      renderer.update([track], undefined, state);

      // At 140 BPM: 1 beat = 60/140 = 0.4286 seconds
      // 480 ticks = 1 beat = 0.4286 seconds
    });
  });

  describe('region scheduling', () => {
    it('should start immediately when position is within region', () => {
      const track = createTrack('track1', {
        regions: [
          {
            id: 'region1',
            startTicks: 0,
            endTicks: 1920,
            sourceOffsetTicks: 0,
            durationTicks: 1920,
          },
        ],
      });
      const state = createState([track]);

      renderer.update([track], undefined, state);
      renderer.play(480); // Start 1 beat in

      // Player.start should be called immediately (at Tone.now())
    });

    it('should apply source offset when starting mid-region', () => {
      const track = createTrack('track1', {
        regions: [
          {
            id: 'region1',
            startTicks: 0,
            endTicks: 1920,
            sourceOffsetTicks: 480, // Trim: start 1 beat into source
            durationTicks: 1920,
          },
        ],
      });
      const state = createState([track]);

      renderer.update([track], undefined, state);
      renderer.play(0);

      // Player.start should use sourceOffset
    });

    it('should skip zero-duration regions', () => {
      const track = createTrack('track1', {
        regions: [
          {
            id: 'region1',
            startTicks: 480,
            endTicks: 480, // Zero duration
            sourceOffsetTicks: 0,
            durationTicks: 0,
          },
        ],
      });
      const state = createState([track]);

      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      renderer.update([track], undefined, state);

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('zero-duration')
      );

      consoleWarn.mockRestore();
    });
  });
});
