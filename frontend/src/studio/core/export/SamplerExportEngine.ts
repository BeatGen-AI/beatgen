/**
 * Export engine for Sampler tracks
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
import { db } from '../db/dexie-client';

export class SamplerExportEngine extends BaseExportEngine {
  /**
   * Render a sampler track to audio using offline rendering
   */
  async renderTrack(track: CombinedTrack, options: ExportOptions): Promise<RenderResult> {
    if (track.track_type !== 'SAMPLER') {
      throw new Error('SamplerExportEngine can only render SAMPLER tracks');
    }
    
    this.checkCancelled();
    
    // Get sampler track data
    const samplerTrack = track.track as any;
    const notes: Note[] = samplerTrack.notes || [];
    
    // Get audio file for the sampler
    const audioFile = await db.audioFiles.get(track.id);
    if (!audioFile || !audioFile.data) {
      throw new ExportError(
        `Sampler track ${track.id} has no audio file loaded`,
        ExportErrorCode.TRACK_RENDER_FAILED,
        track.id
      );
    }
    
    try {
      const duration = options.endTime - options.startTime;
      
      // Use Tone.Offline for rendering
      const renderedBuffer = await Tone.Offline(async () => {
        // Decode the audio file data to create a buffer
        const audioContext = Tone.context;
        const arrayBuffer = await audioFile.data.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Create a Tone buffer from the audio buffer
        const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
        
        // Create sampler with the buffer
        const sampler = new Tone.Sampler({
          urls: {
            [Tone.Frequency(samplerTrack.base_midi_note || 60, "midi").toNote()]: toneBuffer
          },
          baseUrl: '',
          onload: () => {
            console.log(`Sampler loaded for track ${track.id}`);
          }
        });
        
        // Create channel for volume/pan
        const channel = new Tone.Channel({
          volume: Tone.gainToDb(track.volume / 100),
          pan: track.pan / 100
        }).toDestination();
        
        sampler.connect(channel);
        
        // Calculate track positioning
        const trackStartTime = this.getTrackStartTime(track);
        
        // Schedule all notes
        if (notes.length > 0) {
          notes.forEach(note => {
            const noteStartTime = this.ticksToSeconds(note.column);
            const noteDuration = this.ticksToSeconds(note.length);
            
            // Check if note is within export range
            const absoluteNoteStart = trackStartTime + noteStartTime;
            if (absoluteNoteStart >= options.startTime && absoluteNoteStart < options.endTime) {
              const scheduledTime = absoluteNoteStart - options.startTime;
              
              // Trigger the sampler note
              sampler.triggerAttackRelease(
                Tone.Frequency(note.row, "midi").toNote(),
                noteDuration,
                scheduledTime,
                note.velocity / 127
              );
            }
          });
        } else {
          console.warn(`Sampler track ${track.id} has no notes to render`);
        }
        
      }, duration);
      
      this.checkCancelled();
      
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
        `Failed to render sampler track ${track.id}: ${error.message}`,
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