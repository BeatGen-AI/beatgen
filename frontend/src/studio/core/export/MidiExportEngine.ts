/**
 * Export engine for MIDI tracks using soundfonts
 */

import { BaseExportEngine } from './BaseExportEngine';
import { 
  ExportOptions, 
  RenderResult,
  ExportError,
  ExportErrorCode 
} from './types';
import { CombinedTrack } from '../../../platform/types/project';
import { MUSIC_CONSTANTS } from '../../constants/musicConstants';
import { MidiSoundfontPlayer } from '../audio-engine/midiSoundfontPlayer/midiSoundfontPlayer';
import { Note } from '../../../types/note';
import { db } from '../db/dexie-client';
import SampleManager from '../samples/sampleManager';

export class MidiExportEngine extends BaseExportEngine {
  /**
   * Render a MIDI track to audio using offline rendering
   */
  async renderTrack(track: CombinedTrack, options: ExportOptions): Promise<RenderResult> {
    if (track.track_type !== 'MIDI') {
      throw new Error('MidiExportEngine can only render MIDI tracks');
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
      const sampleManager = SampleManager.getInstance(db);
      const soundfontBlob = await sampleManager.getSampleBlob(
        instrumentId,
        midiTrack.instrument_storage_key,
        'soundfont',
        midiTrack.instrument_name
      );
      
      if (!soundfontBlob) {
        throw new ExportError(
          `Failed to load soundfont for instrument ${instrumentId}`,
          ExportErrorCode.TRACK_RENDER_FAILED,
          track.id
        );
      }
      
      // Create offline audio context
      const duration = options.endTime - options.startTime;
      const offlineContext = new OfflineAudioContext(
        2, // stereo
        Math.floor(duration * options.sampleRate),
        options.sampleRate
      );
      
      // Create and initialize MIDI player
      const midiPlayer = new MidiSoundfontPlayer();
      await midiPlayer.initSynthesizer(offlineContext);
      
      // Convert Blob to ArrayBuffer
      const soundfontData = await soundfontBlob.data.arrayBuffer();
      
      // Load the track with soundfont
      await midiPlayer.addTrack(track.id, notes, soundfontData, {
        volume: track.volume || 80,
        startTimeOffset: 0
      });
      
      // Apply track settings
      midiPlayer.setTrackVolume(track.id, track.volume || 80);
      if (track.mute) {
        midiPlayer.muteTrack(track.id, true);
      }
      
      // Calculate track start time and handle positioning
      const trackStartTime = this.getTrackStartTime(track);
      
      // Adjust notes timing based on export range
      const adjustedNotes = this.adjustNotesForExportRange(
        notes, 
        trackStartTime, 
        options.startTime, 
        options.endTime
      );
      
      // Start rendering
      this.updateProgress({
        stage: 'rendering',
        percent: 0,
        currentTrack: track.name,
        message: `Rendering MIDI track: ${track.name}`
      });
      
      // Schedule all MIDI events in the offline context
      await this.scheduleMidiEvents(
        midiPlayer,
        track.id,
        adjustedNotes,
        offlineContext,
        options
      );
      
      // Render the audio
      const renderedBuffer = await offlineContext.startRendering();
      
      // Clean up
      midiPlayer.dispose();
      
      this.checkCancelled();
      
      return {
        audioBuffer: renderedBuffer,
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
    const bpm = 120; // TODO: Get from store/options
    const beats = ticks / ppq;
    const secondsPerBeat = 60 / bpm;
    return beats * secondsPerBeat;
  }
  
  /**
   * Adjust note timings for the export range
   */
  private adjustNotesForExportRange(
    notes: Note[], 
    trackStartTime: number,
    exportStartTime: number,
    exportEndTime: number
  ): Note[] {
    return notes
      .map(note => {
        // Convert note time to absolute time
        const noteStartTime = trackStartTime + this.ticksToSeconds(note.column);
        const noteEndTime = noteStartTime + this.ticksToSeconds(note.length);
        
        // Check if note is within export range
        if (noteEndTime < exportStartTime || noteStartTime > exportEndTime) {
          return null;
        }
        
        // Adjust note timing relative to export start
        const adjustedStartTime = Math.max(0, noteStartTime - exportStartTime);
        const adjustedEndTime = Math.min(exportEndTime - exportStartTime, noteEndTime - exportStartTime);
        
        return {
          ...note,
          column: Math.floor(adjustedStartTime * MUSIC_CONSTANTS.pulsesPerQuarterNote * 2), // Convert back to ticks
          length: Math.floor((adjustedEndTime - adjustedStartTime) * MUSIC_CONSTANTS.pulsesPerQuarterNote * 2)
        };
      })
      .filter(Boolean) as Note[];
  }
  
  /**
   * Schedule MIDI events in the offline context
   */
  private async scheduleMidiEvents(
    midiPlayer: MidiSoundfontPlayer,
    trackId: string,
    notes: Note[],
    context: OfflineAudioContext,
    options: ExportOptions
  ): Promise<void> {
    // The MidiSoundfontPlayer uses js-synthesizer which handles its own scheduling
    // For offline rendering, we need to manually trigger the rendering process
    
    // Start the MIDI player
    await midiPlayer.play();
    
    // Let the synthesizer process all events
    // The offline context will automatically render all scheduled events
  }
}