import React from 'react';
import { Box } from '@mui/material';
import { SelectionRect } from './types';

interface SelectionOverlayProps {
  selectionRect: SelectionRect | null;
  isActive: boolean;
  containerWidth?: number;
  containerHeight?: number;
  className?: string;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  selectionRect,
  isActive,
  containerWidth,
  containerHeight,
  className = ''
}) => {
  if (!isActive || !selectionRect) {
    return null;
  }

  // Calculate normalized rectangle coordinates
  const x = selectionRect.width < 0 ? selectionRect.startX + selectionRect.width : selectionRect.startX;
  const y = selectionRect.height < 0 ? selectionRect.startY + selectionRect.height : selectionRect.startY;
  const width = Math.abs(selectionRect.width);
  const height = Math.abs(selectionRect.height);

  return (
    <Box
      className={`selection-overlay ${className}`}
      sx={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
        border: '1px dashed rgba(58, 123, 213, 0.8)',
        backgroundColor: 'rgba(58, 123, 213, 0.1)',
        pointerEvents: 'none',
        zIndex: 9999,
        borderRadius: '2px'
      }}
    />
  );
};

export default SelectionOverlay;