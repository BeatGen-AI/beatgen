/**
 * Example test file demonstrating the usage of audio test utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Setup utilities
  setupAudioTest,
  withAudioContext,
  withTimingControl,
  
  // Audio mocks
  createMockAudioContext,
  MockAudioContext,
  
  // MIDI data generators
  createTestNote,
  createTestNotes,
  createTestMidiTrack,
  MIDI_TEST_PATTERNS,
  convertGridNotesToMidi,
  
  // Audio file utilities
  createValidWavFile,
  simulateAudioFileLoad,
  
  // Time utilities
  TransportTimeHelper,
  
  // Assertions
  expectNote,
  expectAudioBuffer,
  expectMidiNoteTiming,
  expectVelocity,
  expectTiming,
  
  // Factories
  createTestProject,
  createTestTrack,
  createMockToneInstrument,
} from './index';

describe('Audio Test Utilities Examples', () => {
  let cleanup: () => void;

  beforeEach(() => {
    const setup = setupAudioTest();
    cleanup = setup.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe('Basic Audio Context Tests', () => {
    it('should create and use mock audio context', async () => {
      const context = createMockAudioContext({ 
        state: 'suspended',
        sampleRate: 48000 
      });

      expect(context.state).toBe('suspended');
      expect(context.sampleRate).toBe(48000);

      // Test resuming context
      await context.resume();
      expect(context.state).toBe('running');

      // Test creating nodes
      const gain = context.createGain();
      expect(gain.gain.value).toBe(1);

      const oscillator = context.createOscillator();
      expect(oscillator.frequency.value).toBe(440);
    });

    it('should use withAudioContext helper', async () => {
      await withAudioContext(async (context) => {
        const buffer = context.createBuffer(2, 44100, 44100);
        
        expectAudioBuffer(buffer).toHaveProperties({
          numberOfChannels: 2,
          duration: 1,
          sampleRate: 44100,
        });
      });
    });
  });

  describe('MIDI Note Generation', () => {
    it('should create various note patterns', () => {
      // Single note
      const note = createTestNote({ row: 60, velocity: 100 });
      expectNote(note).toMatchNote({ row: 60, velocity: 100 });

      // Scale pattern
      const scale = createTestNotes({
        count: 8,
        pattern: 'scale',
        startRow: 60,
        rowInterval: 2, // Whole tone scale
      });
      expect(scale).toHaveLength(8);
      expect(scale[0].row).toBe(60);
      expect(scale[7].row).toBe(74);

      // Chord pattern
      const chord = createTestNotes({
        count: 3,
        pattern: 'chord',
        startColumn: 0,
      });
      expect(chord[0].row).toBe(60); // C
      expect(chord[1].row).toBe(64); // E
      expect(chord[2].row).toBe(67); // G

      // Custom pattern
      const drumPattern = createTestNotes({
        pattern: 'custom',
        customPattern: MIDI_TEST_PATTERNS.BASIC_DRUM_PATTERN,
        count: 8,
      });
      expect(drumPattern[0].row).toBe(36); // Kick
      expect(drumPattern[1].row).toBe(38); // Snare
      expect(drumPattern[2].row).toBe(42); // Hi-hat
    });

    it('should convert grid notes to MIDI timing', () => {
      const gridNotes = createTestNotes({
        count: 4,
        startColumn: 0,
        columnInterval: 4,
      });

      const midiNotes = convertGridNotesToMidi(gridNotes, 120, 16);
      
      expectMidiNoteTiming(midiNotes[0]).toStartAt(0);
      expectMidiNoteTiming(midiNotes[1]).toStartAt(0.5); // 4 sixteenths = 1 beat = 0.5s at 120 BPM
      expectMidiNoteTiming(midiNotes[2]).toStartAt(1.0);
      expectMidiNoteTiming(midiNotes[3]).toStartAt(1.5);
    });
  });

  describe('Audio File Testing', () => {
    it('should create valid WAV files', async () => {
      const wavFile = createValidWavFile({
        duration: 2,
        sampleRate: 44100,
        frequency: 440,
        channels: 2,
      });

      expect(wavFile.name).toBe('test.wav');
      expect(wavFile.type).toBe('audio/wav');
      
      // The file should have valid WAV data
      const arrayBuffer = await wavFile.arrayBuffer();
      const view = new DataView(arrayBuffer);
      
      // Check RIFF header
      const riff = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
      );
      expect(riff).toBe('RIFF');
    });

    it('should simulate file loading with progress', async () => {
      const file = createValidWavFile({ duration: 1 });
      const progressValues: number[] = [];

      await simulateAudioFileLoad(file, {
        onProgress: (progress) => progressValues.push(progress),
        delay: 50,
      });

      expect(progressValues).toContain(20);
      expect(progressValues).toContain(40);
      expect(progressValues).toContain(60);
      expect(progressValues).toContain(80);
      expect(progressValues).toContain(100);
    });
  });

  describe('Timing Control', () => {
    it('should control time flow in tests', async () => {
      await withTimingControl(async (timer) => {
        let callbackCount = 0;
        
        // Schedule multiple callbacks
        timer.scheduleAfter(100, () => callbackCount++);
        timer.scheduleAfter(200, () => callbackCount++);
        timer.scheduleAfter(300, () => callbackCount++);

        expect(callbackCount).toBe(0);

        // Advance time
        timer.advance(150);
        expect(callbackCount).toBe(1);

        timer.advance(100);
        expect(callbackCount).toBe(2);

        timer.advance(100);
        expect(callbackCount).toBe(3);
      });
    });

    it('should work with musical time', () => {
      const transport = new TransportTimeHelper(120, [4, 4]);

      // Test conversions
      expect(transport.beatsToSeconds(1)).toBe(0.5);
      expect(transport.beatsToSeconds(4)).toBe(2);
      expect(transport.barsToSeconds(1)).toBe(2);
      
      expect(transport.notationToSeconds('0:0:0')).toBe(0);
      expect(transport.notationToSeconds('1:0:0')).toBe(2);
      expect(transport.notationToSeconds('0:2:0')).toBe(1);
      expect(transport.notationToSeconds('0:0:8')).toBe(1); // 8 sixteenths = 2 beats

      // Test grid positions
      expect(transport.secondsToGridPosition(0.5)).toBe(4); // 1 beat = 4 sixteenths
      expect(transport.gridPositionToSeconds(16)).toBe(2); // 16 sixteenths = 4 beats = 2 seconds
    });
  });

  describe('Custom Assertions', () => {
    it('should use note assertions', () => {
      const notes = createTestNotes({ count: 5 });
      
      // Check individual note properties
      notes.forEach(note => {
        expectNote(note).toBeWithinRange(0, 127, 'row');
        expectVelocity(note.velocity).toBeValid();
      });

      // Check note ordering
      //expectNotesInOrder(notes, 'column');
    });

    it('should use timing assertions', () => {
      const time = 2.001;
      
      expectTiming(time).toBeWithinMs(2000, 5);
      expectTiming(time).toBeOnBeat(120, 4, 0.01);
      expectTiming(0.5).toBeQuantizedTo(16, 120);
    });

    it('should validate MIDI velocity ranges', () => {
      expectVelocity(10).toBeInDynamicRange('ppp');
      expectVelocity(40).toBeInDynamicRange('p');
      expectVelocity(70).toBeInDynamicRange('mf');
      expectVelocity(100).toBeInDynamicRange('ff');
      expectVelocity(120).toBeInDynamicRange('fff');
    });
  });

  describe('Complex Test Scenarios', () => {
    it('should create complete project structure', () => {
      const project = createTestProject({
        name: 'Test Song',
        bpm: 140,
        tracks: [
          createTestTrack({
            name: 'Lead Synth',
            type: 'midi',
            instrumentId: 'synth-lead',
            notes: createTestNotes({
              pattern: 'arpeggio',
              count: 16,
            }),
          }),
          createTestTrack({
            name: 'Bass',
            type: 'midi',
            instrumentId: 'synth-bass',
            notes: createTestNotes({
              customPattern: MIDI_TEST_PATTERNS.BASS_LINE,
              pattern: 'custom',
              count: 8,
            }),
          }),
          createTestTrack({
            name: 'Drums',
            type: 'drum',
            notes: createTestNotes({
              customPattern: MIDI_TEST_PATTERNS.BASIC_DRUM_PATTERN,
              pattern: 'custom',
              count: 16,
            }),
          }),
        ],
      });

      expect(project.tracks).toHaveLength(3);
      expect(project.tracks[0].notes).toHaveLength(16);
      expect(project.tracks[1].notes).toHaveLength(8);
      expect(project.tracks[2].type).toBe('drum');
    });

    it('should mock Tone.js instruments', () => {
      const instrument = createMockToneInstrument();
      
      // Test basic functionality
      instrument.triggerAttackRelease('C4', '8n');
      expect(instrument.triggerAttackRelease).toHaveBeenCalledWith('C4', '8n');

      // Test chaining
      const result = instrument.connect({}).toDestination();
      expect(result).toBe(instrument);
      expect(instrument.connect).toHaveBeenCalled();
      expect(instrument.toDestination).toHaveBeenCalled();
    });
  });

  describe('Performance Testing Example', () => {
    it('should process audio data efficiently', async () => {
      await withAudioContext(async (context) => {
        const startTime = performance.now();
        
        // Create and process multiple buffers
        const buffers = Array.from({ length: 10 }, () => 
          context.createBuffer(2, 44100, 44100)
        );
        
        // Simulate processing
        buffers.forEach(buffer => {
          expectAudioBuffer(buffer).toHaveProperties({
            numberOfChannels: 2,
            duration: 1,
          });
        });
        
        const duration = performance.now() - startTime;
        expect(duration).toBeLessThan(100); // Should be fast
      });
    });
  });
});