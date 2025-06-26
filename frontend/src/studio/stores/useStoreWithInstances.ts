import React from 'react';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { RootState } from './types';
import { tracksSlice } from './slices/tracksSlice';
import { transportSlice } from './slices/transportSlice';
import { historySlice } from './slices/historySlice';
import { clipboardSlice } from './slices/clipboardSlice';
import { drumMachineSlice } from './slices/drumMachineSlice';
import { helpersSlice } from './slices/helpersSlice';
import { StoreWithInstances } from '../core/state/storeWithInstances';
import { TRACK_CONFIG_WITH_INSTANCES } from './configWithInstances';

/**
 * Create a zustand store with instance-aware audio engine support
 * This replaces useStore for applications that need track instance support
 */
export const useStoreWithInstances = create<RootState>()(
    devtools(
        (set, get) => {
            // Create instance-aware store
            const storeWithInstances = new StoreWithInstances();
            
            // Replace TRACK_CONFIG with instance-aware version
            (window as any).TRACK_CONFIG = TRACK_CONFIG_WITH_INSTANCES;
            
            // Initialize all slices with instance-aware store
            const rootState: RootState = {
                // Core store
                store: storeWithInstances,
                
                // Initialize slices
                ...tracksSlice(set, get),
                ...transportSlice(set, get),
                ...historySlice(set, get),
                ...clipboardSlice(set, get),
                ...drumMachineSlice(set, get),
                ...helpersSlice(set, get),
                
                // Override methods that need instance awareness
                handleTrackPositionChange: (trackId: string, newPosition: { x: number, y: number }, isDragEnd: boolean) => {
                    const track = get().findTrackById(trackId);
                    if (!track) return;
                    
                    // If track has instances, update the first instance
                    const instances = track.instances || [];
                    if (instances.length > 0) {
                        get().handleInstancePositionChange(trackId, instances[0].id, newPosition, isDragEnd);
                    } else {
                        // Fallback to original behavior
                        tracksSlice(set, get).handleTrackPositionChange(trackId, newPosition, isDragEnd);
                    }
                },
                
                handleTrackResizeEnd: (trackId: string, deltaPixels: number, resizeDirection: 'left' | 'right') => {
                    const track = get().findTrackById(trackId);
                    if (!track) return;
                    
                    // If track has instances, resize the first instance
                    const instances = track.instances || [];
                    if (instances.length > 0) {
                        get().handleInstanceResizeEnd(trackId, instances[0].id, deltaPixels, resizeDirection);
                    } else {
                        // Fallback to original behavior
                        tracksSlice(set, get).handleTrackResizeEnd(trackId, deltaPixels, resizeDirection);
                    }
                },
                
                // Override audio file loading to ensure instances are created
                loadAudioFile: async (trackId: string, file: File, position?: { x: number, y: number }) => {
                    await storeWithInstances.loadAudioFile(trackId, file, position);
                },
                
                // Override track creation to ensure instances are initialized
                createTrackAndRegisterWithHistory: async (type, name, options) => {
                    const result = await tracksSlice(set, get).createTrackAndRegisterWithHistory(type, name, options);
                    
                    // Ensure instances are initialized in audio engine
                    if (result && result.instances && result.instances.length > 0) {
                        await storeWithInstances.addTrackInstances(
                            result.id, 
                            result.instances, 
                            result.type
                        );
                    }
                    
                    return result;
                }
            };
            
            return rootState;
        },
        { name: 'beatgen-store-with-instances' }
    )
);

/**
 * Hook to initialize the store with instances on mount
 */
export const useInitializeStoreWithInstances = () => {
    const store = useStoreWithInstances(state => state.store) as StoreWithInstances;
    
    // Initialize audio on mount
    React.useEffect(() => {
        if (store) {
            store.initializeAudio().catch(console.error);
        }
    }, [store]);
    
    return store;
};