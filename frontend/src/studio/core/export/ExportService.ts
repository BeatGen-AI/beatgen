/**
 * High-level export service that provides a clean API for the UI
 */

import { ExportEngine } from './ExportEngine';
import { ExportOptions, ExportProgress, ExportProgressCallback } from './types';
import { CombinedTrack } from '../../../platform/types/project';

export class ExportService {
  private exportEngine: ExportEngine | null = null;
  private currentExport: Promise<Blob> | null = null;
  
  /**
   * Export project to WAV format
   */
  async exportToWAV(
    tracks: CombinedTrack[],
    options: Omit<ExportOptions, 'format' | 'bitDepth'> & { bitDepth?: 16 | 24 | 32 },
    progressCallback?: ExportProgressCallback
  ): Promise<Blob> {
    const exportOptions: ExportOptions = {
      ...options,
      format: 'wav',
      bitDepth: options.bitDepth || 16
    };
    
    return this.export(tracks, exportOptions, progressCallback);
  }
  
  /**
   * Export a single track
   */
  async exportSingleTrack(
    track: CombinedTrack,
    options: Omit<ExportOptions, 'tracks'>,
    progressCallback?: ExportProgressCallback
  ): Promise<Blob> {
    const exportOptions: ExportOptions = {
      ...options,
      tracks: [track.id],
      stems: false
    };
    
    return this.export([track], exportOptions, progressCallback);
  }
  
  /**
   * Export individual stems (one file per track)
   */
  async exportStems(
    tracks: CombinedTrack[],
    options: Omit<ExportOptions, 'stems'>,
    progressCallback?: ExportProgressCallback
  ): Promise<Map<string, Blob>> {
    const stems = new Map<string, Blob>();
    
    for (const track of tracks) {
      try {
        const blob = await this.exportSingleTrack(
          track,
          { ...options, stems: false },
          (progress) => {
            if (progressCallback) {
              progressCallback({
                ...progress,
                message: `Exporting stem: ${track.name} - ${progress.message}`
              });
            }
          }
        );
        
        stems.set(track.id, blob);
      } catch (error) {
        console.error(`Failed to export stem for track ${track.name}:`, error);
      }
    }
    
    return stems;
  }
  
  /**
   * Cancel current export
   */
  cancel() {
    if (this.exportEngine) {
      this.exportEngine.cancel();
    }
  }
  
  /**
   * Check if export is in progress
   */
  isExporting(): boolean {
    return this.currentExport !== null;
  }
  
  /**
   * Main export method
   */
  private async export(
    tracks: CombinedTrack[],
    options: ExportOptions,
    progressCallback?: ExportProgressCallback
  ): Promise<Blob> {
    if (this.currentExport) {
      throw new Error('Export already in progress');
    }
    
    try {
      this.exportEngine = new ExportEngine(progressCallback);
      
      this.currentExport = this.exportEngine.exportProject(tracks, options);
      const result = await this.currentExport;
      
      return result;
    } finally {
      this.currentExport = null;
      this.exportEngine = null;
    }
  }
  
  /**
   * Generate a filename for the export
   */
  static generateFilename(projectName: string, format: string, stem?: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const baseName = projectName || 'untitled';
    const stemSuffix = stem ? `_${stem}` : '';
    
    return `${baseName}${stemSuffix}_${timestamp}.${format}`;
  }
  
  /**
   * Download a blob as a file
   */
  static downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}