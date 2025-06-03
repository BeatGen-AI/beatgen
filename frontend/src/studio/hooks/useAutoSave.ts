/**
 * Auto-Save React Hook
 * 
 * Integrates the AutoSaveService with React components and the studio store.
 * Provides auto-save functionality with status tracking and error handling.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../platform/auth/auth-context';
import { useStudioStore } from '../stores/studioStore';
import { 
  AutoSaveService, 
  AutoSaveConfig, 
  AutoSaveStatus, 
  DEFAULT_AUTO_SAVE_CONFIG 
} from '../core/auto-save/AutoSaveService';
import { Project } from '../../platform/types/project';

export interface UseAutoSaveOptions {
  config?: Partial<AutoSaveConfig>;
  projectId?: string;  // Allow passing projectId as option
  onSaveSuccess?: (project: Project) => void;
  onSaveError?: (error: any, willRetry: boolean) => void;
  onStatusChange?: (status: AutoSaveStatus, message?: string) => void;
}

export interface UseAutoSaveReturn {
  status: AutoSaveStatus;
  forceSave: () => Promise<void>;
  enable: () => void;
  disable: () => void;
  isEnabled: boolean;
}

export const useAutoSave = (options: UseAutoSaveOptions = {}): UseAutoSaveReturn => {
  const { user } = useAuth();
  const studioStore = useStudioStore();
  
  const serviceRef = useRef<AutoSaveService | null>(null);
  const statusRef = useRef<AutoSaveStatus>('idle');
  const configRef = useRef<AutoSaveConfig>({
    ...DEFAULT_AUTO_SAVE_CONFIG,
    ...options.config
  });

  // Update config reference when options change
  useEffect(() => {
    configRef.current = {
      ...DEFAULT_AUTO_SAVE_CONFIG,
      ...options.config
    };
    
    if (serviceRef.current) {
      serviceRef.current.updateConfig(configRef.current);
    }
  }, [options.config]);

  // Callback to get current project state
  const getCurrentProjectState = useCallback(() => {
    const state = studioStore.getState();
    
    return {
      projectTitle: state.projectTitle || 'Untitled Project',
      bpm: state.bpm,
      timeSignature: state.timeSignature,
      keySignature: state.keySignature,
      tracks: state.tracks,
      projectId: options.projectId || '', // Use projectId from options
      userId: user?.id || ''
    };
  }, [studioStore, user, options.projectId]);

  // Callback to mark tracks as clean after save
  const markTracksAsClean = useCallback((trackIds: string[]) => {
    trackIds.forEach(trackId => {
      studioStore.updateTrackState(trackId, { dirty: false });
    });
  }, [studioStore]);

  // Status change handler
  const handleStatusChange = useCallback((status: AutoSaveStatus, message?: string) => {
    statusRef.current = status;
    options.onStatusChange?.(status, message);
  }, [options.onStatusChange]);

  // Save success handler
  const handleSaveSuccess = useCallback((project: Project) => {
    // Note: Project ID updates should be handled by the parent component
    // since the store doesn't have a setProjectId method
    options.onSaveSuccess?.(project);
  }, [options.onSaveSuccess]);

  // Save error handler
  const handleSaveError = useCallback((error: any, willRetry: boolean) => {
    console.error('Auto-save error:', error);
    
    // Handle auth errors by redirecting to login
    if (error.status === 401 || error.response?.status === 401) {
      console.log('Auto-save failed due to authentication - user session expired');
      // The auth context should handle this automatically, but we can also
      // clear local storage as a fallback
      localStorage.removeItem('access_token');
      // Redirect will be handled by the auth context
    }
    
    options.onSaveError?.(error, willRetry);
  }, [options.onSaveError]);

  // Initialize the auto-save service
  useEffect(() => {
    if (!user) {
      // Don't start auto-save if user is not logged in
      return;
    }

    const service = new AutoSaveService(configRef.current, {
      getCurrentProjectState,
      markTracksAsClean,
      onStatusChange: handleStatusChange,
      onSaveSuccess: handleSaveSuccess,
      onSaveError: handleSaveError
    });

    serviceRef.current = service;
    
    if (configRef.current.enabled) {
      service.start();
    }

    return () => {
      service.stop();
      serviceRef.current = null;
    };
  }, [
    user,
    getCurrentProjectState,
    markTracksAsClean,
    handleStatusChange,
    handleSaveSuccess,
    handleSaveError
  ]);

  // Subscribe to tracks changes to trigger auto-save
  useEffect(() => {
    if (!serviceRef.current || !user) return;

    const unsubscribe = studioStore.subscribe(
      (state) => state.tracks,
      (tracks, prevTracks) => {
        // Check if any tracks became dirty
        const hasDirtyTracks = tracks.some(track => track.dirty === true);
        const hadDirtyTracks = prevTracks.some(track => track.dirty === true);
        
        // Trigger auto-save if we now have dirty tracks or tracks changed
        const tracksChanged = tracks.length !== prevTracks.length ||
          tracks.some((track, index) => {
            const prevTrack = prevTracks[index];
            return !prevTrack || track.dirty !== prevTrack.dirty;
          });
        
        if ((hasDirtyTracks && !hadDirtyTracks) || (tracksChanged && hasDirtyTracks)) {
          serviceRef.current?.onTracksChanged();
        }
      }
    );

    return unsubscribe;
  }, [user, studioStore]);

  // Force save function
  const forceSave = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error('Auto-save service not initialized');
    }
    await serviceRef.current.forceSave();
  }, []);

  // Enable auto-save
  const enable = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.updateConfig({ enabled: true });
    }
  }, []);

  // Disable auto-save
  const disable = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.updateConfig({ enabled: false });
    }
  }, []);

  return {
    status: statusRef.current,
    forceSave,
    enable,
    disable,
    isEnabled: configRef.current.enabled
  };
};