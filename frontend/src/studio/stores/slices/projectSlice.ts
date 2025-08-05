import * as Tone from 'tone';
import { RefactoredStore } from '../../core/state/RefactoredStore';
import { ProjectWithTracks, CombinedTrack, AudioTrackRead, MidiTrackRead, SamplerTrackRead, DrumTrackRead, CombinedTrackEntity } from 'src/platform/types/project';
import { getProject } from '../../../platform/api/projects';
import { Actions } from '../../core/state/history/actions';
import { DEFAULT_SAMPLER_CONFIG, TRACK_CONFIG } from '../config';
import { 
  RootState, 
  SetFn, 
  GetFn, 
  StoreSliceCreator, 
  ProjectParam, 
  TrackType
} from '../types';
import { GRID_CONSTANTS } from '../../constants/gridConstants';
import { convertJsonToNotes, Note } from '../../../types/note';
import { db } from '../../core/db/dexie-client'; // Import db instance
import SampleManager from '../../core/samples/sampleManager';
import { produce } from 'immer'; // Import produce
import { getAudioDuration, calculateAudioDurationTicks } from '../../utils/audioAnalysis';

// Define the state properties for this slice
export interface ProjectSlice {
  projectTitle: string;
  bpm: number;
  timeSignature: [number, number];
  keySignature: string;
  loadProject: (projectId: string) => Promise<ProjectWithTracks | null>;
  loadTrack: (track: CombinedTrack) => Promise<void>;
  loadDrumTrack: (track: CombinedTrack) => Promise<void>;
  handleProjectParamChange: (param: ProjectParam, value: any) => Promise<void>;
  handleKeySignatureChange: (keySignature: string) => Promise<void>;
  updateBPMState: (bpm: number) => Promise<void>;
}

