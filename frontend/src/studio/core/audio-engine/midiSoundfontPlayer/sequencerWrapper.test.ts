import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SequencerWrapper } from './sequencerWrapper';
import { AudioWorkletNodeSynthesizer, ISequencer } from 'js-synthesizer';
import { Note } from '../../../../types/note';
import { MUSIC_CONSTANTS } from '../../../constants/musicConstants';

// Mock js-synthesizer
vi.mock('js-synthesizer');
vi.mock('@tonejs/midi');

// Mock implementations
const mockSequencer: any = {
  registerSynthesizer: vi.fn().mockResolvedValue(undefined),
  setTimeScale: vi.fn(),
  getTimeScale: vi.fn().mockResolvedValue(1000),
  getTick: vi.fn().mockResolvedValue(0),
  sendEventAt: vi.fn(),
  removeAllEvents: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  processSequencer: vi.fn()
};

const mockSynth: any = {
  createSequencer: vi.fn().mockResolvedValue(mockSequencer),
  setSFontBankOffset: vi.fn(),
  getSFontBankOffset: vi.fn().mockResolvedValue(100),
  midiProgramSelect: vi.fn(),
  midiControl: vi.fn(),
  midiAllNotesOff: vi.fn(),
  getSFontObject: vi.fn().mockResolvedValue({
    getPresetIterable: vi.fn().mockResolvedValue([
      { bank: 0, preset: 0, presetName: 'Piano' },
      { bank: 0, preset: 1, presetName: 'Bright Piano' }
    ])
  })
};

