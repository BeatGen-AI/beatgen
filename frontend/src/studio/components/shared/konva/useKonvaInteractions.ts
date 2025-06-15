import { useState, useCallback, useRef, useEffect } from 'react';
import Konva from 'konva';

/**
 * Tool types available in the interaction system
 */
export type Tool = 'select' | 'pen' | 'eraser' | 'highlighter';

/**
 * Represents a draggable/resizable item in the canvas
 */
export interface KonvaItem {
  id: string;
  x: number;      // Position in logical units (ticks for timeline, pixels for piano roll)
  y: number;      // Position in logical units
  width: number;  // Width in logical units
  height: number; // Height in logical units
  type?: 'track' | 'note' | 'custom';
  data?: any;     // Additional data specific to the item type
}

/**
 * Position in logical units
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Dimensions in logical units
 */
export interface Dimensions {
  width: number;
  height: number;
  start?: number; // For left-side resize
}

/**
 * Options for the interaction hook
 */
export interface UseKonvaInteractionsOptions {
  /** All items that can be interacted with */
  items: KonvaItem[];
  
  /** The Konva stage instance */
  stage: Konva.Stage | null;
  
  /** Pixels per logical unit (e.g., pixels per tick) */
  pixelsPerUnit: number;
  
  /** Current zoom level */
  zoom: number;
  
  /** Current tool */
  tool: Tool;
  
  /** Grid size for snapping (in logical units) */
  gridSize?: number;
  
  /** Whether grid snapping is enabled */
  snapToGrid?: boolean;
  
  /** Track height for Y-axis snapping (in pixels) */
  trackHeight?: number;
  
  // Callbacks
  onSelectionChange?: (selectedIds: string[]) => void;
  onDragStart?: (items: KonvaItem[]) => void;
  onDragMove?: (updates: Map<string, Position>) => void;
  onDragEnd?: (updates: Map<string, Position>) => void;
  onResizeStart?: (item: KonvaItem, direction: 'left' | 'right') => void;
  onResizeMove?: (updates: Map<string, Dimensions>) => void;
  onResizeEnd?: (updates: Map<string, Dimensions>) => void;
  onItemClick?: (item: KonvaItem, tool: Tool) => void;
  onBackgroundClick?: (position: Position, tool: Tool) => void;
  onCopy?: (items: KonvaItem[]) => void;
  onCut?: (items: KonvaItem[]) => void;
  onPaste?: (position?: Position) => void;
  onDelete?: (itemIds: string[]) => void;
  onDuplicate?: (itemIds: string[]) => void;
}

/**
 * Unified interaction hook for Konva-based components.
 * Handles all mouse, keyboard, and touch interactions.
 */
