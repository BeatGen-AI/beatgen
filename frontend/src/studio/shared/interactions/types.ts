export type Tool = 'select' | 'pen' | 'highlighter' | 'eraser';

export interface DraggableResizableItem {
  id: string | number;
  x: number; // In logical units (ticks)
  y: number; // In visual units (pixels)
  width: number; // In logical units (ticks)
  height?: number; // In visual units (pixels)
}

export interface Selectable {
  id: string;
  type: 'note' | 'track';
}

export interface Note extends Selectable {
  type: 'note';
  start: number;
  top: number;
  width: number;
  color: string;
}

export interface Track extends Selectable {
  type: 'track';
  x_position: number;
  y_position: number;
  duration_ticks: number;
  name: string;
}

export interface SelectionRect {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

export interface DragState {
  draggedItemId: string | null;
  dragOffset: { x: number; y: number };
  isGroupDrag: boolean;
  initialPositions: Record<string, { x: number; y: number }>;
}

export interface SelectionState {
  selectedIds: string[];
  selectionRect: SelectionRect | null;
  isSelecting: boolean;
}

export interface ToolState {
  selectedTool: Tool;
  snapToGrid: boolean;
  gridSize: number;
}

export interface ClipboardState {
  clipboardItems: Selectable[];
  clipboardOperation: 'copy' | 'cut' | null;
  isClipboardEmpty: boolean;
}

export interface ResizeState {
  resizingItemId: string | null;
  resizeDirection: 'left' | 'right' | null;
  initialDimensions: Record<string, { x: number; width: number }>;
  isGroupResize: boolean;
  resizeStartPos: { x: number; y: number };
}