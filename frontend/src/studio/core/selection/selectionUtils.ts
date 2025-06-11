/**
 * Extracted selection and group operation utilities from piano roll
 * These functions encapsulate the core logic for multi-selection, group drag, and group resize
 */

import { GridSnapOption, getSnapSizeInPixels } from '../../components/piano-roll2/gridConstants';

export interface SelectionRect {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

export interface SelectableItem {
  id: string | number;
  x: number;
  y: number;
  width: number;
  height?: number;
}

export interface GroupDragState<T extends SelectableItem> {
  isActive: boolean;
  primaryId: string | number | null;
  initialPositions: Map<string | number, { x: number; y: number }>;
}

export interface GroupResizeState<T extends SelectableItem> {
  isActive: boolean;
  primaryId: string | number | null;
  direction: 'left' | 'right' | null;
  initialDimensions: Map<string | number, { start: number; width: number }>;
}

// === SELECTION RECTANGLE UTILITIES ===

export function createSelectionRect(startX: number, startY: number): SelectionRect {
  return { startX, startY, width: 0, height: 0 };
}

export function updateSelectionRect(rect: SelectionRect, currentX: number, currentY: number): SelectionRect {
  return {
    ...rect,
    width: currentX - rect.startX,
    height: currentY - rect.startY
  };
}

export function getItemsInRect<T extends SelectableItem>(
  items: T[], 
  rect: SelectionRect
): T[] {
  // Normalize rectangle coordinates (handle negative width/height)
  const x = rect.width < 0 ? rect.startX + rect.width : rect.startX;
  const y = rect.height < 0 ? rect.startY + rect.height : rect.startY;
  const width = Math.abs(rect.width);
  const height = Math.abs(rect.height);
  
  // Find items that start within the selection rectangle
  return items.filter(item => 
    item.x >= x && 
    item.x <= x + width && 
    item.y >= y && 
    item.y <= y + height
  );
}

// === SELECTION MANAGEMENT ===

export function toggleItemSelection<T extends string | number>(
  selectedIds: T[], 
  itemId: T, 
  additive: boolean = false
): T[] {
  if (!additive) {
    return selectedIds.includes(itemId) ? [] : [itemId];
  } else {
    if (selectedIds.includes(itemId)) {
      return selectedIds.filter(id => id !== itemId);
    } else {
      return [...selectedIds, itemId];
    }
  }
}

export function selectItemsInRect<T extends SelectableItem>(
  items: T[],
  rect: SelectionRect,
  currentSelection: (string | number)[],
  additive: boolean = false
): (string | number)[] {
  const itemsInRect = getItemsInRect(items, rect);
  const selectedInRect = itemsInRect.map(item => item.id);
  
  if (additive) {
    // Add to existing selection
    const merged = [...currentSelection];
    selectedInRect.forEach(id => {
      if (!currentSelection.includes(id)) {
        merged.push(id);
      }
    });
    return merged;
  } else {
    // Replace selection
    return selectedInRect;
  }
}

// === GROUP DRAG UTILITIES ===

export function startGroupDrag<T extends SelectableItem>(
  items: T[],
  selectedIds: (string | number)[],
  primaryId: string | number
): GroupDragState<T> {
  if (!selectedIds.includes(primaryId)) {
    return { isActive: false, primaryId: null, initialPositions: new Map() };
  }
  
  const selectedItems = items.filter(item => selectedIds.includes(item.id));
  const initialPositions = new Map<string | number, { x: number; y: number }>();
  
  selectedItems.forEach(item => {
    initialPositions.set(item.id, { x: item.x, y: item.y });
  });
  
  return {
    isActive: true,
    primaryId,
    initialPositions
  };
}

export function calculateGroupDragUpdates<T extends SelectableItem>(
  dragState: GroupDragState<T>,
  selectedIds: (string | number)[],
  deltaX: number,
  deltaY: number,
  gridConfig?: GridSnapConfig,
  yGridSize?: number // Optional separate Y grid size (e.g., track height)
): Map<string | number, { x: number; y: number }> {
  const updates = new Map<string | number, { x: number; y: number }>();
  
  if (!dragState.isActive) return updates;
  
  selectedIds.forEach(id => {
    const initialPos = dragState.initialPositions.get(id);
    if (initialPos) {
      const newPos = {
        x: initialPos.x + deltaX,
        y: initialPos.y + deltaY
      };
      
      // Apply grid snapping if configured
      const finalPos = gridConfig 
        ? snapToGrid(newPos.x, newPos.y, gridConfig, yGridSize)
        : newPos;
      
      updates.set(id, finalPos);
    }
  });
  
  return updates;
}

export function endGroupDrag<T extends SelectableItem>(): GroupDragState<T> {
  return { isActive: false, primaryId: null, initialPositions: new Map() };
}

// === GROUP RESIZE UTILITIES ===

export function startGroupResize<T extends SelectableItem>(
  items: T[],
  selectedIds: (string | number)[],
  primaryId: string | number,
  direction: 'left' | 'right'
): GroupResizeState<T> {
  if (!selectedIds.includes(primaryId)) {
    return { isActive: false, primaryId: null, direction: null, initialDimensions: new Map() };
  }
  
  const selectedItems = items.filter(item => selectedIds.includes(item.id));
  const initialDimensions = new Map<string | number, { start: number; width: number }>();
  
  selectedItems.forEach(item => {
    initialDimensions.set(item.id, { start: item.x, width: item.width });
  });
  
  return {
    isActive: true,
    primaryId,
    direction,
    initialDimensions
  };
}

export function calculateGroupResizeUpdates<T extends SelectableItem>(
  resizeState: GroupResizeState<T>,
  selectedIds: (string | number)[],
  deltaWidth: number,
  gridConfig?: GridSnapConfig
): Map<string | number, { start?: number; width?: number }> {
  const updates = new Map<string | number, { start?: number; width?: number }>();
  
  if (!resizeState.isActive || !resizeState.direction) return updates;
  
  const minWidth = gridConfig?.minWidth ?? 10;
  
  if (resizeState.direction === 'right') {
    // Right resize - just update width
    selectedIds.forEach(id => {
      const initialDim = resizeState.initialDimensions.get(id);
      if (initialDim) {
        const rawNewWidth = Math.max(minWidth, initialDim.width + deltaWidth);
        const finalWidth = gridConfig ? snapWidth(rawNewWidth, gridConfig) : rawNewWidth;
        updates.set(id, { width: finalWidth });
      }
    });
  } else if (resizeState.direction === 'left') {
    // Left resize - update both start position and width
    selectedIds.forEach(id => {
      const initialDim = resizeState.initialDimensions.get(id);
      if (initialDim) {
        const startDelta = deltaWidth;
        const widthDelta = -deltaWidth; // Width changes in opposite direction
        
        let rawNewStart = initialDim.start + startDelta;
        let rawNewWidth = Math.max(minWidth, initialDim.width + widthDelta);
        
        // If the new width would be less than minimum, limit the movement
        if (initialDim.width + widthDelta < minWidth) {
          rawNewStart = initialDim.start + (initialDim.width - minWidth);
          rawNewWidth = minWidth;
        }
        
        // Apply grid snapping
        const finalWidth = gridConfig ? snapWidth(rawNewWidth, gridConfig) : rawNewWidth;
        const finalStart = gridConfig && gridConfig.enabled ? 
          snapToGrid(rawNewStart, 0, gridConfig).x : rawNewStart;
        
        updates.set(id, { start: finalStart, width: finalWidth });
      }
    });
  }
  
  return updates;
}

export function endGroupResize<T extends SelectableItem>(): GroupResizeState<T> {
  return { isActive: false, primaryId: null, direction: null, initialDimensions: new Map() };
}

// === COPY/PASTE UTILITIES ===

export interface ClipboardData<T extends SelectableItem> {
  items: Partial<T>[];
  relativePositions: { x: number; y: number }[];
}

export function copySelectedItems<T extends SelectableItem>(
  items: T[],
  selectedIds: (string | number)[]
): ClipboardData<T> | null {
  const selectedItems = items.filter(item => selectedIds.includes(item.id));
  
  if (selectedItems.length === 0) return null;
  
  // Calculate relative positions from top-left of selection
  const minX = Math.min(...selectedItems.map(item => item.x));
  const minY = Math.min(...selectedItems.map(item => item.y));
  
  return {
    items: selectedItems.map(item => ({ ...item })),
    relativePositions: selectedItems.map(item => ({
      x: item.x - minX,
      y: item.y - minY
    }))
  };
}

export function calculatePastePositions<T extends SelectableItem>(
  clipboardData: ClipboardData<T>,
  targetX: number,
  targetY: number
): { item: Partial<T>; position: { x: number; y: number } }[] {
  return clipboardData.items.map((item, index) => {
    const relativePos = clipboardData.relativePositions[index];
    return {
      item,
      position: {
        x: targetX + relativePos.x,
        y: targetY + relativePos.y
      }
    };
  });
}

// === GRID SNAPPING UTILITIES ===

export interface GridSnapConfig {
  enabled: boolean;
  snapOption: GridSnapOption; // GridSnapOption enum value
  effectiveGridSize: number; // Base grid size (pixels per step at current zoom)
  minWidth: number;
  pixelsPerTick?: number; // For fine-grained snapping when grid is disabled
}

export function calculateActualGridSize(snapOption: GridSnapOption, effectiveGridSize: number): number {
  // Use the official gridConstants implementation
  return getSnapSizeInPixels(snapOption, effectiveGridSize);
}

export function snapToGrid(
  x: number, 
  y: number, 
  gridConfig: GridSnapConfig,
  yGridSize?: number // Optional separate Y grid size
): { x: number; y: number } {
  if (!gridConfig.enabled || gridConfig.snapOption === GridSnapOption.NONE) {
    // No grid snapping, but still snap to ticks for fine control if available
    if (gridConfig.pixelsPerTick) {
      return {
        x: Math.floor(x / gridConfig.pixelsPerTick) * gridConfig.pixelsPerTick,
        y: yGridSize ? Math.floor(y / yGridSize) * yGridSize : y
      };
    }
    return { x, y };
  }
  
  const actualGridSize = calculateActualGridSize(gridConfig.snapOption, gridConfig.effectiveGridSize);
  const actualYGridSize = yGridSize || actualGridSize;
  
  return {
    x: Math.floor(x / actualGridSize) * actualGridSize,
    y: Math.floor(y / actualYGridSize) * actualYGridSize
  };
}

export function snapWidth(
  width: number, 
  gridConfig: GridSnapConfig
): number {
  if (!gridConfig.enabled || gridConfig.snapOption === GridSnapOption.NONE) {
    // No grid snapping, but still snap to ticks for fine control if available
    if (gridConfig.pixelsPerTick) {
      const snapped = Math.round(width / gridConfig.pixelsPerTick) * gridConfig.pixelsPerTick;
      return Math.max(gridConfig.minWidth, snapped);
    }
    return Math.max(gridConfig.minWidth, width);
  }
  
  const actualGridSize = calculateActualGridSize(gridConfig.snapOption, gridConfig.effectiveGridSize);
  const snapped = Math.round(width / actualGridSize) * actualGridSize;
  return Math.max(gridConfig.minWidth, snapped);
}

export function snapDelta(
  delta: number,
  gridConfig: GridSnapConfig
): number {
  if (!gridConfig.enabled || gridConfig.snapOption === GridSnapOption.NONE) {
    // No grid snapping, but still snap to ticks for fine control if available
    if (gridConfig.pixelsPerTick) {
      return Math.round(delta / gridConfig.pixelsPerTick) * gridConfig.pixelsPerTick;
    }
    return delta;
  }
  
  const actualGridSize = calculateActualGridSize(gridConfig.snapOption, gridConfig.effectiveGridSize);
  return Math.round(delta / actualGridSize) * actualGridSize;
}