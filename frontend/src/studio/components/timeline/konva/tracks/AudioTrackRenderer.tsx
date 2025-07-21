import React, { useMemo, useEffect, useState } from 'react';
import { Group, Line, Rect, Shape } from 'react-konva';
import { CombinedTrack } from 'src/platform/types/project';
import { analyzeAudioFile, getAudioStorageKey, getAudioDuration } from '../../../../utils/audioAnalysis';

export interface AudioTrackRendererProps {
  track: CombinedTrack;
  width: number;
  height: number;
  pixelsPerTick: number;
  contentOffset: number;
  color: string;
  bpm: number;
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
  color,
  bpm
}) => {
  const [realWaveformData, setRealWaveformData] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Validate props
  if (isNaN(width) || width <= 0) {
    console.warn('AudioTrackRenderer: Invalid width', width);
    return null;
  }
  
  // Get audio storage key and duration from track
  const audioStorageKey = getAudioStorageKey(track);
  const audioDuration = getAudioDuration(track);
  
  // Calculate the actual width based on audio duration and pixelsPerTick
  // For timeline tracks, we want the waveform to represent the actual duration
  const actualWidth = useMemo(() => {
    if (audioDuration > 0) {
      // Convert duration to ticks using actual project BPM
      const ticksPerSecond = 480 * bpm / 60; // 480 ticks per beat, using project BPM
      const durationTicks = audioDuration * ticksPerSecond;
      const calculatedWidth = durationTicks * pixelsPerTick;
      console.log(`🎵 AudioTrackRenderer width calculation:`, {
        audioDuration,
        bpm,
        ticksPerSecond,
        durationTicks,
        pixelsPerTick,
        calculatedWidth,
        inputWidth: width,
        finalWidth: Math.max(calculatedWidth, width)
      });
      return Math.max(calculatedWidth, width);
    }
    return width;
  }, [audioDuration, pixelsPerTick, width, bpm]);

  // Load real waveform data
  useEffect(() => {
    const loadWaveform = async () => {
      if (!audioStorageKey) {
        setError('No audio storage key available');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        // Calculate number of bars based on actual width
        const barCount = Math.floor(actualWidth / 2); // One bar every 2 pixels
        const waveformData = await analyzeAudioFile(audioStorageKey, barCount);
        
        setRealWaveformData(waveformData);
      } catch (err) {
        console.error('AudioTrackRenderer: Failed to load waveform:', err);
        setError(err instanceof Error ? err.message : 'Failed to load waveform');
      } finally {
        setIsLoading(false);
      }
    };

    loadWaveform();
  }, [audioStorageKey, actualWidth]);

  // Generate waveform points from real data only
  const waveformData = useMemo(() => {
    const points: number[] = [];
    const centerY = height / 2;
    const maxAmplitude = height * 0.4; // 80% of height for waveform
    
    if (realWaveformData.length > 0) {
      // Use real waveform data
      for (let i = 0; i < realWaveformData.length; i++) {
        const x = i * 2; // 2 pixels per bar
        const amplitude = realWaveformData[i] * maxAmplitude;
        
        // Upper waveform
        points.push(x, centerY - amplitude);
        
        // Lower waveform (mirror)
        points.push(x, centerY + amplitude);
      }
    }
    
    return points;
  }, [realWaveformData, height]);
  
  // Split points into upper and lower waveforms
  const upperPoints = [];
  const lowerPoints = [];
  
  for (let i = 0; i < waveformData.length; i += 4) {
    upperPoints.push(waveformData[i], waveformData[i + 1]);
    lowerPoints.push(waveformData[i + 2], waveformData[i + 3]);
  }
  
  return (
    <Group>
      {/* Waveform background - use container width, not content width */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={`${color}20`}
      />
      
      {/* Center line - use container width */}
      <Line
        points={[0, height / 2, width, height / 2]}
        stroke={`${color}40`}
        strokeWidth={1}
      />
      
      {/* Loading indicator - use container width */}
      {isLoading && (
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={`${color}10`}
          opacity={0.5}
        />
      )}
      
      {/* Error state - use container width */}
      {error && (
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={`${color}15`}
          opacity={0.3}
        />
      )}
      
      {/* Only render waveform if we have real data - use Group with translation */}
      {realWaveformData.length > 0 && (
        <Group x={contentOffset} y={0}>
          {/* Filled waveform area */}
          <Shape
            sceneFunc={(context, shape) => {
              context.beginPath();
              
              // Draw upper waveform
              for (let i = 0; i < upperPoints.length; i += 2) {
                const x = upperPoints[i];
                const y = upperPoints[i + 1];
                if (i === 0) {
                  context.moveTo(x, y);
                } else {
                  context.lineTo(x, y);
                }
              }
              
              // Draw lower waveform (in reverse to close the path)
              for (let i = lowerPoints.length - 2; i >= 0; i -= 2) {
                const x = lowerPoints[i];
                const y = lowerPoints[i + 1];
                context.lineTo(x, y);
              }
              
              context.closePath();
              context.fillStrokeShape(shape);
            }}
            fill="white"
            opacity={0.3}
          />
          
          {/* Upper waveform outline */}
          <Line
            points={upperPoints}
            stroke="white"
            strokeWidth={2}
            lineJoin="round"
            lineCap="round"
            opacity={0.95}
          />
          
          {/* Lower waveform outline */}
          <Line
            points={lowerPoints}
            stroke="white"
            strokeWidth={2}
            lineJoin="round"
            lineCap="round"
            opacity={0.95}
          />
        </Group>
      )}
      
      {/* Beat markers - use Group with translation like the waveform */}
      <Group x={contentOffset} y={0}>
        {Array.from({ length: Math.floor(actualWidth / (pixelsPerTick * 480)) }).map((_, i) => {
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
    </Group>
  );
};

export default AudioTrackRenderer;