import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MidiSoundfontPlayer } from '../midiSoundfontPlayer/midiSoundfontPlayer';
import { SoundfontEngineController } from '../soundfontEngineController';
import { SamplerController } from '../samplerController';
import AudioFilePlayer from '../audioFilePlayer/audioEngine';
import { 
  createMockAudioContext,
  createMockSoundfontData,
  createMockAudioFile
} from '../../../../test/mocks/audioMocks';
import { 
  generateTestNotes,
  generateDrumPattern,
  createMockMidiManager,
  PerformanceTracker,
  spyOnConsole
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

describe('Audio Engine Performance Tests', () => {
  let performanceTracker: PerformanceTracker;
  let consoleSpy: ReturnType<typeof spyOnConsole>;
  let mockAudioContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    performanceTracker = new PerformanceTracker();
    consoleSpy = spyOnConsole();
    mockAudioContext = createMockAudioContext();
  });

  afterEach(() => {
    performanceTracker.reset();
    consoleSpy.restore();
  });

  describe('MidiSoundfontPlayer Performance', () => {
    let player: MidiSoundfontPlayer;

    beforeEach(async () => {
      player = new MidiSoundfontPlayer(120);
      await player.initSynthesizer(mockAudioContext);
    });

    afterEach(() => {
      player.dispose();
    });

    it('should handle 10 tracks efficiently', async () => {
      const trackCount = 10;
      const timer = performanceTracker.start('add-10-tracks');
      
      for (let i = 0; i < trackCount; i++) {
        await player.addTrack(
          `track${i}`,
          generateTestNotes(100),
          createMockSoundfontData()
        );
      }
      
      timer();
      
      const stats = performanceTracker.getStats('add-10-tracks');
      expect(stats!.average).toBeLessThan(500); // Should add 10 tracks in under 500ms
      expect(player.getTrackIds()).toHaveLength(trackCount);
      
      // Test playback performance
      const playTimer = performanceTracker.start('play-10-tracks');
      await player.play();
      playTimer();
      
      const playStats = performanceTracker.getStats('play-10-tracks');
      expect(playStats!.average).toBeLessThan(100); // Starting playback should be fast
    });

    it('should handle 50 tracks with acceptable performance', async () => {
      const trackCount = 50;
      const addTimer = performanceTracker.start('add-50-tracks');
      
      const promises = [];
      for (let i = 0; i < trackCount; i++) {
        promises.push(
          player.addTrack(
            `track${i}`,
            generateTestNotes(50),
            createMockSoundfontData()
          )
        );
      }
      
      await Promise.all(promises);
      addTimer();
      
      const stats = performanceTracker.getStats('add-50-tracks');
      expect(stats!.average).toBeLessThan(2000); // 50 tracks in under 2 seconds
      
      // Test seek performance with many tracks
      const seekTimer = performanceTracker.start('seek-50-tracks');
      await player.seek(10000);
      seekTimer();
      
      const seekStats = performanceTracker.getStats('seek-50-tracks');
      expect(seekStats!.average).toBeLessThan(200); // Seeking should still be fast
    });

    it('should handle large MIDI files efficiently', async () => {
      // Create a track with many notes
      const largeNoteCount = 10000;
      const notes = generateTestNotes(largeNoteCount);
      
      const timer = performanceTracker.start('large-midi-file');
      await player.addTrack('large-track', notes, createMockSoundfontData());
      timer();
      
      const stats = performanceTracker.getStats('large-midi-file');
      expect(stats!.average).toBeLessThan(1000); // Should handle 10k notes in under 1 second
      
      // Test playback start time
      const playTimer = performanceTracker.start('play-large-file');
      await player.play();
      playTimer();
      
      const playStats = performanceTracker.getStats('play-large-file');
      expect(playStats!.average).toBeLessThan(50); // Starting should still be fast
    });

    it('should maintain performance during extended playback', async () => {
      // Add multiple tracks
      for (let i = 0; i < 5; i++) {
        await player.addTrack(
          `track${i}`,
          generateTestNotes(1000),
          createMockSoundfontData()
        );
      }
      
      await player.play();
      
      // Simulate extended playback with multiple operations
      const operations = [];
      
      for (let i = 0; i < 100; i++) {
        const opTimer = performanceTracker.start(`operation-${i}`);
        
        // Random operations
        const op = i % 4;
        switch (op) {
          case 0:
            player.muteTrack(`track${i % 5}`, i % 2 === 0);
            break;
          case 1:
            player.setTrackVolume(`track${i % 5}`, (i % 100));
            break;
          case 2:
            player.setTrackOffset(`track${i % 5}`, i * 100);
            break;
          case 3:
            await player.setTrackBPM(`track${i % 5}`, 120 + (i % 40));
            break;
        }
        
        opTimer();
      }
      
      // Check that all operations were fast
      let totalTime = 0;
      let operationCount = 0;
      
      for (let i = 0; i < 100; i++) {
        const stats = performanceTracker.getStats(`operation-${i}`);
        if (stats) {
          totalTime += stats.average;
          operationCount++;
        }
      }
      
      const averageOperationTime = totalTime / operationCount;
      expect(averageOperationTime).toBeLessThan(10); // Each operation should be very fast
    });

    it('should handle rapid track addition and removal', async () => {
      const iterations = 20;
      
      for (let i = 0; i < iterations; i++) {
        const addTimer = performanceTracker.start(`add-${i}`);
        await player.addTrack(`track${i}`, generateTestNotes(100), createMockSoundfontData());
        addTimer();
        
        if (i > 5) {
          const removeTimer = performanceTracker.start(`remove-${i}`);
          player.removeTrack(`track${i - 5}`);
          removeTimer();
        }
      }
      
      // Check performance consistency
      let maxAddTime = 0;
      let maxRemoveTime = 0;
      
      for (let i = 0; i < iterations; i++) {
        const addStats = performanceTracker.getStats(`add-${i}`);
        if (addStats && addStats.average > maxAddTime) {
          maxAddTime = addStats.average;
        }
        
        if (i > 5) {
          const removeStats = performanceTracker.getStats(`remove-${i}`);
          if (removeStats && removeStats.average > maxRemoveTime) {
            maxRemoveTime = removeStats.average;
          }
        }
      }
      
      expect(maxAddTime).toBeLessThan(100); // No single add should take too long
      expect(maxRemoveTime).toBeLessThan(20); // Removal should be very fast
    });
  });

  describe('SoundfontEngineController Performance', () => {
    let controller: SoundfontEngineController;
    let mockMidiManager: ReturnType<typeof createMockMidiManager>;

    beforeEach(async () => {
      controller = new SoundfontEngineController();
      await controller.initialize(mockAudioContext);
      mockMidiManager = createMockMidiManager();
    });

    afterEach(() => {
      controller.dispose();
      mockMidiManager._reset();
    });

    it('should handle real-time note updates efficiently', async () => {
      // Connect a track
      mockMidiManager.hasTrack.mockReturnValue(true);
      mockMidiManager.getTrackNotes.mockReturnValue(generateTestNotes(100));
      await controller.connectTrackToSoundfont('test-track', 'piano', mockMidiManager);
      
      await controller.play();
      
      // Simulate rapid note updates
      const updateCount = 50;
      
      for (let i = 0; i < updateCount; i++) {
        const timer = performanceTracker.start(`update-${i}`);
        const newNotes = generateTestNotes(50 + i);
        mockMidiManager._triggerUpdate('test-track', newNotes);
        timer();
      }
      
      // Check update performance
      let totalUpdateTime = 0;
      for (let i = 0; i < updateCount; i++) {
        const stats = performanceTracker.getStats(`update-${i}`);
        if (stats) {
          totalUpdateTime += stats.average;
        }
      }
      
      const averageUpdateTime = totalUpdateTime / updateCount;
      expect(averageUpdateTime).toBeLessThan(5); // Updates should be very fast
    });

    it('should handle multiple track subscriptions efficiently', async () => {
      const trackCount = 20;
      
      // Connect multiple tracks
      const connectTimer = performanceTracker.start('connect-multiple');
      
      for (let i = 0; i < trackCount; i++) {
        mockMidiManager.hasTrack.mockReturnValue(false);
        mockMidiManager.getTrackNotes.mockReturnValue(generateTestNotes(100));
        await controller.connectTrackToSoundfont(`track${i}`, 'piano', mockMidiManager);
      }
      
      connectTimer();
      
      const connectStats = performanceTracker.getStats('connect-multiple');
      expect(connectStats!.average).toBeLessThan(1000); // Should connect 20 tracks quickly
      
      // Test simultaneous updates
      const updateTimer = performanceTracker.start('simultaneous-updates');
      
      for (let i = 0; i < trackCount; i++) {
        mockMidiManager._triggerUpdate(`track${i}`, generateTestNotes(200));
      }
      
      updateTimer();
      
      const updateStats = performanceTracker.getStats('simultaneous-updates');
      expect(updateStats!.average).toBeLessThan(100); // Bulk updates should be fast
    });
  });

  describe('AudioFilePlayer Performance', () => {
    let player: AudioFilePlayer;

    beforeEach(async () => {
      (AudioFilePlayer as any).instance = undefined;
      player = AudioFilePlayer.getInstance();
      await player.initialize();
    });

    afterEach(() => {
      (AudioFilePlayer as any).instance = undefined;
    });

    it('should create and manage many audio tracks efficiently', async () => {
      const trackCount = 30;
      
      // Create tracks
      const createTimer = performanceTracker.start('create-audio-tracks');
      
      for (let i = 0; i < trackCount; i++) {
        await player.createTrack(
          `track${i}`,
          `Track ${i}`,
          createMockAudioFile(`audio${i}.mp3`)
        );
      }
      
      createTimer();
      
      const createStats = performanceTracker.getStats('create-audio-tracks');
      expect(createStats!.average).toBeLessThan(500); // Should create 30 tracks quickly
      
      // Test bulk operations
      const volumeTimer = performanceTracker.start('bulk-volume-changes');
      
      for (let i = 0; i < trackCount; i++) {
        await player.setTrackVolume(`track${i}`, 50 + i);
      }
      
      volumeTimer();
      
      const volumeStats = performanceTracker.getStats('bulk-volume-changes');
      expect(volumeStats!.average).toBeLessThan(100); // Volume changes should be fast
      
      // Test solo functionality with many tracks
      const soloTimer = performanceTracker.start('solo-operation');
      player.setTrackSolo('track5', true);
      soloTimer();
      
      const soloStats = performanceTracker.getStats('solo-operation');
      expect(soloStats!.average).toBeLessThan(20); // Solo should be fast even with many tracks
    });

    it('should handle rapid state changes efficiently', async () => {
      // Create a few tracks
      for (let i = 0; i < 10; i++) {
        await player.createTrack(`track${i}`, `Track ${i}`);
      }
      
      // Rapid state changes
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        const timer = performanceTracker.start(`state-change-${i}`);
        
        const trackId = `track${i % 10}`;
        const operation = i % 5;
        
        switch (operation) {
          case 0:
            await player.setTrackVolume(trackId, i % 100);
            break;
          case 1:
            await player.setTrackPan(trackId, (i % 200) - 100);
            break;
          case 2:
            await player.setTrackMute(trackId, i % 2 === 0);
            break;
          case 3:
            player.setTrackName(trackId, `Updated ${i}`);
            break;
          case 4:
            player.setTrackPosition(trackId, i * 10, i * 5);
            break;
        }
        
        timer();
      }
      
      // Verify all operations were fast
      let slowOperations = 0;
      for (let i = 0; i < iterations; i++) {
        const stats = performanceTracker.getStats(`state-change-${i}`);
        if (stats && stats.average > 10) {
          slowOperations++;
        }
      }
      
      expect(slowOperations).toBeLessThan(5); // Very few operations should be slow
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory during extended operations', async () => {
      const midiPlayer = new MidiSoundfontPlayer(120);
      await midiPlayer.initSynthesizer(mockAudioContext);
      
      // Simulate extended session
      for (let cycle = 0; cycle < 10; cycle++) {
        // Add tracks
        for (let i = 0; i < 5; i++) {
          await midiPlayer.addTrack(
            `cycle${cycle}-track${i}`,
            generateTestNotes(100),
            createMockSoundfontData()
          );
        }
        
        // Play for a bit
        await midiPlayer.play();
        
        // Do some operations
        for (let i = 0; i < 5; i++) {
          midiPlayer.setTrackVolume(`cycle${cycle}-track${i}`, 80);
          midiPlayer.muteTrack(`cycle${cycle}-track${i}`, i % 2 === 0);
        }
        
        // Stop and remove tracks
        await midiPlayer.stop();
        
        for (let i = 0; i < 5; i++) {
          midiPlayer.removeTrack(`cycle${cycle}-track${i}`);
        }
      }
      
      // After all cycles, should have no tracks
      expect(midiPlayer.getTrackIds()).toHaveLength(0);
      
      midiPlayer.dispose();
    });

    it('should handle stress test with all engines', async () => {
      const engines = {
        midi: new MidiSoundfontPlayer(120),
        soundfont: new SoundfontEngineController(),
        sampler: new SamplerController(),
        audio: AudioFilePlayer.getInstance()
      };
      
      const mockMidiManager = createMockMidiManager();
      
      // Initialize all
      await engines.midi.initSynthesizer(mockAudioContext);
      await engines.soundfont.initialize(mockAudioContext);
      await engines.audio.initialize();
      
      const stressTimer = performanceTracker.start('stress-test');
      
      // Add content to all engines
      const promises = [];
      
      // MIDI tracks
      for (let i = 0; i < 10; i++) {
        promises.push(
          engines.midi.addTrack(`midi${i}`, generateTestNotes(100), createMockSoundfontData())
        );
      }
      
      // Soundfont tracks
      mockMidiManager.hasTrack.mockReturnValue(true);
      mockMidiManager.getTrackNotes.mockReturnValue(generateTestNotes(100));
      for (let i = 0; i < 10; i++) {
        promises.push(
          engines.soundfont.connectTrackToSoundfont(`sf${i}`, 'piano', mockMidiManager)
        );
      }
      
      // Sampler tracks
      for (let i = 0; i < 10; i++) {
        promises.push(
          engines.sampler.connectTrackToSampler(
            `sampler${i}`,
            createMockAudioFile(`sample${i}.wav`),
            mockMidiManager
          )
        );
      }
      
      // Audio tracks
      for (let i = 0; i < 10; i++) {
        promises.push(
          engines.audio.createTrack(`audio${i}`, `Audio ${i}`, createMockAudioFile(`audio${i}.mp3`))
        );
      }
      
      await Promise.all(promises);
      
      stressTimer();
      
      const stressStats = performanceTracker.getStats('stress-test');
      expect(stressStats!.average).toBeLessThan(5000); // Should complete in reasonable time
      
      // Cleanup
      engines.midi.dispose();
      engines.soundfont.dispose();
      engines.sampler.dispose();
      (AudioFilePlayer as any).instance = undefined;
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance targets', async () => {
      const benchmarks = {
        'track-creation': { target: 10, actual: 0 },
        'track-removal': { target: 5, actual: 0 },
        'volume-change': { target: 2, actual: 0 },
        'mute-toggle': { target: 2, actual: 0 },
        'seek-operation': { target: 50, actual: 0 },
        'play-start': { target: 50, actual: 0 },
        'pause-operation': { target: 10, actual: 0 },
        'stop-operation': { target: 20, actual: 0 }
      };
      
      const player = new MidiSoundfontPlayer(120);
      await player.initSynthesizer(mockAudioContext);
      
      // Track creation
      let timer = performanceTracker.start('track-creation');
      await player.addTrack('test', generateTestNotes(100), createMockSoundfontData());
      timer();
      benchmarks['track-creation'].actual = performanceTracker.getStats('track-creation')!.average;
      
      // Play start
      timer = performanceTracker.start('play-start');
      await player.play();
      timer();
      benchmarks['play-start'].actual = performanceTracker.getStats('play-start')!.average;
      
      // Volume change
      timer = performanceTracker.start('volume-change');
      player.setTrackVolume('test', 90);
      timer();
      benchmarks['volume-change'].actual = performanceTracker.getStats('volume-change')!.average;
      
      // Mute toggle
      timer = performanceTracker.start('mute-toggle');
      player.muteTrack('test', true);
      timer();
      benchmarks['mute-toggle'].actual = performanceTracker.getStats('mute-toggle')!.average;
      
      // Seek operation
      timer = performanceTracker.start('seek-operation');
      await player.seek(5000);
      timer();
      benchmarks['seek-operation'].actual = performanceTracker.getStats('seek-operation')!.average;
      
      // Pause
      timer = performanceTracker.start('pause-operation');
      player.pause();
      timer();
      benchmarks['pause-operation'].actual = performanceTracker.getStats('pause-operation')!.average;
      
      // Stop
      timer = performanceTracker.start('stop-operation');
      await player.stop();
      timer();
      benchmarks['stop-operation'].actual = performanceTracker.getStats('stop-operation')!.average;
      
      // Track removal
      timer = performanceTracker.start('track-removal');
      player.removeTrack('test');
      timer();
      benchmarks['track-removal'].actual = performanceTracker.getStats('track-removal')!.average;
      
      // Check all benchmarks
      console.log('\nPerformance Benchmark Results:');
      console.log('================================');
      for (const [operation, { target, actual }] of Object.entries(benchmarks)) {
        const passed = actual <= target;
        console.log(
          `${operation.padEnd(20)} Target: ${target}ms, Actual: ${actual.toFixed(2)}ms ${passed ? '✓' : '✗'}`
        );
        expect(actual).toBeLessThanOrEqual(target * 1.5); // Allow 50% margin
      }
      
      player.dispose();
    });
  });
});