describe('SequencerWrapper', () => {
  let wrapper: SequencerWrapper;
  let mockSoundfont: ArrayBuffer;
  const defaultBPM = 120;
  const trackId = 'test-track';
  const channel = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSoundfont = new ArrayBuffer(1024);
  });

  afterEach(async () => {
    if (wrapper) {
      await wrapper.dispose();
    }
  });

  describe('Initialization', () => {
    it('should initialize with basic parameters', async () => {
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM);
      await wrapper.initialize(mockSynth, mockSoundfont);

      expect(wrapper.getTrackId()).toBe(trackId);
      expect(wrapper.getChannel()).toBe(channel);
      expect(mockSynth.createSequencer).toHaveBeenCalled();
      expect(mockSequencer.registerSynthesizer).toHaveBeenCalledWith(mockSynth, 0);
    });

    it('should handle offset during initialization', async () => {
      const offset = 1000;
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM, { offset });
      await wrapper.initialize(mockSynth, mockSoundfont);

      expect(wrapper.getOffset()).toBe(offset);
    });

    it('should handle initialization errors', async () => {
      mockSynth.createSequencer.mockRejectedValueOnce(new Error('Sequencer creation failed'));
      
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM);
      
      await expect(wrapper.initialize(mockSynth, mockSoundfont))
        .rejects.toThrow('Sequencer creation failed');
    });
  });

  describe('Note Management', () => {
    beforeEach(async () => {
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM);
      await wrapper.initialize(mockSynth, mockSoundfont);
    });

    it('should add notes to sequencer', async () => {
      const notes: Note[] = [
        {
          id: '1',
          pitch: 60,
          velocity: 80,
          tickOn: 0,
          tickOff: 480,
          trackId
        },
        {
          id: '2',
          pitch: 64,
          velocity: 70,
          tickOn: 480,
          tickOff: 960,
          trackId
        }
      ];

      await wrapper.setNotes(notes);

      // Should send note on and off events
      expect(mockSequencer.sendEventAt).toHaveBeenCalledTimes(4);
      expect(mockSequencer.sendEventAt).toHaveBeenCalledWith(
        expect.objectContaining({ type: 0x90 }), // Note on
        0,
        false
      );
      expect(mockSequencer.sendEventAt).toHaveBeenCalledWith(
        expect.objectContaining({ type: 0x80 }), // Note off
        480,
        false
      );
    });

    it('should clear existing notes before adding new ones', async () => {
      const notes: Note[] = [{
        id: '1',
        pitch: 60,
        velocity: 80,
        tickOn: 0,
        tickOff: 480,
        trackId
      }];

      await wrapper.setNotes(notes);
      await wrapper.setNotes(notes);

      expect(mockSequencer.removeAllEvents).toHaveBeenCalledTimes(2);
    });

    it('should handle empty note array', async () => {
      await wrapper.setNotes([]);
      
      expect(mockSequencer.removeAllEvents).toHaveBeenCalled();
      expect(mockSequencer.sendEventAt).not.toHaveBeenCalled();
    });

    it('should apply offset to note timings', async () => {
      const offset = 1000;
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM, { offset });
      await wrapper.initialize(mockSynth, mockSoundfont);

      const notes: Note[] = [{
        id: '1',
        pitch: 60,
        velocity: 80,
        tickOn: 0,
        tickOff: 480,
        trackId
      }];

      await wrapper.setNotes(notes);

      // With offset, note should start at tick 1000
      expect(mockSequencer.sendEventAt).toHaveBeenCalledWith(
        expect.objectContaining({ type: 0x90 }),
        1000,
        false
      );
    });
  });

  describe('Volume Control', () => {
    beforeEach(async () => {
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM);
      await wrapper.initialize(mockSynth, mockSoundfont);
    });

    it('should set volume', () => {
      wrapper.setVolume(85);
      
      expect(mockSynth.midiControl).toHaveBeenCalledWith(
        channel,
        7, // Volume control
        85,
        0
      );
    });

    it('should clamp volume to valid range', () => {
      wrapper.setVolume(150);
      expect(mockSynth.midiControl).toHaveBeenCalledWith(channel, 7, 127, 0);

      wrapper.setVolume(-10);
      expect(mockSynth.midiControl).toHaveBeenCalledWith(channel, 7, 0, 0);
    });
  });

  describe('Mute Control', () => {
    beforeEach(async () => {
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM, { volume: 100 });
      await wrapper.initialize(mockSynth, mockSoundfont);
    });

    it('should mute track', () => {
      wrapper.setMute(true);
      
      expect(wrapper.isMuted()).toBe(true);
      expect(mockSynth.midiControl).toHaveBeenCalledWith(channel, 7, 0, 0);
    });

    it('should unmute track and restore volume', () => {
      wrapper.setMute(true);
      wrapper.setMute(false);
      
      expect(wrapper.isMuted()).toBe(false);
      expect(mockSynth.midiControl).toHaveBeenLastCalledWith(channel, 7, 100, 0);
    });
  });

  describe('BPM Changes', () => {
    beforeEach(async () => {
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM);
      await wrapper.initialize(mockSynth, mockSoundfont);
    });

    it('should update time scale when BPM changes', async () => {
      const newBPM = 140;
      await wrapper.setBPM(newBPM);

      const expectedTimeScale = (1000 * 60) / (newBPM * MUSIC_CONSTANTS.TICKS_PER_BEAT);
      expect(mockSequencer.setTimeScale).toHaveBeenCalledWith(expectedTimeScale);
    });

    it('should handle invalid BPM values', async () => {
      await wrapper.setBPM(0);
      expect(mockSequencer.setTimeScale).not.toHaveBeenCalled();

      await wrapper.setBPM(-120);
      expect(mockSequencer.setTimeScale).not.toHaveBeenCalled();
    });
  });

  describe('Playback Position', () => {
    beforeEach(async () => {
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM);
      await wrapper.initialize(mockSynth, mockSoundfont);
    });

    it('should get current tick', async () => {
      mockSequencer.getTick.mockResolvedValueOnce(1920);
      
      const tick = await wrapper.getCurrentTick();
      expect(tick).toBe(1920);
    });

    it('should handle sequencer errors when getting tick', async () => {
      mockSequencer.getTick.mockRejectedValueOnce(new Error('Sequencer error'));
      
      const tick = await wrapper.getCurrentTick();
      expect(tick).toBe(0);
    });
  });

  describe('Soundfont Management', () => {
    beforeEach(async () => {
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM);
      await wrapper.initialize(mockSynth, mockSoundfont);
    });

    it('should update soundfont', async () => {
      const newSoundfont = new ArrayBuffer(2048);
      const bankOffset = 50;
      
      await wrapper.updateSoundfont(newSoundfont, bankOffset);
      
      expect(mockSynth.setSFontBankOffset).toHaveBeenCalledWith(0, bankOffset);
    });

    it('should use default bank offset', async () => {
      const newSoundfont = new ArrayBuffer(2048);
      
      await wrapper.updateSoundfont(newSoundfont);
      
      expect(mockSynth.setSFontBankOffset).toHaveBeenCalledWith(0, 100);
    });
  });

  describe('Program Change', () => {
    beforeEach(async () => {
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM);
      await wrapper.initialize(mockSynth, mockSoundfont);
    });

    it('should change program', () => {
      const program = 42;
      wrapper.setProgram(program);
      
      expect(mockSynth.midiProgramSelect).toHaveBeenCalledWith(
        channel,
        0,
        0,
        program,
        0
      );
    });
  });

  describe('Disposal', () => {
    beforeEach(async () => {
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM);
      await wrapper.initialize(mockSynth, mockSoundfont);
    });

    it('should dispose resources', async () => {
      await wrapper.dispose();
      
      expect(mockSynth.midiAllNotesOff).toHaveBeenCalledWith(channel, 0);
      expect(mockSequencer.close).toHaveBeenCalled();
    });

    it('should handle disposal errors gracefully', async () => {
      mockSequencer.close.mockRejectedValueOnce(new Error('Close failed'));
      
      // Should not throw
      await expect(wrapper.dispose()).resolves.toBeUndefined();
    });

    it('should handle multiple disposals', async () => {
      await wrapper.dispose();
      await wrapper.dispose();
      
      // Should only call close once
      expect(mockSequencer.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle initialization without soundfont', async () => {
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM);
      await wrapper.initialize(mockSynth, undefined);
      
      expect(mockSequencer.registerSynthesizer).toHaveBeenCalled();
    });

    it('should handle notes with invalid timing', async () => {
      wrapper = new SequencerWrapper(trackId, channel, defaultBPM);
      await wrapper.initialize(mockSynth, mockSoundfont);
      
      const notes: Note[] = [
        {
          id: '1',
          pitch: 60,
          velocity: 80,
          tickOn: 1000,
          tickOff: 500, // End before start
          trackId
        }
      ];
      
      await wrapper.setNotes(notes);
      
      // Should still send events (validation happens elsewhere)
      expect(mockSequencer.sendEventAt).toHaveBeenCalled();
    });

    it('should handle channel 9 (drums) differently', async () => {
      wrapper = new SequencerWrapper(trackId, 9, defaultBPM);
      await wrapper.initialize(mockSynth, mockSoundfont);
      
      // Drums channel might have different behavior
      expect(wrapper.getChannel()).toBe(9);
    });
  });
});