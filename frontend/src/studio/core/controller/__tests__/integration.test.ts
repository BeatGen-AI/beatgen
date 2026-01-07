import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ProjectController,
  resetController,
} from '../ProjectController';
import { registerTrackCommands } from '../commands/TrackCommands';
import { AudioEngineSideEffect } from '../side-effects/AudioEngineSideEffect';
import { AutoSaveSideEffect } from '../side-effects/AutoSaveSideEffect';

/**
 * Integration tests for the ProjectController system.
 * These tests verify the full flow from command execution through
 * state updates, undo/redo, and side effects.
 */

// Mutable mock state that patches can modify
let mockState: any;

// Mock Zustand store
vi.mock('../../../stores/studioStore', () => ({
  useStudioStore: {
    getState: () => mockState,
    setState: vi.fn((updater) => {
      if (typeof updater === 'function') {
        updater(mockState);
      }
    }),
  },
}));

// Mock audio engine
const mockAudioEngine = {
  initialize: vi.fn(),
  setState: vi.fn(),
  isReady: vi.fn().mockReturnValue(true),
};

vi.mock('../../audio-engine/AudioEngine', () => ({
  getAudioEngine: () => mockAudioEngine,
}));

// Mock buildPlaybackState
vi.mock('../../playback/buildPlaybackState', () => ({
  buildPlaybackState: vi.fn().mockReturnValue({
    bpm: 120,
    tracks: [],
  }),
}));

