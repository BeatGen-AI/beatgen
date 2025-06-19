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
          fill={isDark ? '#262626' : '#f5f5f5'}
          onClick={handleClick}
          listening={true}
        />
      
      {/* Draw subdivisions first (dimmest) */}
      {Array.from({ length: measureCount }).map((_, m) => {
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
      }).flat()}
      
      {/* Draw beat lines (medium prominence) */}
      {Array.from({ length: measureCount }).map((_, m) => {
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
      }).flat()}
      
      {/* Draw measure lines (most prominent) */}
      {Array.from({ length: measureCount + 1 }).map((_, i) => {
        const x = i * pixelsPerMeasure;
        return (
          <Line
            key={`measure-${i}`}
            points={[x, 0, x, height]}
            stroke={MEASURE_LINE_COLOR}
            strokeWidth={1}
          />
        );
      })}
      
      {/* Measure numbers */}
      {Array.from({ length: measureCount }).map((_, measureIndex) => {
        const x = measureIndex * pixelsPerMeasure;
        return (
          <Text
            key={`measure-num-${measureIndex}`}
            x={x + 5}
            y={height / 2 - 7}
            text={`${measureIndex + 1}`}
            fontSize={14}
            fontFamily="Arial"
            fill={isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)'}
          />
        );
      })}
      
      {/* Beat numbers */}
      {Array.from({ length: measureCount }).map((_, measureIndex) => {
        return Array.from({ length: beatsPerMeasure - 1 }).map((_, beatIndex) => {
          const x = measureIndex * pixelsPerMeasure + (beatIndex + 1) * pixelsPerBeat;
          return (
            <Text
              key={`beat-num-${measureIndex}-${beatIndex}`}
              x={x + 4}
              y={height / 2 + 2}
              text={`${beatIndex + 2}`}
              fontSize={8}
              fontFamily="Arial"
              fill={isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'}
            />
          );
        });
      }).flat()}
      </Group>
    </Layer>
  );
};

// Export memoized version to prevent unnecessary re-renders during drag
export default React.memo(TimeRuler);