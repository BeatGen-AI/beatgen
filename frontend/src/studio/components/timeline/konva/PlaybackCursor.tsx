import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import { MUSIC_CONSTANTS } from '../../../constants/musicConstants';
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
  
  return (
    <Group ref={groupRef} listening={false}>
      {/* Cursor line */}
      <Line
        points={[x, 0, x, height]}
        stroke="#ff0000"
        strokeWidth={2}
        shadowColor="#ff0000"
        shadowBlur={isPlaying ? 10 : 5}
        shadowOpacity={isPlaying ? 0.8 : 0.5}
      />
      
      {/* Cursor head */}
      <Rect
        x={x - 6}
        y={0}
        width={12}
        height={20}
        fill="#ff0000"
        cornerRadius={[0, 0, 6, 6]}
      />
      
      {/* Time display (optional)
      {!isPlaying && (
        <Group>
          <Rect
            x={x + 5}
            y={5}
            width={60}
            height={20}
            fill="rgba(0, 0, 0, 0.8)"
            cornerRadius={3}
          />
          <Text
            x={x + 10}
            y={8}
            text={`${Math.floor(currentTime / 60)}:${(currentTime % 60).toFixed(1).padStart(4, '0')}`}
            fontSize={12}
            fontFamily="monospace"
            fill="white"
          />
        </Group>
      )} */}
      
      {/* Glow effect when playing */}
      {isPlaying && (
        <Line
          points={[x, 0, x, height]}
          stroke="#ff0000"
          strokeWidth={4}
          opacity={0.3}
          listening={false}
        />
      )}
    </Group>
  );
});

PlaybackCursor.displayName = 'PlaybackCursor';

export default PlaybackCursor;