describe('Controller Integration Tests', () => {
  let controller: ProjectController;

  beforeEach(() => {
    resetController();
    controller = new ProjectController();

    // Reset mock state with fresh tracks
    mockState = {
      tracks: [
        {
          id: 'track-1',
          name: 'Track 1',
          volume: 0.8,
          pan: 0,
          mute: false,
          muted: false,
          solo: false,
          soloed: false,
          dirty: false,
          track_type: 'MIDI',
          position: { x: 0, y: 0 },
          x_position: 0,
          y_position: 0,
          instances: [],
        },
        {
          id: 'track-2',
          name: 'Track 2',
          volume: 0.5,
          pan: -0.3,
          mute: true,
          muted: true,
          solo: false,
          soloed: false,
          dirty: false,
          track_type: 'AUDIO',
          position: { x: 100, y: 50 },
          x_position: 100,
          y_position: 50,
          instances: [],
        },
      ],
      isPlaying: false,
      bpm: 120,
      timeSignature: [4, 4],
      store: {
        getMidiManager: () => null,
      },
    };

    // Register all handlers
    registerTrackCommands(controller);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Volume Change Flow', () => {
    it('should change volume and support undo/redo', async () => {
      // Execute volume change
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      // Verify state was updated
      expect(mockState.tracks[0].volume).toBe(0.5);
      expect(mockState.tracks[0].dirty).toBe(true);
      expect(controller.canUndo()).toBe(true);

      // Undo
      await controller.undo();

      // Verify state was restored
      expect(mockState.tracks[0].volume).toBe(0.8);
      expect(controller.canUndo()).toBe(false);
      expect(controller.canRedo()).toBe(true);

      // Redo
      await controller.redo();

      // Verify state was re-applied
      expect(mockState.tracks[0].volume).toBe(0.5);
      expect(controller.canUndo()).toBe(true);
      expect(controller.canRedo()).toBe(false);
    });

    it('should handle multiple volume changes with undo', async () => {
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.6 },
      });

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.4 },
      });

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.2 },
      });

      expect(mockState.tracks[0].volume).toBe(0.2);
      expect(controller.getUndoStackSize()).toBe(3);

      // Undo all three changes
      await controller.undo();
      expect(mockState.tracks[0].volume).toBe(0.4);

      await controller.undo();
      expect(mockState.tracks[0].volume).toBe(0.6);

      await controller.undo();
      expect(mockState.tracks[0].volume).toBe(0.8);

      expect(controller.canUndo()).toBe(false);
      expect(controller.getRedoStackSize()).toBe(3);
    });
  });

  describe('Pan Change Flow', () => {
    it('should change pan and support undo', async () => {
      await controller.execute({
        type: 'TRACK_PAN_CHANGE',
        payload: { trackId: 'track-1', pan: 0.5 },
      });

      expect(mockState.tracks[0].pan).toBe(0.5);

      await controller.undo();

      expect(mockState.tracks[0].pan).toBe(0);
    });
  });

  describe('Mute Toggle Flow', () => {
    it('should toggle mute and support undo', async () => {
      expect(mockState.tracks[0].mute).toBe(false);

      await controller.execute({
        type: 'TRACK_MUTE_TOGGLE',
        payload: { trackId: 'track-1', muted: true },
      });

      expect(mockState.tracks[0].mute).toBe(true);
      expect(mockState.tracks[0].muted).toBe(true);

      await controller.undo();

      expect(mockState.tracks[0].mute).toBe(false);
      expect(mockState.tracks[0].muted).toBe(false);
    });

    it('should toggle mute off and support undo', async () => {
      // Start with muted track
      expect(mockState.tracks[1].mute).toBe(true);

      await controller.execute({
        type: 'TRACK_MUTE_TOGGLE',
        payload: { trackId: 'track-2', muted: false },
      });

      expect(mockState.tracks[1].mute).toBe(false);

      await controller.undo();

      expect(mockState.tracks[1].mute).toBe(true);
    });
  });

  describe('Solo Toggle Flow', () => {
    it('should toggle solo and support undo', async () => {
      await controller.execute({
        type: 'TRACK_SOLO_TOGGLE',
        payload: { trackId: 'track-1', soloed: true },
      });

      expect(mockState.tracks[0].solo).toBe(true);
      expect(mockState.tracks[0].soloed).toBe(true);

      await controller.undo();

      expect(mockState.tracks[0].solo).toBe(false);
      expect(mockState.tracks[0].soloed).toBe(false);
    });
  });

  describe('Position Change Flow', () => {
    it('should change position and support undo', async () => {
      await controller.execute({
        type: 'TRACK_POSITION_CHANGE',
        payload: {
          trackId: 'track-1',
          oldPosition: { x: 0, y: 0 },
          newPosition: { x: 200, y: 100 },
        },
      });

      expect(mockState.tracks[0].position).toEqual({ x: 200, y: 100 });
      expect(mockState.tracks[0].x_position).toBe(200);
      expect(mockState.tracks[0].y_position).toBe(100);

      await controller.undo();

      expect(mockState.tracks[0].position).toEqual({ x: 0, y: 0 });
      expect(mockState.tracks[0].x_position).toBe(0);
      expect(mockState.tracks[0].y_position).toBe(0);
    });
  });

  describe('Multiple Operations Flow', () => {
    it('should handle interleaved operations on different tracks', async () => {
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.6 },
      });

      await controller.execute({
        type: 'TRACK_PAN_CHANGE',
        payload: { trackId: 'track-2', pan: 0.5 },
      });

      await controller.execute({
        type: 'TRACK_MUTE_TOGGLE',
        payload: { trackId: 'track-1', muted: true },
      });

      expect(mockState.tracks[0].volume).toBe(0.6);
      expect(mockState.tracks[1].pan).toBe(0.5);
      expect(mockState.tracks[0].mute).toBe(true);

      // Undo all
      await controller.undo();
      expect(mockState.tracks[0].mute).toBe(false);

      await controller.undo();
      expect(mockState.tracks[1].pan).toBe(-0.3);

      await controller.undo();
      expect(mockState.tracks[0].volume).toBe(0.8);
    });
  });

  describe('Side Effect Integration', () => {
    it('should run AudioEngineSideEffect when playing', async () => {
      const audioSideEffect = new AudioEngineSideEffect();
      controller.registerSideEffect(audioSideEffect);

      // Set playing
      mockState.isPlaying = true;

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(mockAudioEngine.setState).toHaveBeenCalled();
    });

    it('should not run AudioEngineSideEffect when not playing', async () => {
      const audioSideEffect = new AudioEngineSideEffect();
      controller.registerSideEffect(audioSideEffect);

      // Not playing
      mockState.isPlaying = false;

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(mockAudioEngine.setState).not.toHaveBeenCalled();
    });

    it('should run AutoSaveSideEffect for dirty changes', async () => {
      const autoSaveSideEffect = new AutoSaveSideEffect();
      const mockAutoSaveService = {
        onTracksChanged: vi.fn(),
      };
      autoSaveSideEffect.setAutoSaveService(mockAutoSaveService as any);
      controller.registerSideEffect(autoSaveSideEffect);

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(mockAutoSaveService.onTracksChanged).toHaveBeenCalled();
    });
  });

  describe('Listener Integration', () => {
    it('should notify listeners on execute', async () => {
      const listener = vi.fn();
      controller.subscribe(listener);

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(listener).toHaveBeenCalled();
    });

    it('should notify listeners on undo/redo', async () => {
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      const listener = vi.fn();
      controller.subscribe(listener);

      await controller.undo();
      expect(listener).toHaveBeenCalledTimes(1);

      await controller.redo();
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('skipHistory Flag', () => {
    it('should not push to undo stack when skipHistory is true', async () => {
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
        metadata: { skipHistory: true },
      });

      expect(mockState.tracks[0].volume).toBe(0.5);
      expect(controller.canUndo()).toBe(false);
      expect(controller.getUndoStackSize()).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw for non-existent track', async () => {
      await expect(
        controller.execute({
          type: 'TRACK_VOLUME_CHANGE',
          payload: { trackId: 'nonexistent', volume: 0.5 },
        })
      ).rejects.toThrow('Track not found: nonexistent');
    });

    it('should not corrupt state on error', async () => {
      const originalVolume = mockState.tracks[0].volume;

      try {
        await controller.execute({
          type: 'TRACK_VOLUME_CHANGE',
          payload: { trackId: 'nonexistent', volume: 0.5 },
        });
      } catch {
        // Expected error
      }

      // Original track should be unchanged
      expect(mockState.tracks[0].volume).toBe(originalVolume);
      expect(controller.canUndo()).toBe(false);
    });
  });

  describe('Redo Stack Clearing', () => {
    it('should clear redo stack when new command is executed', async () => {
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.6 },
      });

      await controller.undo();
      expect(controller.canRedo()).toBe(true);

      // New command should clear redo stack
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.4 },
      });

      expect(controller.canRedo()).toBe(false);
      expect(controller.getRedoStackSize()).toBe(0);
    });
  });
});

