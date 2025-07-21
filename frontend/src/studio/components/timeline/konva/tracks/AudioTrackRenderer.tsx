import React, { useMemo, useEffect, useState } from 'react';
import { Group, Line, Rect, Shape } from 'react-konva';
import { CombinedTrack } from 'src/platform/types/project';
import { analyzeAudioFileHighRes, getAudioStorageKey, getAudioDuration, AudioAnalysisResult } from '../../../../utils/audioAnalysis';

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
  const [highResAnalysis, setHighResAnalysis] = useState<AudioAnalysisResult | null>(null);
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
  
  // Calculate the actual width based on audio duration, BPM and pixelsPerTick
  // For timeline tracks, we want the waveform to represent the actual duration
  const actualWidth = useMemo(() => {
    if (audioDuration > 0) {
      // Convert duration to ticks using actual project BPM
      const ticksPerSecond = 480 * bpm / 60; // 480 ticks per beat, using project BPM
      const durationTicks = audioDuration * ticksPerSecond;
      return durationTicks * pixelsPerTick; // Use pure calculated width (no Math.max)
    }
    return width;
  }, [audioDuration, pixelsPerTick, bpm]);

  // Load high-resolution waveform data once
  useEffect(() => {
    const loadHighResWaveform = async () => {
      if (!audioStorageKey) {
        setError('No audio storage key available');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        // Load high-resolution analysis data (cached per audio file)
        const analysisResult = await analyzeAudioFileHighRes(audioStorageKey);
        
        setHighResAnalysis(analysisResult);
      } catch (err) {
        console.error('AudioTrackRenderer: Failed to load high-res waveform:', err);
        setError(err instanceof Error ? err.message : 'Failed to load waveform');
      } finally {
        setIsLoading(false);
      }
    };

    loadHighResWaveform();
  }, [audioStorageKey]); // Only re-analyze when audio file changes, not on zoom

  // Generate adaptive waveform points that fill the entire actualWidth
  const waveformData = useMemo(() => {
    const points: number[] = [];
    const centerY = height / 2;
    const maxAmplitude = height * 0.4; // 80% of height for waveform
    
    if (highResAnalysis && highResAnalysis.waveformData.length > 0) {
      const highResData = highResAnalysis.waveformData;
      
      // Calculate how many pixels we want to render (target around 1-2 pixels per data point for smooth curves)
      const targetPoints = Math.max(Math.floor(actualWidth / 2), 1);
      
      // Calculate how many high-res samples to average per target point
      const samplesPerPoint = highResData.length / targetPoints;
      
      console.log('AudioTrackRenderer: Adaptive sampling', {
        actualWidth,
        targetPoints,
        highResDataLength: highResData.length,
        samplesPerPoint
      });
      
      // Generate waveform points by sampling from high-res data
      for (let i = 0; i < targetPoints; i++) {
        const x = (i * actualWidth) / targetPoints; // Spread points across actualWidth
        
        // Calculate which high-res samples to average for this point
        const startSample = Math.floor(i * samplesPerPoint);
        const endSample = Math.min(Math.floor((i + 1) * samplesPerPoint), highResData.length);
        
        // Average the samples in this range
        let sum = 0;
        let count = 0;
        for (let j = startSample; j < endSample; j++) {
          sum += highResData[j];
          count++;
        }
        
        const averageAmplitude = count > 0 ? sum / count : 0;
        const amplitude = averageAmplitude * maxAmplitude;
        
        // Upper waveform
        points.push(x, centerY - amplitude);
        
        // Lower waveform (mirror)
        points.push(x, centerY + amplitude);
      }
    }
    
    return points;
  }, [highResAnalysis, height, actualWidth]);
  
  // Split points into upper and lower waveforms
  const upperPoints = [];
  const lowerPoints = [];
  
  for (let i = 0; i < waveformData.length; i += 4) {
    upperPoints.push(waveformData[i], waveformData[i + 1]);
    lowerPoints.push(waveformData[i + 2], waveformData[i + 3]);
  }
  
  return (
    <Group>
      {/* Container elements - use container width for backgrounds/clipping */}
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
      
      {/* Loading indicator */}
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
      
      {/* Error state */}
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
      
      {/* Content elements - use contentOffset for translation (like MIDI) */}
      <Group x={contentOffset} y={0}>
        {/* Only render waveform if we have high-res data */}
        {highResAnalysis && highResAnalysis.waveformData.length > 0 && (
          <>
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
          </>
        )}
        
        {/* Beat markers */}
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