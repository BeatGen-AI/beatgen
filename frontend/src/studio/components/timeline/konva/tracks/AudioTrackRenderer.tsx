import React, { useMemo } from 'react';
import { Group, Line, Rect } from 'react-konva';
import { CombinedTrack } from 'src/platform/types/project';

export interface AudioTrackRendererProps {
  track: CombinedTrack;
  width: number;
  height: number;
  pixelsPerTick: number;
  contentOffset: number;
  color: string;
}

/**
 * Renders audio waveform visualization for audio tracks.
 */
export const AudioTrackRenderer: React.FC<AudioTrackRendererProps> = ({
  track,
  width,
  height,
  pixelsPerTick,
  contentOffset,
  color
}) => {
  // Validate props
  if (isNaN(width) || width <= 0) {
    console.warn('AudioTrackRenderer: Invalid width', width);
    return null;
  }
  
  // Generate mock waveform data (in real app, this would come from audio analysis)
  const waveformData = useMemo(() => {
    const points: number[] = [];
    const samples = Math.floor(width / 2); // Sample every 2 pixels
    const centerY = height / 2;
    const maxAmplitude = height * 0.4; // 80% of height for waveform
    
    // Generate a more realistic waveform pattern
    for (let i = 0; i < samples; i++) {
      const x = i * 2;
      
      // Create varying amplitude based on position
      const progress = i / samples;
      let amplitude = maxAmplitude;
      
      // Fade in at start
      if (progress < 0.1) {
        amplitude *= progress * 10;
      }
      // Fade out at end
      else if (progress > 0.9) {
        amplitude *= (1 - progress) * 10;
      }
      // Add some variation in the middle
      else {
        const variation = Math.sin(progress * Math.PI * 8) * 0.3 + 0.7;
        amplitude *= variation;
      }
      
      // Add some randomness for realism
      const randomFactor = 0.8 + Math.random() * 0.4;
      amplitude *= randomFactor;
      
      // Upper waveform
      points.push(x, centerY - amplitude);
      
      // Lower waveform (mirror)
      points.push(x, centerY + amplitude);
    }
    
    return points;
  }, [width, height]);
  
  // Split points into upper and lower waveforms
  const upperPoints = [];
  const lowerPoints = [];
  
  for (let i = 0; i < waveformData.length; i += 4) {
    upperPoints.push(waveformData[i], waveformData[i + 1]);
    lowerPoints.push(waveformData[i + 2], waveformData[i + 3]);
  }
  
  return (
    <Group>
      {/* Waveform background */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={`${color}20`}
      />
      
      {/* Center line */}
      <Line
        points={[0, height / 2, width, height / 2]}
        stroke={`${color}40`}
        strokeWidth={1}
      />
      
      {/* Upper waveform */}
      <Line
        points={upperPoints}
        stroke={color}
        strokeWidth={1.5}
        lineJoin="round"
        lineCap="round"
        opacity={0.8}
      />
      
      {/* Lower waveform */}
      <Line
        points={lowerPoints}
        stroke={color}
        strokeWidth={1.5}
        lineJoin="round"
        lineCap="round"
        opacity={0.8}
      />
      
      {/* Add some visual markers for beats (optional) */}
      {Array.from({ length: Math.floor(width / (pixelsPerTick * 480)) }).map((_, i) => {
        const x = i * pixelsPerTick * 480; // Every beat
        return (
          <Line
            key={i}
            points={[x, 0, x, height]}
            stroke={`${color}20`}
            strokeWidth={1}
            dash={[2, 4]}
          />
        );
      })}
    </Group>
  );
};

export default AudioTrackRenderer;