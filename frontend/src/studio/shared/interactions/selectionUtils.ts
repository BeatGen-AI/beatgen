import { SelectionRect, Selectable } from './types';

/**
 * Extended interface for items that can be selected with rectangle intersection
 */
export interface SelectableItem extends Selectable {
  x: number;
  y: number;
  width: number;
  height?: number; // Optional, defaults to standard height
}

/**
 * Gets all items that intersect with a selection rectangle.
 * Uses proper rectangle intersection logic rather than just point-in-rectangle.
 * 
 * @param items - Array of selectable items with position and dimensions
 * @param rect - Selection rectangle with start position and dimensions
 * @returns Array of items that intersect with the selection rectangle
 */
export function getItemsInRect<T extends SelectableItem>(
  items: T[], 
  rect: SelectionRect
): T[] {
  // Normalize rectangle coordinates (handle negative width/height)
  const rectX = rect.width < 0 ? rect.startX + rect.width : rect.startX;
  const rectY = rect.height < 0 ? rect.startY + rect.height : rect.startY;
  const rectWidth = Math.abs(rect.width);
  const rectHeight = Math.abs(rect.height);

  // Find items that intersect with the selection rectangle
  return items.filter(item => {
    const itemHeight = item.height || 20; // Default height if not specified

    // Check for rectangle intersection (not just point-in-rectangle)
    const itemRight = item.x + item.width;
    const itemBottom = item.y + itemHeight;
    const rectRight = rectX + rectWidth;
    const rectBottom = rectY + rectHeight;

    // Two rectangles intersect if they overlap in both X and Y dimensions
    const xOverlap = item.x < rectRight && itemRight > rectX;
    const yOverlap = item.y < rectBottom && itemBottom > rectY;

    console.log('getItemsInRect - checking item:', {
      itemId: item.id,
      item: { x: item.x, y: item.y, width: item.width, height: itemHeight },
      itemBounds: { left: item.x, right: itemRight, top: item.y, bottom: itemBottom },
      rect: { x: rectX, y: rectY, width: rectWidth, height: rectHeight },
      rectBounds: { left: rectX, right: rectRight, top: rectY, bottom: rectBottom },
      xOverlap,
      yOverlap,
      intersects: xOverlap && yOverlap
    });

    return xOverlap && yOverlap;
  });
}

/**
 * Checks if two rectangles intersect
 */
export function rectanglesIntersect(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

/**
 * Normalizes a selection rectangle to have positive width and height
 */
export function normalizeRect(rect: SelectionRect): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: rect.width < 0 ? rect.startX + rect.width : rect.startX,
    y: rect.height < 0 ? rect.startY + rect.height : rect.startY,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height)
  };
}