import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MidiSoundfontPlayer } from '../midiSoundfontPlayer/midiSoundfontPlayer';
import { SoundfontEngineController } from '../soundfontEngineController';
import { SamplerController } from '../samplerController';
import AudioFilePlayer from '../audioFilePlayer/audioEngine';
import { 
  createMockAudioContext,
  createMockSoundfontData,
  createMockAudioFile,
  MockTimer
} from '../../../../test/mocks/audioMocks';
import { 
  generateTestNotes,
  generateChord,
  generateDrumPattern,
  createMockMidiManager,
  spyOnConsole,
  PerformanceTracker
} from '../../../../test/utils/testHelpers';

// Mock the soundfont manager
vi.mock('../../soundfont/soundfontManager', () => ({
  default: {
    getInstance: vi.fn().mockReturnValue({
      getSoundfont: vi.fn().mockResolvedValue({
        data: new ArrayBuffer(1024),
        storage_key: 'test-soundfont-key'
      })
    })
  }
}));

describe('Audio Engine Integration Tests', () => {
  let consoleSpy: ReturnType<typeof spyOnConsole>;
  let performanceTracker: PerformanceTracker;
  let mockAudioContext: any;
  let timer: MockTimer;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = spyOnConsole();
    performanceTracker = new PerformanceTracker();
    mockAudioContext = createMockAudioContext();
    timer = new MockTimer();
  });

  afterEach(() => {
    consoleSpy.restore();
    performanceTracker.reset();
    timer.reset();
  });

  describe('Multi-Engine Coordination', () => {
    let midiPlayer: MidiSoundfontPlayer;
    let soundfontController: SoundfontEngineController;
    let samplerController: SamplerController;
    let audioFilePlayer: AudioFilePlayer;
    let mockMidiManager: ReturnType<typeof createMockMidiManager>;

    beforeEach(async () => {
      // Initialize all engines
      midiPlayer = new MidiSoundfontPlayer(120);
      await midiPlayer.initSynthesizer(mockAudioContext);
      
      soundfontController = new SoundfontEngineController();
      await soundfontController.initialize(mockAudioContext);
      
      samplerController = new SamplerController();
      
      audioFilePlayer = AudioFilePlayer.getInstance();
      await audioFilePlayer.initialize();
      
      mockMidiManager = createMockMidiManager();
    });

    afterEach(() => {
      midiPlayer.dispose();
      soundfontController.dispose();
      samplerController.dispose();
      mockMidiManager._reset();
      (AudioFilePlayer as any).instance = undefined;
    });

    it('should coordinate playback across multiple engines', async () => {
      // Setup tracks
      const pianoNotes = generateChord(60, 'major', 0, 480, 'piano-track');
      const drumNotes = generateDrumPattern(2, 'drum-track');
      const bassNotes = generateTestNotes(8, 'bass-track');
      
      // Add MIDI tracks
      await midiPlayer.addTrack('piano', pianoNotes, createMockSoundfontData());
      await midiPlayer.addTrack('drums', drumNotes, createMockSoundfontData(), { channel: 9 });
      
      // Connect soundfont track
      mockMidiManager.hasTrack.mockReturnValue(true);
      mockMidiManager.getTrackNotes.mockReturnValue(bassNotes);
      await soundfontController.connectTrackToSoundfont('bass', 'bass', mockMidiManager);
      
      // Add sampler track
      await samplerController.connectTrackToSampler('lead', createMockAudioFile('lead.wav'), mockMidiManager);
      
      // Add audio file track
      await audioFilePlayer.createTrack('backing', 'Backing Track', createMockAudioFile('backing.mp3'));
      
      // Start playback
      const playStart = performanceTracker.start('multi-engine-play');
      await Promise.all([
        midiPlayer.play(),
        soundfontController.play(),
        samplerController.play(0, 120),
        // audioFilePlayer.play() is not implemented in the interface
      ]);
      playStart();
      
      // Verify all engines are playing
      expect(midiPlayer.isPlayerPlaying()).toBe(true);
      expect(consoleSpy.hasLog('Starting playback from tick 0')).toBe(true);
      expect(consoleSpy.hasLog('SoundfontEngineController: Starting playback')).toBe(true);
      expect(consoleSpy.hasLog('SamplerController: Starting playback for all samplers')).toBe(true);
      
      // Simulate time passing
      timer.advance(2000);
      
      // Pause all engines
      const pauseStart = performanceTracker.start('multi-engine-pause');
      await Promise.all([
        midiPlayer.pause(),
        soundfontController.pause(),
        samplerController.pause()
      ]);
      pauseStart();
      
      expect(midiPlayer.isPlayerPlaying()).toBe(false);
      
      // Check performance
      const playStats = performanceTracker.getStats('multi-engine-play');
      const pauseStats = performanceTracker.getStats('multi-engine-pause');
      
      expect(playStats?.average).toBeLessThan(100); // Should be fast
      expect(pauseStats?.average).toBeLessThan(50);
    });

    it('should handle dynamic track updates during playback', async () => {
      // Setup initial tracks
      const initialNotes = generateTestNotes(10, 'dynamic-track');
      
      // Connect track through soundfont controller
      mockMidiManager.hasTrack.mockReturnValue(false);
      mockMidiManager.getTrackNotes.mockReturnValue(initialNotes);
      await soundfontController.connectTrackToSoundfont('dynamic-track', 'piano', mockMidiManager);
      
      // Start playback
      await soundfontController.play();
      
      // Simulate note updates during playback
      const updatedNotes = [...initialNotes, ...generateTestNotes(5, 'dynamic-track')];
      mockMidiManager._triggerUpdate('dynamic-track', updatedNotes);
      
      // Add more tracks while playing
      await samplerController.connectTrackToSampler('new-sampler', createMockAudioFile('new.wav'), mockMidiManager);
      await samplerController.play(timer.getCurrentTime(), 120);
      
      // Verify updates were applied
      expect(consoleSpy.hasLog('Notes updated for track dynamic-track')).toBe(true);
      expect(consoleSpy.hasLog('Directly updated sequencer')).toBe(true);
    });

    it('should synchronize seek operations across engines', async () => {
      // Setup tracks in different engines
      await midiPlayer.addTrack('track1', generateTestNotes(100), createMockSoundfontData());
      
      mockMidiManager.hasTrack.mockReturnValue(true);
      mockMidiManager.getTrackNotes.mockReturnValue(generateTestNotes(100));
      await soundfontController.connectTrackToSoundfont('track2', 'piano', mockMidiManager);
      
      await samplerController.connectTrackToSampler('track3', createMockAudioFile('sample.wav'), mockMidiManager);
      
      // Start playback
      await Promise.all([
        midiPlayer.play(),
        soundfontController.play(),
        samplerController.play(0, 120)
      ]);
      
      timer.advance(5000);
      
      // Seek all engines to new position
      const seekPosition = 10000;
      const seekStart = performanceTracker.start('multi-engine-seek');
      
      await Promise.all([
        midiPlayer.seek(seekPosition),
        soundfontController.seek(seekPosition),
        samplerController.seek(seekPosition / 1000, 120) // samplerController uses seconds
      ]);
      
      seekStart();
      
      expect(midiPlayer.getCurrentTick()).toBe(seekPosition);
      expect(consoleSpy.hasLog(`Seeking to ${seekPosition}ms`)).toBe(true);
      
      const seekStats = performanceTracker.getStats('multi-engine-seek');
      expect(seekStats?.average).toBeLessThan(200); // Seek should be reasonably fast
    });
  });

  describe('Complex Musical Scenarios', () => {
    let soundfontController: SoundfontEngineController;
    let mockMidiManager: ReturnType<typeof createMockMidiManager>;

    beforeEach(async () => {
      soundfontController = new SoundfontEngineController();
      await soundfontController.initialize(mockAudioContext);
      mockMidiManager = createMockMidiManager();
    });

    afterEach(() => {
      soundfontController.dispose();
      mockMidiManager._reset();
    });

    it('should handle a full song arrangement', async () => {
      // Create a multi-track arrangement
      const tracks = [
        { id: 'drums', instrument: 'drums', notes: generateDrumPattern(8) },
        { id: 'bass', instrument: 'bass', notes: generateTestNotes(32, 'bass') },
        { id: 'piano', instrument: 'piano', notes: generateChord(60, 'major', 0, 480) },
        { id: 'lead', instrument: 'synth', notes: generateTestNotes(16, 'lead') }
      ];
      
      // Connect all tracks
      for (const track of tracks) {
        mockMidiManager.hasTrack.mockReturnValue(false);
        mockMidiManager.getTrackNotes.mockReturnValue(track.notes);
        await soundfontController.connectTrackToSoundfont(track.id, track.instrument, mockMidiManager);
      }
      
      // Set different volumes
      await soundfontController.setTrackVolume('drums', 70);
      await soundfontController.setTrackVolume('bass', 80);
      await soundfontController.setTrackVolume('piano', 60);
      await soundfontController.setTrackVolume('lead', 90);
      
      // Mute/unmute tracks dynamically
      await soundfontController.play();
      
      timer.advance(2000);
      soundfontController.muteTrack('lead', true);
      
      timer.advance(2000);
      soundfontController.muteTrack('lead', false);
      soundfontController.muteTrack('piano', true);
      
      // Change tempo mid-song
      await soundfontController.setGlobalBPM(140);
      
      timer.advance(4000);
      
      // Stop
      await soundfontController.stop();
      
      // Verify the arrangement played correctly
      expect(consoleSpy.hasLog('Setting track drums volume')).toBe(true);
      expect(consoleSpy.hasLog('Muting track lead')).toBe(true);
      expect(consoleSpy.hasLog('Unmuting track lead')).toBe(true);
      expect(consoleSpy.hasLog('Setting global BPM to 140')).toBe(true);
    });

    it('should handle live performance scenario with hot-swapping', async () => {
      // Start with initial tracks
      mockMidiManager.hasTrack.mockReturnValue(true);
      mockMidiManager.getTrackNotes.mockReturnValue(generateTestNotes(50));
      
      await soundfontController.connectTrackToSoundfont('track1', 'piano', mockMidiManager);
      await soundfontController.connectTrackToSoundfont('track2', 'strings', mockMidiManager);
      
      await soundfontController.play();
      
      // Simulate live performance actions
      timer.advance(1000);
      
      // Remove a track while playing
      soundfontController.removeTrack('track1');
      
      // Add a new track while playing
      mockMidiManager.getTrackNotes.mockReturnValue(generateChord(72, '7th', 0, 960));
      await soundfontController.connectTrackToSoundfont('track3', 'brass', mockMidiManager);
      
      // Update existing track notes
      const newNotes = generateTestNotes(30);
      mockMidiManager._triggerUpdate('track2', newNotes);
      
      timer.advance(2000);
      
      // Verify hot-swapping worked
      expect(consoleSpy.hasLog('Removing track track1')).toBe(true);
      expect(consoleSpy.hasLog('Successfully connected track track3')).toBe(true);
      expect(consoleSpy.hasLog('Notes updated for track track2')).toBe(true);
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should recover from partial initialization failures', async () => {
      const midiPlayer = new MidiSoundfontPlayer();
      const soundfontController = new SoundfontEngineController();
      const mockMidiManager = createMockMidiManager();
      
      // Simulate partial failure
      mockAudioContext.audioWorklet.addModule.mockRejectedValueOnce(new Error('Worklet failed'));
      
      await expect(midiPlayer.initSynthesizer(mockAudioContext)).rejects.toThrow();
      
      // Should still be able to initialize soundfont controller
      await soundfontController.initialize(mockAudioContext);
      
      // Cleanup
      midiPlayer.dispose();
      soundfontController.dispose();
    });

    it('should handle resource exhaustion gracefully', async () => {
      const controller = new SamplerController();
      const mockMidiManager = createMockMidiManager();
      
      // Try to create many samplers
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          controller.connectTrackToSampler(
            `track${i}`,
            createMockAudioFile(`sample${i}.wav`),
            mockMidiManager
          )
        );
      }
      
      await Promise.all(promises);
      
      // Should handle all without crashing
      expect(controller.getActiveSamplerIds()).toHaveLength(50);
      
      // Clean up
      controller.dispose();
    });

    it('should maintain consistency during rapid state changes', async () => {
      const midiPlayer = new MidiSoundfontPlayer(120);
      await midiPlayer.initSynthesizer(mockAudioContext);
      
      await midiPlayer.addTrack('test', generateTestNotes(100), createMockSoundfontData());
      
      // Rapid state changes
      for (let i = 0; i < 10; i++) {
        await midiPlayer.play();
        midiPlayer.pause();
        await midiPlayer.seek(i * 1000);
        await midiPlayer.stop();
      }
      
      // Should end in consistent state
      expect(midiPlayer.isPlayerPlaying()).toBe(false);
      expect(midiPlayer.getCurrentTick()).toBe(0);
      
      midiPlayer.dispose();
    });
  });

  describe('Performance Monitoring', () => {
    it('should track operation timings', async () => {
      const soundfontController = new SoundfontEngineController();
      const mockMidiManager = createMockMidiManager();
      
      await soundfontController.initialize(mockAudioContext);
      
      // Track various operations
      const operations = [
        'connect-track',
        'play',
        'pause',
        'seek',
        'stop',
        'dispose'
      ];
      
      // Connect track
      let timer = performanceTracker.start('connect-track');
      mockMidiManager.hasTrack.mockReturnValue(true);
      mockMidiManager.getTrackNotes.mockReturnValue(generateTestNotes(100));
      await soundfontController.connectTrackToSoundfont('perf-test', 'piano', mockMidiManager);
      timer();
      
      // Play
      timer = performanceTracker.start('play');
      await soundfontController.play();
      timer();
      
      // Pause
      timer = performanceTracker.start('pause');
      await soundfontController.pause();
      timer();
      
      // Seek
      timer = performanceTracker.start('seek');
      await soundfontController.seek(5000);
      timer();
      
      // Stop
      timer = performanceTracker.start('stop');
      await soundfontController.stop();
      timer();
      
      // Dispose
      timer = performanceTracker.start('dispose');
      soundfontController.dispose();
      timer();
      
      // Verify performance
      for (const op of operations) {
        const stats = performanceTracker.getStats(op);
        expect(stats).toBeDefined();
        expect(stats!.average).toBeLessThan(100); // All operations should be fast
        
        console.log(`Operation '${op}': ${stats!.average.toFixed(2)}ms average`);
      }
    });
  });
});