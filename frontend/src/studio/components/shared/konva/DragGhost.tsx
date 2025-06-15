import React from 'react';
import { Group, Rect, Text } from 'react-konva';

export interface DragItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  label?: string;
  type?: 'track' | 'note' | 'custom';
}

export interface DragGhostProps {
  /** Items being dragged */
  items: DragItem[];
  
  /** Offset from the original position */
  offset: { x: number; y: number };
  
  /** Opacity of the ghost items */
  opacity?: number;
  
  /** Whether to show count badge for multiple items */
  showCountBadge?: boolean;
  
  /** Custom renderer for items */
  renderItem?: (item: DragItem, index: number) => React.ReactElement;
}

/**
 * Ghost visualization for items being dragged.
 * Shows semi-transparent copies of the dragged items at their new position.
 */
export const DragGhost: React.FC<DragGhostProps> = ({
  items,
  offset,
  opacity = 0.6,
  showCountBadge = true,
  renderItem
}) => {
  if (items.length === 0) {
    return null;
  }
  
  // Calculate bounding box for all items
  const minX = Math.min(...items.map(item => item.x));
  const minY = Math.min(...items.map(item => item.y));
  
  return (
    <Group
      x={offset.x}
      y={offset.y}
      opacity={opacity}
      listening={false}
    >
      {items.map((item, index) => {
        // Position relative to the group
        const relativeX = item.x - minX;
        const relativeY = item.y - minY;
        
        if (renderItem) {
          return (
            <Group key={item.id} x={relativeX} y={relativeY}>
              {renderItem(item, index)}
            </Group>
          );
        }
        
        // Default rendering based on type
        return (
          <Group key={item.id} x={relativeX} y={relativeY}>
            {item.type === 'track' ? (
              // Track rendering
              <>
                <Rect
                  x={0}
                  y={0}
                  width={item.width}
                  height={item.height}
                  fill={item.color || '#4a90e2'}
                  cornerRadius={6}
                  shadowBlur={5}
                  shadowOpacity={0.3}
                  shadowOffsetY={2}
                />
                {item.label && (
                  <Text
                    x={10}
                    y={6}
                    text={item.label}
                    fontSize={12}
                    fontFamily="Arial"
                    fill="white"
                    shadowBlur={2}
                    shadowOpacity={0.5}
                  />
                )}
              </>
            ) : item.type === 'note' ? (
              // Note rendering
              <Rect
                x={0}
                y={0}
                width={item.width}
                height={item.height}
                fill={item.color || '#ff6b6b'}
                cornerRadius={2}
              />
            ) : (
              // Generic rectangle
              <Rect
                x={0}
                y={0}
                width={item.width}
                height={item.height}
                fill={item.color || '#666666'}
                stroke="#333333"
                strokeWidth={1}
              />
            )}
          </Group>
        );
      })}
      
      {/* Count badge for multiple items */}
      {showCountBadge && items.length > 1 && (
        <Group x={0} y={-20}>
          <Rect
            x={0}
            y={0}
            width={30}
            height={20}
            fill="#2196f3"
            cornerRadius={10}
            shadowBlur={3}
            shadowOpacity={0.3}
          />
          <Text
            x={0}
            y={3}
            width={30}
            height={20}
            text={items.length.toString()}
            fontSize={14}
            fontFamily="Arial"
            fontStyle="bold"
            fill="white"
            align="center"
          />
        </Group>
      )}
    </Group>
  );
};

export default DragGhost;