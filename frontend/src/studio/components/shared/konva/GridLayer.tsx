import React, { useContext, useMemo } from 'react';
import { Layer, Line, Rect } from 'react-konva';
import { ViewportContext } from './KonvaBase';

export type GridOrientation = 'horizontal' | 'vertical';

export interface GridLayerProps {
  /** Orientation of the grid lines */
  orientation: GridOrientation;
  
  /** Total width of the grid area */
  width: number;
  
  /** Total height of the grid area */
  height: number;
  
  /** Primary grid size (e.g., measure width for timeline, octave height for piano roll) */
  primaryGridSize: number;
  
  /** Number of subdivisions within each primary grid cell */
  subdivisions: number;
  
  /** Colors for different line types */
  colors?: {
    primary?: string;
    secondary?: string;
    tertiary?: string;
    background?: string;
  };
  
  /** Line widths for different line types */
  lineWidths?: {
    primary?: number;
    secondary?: number;
    tertiary?: number;
  };
  
  /** Optional offset for the grid (useful for scrolling) */
  offset?: { x: number; y: number };
  
  /** Whether to show subdivision lines */
  showSubdivisions?: boolean;
  
  /** Whether to show secondary lines (e.g., beats) */
  showSecondary?: boolean;
}

const defaultColors = {
  primary: 'rgba(128, 128, 128, 0.8)',
  secondary: 'rgba(128, 128, 128, 0.5)',
  tertiary: 'rgba(128, 128, 128, 0.25)',
  background: 'transparent'
};

const defaultLineWidths = {
  primary: 1,
  secondary: 0.5,
  tertiary: 0.5
};

/**
 * Unified grid rendering component for both Timeline and PianoRoll.
 * Efficiently renders grid lines using Konva shapes with viewport culling.
 */
export const GridLayer: React.FC<GridLayerProps> = ({
  orientation,
  width,
  height,
  primaryGridSize,
  subdivisions,
  colors = defaultColors,
  lineWidths = defaultLineWidths,
  offset = { x: 0, y: 0 },
  showSubdivisions = true,
  showSecondary = true
}) => {
  const { viewport, isInViewport } = useContext(ViewportContext);
  const mergedColors = { ...defaultColors, ...colors };
  const mergedLineWidths = { ...defaultLineWidths, ...lineWidths };
  
  // Calculate secondary grid size (e.g., beat size)
  const secondaryGridSize = primaryGridSize / subdivisions;
  
  // Generate line data with viewport culling
  const lines = useMemo(() => {
    const result: {
      points: number[];
      stroke: string;
      strokeWidth: number;
      key: string;
    }[] = [];
    
    if (orientation === 'horizontal') {
      // Horizontal lines (for piano roll - note lanes)
      
      // Calculate visible range
      const startY = Math.max(0, viewport.y - primaryGridSize);
      const endY = Math.min(height, viewport.y + viewport.height + primaryGridSize);
      
      // Primary lines (octaves)
      const primaryStartIndex = Math.floor(startY / primaryGridSize);
      const primaryEndIndex = Math.ceil(endY / primaryGridSize);
      
      for (let i = primaryStartIndex; i <= primaryEndIndex; i++) {
        const y = i * primaryGridSize + offset.y;
        if (y >= 0 && y <= height) {
          result.push({
            points: [0, y, width, y],
            stroke: mergedColors.primary,
            strokeWidth: mergedLineWidths.primary,
            key: `primary-h-${i}`
          });
        }
      }
      
      // Secondary and tertiary lines
      if (showSecondary || showSubdivisions) {
        const secondaryStartIndex = Math.floor(startY / secondaryGridSize);
        const secondaryEndIndex = Math.ceil(endY / secondaryGridSize);
        
        for (let i = secondaryStartIndex; i <= secondaryEndIndex; i++) {
          const y = i * secondaryGridSize + offset.y;
          
          // Skip if it's a primary line
          if (i % subdivisions === 0) continue;
          
          if (y >= 0 && y <= height) {
            const isSecondary = showSecondary && (i % (subdivisions / 4) === 0);
            
            result.push({
              points: [0, y, width, y],
              stroke: isSecondary ? mergedColors.secondary : mergedColors.tertiary,
              strokeWidth: isSecondary ? mergedLineWidths.secondary : mergedLineWidths.tertiary,
              key: `${isSecondary ? 'secondary' : 'tertiary'}-h-${i}`
            });
          }
        }
      }
    } else {
      // Vertical lines (for timeline - time divisions)
      
      // Calculate visible range
      const startX = Math.max(0, viewport.x - primaryGridSize);
      const endX = Math.min(width, viewport.x + viewport.width + primaryGridSize);
      
      // Primary lines (measures)
      const primaryStartIndex = Math.floor(startX / primaryGridSize);
      const primaryEndIndex = Math.ceil(endX / primaryGridSize);
      
      for (let i = primaryStartIndex; i <= primaryEndIndex; i++) {
        const x = i * primaryGridSize + offset.x;
        if (x >= 0 && x <= width) {
          result.push({
            points: [x, 0, x, height],
            stroke: mergedColors.primary,
            strokeWidth: mergedLineWidths.primary,
            key: `primary-v-${i}`
          });
        }
      }
      
      // Secondary lines (beats) and tertiary lines (subdivisions)
      if (showSecondary || showSubdivisions) {
        const tertiaryGridSize = secondaryGridSize / (showSubdivisions ? 4 : 1);
        const tertiaryStartIndex = Math.floor(startX / tertiaryGridSize);
        const tertiaryEndIndex = Math.ceil(endX / tertiaryGridSize);
        
        for (let i = tertiaryStartIndex; i <= tertiaryEndIndex; i++) {
          const x = i * tertiaryGridSize + offset.x;
          
          // Skip if it's a primary line
          if (i % (primaryGridSize / tertiaryGridSize) === 0) continue;
          
          if (x >= 0 && x <= width) {
            const isSecondary = showSecondary && (i % (secondaryGridSize / tertiaryGridSize) === 0);
            
            if (isSecondary || showSubdivisions) {
              result.push({
                points: [x, 0, x, height],
                stroke: isSecondary ? mergedColors.secondary : mergedColors.tertiary,
                strokeWidth: isSecondary ? mergedLineWidths.secondary : mergedLineWidths.tertiary,
                key: `${isSecondary ? 'secondary' : 'tertiary'}-v-${i}`
              });
            }
          }
        }
      }
    }
    
    return result;
  }, [
    orientation,
    width,
    height,
    primaryGridSize,
    subdivisions,
    viewport,
    offset,
    showSubdivisions,
    showSecondary,
    mergedColors,
    mergedLineWidths
  ]);
  
  return (
    <Layer name="grid-layer">
      {/* Background */}
      {mergedColors.background !== 'transparent' && (
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={mergedColors.background}
        />
      )}
      
      {/* Grid lines */}
      {lines.map(line => (
        <Line
          key={line.key}
          points={line.points}
          stroke={line.stroke}
          strokeWidth={line.strokeWidth}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
          hitStrokeWidth={0}
          listening={false}
        />
      ))}
    </Layer>
  );
};

export default GridLayer;