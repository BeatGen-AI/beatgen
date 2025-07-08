/**
 * Export functionality type definitions
 */

export interface ExportOptions {
  format: 'wav' | 'mp3' | 'flac';
  sampleRate: 44100 | 48000 | 96000;
  bitDepth?: 16 | 24 | 32; // for WAV
  bitRate?: 128 | 192 | 256 | 320; // for MP3
  startTime: number; // in seconds
  endTime: number; // in seconds
  tracks?: string[]; // track IDs to export, if not provided exports all
  stems: boolean; // export individual tracks
  normalize: boolean;
  dither?: boolean; // for bit depth conversion
  bpm?: number; // BPM for MIDI rendering
}

export interface ExportProgress {
  stage: 'preparing' | 'rendering' | 'encoding' | 'complete' | 'error';
  percent: number;
  currentTrack?: string;
  message: string;
}

export type ExportProgressCallback = (progress: ExportProgress) => void;

export enum ExportErrorCode {
  MEMORY_EXCEEDED = 'MEMORY_EXCEEDED',
  INVALID_FORMAT = 'INVALID_FORMAT', 
  TRACK_RENDER_FAILED = 'TRACK_RENDER_FAILED',
  CONVERSION_FAILED = 'CONVERSION_FAILED',
  CANCELLED_BY_USER = 'CANCELLED_BY_USER',
  OFFLINE_CONTEXT_FAILED = 'OFFLINE_CONTEXT_FAILED'
}

export class ExportError extends Error {
  constructor(
    message: string,
    public code: ExportErrorCode,
    public trackId?: string
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

export interface RenderResult {
  audioBuffer: AudioBuffer;
  trackId?: string;
  duration: number;
}