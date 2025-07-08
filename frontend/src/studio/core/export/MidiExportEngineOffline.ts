/**
 * Export engine for MIDI tracks using offline rendering with js-synthesizer
 */

import { Synthesizer } from 'js-synthesizer';
import { BaseExportEngine } from './BaseExportEngine';
import { 
  ExportOptions, 
  RenderResult,
  ExportError,
  ExportErrorCode 
} from './types';
import { CombinedTrack } from '../../../platform/types/project';
import { MUSIC_CONSTANTS } from '../../constants/musicConstants';
import { Note } from '../../../types/note';
import { db } from '../db/dexie-client';
import SoundfontManager from '../soundfont/soundfontManager';

export class MidiExportEngineOffline extends BaseExportEngine {
  /**
   * Render a MIDI track to audio using offline rendering
   */
  async renderTrack(track: CombinedTrack, options: ExportOptions): Promise<RenderResult> {
    if (track.track_type !== 'MIDI') {
      throw new Error('MidiExportEngineOffline can only render MIDI tracks');
    }
    
    this.checkCancelled();
    
    // Get MIDI notes
    const midiTrack = track.track as any;
    const notes: Note[] = midiTrack.notes || [];
    
    if (!notes.length) {
      console.warn(`MIDI track ${track.id} has no notes to render`);
      // Return silent buffer
      const duration = options.endTime - options.startTime;
      const audioBuffer = new AudioBuffer({
        numberOfChannels: 2,
        length: Math.floor(duration * options.sampleRate),
        sampleRate: options.sampleRate
      });
      return { audioBuffer, trackId: track.id, duration };
    }
    
    // Get soundfont data
    const instrumentId = midiTrack.instrument_id;
    if (!instrumentId) {
      throw new ExportError(
        `MIDI track ${track.id} has no instrument assigned`,
        ExportErrorCode.TRACK_RENDER_FAILED,
        track.id
      );
    }
    
    try {
      // Load soundfont from storage
      const soundfontManager = SoundfontManager.getInstance(db);
      const soundfontResult = await soundfontManager.getSoundfont(instrumentId);
      
      if (!soundfontResult || !soundfontResult.data) {
        throw new ExportError(
          `Failed to load soundfont for instrument ${instrumentId}`,
          ExportErrorCode.TRACK_RENDER_FAILED,
          track.id
        );
      }
      
      // Create synthesizer for offline rendering
      const synth = new Synthesizer();
      synth.init(options.sampleRate);
      
      // Use the ArrayBuffer directly
      const soundfontData = soundfontResult.data;
      
      // Load the soundfont
      const sfontId = await synth.loadSFont(soundfontData);
      
      // Set up the channel with the soundfont
      const channel = 0; // Use channel 0 for single track rendering
      await synth.setSFontBankOffset(sfontId, sfontId * 100);
      
      // Select the program (instrument)
      const bankOffset = sfontId * 100;
      await synth.midiProgramSelect(channel, sfontId, bankOffset, 0); // Select first preset
      
      // Apply track settings
      const volume = Math.round((track.volume || 80) * 127 / 100); // Convert to MIDI range 0-127
      await synth.midiControl(channel, 7, volume); // CC#7 is volume control
      
      // Set master gain
      const gain = (track.volume || 80) / 100;
      synth.setGain(gain);
      
      // Calculate timing
      const duration = options.endTime - options.startTime;
      const trackStartTime = this.getTrackStartTime(track);
      const bpm = options.bpm || 120;
      
      // Schedule all notes
      const scheduledNotes: Array<{time: number, note: number, velocity: number, duration: number}> = [];
      
      notes.forEach(note => {
        const noteStartTime = this.ticksToSeconds(note.column, bpm);
        const noteDuration = this.ticksToSeconds(note.length, bpm);
        
        // Check if note is within export range
        const absoluteNoteStart = trackStartTime + noteStartTime;
        if (absoluteNoteStart >= options.startTime && absoluteNoteStart < options.endTime) {
          const scheduledTime = absoluteNoteStart - options.startTime;
          
          scheduledNotes.push({
            time: scheduledTime,
            note: note.row, // MIDI note number
            velocity: note.velocity || 127, // MIDI velocity (0-127)
            duration: noteDuration
          });
        }
      });
      
      // Sort notes by time
      scheduledNotes.sort((a, b) => a.time - b.time);
      
      // Render the audio
      const totalFrames = Math.floor(duration * options.sampleRate);
      const framesPerChunk = 1024; // Process in chunks
      const leftChannel = new Float32Array(totalFrames);
      const rightChannel = new Float32Array(totalFrames);
      
      let currentFrame = 0;
      let noteIndex = 0;
      const activeNotes: Array<{note: number, endFrame: number}> = [];
      
      this.updateProgress({
        stage: 'rendering',
        percent: 0,
        currentTrack: track.name,
        message: `Rendering MIDI track: ${track.name}`
      });
      
      while (currentFrame < totalFrames) {
        this.checkCancelled();
        
        const chunkSize = Math.min(framesPerChunk, totalFrames - currentFrame);
        const leftChunk = new Float32Array(chunkSize);
        const rightChunk = new Float32Array(chunkSize);
        
        // Process notes for this chunk
        const currentTime = currentFrame / options.sampleRate;
        
        // Start new notes
        while (noteIndex < scheduledNotes.length && scheduledNotes[noteIndex].time <= currentTime) {
          const note = scheduledNotes[noteIndex];
          await synth.midiNoteOn(channel, note.note, note.velocity);
          
          const endFrame = Math.floor((note.time + note.duration) * options.sampleRate);
          activeNotes.push({ note: note.note, endFrame });
          
          noteIndex++;
        }
        
        // End finished notes
        for (let i = activeNotes.length - 1; i >= 0; i--) {
          if (currentFrame >= activeNotes[i].endFrame) {
            await synth.midiNoteOff(channel, activeNotes[i].note);
            activeNotes.splice(i, 1);
          }
        }
        
        // Render audio chunk
        synth.render([leftChunk, rightChunk]);
        
        // Copy to output buffers
        leftChannel.set(leftChunk, currentFrame);
        rightChannel.set(rightChunk, currentFrame);
        
        currentFrame += chunkSize;
        
        // Update progress
        const progress = (currentFrame / totalFrames) * 100;
        this.updateProgress({
          stage: 'rendering',
          percent: progress,
          currentTrack: track.name,
          message: `Rendering MIDI track: ${track.name} (${Math.floor(progress)}%)`
        });
      }
      
      // Stop any remaining notes
      for (const activeNote of activeNotes) {
        await synth.midiNoteOff(channel, activeNote.note);
      }
      
      // Create AudioBuffer from rendered data
      const audioBuffer = new AudioBuffer({
        numberOfChannels: 2,
        length: totalFrames,
        sampleRate: options.sampleRate
      });
      
      audioBuffer.copyToChannel(leftChannel, 0);
      audioBuffer.copyToChannel(rightChannel, 1);
      
      // Clean up
      synth.close();
      
      this.checkCancelled();
      
      return {
        audioBuffer,
        trackId: track.id,
        duration
      };
      
    } catch (error) {
      if (error instanceof ExportError) {
        throw error;
      }
      throw new ExportError(
        `Failed to render MIDI track ${track.id}: ${error.message}`,
        ExportErrorCode.TRACK_RENDER_FAILED,
        track.id
      );
    }
  }
  
  /**
   * Get track start time in seconds
   */
  private getTrackStartTime(track: CombinedTrack): number {
    if (!track.instances || track.instances.length === 0) {
      return 0;
    }
    const firstInstance = track.instances[0];
    return this.ticksToSeconds(firstInstance.x_position, 120); // Default BPM
  }
  
  /**
   * Convert ticks to seconds
   */
  private ticksToSeconds(ticks: number, bpm: number): number {
    const ppq = MUSIC_CONSTANTS.pulsesPerQuarterNote;
    const beats = ticks / ppq;
    const secondsPerBeat = 60 / bpm;
    return beats * secondsPerBeat;
  }
}