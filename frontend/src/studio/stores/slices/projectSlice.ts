import * as Tone from 'tone';
import { Store } from '../../core/state/store';
import { ProjectWithTracks, CombinedTrack, AudioTrackRead, MidiTrackRead, SamplerTrackRead, DrumTrackRead, CombinedTrackEntity } from 'src/platform/types/project';
import { getProject } from '../../../platform/api/projects';
import { StorageType } from '../../../platform/types/storage';
import { Actions } from '../../core/state/history/actions';
import { DEFAULT_SAMPLER_CONFIG, TRACK_CONFIG } from '../config';
import { getAudioEngine } from '../../core/audio-engine/AudioEngine';
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

    // Sync the new AudioEngine after BPM change (Phase 6 migration)
    rootGet().syncEngineState?.();
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
            storage_type: samplerTrack.storage_type, // IMPORTANT: Preserve storage_type from the AI agent
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
     const initSettings = async (passedStore: Store, projectData: ProjectWithTracks) => {
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

      const processLogic = async (store: Store): Promise<CombinedTrack | null> => {
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

          // 3. Perform necessary ENGINE setup (NO HISTORY)
          const audioEngine = store.getAudioEngine();
          // Create the channel for the track (shared by all instances)
          await audioEngine.createTrackChannel(finalCombinedTrack.id, finalCombinedTrack.name);
          audioEngine.setTrackVolume(finalCombinedTrack.id, finalCombinedTrack.volume);
          audioEngine.setTrackPan(finalCombinedTrack.id, finalCombinedTrack.pan);
          audioEngine.setTrackMute(finalCombinedTrack.id, finalCombinedTrack.mute);
          // Note: Position is now per-instance, not per-track
          
          // Load audio file specifically for audio tracks during initial processing
          if (trackType === 'AUDIO' && finalCombinedTrack.track && 'audio_file_storage_key' in finalCombinedTrack.track) {
              const storageKey = finalCombinedTrack.track.audio_file_storage_key;
              if (storageKey) {
                  console.log(`Attempting to load audio for track ${finalCombinedTrack.id} from key ${storageKey}...`);
                  try {
                      const sampleManager = SampleManager.getInstance(db);
                      const audioBlob = await sampleManager.getSampleBlob(finalCombinedTrack.id, storageKey, 'audio_track', finalCombinedTrack.name);
                      if (audioBlob) {
                          const audioFile = new File([audioBlob.data], finalCombinedTrack.name || 'audio_track', { type: audioBlob.type });
                          
                          // Load the audio buffer and create channel (shared by all instances)
                          const audioEngine = store.getAudioEngine();
                          await audioEngine.loadAudioBuffer(finalCombinedTrack.id, audioFile);
                          await audioEngine.createTrackChannel(finalCombinedTrack.id, finalCombinedTrack.name);
                          
                          // Create all instances for this track
                          if (finalCombinedTrack.instances && finalCombinedTrack.instances.length > 0) {
                              for (const instance of finalCombinedTrack.instances) {
                                  console.log(`Creating audio instance ${instance.id} for track ${finalCombinedTrack.id}`);
                                  await audioEngine.createInstance(finalCombinedTrack.id, instance.id);
                              }
                          } else {
                              // Create default instance for backward compatibility
                              const instanceId = `${finalCombinedTrack.id}_instance_1`;
                              console.log(`Creating default audio instance ${instanceId} for track ${finalCombinedTrack.id}`);
                              await audioEngine.createInstance(finalCombinedTrack.id, instanceId);
                          }
                          
                          console.log(`Loaded audio and created instances for track ${finalCombinedTrack.id}`);
                      } else {
                          console.warn(`Downloaded audio blob was null or undefined for track ${finalCombinedTrack.id}`);
                      }
                  } catch (error) {
                      console.error(`Failed to download or load audio for track ${finalCombinedTrack.id} (key: ${storageKey}):`, error);
                  }
              } else {
                   console.warn(`Audio track ${finalCombinedTrack.id} has no audio_file_storage_key.`);
              }
          }
          
          return finalCombinedTrack;
      };
      
      return _withErrorHandling(async () => _withStore(processLogic)(), `processTrack: ${apiTrack.id}`)();
  };

  // Modified connectTracksToEngines
  const connectTracksToEngines = async (loadedTracks: CombinedTrack[]) => {
      console.log(`Connecting ${loadedTracks.length} tracks to engines...`);
      const { store, _withStore, _withErrorHandling } = rootGet(); 
      if (!_withStore || !_withErrorHandling) { return; }

      const connectLogic = async (store: Store, tracks: CombinedTrack[]) => {
        // Double-check that store is initialized before connecting tracks
        if (!get().isInitialized) {
          console.warn('Store not initialized when connecting tracks to engines, initializing now...');
          await get().initializeAudio();
          console.log('Store initialized during track connection');
        }
        
        const samplerController = store.getTransport().getSamplerController();
        const midiManager = store.getMidiManager();

        for (const track of tracks) {
          console.log(`Connecting track ${track.id} (type: ${track.track_type})`);
          try {
              // --- MIDI Connection --- 
              if (track.track_type === 'MIDI' && track.track && 'instrument_id' in track.track) {
                  const instrumentId = track.track.instrument_id;
                  if (instrumentId) {
                      await store.connectTrackToSoundfont(track.id, instrumentId);
                      console.log(`Connected MIDI track ${track.id} to soundfont ${instrumentId}`);
                  } else { console.warn(`MIDI track ${track.id} missing instrumentId`); }
                  // Load notes from midi_notes_json if available
                  const midiNotesJson = (track.track as any).midi_notes_json;
                  if (midiNotesJson && midiNotesJson.notes) {
                      const notesToLoad = convertJsonToNotes(midiNotesJson, track.id);
                      console.log(`Loading ${notesToLoad.length} notes for MIDI track ${track.id}`);
                      midiManager.updateTrack(track.id, notesToLoad);
                  } else {
                      console.log(`No MIDI notes to load for track ${track.id}`);
                      midiManager.updateTrack(track.id, []);
                  }
                  
                  // Register all instances with MidiManager
                  if (track.instances) {
                      track.instances.forEach((instance, index) => {
                          console.log(`Registering MIDI track ${track.id} instance ${instance.id}`);
                          midiManager.registerInstance(track.id, instance.id);
                      });
                  }
              }
              
              // --- Audio Connection ---
              else if (track.track_type === 'AUDIO') {
                  console.log(`Attempting to connect audio track ${track.id}... checking Dexie.`);
                  const fileFromDb = await db.getAudioFile(track.id);
                  const audioTrackData = track.track as AudioTrackRead | undefined;

                  if (fileFromDb?.data) {
                      console.log(`Found audio for track ${track.id} in Dexie. Loading into engine...`);
                      // Fix: Convert Blob from Dexie back to a File object
                      const audioFile = new File(
                          [fileFromDb.data],
                          fileFromDb.name || track.name || `${track.id}_audio`, // Use name from DB or track
                          { type: fileFromDb.data.type } // Use blob's type
                      );

                      // Load into new AudioEngine (Phase 6 migration)
                      const newEngine = getAudioEngine();
                      if (!newEngine.isReady()) {
                          throw new Error(`connectTracksToEngines: New AudioEngine not ready when loading audio buffer for ${track.id}`);
                      }
                      await newEngine.loadAudioBuffer(track.id, audioFile);
                      console.log(`connectTracksToEngines: Loaded audio buffer into new AudioEngine for ${track.id}`);

                      // Load the audio buffer and create channel (shared by all instances) - legacy engine
                      const audioEngine = store.getAudioEngine();
                      await audioEngine.loadAudioBuffer(track.id, audioFile);
                      await audioEngine.createTrackChannel(track.id, track.name);

                      // Create all instances for this track
                      if (track.instances && track.instances.length > 0) {
                          for (const instance of track.instances) {
                              console.log(`Creating audio instance ${instance.id} for track ${track.id}`);
                              await audioEngine.createInstance(track.id, instance.id);
                          }
                      } else {
                          // Create default instance for backward compatibility
                          const instanceId = `${track.id}_instance_1`;
                          console.log(`Creating default audio instance ${instanceId} for track ${track.id}`);
                          await audioEngine.createInstance(track.id, instanceId);
                      }
                  } else {
                      // Check if this audio track SHOULD have audio (has storage key)
                      const storageKey = audioTrackData?.audio_file_storage_key;
                      if (storageKey) {
                          throw new Error(`connectTracksToEngines: Audio track ${track.id} has audio_file_storage_key (${storageKey}) but no audio file was found in cache`);
                      }
                      console.warn(`Audio file for track ${track.id} not found in Dexie cache (no storage key).`);
                  }
              }

              // --- Sampler Connection --- 
              else if (track.track_type === 'SAMPLER') {
                  if (!samplerController || !midiManager) {
                      console.warn(`SamplerController/MidiManager missing for sampler track ${track.id}`);
                      continue;
                  }
                  const samplerTrackData = track.track as SamplerTrackRead | undefined;
                  const baseMidiNote = samplerTrackData?.base_midi_note ?? DEFAULT_SAMPLER_CONFIG.baseMidiNote;
                  const grainSize = samplerTrackData?.grain_size ?? DEFAULT_SAMPLER_CONFIG.grainSize;
                  const overlap = samplerTrackData?.overlap ?? DEFAULT_SAMPLER_CONFIG.overlap;
                  let sampleFile: Blob | undefined = undefined; // Expect Blob from Dexie

                  console.log(`Attempting to connect sampler track ${track.id}... checking Dexie.`);
                  const fileFromDb = await db.getAudioFile(track.id);
                  if (fileFromDb?.data) {
                       console.log(`Found audio for sampler ${track.id} in Dexie.`);
                       sampleFile = fileFromDb.data; 
                  } else {
                      console.warn(`Audio file for sampler track ${track.id} not found in Dexie cache.`);
                  }

                  if (sampleFile) {
                      // Convert Blob to File if necessary for connectTrackToSampler
                      const fileToConnect = new File([sampleFile], track.name || 'sampler_audio', { type: sampleFile.type });

                      // Load into new AudioEngine (Phase 6 migration)
                      const newEngine = getAudioEngine();
                      if (!newEngine.isReady()) {
                          throw new Error(`connectTracksToEngines: New AudioEngine not ready when loading sampler buffer for ${track.id}`);
                      }
                      await newEngine.loadAudioBuffer(track.id, fileToConnect);
                      console.log(`connectTracksToEngines: Loaded sampler buffer into new AudioEngine for ${track.id}`);

                      // Load into legacy sampler controller
                      console.log(`Connecting sampler ${track.id} with cached file...`);
                      await samplerController.connectTrackToSampler(
                          track.id, fileToConnect, midiManager, baseMidiNote, grainSize, overlap
                      );
                  } else {
                      // Check if this sampler SHOULD have audio (has storage key)
                      const storageKey = samplerTrackData?.audio_storage_key;
                      if (storageKey) {
                          throw new Error(`connectTracksToEngines: Sampler track ${track.id} has audio_storage_key (${storageKey}) but no audio file was found in cache`);
                      }
                      // Only allow empty sampler if there's no storage key (truly empty/new sampler)
                      console.log(`Initializing empty sampler for ${track.id} (no audio_storage_key)...`);
                      await samplerController.initializeSampler(
                          track.id, undefined, baseMidiNote, grainSize, overlap
                      );
                  }
                  const convertedNotes = convertJsonToNotes(samplerTrackData?.midi_notes_json, track.id);
                  midiManager.updateTrack(track.id, convertedNotes);
                  samplerController.registerTrackSubscription(track.id, midiManager);
                  
                  // Register all instances with MidiManager
                  if (track.instances) {
                      track.instances.forEach((instance, index) => {
                          console.log(`Registering sampler track ${track.id} instance ${instance.id}`);
                          midiManager.registerInstance(track.id, instance.id);
                      });
                  }
              }
          } catch (error) {
               console.error(`Error connecting track ${track.id} (type: ${track.track_type}):`, error);
          }
          
          // Apply track parameters (volume, pan, mute) after connection
          try {
              const audioEngine = store.getAudioEngine();
              const soundfontController = store.getSoundfontController();
              const samplerController = store.getSamplerController();
              
              // Set volume
              const volume = track.volume ?? 80;
              audioEngine.setTrackVolume(track.id, volume);
              soundfontController?.setTrackVolume?.(track.id, volume);
              samplerController?.setTrackVolume?.(track.id, volume);
              
              // Set pan
              const pan = track.pan ?? 0;
              audioEngine.setTrackPan(track.id, pan);
              
              // Set mute state
              const muted = track.mute ?? false;
              audioEngine.setTrackMute(track.id, muted);
              soundfontController?.muteTrack?.(track.id, muted);
              samplerController?.muteTrack?.(track.id, muted);
              
              // Set position based on first instance if available
              const firstInstance = track.instances?.[0];
              if (firstInstance) {
                  audioEngine.setTrackPosition(
                      track.id,
                      firstInstance.x_position ?? 0,
                      firstInstance.y_position ?? 0
                  );
              }
              
              console.log(`Applied parameters to track ${track.id}: volume=${volume}, pan=${pan}, muted=${muted}`);
          } catch (paramError) {
              console.error(`Error applying parameters to track ${track.id}:`, paramError);
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
      let storageType: StorageType | undefined = undefined;
      let downloadType: 'audio_track' | 'sample' = 'audio_track'; // Default to audio_track

      if (track.track_type === 'AUDIO' && track.track && 'audio_file_storage_key' in track.track) {
        storageKey = track.track.audio_file_storage_key;
        fileType = track.track.audio_file_format || fileType;
        storageType = (track.track as any).storage_type;
      } else if (track.track_type === 'SAMPLER' && track.track && 'audio_storage_key' in track.track) {
        storageKey = track.track.audio_storage_key;
        fileType = track.track.audio_file_format || fileType;
        storageType = (track.track as any).storage_type;
        // If it's a PUBLIC_DRUM sampler, use 'sample' type for downloading
        if (storageType === 'PUBLIC_DRUM') {
          downloadType = 'sample';
        }
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
        console.log(`Cache miss for track ${track.id}, downloading key ${storageKey} with type ${downloadType} and storageType ${storageType}...`);

        const sampleManager = SampleManager.getInstance(db);
        const audioBlob = await sampleManager.getSampleBlob(track.id, storageKey, downloadType, track.name, storageType);
        
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
        // Skip engine sync here - buffers must be loaded first via connectTracksToEngines
        get().updateTracks(trackStates, true);

        // 6. Connect tracks to engines (will load audio from Dexie)
        await connectTracksToEngines(trackStates);

        // Sync the new AudioEngine after project load (Phase 6 migration)
        rootGet().syncEngineState?.();

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
