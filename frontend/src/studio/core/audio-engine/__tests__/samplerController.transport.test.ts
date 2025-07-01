import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SamplerController } from '../samplerController';
import MidiSampler from '../midiSamplePlayer/sampler';
import * as Tone from 'tone';

// Mock dependencies
vi.mock('../midiSamplePlayer/sampler');
vi.mock('tone', () => ({
  Transport: {
    schedule: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    start: vi.fn(),
    seconds: 0,
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

describe('SamplerController - Transport Integration Tests', () => {
  let samplerController: SamplerController;
  let mockSamplers: Map<string, MidiSampler>;

  beforeEach(() => {
    vi.clearAllMocks();
    samplerController = new SamplerController();
    mockSamplers = new Map();

    // Setup multiple mock samplers
    const createMockSampler = (trackId: string) => {
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
        getNotes: vi.fn().mockReturnValue([]),
        buffer: { duration: 10 }
      };
      mockSamplers.set(trackId, mockSampler as any);
      return mockSampler;
    };

    // Mock MidiSampler constructor to return different instances
    vi.mocked(MidiSampler).mockImplementation((onLog, onStatusChange) => {
      const trackId = `track-${mockSamplers.size + 1}`;
      return createMockSampler(trackId) as any;
    });
  });

  afterEach(() => {
    samplerController.dispose();
  });

  describe('play', () => {
    it('should start playback for all active samplers', async () => {
      // Initialize multiple samplers
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);
      await samplerController.initializeSampler('track-3', file);

      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');
      const sampler3 = samplerController.getSampler('track-3');

      const startTime = 5;
      const bpm = 140;

      await samplerController.play(startTime, bpm);

      expect(sampler1?.playMidi).toHaveBeenCalledWith(bpm, startTime);
      expect(sampler2?.playMidi).toHaveBeenCalledWith(bpm, startTime);
      expect(sampler3?.playMidi).toHaveBeenCalledWith(bpm, startTime);
    });

    it('should use default values when not provided', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      const sampler = samplerController.getSampler('track-1');

      await samplerController.play();

      expect(sampler?.playMidi).toHaveBeenCalledWith(120, 0); // Default BPM and startTime
    });

    it('should handle errors in individual samplers gracefully', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);

      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');

      // Make first sampler throw an error
      sampler1!.playMidi = vi.fn().mockImplementation(() => {
        throw new Error('Playback failed');
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await samplerController.play(0, 120);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SamplerController: Error starting playback for track track-1:',
        expect.any(Error)
      );
      // Second sampler should still be called
      expect(sampler2?.playMidi).toHaveBeenCalledWith(120, 0);

      consoleErrorSpy.mockRestore();
    });

    it('should handle empty sampler list', async () => {
      await expect(samplerController.play()).resolves.not.toThrow();
    });

    it('should start playback from specific position', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      const sampler = samplerController.getSampler('track-1');
      const startTime = 10.5;
      const bpm = 160;

      await samplerController.play(startTime, bpm);

      expect(sampler?.playMidi).toHaveBeenCalledWith(bpm, startTime);
    });
  });

  describe('pause', () => {
    it('should stop playback for all active samplers', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);

      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');

      await samplerController.pause();

      expect(sampler1?.stopPlayback).toHaveBeenCalled();
      expect(sampler2?.stopPlayback).toHaveBeenCalled();
    });

    it('should handle samplers that are not playing', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      await expect(samplerController.pause()).resolves.not.toThrow();
    });

    it('should handle empty sampler list', async () => {
      await expect(samplerController.pause()).resolves.not.toThrow();
    });
  });

  describe('stop', () => {
    it('should stop playback for all active samplers', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);
      await samplerController.initializeSampler('track-3', file);

      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');
      const sampler3 = samplerController.getSampler('track-3');

      await samplerController.stop();

      expect(sampler1?.stopPlayback).toHaveBeenCalled();
      expect(sampler2?.stopPlayback).toHaveBeenCalled();
      expect(sampler3?.stopPlayback).toHaveBeenCalled();
    });

    it('should handle errors in individual samplers gracefully', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);

      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');

      // Make first sampler throw an error
      sampler1!.stopPlayback = vi.fn().mockImplementation(() => {
        throw new Error('Stop failed');
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await samplerController.stop();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'SamplerController: Error stopping playback for track track-1:',
        expect.any(Error)
      );
      // Second sampler should still be called
      expect(sampler2?.stopPlayback).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle empty sampler list', async () => {
      await expect(samplerController.stop()).resolves.not.toThrow();
    });
  });

  describe('seek', () => {
    it('should stop and restart playback from new position', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);

      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');

      const position = 15;
      const bpm = 130;

      await samplerController.seek(position, bpm);

      // Should stop all samplers first
      expect(sampler1?.stopPlayback).toHaveBeenCalled();
      expect(sampler2?.stopPlayback).toHaveBeenCalled();

      // Then restart from new position
      expect(sampler1?.playMidi).toHaveBeenCalledWith(bpm, position);
      expect(sampler2?.playMidi).toHaveBeenCalledWith(bpm, position);
    });

    it('should use default BPM when not provided', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      const sampler = samplerController.getSampler('track-1');
      const position = 5;

      await samplerController.seek(position);

      expect(sampler?.stopPlayback).toHaveBeenCalled();
      expect(sampler?.playMidi).toHaveBeenCalledWith(120, position); // Default BPM
    });

    it('should handle seek to position 0', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      const sampler = samplerController.getSampler('track-1');

      await samplerController.seek(0, 140);

      expect(sampler?.stopPlayback).toHaveBeenCalled();
      expect(sampler?.playMidi).toHaveBeenCalledWith(140, 0);
    });

    it('should handle empty sampler list', async () => {
      await expect(samplerController.seek(10)).resolves.not.toThrow();
    });

    it('should ensure stop is called before play in correct order', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      const sampler = samplerController.getSampler('track-1');
      const callOrder: string[] = [];

      sampler!.stopPlayback = vi.fn().mockImplementation(() => {
        callOrder.push('stop');
      });
      sampler!.playMidi = vi.fn().mockImplementation(() => {
        callOrder.push('play');
      });

      await samplerController.seek(5, 120);

      expect(callOrder).toEqual(['stop', 'play']);
    });
  });

  describe('transport state management', () => {
    it('should maintain consistent state across play/pause/stop cycles', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      const sampler = samplerController.getSampler('track-1');

      // Play
      await samplerController.play(0, 120);
      expect(sampler?.playMidi).toHaveBeenCalledTimes(1);

      // Pause
      await samplerController.pause();
      expect(sampler?.stopPlayback).toHaveBeenCalledTimes(1);

      // Play again
      await samplerController.play(0, 120);
      expect(sampler?.playMidi).toHaveBeenCalledTimes(2);

      // Stop
      await samplerController.stop();
      expect(sampler?.stopPlayback).toHaveBeenCalledTimes(2);
    });

    it('should handle rapid transport commands', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      await samplerController.initializeSampler('track-1', file);

      const sampler = samplerController.getSampler('track-1');

      // Rapid fire commands
      const promises = [
        samplerController.play(0, 120),
        samplerController.pause(),
        samplerController.play(5, 120),
        samplerController.stop(),
        samplerController.seek(10, 120),
      ];

      await Promise.all(promises);

      // All commands should have been executed
      expect(sampler?.playMidi).toHaveBeenCalled();
      expect(sampler?.stopPlayback).toHaveBeenCalled();
    });

    it('should handle samplers added during playback', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      
      // Start with one sampler
      await samplerController.initializeSampler('track-1', file);
      await samplerController.play(0, 120);

      // Add another sampler during playback
      await samplerController.initializeSampler('track-2', file);
      
      // Stop should affect both samplers
      await samplerController.stop();

      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');

      expect(sampler1?.stopPlayback).toHaveBeenCalled();
      expect(sampler2?.stopPlayback).toHaveBeenCalled();
    });

    it('should handle samplers removed during playback', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      
      // Start with two samplers
      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);
      
      const sampler2 = samplerController.getSampler('track-2');
      
      await samplerController.play(0, 120);

      // Remove one sampler during playback
      samplerController.removeSampler('track-1');
      
      // Stop should only affect remaining sampler
      await samplerController.stop();

      expect(sampler2?.stopPlayback).toHaveBeenCalled();
      expect(samplerController.getActiveSamplerIds()).toEqual(['track-2']);
    });
  });
});