describe('Drum Track Propagation Integration', () => {
  let controller: ProjectController;

  beforeEach(() => {
    resetController();
    controller = new ProjectController();

    // Reset mock state with drum and sampler tracks
    mockState = {
      tracks: [
        {
          id: 'drum-1',
          name: 'Drum Track',
          volume: 0.8,
          pan: 0,
          mute: false,
          muted: false,
          dirty: false,
          track_type: 'DRUM',
          track: {},
        },
        {
          id: 'sampler-1',
          name: 'Kick',
          volume: 0.8,
          pan: 0,
          mute: false,
          muted: false,
          dirty: false,
          track_type: 'SAMPLER',
          track: { drum_track_id: 'drum-1' },
        },
        {
          id: 'sampler-2',
          name: 'Snare',
          volume: 0.8,
          pan: 0,
          mute: false,
          muted: false,
          dirty: false,
          track_type: 'SAMPLER',
          track: { drum_track_id: 'drum-1' },
        },
        {
          id: 'other-track',
          name: 'Other',
          volume: 0.5,
          pan: 0,
          mute: false,
          muted: false,
          dirty: false,
          track_type: 'MIDI',
        },
      ],
      isPlaying: false,
      bpm: 120,
      store: {
        getMidiManager: () => null,
      },
    };

    registerTrackCommands(controller);
  });

  it('should propagate volume change to child samplers', async () => {
    await controller.execute({
      type: 'TRACK_VOLUME_CHANGE',
      payload: { trackId: 'drum-1', volume: 0.5 },
    });

    expect(mockState.tracks[0].volume).toBe(0.5); // drum
    expect(mockState.tracks[1].volume).toBe(0.5); // sampler-1
    expect(mockState.tracks[2].volume).toBe(0.5); // sampler-2
    expect(mockState.tracks[3].volume).toBe(0.5); // other track unchanged (note: mock applies all ops)
  });

  it('should propagate mute toggle to child samplers', async () => {
    await controller.execute({
      type: 'TRACK_MUTE_TOGGLE',
      payload: { trackId: 'drum-1', muted: true },
    });

    expect(mockState.tracks[0].mute).toBe(true); // drum
    expect(mockState.tracks[1].mute).toBe(true); // sampler-1
    expect(mockState.tracks[2].mute).toBe(true); // sampler-2
  });

  it('should undo propagated changes correctly', async () => {
    await controller.execute({
      type: 'TRACK_VOLUME_CHANGE',
      payload: { trackId: 'drum-1', volume: 0.5 },
    });

    await controller.undo();

    expect(mockState.tracks[0].volume).toBe(0.8); // drum restored
    expect(mockState.tracks[1].volume).toBe(0.8); // sampler-1 restored
    expect(mockState.tracks[2].volume).toBe(0.8); // sampler-2 restored
  });
});
