import React, { useState, useCallback } from 'react';
import { Rect, Group } from 'react-konva';
import Konva from 'konva';

export type ResizeDirection = 'left' | 'right' | 'top' | 'bottom';

export interface ResizeHandleProps {
  /** Position of the handle */
  x: number;
  y: number;
  
  /** Size of the handle */
  width?: number;
  height?: number;
  
  /** Direction this handle resizes in */
  direction: ResizeDirection;
  
  /** Callback when resize starts */
  onResizeStart?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  
  /** Callback during resize */
  onResize?: (delta: { x: number; y: number }) => void;
  
  /** Callback when resize ends */
  onResizeEnd?: () => void;
  
  /** Visual styling */
  color?: string;
  hoverColor?: string;
  activeColor?: string;
  
  /** Whether the handle is currently visible */
  visible?: boolean;
  
  /** Custom cursor style */
  cursor?: string;
}

/**
 * Resize handle component for draggable items.
 * Provides visual feedback and interaction for resizing operations.
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  x,
  y,
  width = 8,
  height = 8,
  direction,
  onResizeStart,
  onResize,
  onResizeEnd,
  color = 'transparent',
  hoverColor = 'rgba(33, 150, 243, 0.5)',
  activeColor = 'rgba(33, 150, 243, 0.8)',
  visible = true,
  cursor
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  
  // Determine cursor based on direction
  const getCursor = () => {
    if (cursor) return cursor;
    
    switch (direction) {
      case 'left':
      case 'right':
        return 'ew-resize';
      case 'top':
      case 'bottom':
        return 'ns-resize';
      default:
        return 'pointer';
    }
  };
  
  // Adjust handle position based on direction
  const getAdjustedPosition = () => {
    switch (direction) {
      case 'left':
        return { x: x - width / 2, y };
      case 'right':
        return { x: x - width / 2, y };
      case 'top':
        return { x, y: y - height / 2 };
      case 'bottom':
        return { x, y: y - height / 2 };
      default:
        return { x, y };
    }
  };
  
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);
  
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);
  
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    
    const stage = e.target.getStage();
    if (!stage) return;
    
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    
    setIsDragging(true);
    setDragStart(pointerPos);
    
    if (onResizeStart) {
      onResizeStart(e);
    }
  }, [onResizeStart]);
  
  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDragging || !dragStart) return;
    
    const stage = e.target.getStage();
    if (!stage) return;
    
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    
    const delta = {
      x: pointerPos.x - dragStart.x,
      y: pointerPos.y - dragStart.y
    };
    
    // Update drag start for continuous dragging
    setDragStart(pointerPos);
    
    if (onResize) {
      onResize(delta);
    }
  }, [isDragging, dragStart, onResize]);
  
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      
      if (onResizeEnd) {
        onResizeEnd();
      }
    }
  }, [isDragging, onResizeEnd]);
  
  // Set up global mouse event listeners when dragging
  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove as any);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove as any);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  if (!visible) {
    return null;
  }
  
  const position = getAdjustedPosition();
  const fillColor = isDragging ? activeColor : (isHovered ? hoverColor : color);
  
  // Adjust dimensions based on direction
  const handleWidth = direction === 'left' || direction === 'right' ? width : height * 3;
  const handleHeight = direction === 'top' || direction === 'bottom' ? height : width * 3;
  
  return (
    <Group>
      <Rect
        x={position.x}
        y={position.y}
        width={handleWidth}
        height={handleHeight}
        fill={fillColor}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        hitStrokeWidth={10} // Increase hit area for easier grabbing
        listening={true}
        style={{ cursor: getCursor() }}
      />
      
      {/* Visual indicator when active */}
      {(isHovered || isDragging) && (
        <Rect
          x={position.x - 1}
          y={position.y - 1}
          width={handleWidth + 2}
          height={handleHeight + 2}
          stroke={activeColor}
          strokeWidth={1}
          fill="transparent"
          listening={false}
        />
      )}
    </Group>
  );
};

export default ResizeHandle;