import React, { useCallback, useContext } from 'react';
import { Layer, Rect, Text, Line, Group } from 'react-konva';
import { ViewportContext } from './KonvaBase';

export type RulerType = 'time' | 'pitch';
export type RulerOrientation = 'horizontal' | 'vertical';

export interface RulerProps {
  /** Type of ruler (time for timeline, pitch for piano roll) */
  type: RulerType;
  
  /** Orientation of the ruler */
  orientation: RulerOrientation;
  
  /** Size of the ruler (width for vertical, height for horizontal) */
  size: number;
  
  /** Length of the ruler (height for vertical, width for horizontal) */
  length: number;
  
  /** Range of values to display */
  range: {
    start: number;
    end: number;
  };
  
  /** Unit size in pixels (e.g., pixels per measure, pixels per octave) */
  unitSize: number;
  
  /** Number of subdivisions per unit */
  subdivisions?: number;
  
  /** Callback when ruler is clicked */
  onClick?: (value: number) => void;
  
  /** Custom labeling function */
  getLabel?: (value: number) => string;
  
  /** Visual styling */
  backgroundColor?: string;
  lineColor?: string;
  textColor?: string;
  fontSize?: number;
  
  /** Whether to show subdivision markers */
  showSubdivisions?: boolean;
  
  /** BPM for time rulers */
  bpm?: number;
  
  /** Time signature for time rulers */
  timeSignature?: [number, number];
}

/**
 * Ruler component for Timeline (time) and PianoRoll (pitch).
 * Provides visual reference and click-to-seek functionality.
 */
export const Ruler: React.FC<RulerProps> = ({
  type,
  orientation,
  size,
  length,
  range,
  unitSize,
  subdivisions = 4,
  onClick,
  getLabel,
  backgroundColor = '#2a2a2a',
  lineColor = 'rgba(255, 255, 255, 0.3)',
  textColor = '#ffffff',
  fontSize = 11,
  showSubdivisions = true,
  bpm = 120,
  timeSignature = [4, 4]
}) => {
  const { viewport } = useContext(ViewportContext);
  
  // Calculate visible range based on viewport
  const visibleStart = orientation === 'horizontal' 
    ? Math.floor(viewport.x / unitSize) 
    : Math.floor(viewport.y / unitSize);
  const visibleEnd = orientation === 'horizontal'
    ? Math.ceil((viewport.x + viewport.width) / unitSize)
    : Math.ceil((viewport.y + viewport.height) / unitSize);
  
  // Default label functions
  const defaultGetLabel = useCallback((value: number) => {
    if (type === 'time') {
      // For time ruler, show measure numbers
      return (value + 1).toString();
    } else {
      // For pitch ruler, show note names
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor(value / 12);
      const note = noteNames[value % 12];
      return `${note}${octave}`;
    }
  }, [type]);
  
  const labelFunction = getLabel || defaultGetLabel;
  
  // Handle click events
  const handleClick = useCallback((e: any) => {
    if (!onClick) return;
    
    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    
    if (orientation === 'horizontal') {
      const relativeX = pointerPos.x;
      const value = (relativeX / unitSize) + range.start;
      onClick(value);
    } else {
      const relativeY = pointerPos.y;
      const value = (relativeY / unitSize) + range.start;
      onClick(value);
    }
  }, [onClick, orientation, unitSize, range.start]);
  
  // Generate tick marks and labels
  const generateMarkers = () => {
    const markers = [];
    
    // Main unit markers
    for (let i = visibleStart; i <= visibleEnd; i++) {
      if (i < range.start || i > range.end) continue;
      
      const position = (i - range.start) * unitSize;
      
      if (orientation === 'horizontal') {
        // Vertical lines for horizontal ruler
        markers.push(
          <Line
            key={`main-${i}`}
            points={[position, 0, position, size]}
            stroke={lineColor}
            strokeWidth={1}
            opacity={0.8}
          />
        );
        
        // Labels
        markers.push(
          <Text
            key={`label-${i}`}
            x={position + 5}
            y={size / 2 - fontSize / 2}
            text={labelFunction(i)}
            fontSize={fontSize}
            fontFamily="Arial"
            fill={textColor}
          />
        );
      } else {
        // Horizontal lines for vertical ruler
        markers.push(
          <Line
            key={`main-${i}`}
            points={[0, position, size, position]}
            stroke={lineColor}
            strokeWidth={1}
            opacity={0.8}
          />
        );
        
        // Labels (only for C notes in pitch ruler)
        if (type === 'pitch' && i % 12 === 0) {
          markers.push(
            <Text
              key={`label-${i}`}
              x={5}
              y={position - fontSize / 2}
              text={labelFunction(i)}
              fontSize={fontSize}
              fontFamily="Arial"
              fill={textColor}
            />
          );
        }
      }
    }
    
    // Subdivision markers
    if (showSubdivisions && subdivisions > 1) {
      const subdivisionSize = unitSize / subdivisions;
      
      for (let i = visibleStart * subdivisions; i <= visibleEnd * subdivisions; i++) {
        if (i % subdivisions === 0) continue; // Skip main markers
        
        const unitIndex = Math.floor(i / subdivisions);
        if (unitIndex < range.start || unitIndex > range.end) continue;
        
        const position = ((unitIndex - range.start) * unitSize) + ((i % subdivisions) * subdivisionSize);
        
        if (orientation === 'horizontal') {
          markers.push(
            <Line
              key={`sub-${i}`}
              points={[position, size * 0.7, position, size]}
              stroke={lineColor}
              strokeWidth={0.5}
              opacity={0.4}
            />
          );
        } else {
          markers.push(
            <Line
              key={`sub-${i}`}
              points={[size * 0.7, position, size, position]}
              stroke={lineColor}
              strokeWidth={0.5}
              opacity={0.4}
            />
          );
        }
      }
    }
    
    return markers;
  };
  
  return (
    <Layer>
      {/* Background */}
      <Rect
        x={0}
        y={0}
        width={orientation === 'horizontal' ? length : size}
        height={orientation === 'horizontal' ? size : length}
        fill={backgroundColor}
        onClick={handleClick}
        onTap={handleClick}
      />
      
      {/* Border */}
      <Line
        points={
          orientation === 'horizontal'
            ? [0, size, length, size]
            : [size, 0, size, length]
        }
        stroke={lineColor}
        strokeWidth={1}
      />
      
      {/* Markers and labels */}
      <Group
        clipX={0}
        clipY={0}
        clipWidth={orientation === 'horizontal' ? length : size}
        clipHeight={orientation === 'horizontal' ? size : length}
      >
        {generateMarkers()}
      </Group>
    </Layer>
  );
};

export default Ruler;