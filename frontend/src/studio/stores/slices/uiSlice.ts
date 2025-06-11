import { RootState, SetFn, GetFn, StoreSliceCreator } from '../types';
import { produce } from 'immer'; // Import produce
import { apiClient } from '../../../platform/api/client';
import { ToolType } from '../../components/shared';

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
  
  // Timeline tool state
  selectedTool: ToolType;
  gridSnapEnabled: boolean;
  selectedSnapSize: number;
  
  // Track selection and copy/paste state
  selectedTracks: Set<string>; // Set of selected track IDs
  copiedTracks: string[]; // Array of copied track IDs
  selectedTrackForPasting: string | null; // Track selected in sidebar for pasting workflow
  contextMenuOpen: boolean;
  contextMenuPosition: { x: number; y: number } | null;
  contextMenuTrackId: string | null;
  
  // Actions (mostly simple setters)
  setZoomLevel: (zoomLevel: number) => void;
  setMeasureCount: (measureCount: number) => void;
  setAddMenuAnchor: (el: HTMLElement | null) => void;
  
  // Timeline tool actions
  setSelectedTool: (tool: ToolType) => void;
  setGridSnapEnabled: (enabled: boolean) => void;
  setSelectedSnapSize: (size: number) => void;
  openDrumMachine: (drumTrackId: string) => void;
  closeDrumMachine: (drumTrackId: string) => void;
  setAutoSaveStatus: (status: AutoSaveStatus, message?: string) => void;
  
  // Track selection actions
  selectTrack: (trackId: string, addToSelection?: boolean) => void;
  deselectTrack: (trackId: string) => void;
  clearSelection: () => void;
  selectAllTracks: () => void;
  isTrackSelected: (trackId: string) => boolean;
  
  // Copy/paste actions
  copySelectedTracks: () => void;
  pasteTracksAtPosition: (x: number, y: number) => Promise<void>;
  canPaste: () => boolean;
  
  // Select-to-paste workflow actions
  selectTrackForPasting: (trackId: string) => void;
  deselectTrackForPasting: () => void;
  pasteSelectedTrackAtPosition: (x: number, y: number) => Promise<void>;
  isTrackSelectedForPasting: (trackId: string) => boolean;
  
  // Context menu actions
  openContextMenu: (x: number, y: number, trackId?: string) => void;
  closeContextMenu: () => void;
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
    
    // Timeline tool initial state
    selectedTool: 'select' as ToolType,
    gridSnapEnabled: true,
    selectedSnapSize: 2, // Default to 1/16 note
    
    // Track selection and copy/paste initial state
    selectedTracks: new Set<string>(),
    copiedTracks: [],
    selectedTrackForPasting: null,
    contextMenuOpen: false,
    contextMenuPosition: null,
    contextMenuTrackId: null,

    // Actions implementations using Immer
    setZoomLevel: (zoomLevel) => set(produce((draft: RootState) => { draft.zoomLevel = zoomLevel; })),
    setMeasureCount: (measureCount) => set(produce((draft: RootState) => { draft.measureCount = measureCount; })),
    setAddMenuAnchor: (el) => set(produce((draft: RootState) => { draft.addMenuAnchor = el; })),
    
    // Timeline tool actions
    setSelectedTool: (tool) => set(produce((draft: RootState) => { draft.selectedTool = tool; })),
    setGridSnapEnabled: (enabled) => set(produce((draft: RootState) => { draft.gridSnapEnabled = enabled; })),
    setSelectedSnapSize: (size) => set(produce((draft: RootState) => { draft.selectedSnapSize = size; })),
    
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
    
    // Track selection actions
    selectTrack: (trackId, addToSelection = false) => set(produce((draft: RootState) => {
      console.log('🎯 TRACK SELECTION - selectTrack called');
      console.log('🎯 - trackId:', trackId);
      console.log('🎯 - addToSelection:', addToSelection);
      console.log('🎯 - current selectedTracks before:', Array.from(draft.selectedTracks));
      
      if (!addToSelection) {
        // Modify the existing Set in place to maintain reference stability
        draft.selectedTracks.clear();
        draft.selectedTracks.add(trackId);
      } else {
        // Add to existing Set to maintain reference stability
        draft.selectedTracks.add(trackId);
      }
      
      console.log('🎯 - selectedTracks after:', Array.from(draft.selectedTracks));
    })),
    
    deselectTrack: (trackId) => set(produce((draft: RootState) => {
      // Modify the existing Set in place to maintain reference stability
      draft.selectedTracks.delete(trackId);
    })),
    
    clearSelection: () => set(produce((draft: RootState) => {
      // Modify the existing Set in place to maintain reference stability
      draft.selectedTracks.clear();
    })),
    
    selectAllTracks: () => set(produce((draft: RootState) => {
      console.log('🎯 SELECT ALL - Starting');
      console.log('🎯 - tracks available:', draft.tracks?.map(t => ({ id: t.id, name: t.name })));
      
      const allTrackIds = draft.tracks.map(track => track.id);
      console.log('🎯 - allTrackIds:', allTrackIds);
      
      // Modify the existing Set in place to maintain reference stability
      draft.selectedTracks.clear();
      allTrackIds.forEach(id => draft.selectedTracks.add(id));
      console.log('🎯 - selectedTracks set to:', Array.from(draft.selectedTracks));
    })),
    
    isTrackSelected: (trackId) => {
      const state = get();
      return state.selectedTracks.has(trackId);
    },
    
    // Copy/paste actions
    copySelectedTracks: () => set(produce((draft: RootState) => {
      console.log('🔄 COPY OPERATION - Starting');
      console.log('🔄 Selected tracks:', Array.from(draft.selectedTracks));
      console.log('🔄 Current project:', draft.project);
      console.log('🔄 All tracks:', draft.tracks?.map(t => ({ id: t.id, name: t.name })));
      draft.copiedTracks = Array.from(draft.selectedTracks);
      console.log('🔄 Copied tracks set to:', draft.copiedTracks);
    })),
    
    pasteTracksAtPosition: async (x, y) => {
      console.log('📋 PASTE OPERATION - Starting (Creating Visual Track Instances)');
      console.log('📋 Position:', { x, y });
      
      const state = get();
      const { copiedTracks, tracks, project, createTrackInstance } = state;
      
      console.log('📋 Full state analysis:');
      console.log('📋 - copiedTracks:', copiedTracks);
      console.log('📋 - copiedTracks.length:', copiedTracks.length);
      console.log('📋 - tracks count:', tracks?.length);
      console.log('📋 - project object:', project);
      console.log('📋 - project?.id:', project?.id);
      console.log('📋 - typeof project?.id:', typeof project?.id);
      
      if (copiedTracks.length === 0) {
        console.log('📋 ABORT - No copied tracks');
        return;
      }
      
      // Get project ID from current project
      const projectId = project?.id;
      if (!projectId) {
        console.error('📋 ERROR - No project ID available for paste operation');
        console.error('📋 - project object keys:', project ? Object.keys(project) : 'project is null/undefined');
        console.error('📋 - full project object:', JSON.stringify(project, null, 2));
        return;
      }
      
      console.log('📋 SUCCESS - Project ID found:', projectId);
      
      // Find the copied track data
      const tracksToCopy = copiedTracks
        .map(id => tracks.find(track => track.id === id))
        .filter(Boolean);
      
      if (tracksToCopy.length === 0) return;
      
      console.log(`📋 Creating ${tracksToCopy.length} visual track instances at position (${x}, ${y})`);
      
      // Create visual track instances (frontend) and backend instances
      console.log(`📋 DETAILED PASTE PROCESS - Starting instance creation for ${tracksToCopy.length} tracks`);
      
      for (let i = 0; i < tracksToCopy.length; i++) {
        const track = tracksToCopy[i];
        console.log(`📋 TRACK ${i + 1}/${tracksToCopy.length} - Processing track:`, {
          id: track.id,
          name: track.name,
          type: track.type,
          x_position: track.x_position,
          y_position: track.y_position
        });
        
        try {
          // 1. Create visual track instance
          console.log(`📋 STEP 1 - Creating visual instance for track ${track.id} at position (${x}, ${y})`);
          const instanceId = await createTrackInstance(track.id, { x, y });
          
          if (instanceId) {
            console.log(`📋 STEP 1 SUCCESS - Visual instance created: ${instanceId}`);
            
            // 2. Also create backend instance for persistence
            console.log(`📋 STEP 2 - Creating backend instance for track ${track.id}`);
            try {
              const response = await apiClient.post(
                `/projects/${projectId}/tracks/${track.id}/instances`,
                {
                  x_position: x,
                  y_position: y,
                  trim_start_ticks: 0,
                  volume: 1.0,
                  pan: 0.0,
                  mute: false
                }
              );
              
              console.log(`📋 STEP 2 SUCCESS - Backend instance created:`, response.data);
            } catch (backendError: any) {
              console.error(`📋 STEP 2 FAILED - Backend instance error:`, backendError);
              console.error(`📋 STEP 2 FAILED - Response status:`, backendError.response?.status);
              console.error(`📋 STEP 2 FAILED - Response data:`, backendError.response?.data);
            }
          } else {
            console.error(`📋 STEP 1 FAILED - Visual instance creation returned null for track ${track.id}`);
          }
          
        } catch (error: any) {
          console.error(`📋 COMPLETE FAILURE - Error processing track ${track.id}:`, error);
          console.error(`📋 COMPLETE FAILURE - Error stack:`, error.stack);
        }
      }
      
      console.log(`📋 DETAILED PASTE PROCESS - Completed processing all tracks`);
      
      // Check final state of track instances
      const finalState = get();
      const finalInstanceCount = finalState.trackInstances ? finalState.trackInstances.size : 0;
      const finalInstances = finalState.getAllInstances ? finalState.getAllInstances() : [];
      
      console.log(`📋 FINAL STATE CHECK:`);
      console.log(`📋 - Total track instances in state: ${finalInstanceCount}`);
      console.log(`📋 - Track instances via getAllInstances: ${finalInstances.length}`);
      console.log(`📋 - Instance details:`, finalInstances);
      
      // Clear selection after paste
      set(produce((draft: RootState) => {
        draft.selectedTracks.clear();
      }));
      
      console.log('📋 PASTE OPERATION - Completed');
    },
    
    canPaste: () => {
      const state = get();
      return state.copiedTracks.length > 0;
    },
    
    // Select-to-paste workflow actions
    selectTrackForPasting: (trackId) => set(produce((draft: RootState) => {
      console.log('🎯 SELECT FOR PASTING - trackId:', trackId);
      console.log('🎯 - current selectedTrackForPasting:', draft.selectedTrackForPasting);
      
      // Toggle selection: if already selected, deselect it
      if (draft.selectedTrackForPasting === trackId) {
        console.log('🎯 - Deselecting (was already selected)');
        draft.selectedTrackForPasting = null;
      } else {
        console.log('🎯 - Selecting for pasting');
        draft.selectedTrackForPasting = trackId;
      }
      
      console.log('🎯 - new selectedTrackForPasting:', draft.selectedTrackForPasting);
    })),
    
    deselectTrackForPasting: () => set(produce((draft: RootState) => {
      console.log('🎯 DESELECT FOR PASTING');
      draft.selectedTrackForPasting = null;
    })),
    
    pasteSelectedTrackAtPosition: async (x, y) => {
      console.log('📋 PASTE SELECTED TRACK - Starting');
      console.log('📋 Position:', { x, y });
      
      const state = get();
      const { selectedTrackForPasting, tracks, project, createTrackInstance } = state;
      
      if (!selectedTrackForPasting) {
        console.log('📋 ABORT - No track selected for pasting');
        return;
      }
      
      // Find the selected track
      const trackToPaste = tracks.find(track => track.id === selectedTrackForPasting);
      if (!trackToPaste) {
        console.error('📋 ERROR - Selected track not found in tracks array');
        return;
      }
      
      // Get project ID
      const projectId = project?.id;
      if (!projectId) {
        console.error('📋 ERROR - No project ID available');
        return;
      }
      
      console.log('📋 Creating track instance for:', trackToPaste.name);
      
      try {
        // Create visual track instance
        const instanceId = await createTrackInstance(trackToPaste.id, { x, y });
        
        if (instanceId) {
          console.log('📋 SUCCESS - Visual instance created:', instanceId);
          
          // Create backend instance
          try {
            const response = await apiClient.post(
              `/projects/${projectId}/tracks/${trackToPaste.id}/instances`,
              {
                x_position: x,
                y_position: y,
                trim_start_ticks: 0,
                volume: 1.0,
                pan: 0.0,
                mute: false
              }
            );
            console.log('📋 SUCCESS - Backend instance created:', response.data);
          } catch (backendError: any) {
            console.error('📋 Backend error (continuing with visual instance):', backendError);
          }
          
          // Deselect the track after successful paste
          set(produce((draft: RootState) => {
            draft.selectedTrackForPasting = null;
          }));
          
        } else {
          console.error('📋 ERROR - Visual instance creation failed');
        }
        
      } catch (error: any) {
        console.error('📋 ERROR - Failed to create track instance:', error);
      }
    },
    
    isTrackSelectedForPasting: (trackId) => {
      const state = get();
      return state.selectedTrackForPasting === trackId;
    },
    
    // Context menu actions
    openContextMenu: (x, y, trackId) => set(produce((draft: RootState) => {
      draft.contextMenuOpen = true;
      draft.contextMenuPosition = { x, y };
      draft.contextMenuTrackId = trackId || null;
    })),
    
    closeContextMenu: () => set(produce((draft: RootState) => {
      draft.contextMenuOpen = false;
      draft.contextMenuPosition = null;
      draft.contextMenuTrackId = null;
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
