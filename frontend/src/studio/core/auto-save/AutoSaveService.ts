/**
 * Auto-Save Service
 * 
 * Handles automatic saving of project changes with intelligent timing and error handling.
 * Leverages the existing dirty tracking system to only save when necessary.
 */

import { CombinedTrack, Project } from '../../../platform/types/project';
import { saveProjectWithSounds, createProject, updateProject } from '../../../platform/api/projects';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutoSaveConfig {
  enabled: boolean;
  debounceMs: number;       // Wait time after last change before saving
  maxIntervalMs: number;    // Maximum time to wait before force-saving dirty tracks
  retryAttempts: number;    // Number of retry attempts on failure
  retryDelayMs: number;     // Base delay between retries (with exponential backoff)
}

export interface AutoSaveCallbacks {
  onStatusChange: (status: AutoSaveStatus, message?: string) => void;
  onSaveSuccess: (project: Project) => void;
  onSaveError: (error: any, willRetry: boolean) => void;
  getCurrentProjectState: () => {
    projectTitle: string;
    bpm: number;
    timeSignature: [number, number];
    keySignature: string;
    tracks: CombinedTrack[];
    projectId: string;
    userId: string;
  };
  markTracksAsClean: (trackIds: string[]) => void;
  updateProjectId: (projectId: string) => void; // Add callback to update project ID
  getTrackNotes: (trackId: string) => any[] | null; // Get current notes for a track
}

export class AutoSaveService {
  private config: AutoSaveConfig;
  private callbacks: AutoSaveCallbacks;
  private debounceTimer: NodeJS.Timeout | null = null;
  private maxIntervalTimer: NodeJS.Timeout | null = null;
  private status: AutoSaveStatus = 'idle';
  private retryCount = 0;
  private lastSaveTime = 0;
  private hasDirtyTracks = false;

