import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useRef, useEffect } from 'react';
import { getProject } from '../api/projects';
import { ProjectWithTracks, CombinedTrack } from '../types/project';
import { AudioTrackRead } from '../types/dto/track_models/audio_track';
import { SamplerTrackRead } from '../types/dto/track_models/sampler_track';
import SampleManager from '../../studio/core/samples/sampleManager';
import { db } from '../../studio/core/db/dexie-client';

export interface PrefetchStatus {
  projectId: string;
  metadataStatus: 'idle' | 'loading' | 'success' | 'error';
  audioStatus: 'idle' | 'loading' | 'success' | 'error';
  audioProgress: number; // 0-100
  totalTracks: number;
  cachedTracks: number;
}

// Storage key for session persistence
const PREFETCH_STATUS_KEY = 'beatgen_prefetch_status';

// Helper to get initial state from session storage
const getInitialPrefetchStatuses = (): Map<string, PrefetchStatus> => {
  try {
    const stored = sessionStorage.getItem(PREFETCH_STATUS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed));
    }
  } catch (error) {
    console.error('Failed to load prefetch status from session storage:', error);
  }
  return new Map();
};

export function useProjectPrefetch() {
  const queryClient = useQueryClient();
  const [prefetchStatuses, setPrefetchStatuses] = useState<Map<string, PrefetchStatus>>(getInitialPrefetchStatuses);

  // Persist status to session storage whenever it changes
  useEffect(() => {
    try {
      const statusObject = Object.fromEntries(prefetchStatuses);
      sessionStorage.setItem(PREFETCH_STATUS_KEY, JSON.stringify(statusObject));
    } catch (error) {
      console.error('Failed to save prefetch status to session storage:', error);
    }
  }, [prefetchStatuses]);

  const updateStatus = useCallback((projectId: string, updates: Partial<PrefetchStatus>) => {
    setPrefetchStatuses(prev => {
      const newMap = new Map(prev);
      const currentStatus = newMap.get(projectId) || {
        projectId,
        metadataStatus: 'idle',
        audioStatus: 'idle',
        audioProgress: 0,
        totalTracks: 0,
        cachedTracks: 0,
      };
      newMap.set(projectId, { ...currentStatus, ...updates });
      return newMap;
    });
  }, []);

  const getStorageKey = (track: CombinedTrack): string | null => {
    if (track.track_type === 'AUDIO' && track.track) {
      const audioTrack = track.track as AudioTrackRead;
      return audioTrack.audio_file_storage_key || null;
    } else if (track.track_type === 'SAMPLER' && track.track) {
      const samplerTrack = track.track as SamplerTrackRead;
      return samplerTrack.audio_storage_key || null;
    }
    return null;
  };

  const prefetchAudioFiles = useCallback(async (projectId: string, tracks: CombinedTrack[]) => {
    // Check current status - if already success, don't re-run
    const currentStatus = prefetchStatuses.get(projectId);
    if (currentStatus?.audioStatus === 'success') {
      return;
    }
    
    const sampleManager = SampleManager.getInstance(db);
    const audioTracks = tracks.filter(t => t.track_type === 'AUDIO' || t.track_type === 'SAMPLER');
    
    if (audioTracks.length === 0) {
      updateStatus(projectId, { audioStatus: 'success', audioProgress: 100 });
      return;
    }

    updateStatus(projectId, { 
      audioStatus: 'loading', 
      totalTracks: audioTracks.length,
      cachedTracks: 0 
    });

    let cachedCount = 0;
    
    for (const track of audioTracks) {
      try {
        // Check if already cached
        const existingFile = await db.getAudioFile(track.id);
        if (existingFile) {
          cachedCount++;
          updateStatus(projectId, {
            cachedTracks: cachedCount,
            audioProgress: Math.round((cachedCount / audioTracks.length) * 100)
          });
          continue;
        }

        // Download and cache
        const storageKey = getStorageKey(track);
        if (storageKey) {
          const type = track.track_type === 'AUDIO' ? 'audio_track' : 'sample';
          await sampleManager.getSampleBlob(track.id, storageKey, type, track.name);
          cachedCount++;
          updateStatus(projectId, {
            cachedTracks: cachedCount,
            audioProgress: Math.round((cachedCount / audioTracks.length) * 100)
          });
        }
      } catch (error) {
        console.error(`Failed to prefetch audio for track ${track.id}:`, error);
      }
    }

    updateStatus(projectId, { 
      audioStatus: cachedCount === audioTracks.length ? 'success' : 'error',
      audioProgress: 100 
    });
  }, [updateStatus, prefetchStatuses]);

  const prefetchProject = useCallback(async (projectId: string) => {
    // Check if already prefetching or cached
    const currentStatus = prefetchStatuses.get(projectId);
    if (currentStatus?.metadataStatus === 'loading') {
      return; // Already loading
    }
    
    // Check if data is already in React Query cache and fresh
    const cachedData = queryClient.getQueryData<ProjectWithTracks>(['project', projectId]);
    const queryState = queryClient.getQueryState(['project', projectId]);
    const isDataFresh = queryState?.isInvalidated === false && 
                       queryState?.dataUpdatedAt && 
                       Date.now() - queryState.dataUpdatedAt < 1000 * 60 * 30; // 30 minutes
    
    if (cachedData && isDataFresh && currentStatus?.metadataStatus === 'success') {
      // Data is already cached and fresh, just check audio files
      if (currentStatus.audioStatus !== 'success' && cachedData.tracks) {
        prefetchAudioFiles(projectId, cachedData.tracks);
      }
      return;
    }

    updateStatus(projectId, { metadataStatus: 'loading' });

    try {
      // 1. Ensure project metadata is in cache (won't refetch if fresh)
      const project = await queryClient.ensureQueryData<ProjectWithTracks>({
        queryKey: ['project', projectId],
        queryFn: () => getProject(projectId),
        staleTime: 1000 * 60 * 30, // 30 minutes
        gcTime: 1000 * 60 * 60, // Keep in cache for 1 hour
      });

      updateStatus(projectId, { metadataStatus: 'success' });

      // 2. Prefetch audio files in background
      if (project?.tracks) {
        // Don't await - let it run in background
        prefetchAudioFiles(projectId, project.tracks);
      }
    } catch (error) {
      console.error(`Failed to prefetch project ${projectId}:`, error);
      updateStatus(projectId, { metadataStatus: 'error' });
    }
  }, [queryClient, prefetchStatuses, updateStatus, prefetchAudioFiles]);

  const getPrefetchStatus = useCallback((projectId: string): PrefetchStatus | undefined => {
    return prefetchStatuses.get(projectId);
  }, [prefetchStatuses]);

  const isProjectCached = useCallback((projectId: string): boolean => {
    const status = prefetchStatuses.get(projectId);
    return status?.metadataStatus === 'success' && status?.audioStatus === 'success';
  }, [prefetchStatuses]);

  return {
    prefetchProject,
    getPrefetchStatus,
    isProjectCached,
    prefetchStatuses: Array.from(prefetchStatuses.values()),
  };
}