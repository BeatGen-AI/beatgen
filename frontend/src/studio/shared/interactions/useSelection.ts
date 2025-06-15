import { useState, useCallback, useMemo } from 'react';

export interface SelectionState {
  selectedIds: (string | number)[];
  selectionRect: { x: number; y: number; width: number; height: number } | null;
  lastSelectedId: string | number | null;
}

export interface UseSelectionOptions<T> {
  items: T[];
  onSelectionChange?: (selectedIds: (string | number)[]) => void;
}

export function useSelection<T extends { id: string | number }>({
  items,
  onSelectionChange
}: UseSelectionOptions<T>) {
  const [selectionState, setSelectionState] = useState<SelectionState>({
    selectedIds: [],
    selectionRect: null,
    lastSelectedId: null
  });

  // Select a single item
  const selectSingle = useCallback((id: string | number) => {
    setSelectionState(prev => {
      const newState = {
        ...prev,
        selectedIds: [id],
        lastSelectedId: id
      };
      onSelectionChange?.(newState.selectedIds);
      return newState;
    });
  }, [onSelectionChange]);

  // Select multiple items
  const selectMultiple = useCallback((ids: (string | number)[], replace = false) => {
    setSelectionState(prev => {
      const newIds = replace ? ids : [...new Set([...prev.selectedIds, ...ids])];
      const newState = {
        ...prev,
        selectedIds: newIds,
        lastSelectedId: ids[ids.length - 1] || prev.lastSelectedId
      };
      onSelectionChange?.(newState.selectedIds);
      return newState;
    });
  }, [onSelectionChange]);

  // Toggle selection of items
  const toggleSelection = useCallback((ids: (string | number)[]) => {
    setSelectionState(prev => {
      const newSelectedIds = [...prev.selectedIds];
      ids.forEach(id => {
        const index = newSelectedIds.indexOf(id);
        if (index >= 0) {
          newSelectedIds.splice(index, 1);
        } else {
          newSelectedIds.push(id);
        }
      });
      const newState = {
        ...prev,
        selectedIds: newSelectedIds,
        lastSelectedId: ids[ids.length - 1] || prev.lastSelectedId
      };
      onSelectionChange?.(newState.selectedIds);
      return newState;
    });
  }, [onSelectionChange]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectionState(prev => {
      const newState = {
        ...prev,
        selectedIds: [],
        lastSelectedId: null
      };
      onSelectionChange?.(newState.selectedIds);
      return newState;
    });
  }, [onSelectionChange]);

  // Select all items
  const selectAll = useCallback(() => {
    const allIds = items.map(item => item.id);
    setSelectionState(prev => {
      const newState = {
        ...prev,
        selectedIds: allIds,
        lastSelectedId: allIds[allIds.length - 1] || null
      };
      onSelectionChange?.(newState.selectedIds);
      return newState;
    });
  }, [items, onSelectionChange]);

  // Rectangle selection
  const startSelection = useCallback((startPos: { x: number; y: number }, additive = false) => {
    setSelectionState(prev => ({
      ...prev,
      selectionRect: { startX: startPos.x, startY: startPos.y, width: 0, height: 0 },
      // If not additive, clear current selection
      selectedIds: additive ? prev.selectedIds : []
    }));
  }, []);

  const updateSelection = useCallback((currentPos: { x: number; y: number }) => {
    setSelectionState(prev => {
      if (!prev.selectionRect) return prev;
      
      return {
        ...prev,
        selectionRect: {
          ...prev.selectionRect,
          width: currentPos.x - prev.selectionRect.startX,
          height: currentPos.y - prev.selectionRect.startY
        }
      };
    });
  }, []);

  const endSelection = useCallback((additive = false) => {
    setSelectionState(prev => {
      const rect = prev.selectionRect;
      if (!rect) return prev;

      // Calculate normalized rectangle (positive width/height)
      const x = rect.width < 0 ? rect.startX + rect.width : rect.startX;
      const y = rect.height < 0 ? rect.startY + rect.height : rect.startY;
      const width = Math.abs(rect.width);
      const height = Math.abs(rect.height);

      // Find items within rectangle
      const itemsInRect = items.filter(item => {
        // This is a placeholder - actual intersection logic would depend on item shape
        // For now, assume items have x, y, width, height properties
        const itemData = item as any;
        if (!itemData.x || !itemData.y) return false;
        
        const itemRight = itemData.x + (itemData.width || 0);
        const itemBottom = itemData.y + (itemData.height || 0);
        const rectRight = x + width;
        const rectBottom = y + height;
        
        return !(itemData.x > rectRight || 
                 itemRight < x || 
                 itemData.y > rectBottom || 
                 itemBottom < y);
      });

      const newIds = itemsInRect.map(item => item.id);
      const finalIds = additive 
        ? [...new Set([...prev.selectedIds, ...newIds])]
        : newIds;

      const newState = {
        selectedIds: finalIds,
        selectionRect: null,
        lastSelectedId: newIds[newIds.length - 1] || prev.lastSelectedId
      };
      
      onSelectionChange?.(newState.selectedIds);
      return newState;
    });
  }, [items, onSelectionChange]);

  // Computed values
  const hasSelection = useMemo(() => selectionState.selectedIds.length > 0, [selectionState.selectedIds]);
  const selectedCount = useMemo(() => selectionState.selectedIds.length, [selectionState.selectedIds]);

  return {
    // State
    selectionState,
    selectedIds: selectionState.selectedIds,
    
    // Methods
    selectSingle,
    selectMultiple,
    toggleSelection,
    clearSelection,
    selectAll,
    startSelection,
    updateSelection,
    endSelection,
    
    // Computed
    hasSelection,
    selectedCount
  };
}