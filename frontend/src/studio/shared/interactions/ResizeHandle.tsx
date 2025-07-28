import React from 'react';
import { cn } from '../../../lib/utils';

export interface ResizeHandleProps {
  direction: 'left' | 'right';
  onMouseDown: (e: React.MouseEvent) => void;
  isVisible?: boolean;
  isActive?: boolean;
  color?: string;
  size?: number;
  offset?: number;
  style?: React.CSSProperties;
}

/**
 * Shared resize handle component for both tracks and notes
 * Provides visual feedback and interaction for resizing operations
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  onMouseDown,
  isVisible = true,
  isActive = false,
  color = '#2196f3',
  size = 8,
  offset = 2,
  style = {}
}) => {
  if (!isVisible) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onMouseDown(e);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        "absolute flex items-center justify-center z-10 transition-opacity duration-200 ease-in-out hover:opacity-100",
        direction === 'left' ? 'cursor-w-resize' : 'cursor-e-resize',
        isActive ? 'opacity-100' : 'opacity-0',
        `resize-handle resize-handle-${direction}`
      )}
      style={{
        top: offset,
        bottom: offset,
        width: size,
        ...(direction === 'left' ? { left: -size / 2 } : { right: -size / 2 }),
        ...style
      }}
    >
      {/* Handle indicator */}
      <div
        className="absolute top-1/2 transform -translate-y-1/2 w-0.5 h-1/2 rounded opacity-80"
        style={{ backgroundColor: color }}
      />
    </div>
  );
};

/**
 * Container component that adds resize handles to any element
 */
export interface ResizableContainerProps {
  children: React.ReactNode;
  onResizeStart: (direction: 'left' | 'right', e: React.MouseEvent) => void;
  showHandles?: boolean;
  isResizing?: boolean;
  handleColor?: string;
  handleSize?: number;
  containerStyle?: React.CSSProperties;
  className?: string;
}

export const ResizableContainer: React.FC<ResizableContainerProps> = ({
  children,
  onResizeStart,
  showHandles = true,
  isResizing = false,
  handleColor = '#2196f3',
  handleSize = 8,
  containerStyle = {},
  className = ''
}) => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      className={cn("relative", `resizable-container ${className}`)}
      style={containerStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      
      {showHandles && (
        <>
          <ResizeHandle
            direction="left"
            onMouseDown={(e) => onResizeStart('left', e)}
            isVisible={true}
            isActive={isHovered || isResizing}
            color={handleColor}
            size={handleSize}
          />
          <ResizeHandle
            direction="right"
            onMouseDown={(e) => onResizeStart('right', e)}
            isVisible={true}
            isActive={isHovered || isResizing}
            color={handleColor}
            size={handleSize}
          />
        </>
      )}
    </div>
  );
};