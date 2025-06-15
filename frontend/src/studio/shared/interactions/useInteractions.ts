import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  DraggableResizableItem, 
  useResizeDrag,
  PositionUpdate,
  DimensionUpdate 
} from './useResizeDrag';
import { useSelection, SelectionState } from './useSelection';
import { Tool, ToolState, useTool } from './useTool';
import { useClipboard, ClipboardState } from './useClipboard';

export interface InteractionOptions<T extends DraggableResizableItem> {
  items: T[];
  pixelsPerTick: number; // Base pixels per tick (before zoom)
  zoom?: number; // Zoom level (default 1.0)
  initialTool?: Tool;
  snapToGrid?: boolean;
  gridSize?: number; // Grid size in ticks
  onSelectionChange?: (selectedIds: (string | number)[]) => void;
  onDragStart?: (itemId: string | number, selectedIds: (string | number)[]) => void;
  onDragMove?: (updates: Map<string | number, PositionUpdate>) => void;
  onDragEnd?: (updates: Map<string | number, PositionUpdate>) => void;
  onResizeStart?: (itemId: string | number, selectedIds: (string | number)[], direction: 'left' | 'right') => void;
  onResizeMove?: (updates: Map<string | number, DimensionUpdate>) => void;
  onResizeEnd?: (updates: Map<string | number, DimensionUpdate>) => void;
  onItemClick?: (itemId: string | number, tool: Tool) => void;
  onItemDoubleClick?: (itemId: string | number) => void;
  onCopy?: (items: T[]) => void;
  onCut?: (items: T[]) => void;
  onPaste?: (items: T[], position?: { x: number; y: number }) => void;
  onDelete?: (itemIds: (string | number)[]) => void;
  onDuplicate?: (itemIds: (string | number)[]) => void;
}

export interface InteractionState {
  selectionState: SelectionState;
  toolState: ToolState;
  clipboardState: ClipboardState;
  isDragging: boolean;
  isResizing: boolean;
  draggedItemId: string | number | null;
  resizingItemId: string | number | null;
  resizeDirection: 'left' | 'right' | null;
}

/**
 * Unified interaction hook that works for both timeline tracks and piano roll notes
 * Both use zoom - timeline for visual display, piano roll for note editing
 */
