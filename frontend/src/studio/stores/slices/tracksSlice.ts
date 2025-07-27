import { TrackInstance } from 'src/platform/types/project';
import { CombinedTrackEntity as CombinedTrack } from 'src/platform/types/entities/project';
import { Position } from '../../components/track';
import { RootState, SetFn, GetFn, TrackParameter, TrackType, TrackOptions, AddTrackPayload, DrumTrackPayload, MidiTrackPayload, AudioTrackPayload, AudioTrackOptions, SamplerTrackOptions, MidiTrackOptions, AnyTrackRead, MidiTrack, AudioTrack, SamplerTrack, AudioTrackRead, MidiTrackRead, SamplerTrackRead, DrumTrackRead, DrumTrackOptions } from '../types';
import { Store } from '../../core/state/store';
import { Actions } from '../../core/state/history/actions';
import type { Action } from '../../core/state/history/actions'; 
import { InstanceAdd, InstanceMove, InstanceResize, InstanceDelete } from '../../core/state/history/actions/InstanceActions';
import { TRACK_CONFIG, DEFAULT_SAMPLER_CONFIG } from '../config';
import { GRID_CONSTANTS, ticksToPixels, pixelsToTicks } from '../../constants/gridConstants';
import { MUSIC_CONSTANTS } from '../../constants/musicConstants';
import { PULSES_PER_QUARTER_NOTE } from '../../utils/noteConversion';
import { produce } from 'immer';
import { StateCreator } from 'zustand';
import { StoreApi } from 'zustand';
import SampleManager from '../../core/samples/sampleManager';
import { db } from '../../core/db/dexie-client';
import { processAudioFile } from '../../utils/audioProcessing';
import { getAudioDuration, calculateAudioDurationTicks } from '../../utils/audioAnalysis';

// Define the state properties and actions for this slice
export interface TracksSlice {
  tracks: CombinedTrack[];
  activeInstanceByTrack: Record<string, string>; // trackId -> instanceId mapping
  
  // Basic state manipulation
  setTracks: (tracks: CombinedTrack[]) => void;
  updateTracks: (newTracks: CombinedTrack[]) => void;
  updateTrackState: (trackId: string, updates: Partial<CombinedTrack & TrackParameter>) => void;
  updateTrack: (trackId: string, updates: Partial<CombinedTrack>) => void; // Alias for updateTrackState
  findTrackById: (trackId: string) => CombinedTrack | undefined;
  updateTrackIndices: () => void;

  // Core track operations (creation/deletion)
  // Note: These will interact heavily with the audio engine and history
  createTrackAndRegisterWithHistory: (type: TrackType, name: string, options?: TrackOptions) => Promise<CombinedTrack | null>;
  handleTrackDelete: (trackId: string) => Promise<void>;

  // Parameter change handlers (generic and specific)
  // These update both the track state and the audio engine, and register history
  handleTrackParameterChange: <K extends keyof TrackParameter>(trackId: string, paramName: K, newValue: TrackParameter[K]) => void;
  handleTrackVolumeChange: (trackId: string, volume: number) => void;
  handleTrackPanChange: (trackId: string, pan: number) => void;
  handleTrackMuteToggle: (trackId: string, muted: boolean) => void;
  handleTrackSoloToggle: (trackId: string, soloed: boolean) => void;
  handleTrackPositionChange: (trackId: string, newPosition: Position, isDragEnd: boolean) => void;
  handleTrackNameChange: (trackId: string, name: string) => void;

  // Add definition for uploadAudioFile
  uploadAudioFile: (file: File, isSampler?: boolean) => Promise<CombinedTrack | null>;

  // Potentially other track-related actions/helpers
  // replaceTrackAudioFile: (trackId: string, file: File) => Promise<void>;
  // handleInstrumentChange: ...

  // Add resize action definition
  handleTrackResizeEnd: (trackId: string, deltaPixels: number, resizeDirection: 'left' | 'right') => void;

  // Add missing action definitions
  handleAddTrack: (type: TrackType, payload?: AddTrackPayload) => Promise<CombinedTrack | null>;
  handleInstrumentChange: (trackId: string, instrumentId: string, instrumentName: string, instrumentStorageKey: string) => Promise<void>; 
  replaceTrackAudioFile: (trackId: string, file: File) => Promise<void>;

  // Expose internal helper for nested updates
  _updateNestedTrackData: (trackId: string, nestedUpdates: Partial<AnyTrackRead>) => void; // Use AnyTrackRead

  // --- Selectors --- 
  selectDrumTrackById: (trackId: string) => DrumTrackRead | undefined;
  selectSamplerTracksForDrumTrack: (drumTrackId: string) => SamplerTrackRead[];

  // New actions
  removeSamplerTrack: (samplerTrackId: string) => Promise<void>;
  addSamplerTrackToDrumTrack: (
    drumTrackId: string,
    sampleData: { id: string; display_name: string; storage_key: string; /* other needed fields? */ }
  ) => Promise<CombinedTrack | null>;

  // Group operations for copy/paste functionality
  duplicateTrack: (trackId: string, newPosition?: Position) => Promise<CombinedTrack | null>;
  duplicateMultipleTracks: (trackIds: string[], offsetX?: number) => Promise<CombinedTrack[]>;
  deleteMultipleTracks: (trackIds: string[]) => Promise<void>;
  resizeMultipleTracks: (trackIds: string[], widthDelta: number, anchor: 'left' | 'right') => Promise<void>;
  
  // Group position operations for group moving
  updateMultipleTrackPositions: (trackIds: string[], deltaX: number, deltaY: number) => Promise<void>;
  
  // Track instance management
  addTrackInstance: (trackId: string, position?: Position, sourceInstance?: Partial<TrackInstance>) => Promise<string | null>;
  updateTrackInstance: (trackId: string, instanceId: string, updates: Partial<TrackInstance>) => void;
  deleteTrackInstance: (trackId: string, instanceId: string) => void;
  getTrackInstances: (trackId: string) => TrackInstance[];
  handleInstancePositionChange: (trackId: string, instanceId: string, newPosition: Position, isDragEnd: boolean) => void;
  handleInstanceResizeEnd: (trackId: string, instanceId: string, deltaPixels: number, resizeDirection: 'left' | 'right') => void;
  updateMultipleInstancePositions: (instanceUpdates: Array<{trackId: string, instanceId: string, deltaX: number, deltaY: number}>) => void;
  resizeMultipleInstances: (instanceUpdates: Array<{trackId: string, instanceId: string, widthDelta: number, anchor: 'left' | 'right'}>) => void;
  deleteMultipleInstances: (instanceDeletions: Array<{trackId: string, instanceId: string}>) => Promise<void>;
}

// Remove local type alias if it causes confusion
// type TracksSliceCreator = StateCreator<RootState, [], [], TracksSlice>;

