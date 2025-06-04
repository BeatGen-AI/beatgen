import { RootState, SetFn, GetFn, StoreSliceCreator } from '../types';
import { produce } from 'immer'; // Import produce

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Define the state properties and actions for this slice
export interface UISlice {
  zoomLevel: number;
  measureCount: number;
  addMenuAnchor: HTMLElement | null;
  openDrumMachines: Record<string, boolean>; // Map of drumTrackId to boolean (true if open)
  
  // Auto-save status
  autoSaveStatus: AutoSaveStatus;
  autoSaveMessage?: string;
  
  // Actions (mostly simple setters)
  setZoomLevel: (zoomLevel: number) => void;
  setMeasureCount: (measureCount: number) => void;
  setAddMenuAnchor: (el: HTMLElement | null) => void;
  openDrumMachine: (drumTrackId: string) => void;
  closeDrumMachine: (drumTrackId: string) => void;
  setAutoSaveStatus: (status: AutoSaveStatus, message?: string) => void;
  // Consider adding toggleDrumMachine if useful
}

// Create the slice function
export const createUISlice: StoreSliceCreator<UISlice> = (set, get) => {
  
  return {
    // Initial state
    zoomLevel: 1,
    measureCount: 40, // Default measure count
    addMenuAnchor: null,
    openDrumMachines: {},
    autoSaveStatus: 'idle' as AutoSaveStatus,
    autoSaveMessage: undefined,

    // Actions implementations using Immer
    setZoomLevel: (zoomLevel) => set(produce((draft: RootState) => { draft.zoomLevel = zoomLevel; })),
    setMeasureCount: (measureCount) => set(produce((draft: RootState) => { draft.measureCount = measureCount; })),
    setAddMenuAnchor: (el) => set(produce((draft: RootState) => { draft.addMenuAnchor = el; })),
    
    setAutoSaveStatus: (status, message) => set(produce((draft: RootState) => { 
      draft.autoSaveStatus = status; 
      draft.autoSaveMessage = message;
    })),
    
    openDrumMachine: (drumTrackId) => set(produce((draft: RootState) => {
        if (!draft.openDrumMachines) { draft.openDrumMachines = {}; }
        draft.openDrumMachines[drumTrackId] = true; 
    })),
    
    closeDrumMachine: (drumTrackId) => set(produce((draft: RootState) => {
        if (draft.openDrumMachines) { 
            draft.openDrumMachines[drumTrackId] = false; 
        }
    })),
    // Optional toggle function:
    // toggleDrumMachine: (drumTrackId) => setUIState((state) => ({
    //   openDrumMachines: { 
    //     ...state.openDrumMachines, 
    //     [drumTrackId]: !state.openDrumMachines[drumTrackId] 
    //   }
    // })), 
  };
};