export function useInteractions<T extends DraggableResizableItem>(
  options: InteractionOptions<T>
) {
  const {
    items,
    pixelsPerTick,
    zoom = 1.0,
    initialTool = 'select',
    snapToGrid = true,
    gridSize = 120, // Default to 16th note (480 PPQ / 4)
    onSelectionChange,
    onDragStart,
    onDragMove,
    onDragEnd,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
    onItemClick,
    onItemDoubleClick,
    onCopy,
    onCut,
    onPaste,
    onDelete,
    onDuplicate
  } = options;

  // Core interaction states
  const selection = useSelection<T>({ 
    items, 
    onSelectionChange 
  });
  
  const tool = useTool({ 
    initialTool 
  });
  
  const clipboard = useClipboard<T>({
    onCopy,
    onCut,
    onPaste
  });

  // Drag/resize state
  const dragResize = useResizeDrag({
    items,
    selectedIds: selection.selectedIds,
    pixelsPerTick,
    zoom,
    gridSnapEnabled: snapToGrid && tool.selectedTool === 'select',
    gridSize,
    onDragStart: (itemId) => {
      onDragStart?.(itemId, selection.selectedIds);
    },
    onDragMove: (updates) => {
      onDragMove?.(updates);
    },
    onDragEnd: (updates) => {
      onDragEnd?.(updates);
    },
    onResizeStart: (itemId, selectedIds, direction) => {
      onResizeStart?.(itemId, selectedIds, direction);
    },
    onResizeMove: (updates) => {
      onResizeMove?.(updates);
    },
    onResizeEnd: (updates) => {
      onResizeEnd?.(updates);
    }
  });

  // Combined state
  const [isSelecting, setIsSelecting] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);

  // Handle background mouse down for rectangle selection
  const handleBackgroundMouseDown = useCallback((
    position: { x: number; y: number },
    modifiers: { shiftKey?: boolean } = {}
  ) => {
    if (tool.selectedTool !== 'select') return;

    // Start rectangle selection
    setIsSelecting(true);
    selection.startSelection(position, modifiers.shiftKey);
  }, [tool.selectedTool, selection]);

  // Update selection rectangle
  const updateSelection = useCallback((position: { x: number; y: number }) => {
    if (!isSelecting) return;
    selection.updateSelection(position);
  }, [isSelecting, selection]);

  // End selection
  const endSelection = useCallback((shiftKey?: boolean) => {
    if (!isSelecting) return;
    
    setIsSelecting(false);
    selection.endSelection(shiftKey);
  }, [isSelecting, selection]);

  // Handle item click
  const handleItemClick = useCallback((
    itemId: string | number,
    modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}
  ) => {
    // Handle tool-specific actions
    if (tool.selectedTool !== 'select') {
      onItemClick?.(itemId, tool.selectedTool);
      return;
    }

    // Handle selection
    if (modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey) {
      selection.toggleSelection([itemId]);
    } else {
      selection.selectSingle(itemId);
    }
  }, [tool.selectedTool, selection, onItemClick]);

  // Handle item double click
  const handleItemDoubleClick = useCallback((itemId: string | number) => {
    onItemDoubleClick?.(itemId);
  }, [onItemDoubleClick]);

  // Keyboard shortcut handling
  const handleKeyDown = useCallback((
    event: KeyboardEvent,
    selectableItems?: Array<{ id: string | number; type: string; x: number; y: number }>
  ) => {
    // Don't handle if typing in an input
    if ((event.target as HTMLElement).tagName === 'INPUT' || 
        (event.target as HTMLElement).tagName === 'TEXTAREA') {
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;

    // Tool shortcuts
    if (!ctrlOrCmd && !event.shiftKey) {
      switch (event.key.toLowerCase()) {
        case 'v':
          event.preventDefault();
          tool.setTool('select');
          break;
        case 'b':
          event.preventDefault();
          tool.setTool('pen');
          break;
        case 'e':
          event.preventDefault();
          tool.setTool('eraser');
          break;
        case 'h':
          event.preventDefault();
          tool.setTool('highlighter');
          break;
      }
    }

    // Selection shortcuts
    if (ctrlOrCmd) {
      switch (event.key.toLowerCase()) {
        case 'a':
          event.preventDefault();
          selection.selectAll();
          break;
        case 'd':
          event.preventDefault();
          selection.clearSelection();
          break;
      }
    }

    // Clipboard shortcuts
    if (ctrlOrCmd && selection.selectedIds.length > 0) {
      const selectedItems = items.filter(item => 
        selection.selectedIds.includes(item.id)
      );

      switch (event.key.toLowerCase()) {
        case 'c':
          event.preventDefault();
          clipboard.copy(selectedItems);
          break;
        case 'x':
          event.preventDefault();
          clipboard.cut(selectedItems);
          break;
        case 'v':
          event.preventDefault();
          if (clipboard.hasClipboardContent) {
            clipboard.paste();
          }
          break;
      }
    }

    // Delete key
    if ((event.key === 'Delete' || event.key === 'Backspace') && selection.selectedIds.length > 0) {
      event.preventDefault();
      onDelete?.(selection.selectedIds);
    }

    // Duplicate (Ctrl/Cmd+D)
    if (ctrlOrCmd && event.key.toLowerCase() === 'd' && selection.selectedIds.length > 0) {
      event.preventDefault();
      onDuplicate?.(selection.selectedIds);
    }

    // Escape to clear selection
    if (event.key === 'Escape') {
      selection.clearSelection();
      tool.setTool('select');
    }
  }, [items, selection, tool, clipboard, onDelete, onDuplicate]);

  // Convert pixel coordinates to ticks (accounting for zoom)
  const pixelsToTicks = useCallback((pixels: number): number => {
    return pixels / (pixelsPerTick * zoom);
  }, [pixelsPerTick, zoom]);

  // Convert ticks to pixel coordinates (accounting for zoom)
  const ticksToPixels = useCallback((ticks: number): number => {
    return ticks * pixelsPerTick * zoom;
  }, [pixelsPerTick, zoom]);

  // Get item at position (useful for timeline track clicking)
  const getItemAtPosition = useCallback((x: number, y: number): T | undefined => {
    // Convert pixel position to ticks
    const xTicks = pixelsToTicks(x);
    
    return items.find(item => {
      const itemEndTicks = item.x + (item.width || 0);
      const itemBottom = item.y + (item.height || 0);
      
      return xTicks >= item.x && 
             xTicks <= itemEndTicks && 
             y >= item.y && 
             y <= itemBottom;
    });
  }, [items, pixelsToTicks]);

  // Update grid size
  const setGridSize = useCallback((newGridSize: number) => {
    dragResize.setGridSize(newGridSize);
  }, [dragResize]);

  // Toggle snap to grid
  const toggleSnapToGrid = useCallback(() => {
    dragResize.toggleSnapToGrid();
  }, [dragResize]);

  return {
    // States
    selectionState: selection.selectionState,
    selectedIds: selection.selectedIds,
    toolState: tool,
    clipboardState: clipboard,
    isDragging: dragResize.isDragging,
    isResizing: dragResize.isResizing,
    draggedItemId: dragResize.dragState.draggedItemId,
    resizingItemId: dragResize.resizeState.resizingItemId,
    resizeDirection: dragResize.resizeState.direction,
    isSelecting,

    // Selection methods
    selectSingle: selection.selectSingle,
    selectMultiple: selection.selectMultiple,
    toggleSelection: selection.toggleSelection,
    clearSelection: selection.clearSelection,
    selectAll: selection.selectAll,
    hasSelection: selection.hasSelection,
    selectedCount: selection.selectedCount,

    // Tool methods
    setTool: tool.setTool,
    selectedTool: tool.selectedTool,

    // Drag/resize methods
    startDrag: dragResize.startDrag,
    updateDrag: dragResize.updateDrag,
    endDrag: dragResize.endDrag,
    startResize: dragResize.startResize,
    updateResize: dragResize.updateResize,
    endResize: dragResize.endResize,

    // Interaction methods
    handleBackgroundMouseDown,
    updateSelection,
    endSelection,
    handleItemClick,
    handleItemDoubleClick,
    handleKeyDown,
    getItemAtPosition,

    // Grid control
    setGridSize,
    toggleSnapToGrid,

    // Coordinate conversion utilities
    pixelsToTicks,
    ticksToPixels
  };
}