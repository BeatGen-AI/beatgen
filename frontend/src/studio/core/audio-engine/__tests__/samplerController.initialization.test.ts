import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SamplerController } from '../samplerController';
import MidiSampler from '../midiSamplePlayer/sampler';
import { MidiManager } from '../../midi/MidiManagerNew';
import * as Tone from 'tone';

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

describe('SamplerController - Initialization Tests', () => {
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
  });

  afterEach(() => {
    samplerController.dispose();
  });

  describe('initializeSampler', () => {
    it('should initialize a sampler with a file', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const baseMidiNote = 60;
      const grainSize = 0.1;
      const overlap = 0.1;

      await samplerController.initializeSampler(trackId, file, baseMidiNote, grainSize, overlap);

      expect(MidiSampler).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
      expect(mockSampler.initialize).toHaveBeenCalled();
      expect(mockSampler.setBaseNote).toHaveBeenCalledWith(baseMidiNote);
      expect(mockSampler.loadAudioFile).toHaveBeenCalledWith(file, grainSize, overlap);
      expect(samplerController.hasSampler(trackId)).toBe(true);
    });

    it('should initialize an empty sampler when file is undefined', async () => {
      const trackId = 'track-1';
      const baseMidiNote = 60;

      await samplerController.initializeSampler(trackId, undefined, baseMidiNote);

      expect(MidiSampler).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
      expect(mockSampler.initialize).toHaveBeenCalled();
      expect(mockSampler.setBaseNote).toHaveBeenCalledWith(baseMidiNote);
      expect(mockSampler.loadAudioFile).not.toHaveBeenCalled();
      expect(samplerController.hasSampler(trackId)).toBe(true);
    });

    it('should use default values when not provided', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      await samplerController.initializeSampler(trackId, file);

      expect(mockSampler.setBaseNote).toHaveBeenCalledWith(60); // DEFAULT_BASE_NOTE
      expect(mockSampler.loadAudioFile).toHaveBeenCalledWith(file, 0.1, 0.1); // DEFAULT_GRAIN_SIZE, DEFAULT_OVERLAP
    });

    it('should clean up existing sampler before creating new one', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      // First initialization
      await samplerController.initializeSampler(trackId, file);
      const firstSampler = samplerController.getSampler(trackId);

      // Second initialization
      await samplerController.initializeSampler(trackId, file);

      expect(firstSampler?.dispose).toHaveBeenCalled();
      expect(MidiSampler).toHaveBeenCalledTimes(2);
    });

    it('should re-throw errors when initialization fails', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const error = new Error('Failed to initialize');

      mockSampler.initialize = vi.fn().mockRejectedValue(error);

      await expect(samplerController.initializeSampler(trackId, file)).rejects.toThrow('Failed to initialize');
    });

    it('should handle audio file loading errors', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const error = new Error('Failed to load audio');

      mockSampler.loadAudioFile = vi.fn().mockRejectedValue(error);

      await expect(samplerController.initializeSampler(trackId, file)).rejects.toThrow('Failed to load audio');
    });
  });

  describe('connectTrackToSampler', () => {
    it('should connect track to sampler with existing track in MidiManager', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const baseMidiNote = 64;
      const grainSize = 0.2;
      const overlap = 0.15;

      mockMidiManager.hasTrack = vi.fn().mockReturnValue(true);
      mockMidiManager.subscribeToTrack = vi.fn().mockReturnValue(() => {});

      await samplerController.connectTrackToSampler(trackId, file, mockMidiManager, baseMidiNote, grainSize, overlap);

      expect(mockSampler.initialize).toHaveBeenCalled();
      expect(mockSampler.loadAudioFile).toHaveBeenCalledWith(file, grainSize, overlap);
      expect(mockSampler.setBaseNote).toHaveBeenCalledWith(baseMidiNote);
      expect(mockMidiManager.hasTrack).toHaveBeenCalledWith(trackId);
      expect(mockMidiManager.subscribeToTrack).toHaveBeenCalledWith(trackId, expect.any(Function));
    });

    it('should create track in MidiManager if it does not exist', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      mockMidiManager.hasTrack = vi.fn().mockReturnValue(false);
      mockMidiManager.createTrack = vi.fn();
      mockMidiManager.subscribeToTrack = vi.fn().mockReturnValue(() => {});

      await samplerController.connectTrackToSampler(trackId, file, mockMidiManager);

      expect(mockMidiManager.createTrack).toHaveBeenCalledWith(trackId, 'sampler');
      expect(mockMidiManager.subscribeToTrack).toHaveBeenCalledWith(trackId, expect.any(Function));
    });

    it('should use default values when not provided', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      mockMidiManager.hasTrack = vi.fn().mockReturnValue(true);
      mockMidiManager.subscribeToTrack = vi.fn().mockReturnValue(() => {});

      await samplerController.connectTrackToSampler(trackId, file, mockMidiManager);

      expect(mockSampler.setBaseNote).toHaveBeenCalledWith(60); // DEFAULT_BASE_NOTE
      expect(mockSampler.loadAudioFile).toHaveBeenCalledWith(file, 0.1, 0.1); // DEFAULT_GRAIN_SIZE, DEFAULT_OVERLAP
    });

    it('should handle errors and re-throw them', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const error = new Error('Connection failed');

      mockSampler.initialize = vi.fn().mockRejectedValue(error);
      mockMidiManager.hasTrack = vi.fn().mockReturnValue(true);

      await expect(samplerController.connectTrackToSampler(trackId, file, mockMidiManager)).rejects.toThrow('Connection failed');
    });
  });

  describe('registerTrackSubscription', () => {
    it('should subscribe to track updates from MidiManager', () => {
      const trackId = 'track-1';
      const unsubscribeFn = vi.fn();
      
      // Initialize sampler first
      samplerController['samplers'].set(trackId, mockSampler);
      
      mockMidiManager.subscribeToTrack = vi.fn().mockReturnValue(unsubscribeFn);

      samplerController.registerTrackSubscription(trackId, mockMidiManager);

      expect(mockMidiManager.subscribeToTrack).toHaveBeenCalledWith(trackId, expect.any(Function));
    });

    it('should unsubscribe from previous subscription if exists', () => {
      const trackId = 'track-1';
      const firstUnsubscribe = vi.fn();
      const secondUnsubscribe = vi.fn();
      
      // Initialize sampler
      samplerController['samplers'].set(trackId, mockSampler);
      
      mockMidiManager.subscribeToTrack = vi.fn()
        .mockReturnValueOnce(firstUnsubscribe)
        .mockReturnValueOnce(secondUnsubscribe);

      // First subscription
      samplerController.registerTrackSubscription(trackId, mockMidiManager);
      
      // Second subscription
      samplerController.registerTrackSubscription(trackId, mockMidiManager);

      expect(firstUnsubscribe).toHaveBeenCalled();
      expect(mockMidiManager.subscribeToTrack).toHaveBeenCalledTimes(2);
    });

    it('should warn when no sampler exists for track', () => {
      const trackId = 'non-existent-track';
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      samplerController.registerTrackSubscription(trackId, mockMidiManager);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `No sampler found for track ${trackId}, cannot subscribe to MIDI updates`
      );
      expect(mockMidiManager.subscribeToTrack).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should update sampler notes when subscription callback is triggered', () => {
      const trackId = 'track-1';
      const notes = [
        { id: 1, row: 60, column: 0, length: 4, velocity: 0.8 },
        { id: 2, row: 64, column: 4, length: 4, velocity: 0.7 }
      ];
      
      samplerController['samplers'].set(trackId, mockSampler);
      
      let capturedCallback: any;
      mockMidiManager.subscribeToTrack = vi.fn().mockImplementation((id, callback) => {
        capturedCallback = callback;
        return () => {};
      });

      samplerController.registerTrackSubscription(trackId, mockMidiManager);
      
      // Trigger the subscription callback
      capturedCallback(trackId, notes);

      expect(mockSampler.setNotes).toHaveBeenCalledWith(notes);
    });

    it('should handle missing sampler in subscription callback', () => {
      const trackId = 'track-1';
      const notes = [{ id: 1, row: 60, column: 0, length: 4 }];
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      samplerController['samplers'].set(trackId, mockSampler);
      
      let capturedCallback: any;
      mockMidiManager.subscribeToTrack = vi.fn().mockImplementation((id, callback) => {
        capturedCallback = callback;
        return () => {};
      });

      samplerController.registerTrackSubscription(trackId, mockMidiManager);
      
      // Remove sampler before triggering callback
      samplerController['samplers'].delete(trackId);
      
      // Trigger the subscription callback
      capturedCallback(trackId, notes);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Cannot update notes: no sampler found for track ${trackId}`
      );
      expect(mockSampler.setNotes).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('sampler management', () => {
    it('should get sampler by track ID', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      await samplerController.initializeSampler(trackId, file);

      const sampler = samplerController.getSampler(trackId);
      expect(sampler).toBe(mockSampler);
    });

    it('should return undefined for non-existent sampler', () => {
      const sampler = samplerController.getSampler('non-existent');
      expect(sampler).toBeUndefined();
    });

    it('should check if track has sampler', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      expect(samplerController.hasSampler(trackId)).toBe(false);

      await samplerController.initializeSampler(trackId, file);

      expect(samplerController.hasSampler(trackId)).toBe(true);
    });

    it('should get all active sampler IDs', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);
      await samplerController.initializeSampler('track-3', file);

      const ids = samplerController.getActiveSamplerIds();
      expect(ids).toEqual(['track-1', 'track-2', 'track-3']);
    });

    it('should remove sampler and clean up resources', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const unsubscribeFn = vi.fn();

      await samplerController.initializeSampler(trackId, file);
      
      // Add subscription
      samplerController['trackSubscriptions'].set(trackId, unsubscribeFn);

      samplerController.removeSampler(trackId);

      expect(unsubscribeFn).toHaveBeenCalled();
      expect(mockSampler.dispose).toHaveBeenCalled();
      expect(samplerController.hasSampler(trackId)).toBe(false);
      expect(samplerController['trackSubscriptions'].has(trackId)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple rapid initializations of same track', async () => {
      const trackId = 'track-1';
      const file1 = new File(['audio data 1'], 'test1.wav', { type: 'audio/wav' });
      const file2 = new File(['audio data 2'], 'test2.wav', { type: 'audio/wav' });

      const promise1 = samplerController.initializeSampler(trackId, file1);
      const promise2 = samplerController.initializeSampler(trackId, file2);

      await Promise.all([promise1, promise2]);

      // Should have disposed the first sampler
      expect(mockSampler.dispose).toHaveBeenCalled();
      // Should have created 2 samplers total
      expect(MidiSampler).toHaveBeenCalledTimes(2);
    });

    it('should handle removal of non-existent sampler gracefully', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      samplerController.removeSampler('non-existent');

      expect(consoleLogSpy).toHaveBeenCalledWith('Removed sampler for track non-existent');
      consoleLogSpy.mockRestore();
    });

    it('should handle subscription cleanup even if unsubscribe function is missing', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      await samplerController.initializeSampler(trackId, file);
      
      // Add null subscription
      samplerController['trackSubscriptions'].set(trackId, null as any);

      // Should not throw
      expect(() => samplerController.removeSampler(trackId)).not.toThrow();
      expect(mockSampler.dispose).toHaveBeenCalled();
    });
  });
});