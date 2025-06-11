/**
 * React hook for multi-selection functionality
 * Uses the extracted selection utilities and manages React state
 */

import { useState, useCallback, useRef } from 'react';
import {
  SelectionRect,
  SelectableItem,
  GroupDragState,
  GroupResizeState,
  ClipboardData,
  createSelectionRect,
  updateSelectionRect,
  selectItemsInRect,
  toggleItemSelection,
  startGroupDrag,
  calculateGroupDragUpdates,
  endGroupDrag,
  startGroupResize,
  calculateGroupResizeUpdates,
  endGroupResize,
  copySelectedItems,
  calculatePastePositions
} from './selectionUtils';

export interface UseMultiSelectionConfig<T extends SelectableItem> {
  // Required: function to get all items
  getAllItems: () => T[];
  
  // Required: function to update items with new positions/dimensions
  updateItems: (updates: Map<string | number, Partial<T>>) => void;
  
  // Optional: function to create new items (for paste)
  createItem?: (data: Partial<T>, position: { x: number; y: number }) => string | number | null;
  
  // Optional: function to delete items
  deleteItem?: (id: string | number) => void;
  
  // Optional: grid snapping configuration
  gridSnap?: {
    enabled: boolean;
    sizeX: number;
    sizeY: number;
    minWidth: number;
  };
  
  // Optional: callbacks
  onSelectionChange?: (selectedIds: (string | number)[]) => void;
}

