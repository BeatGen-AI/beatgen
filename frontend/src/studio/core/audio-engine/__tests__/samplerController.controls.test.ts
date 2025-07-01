import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SamplerController } from '../samplerController';
import MidiSampler from '../midiSamplePlayer/sampler';

// Mock dependencies
vi.mock('../midiSamplePlayer/sampler');
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

describe('SamplerController - Individual Sampler Controls', () => {
  let samplerController: SamplerController;
  let mockSampler: MidiSampler;

  beforeEach(() => {
    vi.clearAllMocks();
    samplerController = new SamplerController();
    
    // Setup mock sampler
    mockSampler = new MidiSampler(vi.fn(), vi.fn());
    vi.mocked(MidiSampler).mockImplementation(() => mockSampler);
    
    // Mock all sampler methods
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

  describe('playNote', () => {
    it('should play a single note on specified sampler', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      const midiNote = 64; // E4
      const duration = 1.0;
      const velocity = 0.9;

      samplerController.playNote(trackId, midiNote, duration, velocity);

      expect(mockSampler.playNote).toHaveBeenCalledWith(midiNote, duration, velocity);
    });

    it('should use default values when not provided', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      const midiNote = 60;

      samplerController.playNote(trackId, midiNote);

      expect(mockSampler.playNote).toHaveBeenCalledWith(midiNote, 0.5, 0.8); // Default duration and velocity
    });

    it('should warn when sampler does not exist', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      samplerController.playNote('non-existent', 60);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'No sampler found for track non-existent, cannot play note'
      );
      expect(mockSampler.playNote).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle various MIDI note ranges', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      // Test low note
      samplerController.playNote(trackId, 21); // A0
      expect(mockSampler.playNote).toHaveBeenCalledWith(21, 0.5, 0.8);

      // Test high note
      samplerController.playNote(trackId, 108); // C8
      expect(mockSampler.playNote).toHaveBeenCalledWith(108, 0.5, 0.8);

      // Test edge cases
      samplerController.playNote(trackId, 0); // Lowest MIDI
      expect(mockSampler.playNote).toHaveBeenCalledWith(0, 0.5, 0.8);

      samplerController.playNote(trackId, 127); // Highest MIDI
      expect(mockSampler.playNote).toHaveBeenCalledWith(127, 0.5, 0.8);
    });
  });

  describe('setBaseMidiNote', () => {
    it('should update base MIDI note for sampler', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      const newBaseNote = 69; // A4

      samplerController.setBaseMidiNote(trackId, newBaseNote);

      expect(mockSampler.setBaseNote).toHaveBeenCalledWith(newBaseNote);
    });

    it('should warn when sampler does not exist', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      samplerController.setBaseMidiNote('non-existent', 60);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'No sampler found for track non-existent, cannot set base MIDI note'
      );
      expect(mockSampler.setBaseNote).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle errors from sampler', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      const error = new Error('Invalid base note');
      mockSampler.setBaseNote = vi.fn().mockImplementation(() => {
        throw error;
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      samplerController.setBaseMidiNote(trackId, 69);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `SamplerController: Error setting base MIDI note for track ${trackId}:`,
        error
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('setGrainSize', () => {
    it('should update grain size for sampler', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      const grainSize = 0.2;

      samplerController.setGrainSize(trackId, grainSize);

      expect(mockSampler.setGrainSize).toHaveBeenCalledWith(grainSize);
    });

    it('should warn when sampler does not exist', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      samplerController.setGrainSize('non-existent', 0.1);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'No sampler found for track non-existent, cannot set grain size'
      );
      expect(mockSampler.setGrainSize).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('setOverlap', () => {
    it('should update overlap for sampler', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      const overlap = 0.25;

      samplerController.setOverlap(trackId, overlap);

      expect(mockSampler.setOverlap).toHaveBeenCalledWith(overlap);
    });

    it('should warn when sampler does not exist', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      samplerController.setOverlap('non-existent', 0.1);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'No sampler found for track non-existent, cannot set overlap'
      );
      expect(mockSampler.setOverlap).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('setTrackOffset', () => {
    it('should set track offset in milliseconds', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      const offsetMs = 500;

      samplerController.setTrackOffset(trackId, offsetMs);

      expect(mockSampler.setOffset).toHaveBeenCalledWith(offsetMs);
    });

    it('should warn when sampler does not exist', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      samplerController.setTrackOffset('non-existent', 1000);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Cannot set offset: no sampler found for track non-existent'
      );
      expect(mockSampler.setOffset).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('setTrackVolume', () => {
    it('should set track volume', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      const volume = 75;

      await samplerController.setTrackVolume(trackId, volume);

      expect(mockSampler.setVolume).toHaveBeenCalledWith(volume);
    });

    it('should warn when sampler does not exist', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await samplerController.setTrackVolume('non-existent', 50);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Cannot set volume: no sampler found for track non-existent'
      );
      expect(mockSampler.setVolume).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle volume range 0-100', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      await samplerController.setTrackVolume(trackId, 0);
      expect(mockSampler.setVolume).toHaveBeenCalledWith(0);

      await samplerController.setTrackVolume(trackId, 100);
      expect(mockSampler.setVolume).toHaveBeenCalledWith(100);

      await samplerController.setTrackVolume(trackId, 50);
      expect(mockSampler.setVolume).toHaveBeenCalledWith(50);
    });
  });

  describe('setTrackMute', () => {
    it('should mute track', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      await samplerController.setTrackMute(trackId, true);

      expect(mockSampler.setMute).toHaveBeenCalledWith(true);
    });

    it('should unmute track', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      await samplerController.setTrackMute(trackId, false);

      expect(mockSampler.setMute).toHaveBeenCalledWith(false);
    });

    it('should handle missing sampler gracefully', async () => {
      await expect(samplerController.setTrackMute('non-existent', true)).resolves.not.toThrow();
    });
  });

  describe('muteTrack (deprecated method)', () => {
    it('should mute track using deprecated method', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      samplerController.muteTrack(trackId, true);

      expect(mockSampler.setMute).toHaveBeenCalledWith(true);
    });

    it('should warn when sampler does not exist', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      samplerController.muteTrack('non-existent', true);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Cannot set mute: no sampler found for track non-existent'
      );
      expect(mockSampler.setMute).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('parameter validation', () => {
    it('should handle extreme grain sizes', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      // Very small grain size
      samplerController.setGrainSize(trackId, 0.001);
      expect(mockSampler.setGrainSize).toHaveBeenCalledWith(0.001);

      // Large grain size
      samplerController.setGrainSize(trackId, 5.0);
      expect(mockSampler.setGrainSize).toHaveBeenCalledWith(5.0);
    });

    it('should handle overlap edge cases', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      // No overlap
      samplerController.setOverlap(trackId, 0);
      expect(mockSampler.setOverlap).toHaveBeenCalledWith(0);

      // Full overlap
      samplerController.setOverlap(trackId, 1);
      expect(mockSampler.setOverlap).toHaveBeenCalledWith(1);
    });

    it('should handle negative offset', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler(trackId, file);

      samplerController.setTrackOffset(trackId, -1000);
      expect(mockSampler.setOffset).toHaveBeenCalledWith(-1000);
    });
  });

  describe('multiple sampler control', () => {
    it('should control multiple samplers independently', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      
      // Create multiple mock samplers
      const samplers = new Map<string, MidiSampler>();
      vi.mocked(MidiSampler).mockImplementation(() => {
        const newSampler = {
          initialize: vi.fn().mockResolvedValue(undefined),
          loadAudioFile: vi.fn().mockResolvedValue(undefined),
          setBaseNote: vi.fn(),
          setVolume: vi.fn(),
          setMute: vi.fn(),
          setGrainSize: vi.fn(),
          setOverlap: vi.fn(),
          dispose: vi.fn(),
        } as any;
        return newSampler;
      });

      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);
      await samplerController.initializeSampler('track-3', file);

      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');
      const sampler3 = samplerController.getSampler('track-3');

      // Set different parameters for each
      samplerController.setBaseMidiNote('track-1', 48);
      samplerController.setBaseMidiNote('track-2', 60);
      samplerController.setBaseMidiNote('track-3', 72);

      expect(sampler1?.setBaseNote).toHaveBeenCalledWith(48);
      expect(sampler2?.setBaseNote).toHaveBeenCalledWith(60);
      expect(sampler3?.setBaseNote).toHaveBeenCalledWith(72);

      // Set different volumes
      await samplerController.setTrackVolume('track-1', 25);
      await samplerController.setTrackVolume('track-2', 50);
      await samplerController.setTrackVolume('track-3', 75);

      expect(sampler1?.setVolume).toHaveBeenCalledWith(25);
      expect(sampler2?.setVolume).toHaveBeenCalledWith(50);
      expect(sampler3?.setVolume).toHaveBeenCalledWith(75);
    });
  });
});