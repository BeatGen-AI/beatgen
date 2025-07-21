import { useState, useCallback, useRef, useEffect } from 'react';

// Import from types instead of redefining
import { DraggableResizableItem } from './types';

// Position update for drag operations
export interface PositionUpdate {
  x: number; // In logical units
  y: number; // In visual units
}

// Dimension update for resize operations
export interface DimensionUpdate {
  start?: number; // In logical units
  width?: number; // In logical units
}

export interface UseResizeDragOptions<T extends DraggableResizableItem> {
  items: T[];
  selectedIds: (string | number)[];
  pixelsPerTick: number; // Base pixels per tick (before zoom)
  zoom?: number;
  gridSnapEnabled?: boolean;
  gridSize?: number; // In logical units (ticks)
  onDragStart?: (itemId: string | number, selectedIds: (string | number)[]) => void;
  onDragMove?: (updates: Map<string | number, PositionUpdate>) => void;
  onDragEnd?: (updates: Map<string | number, PositionUpdate>) => void;
  onResizeStart?: (itemId: string | number, selectedIds: (string | number)[], direction: 'left' | 'right') => void;
  onResizeMove?: (updates: Map<string | number, DimensionUpdate>) => void;
  onResizeEnd?: (updates: Map<string | number, DimensionUpdate>) => void;
}

export interface ResizeDragState {
  // Drag state
  isDragging: boolean;
  draggedItemId: string | number | null;
  dragStartPos: { x: number; y: number };
  initialPositions: Map<string | number, { x: number; y: number }>;
  mouseOffset?: { x: number; y: number };
  
  // Resize state
  isResizing: boolean;
  resizingItemId: string | number | null;
  resizeDirection: 'left' | 'right' | null;
  resizeStartPos: { x: number; y: number };
  initialDimensions: Map<string | number, { x: number; width: number }>;
}

