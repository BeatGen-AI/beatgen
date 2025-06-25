import React from 'react';
import { Layer, Group, Rect, Line, Text } from 'react-konva';
import { Viewport } from '../../shared/konva';
import { calculatePositionTime } from '../../../constants/gridConstants';

export interface TimeRulerProps {
  width: number;
  height: number;
  measureCount: number;
  pixelsPerMeasure: number;
  timeSignature: [number, number];
  bpm: number;
  onClick?: (time: number) => void;
  viewport: Viewport;
  zoom: number;
  studioMode?: 'light' | 'dark';
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
  zoom,
  studioMode = 'dark'
}) => {
  const [beatsPerMeasure, subdivisionsPerBeat] = timeSignature;
  const pixelsPerBeat = pixelsPerMeasure / beatsPerMeasure;
  const subdivisionWidth = pixelsPerBeat / subdivisionsPerBeat;
  
  // Define colors based on theme (matching Timeline)
  const isDark = studioMode === 'dark'
  const SUBDIVISION_LINE_COLOR = isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(0, 0, 0, 0.10)';
  const BEAT_LINE_COLOR = isDark ? 'rgba(255, 255, 255, 0.40)' : 'rgba(0, 0, 0, 0.20)';
  const MEASURE_LINE_COLOR = isDark ? 'rgba(255, 255, 255, 0.70)' : 'rgba(0, 0, 0, 0.40)';
  
  // Semantic colors matching Tailwind's neutral scale
  const BACKGROUND_COLOR = isDark ? '#171717' : '#f5f5f5'; // neutral-900 / neutral-100
  const BORDER_COLOR = isDark ? 'rgba(64, 64, 64, 1)' : 'rgba(212, 212, 212, 1)'; // neutral-700 / neutral-300
  const TEXT_COLOR_MAIN = isDark ? 'rgba(229, 229, 229, 1)' : 'rgba(64, 64, 64, 1)'; // neutral-200 / neutral-700
  const TEXT_COLOR_SECONDARY = isDark ? 'rgba(163, 163, 163, 1)' : 'rgba(115, 115, 115, 1)'; // neutral-400 / neutral-500
  
  // Handle click
  const handleClick = (e: any) => {
    if (!onClick) return;
    
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const relativeX = point.x + viewport.x;
    const adjustedX = relativeX / zoom;
    const timeInSeconds = calculatePositionTime(adjustedX, bpm, timeSignature);
    
    onClick(timeInSeconds);
  };
  
  return (
    <Group name="time-ruler-group">
        {/* Background */}
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={BACKGROUND_COLOR}
          onClick={handleClick}
          listening={true}
          mouseCursor="pointer"
        />
        
        {/* Bottom border */}
        <Rect
          x={0}
          y={height - 1}
          width={width}
          height={1}
          fill={BORDER_COLOR}
        />
        
        {/* Subtle shadow effect */}
        <Rect
          x={0}
          y={height - 3}
          width={width}
          height={3}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: 3 }}
          fillLinearGradientColorStops={isDark ? 
            [0, 'rgba(0, 0, 0, 0)', 1, 'rgba(0, 0, 0, 0.1)'] :
            [0, 'rgba(0, 0, 0, 0)', 1, 'rgba(0, 0, 0, 0.05)']
          }
        />
      
      {/* Draw subdivisions first (dimmest) - only visible ones */}
      {(() => {
        const firstVisibleMeasure = Math.max(0, Math.floor(viewport.x / pixelsPerMeasure) - 1);
        const lastVisibleMeasure = Math.min(measureCount, Math.ceil((viewport.x + viewport.width) / pixelsPerMeasure) + 1);
        
        return Array.from({ length: lastVisibleMeasure - firstVisibleMeasure }, (_, idx) => {
          const m = firstVisibleMeasure + idx;
          return Array.from({ length: beatsPerMeasure }).map((_, b) => {
            return Array.from({ length: subdivisionsPerBeat - 1 }).map((_, s) => {
              const x = m * pixelsPerMeasure + b * pixelsPerBeat + (s + 1) * subdivisionWidth;
              return (
                <Line
                  key={`subdiv-${m}-${b}-${s}`}
                  points={[x, height * 0.85, x, height]}
                  stroke={SUBDIVISION_LINE_COLOR}
                  strokeWidth={1}
                />
              );
            });
          }).flat();
        }).flat();
      })()}
      
      {/* Draw beat lines (medium prominence) - only visible ones */}
      {(() => {
        const firstVisibleMeasure = Math.max(0, Math.floor(viewport.x / pixelsPerMeasure) - 1);
        const lastVisibleMeasure = Math.min(measureCount, Math.ceil((viewport.x + viewport.width) / pixelsPerMeasure) + 1);
        
        return Array.from({ length: lastVisibleMeasure - firstVisibleMeasure }, (_, idx) => {
          const m = firstVisibleMeasure + idx;
          return Array.from({ length: beatsPerMeasure - 1 }).map((_, b) => {
            const x = m * pixelsPerMeasure + (b + 1) * pixelsPerBeat;
            return (
              <Line
                key={`beat-${m}-${b}`}
                points={[x, 0, x, height]}
                stroke={BEAT_LINE_COLOR}
                strokeWidth={0.5}
              />
            );
          });
        }).flat();
      })()}
      
      {/* Draw measure lines (most prominent) - only visible ones */}
      {(() => {
        const firstVisibleMeasure = Math.max(0, Math.floor(viewport.x / pixelsPerMeasure) - 1);
        const lastVisibleMeasure = Math.min(measureCount + 1, Math.ceil((viewport.x + viewport.width) / pixelsPerMeasure) + 1);
        
        return Array.from({ length: lastVisibleMeasure - firstVisibleMeasure }, (_, idx) => {
          const i = firstVisibleMeasure + idx;
          const x = i * pixelsPerMeasure;
          return (
            <Line
              key={`measure-${i}`}
              points={[x, 0, x, height]}
              stroke={MEASURE_LINE_COLOR}
              strokeWidth={1}
            />
          );
        });
      })()}
      
      {/* Measure numbers - only render visible ones */}
      {(() => {
        const firstVisibleMeasure = Math.max(0, Math.floor(viewport.x / pixelsPerMeasure));
        const lastVisibleMeasure = Math.min(measureCount, Math.ceil((viewport.x + viewport.width) / pixelsPerMeasure));
        
        return Array.from({ length: lastVisibleMeasure - firstVisibleMeasure + 1 }, (_, idx) => {
          const measureIndex = firstVisibleMeasure + idx;
          const x = measureIndex * pixelsPerMeasure;
          return (
            <Text
              key={`measure-num-${measureIndex}`}
              x={x + 5}
              y={height / 2 - 6}
              text={`${measureIndex + 1}`}
              fontSize={14}
              fontFamily="Sen"
              fill={TEXT_COLOR_MAIN}
              verticalAlign="middle"
            />
          );
        });
      })()}
      
      {/* Beat numbers - only render visible ones */}
      {(() => {
        const firstVisibleMeasure = Math.max(0, Math.floor(viewport.x / pixelsPerMeasure));
        const lastVisibleMeasure = Math.min(measureCount, Math.ceil((viewport.x + viewport.width) / pixelsPerMeasure));
        
        return Array.from({ length: lastVisibleMeasure - firstVisibleMeasure + 1 }, (_, idx) => {
          const measureIndex = firstVisibleMeasure + idx;
          return Array.from({ length: beatsPerMeasure - 1 }).map((_, beatIndex) => {
            const x = measureIndex * pixelsPerMeasure + (beatIndex + 1) * pixelsPerBeat;
            return (
              <Text
                key={`beat-num-${measureIndex}-${beatIndex}`}
                x={x + 4}
                y={height / 2 - 4}
                text={`${beatIndex + 2}`}
                fontSize={7}
                fontFamily="Sen"
                fill={TEXT_COLOR_SECONDARY}
                verticalAlign="middle"
              />
            );
          });
        }).flat();
      })()}
    </Group>
  );
};

// Export memoized version to prevent unnecessary re-renders during drag
export default React.memo(TimeRuler);