// Revert to the simpler definition without explicit StateCreator and third argument
export const createTracksSlice = (set: SetFn, get: GetFn): TracksSlice => { 
  const rootGet = get as GetFn; 
  // Get store instance via rootGet when needed inside functions
  // const storeInstance = rootGet().store; // Don't get it here at the top level

  // Utility to set state within this slice or the root state
  const setTracksState = (partial: Partial<TracksSlice> | ((state: TracksSlice) => Partial<TracksSlice>)) => set(partial);
  const updateRootState = <K extends keyof RootState>(
    key: K, 
    value: RootState[K] | ((prev: RootState[K]) => RootState[K])
  ) => {
    const rootUpdater = rootGet()._updateState;
    if (rootUpdater && typeof rootUpdater === 'function') {
      // Pass the value/function directly to the root updater
      rootUpdater(key, value);
    } else {
      console.warn(`_updateState not found, using direct set for key: ${String(key)}`);
      // Pass the value/function directly to Zustand's set
      set({ [key]: value }); 
    }
  };

  // Find a track by ID (local helper)
  const findTrackById = (trackId: string): CombinedTrack | undefined => {
    // !! IMPORTANT: Ensure CombinedTrack type includes `track_number?: number;` !!
    return rootGet().tracks.find((t) => t.id === trackId);
  };

  // Helper: expand selection to include sampler tracks when drum tracks are present
  const expandDrumSelection = (trackIds: string[]): string[] => {
    const expanded: string[] = [];
    for (const trackId of trackIds) {
      expanded.push(trackId);
      const track = findTrackById(trackId);
      if (track?.track_type === 'DRUM' && track.track) {
        const drumTrack = track.track as DrumTrackRead;
        if (drumTrack.sampler_track_ids) {
          expanded.push(...drumTrack.sampler_track_ids);
        }
      }
    }
    return [...new Set(expanded)]; // Remove duplicates
  };


  // Update a specific track's state in the tracks array
  const updateTrackState = (trackId: string, updates: Partial<CombinedTrack & TrackParameter>) => {
    set(produce((draft: RootState) => {
        const trackIndex = draft.tracks.findIndex(t => t.id === trackId);
        if (trackIndex !== -1) {
            Object.assign(draft.tracks[trackIndex], updates);
            // Mark track as dirty when modified, unless explicitly setting dirty to false
            if (updates.dirty !== false) {
                draft.tracks[trackIndex].dirty = true;
            }
        }
    }));
  };

  // Update all tracks and recalculate indices
  const updateTracks = (newTracks: CombinedTrack[]) => {
      // Debug logging for track positions
      console.log('[updateTracks Debug] Tracks being added:', newTracks.map(track => ({
          id: track.id,
          name: track.name,
          track_type: track.track_type,
          instances: track.instances?.map(inst => ({ id: inst.id, x: inst.x_position, y: inst.y_position }))
      })));

      set(produce((draft: RootState) => {
          // Create a fresh array with cloned tracks to avoid frozen object issues
          draft.tracks = newTracks.map((track, index) => ({
              ...track,
              track_number: index,
              // Ensure each track has instances
              instances: track.instances 
                  // ? track.instances 
                  // : [{
                  //     id: `${track.id}_instance_1`,
                  //     x_position: track.x_position || 0,
                  //     y_position: track.y_position || 0,
                  //     trim_start_ticks: track.trim_start_ticks || 0,
                  //     trim_end_ticks: track.trim_end_ticks || track.duration_ticks || 1920
                  // }]
          }));
      }));
      
      // After updating tracks, register instances with MidiManager
      const midiManager = rootGet().store?.getMidiManager();
      console.log('[updateTracks] MidiManager available:', !!midiManager);
      if (midiManager) {
          // Use the tracks from state after the update
          rootGet().tracks.forEach(track => {
              // Only process MIDI-based tracks
              if (track.track_type === 'MIDI' || track.track_type === 'SAMPLER' || track.track_type === 'DRUM') {
                  console.log(`[updateTracks] Processing ${track.track_type} track ${track.id} with ${track.instances?.length || 0} instances`);
                  // Ensure track exists in MidiManager
                  if (!midiManager.hasTrack(track.id)) {
                      midiManager.createTrack(track.id, track.track_type.toLowerCase(), track.name);
                  }
                  
                  // Register all instances
                  if (track.instances && track.instances.length > 0) {
                      track.instances.forEach(instance => {
                          midiManager.registerInstance(track.id, instance.id);
                      });
                      
                      // Migrate notes without instance IDs to the first instance
                      midiManager.migrateNotesToFirstInstance(track.id, track.instances[0].id);
                  }
              }
          });
      }
  };

  // Action to recalculate and add/update the index property for UI ordering
  const updateTrackIndices = () => {
    set(produce((draft: RootState) => {
        draft.tracks.forEach((track, index) => {
            // Mutate draft directly
            // !! IMPORTANT: Ensure CombinedTrack has track_number !!
            track.track_number = index; 
        });
    }));
  };

  // Internal helper to update the nested track object using Immer
  const _updateNestedTrackData = (trackId: string, nestedUpdates: Partial<AnyTrackRead>) => {
    set(produce((draft: RootState) => {
        const trackIndex = draft.tracks.findIndex(t => t.id === trackId);
        if (trackIndex !== -1 && draft.tracks[trackIndex].track) {
            Object.assign(draft.tracks[trackIndex].track, nestedUpdates);
        } else {
            console.warn(`_updateNestedTrackData: Track or track.track not found for ID ${trackId}`);
        }
    }));
  };

  // Helper to correct audio track durations directly in draft state
  const correctAudioTrackDurations = (tracks: CombinedTrack[], currentBpm: number) => {
      tracks.forEach(track => {
          if (track.track_type === 'AUDIO' && track.instances) {
              const audioDuration = getAudioDuration(track);
              if (audioDuration > 0) {
                  const correctDurationTicks = calculateAudioDurationTicks(audioDuration, currentBpm);
                  
                  // Check if instances need to be updated (have default/incorrect values)
                  const needsUpdate = track.instances.some(instance => 
                      instance.trim_end_ticks === 1920 || 
                      instance.trim_end_ticks <= 0 ||
                      isNaN(instance.trim_end_ticks)
                  );
                  
                  if (needsUpdate) {
                      // Update instances directly in the track (will be in draft state when called from setTracks)
                      track.instances = track.instances.map(instance => ({
                          ...instance,
                          trim_end_ticks: correctDurationTicks
                      }));
                      
                      // Update track duration directly
                      track.duration_ticks = correctDurationTicks;
                  }
              }
          }
      });
  };

  // Explicitly define setTracks within the slice scope
  const setTracks = (newTracks: CombinedTrack[]) => {
      const currentBpm = rootGet().bpm || 120;
      
      set(produce((draft: RootState) => {
          draft.tracks = newTracks;
          draft.tracks.forEach((track, index) => { 
              // !! IMPORTANT: Ensure CombinedTrack has track_number !!
              track.track_number = index;
              // Mark loaded tracks as clean (not dirty) since they come from database
              track.dirty = false;
              
              // // Handle backward compatibility: create default instance if none exist
              // if (!track.instances || track.instances.length === 0) {
              //     console.log(`Track ${track.id} has no instances, creating default instance`);
              //     track.instances = [{
              //         id: `${track.id}_instance_1`,
              //         x_position: track.x_position || 0,
              //         y_position: track.y_position || 0,
              //         trim_start_ticks: track.trim_start_ticks || 0,
              //         trim_end_ticks: track.trim_end_ticks || track.duration_ticks || 1920
              //     }];
              // }
          });
          
          // Correct audio track durations within the same state update
          correctAudioTrackDurations(draft.tracks, currentBpm);
      }), true);
      
      // After setting tracks, register instances with MidiManager and migrate notes
      const midiManager = rootGet().store?.getMidiManager();
      console.log('[setTracks] MidiManager available:', !!midiManager);
      if (midiManager) {
          newTracks.forEach(track => {
              // Only process MIDI-based tracks
              if (track.track_type === 'MIDI' || track.track_type === 'SAMPLER' || track.track_type === 'DRUM') {
                  console.log(`[setTracks] Processing ${track.track_type} track ${track.id} with ${track.instances?.length || 0} instances`);
                  // Ensure track exists in MidiManager
                  if (!midiManager.hasTrack(track.id)) {
                      midiManager.createTrack(track.id, track.track_type.toLowerCase(), track.name);
                  }
                  
                  // Register all instances
                  if (track.instances && track.instances.length > 0) {
                      track.instances.forEach(instance => {
                          midiManager.registerInstance(track.id, instance.id);
                      });
                      
                      // Migrate notes without instance IDs to the first instance
                      midiManager.migrateNotesToFirstInstance(track.id, track.instances[0].id);
                  }
              }
          });
      }
  };

  // --- Selectors Implementation --- 
  const selectDrumTrackById = (trackId: string): DrumTrackRead | undefined => {
    const track = findTrackById(trackId); // Use the slice's findTrackById
    // Ensure track and track.track exist and type is correct
    return (track && track.track_type === 'DRUM' && track.track) ? track.track as DrumTrackRead : undefined;
  };

  const selectSamplerTracksForDrumTrack = (drumTrackId: string): SamplerTrackRead[] => {
    const tracks = rootGet().tracks; // Get current tracks from root state
    return tracks
      // Ensure track and track.track exist before filtering
      .filter(t => 
          t.track_type === 'SAMPLER' && 
          t.track && 
          (t.track as SamplerTrackRead).drum_track_id === drumTrackId
      )
      .map(t => t.track as SamplerTrackRead); // Map to the nested track data
  };

  // --- TODO: Implement Core Track Operations (createTrackAndRegisterWithHistory, handleTrackDelete) --- 
  const createTrackAndRegisterWithHistory = async (
    type: TrackType,
    name: string,
    options: TrackOptions = {}
  ): Promise<CombinedTrack | null> => {
    const { timeSignature, bpm, tracks, executeHistoryAction, _withStore, _withErrorHandling } = rootGet();

    if (!_withStore || !_withErrorHandling) {
        console.error("_withStore or _withErrorHandling not available");
        return null;
    }

    const createLogic = async (passedStore: Store): Promise<CombinedTrack | null> => {
      const trackId = (options.id || options.trackId) ?? crypto.randomUUID(); 
      const tracksLength = rootGet().tracks.length;
      
      // Debug logging to see what position is being passed
      console.log('[Track Position Debug]', {
        trackId,
        tracksLength,
        'options.position': options.position,
        'calculated sequential position': { x: 0, y: tracksLength * GRID_CONSTANTS.trackHeight }
      });
      
      const position = options.position as Position || { x: 0, y: tracksLength * GRID_CONSTANTS.trackHeight };
      
      console.log('[Track Position Debug] Final position used:', position);
      
      const trackProps = {
        id: trackId,
        volume: options.volume ?? 80,
        pan: options.pan ?? 0,
        muted: options.muted ?? false,
        soloed: options.soloed ?? false,
        // Include potentially relevant options if needed by store.createTrack
        instrumentId: (options as any).instrumentId,
        instrumentName: (options as any).instrumentName,
        instrumentStorageKey: (options as any).instrumentStorageKey,
      };
      
      const typeConfig = TRACK_CONFIG[type];
      if (!typeConfig) throw new Error(`Invalid track type: ${type}`);
      
      // Extract the file object early
      const file = type === 'AUDIO' ? (options as AudioTrackOptions).audioFile : 
                   type === 'SAMPLER' ? (options as SamplerTrackOptions).sampleFile : 
                   undefined;

      // Handle audio file cache update for existing tracks (ID stays the same)
      if (type === 'AUDIO' && (options as any).isExistingTrack && file) {
        try {
          // Ensure the audio file is cached with the preserved track ID
          await db.upsertAudioFile(trackId, file, (options as any).audio_file_duration || 0);
        } catch (error) {
          console.warn('Failed to ensure audio file cache for existing track:', error);
        }
      }

      await passedStore.getAudioEngine().createTrack(trackId, name); 
      
      // Calculate defaults
      const beatsPerBar = timeSignature[0]; 
      const defaultBars = 4;
      const totalBeats = defaultBars * beatsPerBar;
      // TODO: Confirm PULSES_PER_QUARTER_NOTE is appropriate for ticks calculation relative to project settings
      const defaultDurationTicks = totalBeats * PULSES_PER_QUARTER_NOTE; 
      
      // Calculate duration_ticks for audio tracks
      let calculatedDurationTicks = options.duration ?? defaultDurationTicks;
      if (type === 'AUDIO') {
        const audioDuration = (options as AudioTrackOptions).audio_file_duration;
        if (audioDuration && audioDuration > 0) {
          calculatedDurationTicks = calculateAudioDurationTicks(audioDuration, bpm);
        }
      }

      // Build base trackData (serializable)
      const trackData: Omit<CombinedTrack, 'track'> & { track?: any } = {
        id: trackId,
        name: name, 
        track_type: type,
        track_number: tracksLength + 1, // Add track number
        volume: trackProps.volume,
        pan: trackProps.pan,
        mute: trackProps.muted, 
        duration_ticks: calculatedDurationTicks,
        dirty: true, // New tracks are dirty by default (need to be saved)
        // Initialize with empty instances array
        instances: [],
      };
      
      // Get initial *serializable* nested track properties
      const typeSpecificProps = typeConfig.initTrack(trackId, undefined); // Pass undefined for file here
      Object.assign(trackData, typeSpecificProps); // Assign top-level props like baseMidiNote
      let nestedTrackDataObject: any = { ...typeSpecificProps, type, id: trackId, name: name };
      
      // Add only *serializable* type-specific data available at creation
      if (type === 'MIDI') {
          const midiOptions = options as MidiTrackOptions;
          nestedTrackDataObject = {
              ...nestedTrackDataObject,
              instrument_id: midiOptions.instrumentId,
              instrument_name: midiOptions.instrumentName,
              instrument_storage_key: midiOptions.instrumentStorageKey,
              notes: [], 
              // Construct instrument_file object
              instrument_file: midiOptions.instrumentId ? { 
                  id: midiOptions.instrumentId, 
                  name: midiOptions.instrumentName || '', 
                  storage_key: midiOptions.instrumentStorageKey || '' 
              } : undefined
          } as MidiTrack;
      } 
      else if (type === 'AUDIO') {
          const audioOptions = options as AudioTrackOptions;
          nestedTrackDataObject = {
              ...nestedTrackDataObject,
              audio_file_storage_key: audioOptions.storage_key,
              audio_file_name: audioOptions.audio_file_name, // Get name from extracted file variable
              // Metadata initialized as undefined
              audio_file_format: audioOptions.audio_file_format,
              audio_file_size: audioOptions.audio_file_size,
              audio_file_duration: audioOptions.audio_file_duration,
              audio_file_sample_rate: audioOptions.audio_file_sample_rate,
              waveform_data: audioOptions.waveform_data,
          } // NO audioFile property here
      }
      else if (type === 'SAMPLER') {
           const samplerOptions = options as SamplerTrackOptions;
           nestedTrackDataObject = {
              ...nestedTrackDataObject,
              baseMidiNote: samplerOptions.baseMidiNote ?? DEFAULT_SAMPLER_CONFIG.baseMidiNote,
              grainSize: samplerOptions.grainSize ?? DEFAULT_SAMPLER_CONFIG.grainSize,
              overlap: samplerOptions.overlap ?? DEFAULT_SAMPLER_CONFIG.overlap,
              audio_file_name: file?.name, // Get name from extracted file variable
              storage_key: samplerOptions.storage_key,
              drum_track_id: samplerOptions.drum_track_id || null,
              waveform_data: samplerOptions.waveform_data,
              // NO sampleFile property here
           }
      }
      
      // Calculate proper trim_end_ticks for audio tracks
      let initialTrimEndTicks = options.trim_end_ticks;
      if (!initialTrimEndTicks) {
        if (type === 'AUDIO') {
          // For audio tracks, calculate duration based on actual audio file
          const audioDuration = (options as AudioTrackOptions).audio_file_duration;
          if (audioDuration && audioDuration > 0) {
            initialTrimEndTicks = calculateAudioDurationTicks(audioDuration, bpm);
          } else {
            initialTrimEndTicks = options.duration ?? defaultDurationTicks;
          }
        } else {
          initialTrimEndTicks = options.duration ?? defaultDurationTicks;
        }
      }

      const initialInstance = {
          id: `${trackId}_instance_1`,
          x_position: position.x,
          y_position: position.y,
          trim_start_ticks: options.trim_start_ticks ?? 0,
          trim_end_ticks: initialTrimEndTicks
      };
      
      const finalTrackData = { 
          ...trackData, 
          track: nestedTrackDataObject as AnyTrackRead,
          // Initialize with a single instance
          instances: [initialInstance]
      } as CombinedTrack;
      
      console.log('[Track Creation] New track with instance:', {
          trackId,
          trackName: name,
          trackType: type,
          instance: initialInstance
      });

      // Register instance with MidiManager for MIDI-based tracks
      if (type === 'MIDI' || type === 'SAMPLER' || type === 'DRUM') {
          const midiManager = passedStore.getMidiManager();
          if (midiManager) {
              // First create the track in MidiManager if it doesn't exist
              if (!midiManager.hasTrack(trackId)) {
                  midiManager.createTrack(trackId, type.toLowerCase(), name);
              }
              // Register the instance
              midiManager.registerInstance(trackId, initialInstance.id);
          }
      }

      // Create action, passing the serializable trackData AND the separate file object
      const action = new Actions.AddTrack(get, finalTrackData, file); 
      
      // Execute history action 
      await rootGet().executeHistoryAction(action);
      
      return finalTrackData; 
    };

    return _withErrorHandling(async () => _withStore(createLogic)(), `createTrackAndRegisterWithHistory: ${type}`)();
  };

  // Creates a track without registering it in history - used for batch operations
  const createTrackWithoutHistory = async (
    type: TrackType,
    name: string,
    options: TrackOptions = {}
  ): Promise<{ trackData: CombinedTrack, file?: File } | null> => {
    const { timeSignature, bpm, tracks, _withStore, _withErrorHandling } = rootGet();

    if (!_withStore || !_withErrorHandling) {
        console.error("_withStore or _withErrorHandling not available");
        return null;
    }

    const createLogic = async (passedStore: Store): Promise<{ trackData: CombinedTrack, file?: File } | null> => {
      const trackId = (options.id || options.trackId) ?? crypto.randomUUID(); 
      const tracksLength = rootGet().tracks.length;
      const position = options.position as Position || { x: 0, y: tracksLength * GRID_CONSTANTS.trackHeight };
      
      const trackProps = {
        id: trackId,
        volume: options.volume ?? 80,
        pan: options.pan ?? 0,
        muted: options.muted ?? false,
        soloed: options.soloed ?? false,
        instrumentId: (options as any).instrumentId,
        instrumentName: (options as any).instrumentName,
        instrumentStorageKey: (options as any).instrumentStorageKey,
      };
      
      const typeConfig = TRACK_CONFIG[type];
      if (!typeConfig) throw new Error(`Invalid track type: ${type}`);
      
      // Extract the file object early
      const file = type === 'AUDIO' ? (options as AudioTrackOptions).audioFile : 
                   type === 'SAMPLER' ? (options as SamplerTrackOptions).sampleFile : 
                   undefined;

      // Don't create in audio engine yet - that will be done by the action
      
      // Calculate defaults
      const beatsPerBar = timeSignature[0]; 
      const defaultBars = 4;
      const totalBeats = defaultBars * beatsPerBar;
      const defaultDurationTicks = totalBeats * PULSES_PER_QUARTER_NOTE; 
      
      // Build base trackData (serializable)
      const trackData: Omit<CombinedTrack, 'track'> & { track?: any } = {
        id: trackId,
        name: name, 
        track_type: type,
        track_number: tracksLength + 1, // Add track number
        volume: trackProps.volume,
        pan: trackProps.pan,
        mute: trackProps.muted, 
        duration_ticks: options.duration ?? defaultDurationTicks,
        dirty: true, // New tracks are dirty by default (need to be saved)
        // Initialize with empty instances array
        instances: [],
      };
      
      // Get initial *serializable* nested track properties
      const typeSpecificProps = typeConfig.initTrack(trackId, undefined); // Pass undefined for file here
      Object.assign(trackData, typeSpecificProps); // Assign top-level props like baseMidiNote
      let nestedTrackDataObject: any = { ...typeSpecificProps, type, id: trackId, name: name };
      
      // Add only *serializable* type-specific data available at creation
      if (type === 'MIDI') {
          const midiOptions = options as MidiTrackOptions;
          nestedTrackDataObject = {
              ...nestedTrackDataObject,
              instrument_id: midiOptions.instrumentId,
              instrument_name: midiOptions.instrumentName,
              instrument_storage_key: midiOptions.instrumentStorageKey,
              notes: [], 
              // Construct instrument_file object
              instrument_file: midiOptions.instrumentId ? { 
                  id: midiOptions.instrumentId, 
                  name: midiOptions.instrumentName || '', 
                  storage_key: midiOptions.instrumentStorageKey || '' 
              } : undefined
          } as MidiTrack;
      } 
      else if (type === 'AUDIO') {
          const audioOptions = options as AudioTrackOptions;
          nestedTrackDataObject = {
              ...nestedTrackDataObject,
              audio_file_storage_key: audioOptions.storage_key,
              audio_file_name: audioOptions.audio_file_name,
              audio_file_format: audioOptions.audio_file_format,
              audio_file_size: audioOptions.audio_file_size,
              audio_file_duration: audioOptions.audio_file_duration,
              audio_file_sample_rate: audioOptions.audio_file_sample_rate,
              waveform_data: audioOptions.waveform_data,
          };
      }
      else if (type === 'SAMPLER') {
           const samplerOptions = options as SamplerTrackOptions;
           nestedTrackDataObject = {
              ...nestedTrackDataObject,
              baseMidiNote: samplerOptions.baseMidiNote ?? DEFAULT_SAMPLER_CONFIG.baseMidiNote,
              grainSize: samplerOptions.grainSize ?? DEFAULT_SAMPLER_CONFIG.grainSize,
              overlap: samplerOptions.overlap ?? DEFAULT_SAMPLER_CONFIG.overlap,
              audio_file_name: file?.name,
              storage_key: samplerOptions.storage_key,
              drum_track_id: samplerOptions.drum_track_id || null,
              waveform_data: samplerOptions.waveform_data,
           };
      }
      
      const finalTrackData = { 
          ...trackData, 
          track: nestedTrackDataObject as AnyTrackRead,
          // Initialize with a single instance
          instances: [{
              id: `${trackId}_instance_1`,
              x_position: position.x,
              y_position: position.y,
              trim_start_ticks: options.trim_start_ticks ?? 0,
              trim_end_ticks: options.trim_end_ticks ?? (options.duration ?? defaultDurationTicks)
          }]
      } as CombinedTrack;

      // Return the data without executing any action
      return { trackData: finalTrackData, file };
    };

    return _withErrorHandling(async () => _withStore(createLogic)(), `createTrackWithoutHistory: ${type}`)();
  };

  const handleTrackDelete = async (trackId: string) => {
      const { executeHistoryAction, _withStore, _withErrorHandling } = rootGet();
      const storeInstance = rootGet().store; // Get the Store instance
      const trackToDelete = findTrackById(trackId);

      if (!trackToDelete) {
          console.error(`Track ${trackId} not found for deletion`);
          return;
      }

      // If this is a drum track, delete it together with all its samplers
      if (trackToDelete.track_type === 'DRUM') {
          const allTrackIds = expandDrumSelection([trackId]);
          await deleteMultipleTracks(allTrackIds);
          return;
      }

      if (!storeInstance || !_withStore || !_withErrorHandling) {
          console.error("_withStore or _withErrorHandling not available for delete");
          return;
      }

      const deleteLogic = async (passedStore: Store) => {
          
          // Create history action BEFORE modifying state
          const action = new Actions.DeleteTrack(get, { ...trackToDelete });

          set(produce((draft: RootState) => {
              const initialLength = draft.tracks.length;
              draft.tracks = draft.tracks.filter(t => t.id !== trackId);
              if (draft.tracks.length < initialLength) { // Only re-index if deletion occurred
                  draft.tracks.forEach((track, index) => { 
                      // !! IMPORTANT: Ensure CombinedTrack has track_number !!
                      track.track_number = index; 
                  }); 
              }
          }));

          try {
              await passedStore.getAudioEngine().removeTrack(trackId);
          } catch (engineError) {
              console.error(`Error removing track ${trackId} from audio engine:`, engineError);
          }

          try {
              if (trackToDelete.track_type === 'SAMPLER') {
              }
              if (trackToDelete.track_type === 'MIDI') {
              }
          } catch (disconnectError) {
              console.error(`Error during track disconnection for ${trackId}:`, disconnectError);
          }

          // Execute history action AFTER state change (or consider order)
          await executeHistoryAction(action);
      };

      await _withErrorHandling(async () => _withStore(deleteLogic)(), `handleTrackDelete: ${trackId}`)();
  };

  // --- New: removeSamplerTrack Action Implementation --- 
  const removeSamplerTrack = async (samplerTrackId: string) => {
    const { executeHistoryAction, _withErrorHandling } = rootGet();
    const samplerTrack = findTrackById(samplerTrackId); // Use slice's findTrackById

    // 1. Basic Validation
    if (!samplerTrack || samplerTrack.track_type !== 'SAMPLER' || !samplerTrack.track) {
        console.error(`Sampler track ${samplerTrackId} not found or invalid.`);
        return;
    }
    const drumTrackId = (samplerTrack.track as SamplerTrackRead)?.drum_track_id;

    // 2. Delete the Sampler Track Itself (using the refactored handleTrackDelete)
    // Note: We call handleTrackDelete, NOT Actions.DeleteTrack directly, 
    // because handleTrackDelete includes engine removal and state updates.
    // The history action for deleting the sampler itself is handled within handleTrackDelete.
    await handleTrackDelete(samplerTrackId); 

    // 3. Update Parent Drum Track (if applicable)
    if (drumTrackId) {
        // Need to use _withErrorHandling or similar if accessing state after potential async operations
        const updateParentLogic = async () => { // Wrap in async for safety
            const parentDrumTrack = selectDrumTrackById(drumTrackId); // Use the selector

            if (parentDrumTrack) {
                const oldSamplerIds = parentDrumTrack.sampler_track_ids || [];
                const newSamplerIds = oldSamplerIds.filter(id => id !== samplerTrackId);

                if (oldSamplerIds.length !== newSamplerIds.length) {
                    
                    // Update parent state using Immer via _updateNestedTrackData
                    _updateNestedTrackData(drumTrackId, { sampler_track_ids: newSamplerIds } as Partial<DrumTrackRead>);

                    // History action for the PARENT update
                    const parentUpdateAction = new Actions.UpdateDrumTrackSamplers(
                        get,
                        drumTrackId,
                        oldSamplerIds,
                        newSamplerIds
                    );
                    await executeHistoryAction(parentUpdateAction); 
                } else {
                    }
            } else {
                console.warn(`Parent drum track ${drumTrackId} not found after deleting sampler ${samplerTrackId}. Cannot update parent.`);
            }
        };
        
        // Wrap the parent update logic in error handling
        if (_withErrorHandling) { 
            await _withErrorHandling(updateParentLogic, `removeSamplerTrackParentUpdate: ${samplerTrackId}`)();
        } else {
            console.error("_withErrorHandling not available for parent update in removeSamplerTrack");
            await updateParentLogic(); // Attempt without handler
        }
    } else {
    }
  };

  // --- Parameter Change Handlers --- 
  const handleTrackParameterChange = <K extends keyof TrackParameter>(
    trackId: string, 
    paramName: K, 
    newValue: TrackParameter[K]
  ) => {
    const { executeHistoryAction, _withStore, _withErrorHandling } = rootGet();
    // Get store instance inside the handler if not using _withStore
    const currentStoreInstance = rootGet().store; 
    if (!currentStoreInstance) {
      console.error("_withStore not available for parameter change");
      return;
    }
    if (!_withStore || !_withErrorHandling) {
      console.error("_withStore or _withErrorHandling not available for parameter change");
      return;
    }

    // Make changeLogic async to ensure it returns a Promise
    const changeLogic = async (passedStore: Store) => { // _withStore still provides it
      const track = findTrackById(trackId); 
      if (!track) { 
        console.error(`Track with ID ${trackId} not found in handleTrackParameterChange`);
        return; 
      }
      const oldValue = (track as any)[paramName];
      if (paramName !== 'position' && oldValue === newValue) return;

      // Prepare update object
      const updateObj: Partial<CombinedTrack & TrackParameter> = {};
      let engineUpdateNeeded = true;
      const historyParamName = paramName as string;

      if (paramName === 'muted') {
        updateObj.mute = newValue as boolean; 
        updateObj.muted = newValue as boolean; 
      } else if (paramName === 'name') {
        updateObj.name = newValue as string;
        engineUpdateNeeded = false; 
      } else if (paramName === 'position' || paramName === 'soloed') {
         // Should be handled by specific handlers, exit here
         console.warn(`Direct change via handleTrackParameterChange is discouraged for ${paramName}.`);
         engineUpdateNeeded = false;
         return;
      } else {
        (updateObj as any)[paramName] = newValue;
      }

      // Update State
      updateTrackState(trackId, updateObj);
      
      // Update Audio Engine 
      if (engineUpdateNeeded) {
        const audioEngine = passedStore.getAudioEngine();
        switch (paramName) {
          case 'volume': audioEngine.setTrackVolume(trackId, newValue as number); break;
          case 'pan': audioEngine.setTrackPan(trackId, newValue as number); break;
          // Mute/Solo handled by specific handlers
        }
      }
      
      // Create and Execute History Action
      const convertToActionValue = (val: any): number => {
        if (typeof val === 'boolean' ) return val ? 1 : 0;
        if (typeof val === 'number' ) return val;
        return 0; 
      };
      const oldActionValue = convertToActionValue(oldValue);
      const newActionValue = convertToActionValue(newValue);
      
      const action = new Actions.ParameterChange(
        get,
        trackId,
        historyParamName as any, 
        oldActionValue,
        newActionValue
      );
      
      await executeHistoryAction(action); // Await the history action
    };

    // Pass the _withStore HOF result to _withErrorHandling
    _withErrorHandling(async () => _withStore(changeLogic)(), `handleTrackParameterChange: ${String(paramName)}`)(); 
  };

  const handleTrackPositionChange = (trackId: string, newPosition: Position, isDragEnd: boolean) => {
    const { bpm, timeSignature, isPlaying, executeHistoryAction, _withErrorHandling } = rootGet();
    const storeInstance = rootGet().store; // Get the Store instance

    if (!storeInstance) {
        console.error("_withErrorHandling is not available in handleTrackPositionChange");
        return;
    }
    if (!_withErrorHandling) {
        console.error("_withErrorHandling is not available in handleTrackPositionChange");
        return;
    }

    // Fix 3: Make changeLogic async
    const changeLogic = async () => {
        if (!storeInstance) {
            console.error('Store not available in handleTrackPositionChange');
            return;
        }
        
        const track = findTrackById(trackId);
        if (!track) {
            console.error(`Track ${trackId} not found in handleTrackPositionChange`);
            return;
        }
        
        // Get the first instance (for now we're working with single instances)
        const instances = track.instances || [];
        if (instances.length === 0) {
            console.error(`Track ${trackId} has no instances`);
            return;
        }
        
        const firstInstance = instances[0];
        const oldPosition = { x: firstInstance.x_position, y: firstInstance.y_position };

        // Skip if nothing changed at drag end
        if (isDragEnd && 
            oldPosition.x === newPosition.x && 
            oldPosition.y === newPosition.y) {
            console.log('No position change detected - skipping update');
            return;
        }
        
        // Update the instance position
        const updatedInstances = instances.map((instance, idx) => 
            idx === 0 
                ? { ...instance, x_position: newPosition.x, y_position: newPosition.y }
                : instance
        );
        
        console.log('[Instance Update] Position change:', {
            trackId,
            instanceId: firstInstance.id,
            oldPosition,
            newPosition,
            updatedInstance: updatedInstances[0]
        });
        
        // Update track state with new instances array
        updateTrackState(trackId, { 
            instances: updatedInstances,
            dirty: true
        });
        
        // Update audio engine
        storeInstance.getAudioEngine().setTrackPosition(trackId, newPosition.x, newPosition.y);
        
        if (isDragEnd) {
            // Use instance action for history
            const action = new InstanceMove(
                get,
                trackId,
                firstInstance.id,
                oldPosition.x,
                oldPosition.y,
                newPosition.x,
                newPosition.y
            );
            await executeHistoryAction(action);
            
            if (isPlaying && storeInstance.getTransport()?.handleTrackPositionChange) {
              storeInstance.getTransport().handleTrackPositionChange(trackId, newPosition.x);
            }
        }
    };
    
    _withErrorHandling(changeLogic, 'handleTrackPositionChange')(); // Pass async function directly
  };

  const handleTrackSoloToggle = (trackId: string, soloed: boolean) => {
    const { tracks, executeHistoryAction, _withStore, _withErrorHandling } = rootGet();
    const storeInstance = rootGet().store; // Get the Store instance

    if (!storeInstance) {
      console.error("_withStore or _withErrorHandling not available for solo toggle");
      return;
    }
    if (!_withStore || !_withErrorHandling) {
      console.error("_withStore or _withErrorHandling not available for solo toggle");
      return;
    }

    const soloLogic = (passedStore: Store) => {
        updateTrackState(trackId, { soloed: soloed, solo: soloed }); // Use local helper

        const currentTracks = rootGet().tracks;
        const targetTrack = currentTracks.find(t => t.id === trackId);
        if (!targetTrack) return; // Should not happen if updateTrackState worked
        
        // Re-evaluate solo status based on the *current* state of all tracks
        const isAnyTrackSoloed = currentTracks.some(t => (t as any).soloed); 

        const audioEngine = passedStore.getAudioEngine();
        const historyActions = [];

        // Helper function to check if a track should be unmuted based on solo relationships
        const shouldTrackBeUnmuted = (track: CombinedTrack): boolean => {
            if (!isAnyTrackSoloed) return true; // If nothing is soloed, unmute all
            if ((track as any).soloed) return true; // If this track itself is soloed
            
            // Special handling for drum tracks and their samplers
            if (track.track_type === 'SAMPLER' && track.track) {
                const samplerData = track.track as SamplerTrackRead;
                if (samplerData.drum_track_id) {
                    // Check if the parent drum track is soloed
                    const parentDrumTrack = currentTracks.find(t => t.id === samplerData.drum_track_id);
                    if (parentDrumTrack && (parentDrumTrack as any).soloed) {
                        return true; // Keep sampler tracks unmuted if their drum track is soloed
                    }
                }
            }
            
            return false; // Mute everything else
        };

        for (const track of currentTracks) {
            const oldMuteState = track.mute;
            const shouldBeMuted = !shouldTrackBeUnmuted(track);
            
            if (oldMuteState !== shouldBeMuted) {
                updateTrackState(track.id, { mute: shouldBeMuted }); // Use local helper
                audioEngine.setTrackMute(track.id, shouldBeMuted);
                
                const action = new Actions.ParameterChange( get, track.id, 'muted', oldMuteState ? 1 : 0, shouldBeMuted ? 1 : 0 );
                historyActions.push(action);
            }
        }
        // Use get() to call historySlice action
        historyActions.forEach(action => rootGet().executeHistoryAction(action));
    };

    _withErrorHandling(async () => _withStore(soloLogic)(), `handleTrackSoloToggle: ${trackId}`)();
  };

  // Implementation for uploadAudioFile
  const uploadAudioFile = async (
    file: File, 
    isSampler = false
  ): Promise<CombinedTrack | null> => {
    const { _withErrorHandling } = rootGet();
    
    const uploadLogic = async (): Promise<CombinedTrack | null> => {
        const trackName = file.name.split('.').slice(0, -1).join('.') || file.name; // Get filename without extension
        const trackType: TrackType = isSampler ? 'SAMPLER' : 'AUDIO';
        
        // Process audio file to get metadata including waveform data
        const metadata = await processAudioFile(file);
        
        const options: TrackOptions = isSampler 
            ? { 
                id: crypto.randomUUID(), 
                sampleFile: file, 
                ...DEFAULT_SAMPLER_CONFIG,
                audio_file_format: metadata.format,
                audio_file_duration: metadata.duration,
                audio_file_size: file.size,
                audio_file_sample_rate: metadata.sampleRate,
                waveform_data: metadata.waveform
            } 
            : { 
                id: crypto.randomUUID(), 
                audioFile: file,
                audio_file_format: metadata.format,
                audio_file_duration: metadata.duration,
                audio_file_size: file.size,
                audio_file_sample_rate: metadata.sampleRate,
                waveform_data: metadata.waveform
            };

        await SampleManager.getInstance(db).putSampleBlob(options.id, file, 'sample', trackName);
        
        // Call the main track creation function (already handles history)
        // Assuming createTrackAndRegisterWithHistory is available via get()
        const newTrack = await get().createTrackAndRegisterWithHistory(trackType, trackName, options);
        
        if (!newTrack) {
          throw new Error(`Failed to create ${trackType} track from file upload`);
        }
        
        return newTrack;
    };

    // Wrap with error handling
    if (!_withErrorHandling) {
        console.error("_withErrorHandling not available for uploadAudioFile");
        // Attempt without handler?
        try { return await uploadLogic(); } catch { return null; }
    }
    return _withErrorHandling(uploadLogic, 'uploadAudioFile')();
  };

  // Handles track resize end event, creates history action
  const handleTrackResizeEnd = (trackId: string, deltaPixels: number, resizeDirection: 'left' | 'right'): void => {
    const { bpm, timeSignature, executeHistoryAction, _withErrorHandling } = rootGet();
    const fullTrack = findTrackById(trackId);
    if (!fullTrack || !_withErrorHandling) { return; }

    const resizeLogic = async () => {
        // Get the first instance (for now we're working with single instances)
        const instances = fullTrack.instances || [];
        if (instances.length === 0) {
            console.error(`Track ${trackId} has no instances for resize`);
            return;
        }
        
        const firstInstance = instances[0];
        const oldTrimStartTicks = firstInstance.trim_start_ticks || 0;
        const oldTrimEndTicks = firstInstance.trim_end_ticks || fullTrack.duration_ticks || 0; 
        const oldPositionX = firstInstance.x_position || 0;
        const deltaTicks = pixelsToTicks(deltaPixels, bpm, timeSignature);

        console.log('[tracksSlice] handleTrackResizeEnd:', {
            trackId,
            deltaPixels,
            deltaTicks,
            resizeDirection,
            oldPositionX,
            oldTrimStartTicks,
            oldTrimEndTicks,
            trackDuration: fullTrack.duration_ticks,
            instanceId: firstInstance.id,
            bpm,
            timeSignature,
            ppq: MUSIC_CONSTANTS.pulsesPerQuarterNote
        });

        let newTrimStartTicks = oldTrimStartTicks;
        let newTrimEndTicks = oldTrimEndTicks;
        let newPositionX = oldPositionX;

        if (resizeDirection === 'left') {
            // For left resize, deltaTicks represents position change
            // When making bigger from left, deltaTicks is negative (moving left)
            newPositionX = oldPositionX + deltaTicks;
            newPositionX = Math.max(0, newPositionX); // Don't go past timeline start
            
            // Adjust trim_start by the same amount the position moved
            const actualPositionDelta = newPositionX - oldPositionX;
            newTrimStartTicks = oldTrimStartTicks + actualPositionDelta;
            
            // trim_start can go negative when expanding beyond original content
            // Don't clamp to trim_end - that prevents expansion
            
        } else { 
            // For right resize, deltaTicks represents width change
            newTrimEndTicks = oldTrimEndTicks + deltaTicks;
            // Ensure trim end doesn't go below trim start
            newTrimEndTicks = Math.max(newTrimStartTicks, newTrimEndTicks);
            
        }

        // Update the instance with new trim values
        const updatedInstances = instances.map((instance, idx) => 
            idx === 0 
                ? { 
                    ...instance, 
                    trim_start_ticks: newTrimStartTicks,
                    trim_end_ticks: newTrimEndTicks,
                    x_position: newPositionX
                  }
                : instance
        );
        
        console.log('[Instance Update] Resize:', {
            trackId,
            instanceId: firstInstance.id,
            resizeDirection,
            oldTrim: { start: oldTrimStartTicks, end: oldTrimEndTicks },
            newTrim: { start: newTrimStartTicks, end: newTrimEndTicks },
            oldPositionX,
            newPositionX,
            updatedInstance: updatedInstances[0]
        });
        
        // Update track state with new instances array
        updateTrackState(trackId, { 
            instances: updatedInstances,
            dirty: true
        });

        // Create instance resize action for history
        const action = new InstanceResize(
            get, 
            trackId,
            firstInstance.id,
            oldTrimStartTicks,
            oldTrimEndTicks,
            oldPositionX,
            newTrimStartTicks,
            newTrimEndTicks,
            newPositionX
        );
        
        await executeHistoryAction(action); 
    };
    _withErrorHandling(resizeLogic, 'handleTrackResizeEnd')();
  };

  // --- handleAddTrack Implementation (Restoring sampler creation loop) --- 
  const handleAddTrack = async (
    type: TrackType, 
    payload?: AddTrackPayload
  ): Promise<CombinedTrack | null> => { // Return only the main track created
      const rootState = get(); 
      // Get necessary actions from root state
      const { createTrackAndRegisterWithHistory, addSamplerTrackToDrumTrack, openDrumMachine, _withErrorHandling } = rootState;
      
      // Ensure actions exist
      if (!_withErrorHandling || !createTrackAndRegisterWithHistory || (type === 'DRUM' && !addSamplerTrackToDrumTrack)) {
          console.error("handleAddTrack: Missing dependencies");
          return null;
      }

      const addLogic = async () => {
          // --- Drum Track Creation with Samplers --- 
          if (type === 'DRUM') {
              // 1. Create the main drum track first
              const count = rootState.tracks.length + 1; 
              const mainDrumTrackName = TRACK_CONFIG.DRUM.getDefaultName(count, 'Drum Kit');
              const mainDrumTrack = await createTrackAndRegisterWithHistory('DRUM', mainDrumTrackName, {
                  instrumentName: 'Drum Sequencer', 
              });

              if (!mainDrumTrack || !mainDrumTrack.id) {
                  console.error("Failed to create main drum track record");
                  return null; // Return null if main track creation fails
              }
              const mainDrumTrackId = mainDrumTrack.id;

              // 2. Check for samples payload and add corresponding Sampler Tracks
              if (payload && 'samples' in payload && Array.isArray(payload.samples)) {
                  const drumPayload = payload as DrumTrackPayload;
                  
                  // Sequentially add sampler tracks using the dedicated action
                  for (const sample of drumPayload.samples) {
                      try {
                          // Prepare sampleData for the action (ensure fields match)
                          const sampleDataForAction = {
                              id: sample.id, // Assuming DrumSamplePublicRead has id
                              display_name: sample.display_name, // Assuming DrumSamplePublicRead has display_name
                              storage_key: sample.storage_key, // Assuming DrumSamplePublicRead has storage_key
                              // Add other necessary fields if addSamplerTrackToDrumTrack expects them
                          };
                          // Call action to create sampler and link it (handles history)
                          await addSamplerTrackToDrumTrack(mainDrumTrackId, sampleDataForAction);
                      } catch (error) {
                          console.error(`Failed to add sampler track for sample ${sample.display_name} to drum track ${mainDrumTrackId}:`, error);
                          // Decide whether to continue or stop if one sampler fails
                      }
                  }
              } else {
              }
              
              // 3. Open UI (optional)
              if (openDrumMachine) {
                  openDrumMachine(mainDrumTrackId);
              }

              // Return the main drum track object after attempting sampler additions
              // Fetch the latest state in case samplers modified it (though unlikely here)
              return rootState.findTrackById(mainDrumTrackId); 
          }
          
          // --- Standard/MIDI/AUDIO/Sampler Track Creation --- 
          const countStd = rootState.tracks.length + 1;
          let instrumentNameStd: string | undefined;
          let trackOptionsStd: TrackOptions = {};
          if (type === 'MIDI' && payload && 'instrumentId' in payload) {
              const midiPayload = payload as MidiTrackPayload;
              instrumentNameStd = midiPayload.instrumentName;
              trackOptionsStd = { 
                  instrumentId: midiPayload.instrumentId,
                  instrumentName: midiPayload.instrumentName,
                  instrumentStorageKey: midiPayload.instrumentStorageKey
              };
          } else if (type === 'AUDIO' && payload && 'audioTrackData' in payload) {
              const audioPayload = payload as AudioTrackPayload;
              const existingTrack = audioPayload.audioTrackData;
              
              if (existingTrack) {
                  instrumentNameStd = existingTrack.name;
                  
                  // Retrieve the audio file from IndexedDB
                  let audioFile: File | undefined;
                  try {
                      const cachedFile = await db.getAudioFile(existingTrack.id);
                      if (cachedFile) {
                          audioFile = new File([cachedFile.data], existingTrack.name, { 
                              type: cachedFile.type 
                          });
                      }
                  } catch (error) {
                      console.warn('Failed to retrieve audio file from IndexedDB:', error);
                  }
                  
                  trackOptionsStd = {
                      id: existingTrack.id, // Use original track ID instead of generating new UUID
                      name: existingTrack.name,
                      storage_key: existingTrack.audio_file_storage_key,
                      audio_file_format: existingTrack.audio_file_format,
                      audio_file_size: existingTrack.audio_file_size,
                      audio_file_duration: existingTrack.audio_file_duration,
                      audio_file_sample_rate: existingTrack.audio_file_sample_rate,
                      waveform_data: existingTrack.waveform_data,
                      audioFile: audioFile, // Include the actual file for audio engine
                      isExistingTrack: true, // Flag to indicate this is an existing track
                  };
              }
          }
          const trackNameStd = TRACK_CONFIG[type]?.getDefaultName(countStd, instrumentNameStd) || `Track ${countStd}`;
          const trackData = await createTrackAndRegisterWithHistory(type, trackNameStd, trackOptionsStd);
          return trackData;
      }
      
      return _withErrorHandling(addLogic, 'handleAddTrack')();
  };

  // Handle Instrument Change (placeholder, needs track update and engine calls)
  const handleInstrumentChange = async (
    trackId: string, 
    instrumentId: string, 
    instrumentName: string, 
    instrumentStorageKey: string
  ): Promise<void> => {
    console.warn("handleInstrumentChange needs implementation in tracksSlice");
    // Original logic:
    // const { store, updateTrackState } = get();
    // const track = findTrackById(trackId);
    // if (!track) return;
    // updateTrackState(trackId, { instrument_id: ..., instrument_name: ..., instrument_storage_key: ... });
    // if (track.type === 'midi') { 
    //   await TRACK_CONFIG.midi.initEngine(store, trackId, undefined, instrumentId);
    // } else { 
    //   await store.connectTrackToSoundfont(trackId, instrumentId); 
    // }
  };

  // Replace Track Audio File (placeholder, needs findTrackById, engine calls, sampler init)
  const replaceTrackAudioFile = async (trackId: string, file: File): Promise<void> => {
      console.warn("replaceTrackAudioFile needs implementation in tracksSlice");
      // Original logic:
      // const { store, findTrackById, updateTrackState, _withErrorHandling } = get();
      // const track = findTrackById(trackId);
      // ... checks ...
      // if (track.type === 'sampler') store?.getTransport().getSamplerController()?.getSampler(trackId)?.stopPlayback();
      // await updateTrackWithAudioInfo(trackId, file); // Need this helper or its logic
      // const updates = track.type === 'audio' ? { audioFile: file } : { sampleFile: file };
      // if (track.type === 'sampler') await initializeSampler(trackId, file, {...}); // Need initializeSampler helper
      // updateTrackState(trackId, updates);
  };

  // --- New Action: Add Sampler to Drum Track --- 
  const addSamplerTrackToDrumTrack = async (
    drumTrackId: string,
    sampleData: { id: string; display_name: string; storage_key: string; /* other needed fields? */ }
  ): Promise<CombinedTrack | null> => {
    const { createTrackAndRegisterWithHistory, executeHistoryAction, _withErrorHandling } = rootGet();
    if (!createTrackAndRegisterWithHistory || !executeHistoryAction || !_withErrorHandling) {
        console.error("addSamplerTrackToDrumTrack: Missing dependencies");
        return null;
    }

    const addSamplerLogic = async (): Promise<CombinedTrack | null> => {
        // 1. Prepare Sampler Options, linking to parent
        const samplerOptions: SamplerTrackOptions = {
            name: sampleData.display_name,          // Use sample name for track name initially
            storage_key: sampleData.storage_key,    // Pass storage key
            drum_track_id: drumTrackId,             // **Link to parent**
            // Add any other relevant options derived from sampleData if needed
            // e.g., baseMidiNote might be derived or default
        };
        const samplerTrackName = sampleData.display_name; // Or generate a more unique name


        // 2. Create the Sampler Track (handles its own history for creation)
        const newSamplerTrack = await createTrackAndRegisterWithHistory('SAMPLER', samplerTrackName, samplerOptions);

        if (!newSamplerTrack || !newSamplerTrack.id) {
            console.error(`Failed to create sampler track for sample ${sampleData.display_name}`);
            return null;
        }
        const newSamplerTrackId = newSamplerTrack.id;


        // 3. Update Parent Drum Track's State
        const parentDrumTrack = selectDrumTrackById(drumTrackId); // Use the selector
        if (!parentDrumTrack) {
            console.error(`Parent drum track ${drumTrackId} not found in state after creating sampler.`);
            // Potentially rollback sampler creation? Or just log error.
            return newSamplerTrack; // Return sampler even if parent update fails?
        }

        const oldSamplerIds = parentDrumTrack.sampler_track_ids || [];
        // Ensure no duplicates (though unlikely with UUIDs)
        const newSamplerIds = [...new Set([...oldSamplerIds, newSamplerTrackId])];


        _updateNestedTrackData(drumTrackId, { sampler_track_ids: newSamplerIds } as Partial<DrumTrackRead>);


        // 4. Add History Action for the Parent Update
        // **ASSUMES Actions.UpdateDrumTrackSamplers exists and takes (get, drumTrackId, oldIds, newIds)**
        try {
            const parentUpdateAction = new Actions.UpdateDrumTrackSamplers(
                get, 
                drumTrackId, 
                oldSamplerIds, 
                newSamplerIds
            );
            await executeHistoryAction(parentUpdateAction);

        } catch (historyError) {
            console.error("Error executing history action for parent drum track update:", historyError);
            // Consider if state needs rollback here
        }


        return newSamplerTrack;
    };

    return _withErrorHandling(addSamplerLogic, 'addSamplerTrackToDrumTrack')();
  };

  // Group operations for copy/paste functionality
  const duplicateTrack = async (trackId: string, newPosition?: Position): Promise<CombinedTrack | null> => {
    const { tracks } = rootGet();
    const track = tracks.find(t => t.id === trackId);
    
    if (!track) {
      console.error(`Track with id ${trackId} not found for duplication`);
      return null;
    }

    // If this is a drum track, route through multi-track duplication to include samplers
    if (track.track_type === 'DRUM') {
      const offsetX = newPosition?.x || 0;
      const duplicatedTracks = await duplicateMultipleTracks([trackId], offsetX);
      return duplicatedTracks.find(t => t.track_type === 'DRUM') || null;
    }
    
    // Create a new instance instead of a new track
    const instanceId = await addTrackInstance(trackId, newPosition);
    
    if (!instanceId) {
      console.error(`Failed to create instance for track ${trackId}`);
      return null;
    }
    
    // Return the track with updated instances
    return findTrackById(trackId) || null;
  };

  const duplicateMultipleTracks = async (trackIds: string[], offsetX = 0): Promise<CombinedTrack[]> => {
    const finalTrackIds = expandDrumSelection(trackIds);
    const { tracks, bpm, timeSignature, executeHistoryAction } = rootGet();
    const updatedTracks: CombinedTrack[] = [];
    
    // Calculate base offset if not provided
    let baseOffsetX = offsetX;
    if (baseOffsetX === 0) {
      // Find the rightmost instance position among selected tracks
      const selectedTracks = tracks.filter(t => finalTrackIds.includes(t.id));
      let maxRightPosition = 0;
      
      selectedTracks.forEach(track => {
        // Get instances - skip tracks without instances
        const instances = track.instances && track.instances.length > 0 
          ? track.instances 
          : [];
        
        // Find rightmost instance
        instances.forEach(instance => {
          const instanceEnd = instance.x_position + (instance.trim_end_ticks - instance.trim_start_ticks);
          maxRightPosition = Math.max(maxRightPosition, instanceEnd);
        });
      });
      
      baseOffsetX = maxRightPosition + pixelsToTicks(96, bpm, timeSignature); // 96px gap in ticks
    }

    // Find the leftmost instance position to calculate relative positions
    const selectedTracks = tracks.filter(t => finalTrackIds.includes(t.id));
    let minX = Infinity;
    
    selectedTracks.forEach(track => {
      const instances = getTrackInstancesOrDefault(track);
      instances.forEach(instance => {
        minX = Math.min(minX, instance.x_position);
      });
    });
    
    // Collect all instance add actions
    const instanceAddActions: InstanceAdd[] = [];
    
    // Create instances for each track
    for (const trackId of finalTrackIds) {
      const track = tracks.find(t => t.id === trackId);
      if (!track) continue;
      
      // Get instances for this track
      const originalInstances = getTrackInstancesOrDefault(track);
      
      // Determine the starting number for new instances of this track
      const allInstances = getTrackInstancesOrDefault(track);
      let maxInstanceNum = 0;
      allInstances.forEach(instance => {
        const match = instance.id.match(/_instance_(\d+)$/);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (num > maxInstanceNum) {
            maxInstanceNum = num;
          }
        }
      });
      let nextInstanceNum = maxInstanceNum + 1;
      
      for (const originalInstance of originalInstances) {
        // Calculate relative position
        const relativeX = originalInstance.x_position - minX;
        const newPosition = {
          x: baseOffsetX + relativeX,
          y: originalInstance.y_position
        };
        
        // Create new instance object with a sequential ID
        const instanceId = `${trackId}_instance_${nextInstanceNum}`;
        nextInstanceNum++; // Increment for the next instance of this track

        const newInstance: TrackInstance = {
          id: instanceId,
          x_position: newPosition.x,
          y_position: newPosition.y,
          trim_start_ticks: originalInstance.trim_start_ticks,
          trim_end_ticks: originalInstance.trim_end_ticks
        };
        
        // Create the action but don't execute it yet
        instanceAddActions.push(new InstanceAdd(get, trackId, newInstance));
      }
      
      // Track will be updated when the group action executes
      updatedTracks.push(track);
    }
    
    // Execute all instance adds as a single group action
    if (instanceAddActions.length > 0) {
      const groupAction = new Actions.GroupAction(
        get,
        instanceAddActions,
        `Duplicate ${finalTrackIds.length} track${finalTrackIds.length > 1 ? 's' : ''}`
      );
      await executeHistoryAction(groupAction);
    }
    
    // Return the updated tracks
    return finalTrackIds.map(id => findTrackById(id)).filter(Boolean) as CombinedTrack[];
  };

  const deleteMultipleTracks = async (trackIds: string[]): Promise<void> => {
    const { tracks, executeHistoryAction, _withErrorHandling } = rootGet();
    if (!_withErrorHandling) {
      console.error("_withErrorHandling not available");
      return;
    }

    const deleteMultipleLogic = async (): Promise<void> => {
      const actions: Action[] = [];
      
      // Create delete actions for all tracks
      for (const trackId of trackIds) {
        const track = tracks.find(t => t.id === trackId);
        if (track) {
          const action = new Actions.DeleteTrack(get, { ...track });
          actions.push(action);
        }
      }
      
      // Execute as a single group action
      if (actions.length > 0) {
        const groupAction = new Actions.GroupAction(
          get,
          actions,
          `Delete ${actions.length} track${actions.length > 1 ? 's' : ''}`
        );
        await executeHistoryAction(groupAction);
      }
    };

    return _withErrorHandling(deleteMultipleLogic, `deleteMultipleTracks`)();
  };

  const resizeMultipleTracks = async (trackIds: string[], widthDelta: number, anchor: 'left' | 'right'): Promise<void> => {
    const { tracks, bpm, timeSignature, executeHistoryAction, _withErrorHandling } = rootGet();
    if (!_withErrorHandling) {
      console.error("_withErrorHandling not available");
      return;
    }

    const resizeMultipleLogic = async (): Promise<void> => {
      const deltaPixels = widthDelta; // Assuming widthDelta is already in pixels
      const deltaTicks = pixelsToTicks(deltaPixels, bpm, timeSignature);
      
      // Collect resize data for all tracks
      const trackResizeData: Array<{
        trackId: string;
        oldTrimStartTicks: number;
        oldTrimEndTicks: number;
        oldPositionX: number;
        newTrimStartTicks: number;
        newTrimEndTicks: number;
        newPositionX: number;
      }> = [];
      
      for (const trackId of trackIds) {
        const track = tracks.find(t => t.id === trackId);
        if (track && track.instances?.[0]) {
          const firstInstance = track.instances[0];
          const oldTrimStartTicks = firstInstance.trim_start_ticks || 0;
          const oldTrimEndTicks = firstInstance.trim_end_ticks || track.duration_ticks || 0;
          const oldPositionX = firstInstance.x_position || 0;
          
          let newTrimStartTicks = oldTrimStartTicks;
          let newTrimEndTicks = oldTrimEndTicks;
          let newPositionX = oldPositionX;
          
          if (anchor === 'left') {
            // Left resize: deltaTicks represents position change
            newTrimStartTicks = oldTrimStartTicks + deltaTicks;
            newPositionX = oldPositionX + deltaTicks;
            // Ensure trim start doesn't exceed trim end
            newTrimStartTicks = Math.max(0, Math.min(newTrimStartTicks, oldTrimEndTicks));
            newPositionX = Math.max(0, newPositionX);
          } else {
            // Right resize: deltaTicks represents width change
            newTrimEndTicks = oldTrimEndTicks + deltaTicks;
            // Ensure trim end doesn't go below trim start
            newTrimEndTicks = Math.max(newTrimStartTicks, newTrimEndTicks);
          }
          
          trackResizeData.push({
            trackId,
            oldTrimStartTicks,
            oldTrimEndTicks,
            oldPositionX,
            newTrimStartTicks,
            newTrimEndTicks,
            newPositionX
          });
        }
      }
      
      // Create and execute group resize action
      if (trackResizeData.length > 0) {
        // Create individual resize actions
        const actions: Action[] = trackResizeData.map(data => 
          new Actions.TrackResize(
            get,
            data.trackId,
            data.oldTrimStartTicks,
            data.oldTrimEndTicks,
            data.oldPositionX,
            data.newTrimStartTicks,
            data.newTrimEndTicks,
            data.newPositionX
          )
        );
        
        // Execute as a single group action
        const groupAction = new Actions.GroupAction(
          get,
          actions,
          `Resize ${actions.length} track${actions.length > 1 ? 's' : ''}`
        );
        await executeHistoryAction(groupAction);
      }
    };

    return _withErrorHandling(resizeMultipleLogic, `resizeMultipleTracks`)();
  };

  const updateMultipleTrackPositions = async (trackIds: string[], deltaX: number, deltaY: number): Promise<void> => {
    const { tracks, executeHistoryAction, _withErrorHandling } = rootGet();
    if (!_withErrorHandling) {
      console.error("_withErrorHandling not available");
      return;
    }

    const updatePositionsLogic = async (): Promise<void> => {
      const actions: Action[] = [];
      
      // Create position change actions for all tracks
      trackIds.forEach(trackId => {
        const track = tracks.find(t => t.id === trackId);
        if (track && track.instances?.[0]) {
          const firstInstance = track.instances[0];
          const oldPosition = { x: firstInstance.x_position, y: firstInstance.y_position };
          const newX = Math.max(0, firstInstance.x_position + deltaX);
          const newY = Math.max(0, firstInstance.y_position + deltaY);
          const newPosition = { x: newX, y: newY };
          
          // Create action but don't execute it
          const action = new Actions.TrackPosition(
            get,
            trackId,
            oldPosition,
            newPosition
          );
          actions.push(action);
        }
      });
      
      // Execute all position changes as a single group action
      if (actions.length > 0) {
        const groupAction = new Actions.GroupAction(
          get,
          actions,
          `Move ${actions.length} track${actions.length > 1 ? 's' : ''}`
        );
        await executeHistoryAction(groupAction);
      }
    };

    return _withErrorHandling(updatePositionsLogic, `updateMultipleTrackPositions`)();
  };
  
  // Track instance management functions
  const getTrackInstancesOrDefault = (track: CombinedTrack): TrackInstance[] => {
    return track.instances || [];
  };
  
  const addTrackInstance = async (trackId: string, position?: Position, sourceInstance?: Partial<TrackInstance>): Promise<string | null> => {
    const { tracks, bpm, timeSignature, executeHistoryAction } = rootGet();
    const track = tracks.find(t => t.id === trackId);
    
    if (!track) {
      console.error(`Track ${trackId} not found`);
      return null;
    }
    
    // Get instances or create default
    const instances = getTrackInstancesOrDefault(track);
    
    // Generate new instance ID with a monotonically increasing number
    let maxInstanceNum = 0;
    instances.forEach(instance => {
      const match = instance.id.match(/_instance_(\d+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxInstanceNum) {
          maxInstanceNum = num;
        }
      }
    });
    const instanceId = `${trackId}_instance_${maxInstanceNum + 1}`;
    
    // Calculate position for new instance
    let newPosition = position;
    if (!newPosition && instances.length > 0) {
      // Place new instance after the last one
      const lastInstance = instances[instances.length - 1];
      const lastEndTicks = lastInstance.x_position + (lastInstance.trim_end_ticks - lastInstance.trim_start_ticks);
      const gapTicks = pixelsToTicks(48, bpm, timeSignature); // 48px gap
      newPosition = {
        x: lastEndTicks + gapTicks,
        y: lastInstance.y_position
      };
    } else if (!newPosition) {
      // Default position if track has no instances
      newPosition = { x: 0, y: 0 };
    }
    
    // Calculate proper trim_end_ticks for audio tracks
    let trimEndTicks = sourceInstance?.trim_end_ticks;
    if (!trimEndTicks) {
      if (track.track_type === 'AUDIO') {
        // For audio tracks, calculate duration based on actual audio file
        const audioDuration = getAudioDuration(track);
        const currentBpm = rootGet().bpm || 120;
        if (audioDuration > 0) {
          trimEndTicks = calculateAudioDurationTicks(audioDuration, currentBpm);
        } else {
          trimEndTicks = track.duration_ticks || 1920;
        }
      } else {
        trimEndTicks = track.duration_ticks || 1920;
      }
    }

    // Create new instance - use source instance data if provided
    const newInstance: TrackInstance = {
      id: instanceId,
      x_position: newPosition.x,
      y_position: newPosition.y,
      trim_start_ticks: sourceInstance?.trim_start_ticks ?? 0,
      trim_end_ticks: trimEndTicks
    };
    
    // Register instance with MidiManager for MIDI-based tracks
    if (track.track_type === 'MIDI' || track.track_type === 'SAMPLER' || track.track_type === 'DRUM') {
      const midiManager = rootGet().store?.getMidiManager();
      if (midiManager) {
        // Register the new instance
        midiManager.registerInstance(trackId, instanceId);
      }
    }
    
    // Create history action for adding instance
    const action = new Actions.InstanceAdd(get, trackId, newInstance);
    await executeHistoryAction(action);
    
    return instanceId;
  };
  
  const updateTrackInstance = (trackId: string, instanceId: string, updates: Partial<TrackInstance>): void => {
    const track = findTrackById(trackId);
    if (!track || !track.instances) return;
    
    const updatedInstances = track.instances.map(instance => 
      instance.id === instanceId 
        ? { ...instance, ...updates }
        : instance
    );
    
    updateTrackState(trackId, { instances: updatedInstances });
  };
  
  const deleteTrackInstance = (trackId: string, instanceId: string): void => {
    const { executeHistoryAction } = rootGet();
    const track = findTrackById(trackId);
    if (!track || !track.instances) return;
    
    // Don't delete if it's the only instance
    if (track.instances.length <= 1) {
      console.warn("Cannot delete the last instance of a track");
      return;
    }
    
    // Find the instance to delete
    const instanceToDelete = track.instances.find(inst => inst.id === instanceId);
    if (!instanceToDelete) {
      console.error(`Instance ${instanceId} not found in track ${trackId}`);
      return;
    }
    
    // Unregister instance with MidiManager for MIDI-based tracks
    if (track.track_type === 'MIDI' || track.track_type === 'SAMPLER' || track.track_type === 'DRUM') {
      const midiManager = rootGet().store?.getMidiManager();
      if (midiManager) {
        midiManager.unregisterInstance(trackId, instanceId);
      }
    }
    
    // Create and execute the delete action
    const action = new Actions.InstanceDelete(
      get,
      trackId,
      instanceToDelete
    );
    executeHistoryAction(action);
  };
  
  const getTrackInstances = (trackId: string): TrackInstance[] => {
    const track = findTrackById(trackId);
    if (!track) return [];
    
    return getTrackInstancesOrDefault(track);
  };
  
  const handleInstancePositionChange = (trackId: string, instanceId: string, newPosition: Position, isDragEnd: boolean): void => {
    const { bpm, timeSignature, isPlaying, executeHistoryAction, _withErrorHandling } = rootGet();
    const storeInstance = rootGet().store;

    if (!storeInstance || !_withErrorHandling) {
        console.error("Store or _withErrorHandling is not available in handleInstancePositionChange");
        return;
    }

    const changeLogic = async () => {
        const track = findTrackById(trackId);
        if (!track || !track.instances) {
            console.error(`Track ${trackId} not found or has no instances`);
            return;
        }
        
        const instance = track.instances.find(inst => inst.id === instanceId);
        if (!instance) {
            console.error(`Instance ${instanceId} not found in track ${trackId}`);
            return;
        }
        
        const oldPosition = { x: instance.x_position, y: instance.y_position };

        // Skip if nothing changed at drag end
        if (isDragEnd && 
            oldPosition.x === newPosition.x && 
            oldPosition.y === newPosition.y) {
            return;
        }
        
        if (isDragEnd) {
            // If this is a drum track, move it together with all its samplers
            if (track.track_type === 'DRUM') {
                const deltaX = newPosition.x - oldPosition.x;
                const deltaY = newPosition.y - oldPosition.y;
                const allTrackIds = expandDrumSelection([trackId]);
                
                // Create instance updates for all tracks
                const instanceUpdates = allTrackIds.map(tId => {
                    const targetTrack = findTrackById(tId);
                    if (targetTrack?.instances?.[0]) {
                        return {
                            trackId: tId,
                            instanceId: targetTrack.instances[0].id,
                            deltaX,
                            deltaY
                        };
                    }
                    return null;
                }).filter(Boolean) as Array<{trackId: string, instanceId: string, deltaX: number, deltaY: number}>;

                if (instanceUpdates.length > 0) {
                    updateMultipleInstancePositions(instanceUpdates);
                }
                return;
            }

            // Create instance-specific position action for history
            const action = new Actions.InstanceMove(
                get,
                trackId,
                instanceId,
                oldPosition.x,
                oldPosition.y,
                newPosition.x,
                newPosition.y
            );
            await executeHistoryAction(action);
            
            // Update notes for this instance if it's a MIDI-based track
            if (track.track_type === 'MIDI') {
                const midiManager = storeInstance.getMidiManager();
                if (midiManager) {
                    const deltaX = newPosition.x - oldPosition.x;
                    midiManager.moveInstance(trackId, instanceId, deltaX);
                }
            }
            
            if (isPlaying && storeInstance.getTransport()?.handleTrackPositionChange) {
              storeInstance.getTransport().handleTrackPositionChange(trackId, newPosition.x);
            }
        } else {
            // During drag, update position directly without history
            updateTrackInstance(trackId, instanceId, { 
                x_position: newPosition.x, 
                y_position: newPosition.y
            });
            
            // Update audio engine for this specific instance
            // TODO: Audio engine needs to support instance-based positioning
            storeInstance.getAudioEngine().setTrackPosition(trackId, newPosition.x, newPosition.y);
        }
    };
    
    _withErrorHandling(changeLogic, 'handleInstancePositionChange')();
  };
  
  const handleInstanceResizeEnd = (trackId: string, instanceId: string, deltaPixels: number, resizeDirection: 'left' | 'right'): void => {
    const { bpm, timeSignature, executeHistoryAction, _withErrorHandling } = rootGet();
    const track = findTrackById(trackId);
    if (!track || !track.instances || !_withErrorHandling) { return; }

    const resizeLogic = async () => {
        const instance = track.instances?.find(inst => inst.id === instanceId);
        if (!instance) {
            console.error(`Instance ${instanceId} not found in track ${trackId}`);
            return;
        }
        
        const oldTrimStartTicks = instance.trim_start_ticks;
        const oldTrimEndTicks = instance.trim_end_ticks;
        const oldPositionX = instance.x_position;
        const deltaTicks = pixelsToTicks(deltaPixels, bpm, timeSignature);

        let newTrimStartTicks = oldTrimStartTicks;
        let newTrimEndTicks = oldTrimEndTicks;
        let newPositionX = oldPositionX;

        if (resizeDirection === 'left') {
            // For left resize, deltaTicks represents position change
            // When making bigger from left, deltaTicks is negative (moving left)
            newPositionX = oldPositionX + deltaTicks;
            newPositionX = Math.max(0, newPositionX); // Don't go past timeline start
            
            // Adjust trim_start by the same amount the position moved
            const actualPositionDelta = newPositionX - oldPositionX;
            newTrimStartTicks = oldTrimStartTicks + actualPositionDelta;
            
            // trim_start can go negative when expanding beyond original content
            // Don't clamp to trim_end - that prevents expansion
        } else { 
            // For right resize, deltaTicks represents width change
            newTrimEndTicks = oldTrimEndTicks + deltaTicks;
            // Ensure trim end doesn't go below trim start
            newTrimEndTicks = Math.max(newTrimStartTicks, newTrimEndTicks);
        }

        // If this is a drum track, resize it together with all its samplers
        if (track.track_type === 'DRUM') {
            const allTrackIds = expandDrumSelection([trackId]);
            
            // Create instance updates for all tracks
            const instanceUpdates = allTrackIds.map(tId => {
                const targetTrack = findTrackById(tId);
                if (targetTrack?.instances?.[0]) {
                    return {
                        trackId: tId,
                        instanceId: targetTrack.instances[0].id,
                        widthDelta: deltaPixels,
                        anchor: resizeDirection
                    };
                }
                return null;
            }).filter(Boolean) as Array<{trackId: string, instanceId: string, widthDelta: number, anchor: 'left' | 'right'}>;

            if (instanceUpdates.length > 0) {
                resizeMultipleInstances(instanceUpdates);
            }
            return;
        }

        // Create instance-specific resize action for history
        const action = new Actions.InstanceResize(
            get,
            trackId,
            instanceId,
            oldTrimStartTicks,
            oldTrimEndTicks,
            oldPositionX,
            newTrimStartTicks,
            newTrimEndTicks,
            newPositionX
        );
        await executeHistoryAction(action);
        
        // Update notes for this instance if it's a MIDI-based track
        if (track.track_type === 'MIDI') {
            const midiManager = rootGet().store?.getMidiManager();
            if (midiManager) {
                // Filter notes based on new trim values
                midiManager.trimInstance(trackId, instanceId, newTrimStartTicks, newTrimEndTicks);
            }
        }
    };
    
    _withErrorHandling(resizeLogic, 'handleInstanceResizeEnd')();
  };
  
  const updateMultipleInstancePositions = (instanceUpdates: Array<{trackId: string, instanceId: string, deltaX: number, deltaY: number}>): void => {
    const { _withErrorHandling, executeHistoryAction } = rootGet();
    if (!_withErrorHandling) {
      console.error("_withErrorHandling not available");
      return;
    }

    const updateLogic = async () => {
      // Create individual instance move actions
      const actions: InstanceMove[] = [];
      
      instanceUpdates.forEach(update => {
        const track = findTrackById(update.trackId);
        if (!track || !track.instances) return;
        
        const instance = track.instances.find(inst => inst.id === update.instanceId);
        if (!instance) return;
        
        const oldX = instance.x_position;
        const oldY = instance.y_position;
        const newX = Math.max(0, oldX + update.deltaX);
        const newY = Math.max(0, oldY + update.deltaY);
        
        actions.push(new InstanceMove(
          get,
          update.trackId,
          update.instanceId,
          oldX,
          oldY,
          newX,
          newY
        ));
      });
      
      if (actions.length > 0) {
        // Create group action for all instance moves
        const groupAction = new Actions.GroupAction(
          get,
          actions,
          `Move ${actions.length} instance${actions.length > 1 ? 's' : ''}`
        );
        await executeHistoryAction(groupAction);
      }
    };
    
    _withErrorHandling(updateLogic, 'updateMultipleInstancePositions')();
  };
  
  const resizeMultipleInstances = (instanceUpdates: Array<{trackId: string, instanceId: string, widthDelta: number, anchor: 'left' | 'right'}>): void => {
    const { bpm, timeSignature, _withErrorHandling, executeHistoryAction } = rootGet();
    if (!_withErrorHandling) {
      console.error("_withErrorHandling not available");
      return;
    }

    const resizeLogic = async () => {
      // Create individual instance resize actions
      const actions: InstanceResize[] = [];
      
      instanceUpdates.forEach(update => {
        const track = findTrackById(update.trackId);
        if (!track || !track.instances) return;
        
        const instance = track.instances.find(inst => inst.id === update.instanceId);
        if (!instance) return;
        
        const deltaTicks = pixelsToTicks(update.widthDelta, bpm, timeSignature);
        const oldTrimStartTicks = instance.trim_start_ticks;
        const oldTrimEndTicks = instance.trim_end_ticks;
        const oldPositionX = instance.x_position;
        
        let newTrimStartTicks = oldTrimStartTicks;
        let newTrimEndTicks = oldTrimEndTicks;
        let newPositionX = oldPositionX;
        
        if (update.anchor === 'left') {
          // For left resize, adjust trim start and position
          newTrimStartTicks = oldTrimStartTicks + deltaTicks;
          newPositionX = oldPositionX + deltaTicks;
          // Allow negative trim_start for expansion beyond original content
          // No clamping - let it go negative
          newPositionX = Math.max(0, newPositionX);
        } else {
          // For right resize, adjust trim end
          newTrimEndTicks = oldTrimEndTicks + deltaTicks;
          // Ensure trim end doesn't go below trim start
          newTrimEndTicks = Math.max(newTrimStartTicks, newTrimEndTicks);
        }
        
        actions.push(new InstanceResize(
          get,
          update.trackId,
          update.instanceId,
          oldTrimStartTicks,
          oldTrimEndTicks,
          oldPositionX,
          newTrimStartTicks,
          newTrimEndTicks,
          newPositionX
        ));
      });
      
      if (actions.length > 0) {
        // Create group action for all instance resizes
        const groupAction = new Actions.GroupAction(
          get,
          actions,
          `Resize ${actions.length} instance${actions.length > 1 ? 's' : ''}`
        );
        await executeHistoryAction(groupAction);
      }
    };
    
    _withErrorHandling(resizeLogic, 'resizeMultipleInstances')();
  };
  
  const deleteMultipleInstances = async (instanceDeletions: Array<{trackId: string, instanceId: string}>): Promise<void> => {
    const { _withErrorHandling, executeHistoryAction } = rootGet();
    if (!_withErrorHandling) {
      console.error("_withErrorHandling not available");
      return;
    }

    const deleteLogic = async () => {
      // Create individual instance delete actions
      const actions: InstanceDelete[] = [];
      
      for (const deletion of instanceDeletions) {
        const track = findTrackById(deletion.trackId);
        if (!track || !track.instances) continue;
        
        // Don't delete if it's the only instance
        if (track.instances.length <= 1) {
          console.warn(`Cannot delete the last instance of track ${deletion.trackId}`);
          continue;
        }
        
        const instance = track.instances.find(inst => inst.id === deletion.instanceId);
        if (!instance) {
          console.error(`Instance ${deletion.instanceId} not found in track ${deletion.trackId}`);
          continue;
        }
        
        actions.push(new Actions.InstanceDelete(
          get,
          deletion.trackId,
          instance
        ));
      }
      
      if (actions.length > 0) {
        // Create group action for all instance deletions
        const groupAction = new Actions.GroupAction(
          get,
          actions,
          `Delete ${actions.length} instance${actions.length > 1 ? 's' : ''}`
        );
        await executeHistoryAction(groupAction);
      }
    };
    
    return _withErrorHandling(deleteLogic, 'deleteMultipleInstances')();
  };

  // --- Initial State & Return --- 
  return {
    tracks: [],
    activeInstanceByTrack: {},

    // Basic state manipulation
    setTracks,
    updateTracks,
    updateTrackState,
    updateTrack: updateTrackState, // Alias for updateTrackState
    findTrackById,
    updateTrackIndices,

    // Core track operations
    createTrackAndRegisterWithHistory,
    handleTrackDelete,

    // Parameter change handlers
    handleTrackParameterChange,
    handleTrackVolumeChange: (trackId, volume) => handleTrackParameterChange(trackId, 'volume', volume),
    handleTrackPanChange: (trackId, pan) => handleTrackParameterChange(trackId, 'pan', pan),
    handleTrackMuteToggle: (trackId, muted) => handleTrackParameterChange(trackId, 'muted', muted),
    handleTrackSoloToggle,
    handleTrackPositionChange,
    handleTrackNameChange: (trackId, name) => handleTrackParameterChange(trackId, 'name', name),

    // Add definition for uploadAudioFile
    uploadAudioFile,

    // Add resize action definition
    handleTrackResizeEnd,

    // Add missing action definitions
    handleAddTrack,
    handleInstrumentChange,
    replaceTrackAudioFile,

    // Expose internal helper for nested updates
    _updateNestedTrackData,

    // --- Selectors --- 
    selectDrumTrackById,
    selectSamplerTracksForDrumTrack,

    // New actions
    removeSamplerTrack,
    addSamplerTrackToDrumTrack,

    // Group operations for copy/paste functionality
    duplicateTrack,
    duplicateMultipleTracks,
    deleteMultipleTracks,
    resizeMultipleTracks,
    
    // Group position operations for group moving
    updateMultipleTrackPositions,
    
    // Track instance management
    addTrackInstance,
    updateTrackInstance,
    deleteTrackInstance,
    getTrackInstances,
    handleInstancePositionChange,
    handleInstanceResizeEnd,
    updateMultipleInstancePositions,
    resizeMultipleInstances,
    deleteMultipleInstances,
  };
};