import React, { useContext, useMemo } from 'react';
import { Group, Rect } from 'react-konva';
import { ViewportContext } from './KonvaBase';
import { ResizeHandle } from './ResizeHandle';
import Konva from 'konva';

export interface DraggableItemProps {
  /** Unique identifier for the item */
  id: string;
  
  /** Position in logical units (ticks for timeline, pixels for piano roll) */
  x: number;
  y: number;
  
  /** Dimensions in logical units */
  width: number;
  height: number;
  
  /** Whether the item is selected */
  isSelected: boolean;
  
  /** Whether the item is being dragged */
  isDragging?: boolean;
  
  /** Whether the item is part of a group drag */
  isGroupDrag?: boolean;
  
  /** Whether this is the primary item in a group operation */
  isPrimary?: boolean;
  
  /** Whether the item is being resized */
  isResizing?: boolean;
  
  /** Current resize direction */
  resizeDirection?: 'left' | 'right' | null;
  
  /** Whether to show resize handles */
  showResizeHandles?: boolean;
  
  /** Whether the item can be resized */
  resizable?: boolean;
  
  /** Minimum width when resizing */
  minWidth?: number;
  
  /** Selection styling */
  selectionStyle?: {
    stroke?: string;
    strokeWidth?: number;
    cornerRadius?: number;
  };
  
  /** Render function for the item content */
  renderContent: (props: {
    width: number;
    height: number;
    isSelected: boolean;
    isDragging: boolean;
  }) => React.ReactElement;
  
  /** Callbacks */
  onMouseDown?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragStart?: () => void;
  onDragMove?: (delta: { x: number; y: number }) => void;
  onDragEnd?: () => void;
  onResizeStart?: (direction: 'left' | 'right') => void;
  onResizeMove?: (delta: number, direction: 'left' | 'right') => void;
  onResizeEnd?: () => void;
  
  /** Whether to enable viewport culling */
  enableCulling?: boolean;
  
  /** Buffer for viewport culling (in logical units) */
  cullingBuffer?: number;
}

/**
 * Base component for draggable and resizable items in Konva.
 * Used as the foundation for both timeline tracks and piano roll notes.
 */
export const DraggableItem: React.FC<DraggableItemProps> = ({
  id,
  x,
  y,
  width,
  height,
  isSelected,
  isDragging = false,
  isGroupDrag = false,
  isPrimary = false,
  isResizing = false,
  resizeDirection = null,
  showResizeHandles = true,
  resizable = true,
  minWidth = 10,
  selectionStyle = {},
  renderContent,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDragMove,
  onDragEnd,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  enableCulling = true,
  cullingBuffer = 100
}) => {
  const { isInViewport } = useContext(ViewportContext);
  
  // Default selection style
  const defaultSelectionStyle = {
    stroke: '#2196f3',
    strokeWidth: 2,
    cornerRadius: 4,
    ...selectionStyle
  };
  
  // Check if item is in viewport (with buffer)
  const isVisible = useMemo(() => {
    if (!enableCulling) return true;
    return isInViewport(
      x - cullingBuffer,
      y - cullingBuffer,
      width + cullingBuffer * 2,
      height + cullingBuffer * 2
    );
  }, [enableCulling, isInViewport, x, y, width, height, cullingBuffer]);
  
  // Don't render if outside viewport
  if (!isVisible) {
    return null;
  }
  
  // Calculate opacity based on state
  const opacity = isDragging ? 0.8 : 1;
  
  // Handle resize callbacks
  const handleLeftResize = (delta: { x: number; y: number }) => {
    if (onResizeMove) {
      onResizeMove(delta.x, 'left');
    }
  };
  
  const handleRightResize = (delta: { x: number; y: number }) => {
    if (onResizeMove) {
      onResizeMove(delta.x, 'right');
    }
  };
  
  return (
    <Group
      id={id}
      x={x}
      y={y}
      opacity={opacity}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Selection outline */}
      {isSelected && (
        <Rect
          x={-defaultSelectionStyle.strokeWidth}
          y={-defaultSelectionStyle.strokeWidth}
          width={width + defaultSelectionStyle.strokeWidth * 2}
          height={height + defaultSelectionStyle.strokeWidth * 2}
          stroke={defaultSelectionStyle.stroke}
          strokeWidth={defaultSelectionStyle.strokeWidth}
          cornerRadius={defaultSelectionStyle.cornerRadius}
          fill="transparent"
          listening={false}
          dash={isGroupDrag && !isPrimary ? [5, 5] : undefined}
        />
      )}
      
      {/* Primary indicator for group operations */}
      {isSelected && isPrimary && (isGroupDrag || isResizing) && (
        <Group>
          {/* Primary badge */}
          <Rect
            x={width - 20}
            y={-10}
            width={20}
            height={20}
            fill="#ff9800"
            cornerRadius={10}
            shadowBlur={4}
            shadowOpacity={0.3}
          />
          <Rect
            x={width - 15}
            y={-5}
            width={10}
            height={10}
            fill="white"
            cornerRadius={5}
          />
        </Group>
      )}
      
      {/* Item content */}
      <Group>
        {renderContent({
          width,
          height,
          isSelected,
          isDragging: isDragging || isGroupDrag
        })}
      </Group>
      
      {/* Resize handles */}
      {isSelected && showResizeHandles && resizable && !isDragging && !isGroupDrag && (
        <>
          {/* Left handle */}
          <ResizeHandle
            x={0}
            y={height / 2}
            direction="left"
            visible={true}
            onResizeStart={() => onResizeStart?.('left')}
            onResize={handleLeftResize}
            onResizeEnd={onResizeEnd}
            color={isResizing && resizeDirection === 'left' ? 'rgba(33, 150, 243, 0.8)' : 'transparent'}
          />
          
          {/* Right handle */}
          <ResizeHandle
            x={width}
            y={height / 2}
            direction="right"
            visible={true}
            onResizeStart={() => onResizeStart?.('right')}
            onResize={handleRightResize}
            onResizeEnd={onResizeEnd}
            color={isResizing && resizeDirection === 'right' ? 'rgba(33, 150, 243, 0.8)' : 'transparent'}
          />
        </>
      )}
    </Group>
  );
};

export default DraggableItem;