export function useKonvaInteractions(options: UseKonvaInteractionsOptions) {
  const {
    items,
    stage,
    pixelsPerUnit,
    zoom,
    tool,
    gridSize = 1,
    snapToGrid = true,
    trackHeight = 60,
    onSelectionChange,
    onDragStart,
    onDragMove,
    onDragEnd,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
    onItemClick,
    onBackgroundClick,
    onCopy,
    onCut,
    onPaste,
    onDelete,
    onDuplicate
  } = options;

  // State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{
    start: Position;
    end: Position;
  } | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [resizingItemId, setResizingItemId] = useState<string | null>(null);
  const [resizeDirection, setResizeDirection] = useState<'left' | 'right' | null>(null);

  // Refs for tracking drag state
  const dragStartRef = useRef<{
    mousePos: Position;
    itemPositions: Map<string, Position>;
    initialOffsets: Map<string, Position>;
  } | null>(null);

  const resizeStartRef = useRef<{
    mousePos: Position;
    item: KonvaItem;
    direction: 'left' | 'right';
    allItems: Map<string, KonvaItem>;  // Snapshots of all items being resized
  } | null>(null);

  // Ref for throttling drag updates
  const dragUpdateFrameRef = useRef<number | null>(null);

  // Convert pixel coordinates to logical units
  const pixelsToLogical = useCallback((pixels: number) => {
    return pixels / (pixelsPerUnit * zoom);
  }, [pixelsPerUnit, zoom]);

  // Convert logical units to pixels
  const logicalToPixels = useCallback((logical: number) => {
    return logical * pixelsPerUnit * zoom;
  }, [pixelsPerUnit, zoom]);

  // Snap value to grid
  const snapToGridValue = useCallback((value: number) => {
    if (!snapToGrid || gridSize === 0) return value;
    return Math.round(value / gridSize) * gridSize;
  }, [snapToGrid, gridSize]);

  // Snap Y position to track grid
  const snapYToTrackGrid = useCallback((y: number) => {
    return Math.round(y / trackHeight) * trackHeight;
  }, [trackHeight]);

  // Get item at position
  const getItemAtPosition = useCallback((x: number, y: number): KonvaItem | null => {
    // Convert to logical coordinates
    // X is in logical units (ticks), Y is in pixels
    const logicalX = pixelsToLogical(x);
    const logicalY = y; // Y is already in pixels, no conversion needed


    // Find item under cursor (reverse order to check top items first)
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (
        logicalX >= item.x &&
        logicalX <= item.x + item.width &&
        logicalY >= item.y &&
        logicalY <= item.y + item.height
      ) {
        return item;
      }
    }
    return null;
  }, [items, pixelsToLogical, pixelsPerUnit, zoom]);

  // Get items in rectangle
  const getItemsInRect = useCallback((start: Position, end: Position): KonvaItem[] => {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    return items.filter(item => {
      const itemRight = item.x + item.width;
      const itemBottom = item.y + item.height;
      
      // Check if item intersects with selection rectangle
      return !(
        item.x > maxX ||
        itemRight < minX ||
        item.y > maxY ||
        itemBottom < minY
      );
    });
  }, [items]);

  // Handle selection change
  const updateSelection = useCallback((newSelectedIds: Set<string>) => {
    setSelectedIds(newSelectedIds);
    if (onSelectionChange) {
      onSelectionChange(Array.from(newSelectedIds));
    }
  }, [onSelectionChange]);

  // Select single item
  const selectItem = useCallback((itemId: string, addToSelection = false) => {
    const newSelection = addToSelection ? new Set(selectedIds) : new Set<string>();
    newSelection.add(itemId);
    updateSelection(newSelection);
  }, [selectedIds, updateSelection]);

  // Select multiple items
  const selectMultiple = useCallback((itemIds: string[], addToSelection = false) => {
    const newSelection = addToSelection ? new Set(selectedIds) : new Set<string>();
    itemIds.forEach(id => newSelection.add(id));
    updateSelection(newSelection);
  }, [selectedIds, updateSelection]);

  // Clear selection
  const clearSelection = useCallback(() => {
    updateSelection(new Set());
  }, [updateSelection]);

  // Toggle item selection
  const toggleItemSelection = useCallback((itemId: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    updateSelection(newSelection);
  }, [selectedIds, updateSelection]);

  // Start drag operation
  const startDrag = useCallback((itemId: string, mousePos: Position) => {
    // Ensure the item is selected
    if (!selectedIds.has(itemId)) {
      selectItem(itemId);
    }

    // Get all selected items
    const selectedItems = items.filter(item => selectedIds.has(item.id));
    
    // Store initial positions
    const itemPositions = new Map<string, Position>();
    const initialOffsets = new Map<string, Position>();
    
    selectedItems.forEach(item => {
      itemPositions.set(item.id, { x: item.x, y: item.y });
      initialOffsets.set(item.id, {
        x: mousePos.x - logicalToPixels(item.x),
        y: mousePos.y - item.y // Y is already in pixels
      });
    });

    dragStartRef.current = {
      mousePos,
      itemPositions,
      initialOffsets
    };

    setIsDragging(true);
    setDraggedItemId(itemId);

    if (onDragStart) {
      onDragStart(selectedItems);
    }
  }, [selectedIds, items, selectItem, logicalToPixels, onDragStart]);

  // Update drag
  const updateDrag = useCallback((mousePos: Position) => {
    if (!isDragging || !dragStartRef.current) return;

    // Cancel any pending animation frame
    if (dragUpdateFrameRef.current) {
      cancelAnimationFrame(dragUpdateFrameRef.current);
    }

    // Schedule update on next animation frame
    dragUpdateFrameRef.current = requestAnimationFrame(() => {
      if (!dragStartRef.current) return;

      const updates = new Map<string, Position>();
      
      dragStartRef.current.initialOffsets.forEach((offset, itemId) => {
        const newX = pixelsToLogical(mousePos.x - offset.x);
        const newY = mousePos.y - offset.y; // Y is in pixels
        
        updates.set(itemId, {
          x: snapToGridValue(newX),
          y: snapYToTrackGrid(newY) // Snap Y to track grid
        });
      });

      if (onDragMove) {
        onDragMove(updates);
      }

      dragUpdateFrameRef.current = null;
    });
  }, [isDragging, pixelsToLogical, snapToGridValue, snapYToTrackGrid, onDragMove]);

  // End drag
  const endDrag = useCallback(() => {
    if (!isDragging || !dragStartRef.current) return;

    // Cancel any pending drag update
    if (dragUpdateFrameRef.current) {
      cancelAnimationFrame(dragUpdateFrameRef.current);
      dragUpdateFrameRef.current = null;
    }

    // Get final positions
    const updates = new Map<string, Position>();
    
    dragStartRef.current.initialOffsets.forEach((offset, itemId) => {
      const item = items.find(i => i.id === itemId);
      if (item) {
        updates.set(itemId, { x: item.x, y: item.y });
      }
    });

    if (onDragEnd) {
      onDragEnd(updates);
    }

    setIsDragging(false);
    setDraggedItemId(null);
    dragStartRef.current = null;
  }, [isDragging, items, onDragEnd]);

  // Start resize operation
  const startResize = useCallback((itemId: string, direction: 'left' | 'right', mousePos: Position) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // Check if the item is selected
    const isItemSelected = selectedIds.has(itemId);
    
    // If resizing an unselected track, clear selection
    if (!isItemSelected) {
      clearSelection();
    }

    // Capture snapshots of all items that will be resized
    const allItems = new Map<string, KonvaItem>();
    if (isItemSelected) {
      // Capture all selected items
      items.filter(i => selectedIds.has(i.id)).forEach(i => {
        allItems.set(i.id, { ...i });
      });
    } else {
      // Just capture the single item
      allItems.set(item.id, { ...item });
    }

    resizeStartRef.current = {
      mousePos,
      item: { ...item },
      direction,
      allItems
    };

    setIsResizing(true);
    setResizingItemId(itemId);
    setResizeDirection(direction);

    if (onResizeStart) {
      onResizeStart(item, direction);
    }
  }, [items, selectedIds, clearSelection, onResizeStart]);

  // Update resize
  const updateResize = useCallback((mousePos: Position) => {
    if (!isResizing || !resizeStartRef.current) return;

    const { direction, mousePos: startMousePos, allItems } = resizeStartRef.current;
    const deltaXPixels = mousePos.x - startMousePos.x;
    const deltaX = pixelsToLogical(deltaXPixels);
    
    const updates = new Map<string, Dimensions>();
    
    // Apply resize to all items using their snapshots
    allItems.forEach((originalItem) => {
      if (direction === 'left') {
        // Left resize: change both position and width
        const newWidth = Math.max(gridSize, snapToGridValue(originalItem.width - deltaX));
        const widthDelta = originalItem.width - newWidth;
        const newX = originalItem.x + widthDelta;
        
        updates.set(originalItem.id, {
          start: newX,
          width: newWidth,
          height: originalItem.height
        });
      } else {
        // Right resize: only change width
        const newWidth = Math.max(gridSize, snapToGridValue(originalItem.width + deltaX));
        
        updates.set(originalItem.id, {
          width: newWidth,
          height: originalItem.height
        });
      }
    });

    if (onResizeMove) {
      onResizeMove(updates);
    }
  }, [isResizing, pixelsToLogical, snapToGridValue, gridSize, onResizeMove]);

  // End resize
  const endResize = useCallback(() => {
    if (!isResizing || !resizeStartRef.current) return;

    const { item } = resizeStartRef.current;
    const direction = resizeStartRef.current.direction;
    
    // Get items that were resized - either selected items or just the single item
    const isItemSelected = selectedIds.has(item.id);
    const itemsToResize = isItemSelected 
      ? items.filter(i => selectedIds.has(i.id))
      : items.filter(i => i.id === item.id);
    
    const updates = new Map<string, Dimensions>();
    
    // Collect final dimensions for all resized items
    for (const resizeItem of itemsToResize) {
      const currentItem = items.find(i => i.id === resizeItem.id);
      if (!currentItem) continue;
      
      // Include start position for left resize
      if (direction === 'left') {
        updates.set(currentItem.id, {
          start: currentItem.x,
          width: currentItem.width,
          height: currentItem.height
        });
      } else {
        updates.set(currentItem.id, {
          width: currentItem.width,
          height: currentItem.height
        });
      }
    }

    if (onResizeEnd && updates.size > 0) {
      onResizeEnd(updates);
    }

    setIsResizing(false);
    setResizingItemId(null);
    setResizeDirection(null);
    resizeStartRef.current = null;
  }, [isResizing, items, selectedIds, onResizeEnd]);

  // Start rectangle selection
  const startSelection = useCallback((mousePos: Position) => {
    const logicalPos = {
      x: pixelsToLogical(mousePos.x),
      y: mousePos.y // Y is already in pixels
    };
    
    
    setIsSelecting(true);
    setSelectionRect({
      start: logicalPos,
      end: logicalPos
    });
  }, [pixelsToLogical, pixelsPerUnit, zoom]);

  // Update rectangle selection
  const updateRectSelection = useCallback((mousePos: Position) => {
    if (!isSelecting || !selectionRect) return;

    const logicalPos = {
      x: pixelsToLogical(mousePos.x),
      y: mousePos.y // Y is already in pixels
    };
    
    
    setSelectionRect({
      start: selectionRect.start,
      end: logicalPos
    });
  }, [isSelecting, selectionRect, pixelsToLogical]);

  // End rectangle selection
  const endSelection = useCallback((addToSelection = false) => {
    if (!isSelecting || !selectionRect) return;

    const itemsInRect = getItemsInRect(selectionRect.start, selectionRect.end);
    const itemIds = itemsInRect.map(item => item.id);
    
    if (itemIds.length > 0) {
      selectMultiple(itemIds, addToSelection);
    } else if (!addToSelection) {
      clearSelection();
    }

    setIsSelecting(false);
    setSelectionRect(null);
  }, [isSelecting, selectionRect, getItemsInRect, selectMultiple, clearSelection, items]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const item = getItemAtPosition(pos.x, pos.y);
    
    if (tool === 'select') {
      if (item) {
        // Regular click/drag - resize is handled by custom handles
        if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) {
          toggleItemSelection(item.id);
        } else if (!selectedIds.has(item.id)) {
          selectItem(item.id);
        }
        // Don't start drag here - it's handled by onMouseDown in KonvaTrack
      } else {
        // Background click - start selection rectangle
        if (!e.evt.shiftKey) {
          clearSelection();
        }
        startSelection(pos);
        
        if (onBackgroundClick) {
          onBackgroundClick({
            x: pixelsToLogical(pos.x),
            y: pos.y // Y is in pixels
          }, tool);
        }
      }
    } else {
      // Other tools
      if (item && onItemClick) {
        onItemClick(item, tool);
      } else if (onBackgroundClick) {
        onBackgroundClick({
          x: pixelsToLogical(pos.x),
          y: pos.y // Y is in pixels
        }, tool);
      }
    }
  }, [
    stage, tool, getItemAtPosition, logicalToPixels, selectedIds,
    startResize, toggleItemSelection, selectItem, startDrag,
    clearSelection, startSelection, onBackgroundClick, onItemClick,
    pixelsToLogical
  ]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (isDragging) {
      updateDrag(pos);
    } else if (isResizing) {
      updateResize(pos);
    } else if (isSelecting) {
      updateRectSelection(pos);
    }
  }, [stage, isDragging, isResizing, isSelecting, updateDrag, updateResize, updateRectSelection]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      endDrag();
    } else if (isResizing) {
      endResize();
    } else if (isSelecting) {
      endSelection();
    }
  }, [isDragging, isResizing, isSelecting, endDrag, endResize, endSelection]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const hasSelection = selectedIds.size > 0;
    
    // Copy (Cmd/Ctrl+C)
    if ((e.metaKey || e.ctrlKey) && e.key === 'c' && hasSelection) {
      e.preventDefault();
      const selectedItems = items.filter(item => selectedIds.has(item.id));
      if (onCopy) onCopy(selectedItems);
    }
    
    // Cut (Cmd/Ctrl+X)
    if ((e.metaKey || e.ctrlKey) && e.key === 'x' && hasSelection) {
      e.preventDefault();
      const selectedItems = items.filter(item => selectedIds.has(item.id));
      if (onCut) onCut(selectedItems);
    }
    
    // Paste (Cmd/Ctrl+V)
    if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      e.preventDefault();
      if (onPaste) {
        // If we have a mouse position, paste there, otherwise paste at origin
        if (stage) {
          const mousePos = stage.getPointerPosition();
          if (mousePos) {
            onPaste({
              x: pixelsToLogical(mousePos.x),
              y: mousePos.y // Y is in pixels
            });
          } else {
            onPaste();
          }
        } else {
          onPaste();
        }
      }
    }
    
    // Delete (Delete or Backspace)
    if ((e.key === 'Delete' || e.key === 'Backspace') && hasSelection) {
      e.preventDefault();
      if (onDelete) onDelete(Array.from(selectedIds));
    }
    
    // Duplicate (Cmd/Ctrl+D)
    if ((e.metaKey || e.ctrlKey) && e.key === 'd' && hasSelection) {
      e.preventDefault();
      if (onDuplicate) onDuplicate(Array.from(selectedIds));
    }
    
    // Select All (Cmd/Ctrl+A)
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault();
      selectMultiple(items.map(item => item.id));
    }
    
    // Escape - cancel current operation
    if (e.key === 'Escape') {
      if (isDragging) {
        endDrag();
      } else if (isResizing) {
        endResize();
      } else if (isSelecting) {
        setIsSelecting(false);
        setSelectionRect(null);
      } else if (hasSelection) {
        clearSelection();
      }
    }
  }, [
    selectedIds, items, stage, isDragging, isResizing, isSelecting,
    onCopy, onCut, onPaste, onDelete, onDuplicate,
    selectMultiple, clearSelection, endDrag, endResize,
    pixelsToLogical
  ]);

  // Set up stage event listeners
  useEffect(() => {
    if (!stage) return;

    stage.on('mousedown touchstart', handleMouseDown);
    stage.on('mousemove touchmove', handleMouseMove);
    stage.on('mouseup touchend', handleMouseUp);

    // Also add window listeners for resize/drag operations that might go outside stage
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (isResizing || isDragging || isSelecting) {
        const container = stage.container();
        const rect = container.getBoundingClientRect();
        const pos = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
        
        if (isDragging) {
          updateDrag(pos);
        } else if (isResizing) {
          updateResize(pos);
        } else if (isSelecting) {
          updateRectSelection(pos);
        }
      }
    };

    const handleWindowMouseUp = () => {
      if (isDragging) {
        endDrag();
      } else if (isResizing) {
        endResize();
      } else if (isSelecting) {
        endSelection();
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      stage.off('mousedown touchstart', handleMouseDown);
      stage.off('mousemove touchmove', handleMouseMove);
      stage.off('mouseup touchend', handleMouseUp);
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [stage, handleMouseDown, handleMouseMove, handleMouseUp, isDragging, isResizing, isSelecting, updateDrag, updateResize, updateRectSelection, endDrag, endResize, endSelection]);

  // Set up keyboard event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Return interaction state and methods
  return {
    // State
    selectedIds: Array.from(selectedIds),
    isDragging,
    isResizing,
    isSelecting,
    selectionRect: selectionRect ? {
      start: {
        x: logicalToPixels(selectionRect.start.x),
        y: selectionRect.start.y // Y is already in pixels
      },
      end: {
        x: logicalToPixels(selectionRect.end.x),
        y: selectionRect.end.y // Y is already in pixels
      }
    } : null,
    draggedItemId,
    resizingItemId,
    resizeDirection,
    
    // Methods
    selectItem,
    selectMultiple,
    clearSelection,
    toggleItemSelection,
    getItemAtPosition,
    startDrag,
    startResize,
    
    // Conversion utilities
    pixelsToLogical,
    logicalToPixels,
    snapToGridValue,
    snapYToTrackGrid
  };
}