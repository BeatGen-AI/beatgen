import { useRef, useCallback, useEffect } from 'react';
import Konva from 'konva';

export type CursorType = 
  | 'default'
  | 'pointer'
  | 'move'
  | 'grab'
  | 'grabbing'
  | 'ew-resize'
  | 'ns-resize'
  | 'nesw-resize'
  | 'nwse-resize'
  | 'crosshair'
  | 'copy'
  | 'not-allowed'
  | 'cell';

interface CursorState {
  hover?: CursorType;
  tool?: CursorType;
  interaction?: CursorType;
}

/**
 * Hook to manage cursor state for Konva stage
 * Handles cursor priority: interaction > hover > tool > default
 */
export const useCursorManager = (stage: Konva.Stage | null) => {
  const cursorState = useRef<CursorState>({});
  const currentCursor = useRef<CursorType>('default');

  // Update the actual cursor on the stage
  const updateStageCursor = useCallback((cursor: CursorType) => {
    if (!stage) return;
    
    const container = stage.container();
    if (container && currentCursor.current !== cursor) {
      container.style.cursor = cursor;
      currentCursor.current = cursor;
    }
  }, [stage]);

  // Determine which cursor should be active based on priority
  const determineCursor = useCallback((): CursorType => {
    // Priority: interaction > hover > tool > default
    if (cursorState.current.interaction) {
      return cursorState.current.interaction;
    }
    if (cursorState.current.hover) {
      return cursorState.current.hover;
    }
    if (cursorState.current.tool) {
      return cursorState.current.tool;
    }
    return 'default';
  }, []);

  // Update cursor state and refresh display
  const updateCursor = useCallback(() => {
    const newCursor = determineCursor();
    updateStageCursor(newCursor);
  }, [determineCursor, updateStageCursor]);

  // Set hover cursor (e.g., when hovering over an item)
  const setHoverCursor = useCallback((cursor: CursorType | null) => {
    cursorState.current.hover = cursor || undefined;
    updateCursor();
  }, [updateCursor]);

  // Set tool cursor (e.g., based on selected tool)
  const setToolCursor = useCallback((cursor: CursorType | null) => {
    cursorState.current.tool = cursor || undefined;
    updateCursor();
  }, [updateCursor]);

  // Set interaction cursor (e.g., during drag or resize)
  const setInteractionCursor = useCallback((cursor: CursorType | null) => {
    cursorState.current.interaction = cursor || undefined;
    updateCursor();
  }, [updateCursor]);

  // Reset all cursors to default
  const resetCursor = useCallback(() => {
    cursorState.current = {};
    updateStageCursor('default');
  }, [updateStageCursor]);

  // Reset hover cursor only
  const resetHoverCursor = useCallback(() => {
    cursorState.current.hover = undefined;
    updateCursor();
  }, [updateCursor]);

  // Reset interaction cursor only
  const resetInteractionCursor = useCallback(() => {
    cursorState.current.interaction = undefined;
    updateCursor();
  }, [updateCursor]);

  // Get cursor for resize direction
  const getResizeCursor = useCallback((direction: 'left' | 'right' | 'top' | 'bottom' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'): CursorType => {
    switch (direction) {
      case 'left':
      case 'right':
        return 'ew-resize';
      case 'top':
      case 'bottom':
        return 'ns-resize';
      case 'topLeft':
      case 'bottomRight':
        return 'nwse-resize';
      case 'topRight':
      case 'bottomLeft':
        return 'nesw-resize';
      default:
        return 'default';
    }
  }, []);

  // Get cursor for tool
  const getToolCursor = useCallback((tool: string): CursorType => {
    switch (tool) {
      case 'select':
        return 'default';
      case 'pen':
        return 'copy';
      case 'eraser':
        return 'crosshair';
      case 'highlighter':
        return 'cell';
      default:
        return 'default';
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (stage) {
        const container = stage.container();
        if (container) {
          container.style.cursor = 'default';
        }
      }
    };
  }, [stage]);

  return {
    setHoverCursor,
    setToolCursor,
    setInteractionCursor,
    resetCursor,
    resetHoverCursor,
    resetInteractionCursor,
    getResizeCursor,
    getToolCursor,
    updateCursor
  };
};