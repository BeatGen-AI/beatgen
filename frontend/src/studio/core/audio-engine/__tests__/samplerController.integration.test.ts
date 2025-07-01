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

describe('SamplerController - Integration Tests', () => {
  let samplerController: SamplerController;
  let mockMidiManager: MidiManager;
  let mockSamplers: Map<string, MidiSampler>;

  beforeEach(() => {
    vi.clearAllMocks();
    samplerController = new SamplerController();
    mockMidiManager = new MidiManager();
    mockSamplers = new Map();

    // Setup mock MidiManager
    mockMidiManager.hasTrack = vi.fn().mockReturnValue(true);
    mockMidiManager.createTrack = vi.fn();
    mockMidiManager.subscribeToTrack = vi.fn();

    // Create unique mock samplers for each track
    vi.mocked(MidiSampler).mockImplementation(() => {
      const trackId = `track-${mockSamplers.size + 1}`;
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
      } as any;
      mockSamplers.set(trackId, mockSampler);
      return mockSampler;
    });
  });

  afterEach(() => {
    samplerController.dispose();
  });

  describe('Full workflow integration', () => {
    it('should handle complete track lifecycle', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const notes: Note[] = [
        { id: 1, row: 60, column: 0, length: 4, velocity: 0.8 },
        { id: 2, row: 64, column: 4, length: 4, velocity: 0.7 },
        { id: 3, row: 67, column: 8, length: 8, velocity: 0.9 },
      ];

      // Step 1: Connect track to sampler
      let subscriptionCallback: TrackUpdateCallback;
      mockMidiManager.subscribeToTrack = vi.fn().mockImplementation((id, callback) => {
        subscriptionCallback = callback;
        return vi.fn(); // unsubscribe function
      });

      await samplerController.connectTrackToSampler(trackId, file, mockMidiManager, 60, 0.1, 0.1);

      const sampler = samplerController.getSampler(trackId);
      expect(sampler).toBeDefined();

      // Step 2: Update notes through subscription
      subscriptionCallback!(trackId, notes);
      expect(sampler?.setNotes).toHaveBeenCalledWith(notes);

      // Step 3: Configure sampler parameters
      samplerController.setBaseMidiNote(trackId, 64);
      samplerController.setGrainSize(trackId, 0.2);
      samplerController.setOverlap(trackId, 0.15);
      await samplerController.setTrackVolume(trackId, 80);
      samplerController.setTrackOffset(trackId, 1000);

      expect(sampler?.setBaseNote).toHaveBeenCalledWith(64);
      expect(sampler?.setGrainSize).toHaveBeenCalledWith(0.2);
      expect(sampler?.setOverlap).toHaveBeenCalledWith(0.15);
      expect(sampler?.setVolume).toHaveBeenCalledWith(80);
      expect(sampler?.setOffset).toHaveBeenCalledWith(1000);

      // Step 4: Play preview note
      samplerController.playNote(trackId, 72, 0.5, 0.85);
      expect(sampler?.playNote).toHaveBeenCalledWith(72, 0.5, 0.85);

      // Step 5: Start playback
      await samplerController.play(0, 120);
      expect(sampler?.playMidi).toHaveBeenCalledWith(120, 0);

      // Step 6: Seek during playback
      await samplerController.seek(10, 120);
      expect(sampler?.stopPlayback).toHaveBeenCalled();
      expect(sampler?.playMidi).toHaveBeenCalledWith(120, 10);

      // Step 7: Stop playback
      await samplerController.stop();
      expect(sampler?.stopPlayback).toHaveBeenCalled();

      // Step 8: Dispose
      samplerController.dispose(trackId);
      expect(sampler?.dispose).toHaveBeenCalled();
    });

    it('should handle multiple tracks with different configurations', async () => {
      const tracks = [
        { id: 'track-1', file: new File(['audio1'], 'kick.wav'), baseNote: 36, grainSize: 0.05 },
        { id: 'track-2', file: new File(['audio2'], 'snare.wav'), baseNote: 38, grainSize: 0.1 },
        { id: 'track-3', file: new File(['audio3'], 'hihat.wav'), baseNote: 42, grainSize: 0.02 },
      ];

      // Initialize all tracks
      for (const track of tracks) {
        await samplerController.connectTrackToSampler(
          track.id,
          track.file,
          mockMidiManager,
          track.baseNote,
          track.grainSize
        );
      }

      // Configure each track differently
      await samplerController.setTrackVolume('track-1', 100);
      await samplerController.setTrackVolume('track-2', 75);
      await samplerController.setTrackVolume('track-3', 50);

      samplerController.setTrackOffset('track-1', 0);
      samplerController.setTrackOffset('track-2', 500);
      samplerController.setTrackOffset('track-3', 250);

      // Mute one track
      await samplerController.setTrackMute('track-2', true);

      // Play all tracks
      await samplerController.play(0, 140);

      // Verify all samplers were configured correctly
      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');
      const sampler3 = samplerController.getSampler('track-3');

      expect(sampler1?.setVolume).toHaveBeenCalledWith(100);
      expect(sampler2?.setVolume).toHaveBeenCalledWith(75);
      expect(sampler3?.setVolume).toHaveBeenCalledWith(50);

      expect(sampler1?.setOffset).toHaveBeenCalledWith(0);
      expect(sampler2?.setOffset).toHaveBeenCalledWith(500);
      expect(sampler3?.setOffset).toHaveBeenCalledWith(250);

      expect(sampler2?.setMute).toHaveBeenCalledWith(true);

      expect(sampler1?.playMidi).toHaveBeenCalledWith(140, 0);
      expect(sampler2?.playMidi).toHaveBeenCalledWith(140, 0);
      expect(sampler3?.playMidi).toHaveBeenCalledWith(140, 0);
    });
  });

  describe('Dynamic track management during playback', () => {
    it('should handle tracks added and removed during playback', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      // Start with two tracks
      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);

      // Start playback
      await samplerController.play(0, 120);

      const sampler1 = samplerController.getSampler('track-1');
      const sampler2 = samplerController.getSampler('track-2');
      expect(sampler1?.playMidi).toHaveBeenCalled();
      expect(sampler2?.playMidi).toHaveBeenCalled();

      // Add a new track during playback
      await samplerController.initializeSampler('track-3', file);
      const sampler3 = samplerController.getSampler('track-3');

      // Remove a track during playback
      samplerController.removeSampler('track-1');

      // Pause and resume
      await samplerController.pause();
      await samplerController.play(5, 120);

      // Only remaining tracks should play
      expect(sampler2?.playMidi).toHaveBeenCalledTimes(2);
      expect(sampler3?.playMidi).toHaveBeenCalledTimes(1);
      expect(sampler1?.dispose).toHaveBeenCalled();
    });

    it('should handle parameter changes during playback', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      await samplerController.initializeSampler(trackId, file);
      const sampler = samplerController.getSampler(trackId);

      // Start playback
      await samplerController.play(0, 120);

      // Change parameters during playback
      await samplerController.setTrackVolume(trackId, 50);
      samplerController.setGrainSize(trackId, 0.3);
      samplerController.setOverlap(trackId, 0.2);
      await samplerController.setTrackMute(trackId, true);
      await samplerController.setTrackMute(trackId, false);

      // All changes should be applied
      expect(sampler?.setVolume).toHaveBeenCalledWith(50);
      expect(sampler?.setGrainSize).toHaveBeenCalledWith(0.3);
      expect(sampler?.setOverlap).toHaveBeenCalledWith(0.2);
      expect(sampler?.setMute).toHaveBeenCalledWith(true);
      expect(sampler?.setMute).toHaveBeenCalledWith(false);
    });
  });

  describe('Note updates integration', () => {
    it('should handle real-time note updates through MidiManager', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      let subscriptionCallback: TrackUpdateCallback;
      mockMidiManager.subscribeToTrack = vi.fn().mockImplementation((id, callback) => {
        subscriptionCallback = callback;
        return vi.fn();
      });

      await samplerController.connectTrackToSampler(trackId, file, mockMidiManager);
      const sampler = samplerController.getSampler(trackId);

      // Simulate multiple note updates
      const noteUpdates = [
        [{ id: 1, row: 60, column: 0, length: 4 }],
        [{ id: 1, row: 60, column: 0, length: 4 }, { id: 2, row: 64, column: 4, length: 4 }],
        [{ id: 1, row: 60, column: 0, length: 8 }, { id: 2, row: 64, column: 8, length: 4 }],
        [], // Empty notes
      ];

      for (const notes of noteUpdates) {
        subscriptionCallback!(trackId, notes);
        expect(sampler?.setNotes).toHaveBeenLastCalledWith(notes);
      }

      expect(sampler?.setNotes).toHaveBeenCalledTimes(4);
    });

    it('should maintain note state across play/stop cycles', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const notes: Note[] = [
        { id: 1, row: 60, column: 0, length: 4 },
        { id: 2, row: 64, column: 4, length: 4 },
      ];

      let subscriptionCallback: TrackUpdateCallback;
      mockMidiManager.subscribeToTrack = vi.fn().mockImplementation((id, callback) => {
        subscriptionCallback = callback;
        return vi.fn();
      });

      await samplerController.connectTrackToSampler(trackId, file, mockMidiManager);
      const sampler = samplerController.getSampler(trackId);

      // Set notes
      subscriptionCallback!(trackId, notes);

      // Multiple play/stop cycles
      for (let i = 0; i < 3; i++) {
        await samplerController.play(i * 5, 120);
        await samplerController.stop();
      }

      // Notes should only be set once
      expect(sampler?.setNotes).toHaveBeenCalledTimes(1);
      expect(sampler?.setNotes).toHaveBeenCalledWith(notes);
    });
  });

  describe('Error recovery integration', () => {
    it('should recover from individual track failures', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      // Create samplers with different failure modes
      let samplerCount = 0;
      vi.mocked(MidiSampler).mockImplementation(() => {
        samplerCount++;
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

        // Make track-2 fail during playback
        if (samplerCount === 2) {
          mockSampler.playMidi = vi.fn().mockImplementation(() => {
            throw new Error('Playback failed');
          });
        }

        return mockSampler;
      });

      await samplerController.initializeSampler('track-1', file);
      await samplerController.initializeSampler('track-2', file);
      await samplerController.initializeSampler('track-3', file);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Play should continue despite track-2 failure
      await samplerController.play(0, 120);

      const sampler1 = samplerController.getSampler('track-1');
      const sampler3 = samplerController.getSampler('track-3');

      expect(sampler1?.playMidi).toHaveBeenCalled();
      expect(sampler3?.playMidi).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error starting playback for track track-2'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle subscription failures gracefully', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      // Make subscription throw error
      mockMidiManager.subscribeToTrack = vi.fn().mockImplementation(() => {
        throw new Error('Subscription failed');
      });

      // Should still initialize sampler
      await expect(samplerController.connectTrackToSampler(trackId, file, mockMidiManager)).rejects.toThrow();
      
      // Sampler should have been initialized but then cleaned up due to error
      expect(samplerController.hasSampler(trackId)).toBe(false);
    });
  });

  describe('Performance scenarios', () => {
    it('should handle rapid parameter updates efficiently', async () => {
      const trackId = 'track-1';
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });

      await samplerController.initializeSampler(trackId, file);
      const sampler = samplerController.getSampler(trackId);

      // Rapid parameter updates
      const updatePromises = [];
      for (let i = 0; i < 100; i++) {
        updatePromises.push(samplerController.setTrackVolume(trackId, i));
        if (i % 10 === 0) {
          samplerController.setGrainSize(trackId, 0.1 + (i / 1000));
        }
      }

      await Promise.all(updatePromises);

      // Should have handled all updates
      expect(sampler?.setVolume).toHaveBeenCalledTimes(100);
      expect(sampler?.setGrainSize).toHaveBeenCalledTimes(10);
    });

    it('should handle many tracks efficiently', async () => {
      const file = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const trackCount = 50;

      // Initialize many tracks
      const initPromises = [];
      for (let i = 0; i < trackCount; i++) {
        initPromises.push(samplerController.initializeSampler(`track-${i}`, file));
      }

      await Promise.all(initPromises);

      expect(samplerController.getActiveSamplerIds().length).toBe(trackCount);

      // Play all tracks
      await samplerController.play(0, 120);

      // Stop all tracks
      await samplerController.stop();

      // Dispose all
      samplerController.dispose();

      expect(samplerController.getActiveSamplerIds().length).toBe(0);
    });
  });
});

type TrackUpdateCallback = (trackId: string, notes: Note[]) => void;