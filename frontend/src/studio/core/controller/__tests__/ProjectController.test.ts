import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectController, resetController } from '../ProjectController';

// Mock store state
let mockState: any;

vi.mock('../../../stores/studioStore', () => ({
  useStudioStore: {
    getState: () => mockState,
    setState: vi.fn((updater) => {
      if (typeof updater === 'function') updater(mockState);
    }),
  },
}));

vi.mock('../../audio-engine/AudioEngine', () => ({
  getAudioEngine: () => ({
    isReady: () => true,
    setState: vi.fn(),
  }),
}));

vi.mock('../../playback/buildPlaybackState', () => ({
  buildPlaybackState: () => ({ bpm: 120, tracks: [] }),
}));

describe('ProjectController', () => {
  let controller: ProjectController;

  beforeEach(() => {
    resetController();
    controller = new ProjectController();
    mockState = {
      tracks: [
        { id: 't1', volume: 0.8, pan: 0, mute: false, solo: false, dirty: false, track_type: 'MIDI' },
        { id: 't2', volume: 0.5, pan: 0.3, mute: true, solo: false, dirty: false, track_type: 'AUDIO' },
      ],
      isPlaying: false,
      bpm: 120,
      store: { getMidiManager: () => null },
    };
  });

  describe('changeVolume', () => {
    it('updates volume and marks dirty', () => {
      controller.changeVolume('t1', 0.5);
      expect(mockState.tracks[0].volume).toBe(0.5);
      expect(mockState.tracks[0].dirty).toBe(true);
    });

    it('supports undo', () => {
      controller.changeVolume('t1', 0.5);
      expect(mockState.tracks[0].volume).toBe(0.5);

      controller.undo();
      expect(mockState.tracks[0].volume).toBe(0.8);
    });

    it('supports redo', () => {
      controller.changeVolume('t1', 0.5);
      controller.undo();
      controller.redo();
      expect(mockState.tracks[0].volume).toBe(0.5);
    });

    it('throws for unknown track', () => {
      expect(() => controller.changeVolume('unknown', 0.5)).toThrow('Track not found');
    });
  });

  describe('changePan', () => {
    it('updates pan', () => {
      controller.changePan('t1', -0.5);
      expect(mockState.tracks[0].pan).toBe(-0.5);
    });

    it('supports undo', () => {
      controller.changePan('t1', -0.5);
      controller.undo();
      expect(mockState.tracks[0].pan).toBe(0);
    });
  });

  describe('toggleMute', () => {
    it('toggles mute', () => {
      controller.toggleMute('t1', true);
      expect(mockState.tracks[0].mute).toBe(true);
    });

    it('supports undo', () => {
      controller.toggleMute('t1', true);
      controller.undo();
      expect(mockState.tracks[0].mute).toBe(false);
    });
  });

  describe('toggleSolo', () => {
    it('toggles solo', () => {
      controller.toggleSolo('t1', true);
      expect(mockState.tracks[0].solo).toBe(true);
    });

    it('supports undo', () => {
      controller.toggleSolo('t1', true);
      controller.undo();
      expect(mockState.tracks[0].solo).toBe(false);
    });
  });

  describe('undo/redo stack', () => {
    it('starts empty', () => {
      expect(controller.canUndo()).toBe(false);
      expect(controller.canRedo()).toBe(false);
    });

    it('tracks undo availability', () => {
      controller.changeVolume('t1', 0.5);
      expect(controller.canUndo()).toBe(true);
      expect(controller.canRedo()).toBe(false);
    });

    it('clears redo on new action', () => {
      controller.changeVolume('t1', 0.5);
      controller.undo();
      expect(controller.canRedo()).toBe(true);

      controller.changeVolume('t1', 0.3);
      expect(controller.canRedo()).toBe(false);
    });

    it('clears history', () => {
      controller.changeVolume('t1', 0.5);
      controller.clearHistory();
      expect(controller.canUndo()).toBe(false);
    });
  });

  describe('listeners', () => {
    it('notifies on changes', () => {
      const listener = vi.fn();
      controller.subscribe(listener);
      controller.changeVolume('t1', 0.5);
      expect(listener).toHaveBeenCalled();
    });

    it('allows unsubscribe', () => {
      const listener = vi.fn();
      const unsub = controller.subscribe(listener);
      unsub();
      controller.changeVolume('t1', 0.5);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
