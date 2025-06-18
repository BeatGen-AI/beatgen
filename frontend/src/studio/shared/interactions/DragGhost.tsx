import React from 'react';
import { Box } from '@mui/material';

export interface DragGhostProps {
  items: Array<{
    id: string | number;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
  }>;
  offset: { x: number; y: number };
  opacity?: number;
  isVisible?: boolean;
  containerBounds?: { width: number; height: number };
  style?: React.CSSProperties;
}

/**
 * Shared drag ghost component for visual feedback during drag operations
 * Shows semi-transparent previews of items being dragged
 */
export const DragGhost: React.FC<DragGhostProps> = ({
  items,
  offset,
  opacity = 0.5,
  isVisible = true,
  containerBounds,
  style = {}
}) => {
  if (!isVisible || items.length === 0) return null;

  // Find the bounds of all items
  const bounds = items.reduce((acc, item) => ({
    minX: Math.min(acc.minX, item.x),
    minY: Math.min(acc.minY, item.y),
    maxX: Math.max(acc.maxX, item.x + item.width),
    maxY: Math.max(acc.maxY, item.y + item.height)
  }), {
    minX: items[0].x,
    minY: items[0].y,
    maxX: items[0].x + items[0].width,
    maxY: items[0].y + items[0].height
  });

  const containerWidth = bounds.maxX - bounds.minX;
  const containerHeight = bounds.maxY - bounds.minY;

  // Apply container bounds if provided
  const finalOffset = { ...offset };
  if (containerBounds) {
    // Ensure ghosts don't go outside container
    if (bounds.minX + offset.x < 0) {
      finalOffset.x = -bounds.minX;
    }
    if (bounds.minY + offset.y < 0) {
      finalOffset.y = -bounds.minY;
    }
    if (containerBounds.width && bounds.maxX + offset.x > containerBounds.width) {
      finalOffset.x = containerBounds.width - bounds.maxX;
    }
    if (containerBounds.height && bounds.maxY + offset.y > containerBounds.height) {
      finalOffset.y = containerBounds.height - bounds.maxY;
    }
  }

  return (
    <Box
      className="drag-ghost-container"
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
        ...style
      }}
    >
      {items.map((item) => (
        <Box
          key={`ghost-${item.id}`}
          className="drag-ghost-item"
          sx={{
            position: 'absolute',
            left: item.x + finalOffset.x,
            top: item.y + finalOffset.y,
            width: item.width,
            height: item.height,
            backgroundColor: item.color || '#2196f3',
            opacity,
            borderRadius: 1,
            border: '2px dashed rgba(255, 255, 255, 0.5)',
            transition: 'none'
          }}
        />
      ))}
    </Box>
  );
};

/**
 * Hook to manage drag ghost state
 */
export function useDragGhost<T extends { id: string | number; x: number; y: number; width: number; height: number }>(
  items: T[],
  selectedIds: (string | number)[]
) {
  const [draggedItemId, setDraggedItemId] = React.useState<string | number | null>(null);
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);

  const startDrag = React.useCallback((itemId: string | number, initialOffset = { x: 0, y: 0 }) => {
    setDraggedItemId(itemId);
    setDragOffset(initialOffset);
    setIsDragging(true);
  }, []);

  const updateDrag = React.useCallback((offset: { x: number; y: number }) => {
    setDragOffset(offset);
  }, []);

  const endDrag = React.useCallback(() => {
    setDraggedItemId(null);
    setDragOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, []);

  // Get items to show as ghosts
  const ghostItems = React.useMemo(() => {
    if (!isDragging || !draggedItemId) return [];

    // If dragging a selected item, show all selected items
    if (selectedIds.includes(draggedItemId)) {
      return items.filter(item => selectedIds.includes(item.id));
    }
    
    // Otherwise just show the dragged item
    return items.filter(item => item.id === draggedItemId);
  }, [items, selectedIds, isDragging, draggedItemId]);

  return {
    ghostItems,
    dragOffset,
    isDragging,
    startDrag,
    updateDrag,
    endDrag
  };
}