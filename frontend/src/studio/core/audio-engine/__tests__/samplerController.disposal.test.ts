import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SamplerController } from '../samplerController';
import MidiSampler from '../midiSamplePlayer/sampler';
import { MidiManager } from '../../midi/MidiManagerNew';

// Mock dependencies
vi.mock('../midiSamplePlayer/sampler');
vi.mock('../../midi/MidiManagerNew');
vi.mock('tone', () => ({
  Transport: {
    schedule: vi.fn(),
    cancel: vi.fn(),
  },
  now: vi.fn(() => 0),
  Frequency: vi.fn(() => ({ toNote: () => 'C4' })),
  gainToDb: vi.fn(gain => 20 * Math.log10(gain)),
  dbToGain: vi.fn(db => Math.pow(10, db / 20)),
  GrainPlayer: vi.fn(),
  Gain: vi.fn(() => ({
    toDestination: vi.fn(),
    gain: { value: 1 },
    dispose: vi.fn(),
    disposed: false,
  })),
}));

describe('SamplerController - Resource Management and Disposal', () => {
  let samplerController: SamplerController;
  let mockMidiManager: MidiManager;
  let mockSamplers: Map<string, MidiSampler>;

  beforeEach(() => {
    vi.clearAllMocks();
    samplerController = new SamplerController();
    mockMidiManager = new MidiManager();
    mockSamplers = new Map();

    // Mock MidiManager methods
    mockMidiManager.hasTrack = vi.fn().mockReturnValue(true);
    mockMidiManager.subscribeToTrack = vi.fn().mockReturnValue(() => {});
    mockMidiManager.createTrack = vi.fn();

    // Setup mock sampler factory
    vi.mocked(MidiSampler).mockImplementation(() => {
      const mockSampler = {
        initialize: vi.fn().mockResolvedValue(undefined),
        loadAudioFile: vi.fn().mockResolvedValue(undefined),
        setBaseNote: vi.fn(),
        setNotes: vi.fn(),
        dispose: vi.fn(),
        playMidi: vi.fn(),
        stopPlayback: vi.fn(),
        setVolume: vi.fn(),
        setMute: vi.fn(),
        setOffset: vi.fn(),
        setGrainSize: vi.fn(),
        setOverlap: vi.fn(),
        playNote: vi.fn(),
      } as any;
      return mockSampler;
    });
  });

  afterEach(() => {
    // Don't call dispose here as we're testing it
  });

  describe('dispose - single track', () => {
    it('should dispose specific track resources', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const unsubscribeFn = vi.fn();

      mockMidiManager.subscribeToTrack = vi.fn().mockReturnValue(unsubscribeFn);

      await samplerController.connectTrackToSampler(trackId, file, mockMidiManager);
      const sampler = samplerController.getSampler(trackId);

      samplerController.dispose(trackId);

      expect(sampler?.dispose).toHaveBeenCalled();
      expect(unsubscribeFn).toHaveBeenCalled();
      expect(samplerController.hasSampler(trackId)).toBe(false);
    });

    it('should handle disposal of non-existent track', () => {
      expect(() => samplerController.dispose('non-existent')).not.toThrow();
    });

    it('should clear subscriptions when disposing track', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const unsubscribeFn = vi.fn();

      mockMidiManager.subscribeToTrack = vi.fn().mockReturnValue(unsubscribeFn);

      await samplerController.connectTrackToSampler(trackId, file, mockMidiManager);

      // Verify subscription exists
      expect(samplerController['trackSubscriptions'].has(trackId)).toBe(true);

      samplerController.dispose(trackId);

      expect(samplerController['trackSubscriptions'].has(trackId)).toBe(false);
      expect(unsubscribeFn).toHaveBeenCalled();
    });
  });

  describe('dispose - all tracks', () => {
    it('should dispose all sampler resources', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const unsubscribeFns = [vi.fn(), vi.fn(), vi.fn()];
      let subscribeCallCount = 0;

      mockMidiManager.subscribeToTrack = vi.fn().mockImplementation(() => {
        return unsubscribeFns[subscribeCallCount++];
      });

      // Create multiple samplers
      await samplerController.connectTrackToSampler('track-1', file, mockMidiManager);
      await samplerController.connectTrackToSampler('track-2', file, mockMidiManager);
      await samplerController.connectTrackToSampler('track-3', file, mockMidiManager);

      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');
      const sampler3 = samplerController.getSampler('track-3');

      samplerController.dispose();

      // All samplers should be disposed
      expect(sampler1?.dispose).toHaveBeenCalled();
      expect(sampler2?.dispose).toHaveBeenCalled();
      expect(sampler3?.dispose).toHaveBeenCalled();

      // All subscriptions should be unsubscribed
      unsubscribeFns.forEach(fn => expect(fn).toHaveBeenCalled());

      // All internal maps should be cleared
      expect(samplerController.getActiveSamplerIds()).toEqual([]);
      expect(samplerController['trackSubscriptions'].size).toBe(0);
    });

    it('should handle empty controller disposal', () => {
      expect(() => samplerController.dispose()).not.toThrow();
    });

    it('should dispose in correct order', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const disposalOrder: string[] = [];

      // Create samplers with tracking
      for (let i = 1; i <= 3; i++) {
        await samplerController.initializeSampler(`track-${i}`, file);
        const sampler = samplerController.getSampler(`track-${i}`);
        sampler!.dispose = vi.fn().mockImplementation(() => {
          disposalOrder.push(`track-${i}`);
        });
      }

      samplerController.dispose();

      // Should dispose in the order they were added (Map iteration order)
      expect(disposalOrder).toEqual(['track-1', 'track-2', 'track-3']);
    });
  });

  describe('removeSampler', () => {
    it('should properly clean up all resources for a track', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const unsubscribeFn = vi.fn();

      mockMidiManager.subscribeToTrack = vi.fn().mockReturnValue(unsubscribeFn);

      await samplerController.connectTrackToSampler(trackId, file, mockMidiManager);
      const sampler = samplerController.getSampler(trackId);

      samplerController.removeSampler(trackId);

      expect(sampler?.dispose).toHaveBeenCalled();
      expect(unsubscribeFn).toHaveBeenCalled();
      expect(samplerController.hasSampler(trackId)).toBe(false);
      expect(samplerController['trackSubscriptions'].has(trackId)).toBe(false);
    });

    it('should handle removal during playback', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      await samplerController.initializeSampler(trackId, file);
      const sampler = samplerController.getSampler(trackId);

      // Start playback
      await samplerController.play();

      // Remove during playback
      samplerController.removeSampler(trackId);

      expect(sampler?.dispose).toHaveBeenCalled();
    });

    it('should not affect other samplers when removing one', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);
      await samplerController.initializeSampler('track-3', file);

      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');
      const sampler3 = samplerController.getSampler('track-3');

      samplerController.removeSampler('track-2');

      expect(sampler2?.dispose).toHaveBeenCalled();
      expect(sampler1?.dispose).not.toHaveBeenCalled();
      expect(sampler3?.dispose).not.toHaveBeenCalled();

      expect(samplerController.getActiveSamplerIds()).toEqual(['track-1', 'track-3']);
    });
  });

  describe('memory leak prevention', () => {
    it('should not accumulate samplers on repeated initialization', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const disposeCalls: number[] = [];

      // Track dispose calls
      let samplerCount = 0;
      vi.mocked(MidiSampler).mockImplementation(() => {
        const samplerId = ++samplerCount;
        return {
          initialize: vi.fn().mockResolvedValue(undefined),
          loadAudioFile: vi.fn().mockResolvedValue(undefined),
          setBaseNote: vi.fn(),
          dispose: vi.fn().mockImplementation(() => {
            disposeCalls.push(samplerId);
          }),
        } as any;
      });

      // Initialize same track multiple times
      for (let i = 0; i < 5; i++) {
        await samplerController.initializeSampler(trackId, file);
      }

      // Should have disposed the first 4 samplers
      expect(disposeCalls).toEqual([1, 2, 3, 4]);
      expect(samplerController.getActiveSamplerIds()).toEqual(['track-1']);
    });

    it('should clean up subscriptions on repeated registration', () => {
      const trackId = 'track-1';
      const unsubscribeFns = [vi.fn(), vi.fn(), vi.fn()];
      let callCount = 0;

      mockMidiManager.subscribeToTrack = vi.fn().mockImplementation(() => {
        return unsubscribeFns[callCount++];
      });

      // Initialize sampler first
      samplerController['samplers'].set(trackId, new MidiSampler(vi.fn(), vi.fn()));

      // Register multiple times
      for (let i = 0; i < 3; i++) {
        samplerController.registerTrackSubscription(trackId, mockMidiManager);
      }

      // First two unsubscribe functions should have been called
      expect(unsubscribeFns[0]).toHaveBeenCalled();
      expect(unsubscribeFns[1]).toHaveBeenCalled();
      expect(unsubscribeFns[2]).not.toHaveBeenCalled();

      // Only one subscription should remain
      expect(samplerController['trackSubscriptions'].size).toBe(1);
    });
  });

  describe('error handling during disposal', () => {
    it('should handle errors during sampler disposal', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      await samplerController.initializeSampler(trackId, file);
      const sampler = samplerController.getSampler(trackId);

      // Make dispose throw an error
      sampler!.dispose = vi.fn().mockImplementation(() => {
        throw new Error('Disposal failed');
      });

      // Should not throw
      expect(() => samplerController.dispose(trackId)).not.toThrow();
      expect(samplerController.hasSampler(trackId)).toBe(false);
    });

    it('should handle errors during subscription cleanup', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const unsubscribeFn = vi.fn().mockImplementation(() => {
        throw new Error('Unsubscribe failed');
      });

      mockMidiManager.subscribeToTrack = vi.fn().mockReturnValue(unsubscribeFn);

      await samplerController.connectTrackToSampler(trackId, file, mockMidiManager);

      // Should not throw
      expect(() => samplerController.dispose(trackId)).not.toThrow();
      expect(samplerController.hasSampler(trackId)).toBe(false);
    });
  });

  describe('disposal state verification', () => {
    it('should not allow operations on disposed samplers', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await samplerController.initializeSampler(trackId, file);
      samplerController.dispose(trackId);

      // Try operations on disposed sampler
      samplerController.playNote(trackId, 60);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `No sampler found for track ${trackId}, cannot play note`
      );

      samplerController.setBaseMidiNote(trackId, 64);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `No sampler found for track ${trackId}, cannot set base MIDI note`
      );

      consoleWarnSpy.mockRestore();
    });

    it('should clean up all internal state on full disposal', () => {
      // Add some internal state
      samplerController['samplers'].set('track-1', new MidiSampler(vi.fn(), vi.fn()));
      samplerController['samplers'].set('track-2', new MidiSampler(vi.fn(), vi.fn()));
      samplerController['trackSubscriptions'].set('track-1', vi.fn());
      samplerController['trackSubscriptions'].set('track-2', vi.fn());

      samplerController.dispose();

      expect(samplerController['samplers'].size).toBe(0);
      expect(samplerController['trackSubscriptions'].size).toBe(0);
      expect(samplerController.getActiveSamplerIds()).toEqual([]);
    });
  });
});