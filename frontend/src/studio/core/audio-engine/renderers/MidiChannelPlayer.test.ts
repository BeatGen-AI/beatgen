import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { MidiChannelPlayer, MidiChannelPlayerConfig } from './MidiChannelPlayer';
import { PlaybackNote } from '../types';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock sequencer instance
const createMockSequencer = () => ({
  registerSynthesizer: vi.fn().mockResolvedValue(undefined),
  setTimeScale: vi.fn(),
  getTimeScale: vi.fn().mockResolvedValue(960),
  getTick: vi.fn().mockResolvedValue(0),
  sendEventAt: vi.fn(),
  removeAllEvents: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
});

// Mock preset for soundfont
const createMockPreset = (bankNum = 0, num = 0) => ({
  bankNum,
  num,
});

// Mock soundfont object
const createMockSoundFontObject = (presets = [createMockPreset()]) => ({
  getPresetIterable: vi.fn().mockResolvedValue(presets),
});

// Mock synth instance
const createMockSynth = () => {
  const mockSeq = createMockSequencer();
  return {
    createSequencer: vi.fn().mockResolvedValue(mockSeq),
    setSFontBankOffset: vi.fn(),
    getSFontBankOffset: vi.fn().mockResolvedValue(0),
    getSFontObject: vi.fn().mockResolvedValue(createMockSoundFontObject()),
    midiProgramSelect: vi.fn(),
    midiControl: vi.fn(),
    midiAllNotesOff: vi.fn(),
    loadSFont: vi.fn().mockResolvedValue(0),
    closePlayer: vi.fn(),
    _mockSequencer: mockSeq, // Expose for tests
  };
};

// Types for test setup
type MockSynth = ReturnType<typeof createMockSynth>;
type MockSequencer = ReturnType<typeof createMockSequencer>;

// ============================================================================
// TEST FACTORIES
// ============================================================================

const createPlaybackNote = (overrides: Partial<PlaybackNote> = {}): PlaybackNote => ({
  pitch: 60,
  startTicks: 0,
  durationTicks: 480,
  velocity: 100,
  ...overrides,
});

const createConfig = (
  synth: MockSynth,
  overrides: Partial<MidiChannelPlayerConfig> = {}
): MidiChannelPlayerConfig => ({
  synth: synth as any,
  soundfontId: 0,
  channel: 0,
  bpm: 120,
  ppq: 480,
  ...overrides,
});

// ============================================================================
// TESTS
// ============================================================================