  constructor(config: AutoSaveConfig, callbacks: AutoSaveCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /**
   * Initialize the auto-save service
   */
  start(): void {
    if (!this.config.enabled) return;
    
    console.log('AutoSaveService: Started with config', this.config);
    this.startMaxIntervalTimer();
  }

  /**
   * Stop the auto-save service and clear all timers
   */
  stop(): void {
    console.log('AutoSaveService: Stopped');
    this.clearDebounceTimer();
    this.clearMaxIntervalTimer();
    this.status = 'idle';
  }

  /**
   * Trigger auto-save after detecting changes
   * This should be called whenever tracks become dirty
   */
  onTracksChanged(): void {
    if (!this.config.enabled) return;

    this.hasDirtyTracks = true;
    
    // Reset debounce timer
    this.clearDebounceTimer();
    this.debounceTimer = setTimeout(() => {
      this.performSave('debounced');
    }, this.config.debounceMs);

    // Ensure max interval timer is running
    if (!this.maxIntervalTimer) {
      this.startMaxIntervalTimer();
    }
  }

  /**
   * Force an immediate save (bypasses debouncing)
   */
  async forceSave(): Promise<void> {
    this.clearDebounceTimer();
    await this.performSave('forced');
  }

  /**
   * Get current auto-save status
   */
  getStatus(): AutoSaveStatus {
    return this.status;
  }

  /**
   * Update auto-save configuration
   */
  updateConfig(newConfig: Partial<AutoSaveConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart timers with new config if service is running
    if (this.config.enabled) {
      this.stop();
      this.start();
    }
  }

  /**
   * Private: Start the maximum interval timer
   */
  private startMaxIntervalTimer(): void {
    this.clearMaxIntervalTimer();
    this.maxIntervalTimer = setTimeout(() => {
      if (this.hasDirtyTracks) {
        this.performSave('interval');
      }
      // Restart the timer for next interval
      this.startMaxIntervalTimer();
    }, this.config.maxIntervalMs);
  }

  /**
   * Private: Perform the actual save operation
   */
  private async performSave(trigger: 'debounced' | 'forced' | 'interval' | 'retry'): Promise<void> {
    if (this.status === 'saving') {
      console.log('AutoSaveService: Save already in progress, skipping');
      return;
    }

    try {
      this.setStatus('saving');
      console.log(`AutoSaveService: Starting save (trigger: ${trigger})`);
      
      const projectState = this.callbacks.getCurrentProjectState();
      
      // Check if we actually have dirty tracks
      const dirtyTracks = projectState.tracks.filter(track => track.dirty !== false);
      
      if (dirtyTracks.length === 0) {
        console.log('AutoSaveService: No dirty tracks to save');
        this.setStatus('saved', 'All changes saved');
        this.hasDirtyTracks = false;
        this.retryCount = 0;
        return;
      }

      // Prepare project data (similar to SaveProjectButton logic)
      const projectData = {
        name: projectState.projectTitle,
        bpm: projectState.bpm,
        time_signature_numerator: projectState.timeSignature[0],
        time_signature_denominator: projectState.timeSignature[1],
        key_signature: projectState.keySignature,
        user_id: projectState.userId
      };

      // Prepare tracks with MIDI notes (similar to SaveProjectButton logic)
      const preparedTracks = dirtyTracks.map(track => {
        const { dirty, ...trackWithoutDirty } = track;
        
        // For MIDI and sampler tracks, add current notes from the manager
        if (track.type === 'MIDI' || track.type === 'SAMPLER') {
          const midiNotes = this.callbacks.getTrackNotes(track.id) || [];
          
          // Add MIDI notes JSON to the track data
          if (trackWithoutDirty.track) {
            trackWithoutDirty.track = {
              ...trackWithoutDirty.track,
              midi_notes_json: { notes: midiNotes }
            };
          }
        }
        
        return trackWithoutDirty;
      });

      console.log(`AutoSaveService: Saving ${preparedTracks.length} dirty tracks`);

      let savedProject: Project;

      if (projectState.projectId) {
        // Update existing project - use saveProjectWithSounds to match manual save behavior
        savedProject = await saveProjectWithSounds(
          projectState.projectId,
          projectData,
          preparedTracks
        );
      } else {
        // Create new project
        const newProject = await createProject(projectData);
        
        if (preparedTracks.length > 0) {
          // If we have tracks, use saveProjectWithSounds
          savedProject = await saveProjectWithSounds(
            newProject.id,
            projectData,
            preparedTracks
          );
        } else {
          savedProject = newProject;
        }
        
        // Update the project ID for future saves
        this.callbacks.updateProjectId(savedProject.id);
      }

      // Mark tracks as clean
      const savedTrackIds = preparedTracks.map(track => track.id);
      this.callbacks.markTracksAsClean(savedTrackIds);

      // Update state
      this.hasDirtyTracks = false;
      this.lastSaveTime = Date.now();
      this.retryCount = 0;
      
      this.setStatus('saved', `Saved ${preparedTracks.length} tracks`);
      this.callbacks.onSaveSuccess(savedProject);

    } catch (error: any) {
      console.error('AutoSaveService: Save failed', error);
      await this.handleSaveError(error);
    }
  }

  /**
   * Private: Handle save errors with retry logic
   */
  private async handleSaveError(error: any): Promise<void> {
    const errorType = this.classifyError(error);
    const canRetry = this.retryCount < this.config.retryAttempts && this.shouldRetryError(errorType);
    
    this.callbacks.onSaveError(error, canRetry);

    if (canRetry) {
      this.retryCount++;
      const delay = this.config.retryDelayMs * Math.pow(2, this.retryCount - 1); // Exponential backoff
      
      console.log(`AutoSaveService: ${errorType} error, retrying save in ${delay}ms (attempt ${this.retryCount}/${this.config.retryAttempts})`);
      
      this.setStatus('saving', `Retrying save (${this.retryCount}/${this.config.retryAttempts})`);
      
      setTimeout(() => {
        this.performSave('retry');
      }, delay);
    } else {
      this.retryCount = 0;
      const errorMessage = this.getErrorMessage(errorType, error);
      this.setStatus('error', errorMessage);
      console.error('AutoSaveService: Max retries exceeded or non-retryable error:', errorType);
    }
  }

  /**
   * Private: Classify error types for better handling
   */
  private classifyError(error: any): 'network' | 'conflict' | 'auth' | 'unknown' {
    // Network/connection errors
    if (!navigator.onLine || 
        error.code === 'NETWORK_ERROR' || 
        error.message?.toLowerCase().includes('network') ||
        error.message?.toLowerCase().includes('fetch')) {
      return 'network';
    }

    // Conflict/constraint errors (409, integrity violations)
    if (error.status === 409 || 
        error.response?.status === 409 ||
        error.message?.toLowerCase().includes('constraint') ||
        error.message?.toLowerCase().includes('duplicate key') ||
        error.message?.toLowerCase().includes('integrity') ||
        error.message?.toLowerCase().includes('conflict')) {
      return 'conflict';
    }

    // Authentication errors
    if (error.status === 401 || 
        error.response?.status === 401 ||
        error.message?.toLowerCase().includes('unauthorized') ||
        error.message?.toLowerCase().includes('authentication')) {
      return 'auth';
    }

    return 'unknown';
  }

  /**
   * Private: Determine if an error type should be retried
   */
  private shouldRetryError(errorType: 'network' | 'conflict' | 'auth' | 'unknown'): boolean {
    switch (errorType) {
      case 'network':
      case 'conflict':
        return true; // These are typically temporary
      case 'auth':
        return false; // Don't retry auth errors - need user intervention
      case 'unknown':
        return true; // Give unknown errors a chance
      default:
        return false;
    }
  }

  /**
   * Private: Get user-friendly error message
   */
  private getErrorMessage(errorType: 'network' | 'conflict' | 'auth' | 'unknown', error: any): string {
    switch (errorType) {
      case 'network':
        return 'Network error - check connection';
      case 'conflict':
        return 'Save conflict - please refresh';
      case 'auth':
        return 'Authentication required';
      case 'unknown':
      default:
        return `Auto-save failed: ${error.message || 'Unknown error'}`;
    }
  }

  /**
   * Private: Set status and notify callbacks
   */
  private setStatus(status: AutoSaveStatus, message?: string): void {
    this.status = status;
    this.callbacks.onStatusChange(status, message);
  }

  /**
   * Private: Clear debounce timer
   */
  private clearDebounceTimer(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Private: Clear max interval timer
   */
  private clearMaxIntervalTimer(): void {
    if (this.maxIntervalTimer) {
      clearTimeout(this.maxIntervalTimer);
      this.maxIntervalTimer = null;
    }
  }
}

/**
 * Default auto-save configuration
 */
export const DEFAULT_AUTO_SAVE_CONFIG: AutoSaveConfig = {
  enabled: true,
  debounceMs: 2000,        // 2 seconds after last change
  maxIntervalMs: 30000,    // Force save every 30 seconds if dirty
  retryAttempts: 3,        // Retry up to 3 times
  retryDelayMs: 1000       // Start with 1 second delay
};