// Create the slice function
export const createProjectSlice: StoreSliceCreator<ProjectSlice> = (set, get) => {
  const rootGet = get as GetFn; // Define rootGet once for convenience

  // Pure BPM update function - no history actions
  const updateBPMState = async (bpm: number): Promise<void> => {
    const { store, updateTrackState } = rootGet();
    
    if (!store) { 
      console.warn("Store not available in updateBPMState"); 
      return; 
    }

    // Update Zustand state
    set(produce((draft: RootState) => {
      draft.bpm = bpm;
    }));

    // Update audio track instances for BPM change
    const tracks = rootGet().tracks;
    tracks.forEach(track => {
      if (track.track_type === 'AUDIO' && track.instances) {
        const audioDuration = getAudioDuration(track);
        if (audioDuration > 0) {
          const newDurationTicks = calculateAudioDurationTicks(audioDuration, bpm);
          
          // Create new instances array with updated trim_end_ticks
          const updatedInstances = track.instances.map(instance => ({
            ...instance,
            trim_end_ticks: newDurationTicks
          }));
          
          // Update the track state with new instances and duration_ticks
          updateTrackState(track.id, {
            instances: updatedInstances,
            duration_ticks: newDurationTicks
          });
        }
      }
    });

    // Update all audio systems
    store.projectManager.setTempo(bpm);
    Tone.getTransport().bpm.value = bpm;
    await store.getTransport().setTempo(bpm);
  };

  // Refactored helper using Immer
  const handleProjectParamChange = async (param: ProjectParam, value: any) => {
    const { store, executeHistoryAction, _withStore } = rootGet();
    const oldValue = rootGet()[param];
    
    if (oldValue === value) return;

    // Update state using Immer (no action name)
    set(produce((draft: RootState) => {
        (draft as any)[param] = value;
    })); 

    if (!store) { console.warn("Store not available in handleProjectParamChange"); return; }
    switch (param) {
      case 'projectTitle':
        store.projectManager.setProjectName(value as string);
        break;
      case 'bpm':
        await updateBPMState(value as number);
        if (executeHistoryAction) {
            const bpmAction = new Actions.BPMChange(get, oldValue as number, value as number, rootGet().timeSignature);
            executeHistoryAction(bpmAction);
        }
        break;
      case 'keySignature':
        const keySigValue = value as string;
        if (executeHistoryAction) {
            const keyAction = new Actions.KeySignature(get, oldValue as string, keySigValue);
            executeHistoryAction(keyAction);
        }
        break;
      // case 'timeSignature':
      //   const [numerator, denominator] = value as [number, number];
      //   store.projectManager.setTimeSignature(numerator, denominator);
      //   Tone.getTransport().timeSignature = value as [number, number];
      //   if (executeHistoryAction) {
      //       const timeAction = new Actions.TimeSignature(get, oldValue as [number, number], value as [number, number], rootGet().bpm);
      //       executeHistoryAction(timeAction);
      //   }
      //   break;
    }
  };

  const loadDrumTrack = async (track: CombinedTrack) => {
    const { _withErrorHandling, updateTracks, tracks } = rootGet(); // Added tracks for index calculation
    if (!_withErrorHandling) return;

    const loadLogic = async (): Promise<void> => {
      const drumTrackData = track.track as DrumTrackRead;
      if (!drumTrackData || !drumTrackData.sampler_tracks) {
        console.error(`Drum track ${track.id} is missing nested track data or sampler_tracks.`);
        return;
      }

      const currentTrackCount = tracks.length; // Get current count before processing

      // 1. Process the main drum track
      // Ensure index passed to processTrack reflects potential position if added
      const drumTrackState = await processTrack(track, currentTrackCount); 
      if (!drumTrackState) {
        console.error(`Failed to process main drum track ${track.id}`);
        return;
      }

      // 2. Process associated sampler tracks
      const samplerTrackStates: CombinedTrack[] = [];
      const samplerProcessingPromises = drumTrackData.sampler_tracks.map(async (samplerTrack, samplerIndex) => {
        const combinedSamplerTrack: CombinedTrack = {
          id: samplerTrack.id,
          name: samplerTrack.name,
          track_type: 'SAMPLER',
          track_number: track.track_number,
          volume: track.volume, // Inherit properties from parent drum track? Or use sampler's own?
          pan: track.pan,       // Assuming sampler tracks don't have their own top-level vol/pan in API
          mute: track.mute,
          dirty: (track as any).dirty ?? false, // Preserve dirty flag from parent drum track
          duration_ticks: track.duration_ticks ?? 0,
          // Use instance_metadata from parent track
          instances: track.instances || [],
          track: { // Construct the nested 'track' part for the sampler
            ...samplerTrack, // Spread the specific SamplerTrackRead data
            id: samplerTrack.id, // Redundant but ensures consistency
            name: samplerTrack.name,
            // Populate other sampler-specific fields needed by processTrack/connect
            base_midi_note: samplerTrack.base_midi_note,
            grain_size: samplerTrack.grain_size,
            overlap: samplerTrack.overlap,
            midi_notes_json: samplerTrack.midi_notes_json,
            audio_storage_key: samplerTrack.audio_storage_key, // Make sure storage key is included
            audio_file_format: samplerTrack.audio_file_format,
            drum_track_id: track.id // Explicitly link back to the drum track
          }
        };
        // Process each sampler, giving it a unique index based on drum track's position
        const samplerState = await processTrack(combinedSamplerTrack, currentTrackCount + 1 + samplerIndex); 
        if (samplerState) {
          samplerTrackStates.push(samplerState);
        } else {
          console.warn(`Failed to process sampler track ${samplerTrack.id} for drum track ${track.id}`);
        }
      });
      await Promise.all(samplerProcessingPromises);

      const allTracksToLoad = [drumTrackState, ...samplerTrackStates];

      // 3. Download and Cache Audio Files for all involved tracks
      await downloadAndCacheAudioFiles(allTracksToLoad);

      // 4. Update Zustand state with all tracks together
      // Add the new tracks to the existing ones
      updateTracks([...get().tracks, ...allTracksToLoad]); 

      // 5. Connect all tracks to engines
      await connectTracksToEngines(allTracksToLoad);

      console.log(`Successfully loaded drum track ${track.id} and its ${samplerTrackStates.length} sampler tracks.`);
    };

    await _withErrorHandling(loadLogic, `loadDrumTrack: ${track.id}`)();
  }

  const loadTrack = async (track: CombinedTrack) => {
    const trackState = await processTrack(track, rootGet().tracks.length);
    
    // 5. Update Zustand state with initial track data
    get().updateTracks([...get().tracks, trackState]);
    
    // 6. Connect tracks to engines (will load audio from Dexie)
    await connectTracksToEngines([trackState]);
  }


  const handleKeySignatureChange = async (keySignature: string) => {
    await handleProjectParamChange('keySignature', keySignature);
  }

  

  // Helper to fetch data (extracted)
  const fetchProjectData = async (projectId: string): Promise<ProjectWithTracks | null> => {
    const { _withErrorHandling } = rootGet();
    const fetchData = async (): Promise<ProjectWithTracks | null> => {
      const projectData = await getProject(projectId); 
      console.log('Project data loaded:', projectData);
      return projectData as ProjectWithTracks || null; 
    };
    if (!_withErrorHandling) return null;
    return _withErrorHandling(fetchData, 'fetchProjectData')();
  };

  // Helper to initialize project settings using Immer
  const initializeProjectSettings = async (projectData: ProjectWithTracks) => {
     const { _withStore, store } = rootGet();
     const initSettings = async (passedStore: RefactoredStore, projectData: ProjectWithTracks) => {
        // Update state using Immer
        set(produce((draft: RootState) => {
            draft.projectTitle = projectData.name;
            draft.bpm = projectData.bpm;
            draft.timeSignature = [ projectData.time_signature_numerator, projectData.time_signature_denominator ];
            draft.keySignature = projectData.key_signature;
        }));
        
        // 1. Ensure project exists in the manager
        const projectManager = passedStore.getProjectManager();
        let currentProjectInstance = projectManager.getCurrentProject();
        if (!currentProjectInstance || (projectData.id && currentProjectInstance.id !== projectData.id)) {
             // If no current project or ID mismatch, create/set the new one
             console.log("Creating/Setting project in manager:", projectData.name);
             // Create project and immediately set the correct backend ID
             passedStore.projectManager.createProject(projectData.name);
             if (projectData.id) {
                 passedStore.projectManager.setProjectId(projectData.id);
                 console.log("Set ProjectManager ID to backend ID:", projectData.id);
             }
             // Re-fetch the instance AFTER creation/setting
             currentProjectInstance = passedStore.projectManager.getCurrentProject();
        } 
        
        // 2. Call methods on the manager's instance
        if (currentProjectInstance) {
            // Assuming currentProjectInstance is the correct class type with methods
            projectManager.setTempo(projectData.bpm);
            projectManager.setTimeSignature(projectData.time_signature_numerator, projectData.time_signature_denominator);
            projectManager.setProjectName(projectData.name); 
        } else {
            console.error("Failed to get valid project instance in initSettings after create/get");
        }
        
        // 3. Update Tone.js Transport
        Tone.Transport.bpm.value = projectData.bpm;
        Tone.Transport.timeSignature = [ projectData.time_signature_numerator, projectData.time_signature_denominator ];
        
        // 4. Update TransportController and SoundfontEngineController BPM
        await passedStore.getTransport().setTempo(projectData.bpm);
        
        // Return the instance obtained from the manager
        return currentProjectInstance; // Return the instance we retrieved/created
     }
     if (!_withStore) return null;
     // Pass projectData correctly
     return _withStore(async (storeInstance) => await initSettings(storeInstance, projectData))(); 
  };

  // Refined processTrack for loading state (no history)
  const processTrack = async (apiTrack: any, index: number): Promise<CombinedTrack | null> => {
      console.log(`Processing loaded track ${index}: ${apiTrack.name} (${apiTrack.id})`);
      const { store, _withStore, _withErrorHandling } = rootGet(); 

      if (!_withStore || !_withErrorHandling) {
        console.error("_withStore or _withErrorHandling not available in processTrack");
        return null;
      }

      const processLogic = async (store: RefactoredStore): Promise<CombinedTrack | null> => {
          const trackType = apiTrack.track_type as TrackType;
          if (!TRACK_CONFIG[trackType]) { 
            console.error("Invalid track type from API:", trackType);
            return null;
          }
          // Check if the incoming track has a dirty flag set
          const incomingDirtyFlag = (apiTrack as any).dirty;
          console.log('🔍 processTrack - incoming dirty flag:', incomingDirtyFlag, 'for track:', apiTrack.name);
          
          const combinedTrackData: CombinedTrackEntity = {
              id: apiTrack.id,
              name: apiTrack.name,
              track_number: apiTrack.track_number,
              track_type: trackType,
              volume: apiTrack.volume ?? 80,
              pan: apiTrack.pan ?? 0,
              mute: apiTrack.mute ?? false,
              duration_ticks: apiTrack.duration_ticks ?? 0,
              // Map instance_metadata to instances
              instances: apiTrack.instance_metadata || [],
              // Preserve the dirty flag if it's already set on the incoming track, otherwise default to false
              dirty: (apiTrack as any).dirty ?? false,
              track: apiTrack.track,
          };

          // 2. Populate the nested .track property based on type
          let nestedTrackData: any = { type: trackType, id: apiTrack.id, name: apiTrack.name }; // Base
          const apiTrackData = apiTrack.track; // Assuming the specific data is here

          if (apiTrackData) {
              switch (trackType) {
                  case 'AUDIO':
                      nestedTrackData = { ...nestedTrackData, ...(apiTrackData as AudioTrackRead) };
                      // Ensure necessary fields like audio_file_storage_key are present
                      break;
                  case 'MIDI':
                      nestedTrackData = { ...nestedTrackData, ...(apiTrackData as MidiTrackRead) };
                      try {
                          const midiNotesJson = (apiTrackData as MidiTrackRead).midi_notes_json as any;
                          nestedTrackData.notes = convertJsonToNotes(midiNotesJson, apiTrack.id); 
                          console.log(`Parsed ${nestedTrackData.notes?.length} MIDI notes for track ${apiTrack.id}`);
                      } catch (e) {
                          console.error(`Failed to parse midiNotesJson for MIDI track ${apiTrack.id}:`, e);
                          nestedTrackData.notes = []; 
                      }
                      break;
                  case 'DRUM':
                       nestedTrackData = { ...nestedTrackData, ...(apiTrackData as DrumTrackRead) };
                       // Ensure essential drum properties exist
                       nestedTrackData.drumPattern = (apiTrackData as any).drumPattern || Array(4).fill(null).map(() => Array(64).fill(false)); 
                       nestedTrackData.sampler_track_ids = (apiTrackData as any).sampler_track_ids || [];
                       break;
                  case 'SAMPLER':
                      const samplerTrackData = apiTrackData as SamplerTrackRead
                      nestedTrackData = { ...nestedTrackData, ...samplerTrackData };
                      nestedTrackData.baseMidiNote = (apiTrackData as any).base_midi_note ?? DEFAULT_SAMPLER_CONFIG.baseMidiNote;
                      nestedTrackData.grainSize = (apiTrackData as any).grain_size ?? DEFAULT_SAMPLER_CONFIG.grainSize;
                      nestedTrackData.overlap = (apiTrackData as any).overlap ?? DEFAULT_SAMPLER_CONFIG.overlap;
                      try {
                        const midiNotesJson = (apiTrackData as SamplerTrackRead).midi_notes_json as any;
                        nestedTrackData.notes = convertJsonToNotes(midiNotesJson, apiTrack.id); 
                        console.log(`Parsed ${nestedTrackData.notes?.length} MIDI notes for sampler track ${apiTrack.id}`);
                      } catch (e) {
                        console.error(`Failed to parse midiNotesJson for sampler track ${apiTrack.id}:`, e);
                        nestedTrackData.notes = []; 
                      }
                     break;
              }
          }
          
          const finalCombinedTrack = { ...combinedTrackData, track: nestedTrackData } as CombinedTrack;
          
          // The new system will handle all track setup when loadTrack is called
          // Just return the track data structure
          
          return finalCombinedTrack;
      };
      
      return _withErrorHandling(async () => _withStore(processLogic)(), `processTrack: ${apiTrack.id}`)();
  };

  // Simplified connectTracksToEngines for new system only
  const connectTracksToEngines = async (loadedTracks: CombinedTrack[]) => {
      console.log(`Connecting ${loadedTracks.length} tracks to engines...`);
      const { store, _withStore, _withErrorHandling } = rootGet(); 
      if (!_withStore || !_withErrorHandling) { return; }

      const connectLogic = async (store: RefactoredStore, tracks: CombinedTrack[]) => {
        // Double-check that store is initialized before connecting tracks
        if (!get().isInitialized) {
          console.warn('Store not initialized when connecting tracks to engines, initializing now...');
          await get().initializeAudio();
          console.log('Store initialized during track connection');
        }
        
        // Use the new system's loadTrack method for each track
        console.log('Loading tracks with new audio system');
        for (const track of tracks) {
          try {
            await store.loadTrack(track);
            console.log(`Loaded track ${track.id} (${track.track_type})`);
          } catch (error) {
            console.error(`Error loading track ${track.id}:`, error);
          }
        }
      }
      
      await _withErrorHandling(async () => _withStore(connectLogic)(loadedTracks), 'connectTracksToEngines')();
      console.log('Finished connecting tracks to engines.');
  };


  // Download and cache audio files if they aren't in Dexie
  const downloadAndCacheAudioFiles = async (tracks: CombinedTrack[]): Promise<void> => {
    console.log('Starting audio file download and cache process...');
    const downloadPromises = tracks.map(async (track) => {
      let storageKey: string | undefined | null = null;
      let fileType: string = 'audio'; // Default or determine based on track type

      if (track.track_type === 'AUDIO' && track.track && 'audio_file_storage_key' in track.track) {
        storageKey = track.track.audio_file_storage_key;
        fileType = track.track.audio_file_format || fileType;
      } else if (track.track_type === 'SAMPLER' && track.track && 'audio_storage_key' in track.track) {
        storageKey = track.track.audio_storage_key;
        fileType = track.track.audio_file_format || fileType; // Distinguish sampler audio if needed
      }

      if (!storageKey) {
        // No key associated with this track
        return { trackId: track.id, status: 'skipped', reason: 'No storage key' };
      }

      try {
        const existingFile = await db.getAudioFile(track.id);
        if (existingFile) {
          // File already in Dexie
          console.log(`Cache hit for track ${track.id}`);
          return { trackId: track.id, status: 'cached' };
        }
        
        // File not in Dexie, download it
        console.log(`Cache miss for track ${track.id}, downloading key ${storageKey}...`);

        const sampleManager = SampleManager.getInstance(db);
        const audioBlob = await sampleManager.getSampleBlob(track.id, storageKey, 'audio_track', track.name);
        
        if (audioBlob) {
          // Convert Blob to File for metadata (name primarily)
          // Use track name or generate one if unavailable
          console.log(`Successfully downloaded and cached audio for track ${track.id}`);
          return { trackId: track.id, status: 'downloaded' };
        } else {
          console.warn(`Download returned null/undefined for track ${track.id}, key ${storageKey}`);
          return { trackId: track.id, status: 'failed', reason: 'Download empty' };
        }
      } catch (error) {
        console.error(`Error during download/cache for track ${track.id} (key: ${storageKey}):`, error);
        return { trackId: track.id, status: 'failed', reason: error };
      }
    });

    // Wait for all downloads/checks to complete (or fail)
    const results = await Promise.allSettled(downloadPromises);
    console.log('Audio file download and cache process completed.', results);
    // Optionally handle failed downloads here (e.g., notify user, retry)
  };

  // Optimized project loading flow
  const loadProject = async (projectId: string): Promise<ProjectWithTracks | null> => {
    const { _withErrorHandling } = rootGet();
    if (!_withErrorHandling) return null;

    const loadLogic = async (): Promise<ProjectWithTracks | null> => {
        // Ensure Store is fully initialized before proceeding
        if (!get().isInitialized) { 
            await get().initializeAudio(); 
            console.log('Store initialized successfully for project loading');
        }
        
        // 1. Fetch project data (includes track list with storage keys)
        const projectDataWithTracks = await fetchProjectData(projectId);
        if (!projectDataWithTracks?.tracks) { // Ensure tracks array exists
            console.warn('Project data loaded but contains no tracks array.');
            // Initialize settings even if no tracks?
            if(projectDataWithTracks) await initializeProjectSettings(projectDataWithTracks);
            return projectDataWithTracks || null;
        }
        const tracksToProcess = projectDataWithTracks.tracks || [];

        // Associate sampler tracks with drum tracks
        tracksToProcess.forEach((track) => {
          if (track.track_type === 'SAMPLER' && track.track && 'drum_track_id' in track.track) {
            console.log(`Processing sampler track ${track.id} with drum_track_id ${track.track.drum_track_id}`);
            const samplerTrackData = track.track as SamplerTrackRead; // Cast for type safety
            const drumTrackId = samplerTrackData.drum_track_id;
            const samplerTrackId = track.id;

            if (drumTrackId) {
              const drumTrack = tracksToProcess.find(t => t.id === drumTrackId && t.track_type === 'DRUM');
              // Explicitly check if the found track is a drum track before accessing drum-specific properties
              if (drumTrack && drumTrack.track_type === 'DRUM' && drumTrack.track) {
                 const drumTrackData = drumTrack.track as DrumTrackRead; // Now safe to cast
                 // Ensure samplerTrackIds array exists
                 if (!drumTrackData.sampler_track_ids) {
                    drumTrackData.sampler_track_ids = [];
                 }
                 // Add sampler track ID if it's not already there
                 if (!drumTrackData.sampler_track_ids.includes(samplerTrackId)) {
                    drumTrackData.sampler_track_ids.push(samplerTrackId);
                    console.log(`Associated sampler track ${samplerTrackId} with drum track ${drumTrackId}`);
                 }
              } else {
                console.warn(`Drum track with ID ${drumTrackId} not found or is not a drum track for sampler ${samplerTrackId}`);
              }
            }
          }
        });

        // 2. Download and Cache Audio Files (NEW STEP)
        await downloadAndCacheAudioFiles(tracksToProcess);

        // 3. Initialize project settings
        await initializeProjectSettings(projectDataWithTracks);
        
        // 4. Process tracks (create state objects, basic engine setup)
        const trackProcessingPromises = tracksToProcess.map((apiTrack, index) => 
            processTrack(apiTrack, index) // processTrack should NOT load files anymore
        );
        const trackStates = (await Promise.all(trackProcessingPromises)).filter(Boolean) as CombinedTrack[];
        
        // 5. Update Zustand state with initial track data
        get().updateTracks(trackStates);
        
        // 6. Connect tracks to engines (will load audio from Dexie)
        await connectTracksToEngines(trackStates);
                
        return projectDataWithTracks; 
    }
    return _withErrorHandling(loadLogic, 'loadProject')();
  };

  return {
    projectTitle: "Untitled Project",
    bpm: 120,
    timeSignature: [4, 4],
    keySignature: "C major",
    loadProject,
    loadTrack,
    loadDrumTrack,
    handleProjectParamChange,
    handleKeySignatureChange,
    updateBPMState,
  };
};
