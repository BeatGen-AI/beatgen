/**
 * Export engine for MIDI tracks using Tone.js
 * This is a temporary solution until we can properly implement offline rendering for js-synthesizer
 */

import * as Tone from 'tone';
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

export class MidiExportEngineTone extends BaseExportEngine {
  /**
   * Render a MIDI track to audio using Tone.js synth as a fallback
   */
  async renderTrack(track: CombinedTrack, options: ExportOptions): Promise<RenderResult> {
    if (track.track_type !== 'MIDI') {
      throw new Error('MidiExportEngineTone can only render MIDI tracks');
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
    
    try {
      const duration = options.endTime - options.startTime;
      
      // Use Tone.Offline for rendering
      const renderedBuffer = await Tone.Offline(async () => {
        // Create a simple synth (as a placeholder for the actual soundfont)
        // In a real implementation, we'd load the actual soundfont instrument
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: {
            type: "sine"
          },
          envelope: {
            attack: 0.005,
            decay: 0.1,
            sustain: 0.3,
            release: 1
          }
        });
        
        // Create channel for volume/pan
        const channel = new Tone.Channel({
          volume: Tone.gainToDb((track.volume || 80) / 100),
          pan: (track.pan || 0) / 100
        }).toDestination();
        
        synth.connect(channel);
        
        // Calculate track positioning
        const trackStartTime = this.getTrackStartTime(track);
        
        // Schedule all notes
        notes.forEach(note => {
          const noteStartTime = this.ticksToSeconds(note.column);
          const noteDuration = this.ticksToSeconds(note.length);
          
          // Check if note is within export range
          const absoluteNoteStart = trackStartTime + noteStartTime;
          if (absoluteNoteStart >= options.startTime && absoluteNoteStart < options.endTime) {
            const scheduledTime = absoluteNoteStart - options.startTime;
            
            // Convert MIDI note to frequency
            const frequency = Tone.Frequency(note.row, "midi").toFrequency();
            
            // Trigger the synth note
            synth.triggerAttackRelease(
              frequency,
              noteDuration,
              scheduledTime,
              (note.velocity || 127) / 127
            );
          }
        });
        
      }, duration);
      
      this.checkCancelled();
      
      this.updateProgress({
        stage: 'rendering',
        percent: 100,
        currentTrack: track.name,
        message: `Rendered MIDI track: ${track.name} (using basic synth)`
      });
      
      return {
        audioBuffer: renderedBuffer.get() as AudioBuffer,
        trackId: track.id,
        duration: duration
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
    return this.ticksToSeconds(firstInstance.x_position);
  }
  
  /**
   * Convert ticks to seconds
   */
  private ticksToSeconds(ticks: number): number {
    const ppq = MUSIC_CONSTANTS.pulsesPerQuarterNote;
    const bpm = Tone.Transport.bpm.value;
    const beats = ticks / ppq;
    const secondsPerBeat = 60 / bpm;
    return beats * secondsPerBeat;
  }
}