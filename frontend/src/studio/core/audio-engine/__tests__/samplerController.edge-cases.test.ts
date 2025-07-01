import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SamplerController } from '../samplerController';
import MidiSampler from '../midiSamplePlayer/sampler';
import { MidiManager } from '../../midi/MidiManagerNew';
import { Note } from '../../../../types/note';

// Mock dependencies
vi.mock('../midiSamplePlayer/sampler');
vi.mock('../../midi/MidiManagerNew');
vi.mock('tone', () => ({
  Transport: {
    schedule: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    start: vi.fn(),
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

describe('SamplerController - Edge Cases and Error Handling', () => {
  let samplerController: SamplerController;
  let mockMidiManager: MidiManager;
  let mockSampler: MidiSampler;

  beforeEach(() => {
    vi.clearAllMocks();
    samplerController = new SamplerController();
    mockMidiManager = new MidiManager();
    
    // Setup mock sampler
    mockSampler = new MidiSampler(vi.fn(), vi.fn());
    vi.mocked(MidiSampler).mockImplementation(() => mockSampler);
    
    // Mock sampler methods
    mockSampler.initialize = vi.fn().mockResolvedValue(undefined);
    mockSampler.loadAudioFile = vi.fn().mockResolvedValue(undefined);
    mockSampler.setBaseNote = vi.fn();
    mockSampler.setNotes = vi.fn();
    mockSampler.dispose = vi.fn();
    mockSampler.playMidi = vi.fn();
    mockSampler.stopPlayback = vi.fn();
    mockSampler.setVolume = vi.fn();
    mockSampler.setMute = vi.fn();
    mockSampler.setOffset = vi.fn();
    mockSampler.setGrainSize = vi.fn();
    mockSampler.setOverlap = vi.fn();
    mockSampler.playNote = vi.fn();

    // Mock MidiManager methods
    mockMidiManager.hasTrack = vi.fn().mockReturnValue(true);
    mockMidiManager.subscribeToTrack = vi.fn().mockReturnValue(() => {});
    mockMidiManager.createTrack = vi.fn();
  });

  afterEach(() => {
    samplerController.dispose();
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent initialization of different tracks', async () => {
      const files = [
        new File(['audio data 1'], 'test1.wav', { type: 'audio/wav' }),
        new File(['audio data 2'], 'test2.wav', { type: 'audio/wav' }),
        new File(['audio data 3'], 'test3.wav', { type: 'audio/wav' }),
      ];

      // Initialize multiple tracks concurrently
      const promises = files.map((file, index) => 
        samplerController.initializeSampler(`track-${index + 1}`, file)
      );

      await Promise.all(promises);

      expect(samplerController.getActiveSamplerIds().length).toBe(3);
      expect(MidiSampler).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent operations on same track', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      // Simulate concurrent operations
      const promises = [
        samplerController.initializeSampler(trackId, file),
        samplerController.setBaseMidiNote(trackId, 64),
        samplerController.setGrainSize(trackId, 0.2),
        samplerController.setOverlap(trackId, 0.15),
      ];

      await Promise.allSettled(promises);

      // The track should exist
      expect(samplerController.hasSampler(trackId)).toBe(true);
    });

    it('should handle play/stop race conditions', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      // Rapid fire play/stop commands
      const promises = [];
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          promises.push(samplerController.play(i, 120));
        } else {
          promises.push(samplerController.stop());
        }
      }

      await Promise.all(promises);

      // Should not crash and sampler should still exist
      expect(samplerController.hasSampler('track-1')).toBe(true);
    });
  });

  describe('Invalid input handling', () => {
    it('should handle invalid file types', async () => {
      const trackId = 'track-1';
      const invalidFile = new File(['not audio'], 'test.txt', { type: 'text/plain' });

      // Should not throw, but loading might fail
      await expect(samplerController.initializeSampler(trackId, invalidFile)).resolves.not.toThrow();
    });

    it('should handle extremely large files gracefully', async () => {
      const trackId = 'track-1';
      // Create a mock large file (simulated)
      const largeFile = new File(['x'.repeat(100 * 1024 * 1024)], 'large.wav', { type: 'audio/wav' });

      await expect(samplerController.initializeSampler(trackId, largeFile)).resolves.not.toThrow();
    });

    it('should handle null/undefined in methods expecting values', () => {
      const trackId = 'track-1';
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // These should not crash
      samplerController.playNote(null as any, 60);
      samplerController.setBaseMidiNote(undefined as any, 60);
      samplerController.setGrainSize(trackId, null as any);
      samplerController.setOverlap(trackId, undefined as any);

      consoleWarnSpy.mockRestore();
    });

    it('should handle extreme parameter values', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      // Extreme values that should not crash
      samplerController.playNote(trackId, -1, -1, -1);
      samplerController.playNote(trackId, 128, 1000, 2);
      samplerController.setBaseMidiNote(trackId, -100);
      samplerController.setBaseMidiNote(trackId, 200);
      samplerController.setGrainSize(trackId, -1);
      samplerController.setGrainSize(trackId, 1000);
      samplerController.setOverlap(trackId, -0.5);
      samplerController.setOverlap(trackId, 2);
      await samplerController.setTrackVolume(trackId, -50);
      await samplerController.setTrackVolume(trackId, 200);

      // All methods should have been called despite extreme values
      expect(mockSampler.playNote).toHaveBeenCalled();
      expect(mockSampler.setBaseNote).toHaveBeenCalled();
      expect(mockSampler.setGrainSize).toHaveBeenCalled();
      expect(mockSampler.setOverlap).toHaveBeenCalled();
      expect(mockSampler.setVolume).toHaveBeenCalled();
    });
  });

  describe('Subscription edge cases', () => {
    it('should handle subscription callback errors', () => {
      const trackId = 'track-1';
      const notes: Note[] = [
        { id: 1, row: 60, column: 0, length: 4 },
      ];
      
      samplerController['samplers'].set(trackId, mockSampler);
      
      // Make setNotes throw an error
      mockSampler.setNotes = vi.fn().mockImplementation(() => {
        throw new Error('setNotes failed');
      });

      let capturedCallback: any;
      mockMidiManager.subscribeToTrack = vi.fn().mockImplementation((id, callback) => {
        capturedCallback = callback;
        return () => {};
      });

      samplerController.registerTrackSubscription(trackId, mockMidiManager);
      
      // Should not throw
      expect(() => capturedCallback(trackId, notes)).not.toThrow();
    });

    it('should handle empty notes array in subscription', () => {
      const trackId = 'track-1';
      const emptyNotes: Note[] = [];
      
      samplerController['samplers'].set(trackId, mockSampler);
      
      let capturedCallback: any;
      mockMidiManager.subscribeToTrack = vi.fn().mockImplementation((id, callback) => {
        capturedCallback = callback;
        return () => {};
      });

      samplerController.registerTrackSubscription(trackId, mockMidiManager);
      capturedCallback(trackId, emptyNotes);

      expect(mockSampler.setNotes).toHaveBeenCalledWith(emptyNotes);
    });

    it('should handle very large notes arrays', () => {
      const trackId = 'track-1';
      const largeNotesArray: Note[] = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        row: 60 + (i % 24),
        column: i * 4,
        length: 4,
        velocity: 0.8,
      }));
      
      samplerController['samplers'].set(trackId, mockSampler);
      
      let capturedCallback: any;
      mockMidiManager.subscribeToTrack = vi.fn().mockImplementation((id, callback) => {
        capturedCallback = callback;
        return () => {};
      });

      samplerController.registerTrackSubscription(trackId, mockMidiManager);
      capturedCallback(trackId, largeNotesArray);

      expect(mockSampler.setNotes).toHaveBeenCalledWith(largeNotesArray);
    });
  });

  describe('Transport edge cases', () => {
    it('should handle negative start times', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      await samplerController.play(-5, 120);
      expect(mockSampler.playMidi).toHaveBeenCalledWith(120, -5);
    });

    it('should handle very high BPM values', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      await samplerController.play(0, 999);
      expect(mockSampler.playMidi).toHaveBeenCalledWith(999, 0);
    });

    it('should handle seek to negative position', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      await samplerController.seek(-10, 120);
      expect(mockSampler.stopPlayback).toHaveBeenCalled();
      expect(mockSampler.playMidi).toHaveBeenCalledWith(120, -10);
    });
  });

  describe('Resource cleanup edge cases', () => {
    it('should handle disposal during async operations', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      // Start initialization
      const initPromise = samplerController.initializeSampler(trackId, file);

      // Dispose immediately
      samplerController.dispose();

      // Wait for initialization to complete
      await initPromise;

      // The sampler should have been created but then disposed
      expect(MidiSampler).toHaveBeenCalled();
    });

    it('should handle repeated disposal', () => {
      const trackId = 'track-1';

      // Multiple disposals should not throw
      expect(() => {
        samplerController.dispose(trackId);
        samplerController.dispose(trackId);
        samplerController.dispose();
        samplerController.dispose();
      }).not.toThrow();
    });
  });

  describe('State consistency', () => {
    it('should maintain consistent state after errors', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      // Make initialization fail
      mockSampler.initialize = vi.fn().mockRejectedValue(new Error('Init failed'));

      try {
        await samplerController.initializeSampler(trackId, file);
      } catch (e) {
        // Expected to fail
      }

      // State should be clean
      expect(samplerController.hasSampler(trackId)).toBe(false);
      expect(samplerController.getActiveSamplerIds()).toEqual([]);
    });

    it('should recover from partial initialization failure', async () => {
      const files = [
        new File(['audio data 1'], 'test1.wav', { type: 'audio/wav' }),
        new File(['audio data 2'], 'test2.wav', { type: 'audio/wav' }),
        new File(['audio data 3'], 'test3.wav', { type: 'audio/wav' }),
      ];

      // Make second initialization fail
      let callCount = 0;
      mockSampler.initialize = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Init failed'));
        }
        return Promise.resolve();
      });

      const results = await Promise.allSettled([
        samplerController.initializeSampler('track-1', files[0]),
        samplerController.initializeSampler('track-2', files[1]),
        samplerController.initializeSampler('track-3', files[2]),
      ]);

      // First and third should succeed
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');

      // Only successful tracks should exist
      expect(samplerController.getActiveSamplerIds().sort()).toEqual(['track-1', 'track-3']);
    });
  });

  describe('Method not implemented', () => {
    it('should throw for unimplemented methods', async () => {
      await expect(samplerController.setTrackPan('track-1', 0)).rejects.toThrow('Method not implemented');
      await expect(samplerController.setTrackPositionTicks('track-1', 0)).rejects.toThrow('Method not implemented');
      await expect(samplerController.setTrackTrimStartTicks('track-1', 0)).rejects.toThrow('Method not implemented');
      await expect(samplerController.setTrackTrimEndTicks('track-1', 0)).rejects.toThrow('Method not implemented');
    });
  });
});