export function useResizeDrag<T extends DraggableResizableItem>(
  options: UseResizeDragOptions<T>
) {
  const {
    items,
    selectedIds,
    pixelsPerTick,
    zoom = 1,
    gridSnapEnabled = true,
    gridSize = 120, // Default to 16th note (480 / 4)
    onDragStart,
    onDragMove,
    onDragEnd,
    onResizeStart,
    onResizeMove,
    onResizeEnd
  } = options;

  // Combined state for drag and resize
  const [state, setState] = useState<ResizeDragState>({
    // Drag state
    isDragging: false,
    draggedItemId: null,
    dragStartPos: { x: 0, y: 0 },
    initialPositions: new Map(),
    
    // Resize state
    isResizing: false,
    resizingItemId: null,
    resizeDirection: null,
    resizeStartPos: { x: 0, y: 0 },
    initialDimensions: new Map()
  });

  // Refs for mouse position tracking
  const mouseStartRef = useRef({ x: 0, y: 0 });
  const lastDragUpdateRef = useRef<Map<string | number, PositionUpdate>>(new Map());
  const lastResizeUpdateRef = useRef<Map<string | number, DimensionUpdate>>(new Map());

  // Convert pixels to ticks (accounting for zoom)
  const pixelsToTicks = useCallback((pixels: number): number => {
    return pixels / (pixelsPerTick * zoom);
  }, [pixelsPerTick, zoom]);

  // Convert ticks to pixels (accounting for zoom)
  const ticksToPixels = useCallback((ticks: number): number => {
    return ticks * pixelsPerTick * zoom;
  }, [pixelsPerTick, zoom]);

  // Helper to snap a value to grid if enabled
  const snapToGrid = useCallback((value: number): number => {
    if (!gridSnapEnabled || gridSize === 0) return value;
    return Math.round(value / gridSize) * gridSize;
  }, [gridSnapEnabled, gridSize]);

  // Start drag operation
  const startDrag = useCallback((
    itemId: string | number,
    mousePosition: { x: number; y: number },
    mouseOffset?: { x: number; y: number }
  ) => {
    // Determine which items to drag
    const itemsToDrag = selectedIds.includes(itemId) ? selectedIds : [itemId];
    
    // Store initial positions
    const initialPositions = new Map<string | number, { x: number; y: number }>();
    items.forEach(item => {
      if (itemsToDrag.includes(item.id)) {
        initialPositions.set(item.id, { x: item.x, y: item.y });
      }
    });

    setState(prev => ({
      ...prev,
      isDragging: true,
      draggedItemId: itemId,
      dragStartPos: mousePosition,
      initialPositions,
      mouseOffset
    }));

    mouseStartRef.current = mousePosition;
    onDragStart?.(itemId, itemsToDrag);
  }, [items, selectedIds, onDragStart]);

  // Update drag position
  const updateDrag = useCallback((mousePosition: { x: number; y: number }) => {
    if (!state.isDragging) return;

    // Calculate updates for all dragged items
    const updates = new Map<string | number, PositionUpdate>();
    
    state.initialPositions.forEach((initialPos, itemId) => {
      // For the primary dragged item, calculate position based on mouse
      if (itemId === state.draggedItemId && state.mouseOffset) {
        // Calculate target position in pixels
        const targetX = mousePosition.x - state.mouseOffset.x;
        const targetY = mousePosition.y - state.mouseOffset.y;
        
        // Convert to ticks
        let newX = pixelsToTicks(targetX);
        let newY = targetY;
        
        // Snap to grid if enabled
        if (gridSnapEnabled) {
          newX = snapToGrid(newX);
        }
        
        // Ensure non-negative positions
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        
        updates.set(itemId, { x: newX, y: newY });
      } else {
        // For other selected items, maintain relative position
        const primaryItem = state.initialPositions.get(state.draggedItemId!);
        if (primaryItem && state.mouseOffset) {
          const targetX = mousePosition.x - state.mouseOffset.x;
          const targetY = mousePosition.y - state.mouseOffset.y;
          
          let primaryNewX = pixelsToTicks(targetX);
          const primaryNewY = targetY;
          
          if (gridSnapEnabled) {
            primaryNewX = snapToGrid(primaryNewX);
          }
          
          // Calculate delta from primary item's initial position
          const deltaX = primaryNewX - primaryItem.x;
          const deltaY = primaryNewY - primaryItem.y;
          
          // Apply delta to this item
          let newX = initialPos.x + deltaX;
          let newY = initialPos.y + deltaY;
          
          // Ensure non-negative positions
          newX = Math.max(0, newX);
          newY = Math.max(0, newY);
          
          updates.set(itemId, { x: newX, y: newY });
        }
      }
    });

    lastDragUpdateRef.current = updates;
    onDragMove?.(updates);
  }, [state.isDragging, state.draggedItemId, state.initialPositions, state.mouseOffset, pixelsToTicks, gridSnapEnabled, snapToGrid, onDragMove]);

  // End drag operation
  const endDrag = useCallback(() => {
    if (!state.isDragging) return;

    // Use the last updates
    const finalUpdates = lastDragUpdateRef.current;
    
    setState(prev => ({
      ...prev,
      isDragging: false,
      draggedItemId: null,
      dragStartPos: { x: 0, y: 0 },
      initialPositions: new Map(),
      mouseOffset: undefined
    }));

    onDragEnd?.(finalUpdates);
    lastDragUpdateRef.current = new Map();
  }, [state.isDragging, onDragEnd]);

  // Start resize operation
  const startResize = useCallback((
    itemId: string | number,
    direction: 'left' | 'right',
    mousePosition: { x: number; y: number }
  ) => {
    // Determine which items to resize
    const itemsToResize = selectedIds.includes(itemId) ? selectedIds : [itemId];
    
    // Store initial dimensions
    const initialDimensions = new Map<string | number, { x: number; width: number }>();
    items.forEach(item => {
      if (itemsToResize.includes(item.id)) {
        initialDimensions.set(item.id, { x: item.x, width: item.width });
      }
    });

    setState(prev => ({
      ...prev,
      isResizing: true,
      resizingItemId: itemId,
      resizeDirection: direction,
      resizeStartPos: mousePosition,
      initialDimensions
    }));

    mouseStartRef.current = mousePosition;
    onResizeStart?.(itemId, itemsToResize, direction);
  }, [items, selectedIds, onResizeStart]);

  // Update resize
  const updateResize = useCallback((mousePosition: { x: number; y: number }) => {
    if (!state.isResizing || !state.resizeDirection) return;

    // Calculate delta in pixels
    const deltaX = mousePosition.x - mouseStartRef.current.x;
    
    // Convert to ticks
    const deltaTicks = pixelsToTicks(deltaX);

    // Calculate updates for all resized items
    const updates = new Map<string | number, DimensionUpdate>();
    
    state.initialDimensions.forEach((initialDim, itemId) => {
      if (state.resizeDirection === 'left') {
        // Left resize: change start position and width
        let newStart = initialDim.x + deltaTicks;
        let newWidth = initialDim.width - deltaTicks;

        // Snap to grid if enabled
        if (gridSnapEnabled) {
          newStart = snapToGrid(newStart);
          // Recalculate width to maintain right edge
          const rightEdge = initialDim.x + initialDim.width;
          newWidth = rightEdge - newStart;
        }

        // Ensure minimum width (much smaller for audio tracks)
        const minWidth = 10; // Allow very small widths for precise audio trimming
        if (newWidth < minWidth) {
          newWidth = minWidth;
          newStart = initialDim.x + initialDim.width - minWidth;
        }

        // Ensure non-negative start
        newStart = Math.max(0, newStart);

        updates.set(itemId, { start: newStart, width: newWidth });
      } else {
        // Right resize: only change width
        let newWidth = initialDim.width + deltaTicks;

        // Snap to grid if enabled
        if (gridSnapEnabled) {
          newWidth = snapToGrid(newWidth);
        }

        // Ensure minimum width (much smaller for audio tracks)
        const minWidth = 10; // Allow very small widths for precise audio trimming
        newWidth = Math.max(minWidth, newWidth);

        updates.set(itemId, { width: newWidth });
      }
    });

    lastResizeUpdateRef.current = updates;
    onResizeMove?.(updates);
  }, [state.isResizing, state.resizeDirection, state.initialDimensions, pixelsToTicks, gridSnapEnabled, snapToGrid, gridSize, onResizeMove]);

  // End resize operation
  const endResize = useCallback(() => {
    if (!state.isResizing) return;

    // Use the last updates
    const finalUpdates = lastResizeUpdateRef.current;
    
    setState(prev => ({
      ...prev,
      isResizing: false,
      resizingItemId: null,
      resizeDirection: null,
      resizeStartPos: { x: 0, y: 0 },
      initialDimensions: new Map()
    }));

    onResizeEnd?.(finalUpdates);
    lastResizeUpdateRef.current = new Map();
  }, [state.isResizing, onResizeEnd]);

  // Grid control
  const [gridSizeState, setGridSizeState] = useState(gridSize);
  const [snapEnabledState, setSnapEnabledState] = useState(gridSnapEnabled);

  const setGridSize = useCallback((newSize: number) => {
    setGridSizeState(newSize);
  }, []);

  const toggleSnapToGrid = useCallback(() => {
    setSnapEnabledState(prev => !prev);
  }, []);

  // Global mouse event handlers for drag operations
  useEffect(() => {
    if (!state.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Find the container element to get scroll offset
      const container = document.querySelector('.timeline-container') || 
                       document.querySelector('.piano-scroll-container');
      
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft || 0;
        const scrollTop = container.scrollTop || 0;
        
        updateDrag({ 
          x: e.clientX - containerRect.left + scrollLeft,
          y: e.clientY - containerRect.top + scrollTop
        });
      } else {
        updateDrag({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseUp = () => {
      endDrag();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [state.isDragging, updateDrag, endDrag]);

  // Global mouse event handlers for resize operations
  useEffect(() => {
    if (!state.isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Find the container element to get scroll offset
      const container = document.querySelector('.timeline-container') || 
                       document.querySelector('.piano-scroll-container');
      
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft || 0;
        const scrollTop = container.scrollTop || 0;
        
        updateResize({ 
          x: e.clientX - containerRect.left + scrollLeft,
          y: e.clientY - containerRect.top + scrollTop
        });
      } else {
        updateResize({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseUp = () => {
      endResize();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [state.isResizing, updateResize, endResize]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (state.isDragging) {
        endDrag();
      }
      if (state.isResizing) {
        endResize();
      }
    };
  }, []);

  return {
    // State
    isDragging: state.isDragging,
    isResizing: state.isResizing,
    dragState: {
      draggedItemId: state.draggedItemId,
      initialPositions: state.initialPositions,
      mouseOffset: state.mouseOffset
    },
    resizeState: {
      resizingItemId: state.resizingItemId,
      direction: state.resizeDirection,
      initialDimensions: state.initialDimensions
    },

    // Methods
    startDrag,
    updateDrag,
    endDrag,
    startResize,
    updateResize,
    endResize,
    setGridSize,
    toggleSnapToGrid,

    // Utilities
    pixelsToTicks,
    ticksToPixels,
    snapToGrid
  };
}