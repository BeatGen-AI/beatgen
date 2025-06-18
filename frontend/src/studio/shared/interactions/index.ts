// Export types explicitly to avoid conflicts
export type { Tool, DraggableResizableItem, Selectable, Note, Track, SelectionRect, ToolState } from './types';
export * from './useInteractionManager';
export * from './selectionUtils';
export { default as SelectionOverlay } from './SelectionOverlay';
export { default as InteractionToolbar } from './InteractionToolbar';

// Unified interaction system exports
export * from './useInteractions';
export { 
  type PositionUpdate,
  type DimensionUpdate,
  type UseResizeDragOptions,
  type ResizeDragState,
  useResizeDrag
} from './useResizeDrag';
export { 
  type SelectionState,
  type UseSelectionOptions,
  useSelection
} from './useSelection';
export { 
  type UseToolOptions,
  useTool
} from './useTool';
export {
  type ClipboardState,
  type UseClipboardOptions,
  useClipboard
} from './useClipboard';
export * from './ResizeHandle';
export * from './DragGhost';