import { RootState, SetFn, GetFn, StoreSliceCreator } from '../types';
import { Tool } from '../../shared/interactions';

export interface ToolSlice {
  // Tool state
  selectedTool: Tool;
  snapToGrid: boolean;
  
  // Tool actions
  setSelectedTool: (tool: Tool) => void;
  toggleSnapToGrid: () => void;
}

export const createToolSlice: StoreSliceCreator<ToolSlice> = (set, get) => {
  return {
    // Initial state
    selectedTool: 'select',
    snapToGrid: true,
    
    // Actions
    setSelectedTool: (tool: Tool) => set((state) => {
      state.selectedTool = tool;
    }),
    
    toggleSnapToGrid: () => set((state) => {
      state.snapToGrid = !state.snapToGrid;
    }),
  };
};