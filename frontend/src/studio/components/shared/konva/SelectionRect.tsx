import React from 'react';
import { Rect } from 'react-konva';

export interface SelectionRectProps {
  /** Starting point of the selection */
  start: { x: number; y: number } | null;
  
  /** Current end point of the selection */
  end: { x: number; y: number } | null;
  
  /** Whether the selection is currently active */
  isActive: boolean;
  
  /** Fill color for the selection rectangle */
  fillColor?: string;
  
  /** Stroke color for the selection rectangle */
  strokeColor?: string;
  
  /** Stroke width */
  strokeWidth?: number;
  
  /** Opacity of the fill */
  opacity?: number;
}

/**
 * Selection rectangle overlay for multi-selection functionality.
 * Shows a semi-transparent rectangle during drag selection.
 */
export const SelectionRect: React.FC<SelectionRectProps> = ({
  start,
  end,
  isActive,
  fillColor = 'rgba(33, 150, 243, 0.2)',
  strokeColor = 'rgba(33, 150, 243, 0.8)',
  strokeWidth = 1,
  opacity = 1
}) => {
  if (!isActive || !start || !end) {
    return null;
  }
  
  // Calculate rectangle dimensions
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  
  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fillColor}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      opacity={opacity}
      listening={false}
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
    />
  );
};

export default SelectionRect;