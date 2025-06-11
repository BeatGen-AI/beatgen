import { RootState, SetFn, GetFn, StoreSliceCreator, TrackInstance } from '../types';
import { produce } from 'immer';
import TrackInstanceManager, { TrackInstanceConfig, TrackContentData } from '../../core/audio-engine/TrackInstanceManager';
import { CombinedTrack } from 'src/platform/types/project';
import { Note } from '../../../types/note';

export interface TrackInstanceSlice {
  // State
  trackInstances: Map<string, TrackInstance>; // instanceId -> TrackInstance
  
  // Actions
  createTrackInstance: (trackId: string, position: { x: number; y: number }) => Promise<string | null>;
  removeTrackInstance: (instanceId: string) => Promise<void>;
  updateInstancePosition: (instanceId: string, newPosition: { x: number; y: number }) => void;
  getInstancesByTrack: (trackId: string) => TrackInstance[];
  getAllInstances: () => TrackInstance[];
  getTrackInstancesSize: () => number;
  
  // Integration with TrackInstanceManager
  loadTrackContentForInstance: (track: CombinedTrack) => Promise<void>;
  
  // Helper methods
  generateInstanceId: () => string;
}

export const createTrackInstanceSlice: StoreSliceCreator<TrackInstanceSlice> = (set, get) => {
  const rootGet = get as GetFn;
  
  // Get TrackInstanceManager singleton
  const trackInstanceManager = TrackInstanceManager.getInstance();
  
  const generateInstanceId = (): string => {
    return `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };
  
  const loadTrackContentForInstance = async (track: CombinedTrack): Promise<void> => {
    console.log(`TrackInstanceSlice: Preparing content metadata for track ${track.id} (no file loading)`);
    
    try {
      // Check if content is already loaded
      const existingContent = trackInstanceManager.getTrackContent(track.id);
      if (existingContent) {
        console.log(`TrackInstanceSlice: Content already prepared for track ${track.id}`);
        return;
      }
      
      // Prepare content metadata WITHOUT loading files (lazy loading approach)
      let contentData: TrackContentData;
      
      if (track.type === 'AUDIO') {
        contentData = {
          trackId: track.id,
          name: track.name,
          trackType: 'audio',
          // audioFile will be loaded when actually needed for playback
        };
      } else if (track.type === 'MIDI') {
        const midiTrack = track.track as any;
        contentData = {
          trackId: track.id,
          name: track.name,
          trackType: 'midi',
          midiNotes: midiTrack?.notes || [],
          instrumentId: midiTrack?.instrument_id
        };
      } else if (track.type === 'SAMPLER') {
        const samplerTrack = track.track as any;
        contentData = {
          trackId: track.id,
          name: track.name,
          trackType: 'sampler',
          baseMidiNote: samplerTrack?.baseMidiNote || 60,
          grainSize: samplerTrack?.grainSize || 0.1,
          overlap: samplerTrack?.overlap || 0.1,
          midiNotes: samplerTrack?.notes || [],
          // audioFile will be loaded when needed
        };
      } else if (track.type === 'DRUM') {
        const drumTrack = track.track as any;
        contentData = {
          trackId: track.id,
          name: track.name,
          trackType: 'drum',
          samplerTracksData: [], // Will be populated when needed
          drumPattern: drumTrack?.pattern
        };
      } else {
        throw new Error(`Unsupported track type: ${track.type}`);
      }
      
      // For now, just store the content metadata without loading into TrackInstanceManager
      // This avoids the audio loading issues
      console.log(`TrackInstanceSlice: Content metadata prepared for track ${track.id}`, contentData);
      
    } catch (error) {
      console.error(`TrackInstanceSlice: Failed to prepare content for track ${track.id}:`, error);
      throw error;
    }
  };
  
  const createTrackInstance = async (trackId: string, position: { x: number; y: number }): Promise<string | null> => {
    console.log(`TrackInstanceSlice: Creating visual instance for track ${trackId} at position`, position);
    
    try {
      // Get track data
      const track = rootGet().findTrackById(trackId);
      if (!track) {
        console.error(`Track ${trackId} not found`);
        return null;
      }
      
      // Generate instance ID
      const instanceId = generateInstanceId();
      
      // COMPLETELY SKIP TrackInstanceManager for now - visual instances only
      console.log(`TrackInstanceSlice: Creating VISUAL-ONLY instance ${instanceId} (no TrackInstanceManager, no audio loading)`);
      console.log(`TrackInstanceSlice: Instance will be purely visual for track ${track.name} (${track.type})`);
      
      // Add to state (no TrackInstanceManager involvement)
      set(produce((draft: RootState) => {
        if (!draft.trackInstances) {
          draft.trackInstances = new Map();
        }
        
        const instance: TrackInstance = {
          instanceId,
          trackId,
          trackType: track.type.toLowerCase() as any,
          position
        };
        
        draft.trackInstances.set(instanceId, instance);
      }));
      
      console.log(`TrackInstanceSlice: Successfully created visual instance ${instanceId}`);
      return instanceId;
      
    } catch (error) {
      console.error(`TrackInstanceSlice: Failed to create instance for track ${trackId}:`, error);
      return null;
    }
  };
  
  const removeTrackInstance = async (instanceId: string): Promise<void> => {
    console.log(`TrackInstanceSlice: Removing visual instance ${instanceId}`);
    
    try {
      // For now, skip TrackInstanceManager and just remove from state
      console.log(`TrackInstanceSlice: Removing visual-only instance ${instanceId}`);
      
      // Remove from state
      set(produce((draft: RootState) => {
        if (draft.trackInstances) {
          draft.trackInstances.delete(instanceId);
        }
      }));
      
      console.log(`TrackInstanceSlice: Successfully removed visual instance ${instanceId}`);
    } catch (error) {
      console.error(`TrackInstanceSlice: Failed to remove instance ${instanceId}:`, error);
    }
  };
  
  const updateInstancePosition = (instanceId: string, newPosition: { x: number; y: number }): void => {
    console.log(`TrackInstanceSlice: Updating position for visual instance ${instanceId}`, newPosition);
    
    // For now, skip TrackInstanceManager and just update state
    set(produce((draft: RootState) => {
      if (draft.trackInstances?.has(instanceId)) {
        const instance = draft.trackInstances.get(instanceId);
        if (instance) {
          instance.position = newPosition;
        }
      }
    }));
  };
  
  const getInstancesByTrack = (trackId: string): TrackInstance[] => {
    const state = rootGet();
    if (!state.trackInstances) return [];
    
    return Array.from(state.trackInstances.values()).filter(
      instance => instance.trackId === trackId
    );
  };
  
  const getAllInstances = (): TrackInstance[] => {
    const state = rootGet();
    if (!state.trackInstances) return [];
    
    return Array.from(state.trackInstances.values());
  };
  
  const getTrackInstancesSize = (): number => {
    const state = rootGet();
    if (!state.trackInstances) return 0;
    
    return state.trackInstances.size;
  };
  
  return {
    // Initial state
    trackInstances: new Map<string, TrackInstance>(),
    
    // Actions
    createTrackInstance,
    removeTrackInstance,
    updateInstancePosition,
    getInstancesByTrack,
    getAllInstances,
    getTrackInstancesSize,
    loadTrackContentForInstance,
    generateInstanceId
  };
};