import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ProjectController,
  resetController,
  getProjectController,
} from '../ProjectController';
import {
  Command,
  CommandContext,
  Patch,
  SideEffect,
} from '../types';

// Mock Zustand store
const mockState = {
  tracks: [
    { id: 'track-1', volume: 0.8, pan: 0, mute: false, dirty: false },
    { id: 'track-2', volume: 0.5, pan: 0.3, mute: true, dirty: false },
  ],
  isPlaying: false,
  bpm: 120,
  store: {
    getMidiManager: () => null,
  },
};

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

vi.mock('../../audio-engine/AudioEngine', () => ({
  getAudioEngine: () => ({
    initialize: vi.fn(),
    setState: vi.fn(),
  }),
}));

describe('ProjectController', () => {
  let controller: ProjectController;

  beforeEach(() => {
    resetController();
    controller = new ProjectController();

    // Reset mock state
    mockState.tracks = [
      { id: 'track-1', volume: 0.8, pan: 0, mute: false, dirty: false },
      { id: 'track-2', volume: 0.5, pan: 0.3, mute: true, dirty: false },
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Handler Registration', () => {
    it('should register a command handler', () => {
      const handler = vi.fn().mockReturnValue({
        operations: [],
        inverse: [],
        affectedPaths: [],
      });

      controller.registerHandler('TRACK_VOLUME_CHANGE', handler);

      // Execute to verify handler is registered
      expect(() =>
        controller.execute({
          type: 'TRACK_VOLUME_CHANGE',
          payload: { trackId: 'track-1', volume: 0.5 },
        })
      ).not.toThrow();
    });

    it('should throw when executing unregistered command type', async () => {
      await expect(
        controller.execute({
          type: 'TRACK_VOLUME_CHANGE',
          payload: { trackId: 'track-1', volume: 0.5 },
        })
      ).rejects.toThrow('No handler registered for command type: TRACK_VOLUME_CHANGE');
    });
  });

  describe('Command Execution', () => {
    it('should execute handler and return patch', async () => {
      const expectedPatch: Patch = {
        operations: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.5 }],
        inverse: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.8 }],
        affectedPaths: ['tracks'],
      };

      const handler = vi.fn().mockReturnValue(expectedPatch);
      controller.registerHandler('TRACK_VOLUME_CHANGE', handler);

      const result = await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(result).toEqual(expectedPatch);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should pass correct context to handler', async () => {
      const handler = vi.fn().mockReturnValue({
        operations: [],
        inverse: [],
        affectedPaths: [],
      });

      controller.registerHandler('TRACK_VOLUME_CHANGE', handler);

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      const context = handler.mock.calls[0][1] as CommandContext;
      expect(context.getState).toBeDefined();
      expect(context.audioEngine).toBeDefined();
      expect(typeof context.getState).toBe('function');
    });

    it('should handle async handlers', async () => {
      const handler = vi.fn().mockResolvedValue({
        operations: [],
        inverse: [],
        affectedPaths: [],
      });

      controller.registerHandler('TRACK_VOLUME_CHANGE', handler);

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('Undo/Redo Stack', () => {
    const volumeChangePatch: Patch = {
      operations: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.5 }],
      inverse: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.8 }],
      affectedPaths: ['tracks'],
    };

    beforeEach(() => {
      controller.registerHandler('TRACK_VOLUME_CHANGE', () => volumeChangePatch);
    });

    it('should start with empty undo/redo stacks', () => {
      expect(controller.canUndo()).toBe(false);
      expect(controller.canRedo()).toBe(false);
      expect(controller.getUndoStackSize()).toBe(0);
      expect(controller.getRedoStackSize()).toBe(0);
    });

    it('should push to undo stack after execute', async () => {
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(controller.canUndo()).toBe(true);
      expect(controller.canRedo()).toBe(false);
      expect(controller.getUndoStackSize()).toBe(1);
    });

    it('should not push to undo stack when skipHistory is true', async () => {
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
        metadata: { skipHistory: true },
      });

      expect(controller.canUndo()).toBe(false);
      expect(controller.getUndoStackSize()).toBe(0);
    });

    it('should move patch to redo stack on undo', async () => {
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      await controller.undo();

      expect(controller.canUndo()).toBe(false);
      expect(controller.canRedo()).toBe(true);
      expect(controller.getRedoStackSize()).toBe(1);
    });

    it('should move patch back to undo stack on redo', async () => {
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      await controller.undo();
      await controller.redo();

      expect(controller.canUndo()).toBe(true);
      expect(controller.canRedo()).toBe(false);
      expect(controller.getUndoStackSize()).toBe(1);
    });

    it('should clear redo stack on new command', async () => {
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      await controller.undo();
      expect(controller.canRedo()).toBe(true);

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.7 },
      });

      expect(controller.canRedo()).toBe(false);
      expect(controller.getRedoStackSize()).toBe(0);
    });

    it('should do nothing when undo called on empty stack', async () => {
      await controller.undo();
      expect(controller.canUndo()).toBe(false);
      expect(controller.canRedo()).toBe(false);
    });

    it('should do nothing when redo called on empty stack', async () => {
      await controller.redo();
      expect(controller.canUndo()).toBe(false);
      expect(controller.canRedo()).toBe(false);
    });

    it('should clear history when clearHistory is called', async () => {
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.6 },
      });
      await controller.undo();

      expect(controller.getUndoStackSize()).toBe(1);
      expect(controller.getRedoStackSize()).toBe(1);

      controller.clearHistory();

      expect(controller.getUndoStackSize()).toBe(0);
      expect(controller.getRedoStackSize()).toBe(0);
    });

    it('should enforce max undo stack size', async () => {
      // Override max size for test
      (controller as any).maxUndoStackSize = 3;

      for (let i = 0; i < 5; i++) {
        await controller.execute({
          type: 'TRACK_VOLUME_CHANGE',
          payload: { trackId: 'track-1', volume: i * 0.1 },
        });
      }

      expect(controller.getUndoStackSize()).toBe(3);
    });
  });

  describe('Side Effects', () => {
    it('should run side effects after execute', async () => {
      const sideEffect: SideEffect = {
        name: 'TestEffect',
        afterPatch: vi.fn(),
      };

      controller.registerSideEffect(sideEffect);
      controller.registerHandler('TRACK_VOLUME_CHANGE', () => ({
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      }));

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(sideEffect.afterPatch).toHaveBeenCalledOnce();
    });

    it('should skip side effects when skipSideEffects is true', async () => {
      const sideEffect: SideEffect = {
        name: 'TestEffect',
        afterPatch: vi.fn(),
      };

      controller.registerSideEffect(sideEffect);
      controller.registerHandler('TRACK_VOLUME_CHANGE', () => ({
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      }));

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
        metadata: { skipSideEffects: true },
      });

      expect(sideEffect.afterPatch).not.toHaveBeenCalled();
    });

    it('should respect shouldRun filter', async () => {
      const sideEffect: SideEffect = {
        name: 'TracksOnlyEffect',
        shouldRun: (patch) => patch.affectedPaths.includes('tracks'),
        afterPatch: vi.fn(),
      };

      controller.registerSideEffect(sideEffect);
      controller.registerHandler('TRACK_VOLUME_CHANGE', () => ({
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      }));
      controller.registerHandler('BPM_CHANGE', () => ({
        operations: [],
        inverse: [],
        affectedPaths: ['bpm'],
      }));

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(sideEffect.afterPatch).toHaveBeenCalledOnce();

      await controller.execute({
        type: 'BPM_CHANGE',
        payload: { oldBpm: 120, newBpm: 140 },
      });

      // Should still only be called once (skipped for BPM_CHANGE)
      expect(sideEffect.afterPatch).toHaveBeenCalledOnce();
    });

    it('should continue with other side effects if one fails', async () => {
      const failingSideEffect: SideEffect = {
        name: 'FailingEffect',
        afterPatch: vi.fn().mockRejectedValue(new Error('Side effect error')),
      };

      const successSideEffect: SideEffect = {
        name: 'SuccessEffect',
        afterPatch: vi.fn(),
      };

      controller.registerSideEffect(failingSideEffect);
      controller.registerSideEffect(successSideEffect);
      controller.registerHandler('TRACK_VOLUME_CHANGE', () => ({
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      }));

      // Should not throw
      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(failingSideEffect.afterPatch).toHaveBeenCalled();
      expect(successSideEffect.afterPatch).toHaveBeenCalled();
    });

    it('should run side effects on undo', async () => {
      const sideEffect: SideEffect = {
        name: 'TestEffect',
        afterPatch: vi.fn(),
      };

      controller.registerSideEffect(sideEffect);
      controller.registerHandler('TRACK_VOLUME_CHANGE', () => ({
        operations: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.5 }],
        inverse: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.8 }],
        affectedPaths: ['tracks'],
      }));

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(sideEffect.afterPatch).toHaveBeenCalledTimes(1);

      await controller.undo();

      expect(sideEffect.afterPatch).toHaveBeenCalledTimes(2);
    });

    it('should run side effects on redo', async () => {
      const sideEffect: SideEffect = {
        name: 'TestEffect',
        afterPatch: vi.fn(),
      };

      controller.registerSideEffect(sideEffect);
      controller.registerHandler('TRACK_VOLUME_CHANGE', () => ({
        operations: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.5 }],
        inverse: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.8 }],
        affectedPaths: ['tracks'],
      }));

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });
      await controller.undo();
      await controller.redo();

      expect(sideEffect.afterPatch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Subscriptions', () => {
    it('should notify listeners when undo stack changes', async () => {
      const listener = vi.fn();
      controller.subscribe(listener);
      controller.registerHandler('TRACK_VOLUME_CHANGE', () => ({
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      }));

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(listener).toHaveBeenCalled();
    });

    it('should notify listeners on undo', async () => {
      const listener = vi.fn();
      controller.registerHandler('TRACK_VOLUME_CHANGE', () => ({
        operations: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.5 }],
        inverse: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.8 }],
        affectedPaths: ['tracks'],
      }));

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      controller.subscribe(listener);
      await controller.undo();

      expect(listener).toHaveBeenCalled();
    });

    it('should notify listeners on redo', async () => {
      const listener = vi.fn();
      controller.registerHandler('TRACK_VOLUME_CHANGE', () => ({
        operations: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.5 }],
        inverse: [{ op: 'replace', path: ['tracks', 0, 'volume'], value: 0.8 }],
        affectedPaths: ['tracks'],
      }));

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });
      await controller.undo();

      controller.subscribe(listener);
      await controller.redo();

      expect(listener).toHaveBeenCalled();
    });

    it('should allow unsubscribing', async () => {
      const listener = vi.fn();
      const unsubscribe = controller.subscribe(listener);
      controller.registerHandler('TRACK_VOLUME_CHANGE', () => ({
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      }));

      unsubscribe();

      await controller.execute({
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should notify listeners on clearHistory', () => {
      const listener = vi.fn();
      controller.subscribe(listener);

      controller.clearHistory();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from getProjectController', () => {
      resetController();
      const instance1 = getProjectController();
      const instance2 = getProjectController();
      expect(instance1).toBe(instance2);
    });

    it('should return new instance after resetController', () => {
      const instance1 = getProjectController();
      resetController();
      const instance2 = getProjectController();
      expect(instance1).not.toBe(instance2);
    });
  });
});