describe('MidiChannelPlayer', () => {
  let mockSynth: MockSynth;
  let mockSequencer: MockSequencer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSynth = createMockSynth();
    mockSequencer = mockSynth._mockSequencer;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  describe('initialization', () => {
    it('should initialize with sequencer and bank offset', async () => {
      const config = createConfig(mockSynth, { soundfontId: 2, channel: 3 });
      const player = new MidiChannelPlayer(config);

      await player.initialize();

      // Should create sequencer
      expect(mockSynth.createSequencer).toHaveBeenCalled();
      // Should register synth with sequencer
      expect(mockSequencer.registerSynthesizer).toHaveBeenCalledWith(mockSynth);
    });

    it('should set bank offset to sfontId * 100', async () => {
      const config = createConfig(mockSynth, { soundfontId: 3 });
      const player = new MidiChannelPlayer(config);

      await player.initialize();

      // Bank offset should be 3 * 100 = 300
      expect(mockSynth.setSFontBankOffset).toHaveBeenCalledWith(3, 300);
    });

    it('should select first available preset', async () => {
      const presets = [createMockPreset(0, 5), createMockPreset(0, 10)];
      mockSynth.getSFontObject.mockResolvedValue(createMockSoundFontObject(presets));

      const config = createConfig(mockSynth, { soundfontId: 1, channel: 2 });
      const player = new MidiChannelPlayer(config);

      await player.initialize();

      // Should select first preset (bankNum: 0, num: 5)
      // Bank with offset = 0 + (1 * 100) = 100
      expect(mockSynth.midiProgramSelect).toHaveBeenCalledWith(
        2, // channel
        1, // soundfontId
        100, // bankWithOffset
        5 // preset num
      );
    });

    it('should apply initial volume', async () => {
      const config = createConfig(mockSynth, { channel: 5 });
      const player = new MidiChannelPlayer(config);

      await player.initialize();

      // Should set CC7 (volume)
      expect(mockSynth.midiControl).toHaveBeenCalledWith(5, 7, expect.any(Number));
    });

    it('should apply time scale based on BPM and PPQ', async () => {
      const config = createConfig(mockSynth, { bpm: 120, ppq: 480 });
      const player = new MidiChannelPlayer(config);

      await player.initialize();

      // ticksPerSecond = (120 * 480) / 60 = 960
      expect(mockSequencer.setTimeScale).toHaveBeenCalledWith(960);
    });

    it('should warn when no presets found in soundfont', async () => {
      mockSynth.getSFontObject.mockResolvedValue(createMockSoundFontObject([]));
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const config = createConfig(mockSynth, { soundfontId: 1 });
      const player = new MidiChannelPlayer(config);

      await player.initialize();

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('No presets found')
      );

      consoleWarn.mockRestore();
    });

    it('should throw on failed preset enumeration', async () => {
      mockSynth.getSFontObject.mockRejectedValue(new Error('Failed to get soundfont'));

      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);

      await expect(player.initialize()).rejects.toThrow('Failed to get soundfont');
    });
  });

  // ==========================================================================
  // NOTE MANAGEMENT
  // ==========================================================================

  describe('note management', () => {
    it('should convert PlaybackNotes to sequencer events', async () => {
      const config = createConfig(mockSynth, { channel: 2 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      const notes: PlaybackNote[] = [
        createPlaybackNote({ pitch: 60, startTicks: 0, durationTicks: 480, velocity: 100 }),
        createPlaybackNote({ pitch: 64, startTicks: 480, durationTicks: 240, velocity: 80 }),
      ];

      player.setNotes(notes);

      // Notes should be stored - verify by playing
      await player.play(0);

      // Should schedule both notes
      expect(mockSequencer.sendEventAt).toHaveBeenCalledTimes(2);
      expect(mockSequencer.sendEventAt).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'note',
          channel: 2,
          key: 60,
          vel: 100,
          duration: 480,
        }),
        0,
        false
      );
      expect(mockSequencer.sendEventAt).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'note',
          channel: 2,
          key: 64,
          vel: 80,
          duration: 240,
        }),
        480,
        false
      );
    });

    it('should update events when notes change', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setNotes([createPlaybackNote({ pitch: 60 })]);
      player.setNotes([createPlaybackNote({ pitch: 72 })]); // Update

      await player.play(0);

      // Should schedule the updated note (pitch 72)
      const lastCall = (mockSequencer.sendEventAt as Mock).mock.calls.slice(-1)[0];
      expect(lastCall[0].key).toBe(72);
    });

    it('should log note count when updating notes during playback', async () => {
      const config = createConfig(mockSynth, { channel: 3 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      // Start playback first (logging only happens when playing)
      player.setNotes([createPlaybackNote()]);
      await player.play(0);

      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Update notes while playing
      player.setNotes([createPlaybackNote(), createPlaybackNote()]);

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Updated 2 notes')
      );

      consoleLog.mockRestore();
    });
  });

  // ==========================================================================
  // PLAYBACK CONTROLS
  // ==========================================================================

  describe('playback controls', () => {
    it('should schedule notes from position on play()', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setNotes([
        createPlaybackNote({ startTicks: 0 }),
        createPlaybackNote({ startTicks: 480 }),
        createPlaybackNote({ startTicks: 960 }),
      ]);

      await player.play(0);

      expect(mockSequencer.sendEventAt).toHaveBeenCalledTimes(3);
    });

    it('should skip notes before fromTick', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setNotes([
        createPlaybackNote({ startTicks: 0 }),
        createPlaybackNote({ startTicks: 480 }),
        createPlaybackNote({ startTicks: 960 }),
      ]);

      await player.play(600); // Start after first two notes

      // Only the third note should be scheduled
      expect(mockSequencer.sendEventAt).toHaveBeenCalledTimes(1);
    });

    it('should calculate relative ticks correctly', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setNotes([createPlaybackNote({ startTicks: 1000 })]);

      await player.play(400); // Start 400 ticks in

      // Note at tick 1000, playing from 400
      // Relative tick = 1000 - 400 = 600
      expect(mockSequencer.sendEventAt).toHaveBeenCalledWith(
        expect.any(Object),
        600, // Relative tick
        false
      );
    });

    it('should not play when muted', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setNotes([createPlaybackNote()]);
      player.setMute(true);

      await player.play(0);

      expect(mockSequencer.sendEventAt).not.toHaveBeenCalled();
    });

    it('should pause and silence notes', async () => {
      const config = createConfig(mockSynth, { channel: 3 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setNotes([createPlaybackNote()]);
      await player.play(0);

      player.pause();

      expect(mockSynth.midiAllNotesOff).toHaveBeenCalledWith(3);
      expect(mockSequencer.removeAllEvents).toHaveBeenCalled();
    });

    it('should stop and recreate sequencer', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setNotes([createPlaybackNote()]);
      await player.play(0);

      await player.stop();

      // Should close old sequencer
      expect(mockSequencer.close).toHaveBeenCalled();
      // Should create new sequencer
      expect(mockSynth.createSequencer).toHaveBeenCalledTimes(2);
    });

    it('should seek by recreating sequencer at new position', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setNotes([
        createPlaybackNote({ startTicks: 0 }),
        createPlaybackNote({ startTicks: 960 }),
      ]);

      await player.seek(500, true);

      // Should recreate sequencer
      expect(mockSequencer.close).toHaveBeenCalled();
      // Only second note (at tick 960) should be scheduled
      const sendEventCalls = (mockSequencer.sendEventAt as Mock).mock.calls;
      const lastCalls = sendEventCalls.slice(-1);
      expect(lastCalls[0][1]).toBe(460); // 960 - 500 = 460 relative ticks
    });

    it('should not schedule notes on seek when shouldContinuePlaying is false', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setNotes([createPlaybackNote({ startTicks: 960 })]);

      // Clear any previous calls
      (mockSequencer.sendEventAt as Mock).mockClear();

      await player.seek(500, false);

      expect(mockSequencer.sendEventAt).not.toHaveBeenCalled();
    });

    it('should recreate sequencer when position differs significantly', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      // First sequencer at tick 0
      mockSequencer.getTick.mockResolvedValue(0);

      player.setNotes([createPlaybackNote({ startTicks: 1000 })]);

      // Play from tick 500 (difference > 10)
      await player.play(500);

      // Should recreate sequencer due to position mismatch
      expect(mockSequencer.close).toHaveBeenCalled();
    });

    it('should not recreate sequencer when position is close', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      // Set sequencer tick close to desired position
      mockSequencer.getTick.mockResolvedValue(5);

      player.setNotes([createPlaybackNote({ startTicks: 0 })]);

      // Clear close call from initialization
      (mockSequencer.close as Mock).mockClear();

      // Play from tick 0 (difference of 5, within threshold)
      await player.play(0);

      // Should not recreate sequencer
      expect(mockSequencer.close).not.toHaveBeenCalled();
    });

    it('should log error when playing without initialized sequencer', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      // Don't initialize

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      await player.play(0);

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('Cannot play - sequencer not initialized')
      );

      consoleError.mockRestore();
    });
  });

  // ==========================================================================
  // MIXING CONTROLS
  // ==========================================================================

  describe('mixing controls', () => {
    it('should convert volume 0-100 to MIDI with dB curve', async () => {
      const config = createConfig(mockSynth, { channel: 1 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      // Clear initialization calls
      (mockSynth.midiControl as Mock).mockClear();

      player.setVolume(50);

      // At 50%: dB = -60 + (50/100) * 66 = -27dB
      // linear = 10^(-27/20) ≈ 0.0447
      // maxLinear = 10^(6/20) ≈ 1.995
      // midiVolume = (0.0447 / 1.995) * 127 ≈ 2.8 -> rounds to 3
      expect(mockSynth.midiControl).toHaveBeenCalledWith(1, 7, expect.any(Number));

      const [, , value] = (mockSynth.midiControl as Mock).mock.calls[0];
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(127);
    });

    it('should set volume to 0 when input is 0', async () => {
      const config = createConfig(mockSynth, { channel: 2 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      (mockSynth.midiControl as Mock).mockClear();

      player.setVolume(0);

      expect(mockSynth.midiControl).toHaveBeenCalledWith(2, 7, 0);
    });

    it('should set volume to 127 when input is 100', async () => {
      const config = createConfig(mockSynth, { channel: 3 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      (mockSynth.midiControl as Mock).mockClear();

      player.setVolume(100);

      expect(mockSynth.midiControl).toHaveBeenCalledWith(3, 7, 127);
    });

    it('should clamp volume to valid range', async () => {
      const config = createConfig(mockSynth, { channel: 4 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      (mockSynth.midiControl as Mock).mockClear();

      player.setVolume(150); // Over 100

      const [, , value] = (mockSynth.midiControl as Mock).mock.calls[0];
      expect(value).toBeLessThanOrEqual(127);

      player.setVolume(-10); // Under 0

      const [, , value2] = (mockSynth.midiControl as Mock).mock.calls[1];
      expect(value2).toBe(0);
    });

    it('should set volume to 0 when muted', async () => {
      const config = createConfig(mockSynth, { channel: 5 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      (mockSynth.midiControl as Mock).mockClear();

      player.setMute(true);

      expect(mockSynth.midiControl).toHaveBeenCalledWith(5, 7, 0);
    });

    it('should restore volume when unmuted', async () => {
      const config = createConfig(mockSynth, { channel: 6 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setVolume(80);
      player.setMute(true);
      (mockSynth.midiControl as Mock).mockClear();

      player.setMute(false);

      // Should restore previous volume (not 0)
      const [, , value] = (mockSynth.midiControl as Mock).mock.calls[0];
      expect(value).toBeGreaterThan(0);
    });

    it('should silence all notes when muting', async () => {
      const config = createConfig(mockSynth, { channel: 7 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setNotes([createPlaybackNote()]);
      await player.play(0);

      player.setMute(true);

      expect(mockSynth.midiAllNotesOff).toHaveBeenCalledWith(7);
    });

    it('should not silence notes when already muted', async () => {
      const config = createConfig(mockSynth, { channel: 8 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      player.setMute(true);
      (mockSynth.midiAllNotesOff as Mock).mockClear();

      player.setMute(true); // Already muted

      expect(mockSynth.midiAllNotesOff).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // TEMPO
  // ==========================================================================

  describe('tempo', () => {
    it('should update time scale when BPM changes', async () => {
      const config = createConfig(mockSynth, { bpm: 120, ppq: 480 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      (mockSequencer.setTimeScale as Mock).mockClear();

      player.setBpm(140);

      // ticksPerSecond = (140 * 480) / 60 = 1120
      expect(mockSequencer.setTimeScale).toHaveBeenCalledWith(1120);
    });

    it('should calculate ticksPerSecond correctly', async () => {
      const config = createConfig(mockSynth, { bpm: 60, ppq: 960 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      // At 60 BPM with 960 PPQ: (60 * 960) / 60 = 960
      expect(mockSequencer.setTimeScale).toHaveBeenCalledWith(960);
    });

    it('should ignore invalid BPM values', async () => {
      const config = createConfig(mockSynth, { bpm: 120, ppq: 480 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      (mockSequencer.setTimeScale as Mock).mockClear();
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      player.setBpm(0);
      player.setBpm(-10);

      expect(mockSequencer.setTimeScale).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledTimes(2);

      consoleWarn.mockRestore();
    });

    it('should not update time scale if sequencer not initialized', async () => {
      const config = createConfig(mockSynth, { bpm: 120 });
      const player = new MidiChannelPlayer(config);
      // Don't initialize

      player.setBpm(140);

      expect(mockSequencer.setTimeScale).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // DISPOSAL
  // ==========================================================================

  describe('disposal', () => {
    it('should silence and close sequencer on dispose', async () => {
      const config = createConfig(mockSynth, { channel: 10 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      await player.dispose();

      expect(mockSynth.midiAllNotesOff).toHaveBeenCalledWith(10);
      expect(mockSequencer.removeAllEvents).toHaveBeenCalled();
      expect(mockSequencer.close).toHaveBeenCalled();
    });

    it('should handle dispose when not initialized', async () => {
      const config = createConfig(mockSynth);
      const player = new MidiChannelPlayer(config);
      // Don't initialize

      // Should not throw
      await expect(player.dispose()).resolves.toBeUndefined();
    });

    it('should log disposal', async () => {
      const config = createConfig(mockSynth, { channel: 11 });
      const player = new MidiChannelPlayer(config);
      await player.initialize();

      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      await player.dispose();

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Disposed channel 11')
      );

      consoleLog.mockRestore();
    });
  });

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  describe('getters', () => {
    it('should return channel', async () => {
      const config = createConfig(mockSynth, { channel: 5 });
      const player = new MidiChannelPlayer(config);

      expect(player.getChannel()).toBe(5);
    });

    it('should return soundfontId', async () => {
      const config = createConfig(mockSynth, { soundfontId: 3 });
      const player = new MidiChannelPlayer(config);

      expect(player.getSoundfontId()).toBe(3);
    });
  });
});
