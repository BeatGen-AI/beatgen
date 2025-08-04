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
  onProjectIdUpdate?: (projectId: string) => void; // Callback when project ID is set
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

  // Keep track of the current project ID
  const projectIdRef = useRef(options.projectId || '');
  
  // Update project ID ref when options change
  useEffect(() => {
    projectIdRef.current = options.projectId || '';
  }, [options.projectId]);

  // Callback to get current project state
  const getCurrentProjectState = useCallback(() => {
    const state = useStudioStore.getState();
    
    // Get project ID from ProjectManager if available, fallback to ref
    const projectManagerId = state.store?.projectManager.getCurrentProject()?.id;
    const currentProjectId = projectManagerId || projectIdRef.current;
    

    
    return {
      projectTitle: state.projectTitle || 'Untitled Project',
      bpm: state.bpm,
      timeSignature: state.timeSignature,
      keySignature: state.keySignature,
      tracks: state.tracks,
      projectId: currentProjectId,
      userId: user?.id || ''
    };
  }, [user]);

  // Callback to mark tracks as clean after save
  const markTracksAsClean = useCallback((trackIds: string[]) => {
    const { updateTrackState } = useStudioStore.getState();
    trackIds.forEach(trackId => {
      updateTrackState(trackId, { dirty: false });
    });
  }, []);

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

    console.log('AutoSave: Initializing service...');
    const service = new AutoSaveService(configRef.current, {
      getCurrentProjectState,
      markTracksAsClean,
      onStatusChange: handleStatusChange,
      onSaveSuccess: handleSaveSuccess,
      onSaveError: handleSaveError,
      updateProjectId: (projectId: string) => {
        console.log('AutoSave: Project ID updated to:', projectId);
        projectIdRef.current = projectId; // Update the ref immediately
        options.onProjectIdUpdate?.(projectId);
      },
      getTrackNotes: (trackId: string) => {
        const { getTrackNotes } = useStudioStore.getState();
        return getTrackNotes(trackId);
      }
    });

    serviceRef.current = service;
    
    if (configRef.current.enabled) {
      service.start();
    }

    return () => {
      console.log('AutoSave: Cleaning up service...');
      service.stop();
      serviceRef.current = null;
    };
  }, [
    user?.id // Only depend on user ID, not the entire user object
    // Remove function dependencies to prevent restarts
  ]);

  // Subscribe to tracks changes to trigger auto-save
  useEffect(() => {
    if (!user) return;

    console.log('AutoSave: Setting up subscription...');
    let lastTriggerTime = 0;
    const triggerThreshold = 1000; // Don't trigger more than once per second

    const unsubscribe = useStudioStore.subscribe(
      (state) => {
        // Only proceed if service is available
        if (!serviceRef.current) return;
        
        const currentTracks = state.tracks;
        const hasDirtyTracks = currentTracks.some(track => track.dirty === true);
        
        console.log('AutoSave: Checking tracks for dirty flag:', {
          totalTracks: currentTracks.length,
          dirtyTracks: currentTracks.filter(track => track.dirty === true).map(t => ({ id: t.id, name: t.name, dirty: t.dirty })),
          hasDirtyTracks
        });
        
        // If we have dirty tracks and enough time has passed, trigger auto-save
        if (hasDirtyTracks) {
          const now = Date.now();
          if (now - lastTriggerTime > triggerThreshold) {
            console.log('AutoSave: Triggering onTracksChanged for dirty tracks!');
            serviceRef.current?.onTracksChanged();
            lastTriggerTime = now;
          }
        }
      }
    );

    console.log('AutoSave: Subscription set up successfully');
    return () => {
      console.log('AutoSave: Cleaning up subscription');
      unsubscribe();
    };
  }, [user?.id]); // Only depend on user ID

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