/**
 * Core export engine that coordinates rendering from all audio engines
 */

import * as Tone from 'tone';
import { 
  ExportOptions, 
  ExportProgress, 
  ExportProgressCallback, 
  RenderResult,
  ExportError,
  ExportErrorCode 
} from './types';
import { WavEncoder } from './wavEncoder';
import { CombinedTrack } from '../../../platform/types/project';
import { AudioTrack } from '../../../platform/types/dto/track_models/audio_track';
import { MidiTrack } from '../../../platform/types/dto/track_models/midi_track';
import { SamplerTrack } from '../../../platform/types/dto/track_models/sampler_track';
import AudioFilePlayer from '../audio-engine/audioFilePlayer/audioEngine';
import { MUSIC_CONSTANTS } from '../../constants/musicConstants';
import { BaseExportEngine } from './BaseExportEngine';
import { MidiExportEngineOffline } from './MidiExportEngineOffline';
import { SamplerExportEngine } from './SamplerExportEngine';

/**
 * Export engine for Tone.js audio tracks
 */
export class ToneExportEngine extends BaseExportEngine {
  private audioEngine: AudioFilePlayer;
  
  constructor(progressCallback?: ExportProgressCallback) {
    super(progressCallback);
    this.audioEngine = AudioFilePlayer.getInstance();
  }
  