export function useMultiSelection<T extends SelectableItem>(config: UseMultiSelectionConfig<T>) {
  // Selection state
  const [selectedIds, setSelectedIds] = useState<(string | number)[]>([]);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  
  // Operation states
  const [groupDragState, setGroupDragState] = useState<GroupDragState<T>>({
    isActive: false,
    primaryId: null,
    initialPositions: new Map()
  });
  
  const [groupResizeState, setGroupResizeState] = useState<GroupResizeState<T>>({
    isActive: false,
    primaryId: null,
    direction: null,
    initialDimensions: new Map()
  });
  
  // Clipboard
  const clipboardDataRef = useRef<ClipboardData<T> | null>(null);
  
  // Helper to trigger selection change callback
  const updateSelection = useCallback((newSelectedIds: (string | number)[]) => {
    setSelectedIds(newSelectedIds);
    config.onSelectionChange?.(newSelectedIds);
  }, [config.onSelectionChange]);
  
  // === SELECTION OPERATIONS ===
  
  const toggleSelection = useCallback((itemId: string | number, additive: boolean = false) => {
    const newSelection = toggleItemSelection(selectedIds, itemId, additive);
    updateSelection(newSelection);
  }, [selectedIds, updateSelection]);
  
  const clearSelection = useCallback(() => {
    updateSelection([]);
    setSelectionRect(null);
    setIsSelecting(false);
  }, [updateSelection]);
  
  const selectAll = useCallback(() => {
    const allItems = config.getAllItems();
    updateSelection(allItems.map(item => item.id));
  }, [config, updateSelection]);
  
  // === SELECTION RECTANGLE ===
  
  const startSelectionRect = useCallback((startX: number, startY: number, clearExisting: boolean = true) => {
    const rect = createSelectionRect(startX, startY);
    setSelectionRect(rect);
    setIsSelecting(true);
    
    if (clearExisting) {
      updateSelection([]);
    }
  }, [updateSelection]);
  
  const updateSelectionRectangle = useCallback((currentX: number, currentY: number) => {
    if (!selectionRect || !isSelecting) return;
    
    const updatedRect = updateSelectionRect(selectionRect, currentX, currentY);
    setSelectionRect(updatedRect);
  }, [selectionRect, isSelecting]);
  
  const endSelectionRect = useCallback((additive: boolean = false) => {
    if (!selectionRect || !isSelecting) return;
    
    const items = config.getAllItems();
    const newSelection = selectItemsInRect(items, selectionRect, selectedIds, additive);
    updateSelection(newSelection);
    
    setSelectionRect(null);
    setIsSelecting(false);
  }, [selectionRect, isSelecting, selectedIds, config, updateSelection]);
  
  // === GROUP DRAG OPERATIONS ===
  
  const beginGroupDrag = useCallback((primaryId: string | number): boolean => {
    const items = config.getAllItems();
    const dragState = startGroupDrag(items, selectedIds, primaryId);
    
    if (dragState.isActive) {
      setGroupDragState(dragState);
      return true;
    }
    return false;
  }, [config, selectedIds]);
  
  const updateGroupDrag = useCallback((deltaX: number, deltaY: number) => {
    if (!groupDragState.isActive) return;
    
    const updates = calculateGroupDragUpdates(groupDragState, selectedIds, deltaX, deltaY);
    
    // Apply grid snapping if enabled
    if (config.gridSnap?.enabled) {
      const snappedUpdates = new Map<string | number, Partial<T>>();
      updates.forEach((update, id) => {
        const snappedX = Math.round(update.x / config.gridSnap!.sizeX) * config.gridSnap!.sizeX;
        const snappedY = Math.round(update.y / config.gridSnap!.sizeY) * config.gridSnap!.sizeY;
        snappedUpdates.set(id, { x: snappedX, y: snappedY } as Partial<T>);
      });
      config.updateItems(snappedUpdates);
    } else {
      const positionUpdates = new Map<string | number, Partial<T>>();
      updates.forEach((update, id) => {
        positionUpdates.set(id, { x: update.x, y: update.y } as Partial<T>);
      });
      config.updateItems(positionUpdates);
    }
  }, [groupDragState, selectedIds, config]);
  
  const finishGroupDrag = useCallback(() => {
    setGroupDragState(endGroupDrag());
  }, []);
  
  // === GROUP RESIZE OPERATIONS ===
  
  const beginGroupResize = useCallback((primaryId: string | number, direction: 'left' | 'right'): boolean => {
    const items = config.getAllItems();
    const resizeState = startGroupResize(items, selectedIds, primaryId, direction);
    
    if (resizeState.isActive) {
      setGroupResizeState(resizeState);
      return true;
    }
    return false;
  }, [config, selectedIds]);
  
  const updateGroupResize = useCallback((deltaWidth: number) => {
    if (!groupResizeState.isActive) return;
    
    const minWidth = config.gridSnap?.minWidth || 10;
    const gridConfig = config.gridSnap?.enabled ? {
      enabled: true,
      snapOption: 0 as any, // Would need to be passed in properly
      effectiveGridSize: config.gridSnap.sizeX,
      minWidth: config.gridSnap.minWidth
    } : undefined;
    const updates = calculateGroupResizeUpdates(groupResizeState, selectedIds, deltaWidth, gridConfig);
    
    // Apply grid snapping if enabled
    if (config.gridSnap?.enabled) {
      const snappedUpdates = new Map<string | number, Partial<T>>();
      updates.forEach((update, id) => {
        const snappedUpdate: Partial<T> = {};
        if (update.start !== undefined) {
          snappedUpdate.x = Math.round(update.start / config.gridSnap!.sizeX) * config.gridSnap!.sizeX;
        }
        if (update.width !== undefined) {
          const snappedWidth = Math.max(
            config.gridSnap!.minWidth,
            Math.round(update.width / config.gridSnap!.sizeX) * config.gridSnap!.sizeX
          );
          snappedUpdate.width = snappedWidth;
        }
        snappedUpdates.set(id, snappedUpdate);
      });
      config.updateItems(snappedUpdates);
    } else {
      const dimensionUpdates = new Map<string | number, Partial<T>>();
      updates.forEach((update, id) => {
        const dimensionUpdate: Partial<T> = {};
        if (update.start !== undefined) {
          dimensionUpdate.x = update.start;
        }
        if (update.width !== undefined) {
          dimensionUpdate.width = update.width;
        }
        dimensionUpdates.set(id, dimensionUpdate);
      });
      config.updateItems(dimensionUpdates);
    }
  }, [groupResizeState, selectedIds, config]);
  
  const finishGroupResize = useCallback(() => {
    setGroupResizeState(endGroupResize());
  }, []);
  
  // === COPY/PASTE OPERATIONS ===
  
  const copySelection = useCallback((): boolean => {
    const items = config.getAllItems();
    const clipboardData = copySelectedItems(items, selectedIds);
    
    if (clipboardData) {
      clipboardDataRef.current = clipboardData;
      return true;
    }
    return false;
  }, [config, selectedIds]);
  
  const pasteClipboard = useCallback((targetX: number, targetY: number): (string | number)[] => {
    const clipboardData = clipboardDataRef.current;
    if (!clipboardData || !config.createItem) return [];
    
    const pasteData = calculatePastePositions(clipboardData, targetX, targetY);
    const newIds: (string | number)[] = [];
    
    pasteData.forEach(({ item, position }) => {
      const newId = config.createItem!(item, position);
      if (newId !== null) {
        newIds.push(newId);
      }
    });
    
    // Select the newly pasted items
    updateSelection(newIds);
    
    return newIds;
  }, [config, updateSelection]);
  
  const deleteSelection = useCallback(() => {
    if (!config.deleteItem) return;
    
    selectedIds.forEach(id => config.deleteItem!(id));
    updateSelection([]);
  }, [config, selectedIds, updateSelection]);
  
  // === UTILITY METHODS ===
  
  const isSelected = useCallback((id: string | number): boolean => {
    return selectedIds.includes(id);
  }, [selectedIds]);
  
  const hasSelection = useCallback((): boolean => {
    return selectedIds.length > 0;
  }, [selectedIds]);
  
  const getSelectionCount = useCallback((): number => {
    return selectedIds.length;
  }, [selectedIds]);
  
  const isGroupOperationActive = useCallback((): boolean => {
    return groupDragState.isActive || groupResizeState.isActive;
  }, [groupDragState.isActive, groupResizeState.isActive]);
  
  const isPrimaryInGroup = useCallback((id: string | number): boolean => {
    return groupDragState.primaryId === id || groupResizeState.primaryId === id;
  }, [groupDragState.primaryId, groupResizeState.primaryId]);
  
  return {
    // State
    selectedIds,
    selectionRect,
    isSelecting,
    groupDragState,
    groupResizeState,
    
    // Selection operations
    toggleSelection,
    clearSelection,
    selectAll,
    
    // Selection rectangle
    startSelectionRect,
    updateSelectionRectangle,
    endSelectionRect,
    
    // Group operations
    beginGroupDrag,
    updateGroupDrag,
    finishGroupDrag,
    beginGroupResize,
    updateGroupResize,
    finishGroupResize,
    
    // Copy/paste
    copySelection,
    pasteClipboard,
    deleteSelection,
    
    // Utilities
    isSelected,
    hasSelection,
    getSelectionCount,
    isGroupOperationActive,
    isPrimaryInGroup
  };
}

export default useMultiSelection;