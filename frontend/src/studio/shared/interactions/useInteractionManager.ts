import { useState, useCallback, useRef } from 'react';
import { Tool, SelectionState, DragState, ToolState, Selectable } from './types';
import { getItemsInRect, SelectableItem } from './selectionUtils';

interface UseInteractionManagerOptions {
  initialTool?: Tool;
  snapToGrid?: boolean;
  gridSize?: number;
  onSelectionChange?: (selectedIds: string[]) => void;
  onDragStart?: (itemId: string, selectedIds: string[]) => void;
  onDragMove?: (itemId: string, delta: { x: number; y: number }) => void;
  onDragEnd?: (itemId: string, selectedIds: string[]) => void;
  onItemClick?: (itemId: string, tool: Tool) => void;
  onItemDoubleClick?: (itemId: string) => void;
}

export function useInteractionManager(options: UseInteractionManagerOptions = {}) {
  const {
    initialTool = 'select',
    snapToGrid = true,
    gridSize = 48,
    onSelectionChange,
    onDragStart,
    onDragMove,
    onDragEnd,
    onItemClick,
    onItemDoubleClick
  } = options;

  // Tool state
  const [toolState, setToolState] = useState<ToolState>({
    selectedTool: initialTool,
    snapToGrid,
    gridSize
  });

  // Selection state
  const [selectionState, setSelectionState] = useState<SelectionState>({
    selectedIds: [],
    selectionRect: null,
    isSelecting: false
  });

  // Drag state
  const [dragState, setDragState] = useState<DragState>({
    draggedItemId: null,
    dragOffset: { x: 0, y: 0 },
    isGroupDrag: false,
    initialPositions: {}
  });

  // Refs for tracking mouse state
  const dragStartPos = useRef({ x: 0, y: 0 });
  const selectionStartPos = useRef({ x: 0, y: 0 });

  // Tool management
  const setTool = useCallback((tool: Tool) => {
    setToolState(prev => ({ ...prev, selectedTool: tool }));
  }, []);

  const toggleSnapToGrid = useCallback(() => {
    setToolState(prev => ({ ...prev, snapToGrid: !prev.snapToGrid }));
  }, []);

  const setGridSize = useCallback((size: number) => {
    setToolState(prev => ({ ...prev, gridSize: size }));
  }, []);

  // Selection management
  const selectItem = useCallback((itemId: string, multiSelect = false) => {
    setSelectionState(prev => {
      let newSelectedIds: string[];
      
      if (multiSelect) {
        if (prev.selectedIds.includes(itemId)) {
          newSelectedIds = prev.selectedIds.filter(id => id !== itemId);
        } else {
          newSelectedIds = [...prev.selectedIds, itemId];
        }
      } else {
        newSelectedIds = prev.selectedIds.includes(itemId) && prev.selectedIds.length === 1 
          ? [] 
          : [itemId];
      }
      
      onSelectionChange?.(newSelectedIds);
      return { ...prev, selectedIds: newSelectedIds };
    });
  }, [onSelectionChange]);

  const selectMultiple = useCallback((itemIds: string[], replace = true) => {
    setSelectionState(prev => {
      const newSelectedIds = replace 
        ? itemIds 
        : [...new Set([...prev.selectedIds, ...itemIds])];
      
      onSelectionChange?.(newSelectedIds);
      return { ...prev, selectedIds: newSelectedIds };
    });
  }, [onSelectionChange]);

  const clearSelection = useCallback(() => {
    setSelectionState(prev => {
      if (prev.selectedIds.length > 0) {
        onSelectionChange?.([]);
      }
      return { ...prev, selectedIds: [] };
    });
  }, [onSelectionChange]);

  const selectAll = useCallback((items: Selectable[]) => {
    const allIds = items.map(item => item.id);
    selectMultiple(allIds, true);
  }, [selectMultiple]);

  // Grid snapping utility
  const snapToGridValue = useCallback((value: number) => {
    if (!toolState.snapToGrid) return value;
    return Math.round(value / toolState.gridSize) * toolState.gridSize;
  }, [toolState.snapToGrid, toolState.gridSize]);

  // Drag management
  const startDrag = useCallback((itemId: string, startPosition: { x: number; y: number }, initialPositions: Record<string, { x: number; y: number }>) => {
    const isGroupDrag = selectionState.selectedIds.includes(itemId) && selectionState.selectedIds.length > 1;
    
    setDragState({
      draggedItemId: itemId,
      dragOffset: { x: 0, y: 0 },
      isGroupDrag,
      initialPositions
    });

    dragStartPos.current = startPosition;
    onDragStart?.(itemId, selectionState.selectedIds);
  }, [selectionState.selectedIds, onDragStart]);

  const updateDrag = useCallback((currentPosition: { x: number; y: number }) => {
    if (!dragState.draggedItemId) return;

    const deltaX = currentPosition.x - dragStartPos.current.x;
    const deltaY = currentPosition.y - dragStartPos.current.y;
    
    const snappedDelta = {
      x: snapToGridValue(deltaX),
      y: snapToGridValue(deltaY)
    };

    setDragState(prev => ({
      ...prev,
      dragOffset: snappedDelta
    }));

    onDragMove?.(dragState.draggedItemId, snappedDelta);
  }, [dragState.draggedItemId, snapToGridValue, onDragMove]);

  const endDrag = useCallback(() => {
    if (!dragState.draggedItemId) return;

    const draggedId = dragState.draggedItemId;
    const selectedIds = dragState.isGroupDrag ? selectionState.selectedIds : [draggedId];
    
    setDragState({
      draggedItemId: null,
      dragOffset: { x: 0, y: 0 },
      isGroupDrag: false,
      initialPositions: {}
    });

    onDragEnd?.(draggedId, selectedIds);
  }, [dragState, selectionState.selectedIds, onDragEnd]);

  // Selection rectangle management
  const startSelection = useCallback((startPosition: { x: number; y: number }) => {
    console.log('startSelection - tool:', toolState.selectedTool, 'position:', startPosition);
    if (toolState.selectedTool !== 'select') return;

    console.log('startSelection - setting isSelecting to true');
    setSelectionState(prev => ({
      ...prev,
      isSelecting: true,
      selectionRect: {
        startX: startPosition.x,
        startY: startPosition.y,
        width: 0,
        height: 0
      }
    }));

    selectionStartPos.current = startPosition;
  }, [toolState.selectedTool]);

  const updateSelection = useCallback((currentPosition: { x: number; y: number }) => {
    if (!selectionState.isSelecting || !selectionState.selectionRect) return;

    const width = currentPosition.x - selectionStartPos.current.x;
    const height = currentPosition.y - selectionStartPos.current.y;

    setSelectionState(prev => ({
      ...prev,
      selectionRect: prev.selectionRect ? {
        ...prev.selectionRect,
        width,
        height
      } : null
    }));
  }, [selectionState.isSelecting, selectionState.selectionRect]);

  const endSelection = useCallback((items: Selectable[], multiSelect = false) => {
    console.log('endSelection called with', items.length, 'items');
    if (!selectionState.isSelecting || !selectionState.selectionRect) {
      console.log('endSelection - not selecting or no rect');
      return;
    }
    console.log('endSelection - rect:', selectionState.selectionRect);

    // Try to use rectangle intersection if items have proper dimensions
    const itemsWithDimensions = items.filter((item): item is SelectableItem => {
      const hasPosition = 'x' in item || 'x_position' in item || 'start' in item;
      const hasY = 'y' in item || 'y_position' in item || 'top' in item;
      const hasWidth = 'width' in item;
      return hasPosition && hasY && hasWidth;
    }).map(item => ({
      ...item,
      x: (item as any).x || (item as any).x_position || (item as any).start || 0,
      y: (item as any).y || (item as any).y_position || (item as any).top || 0,
      width: (item as any).width || 0,
      height: (item as any).height || 20 // Default height
    }));

    let selectedItems: Selectable[];

    console.log('endSelection - itemsWithDimensions:', itemsWithDimensions);
    
    if (itemsWithDimensions.length > 0) {
      // Use rectangle intersection for items with proper dimensions
      console.log('endSelection - using rectangle intersection');
      selectedItems = getItemsInRect(itemsWithDimensions, selectionState.selectionRect);
      console.log('endSelection - selected items from intersection:', selectedItems);
    } else {
      // Fallback to point-in-rectangle for simple items
      const rect = selectionState.selectionRect;
      const x = rect.width < 0 ? rect.startX + rect.width : rect.startX;
      const y = rect.height < 0 ? rect.startY + rect.height : rect.startY;
      const width = Math.abs(rect.width);
      const height = Math.abs(rect.height);

      selectedItems = items.filter(item => {
        const itemX = (item as any).x_position || (item as any).start || 0;
        const itemY = (item as any).y_position || (item as any).top || 0;
        
        return itemX >= x && itemX <= x + width && itemY >= y && itemY <= y + height;
      });
    }

    const newSelectedIds = selectedItems.map(item => item.id);
    console.log('endSelection - final selected IDs:', newSelectedIds);
    console.log('endSelection - calling selectMultiple with IDs:', newSelectedIds, 'multiSelect:', multiSelect);
    
    if (multiSelect) {
      selectMultiple(newSelectedIds, false);
    } else {
      selectMultiple(newSelectedIds, true);
    }
    
    console.log('endSelection - selection should be updated');

    setSelectionState(prev => ({
      ...prev,
      isSelecting: false,
      selectionRect: null
    }));
  }, [selectionState.isSelecting, selectionState.selectionRect, selectMultiple]);

  // Item interaction handlers
  const handleItemClick = useCallback((itemId: string, event?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
    const multiSelect = event?.shiftKey || event?.ctrlKey || event?.metaKey;

    switch (toolState.selectedTool) {
      case 'select':
        selectItem(itemId, multiSelect);
        break;
      case 'eraser':
        onItemClick?.(itemId, 'eraser');
        break;
      default:
        onItemClick?.(itemId, toolState.selectedTool);
        break;
    }
  }, [toolState.selectedTool, selectItem, onItemClick]);

  const handleItemDoubleClick = useCallback((itemId: string) => {
    onItemDoubleClick?.(itemId);
  }, [onItemDoubleClick]);

  // Background interaction handlers
  const handleBackgroundClick = useCallback((position: { x: number; y: number }, event?: { shiftKey?: boolean }) => {
    if (toolState.selectedTool === 'select' && !event?.shiftKey) {
      clearSelection();
    }
    // Other tools can create items here if needed
  }, [toolState.selectedTool, clearSelection]);

  const handleBackgroundMouseDown = useCallback((position: { x: number; y: number }, event?: { shiftKey?: boolean }) => {
    console.log('handleBackgroundMouseDown - tool:', toolState.selectedTool, 'position:', position);
    if (toolState.selectedTool === 'select') {
      if (!event?.shiftKey) {
        clearSelection();
      }
      console.log('handleBackgroundMouseDown - starting selection');
      startSelection(position);
    }
  }, [toolState.selectedTool, clearSelection, startSelection]);

  return {
    // State
    toolState,
    selectionState,
    dragState,

    // Tool methods
    setTool,
    toggleSnapToGrid,
    setGridSize,

    // Selection methods
    selectItem,
    selectMultiple,
    clearSelection,
    selectAll,

    // Drag methods
    startDrag,
    updateDrag,
    endDrag,

    // Selection rectangle methods
    startSelection,
    updateSelection,
    endSelection,

    // Interaction handlers
    handleItemClick,
    handleItemDoubleClick,
    handleBackgroundClick,
    handleBackgroundMouseDown,

    // Utilities
    snapToGridValue,

    // Computed values
    isSelected: (itemId: string) => selectionState.selectedIds.includes(itemId),
    hasSelection: selectionState.selectedIds.length > 0,
    selectedCount: selectionState.selectedIds.length,
    isDragging: dragState.draggedItemId !== null,
    isSelecting: selectionState.isSelecting
  };
}