  async renderTrack(track: CombinedTrack, options: ExportOptions): Promise<RenderResult> {
    if (track.track_type !== 'AUDIO') {
      throw new Error('ToneExportEngine can only render AUDIO tracks');
    }
    
    const audioTrack = this.audioEngine.getAllTracks().find(t => t.id === track.id);
    if (!audioTrack || !audioTrack.player || !audioTrack.player.buffer) {
      throw new ExportError(
        `Audio track ${track.id} not found or has no audio loaded`,
        ExportErrorCode.TRACK_RENDER_FAILED,
        track.id
      );
    }
    
    this.checkCancelled();
    
    // Calculate render duration
    const duration = options.endTime - options.startTime;
    
    try {
      // Use Tone.Offline for rendering
      const renderedBuffer = await Tone.Offline(async () => {
        // Create a new player for offline rendering
        const offlinePlayer = new Tone.Player({
          url: audioTrack.player!.buffer,
          loop: false
        });
        
        // Create channel for volume/pan
        const channel = new Tone.Channel({
          volume: audioTrack.channel.volume.value,
          pan: audioTrack.channel.pan.value
        }).toDestination();
        
        offlinePlayer.connect(channel);
        
        // Handle track positioning and trimming
        const trackStartTime = this.getTrackStartTime(track);
        let playbackStartTime = 0;
        let sourceStartOffset = 0;
        
        // Calculate when to start the player based on export start time
        if (trackStartTime < options.startTime) {
          // Track starts before export range, skip to correct position
          sourceStartOffset = options.startTime - trackStartTime;
        } else {
          // Track starts within export range
          playbackStartTime = trackStartTime - options.startTime;
        }
        
        // Apply trim settings if they exist
        if (audioTrack.trimStartTicks || audioTrack.trimEndTicks) {
          const trimStartSec = this.ticksToSeconds(audioTrack.trimStartTicks || 0);
          const trimEndSec = this.ticksToSeconds(audioTrack.trimEndTicks || this.getTrackDurationTicks(track));
          sourceStartOffset += trimStartSec;
        }
        
        // Start the player at the calculated time
        if (playbackStartTime < duration) {
          offlinePlayer.start(playbackStartTime, sourceStartOffset);
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
        `Failed to render audio track ${track.id}: ${error.message}`,
        ExportErrorCode.TRACK_RENDER_FAILED,
        track.id
      );
    }
  }
  
  private getTrackStartTime(track: CombinedTrack): number {
    // Convert track x position (in ticks) to seconds
    if (!track.instances || track.instances.length === 0) {
      return 0;
    }
    // For now, use the first instance
    const firstInstance = track.instances[0];
    return this.ticksToSeconds(firstInstance.x_position);
  }
  
  private ticksToSeconds(ticks: number): number {
    const ppq = MUSIC_CONSTANTS.pulsesPerQuarterNote;
    const bpm = Tone.Transport.bpm.value;
    const beats = ticks / ppq;
    const secondsPerBeat = 60 / bpm;
    return beats * secondsPerBeat;
  }
  
  private getTrackDurationTicks(track: CombinedTrack): number {
    // Default to track duration or a large value
    return track.duration_ticks || 999999;
  }
}

/**
 * Main export engine that coordinates all sub-engines
 */
export class ExportEngine {
  private toneEngine: ToneExportEngine;
  private midiEngine: MidiExportEngineOffline;
  private samplerEngine: SamplerExportEngine;
  private cancelled = false;
  private progressCallback?: ExportProgressCallback;
  
  constructor(progressCallback?: ExportProgressCallback) {
    this.progressCallback = progressCallback;
    this.toneEngine = new ToneExportEngine(progressCallback);
    this.midiEngine = new MidiExportEngineOffline(progressCallback);
    this.samplerEngine = new SamplerExportEngine(progressCallback);
  }
  
  cancel() {
    this.cancelled = true;
    this.toneEngine.cancel();
    this.midiEngine.cancel();
    this.samplerEngine.cancel();
  }
  
  async exportProject(
    tracks: CombinedTrack[],
    options: ExportOptions
  ): Promise<Blob> {
    this.cancelled = false;
    
    try {
      this.updateProgress({
        stage: 'preparing',
        percent: 0,
        message: 'Preparing export...'
      });
      
      // Filter tracks if specific ones requested
      const tracksToExport = options.tracks 
        ? tracks.filter(t => options.tracks!.includes(t.id))
        : tracks;
      
      if (tracksToExport.length === 0) {
        throw new Error('No tracks to export');
      }
      
      // Render each track
      const renderResults: RenderResult[] = [];
      let processedTracks = 0;
      
      for (const track of tracksToExport) {
        if (this.cancelled) {
          throw new ExportError('Export cancelled', ExportErrorCode.CANCELLED_BY_USER);
        }
        
        this.updateProgress({
          stage: 'rendering',
          percent: (processedTracks / tracksToExport.length) * 50,
          currentTrack: track.name,
          message: `Rendering track: ${track.name}`
        });
        
        try {
          let result: RenderResult;
          
          switch (track.track_type) {
            case 'AUDIO':
              result = await this.toneEngine.renderTrack(track, options);
              break;
              
            case 'MIDI':
              result = await this.midiEngine.renderTrack(track, options);
              break;
              
            case 'SAMPLER':
              result = await this.samplerEngine.renderTrack(track, options);
              break;
              
            case 'DRUM':
              // Drum tracks are containers, skip them
              // Their sampler tracks will be rendered separately
              console.log(`Skipping drum container track ${track.name}`);
              continue;
              
            default:
              console.warn(`Unknown track type: ${track.track_type}`);
              continue;
          }
          
          renderResults.push(result);
          processedTracks++;
          
        } catch (error) {
          console.error(`Failed to render track ${track.name}:`, error);
          if (error instanceof ExportError) {
            throw error;
          }
          // Continue with other tracks
        }
      }
      
      if (renderResults.length === 0) {
        throw new Error('No tracks were successfully rendered');
      }
      
      this.updateProgress({
        stage: 'encoding',
        percent: 75,
        message: 'Mixing and encoding audio...'
      });
      
      // Mix all rendered buffers
      const buffers = renderResults.map(r => r.audioBuffer);
      const mixedBuffer = buffers.length === 1 
        ? buffers[0]
        : WavEncoder.mixBuffers(buffers, options.sampleRate);
      
      // Apply normalization if requested
      const finalBuffer = options.normalize
        ? WavEncoder.normalize(mixedBuffer)
        : mixedBuffer;
      
      // Encode to WAV
      const wavBlob = WavEncoder.encodeWAV(finalBuffer, options.bitDepth || 16);
      
      this.updateProgress({
        stage: 'complete',
        percent: 100,
        message: 'Export complete!'
      });
      
      return wavBlob;
      
    } catch (error) {
      this.updateProgress({
        stage: 'error',
        percent: 0,
        message: error.message
      });
      throw error;
    }
  }
  
  private updateProgress(progress: ExportProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}