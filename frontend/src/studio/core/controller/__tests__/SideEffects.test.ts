import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioEngineSideEffect } from '../side-effects/AudioEngineSideEffect';
import { AutoSaveSideEffect } from '../side-effects/AutoSaveSideEffect';
import { CommandContext, Patch, Command } from '../types';

// Mock buildPlaybackState
vi.mock('../../playback/buildPlaybackState', () => ({
  buildPlaybackState: vi.fn().mockReturnValue({
    bpm: 120,
    tracks: [],
  }),
}));

describe('AudioEngineSideEffect', () => {
  let sideEffect: AudioEngineSideEffect;
  let mockAudioEngine: any;
  let mockContext: CommandContext;

  beforeEach(() => {
    sideEffect = new AudioEngineSideEffect();

    mockAudioEngine = {
      isReady: vi.fn().mockReturnValue(true),
      setState: vi.fn(),
    };

    mockContext = {
      getState: () => ({
        isPlaying: true,
        tracks: [],
        bpm: 120,
        timeSignature: [4, 4],
      }) as any,
      audioEngine: mockAudioEngine,
      midiManager: null,
    };
  });

  describe('shouldRun', () => {
    it('should return true for track-related patches', () => {
      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      expect(sideEffect.shouldRun(patch, {} as Command)).toBe(true);
    });

    it('should return true for bpm changes', () => {
      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['bpm'],
      };

      expect(sideEffect.shouldRun(patch, {} as Command)).toBe(true);
    });

    it('should return true for timeSignature changes', () => {
      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['timeSignature'],
      };

      expect(sideEffect.shouldRun(patch, {} as Command)).toBe(true);
    });

    it('should return false for unrelated paths', () => {
      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['ui', 'selection'],
      };

      expect(sideEffect.shouldRun(patch, {} as Command)).toBe(false);
    });

    it('should handle multiple paths', () => {
      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['ui', 'tracks', 'selection'],
      };

      expect(sideEffect.shouldRun(patch, {} as Command)).toBe(true);
    });
  });

  describe('afterPatch', () => {
    it('should sync audio engine when playing', () => {
      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      sideEffect.afterPatch(patch, {} as Command, mockContext);

      expect(mockAudioEngine.setState).toHaveBeenCalled();
    });

    it('should not sync when not playing', () => {
      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      mockContext.getState = () => ({
        isPlaying: false,
        tracks: [],
        bpm: 120,
        timeSignature: [4, 4],
      }) as any;

      sideEffect.afterPatch(patch, {} as Command, mockContext);

      expect(mockAudioEngine.setState).not.toHaveBeenCalled();
    });

    it('should not sync when engine not ready', () => {
      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      mockAudioEngine.isReady.mockReturnValue(false);

      sideEffect.afterPatch(patch, {} as Command, mockContext);

      expect(mockAudioEngine.setState).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', () => {
      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      mockAudioEngine.setState.mockImplementation(() => {
        throw new Error('Engine error');
      });

      // Should not throw
      expect(() => {
        sideEffect.afterPatch(patch, {} as Command, mockContext);
      }).not.toThrow();
    });
  });
});

describe('AutoSaveSideEffect', () => {
  let sideEffect: AutoSaveSideEffect;
  let mockAutoSaveService: any;
  let mockContext: CommandContext;

  beforeEach(() => {
    sideEffect = new AutoSaveSideEffect();

    mockAutoSaveService = {
      onTracksChanged: vi.fn(),
    };

    mockContext = {
      getState: () => ({}) as any,
      audioEngine: {} as any,
      midiManager: null,
    };
  });

  describe('shouldRun', () => {
    it('should return true when dirty is set to true', () => {
      const patch: Patch = {
        operations: [
          { op: 'replace', path: ['tracks', 0, 'dirty'], value: true },
        ],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      expect(sideEffect.shouldRun(patch, {} as Command)).toBe(true);
    });

    it('should return false when dirty is set to false', () => {
      const patch: Patch = {
        operations: [
          { op: 'replace', path: ['tracks', 0, 'dirty'], value: false },
        ],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      expect(sideEffect.shouldRun(patch, {} as Command)).toBe(false);
    });

    it('should return false when no dirty operations', () => {
      const patch: Patch = {
        operations: [
          { op: 'replace', path: ['tracks', 0, 'volume'], value: 0.5 },
        ],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      expect(sideEffect.shouldRun(patch, {} as Command)).toBe(false);
    });

    it('should return true if any operation sets dirty to true', () => {
      const patch: Patch = {
        operations: [
          { op: 'replace', path: ['tracks', 0, 'volume'], value: 0.5 },
          { op: 'replace', path: ['tracks', 0, 'dirty'], value: true },
          { op: 'replace', path: ['tracks', 0, 'pan'], value: 0.3 },
        ],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      expect(sideEffect.shouldRun(patch, {} as Command)).toBe(true);
    });

    it('should handle nested dirty paths', () => {
      const patch: Patch = {
        operations: [
          { op: 'replace', path: ['tracks', 0, 'instances', 0, 'dirty'], value: true },
        ],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      expect(sideEffect.shouldRun(patch, {} as Command)).toBe(true);
    });
  });

  describe('afterPatch', () => {
    it('should notify auto-save service when configured', () => {
      sideEffect.setAutoSaveService(mockAutoSaveService);

      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      sideEffect.afterPatch(patch, {} as Command, mockContext);

      expect(mockAutoSaveService.onTracksChanged).toHaveBeenCalledOnce();
    });

    it('should not throw when auto-save service not configured', () => {
      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      // Should not throw even without service configured
      expect(() => {
        sideEffect.afterPatch(patch, {} as Command, mockContext);
      }).not.toThrow();
    });
  });

  describe('setAutoSaveService', () => {
    it('should allow setting the auto-save service', () => {
      sideEffect.setAutoSaveService(mockAutoSaveService);

      const patch: Patch = {
        operations: [],
        inverse: [],
        affectedPaths: ['tracks'],
      };

      sideEffect.afterPatch(patch, {} as Command, mockContext);

      expect(mockAutoSaveService.onTracksChanged).toHaveBeenCalled();
    });
  });
});
