import React from 'react';
import { Box } from '@mui/material';

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

  const baseStyles: React.CSSProperties = {
    position: 'absolute',
    top: offset,
    bottom: offset,
    width: size,
    cursor: `${direction === 'left' ? 'w' : 'e'}-resize`,
    zIndex: 10,
    opacity: isActive ? 1 : 0,
    transition: 'opacity 0.2s ease-in-out',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style
  };

  const positionStyles: React.CSSProperties = direction === 'left' 
    ? { left: -size / 2 }
    : { right: -size / 2 };

  const handleStyles: React.CSSProperties = {
    ...baseStyles,
    ...positionStyles
  };

  return (
    <Box
      onMouseDown={handleMouseDown}
      sx={{
        ...handleStyles,
        '&:hover': {
          opacity: 1
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          width: 2,
          height: '50%',
          backgroundColor: color,
          borderRadius: 1,
          opacity: 0.8
        }
      }}
      className={`resize-handle resize-handle-${direction}`}
    />
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

  const containerStyles: React.CSSProperties = {
    position: 'relative',
    ...containerStyle
  };

  return (
    <div
      className={`resizable-container ${className}`}
      style={containerStyles}
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