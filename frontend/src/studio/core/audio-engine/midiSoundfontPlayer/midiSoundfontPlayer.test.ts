import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MidiSoundfontPlayer } from './midiSoundfontPlayer';
import { AudioWorkletNodeSynthesizer } from 'js-synthesizer';
import { SequencerWrapper } from './sequencerWrapper';
import { 
  createMockAudioContext, 
  createMockSoundfontData,
  createMockNote,
  MockTimer 
} from '../../../../test/mocks/audioMocks';
import { 
  generateTestNotes, 
  waitForCondition,
  spyOnConsole 
} from '../../../../test/utils/testHelpers';

// Mock modules are already setup in test/setup.ts

describe('MidiSoundfontPlayer', () => {
  let player: MidiSoundfontPlayer;
  let mockAudioContext: any;
  let consoleSpy: ReturnType<typeof spyOnConsole>;
  let timer: MockTimer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudioContext = createMockAudioContext();
    consoleSpy = spyOnConsole();
    timer = new MockTimer();
    player = new MidiSoundfontPlayer(120); // Default 120 BPM
  });

  afterEach(() => {
    if (player) {
      player.dispose();
    }
    consoleSpy.restore();
    timer.reset();
  });

  describe('Constructor', () => {
    it('should initialize with default BPM', () => {
      expect(player.getGlobalBPM()).toBe(120);
    });

    it('should initialize with custom BPM', () => {
      const customPlayer = new MidiSoundfontPlayer(140);
      expect(customPlayer.getGlobalBPM()).toBe(140);
      customPlayer.dispose();
    });

    it('should start with no tracks and not playing', () => {
      expect(player.getTrackIds()).toEqual([]);
      expect(player.isPlayerPlaying()).toBe(false);
      expect(player.getCurrentTick()).toBe(0);
    });
  });

  describe('initSynthesizer', () => {
    it('should initialize synthesizer successfully', async () => {
      await player.initSynthesizer(mockAudioContext);
      
      expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalledTimes(2);
      expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalledWith('/js-synthesizer/libfluidsynth-2.3.0.js');
      expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalledWith('/js-synthesizer/js-synthesizer.worklet.js');
      expect(consoleSpy.hasLog('MidiSoundfontPlayer initialized successfully')).toBe(true);
    });

    it('should return same promise for multiple initialization calls', async () => {
      const promise1 = player.initSynthesizer(mockAudioContext);
      const promise2 = player.initSynthesizer(mockAudioContext);
      
      expect(promise1).toBe(promise2);
      await promise1;
      
      // Should only be called once
      expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalledTimes(2);
    });

    it('should handle initialization failure', async () => {
      mockAudioContext.audioWorklet.addModule.mockRejectedValueOnce(new Error('Worklet load failed'));
      
      await expect(player.initSynthesizer(mockAudioContext)).rejects.toThrow('Worklet load failed');
      expect(consoleSpy.hasError('Failed to initialize MidiSoundfontPlayer')).toBe(true);
    });

    it('should allow retry after initialization failure', async () => {
      mockAudioContext.audioWorklet.addModule.mockRejectedValueOnce(new Error('First attempt failed'));
      
      await expect(player.initSynthesizer(mockAudioContext)).rejects.toThrow('First attempt failed');
      
      // Second attempt should work
      await expect(player.initSynthesizer(mockAudioContext)).resolves.toBeUndefined();
    });
  });

  describe('waitForInitialization', () => {
    it('should wait for successful initialization', async () => {
      const initPromise = player.initSynthesizer(mockAudioContext);
      await player.waitForInitialization();
      await initPromise;
    });

    it('should throw error if initialization not started', async () => {
      await expect(player.waitForInitialization()).rejects.toThrow('Synthesizer initialization not started');
    });

    it('should propagate initialization errors', async () => {
      mockAudioContext.audioWorklet.addModule.mockRejectedValueOnce(new Error('Init failed'));
      player.initSynthesizer(mockAudioContext).catch(() => {}); // Ignore unhandled rejection
      
      await expect(player.waitForInitialization()).rejects.toThrow('Init failed');
    });
  });

  describe('addTrack', () => {
    beforeEach(async () => {
      await player.initSynthesizer(mockAudioContext);
    });

    it('should add a track successfully', async () => {
      const notes = generateTestNotes(5);
      const soundfontData = createMockSoundfontData();
      
      await player.addTrack('track1', notes, soundfontData);
      
      expect(player.getTrackIds()).toContain('track1');
      expect(consoleSpy.hasLog('Track "track1" added on channel 0')).toBe(true);
    });

    it('should handle multiple tracks with auto channel assignment', async () => {
      const soundfontData = createMockSoundfontData();
      
      for (let i = 0; i < 5; i++) {
        await player.addTrack(`track${i}`, [], soundfontData);
      }
      
      expect(player.getTrackIds()).toHaveLength(5);
      // Verify channels are assigned correctly (avoiding channel 9)
      expect(consoleSpy.hasLog('channel 9')).toBe(false);
    });

    it('should skip drum channel (9) in auto assignment', async () => {
      const soundfontData = createMockSoundfontData();
      
      // Add tracks to fill channels 0-8
      for (let i = 0; i < 9; i++) {
        await player.addTrack(`track${i}`, [], soundfontData);
      }
      
      // Next track should get channel 10, not 9
      await player.addTrack('track9', [], soundfontData);
      expect(consoleSpy.hasLog('Track "track9" added on channel 10')).toBe(true);
    });

    it('should handle channel exhaustion', async () => {
      const soundfontData = createMockSoundfontData();
      
      // Fill all 15 non-drum channels
      for (let i = 0; i < 15; i++) {
        await player.addTrack(`track${i}`, [], soundfontData);
      }
      
      // 16th track should reuse channel 1
      await player.addTrack('track15', [], soundfontData);
      expect(consoleSpy.hasWarning('All non-drum MIDI channels are in use')).toBe(true);
    });

    it('should accept custom channel assignment', async () => {
      const notes = generateTestNotes(3);
      const soundfontData = createMockSoundfontData();
      
      await player.addTrack('drums', notes, soundfontData, { channel: 9 });
      
      expect(consoleSpy.hasLog('Track "drums" added on channel 9')).toBe(true);
    });

    it('should apply volume option', async () => {
      const mockWrapper = vi.mocked(SequencerWrapper).mock.results[0]?.value;
      const soundfontData = createMockSoundfontData();
      
      await player.addTrack('track1', [], soundfontData, { volume: 127 });
      
      // Verify volume was passed to SequencerWrapper constructor
      expect(SequencerWrapper).toHaveBeenCalledWith(
        expect.anything(), // synth
        0, // sfontId
        0, // channel
        0, // offset
        127 // volume
      );
    });

    it('should apply start time offset', async () => {
      const soundfontData = createMockSoundfontData();
      
      await player.addTrack('track1', [], soundfontData, { startTimeOffset: -1000 });
      
      expect(SequencerWrapper).toHaveBeenCalledWith(
        expect.anything(),
        0,
        0,
        -1000, // negative offset to start into track
        100
      );
    });

    it('should fail before initialization', async () => {
      const uninitializedPlayer = new MidiSoundfontPlayer();
      const soundfontData = createMockSoundfontData();
      
      await expect(
        uninitializedPlayer.addTrack('track1', [], soundfontData)
      ).rejects.toThrow('synthesizer not initialized');
      
      uninitializedPlayer.dispose();
    });

    it('should handle soundfont loading errors', async () => {
      const mockSynth = vi.mocked(AudioWorkletNodeSynthesizer).mock.results[0]?.value;
      mockSynth.loadSFont.mockRejectedValueOnce(new Error('Invalid soundfont'));
      
      const soundfontData = createMockSoundfontData();
      
      await expect(
        player.addTrack('track1', [], soundfontData)
      ).rejects.toThrow('Invalid soundfont');
      
      expect(consoleSpy.hasError('Failed to add track "track1"')).toBe(true);
    });

    it('should store soundfont bank offsets correctly', async () => {
      const mockSynth = vi.mocked(AudioWorkletNodeSynthesizer).mock.results[0]?.value;
      mockSynth.loadSFont.mockResolvedValueOnce(3); // sfontId = 3
      
      const soundfontData = createMockSoundfontData();
      await player.addTrack('track1', [], soundfontData);
      
      expect(player.getSoundfontBankOffset(3)).toBe(300); // sfontId * 100
    });
  });

  describe('removeTrack', () => {
    beforeEach(async () => {
      await player.initSynthesizer(mockAudioContext);
    });

    it('should remove existing track', async () => {
      const soundfontData = createMockSoundfontData();
      await player.addTrack('track1', [], soundfontData);
      
      player.removeTrack('track1');
      
      expect(player.getTrackIds()).not.toContain('track1');
      expect(consoleSpy.hasLog('Track "track1" removed')).toBe(true);
    });

    it('should dispose track resources', async () => {
      const soundfontData = createMockSoundfontData();
      await player.addTrack('track1', [], soundfontData);
      
      const track = player.getTrack('track1');
      const disposeSpy = vi.spyOn(track!, 'dispose');
      
      player.removeTrack('track1');
      
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should handle non-existent track gracefully', () => {
      player.removeTrack('non-existent');
      
      expect(consoleSpy.hasWarning('Track "non-existent" not found')).toBe(true);
    });
  });

  describe('Playback Control', () => {
    beforeEach(async () => {
      await player.initSynthesizer(mockAudioContext);
      const soundfontData = createMockSoundfontData();
      await player.addTrack('track1', generateTestNotes(10), soundfontData);
      await player.addTrack('track2', generateTestNotes(10), soundfontData);
    });

    describe('play', () => {
      it('should start playback', async () => {
        await player.play();
        
        expect(player.isPlayerPlaying()).toBe(true);
        expect(consoleSpy.hasLog('Starting playback from tick 0')).toBe(true);
      });

      it('should resume from current position', async () => {
        // Set master tick to simulate paused position
        await player.seek(1000);
        await player.play();
        
        expect(consoleSpy.hasLog('Starting playback from tick 1000')).toBe(true);
      });

      it('should not restart if already playing', async () => {
        await player.play();
        consoleSpy.getLogs().length = 0; // Clear logs
        
        await player.play();
        
        expect(consoleSpy.getLogs()).toHaveLength(0);
      });

      it('should start all tracks', async () => {
        const track1 = player.getTrack('track1')!;
        const track2 = player.getTrack('track2')!;
        
        await player.play();
        
        expect(track1.play).toHaveBeenCalledWith(0);
        expect(track2.play).toHaveBeenCalledWith(0);
      });
    });

    describe('pause', () => {
      it('should pause playback', async () => {
        await player.play();
        player.pause();
        
        expect(player.isPlayerPlaying()).toBe(false);
        expect(consoleSpy.hasLog('Pausing playback')).toBe(true);
      });

      it('should maintain position when paused', async () => {
        await player.play();
        timer.advance(1000);
        const tickBeforePause = player.getCurrentTick();
        
        player.pause();
        timer.advance(1000); // Time passes but position shouldn't change
        
        expect(player.getCurrentTick()).toBe(tickBeforePause);
      });

      it('should pause all tracks', async () => {
        await player.play();
        const track1 = player.getTrack('track1')!;
        const track2 = player.getTrack('track2')!;
        
        player.pause();
        
        expect(track1.pause).toHaveBeenCalled();
        expect(track2.pause).toHaveBeenCalled();
      });

      it('should handle pause when not playing', () => {
        player.pause();
        
        // Should not throw or cause issues
        expect(player.isPlayerPlaying()).toBe(false);
      });
    });

    describe('stop', () => {
      it('should stop playback and reset position', async () => {
        await player.play();
        timer.advance(2000);
        
        await player.stop();
        
        expect(player.isPlayerPlaying()).toBe(false);
        expect(player.getCurrentTick()).toBe(0);
        expect(consoleSpy.hasLog('All tracks stopped and reset')).toBe(true);
      });

      it('should stop all tracks', async () => {
        await player.play();
        const track1 = player.getTrack('track1')!;
        const track2 = player.getTrack('track2')!;
        
        await player.stop();
        
        expect(track1.stop).toHaveBeenCalled();
        expect(track2.stop).toHaveBeenCalled();
      });
    });

    describe('seek', () => {
      it('should seek to specified position', async () => {
        await player.seek(5000);
        
        expect(player.getCurrentTick()).toBe(5000);
        expect(consoleSpy.hasLog('Seeking to 5000ms')).toBe(true);
      });

      it('should seek all tracks', async () => {
        const track1 = player.getTrack('track1')!;
        const track2 = player.getTrack('track2')!;
        
        await player.seek(3000);
        
        expect(track1.seekToGlobalTime).toHaveBeenCalledWith(3000);
        expect(track2.seekToGlobalTime).toHaveBeenCalledWith(3000);
      });

      it('should pause and resume if playing during seek', async () => {
        await player.play();
        const wasPlaying = player.isPlayerPlaying();
        
        await player.seek(2000);
        
        expect(wasPlaying).toBe(true);
        expect(player.isPlayerPlaying()).toBe(true);
        expect(player.getCurrentTick()).toBe(2000);
      });

      it('should handle seek to negative position', async () => {
        await player.seek(-1000);
        
        expect(player.getCurrentTick()).toBe(-1000);
      });
    });
  });

  describe('Track-specific controls', () => {
    beforeEach(async () => {
      await player.initSynthesizer(mockAudioContext);
      const soundfontData = createMockSoundfontData();
      await player.addTrack('track1', generateTestNotes(5), soundfontData);
    });

    describe('playTrack', () => {
      it('should play specific track', () => {
        const track = player.getTrack('track1')!;
        player.playTrack('track1');
        
        expect(track.unmute).toHaveBeenCalled();
        expect(consoleSpy.hasLog('Playing track "track1"')).toBe(true);
      });

      it('should start player if not playing', async () => {
        player.playTrack('track1');
        
        await waitForCondition(() => player.isPlayerPlaying());
        expect(player.isPlayerPlaying()).toBe(true);
      });

      it('should handle non-existent track', () => {
        player.playTrack('non-existent');
        
        expect(consoleSpy.hasWarning('Track "non-existent" not found')).toBe(true);
      });
    });

    describe('pauseTrack', () => {
      it('should pause specific track by muting', () => {
        const track = player.getTrack('track1')!;
        player.pauseTrack('track1');
        
        expect(track.mute).toHaveBeenCalled();
        expect(consoleSpy.hasLog('Pausing track "track1"')).toBe(true);
      });
    });

    describe('stopTrack', () => {
      it('should stop and reset track position', () => {
        const track = player.getTrack('track1')!;
        player.stopTrack('track1');
        
        expect(track.resetPosition).toHaveBeenCalled();
        expect(track.mute).toHaveBeenCalled();
        expect(consoleSpy.hasLog('Stopping track "track1"')).toBe(true);
      });
    });

    describe('muteTrack', () => {
      it('should mute track', () => {
        const track = player.getTrack('track1')!;
        player.muteTrack('track1', true);
        
        expect(track.mute).toHaveBeenCalled();
        expect(consoleSpy.hasLog('Muting track "track1"')).toBe(true);
      });

      it('should unmute track', () => {
        const track = player.getTrack('track1')!;
        player.muteTrack('track1', false);
        
        expect(track.unmute).toHaveBeenCalled();
        expect(consoleSpy.hasLog('Unmuting track "track1"')).toBe(true);
      });
    });
  });

  describe('Volume and offset controls', () => {
    beforeEach(async () => {
      await player.initSynthesizer(mockAudioContext);
      const soundfontData = createMockSoundfontData();
      await player.addTrack('track1', [], soundfontData);
    });

    describe('setTrackVolume', () => {
      it('should set track volume', () => {
        const track = player.getTrack('track1')!;
        player.setTrackVolume('track1', 100);
        
        expect(track.setVolume).toHaveBeenCalledWith(100);
        expect(consoleSpy.hasLog('Setting volume of track "track1" to 100')).toBe(true);
      });

      it('should handle non-existent track', () => {
        player.setTrackVolume('non-existent', 50);
        
        expect(consoleSpy.hasWarning('Track "non-existent" not found')).toBe(true);
      });
    });

    describe('track offset', () => {
      it('should set track offset', () => {
        const track = player.getTrack('track1')!;
        player.setTrackOffset('track1', 1000);
        
        expect(track.setOffset).toHaveBeenCalledWith(1000);
        expect(consoleSpy.hasLog('Setting offset of track "track1" to 1000')).toBe(true);
      });

      it('should get track offset', () => {
        const track = player.getTrack('track1')!;
        track.getOffset.mockReturnValue(500);
        
        expect(player.getTrackOffset('track1')).toBe(500);
      });

      it('should return undefined for non-existent track', () => {
        expect(player.getTrackOffset('non-existent')).toBeUndefined();
      });
    });
  });

  describe('BPM/Tempo management', () => {
    beforeEach(async () => {
      await player.initSynthesizer(mockAudioContext);
      const soundfontData = createMockSoundfontData();
      await player.addTrack('track1', [], soundfontData);
      await player.addTrack('track2', [], soundfontData);
    });

    describe('setTrackBPM', () => {
      it('should set BPM for specific track', async () => {
        const track = player.getTrack('track1')!;
        await player.setTrackBPM('track1', 140);
        
        expect(track.setBPM).toHaveBeenCalledWith(140);
        expect(consoleSpy.hasLog('Setting tempo of track "track1" to 140 BPM')).toBe(true);
      });

      it('should handle non-existent track', async () => {
        await player.setTrackBPM('non-existent', 140);
        
        expect(consoleSpy.hasWarning('Track "non-existent" not found')).toBe(true);
      });
    });

    describe('getTrackBPM', () => {
      it('should get track BPM', () => {
        const track = player.getTrack('track1')!;
        track.getBPM.mockReturnValue(128);
        
        expect(player.getTrackBPM('track1')).toBe(128);
      });

      it('should return undefined for non-existent track', () => {
        expect(player.getTrackBPM('non-existent')).toBeUndefined();
      });
    });

    describe('setGlobalBPM', () => {
      it('should set BPM for all tracks when not playing', async () => {
        const track1 = player.getTrack('track1')!;
        const track2 = player.getTrack('track2')!;
        
        await player.setGlobalBPM(140);
        
        expect(track1.setBPM).toHaveBeenCalledWith(140);
        expect(track2.setBPM).toHaveBeenCalledWith(140);
        expect(consoleSpy.hasLog('Applied tempo change to 140 BPM immediately')).toBe(true);
      });

      it('should queue BPM change when playing', async () => {
        await player.play();
        
        await player.setGlobalBPM(140);
        
        expect(player.getGlobalBPM()).toBe(140);
        expect(consoleSpy.hasLog('Tempo change to 140 BPM queued')).toBe(true);
      });

      it('should ignore invalid BPM values', async () => {
        await player.setGlobalBPM(0);
        expect(consoleSpy.hasWarning('Invalid BPM value: 0')).toBe(true);
        
        await player.setGlobalBPM(-10);
        expect(consoleSpy.hasWarning('Invalid BPM value: -10')).toBe(true);
      });
    });
  });

  describe('dispose', () => {
    beforeEach(async () => {
      await player.initSynthesizer(mockAudioContext);
      const soundfontData = createMockSoundfontData();
      await player.addTrack('track1', [], soundfontData);
      await player.addTrack('track2', [], soundfontData);
    });

    it('should dispose all resources', async () => {
      const track1 = player.getTrack('track1')!;
      const track2 = player.getTrack('track2')!;
      const mockSynth = vi.mocked(AudioWorkletNodeSynthesizer).mock.results[0]?.value;
      
      await player.play();
      player.dispose();
      
      expect(player.isPlayerPlaying()).toBe(false);
      expect(track1.dispose).toHaveBeenCalled();
      expect(track2.dispose).toHaveBeenCalled();
      expect(mockSynth.closePlayer).toHaveBeenCalled();
      expect(player.getTrackIds()).toHaveLength(0);
    });

    it('should disconnect audio node', async () => {
      const mockSynth = vi.mocked(AudioWorkletNodeSynthesizer).mock.results[0]?.value;
      const audioNode = mockSynth.createAudioNode(mockAudioContext, {});
      
      player.dispose();
      
      expect(audioNode.disconnect).toHaveBeenCalled();
    });

    it('should clear all internal maps', () => {
      player.dispose();
      
      expect(player.getTrackIds()).toHaveLength(0);
      expect(player.getSoundfontBankOffset(0)).toBeUndefined();
    });

    it('should handle disposal when not initialized', () => {
      const uninitializedPlayer = new MidiSoundfontPlayer();
      
      // Should not throw
      expect(() => uninitializedPlayer.dispose()).not.toThrow();
    });
  });

  describe('Edge cases and error handling', () => {
    beforeEach(async () => {
      await player.initSynthesizer(mockAudioContext);
    });

    it('should handle concurrent track additions', async () => {
      const soundfontData = createMockSoundfontData();
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(player.addTrack(`track${i}`, [], soundfontData));
      }
      
      await Promise.all(promises);
      
      expect(player.getTrackIds()).toHaveLength(10);
    });

    it('should handle rapid play/pause/stop cycles', async () => {
      const soundfontData = createMockSoundfontData();
      await player.addTrack('track1', generateTestNotes(100), soundfontData);
      
      for (let i = 0; i < 5; i++) {
        await player.play();
        player.pause();
        await player.stop();
      }
      
      expect(player.isPlayerPlaying()).toBe(false);
      expect(player.getCurrentTick()).toBe(0);
    });

    it('should handle seek beyond track duration', async () => {
      const soundfontData = createMockSoundfontData();
      await player.addTrack('track1', generateTestNotes(5), soundfontData);
      
      // Seek way beyond track duration
      await player.seek(1000000);
      
      expect(player.getCurrentTick()).toBe(1000000);
    });

    it('should handle empty note arrays', async () => {
      const soundfontData = createMockSoundfontData();
      
      await player.addTrack('empty-track', [], soundfontData);
      
      expect(player.getTrackIds()).toContain('empty-track');
      
      // Should play without issues
      await player.play();
      expect(player.isPlayerPlaying()).toBe(true);
    });

    it('should handle very large tick values', async () => {
      const soundfontData = createMockSoundfontData();
      const notes = [{
        id: 'note-1',
        pitch: 60,
        velocity: 80,
        startTicks: Number.MAX_SAFE_INTEGER - 1000,
        durationTicks: 480,
        trackId: 'track1'
      }];
      
      await player.addTrack('track1', notes, soundfontData);
      
      // Should handle without overflow
      await player.seek(Number.MAX_SAFE_INTEGER - 500);
      expect(player.getCurrentTick()).toBe(Number.MAX_SAFE_INTEGER - 500);
    });
  });
});