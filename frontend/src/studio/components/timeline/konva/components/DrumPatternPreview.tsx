import React, { useMemo } from 'react';
import { Group, Rect } from 'react-konva';
import { 
  getVisibleTimeRange, 
  getVisiblePatternSteps, 
  timelinePositionToPixels 
} from '../../../../utils/timelinePositioning';

export interface DrumPatternPreviewProps {
  pattern: boolean[][];
  width: number;
  height: number;
  pixelsPerTick: number;
  contentOffset: number;
  ticksPerStep: number;
  color: string;
}

/**
 * Renders drum pattern visualization using timeline-based positioning.
 * Similar to KonvaMidiNotesPreview but for drum patterns.
 */
export const DrumPatternPreview: React.FC<DrumPatternPreviewProps> = ({
  pattern,
  width,
  height,
  pixelsPerTick,
  contentOffset,
  ticksPerStep,
  color
}) => {
  // Calculate visible time range for viewport culling
  const visibleRange = useMemo(() => {
    return getVisibleTimeRange(width, contentOffset, pixelsPerTick);
  }, [width, contentOffset, pixelsPerTick]);

  // Calculate pattern dimensions
  const numRows = pattern.length;
  const numCols = pattern[0]?.length || 0;
  
  // Calculate row height
  const padding = 2;
  const gap = 1;
  const totalGapHeight = (numRows - 1) * gap;
  const rowHeight = (height - (2 * padding) - totalGapHeight) / numRows;
  
  // Get visible steps for performance optimization
  const visibleSteps = useMemo(() => {
    return getVisiblePatternSteps(
      numCols,
      ticksPerStep,
      pixelsPerTick,
      contentOffset,
      visibleRange
    );
  }, [numCols, ticksPerStep, pixelsPerTick, contentOffset, visibleRange]);

  // Calculate cell width based on timeline positioning
  const horizontalGap = 1; // Gap between horizontally adjacent cells
  const cellWidth = useMemo(() => {
    return (ticksPerStep * pixelsPerTick) - horizontalGap;
  }, [ticksPerStep, pixelsPerTick]);

  // Render drum pattern cells
  const renderPatternCells = useMemo(() => {
    const cells: React.ReactNode[] = [];
    
    visibleSteps.forEach(({ stepIndex, x }) => {
      pattern.forEach((row, rowIndex) => {
        const isActive = row[stepIndex];
        const y = padding + rowIndex * (rowHeight + gap);
        
        // Base cell
        cells.push(
          <Rect
            key={`cell-${rowIndex}-${stepIndex}`}
            x={x + horizontalGap / 2}
            y={y}
            width={cellWidth}
            height={rowHeight}
            fill="white"
            opacity={isActive ? 0.8 : 0.05}
            cornerRadius={3}
          />
        );
      });
    });
    
    return cells;
  }, [visibleSteps, pattern, padding, rowHeight, gap, cellWidth]);

  return (
    <Group>
      {renderPatternCells}
    </Group>
  );
};

export default DrumPatternPreview;