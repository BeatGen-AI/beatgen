import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react';
import { Group, Line, Rect, Text, Path } from 'react-konva';
import { MUSIC_CONSTANTS } from '../../../constants/musicConstants';
import { GRID_CONSTANTS } from '../../../constants/gridConstants';
import Konva from 'konva';

export interface PlaybackCursorProps {
  currentTime: number;
  isPlaying: boolean;
  height: number;
  pixelsPerTick: number;
  bpm: number;
  timeSignature: [number, number];
}

export interface PlaybackCursorRef {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
}

/**
 * Playback cursor that shows the current playback position.
 * Includes smooth animation during playback.
 */
export const PlaybackCursor = forwardRef<PlaybackCursorRef, PlaybackCursorProps>(({
  currentTime,
  isPlaying,
  height,
  pixelsPerTick,
  bpm,
  timeSignature
}, ref) => {
  const [localTime, setLocalTime] = useState(currentTime);
  const animationRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(Date.now());
  const groupRef = useRef<Konva.Group>(null);
  
  // Convert time to x position
  const timeToX = (time: number): number => {
    const ticksPerSecond = (bpm * MUSIC_CONSTANTS.pulsesPerQuarterNote) / 60;
    const ticks = time * ticksPerSecond;
    return ticks * pixelsPerTick;
  };
  
  // Animation loop for smooth playback
  useEffect(() => {
    if (isPlaying) {
      const animate = () => {
        const now = Date.now();
        const delta = (now - lastUpdateRef.current) / 1000; // Convert to seconds
        lastUpdateRef.current = now;
        
        setLocalTime(prev => prev + delta);
        animationRef.current = requestAnimationFrame(animate);
      };
      
      lastUpdateRef.current = Date.now();
      animationRef.current = requestAnimationFrame(animate);
      
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    } else {
      // Reset local time to match external time when not playing
      setLocalTime(currentTime);
    }
  }, [isPlaying]);
  
  // Sync with external time changes
  useEffect(() => {
    if (!isPlaying) {
      setLocalTime(currentTime);
    }
  }, [currentTime, isPlaying]);
  
  // Calculate position
  const x = timeToX(isPlaying ? localTime : currentTime);
  
  // Imperative API
  useImperativeHandle(ref, () => ({
    play: () => {
      setLocalTime(currentTime);
      lastUpdateRef.current = Date.now();
    },
    pause: () => {
      // Animation will stop via the isPlaying effect
    },
    stop: () => {
      setLocalTime(0);
    },
    seek: (time: number) => {
      setLocalTime(time);
    }
  }), [currentTime]);
  
  // Determine color based on playing state
  const cursorColor = isPlaying ? GRID_CONSTANTS.cursorColor : GRID_CONSTANTS.cursorColorInactive;
  
  return (
    <Group ref={groupRef} listening={false}>
      {/* Shadow/glow effect when playing */}
      {isPlaying && (
        <Line
          points={[x, 0, x, height]}
          stroke={GRID_CONSTANTS.cursorColor}
          strokeWidth={16}
          opacity={0.15}
          listening={false}
        />
      )}
      
      {/* Main cursor line */}
      <Line
        points={[x, 0, x, height]}
        stroke={cursorColor}
        strokeWidth={2}
      />
      
      {/* Triangle handle at top of ruler */}
      <Path
        data={`M ${x - 5} 0 L ${x + 5} 0 L ${x} 8 Z`}
        fill={cursorColor}
      />
    </Group>
  );
});

PlaybackCursor.displayName = 'PlaybackCursor';

export default PlaybackCursor;