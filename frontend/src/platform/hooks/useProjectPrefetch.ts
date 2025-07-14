import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useRef, useEffect } from 'react';
import { getProject } from '../api/projects';
import { ProjectWithTracks, CombinedTrack } from '../types/project';
import { AudioTrackRead } from '../types/dto/track_models/audio_track';
import { SamplerTrackRead } from '../types/dto/track_models/sampler_track';
import { MidiTrackRead } from '../types/dto/track_models/midi_track';
import SampleManager from '../../studio/core/samples/sampleManager';
import SoundfontManager from '../../studio/core/soundfont/soundfontManager';
import { db } from '../../studio/core/db/dexie-client';

export interface PrefetchStatus {
  projectId: string;
  metadataStatus: 'idle' | 'loading' | 'success' | 'error';
  audioStatus: 'idle' | 'loading' | 'success' | 'error';
  audioProgress: number; // 0-100
  totalTracks: number;
  cachedTracks: number;
  soundfontStatus: 'idle' | 'loading' | 'success' | 'error';
  soundfontProgress: number; // 0-100
  totalSoundfonts: number;
  cachedSoundfonts: number;
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
        soundfontStatus: 'idle',
        soundfontProgress: 0,
        totalSoundfonts: 0,
        cachedSoundfonts: 0,
      };
      
      const newStatus = { ...currentStatus, ...updates };
      
      newMap.set(projectId, newStatus);
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
    // Check current status - if already success or loading, don't re-run
    const currentStatus = prefetchStatuses.get(projectId);
    if (currentStatus?.audioStatus === 'success' || currentStatus?.audioStatus === 'loading') {
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
    let failedCount = 0;
    
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
        failedCount++;
      }
    }

    // Determine final status based on success/failure ratio
    let finalStatus: 'success' | 'error';
    if (cachedCount === audioTracks.length) {
      finalStatus = 'success';
    } else if (cachedCount === 0) {
      finalStatus = 'error';
    } else {
      // Partial success - some cached, some failed
      finalStatus = 'error'; // Mark as error so it will retry next time
    }
    
    updateStatus(projectId, { 
      audioStatus: finalStatus,
      audioProgress: 100 
    });
  }, [updateStatus, prefetchStatuses]);

  const prefetchSoundfonts = useCallback(async (projectId: string, tracks: CombinedTrack[]) => {
    // Check current status - if already success or loading, don't re-run
    const currentStatus = prefetchStatuses.get(projectId);
    if (currentStatus?.soundfontStatus === 'success' || currentStatus?.soundfontStatus === 'loading') {
      return;
    }
    
    const soundfontManager = SoundfontManager.getInstance(db);
    const midiTracks = tracks.filter(t => t.track_type === 'MIDI' && t.track);
    
    // Get unique soundfont IDs
    const soundfontIds = new Set<string>();
    midiTracks.forEach(track => {
      if (track.track) {
        const midiTrack = track.track as MidiTrackRead;
        if (midiTrack.instrument_id) {
          soundfontIds.add(midiTrack.instrument_id);
        }
      }
    });
    
    const uniqueSoundfonts = Array.from(soundfontIds);
    
    if (uniqueSoundfonts.length === 0) {
      updateStatus(projectId, { soundfontStatus: 'success', soundfontProgress: 100 });
      return;
    }
    updateStatus(projectId, { 
      soundfontStatus: 'loading', 
      totalSoundfonts: uniqueSoundfonts.length,
      cachedSoundfonts: 0 
    });

    let cachedCount = 0;
    
    let failedCount = 0;
    
    for (const soundfontId of uniqueSoundfonts) {
      try {
        // Check if already cached in IndexedDB
        const existingSoundfont = await db.soundfonts.get(soundfontId);
        if (!existingSoundfont) {
          // Download and cache
          await soundfontManager.getSoundfont(soundfontId);
        }
        
        cachedCount++;
        updateStatus(projectId, {
          cachedSoundfonts: cachedCount,
          soundfontProgress: Math.round((cachedCount / uniqueSoundfonts.length) * 100)
        });
      } catch (error) {
        console.error(`Failed to prefetch soundfont ${soundfontId}:`, error);
        failedCount++;
      }
    }

    // Determine final status based on success/failure ratio
    let finalStatus: 'success' | 'error';
    if (cachedCount === uniqueSoundfonts.length) {
      finalStatus = 'success';
    } else if (cachedCount === 0) {
      finalStatus = 'error';
    } else {
      // Partial success - some cached, some failed
      finalStatus = 'error'; // Mark as error so it will retry next time
    }
    
    updateStatus(projectId, { 
      soundfontStatus: finalStatus,
      soundfontProgress: 100 
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
      // Data is already cached and fresh, just check audio files and soundfonts
      if (cachedData.tracks) {
        if (currentStatus.audioStatus !== 'success') {
          prefetchAudioFiles(projectId, cachedData.tracks);
        }
        if (currentStatus.soundfontStatus !== 'success') {
          prefetchSoundfonts(projectId, cachedData.tracks);
        }
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

      // 2. Prefetch audio files and soundfonts in background
      if (project?.tracks) {
        // Don't await - let them run in background
        prefetchAudioFiles(projectId, project.tracks);
        prefetchSoundfonts(projectId, project.tracks);
      }
    } catch (error) {
      console.error(`Failed to prefetch project ${projectId}:`, error);
      updateStatus(projectId, { metadataStatus: 'error' });
    }
  }, [queryClient, prefetchStatuses, updateStatus, prefetchAudioFiles, prefetchSoundfonts]);

  const getPrefetchStatus = useCallback((projectId: string): PrefetchStatus | undefined => {
    return prefetchStatuses.get(projectId);
  }, [prefetchStatuses]);

  const isProjectCached = useCallback((projectId: string): boolean => {
    const status = prefetchStatuses.get(projectId);
    return status?.metadataStatus === 'success' && 
           status?.audioStatus === 'success' && 
           status?.soundfontStatus === 'success';
  }, [prefetchStatuses]);

  return {
    prefetchProject,
    getPrefetchStatus,
    isProjectCached,
    prefetchStatuses: Array.from(prefetchStatuses.values()),
  };
}