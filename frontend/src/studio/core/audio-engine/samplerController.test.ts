import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SamplerController } from './samplerController';
import MidiSampler from './midiSamplePlayer/sampler';
import { 
  createMockAudioFile,
  mockTone
} from '../../../test/mocks/audioMocks';
import { 
  generateTestNotes,
  createMockMidiManager,
  spyOnConsole,
  waitForCondition
} from '../../../test/utils/testHelpers';

// Mock is already setup in test/setup.ts

describe('SamplerController', () => {
  let controller: SamplerController;
  let mockMidiManager: ReturnType<typeof createMockMidiManager>;
  let consoleSpy: ReturnType<typeof spyOnConsole>;
  let mockSamplerInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMidiManager = createMockMidiManager();
    consoleSpy = spyOnConsole();
    
    // Create a mock instance that will be returned by the constructor
    mockSamplerInstance = {
      initialize: vi.fn().mockResolvedValue(undefined),
      loadAudioFile: vi.fn().mockResolvedValue(undefined),
      setNotes: vi.fn(),
      playNote: vi.fn(),
      playMidi: vi.fn(),
      stopPlayback: vi.fn(),
      setVolume: vi.fn(),
      setMute: vi.fn(),
      setOffset: vi.fn(),
      setGrainSize: vi.fn(),
      setOverlap: vi.fn(),
      setBaseNote: vi.fn(),
      dispose: vi.fn(),
      getNotes: vi.fn().mockReturnValue([]),
      buffer: { duration: 10 }
    };
    
    // Make the MidiSampler constructor return our mock instance
    vi.mocked(MidiSampler).mockImplementation(() => mockSamplerInstance);
    
    controller = new SamplerController();
  });

  afterEach(() => {
    controller.dispose();
    consoleSpy.restore();
    mockMidiManager._reset();
  });

  describe('Constructor', () => {
    it('should initialize with empty samplers map', () => {
      expect(controller.getActiveSamplerIds()).toEqual([]);
      expect(consoleSpy.hasLog('SamplerController initialized')).toBe(true);
    });
  });

  describe('initializeSampler', () => {
    it('should initialize sampler with file', async () => {
      const file = createMockAudioFile('test.wav');
      
      await controller.initializeSampler('track1', file, 60, 0.1, 0.1);
      
      expect(MidiSampler).toHaveBeenCalled();
      expect(mockSamplerInstance.initialize).toHaveBeenCalled();
      expect(mockSamplerInstance.setBaseNote).toHaveBeenCalledWith(60);
      expect(mockSamplerInstance.loadAudioFile).toHaveBeenCalledWith(file, 0.1, 0.1);
      expect(controller.hasSampler('track1')).toBe(true);
    });

    it('should initialize empty sampler without file', async () => {
      await controller.initializeSampler('track1', undefined, 60);
      
      expect(mockSamplerInstance.initialize).toHaveBeenCalled();
      expect(mockSamplerInstance.setBaseNote).toHaveBeenCalledWith(60);
      expect(mockSamplerInstance.loadAudioFile).not.toHaveBeenCalled();
      expect(consoleSpy.hasLog('Skipping file load for empty sampler track1')).toBe(true);
    });

    it('should use default values', async () => {
      await controller.initializeSampler('track1', undefined);
      
      expect(mockSamplerInstance.setBaseNote).toHaveBeenCalledWith(60); // Default C4
    });

    it('should clean up existing sampler before creating new one', async () => {
      const file1 = createMockAudioFile('test1.wav');
      const file2 = createMockAudioFile('test2.wav');
      
      await controller.initializeSampler('track1', file1);
      const firstSampler = controller.getSampler('track1');
      
      await controller.initializeSampler('track1', file2);
      
      expect(firstSampler?.dispose).toHaveBeenCalled();
      expect(consoleSpy.hasLog('Cleaning up existing sampler for track track1')).toBe(true);
    });

    it('should handle initialization errors', async () => {
      const file = createMockAudioFile('test.wav');
      mockSamplerInstance.initialize.mockRejectedValueOnce(new Error('Init failed'));
      
      await expect(controller.initializeSampler('track1', file))
        .rejects.toThrow('Init failed');
      expect(consoleSpy.hasError('Failed to initialize sampler for track track1')).toBe(true);
    });
  });

  describe('registerTrackSubscription', () => {
    beforeEach(async () => {
      await controller.initializeSampler('track1', undefined);
    });

    it('should register subscription successfully', () => {
      const unsubscribeFn = vi.fn();
      mockMidiManager.subscribeToTrack.mockReturnValue(unsubscribeFn);
      
      controller.registerTrackSubscription('track1', mockMidiManager);
      
      expect(mockMidiManager.subscribeToTrack).toHaveBeenCalledWith(
        'track1',
        expect.any(Function)
      );
      expect(consoleSpy.hasLog('Successfully subscribed to MIDI updates for sampler track track1')).toBe(true);
    });

    it('should unsubscribe previous subscription', () => {
      const unsubscribe1 = vi.fn();
      const unsubscribe2 = vi.fn();
      
      mockMidiManager.subscribeToTrack
        .mockReturnValueOnce(unsubscribe1)
        .mockReturnValueOnce(unsubscribe2);
      
      controller.registerTrackSubscription('track1', mockMidiManager);
      controller.registerTrackSubscription('track1', mockMidiManager);
      
      expect(unsubscribe1).toHaveBeenCalled();
    });

    it('should update sampler notes on callback', () => {
      controller.registerTrackSubscription('track1', mockMidiManager);
      
      const callback = mockMidiManager.subscribeToTrack.mock.calls[0][1];
      const notes = generateTestNotes(10);
      
      callback('track1', notes);
      
      expect(mockSamplerInstance.setNotes).toHaveBeenCalledWith(notes);
      expect(consoleSpy.hasLog('Updated notes for sampler track1 with 10 notes')).toBe(true);
    });

    it('should warn if sampler not found', () => {
      controller.registerTrackSubscription('non-existent', mockMidiManager);
      
      expect(consoleSpy.hasWarning('No sampler found for track non-existent')).toBe(true);
    });

    it('should handle callback errors gracefully', () => {
      controller.registerTrackSubscription('track1', mockMidiManager);
      
      const callback = mockMidiManager.subscribeToTrack.mock.calls[0][1];
      callback('non-existent', generateTestNotes(5));
      
      expect(consoleSpy.hasWarning('Cannot update notes: no sampler found for track non-existent')).toBe(true);
    });
  });

  describe('Sampler Control Methods', () => {
    beforeEach(async () => {
      await controller.initializeSampler('track1', undefined);
    });

    describe('playNote', () => {
      it('should play single note', () => {
        controller.playNote('track1', 60, 0.5, 0.8);
        
        expect(mockSamplerInstance.playNote).toHaveBeenCalledWith(60, 0.5, 0.8);
      });

      it('should use default duration and velocity', () => {
        controller.playNote('track1', 60);
        
        expect(mockSamplerInstance.playNote).toHaveBeenCalledWith(60, 0.5, 0.8);
      });

      it('should warn if sampler not found', () => {
        controller.playNote('non-existent', 60);
        
        expect(consoleSpy.hasWarning('No sampler found for track non-existent')).toBe(true);
      });
    });

    describe('setBaseMidiNote', () => {
      it('should set base MIDI note', () => {
        controller.setBaseMidiNote('track1', 72);
        
        expect(mockSamplerInstance.setBaseNote).toHaveBeenCalledWith(72);
        expect(consoleSpy.hasLog('Set base MIDI note for track track1 to 72')).toBe(true);
      });

      it('should handle errors', () => {
        mockSamplerInstance.setBaseNote.mockImplementation(() => {
          throw new Error('Invalid note');
        });
        
        controller.setBaseMidiNote('track1', 999);
        
        expect(consoleSpy.hasError('Error setting base MIDI note for track track1')).toBe(true);
      });
    });

    describe('setGrainSize', () => {
      it('should set grain size', () => {
        controller.setGrainSize('track1', 0.2);
        
        expect(mockSamplerInstance.setGrainSize).toHaveBeenCalledWith(0.2);
      });

      it('should warn if sampler not found', () => {
        controller.setGrainSize('non-existent', 0.2);
        
        expect(consoleSpy.hasWarning('No sampler found for track non-existent')).toBe(true);
      });
    });

    describe('setOverlap', () => {
      it('should set overlap', () => {
        controller.setOverlap('track1', 0.15);
        
        expect(mockSamplerInstance.setOverlap).toHaveBeenCalledWith(0.15);
      });
    });

    describe('setTrackOffset', () => {
      it('should set track offset', () => {
        controller.setTrackOffset('track1', 1000);
        
        expect(mockSamplerInstance.setOffset).toHaveBeenCalledWith(1000);
        expect(consoleSpy.hasLog('Setting track track1 offset to 1000ms')).toBe(true);
      });
    });

    describe('setTrackVolume', () => {
      it('should set track volume', async () => {
        await controller.setTrackVolume('track1', 80);
        
        expect(mockSamplerInstance.setVolume).toHaveBeenCalledWith(80);
        expect(consoleSpy.hasLog('Setting track track1 volume to 80')).toBe(true);
      });
    });

    describe('muteTrack', () => {
      it('should mute track', () => {
        controller.muteTrack('track1', true);
        
        expect(mockSamplerInstance.setMute).toHaveBeenCalledWith(true);
        expect(consoleSpy.hasLog('Muting track track1')).toBe(true);
      });

      it('should unmute track', () => {
        controller.muteTrack('track1', false);
        
        expect(mockSamplerInstance.setMute).toHaveBeenCalledWith(false);
        expect(consoleSpy.hasLog('Unmuting track track1')).toBe(true);
      });
    });
  });

  describe('TrackPlayer Interface Methods', () => {
    beforeEach(async () => {
      await controller.initializeSampler('track1', undefined);
    });

    it('should implement setTrackMute', async () => {
      await controller.setTrackMute('track1', true);
      
      expect(mockSamplerInstance.setMute).toHaveBeenCalledWith(true);
      expect(consoleSpy.hasLog('Setting mute for track track1 to true')).toBe(true);
    });

    it('should throw for unimplemented methods', () => {
      expect(() => controller.setTrackPan('track1', 50))
        .toThrow('Method not implemented');
      
      expect(() => controller.setTrackPositionTicks('track1', 1000))
        .toThrow('Method not implemented');
      
      expect(() => controller.setTrackTrimStartTicks('track1', 500))
        .toThrow('Method not implemented');
      
      expect(() => controller.setTrackTrimEndTicks('track1', 1000))
        .toThrow('Method not implemented');
    });
  });

  describe('Transport Integration', () => {
    beforeEach(async () => {
      await controller.initializeSampler('track1', undefined);
      await controller.initializeSampler('track2', undefined);
    });

    describe('play', () => {
      it('should start playback for all samplers', async () => {
        await controller.play(0, 120);
        
        expect(mockSamplerInstance.playMidi).toHaveBeenCalledWith(120, 0);
        expect(consoleSpy.hasLog('Starting playback for all samplers from 0s')).toBe(true);
      });

      it('should handle errors during playback', async () => {
        mockSamplerInstance.playMidi.mockImplementation(() => {
          throw new Error('Playback failed');
        });
        
        await controller.play(0, 120);
        
        expect(consoleSpy.hasError('Error starting playback for track track1')).toBe(true);
      });

      it('should use default BPM', async () => {
        await controller.play(5);
        
        expect(mockSamplerInstance.playMidi).toHaveBeenCalledWith(120, 5);
      });
    });

    describe('pause', () => {
      it('should stop playback for all samplers', async () => {
        await controller.pause();
        
        expect(mockSamplerInstance.stopPlayback).toHaveBeenCalled();
        expect(consoleSpy.hasLog('Pausing playback for all samplers')).toBe(true);
      });
    });

    describe('stop', () => {
      it('should stop all samplers', async () => {
        await controller.stop();
        
        expect(mockSamplerInstance.stopPlayback).toHaveBeenCalled();
        expect(consoleSpy.hasLog('Stopping playback for all samplers')).toBe(true);
      });

      it('should handle errors during stop', async () => {
        mockSamplerInstance.stopPlayback.mockImplementation(() => {
          throw new Error('Stop failed');
        });
        
        await controller.stop();
        
        expect(consoleSpy.hasError('Error stopping playback for track track1')).toBe(true);
      });
    });

    describe('seek', () => {
      it('should stop and restart from new position', async () => {
        await controller.seek(10, 140);
        
        expect(mockSamplerInstance.stopPlayback).toHaveBeenCalled();
        expect(mockSamplerInstance.playMidi).toHaveBeenCalledWith(140, 10);
        expect(consoleSpy.hasLog('Seeking to 10s')).toBe(true);
      });
    });
  });

  describe('connectTrackToSampler', () => {
    it('should connect track successfully', async () => {
      const file = createMockAudioFile('test.wav');
      mockMidiManager.hasTrack.mockReturnValue(true);
      
      await controller.connectTrackToSampler('track1', file, mockMidiManager, 72, 0.2, 0.15);
      
      expect(controller.hasSampler('track1')).toBe(true);
      expect(mockSamplerInstance.setBaseNote).toHaveBeenCalledWith(72);
      expect(mockSamplerInstance.loadAudioFile).toHaveBeenCalledWith(file, 0.2, 0.15);
      expect(mockMidiManager.subscribeToTrack).toHaveBeenCalled();
      expect(consoleSpy.hasLog('Successfully connected track track1 to sampler')).toBe(true);
    });

    it('should create track if not exists', async () => {
      const file = createMockAudioFile('test.wav');
      mockMidiManager.hasTrack.mockReturnValue(false);
      
      await controller.connectTrackToSampler('track1', file, mockMidiManager);
      
      expect(mockMidiManager.createTrack).toHaveBeenCalledWith('track1', 'sampler');
      expect(consoleSpy.hasLog('Track track1 not found in MidiManager, creating track')).toBe(true);
    });

    it('should handle connection errors', async () => {
      const file = createMockAudioFile('test.wav');
      mockSamplerInstance.initialize.mockRejectedValueOnce(new Error('Connection failed'));
      
      await expect(controller.connectTrackToSampler('track1', file, mockMidiManager))
        .rejects.toThrow('Connection failed');
      expect(consoleSpy.hasError('Failed to connect track track1 to sampler')).toBe(true);
    });
  });

  describe('removeSampler', () => {
    beforeEach(async () => {
      await controller.initializeSampler('track1', undefined);
      const unsubscribeFn = vi.fn();
      mockMidiManager.subscribeToTrack.mockReturnValue(unsubscribeFn);
      controller.registerTrackSubscription('track1', mockMidiManager);
    });

    it('should remove sampler and clean up', () => {
      controller.removeSampler('track1');
      
      expect(mockSamplerInstance.dispose).toHaveBeenCalled();
      expect(controller.hasSampler('track1')).toBe(false);
      expect(consoleSpy.hasLog('Removed sampler for track track1')).toBe(true);
    });

    it('should unsubscribe from MIDI updates', () => {
      const unsubscribeFn = mockMidiManager.subscribeToTrack.mock.results[0]?.value;
      
      controller.removeSampler('track1');
      
      expect(unsubscribeFn).toHaveBeenCalled();
    });

    it('should handle non-existent sampler', () => {
      controller.removeSampler('non-existent');
      
      // Should not throw, just log
      expect(consoleSpy.hasLog('Removed sampler for track non-existent')).toBe(true);
    });
  });

  describe('dispose', () => {
    beforeEach(async () => {
      await controller.initializeSampler('track1', undefined);
      await controller.initializeSampler('track2', undefined);
      await controller.initializeSampler('track3', undefined);
    });

    it('should dispose all samplers', () => {
      controller.dispose();
      
      expect(mockSamplerInstance.dispose).toHaveBeenCalledTimes(3);
      expect(controller.getActiveSamplerIds()).toHaveLength(0);
      expect(consoleSpy.hasLog('All samplers disposed')).toBe(true);
    });

    it('should dispose specific track', () => {
      const track2Sampler = controller.getSampler('track2');
      
      controller.dispose('track2');
      
      expect(track2Sampler?.dispose).toHaveBeenCalled();
      expect(controller.hasSampler('track2')).toBe(false);
      expect(controller.hasSampler('track1')).toBe(true);
      expect(controller.hasSampler('track3')).toBe(true);
    });
  });

  describe('Query Methods', () => {
    beforeEach(async () => {
      await controller.initializeSampler('track1', undefined);
      await controller.initializeSampler('track2', undefined);
    });

    it('should get sampler by ID', () => {
      const sampler = controller.getSampler('track1');
      
      expect(sampler).toBeDefined();
      expect(sampler).toBe(mockSamplerInstance);
    });

    it('should check if sampler exists', () => {
      expect(controller.hasSampler('track1')).toBe(true);
      expect(controller.hasSampler('non-existent')).toBe(false);
    });

    it('should get all active sampler IDs', () => {
      const ids = controller.getActiveSamplerIds();
      
      expect(ids).toEqual(['track1', 'track2']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple rapid initializations', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(controller.initializeSampler(`track${i}`, undefined));
      }
      
      await Promise.all(promises);
      
      expect(controller.getActiveSamplerIds()).toHaveLength(10);
    });

    it('should handle empty note updates', async () => {
      await controller.initializeSampler('track1', undefined);
      controller.registerTrackSubscription('track1', mockMidiManager);
      
      const callback = mockMidiManager.subscribeToTrack.mock.calls[0][1];
      callback('track1', []);
      
      expect(mockSamplerInstance.setNotes).toHaveBeenCalledWith([]);
    });

    it('should handle very large note arrays', async () => {
      await controller.initializeSampler('track1', undefined);
      controller.registerTrackSubscription('track1', mockMidiManager);
      
      const callback = mockMidiManager.subscribeToTrack.mock.calls[0][1];
      const largeNoteArray = generateTestNotes(10000);
      
      callback('track1', largeNoteArray);
      
      expect(mockSamplerInstance.setNotes).toHaveBeenCalledWith(largeNoteArray);
      expect(consoleSpy.hasLog('Updated notes for sampler track1 with 10000 notes')).toBe(true);
    });

    it('should handle extreme parameter values', async () => {
      await controller.initializeSampler('track1', undefined);
      
      controller.setBaseMidiNote('track1', 0);
      controller.setBaseMidiNote('track1', 127);
      
      controller.setGrainSize('track1', 0.001);
      controller.setGrainSize('track1', 10);
      
      controller.setOverlap('track1', 0);
      controller.setOverlap('track1', 1);
      
      await controller.setTrackVolume('track1', 0);
      await controller.setTrackVolume('track1', 100);
      
      // Should handle all without errors
      expect(mockSamplerInstance.setBaseNote).toHaveBeenCalledTimes(3); // 1 from init + 2 from test
      expect(mockSamplerInstance.setGrainSize).toHaveBeenCalledTimes(2);
      expect(mockSamplerInstance.setOverlap).toHaveBeenCalledTimes(2);
      expect(mockSamplerInstance.setVolume).toHaveBeenCalledTimes(2);
    });
  });
});