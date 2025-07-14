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
    console.log(`[INIT DEBUG] Loading prefetch status from session storage:`, stored);
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log(`[INIT DEBUG] Parsed prefetch status:`, parsed);
      const statusMap = new Map(Object.entries(parsed));
      console.log(`[INIT DEBUG] Restored ${statusMap.size} project statuses`);
      return statusMap;
    }
  } catch (error) {
    console.error('[INIT DEBUG] Failed to load prefetch status from session storage:', error);
  }
  console.log(`[INIT DEBUG] No stored prefetch status found, starting with empty map`);
  return new Map();
};

export function useProjectPrefetch() {
  const queryClient = useQueryClient();
  const [prefetchStatuses, setPrefetchStatuses] = useState<Map<string, PrefetchStatus>>(getInitialPrefetchStatuses);
  
  // Debug: log on mount
  useEffect(() => {
    console.log('[PREFETCH HOOK DEBUG] useProjectPrefetch mounted');
    console.log('[PREFETCH HOOK DEBUG] Initial statuses:', Array.from(prefetchStatuses.entries()));
    // Log detailed status of first project
    const firstStatus = Array.from(prefetchStatuses.entries())[0];
    if (firstStatus) {
      console.log('[PREFETCH HOOK DEBUG] First project status detail:', firstStatus[1]);
    }
    // Expose clear function for debugging
    (window as any).clearPrefetchStatus = () => {
      console.log('Clearing prefetch status...');
      sessionStorage.removeItem(PREFETCH_STATUS_KEY);
      setPrefetchStatuses(new Map());
    };
  }, []);

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
    // Log soundfont-related status updates
    if ('soundfontStatus' in updates || 'soundfontProgress' in updates || 'totalSoundfonts' in updates || 'cachedSoundfonts' in updates) {
      console.log(`[STATUS DEBUG] Updating soundfont status for project ${projectId}:`, updates);
    }
    
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
      console.log(`[STATUS DEBUG] Status updated for project ${projectId}. Previous:`, currentStatus, 'New:', newStatus);
      
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

  const prefetchSoundfonts = useCallback(async (projectId: string, tracks: CombinedTrack[]) => {
    console.log(`[SOUNDFONT DEBUG] Starting prefetchSoundfonts for project ${projectId}`);
    console.log(`[SOUNDFONT DEBUG] Total tracks provided:`, tracks.length);
    console.log(`[SOUNDFONT DEBUG] Tracks data:`, tracks.map(t => ({ 
      id: t.id, 
      name: t.name, 
      track_type: t.track_type, 
      hasTrackData: !!t.track 
    })));
    
    // Check current status - if already success, don't re-run
    const currentStatus = prefetchStatuses.get(projectId);
    console.log(`[SOUNDFONT DEBUG] Current soundfont status:`, currentStatus?.soundfontStatus);
    if (currentStatus?.soundfontStatus === 'success') {
      console.log(`[SOUNDFONT DEBUG] Soundfonts already prefetched successfully, skipping`);
      return;
    }
    
    const soundfontManager = SoundfontManager.getInstance(db);
    const midiTracks = tracks.filter(t => t.track_type === 'MIDI' && t.track);
    console.log(`[SOUNDFONT DEBUG] MIDI tracks found:`, midiTracks.length);
    console.log(`[SOUNDFONT DEBUG] MIDI tracks data:`, midiTracks.map(t => ({ 
      id: t.id, 
      name: t.name, 
      track_type: t.track_type,
      track: t.track 
    })));
    
    // Get unique soundfont IDs
    const soundfontIds = new Set<string>();
    midiTracks.forEach(track => {
      if (track.track) {
        const midiTrack = track.track as MidiTrackRead;
        console.log(`[SOUNDFONT DEBUG] Processing MIDI track ${track.id} (${track.name}):`, {
          instrument_id: midiTrack.instrument_id,
          instrument_file: midiTrack.instrument_file,
          full_track_data: track,
          full_midi_track_data: midiTrack
        });
        if (midiTrack.instrument_id) {
          soundfontIds.add(midiTrack.instrument_id);
          console.log(`[SOUNDFONT DEBUG] Added soundfont ID: ${midiTrack.instrument_id} from instrument_file: ${midiTrack.instrument_file?.file_name || 'unknown'}`);
        } else {
          console.log(`[SOUNDFONT DEBUG] No instrument_id found for MIDI track ${track.id}`);
        }
      } else {
        console.log(`[SOUNDFONT DEBUG] No track data for MIDI track ${track.id}`);
      }
    });
    
    const uniqueSoundfonts = Array.from(soundfontIds);
    console.log(`[SOUNDFONT DEBUG] Unique soundfont IDs extracted:`, uniqueSoundfonts);
    
    if (uniqueSoundfonts.length === 0) {
      console.log(`[SOUNDFONT DEBUG] No soundfonts to prefetch, marking as success`);
      updateStatus(projectId, { soundfontStatus: 'success', soundfontProgress: 100 });
      return;
    }

    console.log(`[SOUNDFONT DEBUG] Setting soundfont status to loading, total soundfonts: ${uniqueSoundfonts.length}`);
    updateStatus(projectId, { 
      soundfontStatus: 'loading', 
      totalSoundfonts: uniqueSoundfonts.length,
      cachedSoundfonts: 0 
    });

    let cachedCount = 0;
    
    for (const soundfontId of uniqueSoundfonts) {
      try {
        console.log(`[SOUNDFONT DEBUG] Processing soundfont ${soundfontId}`);
        
        // Check if already cached in IndexedDB
        const existingSoundfont = await db.soundfonts.get(soundfontId);
        console.log(`[SOUNDFONT DEBUG] Existing soundfont in IndexedDB:`, !!existingSoundfont);
        
        if (!existingSoundfont) {
          console.log(`[SOUNDFONT DEBUG] Downloading soundfont ${soundfontId}`);
          // Download and cache
          await soundfontManager.getSoundfont(soundfontId);
          console.log(`[SOUNDFONT DEBUG] Successfully downloaded soundfont ${soundfontId}`);
        } else {
          console.log(`[SOUNDFONT DEBUG] Soundfont ${soundfontId} already cached`);
        }
        
        cachedCount++;
        const progress = Math.round((cachedCount / uniqueSoundfonts.length) * 100);
        console.log(`[SOUNDFONT DEBUG] Progress: ${cachedCount}/${uniqueSoundfonts.length} (${progress}%)`);
        updateStatus(projectId, {
          cachedSoundfonts: cachedCount,
          soundfontProgress: progress
        });
      } catch (error) {
        console.error(`[SOUNDFONT DEBUG] Failed to prefetch soundfont ${soundfontId}:`, error);
      }
    }

    const finalStatus = cachedCount === uniqueSoundfonts.length ? 'success' : 'error';
    console.log(`[SOUNDFONT DEBUG] Soundfont prefetching complete. Final status: ${finalStatus}, cached: ${cachedCount}/${uniqueSoundfonts.length}`);
    updateStatus(projectId, { 
      soundfontStatus: finalStatus,
      soundfontProgress: 100 
    });
  }, [updateStatus, prefetchStatuses]);

  const prefetchProject = useCallback(async (projectId: string) => {
    console.log(`[PREFETCH DEBUG] Starting prefetchProject for project ${projectId}`);
    
    // Check if already prefetching or cached
    const currentStatus = prefetchStatuses.get(projectId);
    console.log(`[PREFETCH DEBUG] Current prefetch status:`, currentStatus);
    
    if (currentStatus?.metadataStatus === 'loading') {
      console.log(`[PREFETCH DEBUG] Project ${projectId} already loading, skipping`);
      return; // Already loading
    }
    
    // Check if data is already in React Query cache and fresh
    const cachedData = queryClient.getQueryData<ProjectWithTracks>(['project', projectId]);
    const queryState = queryClient.getQueryState(['project', projectId]);
    const isDataFresh = queryState?.isInvalidated === false && 
                       queryState?.dataUpdatedAt && 
                       Date.now() - queryState.dataUpdatedAt < 1000 * 60 * 30; // 30 minutes
    
    console.log(`[PREFETCH DEBUG] Cached data available:`, !!cachedData);
    console.log(`[PREFETCH DEBUG] Data is fresh:`, isDataFresh);
    console.log(`[PREFETCH DEBUG] Query state:`, queryState);
    
    if (cachedData && isDataFresh && currentStatus?.metadataStatus === 'success') {
      console.log(`[PREFETCH DEBUG] Using cached data, checking audio and soundfont status`);
      // Data is already cached and fresh, just check audio files and soundfonts
      if (cachedData.tracks) {
        console.log(`[PREFETCH DEBUG] Cached project has ${cachedData.tracks.length} tracks`);
        if (currentStatus.audioStatus !== 'success') {
          console.log(`[PREFETCH DEBUG] Starting audio prefetch (status: ${currentStatus.audioStatus})`);
          prefetchAudioFiles(projectId, cachedData.tracks);
        }
        if (currentStatus.soundfontStatus !== 'success') {
          console.log(`[PREFETCH DEBUG] Starting soundfont prefetch (status: ${currentStatus.soundfontStatus})`);
          prefetchSoundfonts(projectId, cachedData.tracks);
        }
      } else {
        console.log(`[PREFETCH DEBUG] Cached project has no tracks`);
      }
      return;
    }

    console.log(`[PREFETCH DEBUG] Setting metadata status to loading`);
    updateStatus(projectId, { metadataStatus: 'loading' });

    try {
      console.log(`[PREFETCH DEBUG] Fetching project data from API`);
      // 1. Ensure project metadata is in cache (won't refetch if fresh)
      const project = await queryClient.ensureQueryData<ProjectWithTracks>({
        queryKey: ['project', projectId],
        queryFn: () => getProject(projectId),
        staleTime: 1000 * 60 * 30, // 30 minutes
        gcTime: 1000 * 60 * 60, // Keep in cache for 1 hour
      });

      console.log(`[PREFETCH DEBUG] Project data fetched successfully:`, {
        projectId: project?.id,
        tracksCount: project?.tracks?.length || 0
      });

      updateStatus(projectId, { metadataStatus: 'success' });

      // 2. Prefetch audio files and soundfonts in background
      if (project?.tracks) {
        console.log(`[PREFETCH DEBUG] Starting background prefetch for ${project.tracks.length} tracks`);
        // Don't await - let them run in background
        prefetchAudioFiles(projectId, project.tracks);
        prefetchSoundfonts(projectId, project.tracks);
      } else {
        console.log(`[PREFETCH DEBUG] No tracks found in project, skipping audio/soundfont prefetch`);
      }
    } catch (error) {
      console.error(`[PREFETCH DEBUG] Failed to prefetch project ${projectId}:`, error);
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