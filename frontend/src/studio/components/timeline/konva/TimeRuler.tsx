import React from 'react';
import { Layer, Group, Rect, Line, Text } from 'react-konva';
import { Viewport } from '../../shared/konva';

export interface TimeRulerProps {
  width: number;
  height: number;
  measureCount: number;
  pixelsPerMeasure: number;
  timeSignature: [number, number];
  bpm: number;
  onClick?: (measure: number) => void;
  viewport: Viewport;
  zoom: number;
}

/**
 * Time ruler component showing measure and beat markers.
 * Optimized for performance with viewport culling.
 */
export const TimeRuler: React.FC<TimeRulerProps> = ({
  width,
  height,
  measureCount,
  pixelsPerMeasure,
  timeSignature,
  bpm,
  onClick,
  viewport,
  zoom
}) => {
  const [beatsPerMeasure] = timeSignature;
  const pixelsPerBeat = pixelsPerMeasure / beatsPerMeasure;
  
  // Calculate visible range
  const visibleStartMeasure = Math.floor(viewport.x / pixelsPerMeasure);
  const visibleEndMeasure = Math.ceil((viewport.x + viewport.width) / pixelsPerMeasure) + 1;
  
  // Handle click
  const handleClick = (e: any) => {
    if (!onClick) return;
    
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const relativeX = point.x + viewport.x;
    const measure = Math.floor(relativeX / pixelsPerMeasure);
    
    if (measure >= 0 && measure < measureCount) {
      onClick(measure);
    }
  };
  
  return (
    <Layer name="time-ruler-layer">
      <Group y={0}>
        {/* Background */}
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="#2a2a2a"
          onClick={handleClick}
          listening={true}
        />
      
      {/* Bottom border */}
      <Line
        points={[0, height, width, height]}
        stroke="rgba(255, 255, 255, 0.2)"
        strokeWidth={1}
      />
      
      {/* Measure markers and numbers */}
      {Array.from({ length: visibleEndMeasure - visibleStartMeasure }).map((_, index) => {
        const measureIndex = visibleStartMeasure + index;
        if (measureIndex < 0 || measureIndex >= measureCount) return null;
        
        const x = measureIndex * pixelsPerMeasure;
        
        return (
          <Group key={`measure-${measureIndex}`}>
            {/* Measure line */}
            <Line
              points={[x, 0, x, height]}
              stroke="rgba(255, 255, 255, 0.5)"
              strokeWidth={1}
            />
            
            {/* Measure number */}
            <Text
              x={x + 5}
              y={height / 2 - 7}
              text={`${measureIndex + 1}`}
              fontSize={14}
              fontFamily="Arial"
              fill="rgba(255, 255, 255, 0.8)"
            />
            
            {/* Beat markers */}
            {Array.from({ length: beatsPerMeasure - 1 }).map((_, beatIndex) => {
              const beatX = x + (beatIndex + 1) * pixelsPerBeat;
              
              return (
                <Group key={`beat-${measureIndex}-${beatIndex}`}>
                  {/* Beat line */}
                  <Line
                    points={[beatX, height * 0.7, beatX, height]}
                    stroke="rgba(255, 255, 255, 0.3)"
                    strokeWidth={0.5}
                  />
                  
                  {/* Beat number (only if zoomed in enough) */}
                  {zoom > 1.5 && (
                    <Text
                      x={beatX + 3}
                      y={height / 2 + 2}
                      text={`${beatIndex + 2}`}
                      fontSize={10}
                      fontFamily="Arial"
                      fill="rgba(255, 255, 255, 0.5)"
                    />
                  )}
                </Group>
              );
            })}
          </Group>
        );
      })}
      </Group>
    </Layer>
  );
};

// Export memoized version to prevent unnecessary re-renders during drag
export default React.memo(TimeRuler);