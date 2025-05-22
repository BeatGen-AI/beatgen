import { Box, useTheme } from '@mui/material';
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

export interface TimeDisplayHandle {
  play: () => void;
  pause: () => void;
  reset: (newInitialTime?: number) => void;
}

interface TimeDisplayProps {
  initialTime?: number; // Changed from currentTime, made optional with default
}

export const TimeDisplay = forwardRef<TimeDisplayHandle, TimeDisplayProps>(
  ({ initialTime = 0 }: TimeDisplayProps, ref) => {
    const theme = useTheme();
    const [currentTime, setCurrentTime] = useState(initialTime);
    const [isPlaying, setIsPlaying] = useState(false);

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    // Stores the system time (Date.now()) when play was last pressed
    const playWallClockStartTimeRef = useRef<number>(0);
    // Stores the value of 'currentTime' state when play was last pressed
    const timeAtPlayPressRef = useRef<number>(0);

    const formatTime = (timeInSeconds: number) => {
      const minutes = Math.floor(timeInSeconds / 60);
      const seconds = Math.floor(timeInSeconds % 60);
      const milliseconds = Math.floor((timeInSeconds * 100) % 100); // Centiseconds
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    };

    const play = () => {
      if (isPlaying) return;

      setIsPlaying(true);
      playWallClockStartTimeRef.current = Date.now();
      timeAtPlayPressRef.current = currentTime; // Capture the time from which we are resuming/starting

      if (intervalRef.current) {
        clearInterval(intervalRef.current); // Clear any existing interval (safety)
      }

      intervalRef.current = setInterval(() => {
        const elapsedMilliseconds = Date.now() - playWallClockStartTimeRef.current;
        setCurrentTime(timeAtPlayPressRef.current + elapsedMilliseconds / 1000);
      }, 50); // Update interval (e.g., every 50ms for smooth visual update)
    };

    const pause = () => {
      if (!isPlaying) return;
      setIsPlaying(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // currentTime state already holds the paused time
    };

    const reset = (newInitialTime?: number) => {
      pause(); // Stop playback
      const resetToTime = newInitialTime !== undefined ? newInitialTime : initialTime;
      setCurrentTime(resetToTime);
      // timeAtPlayPressRef will be updated correctly by the next 'play' call
    };

    useImperativeHandle(ref, () => ({
      play,
      pause,
      reset,
    }));

    // Effect to update currentTime if initialTime prop changes AND the timer isn't playing
    useEffect(() => {
      if (!isPlaying) {
        setCurrentTime(initialTime);
      }
    }, [initialTime]);

    // Cleanup effect to clear interval on component unmount
    useEffect(() => {
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }, []);

    return (
      <Box sx={{
        color: 'text.primary',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '80px', // Adjusted width to better fit "00:00.00"
        minWidth: '90px', // Ensure enough space
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
        padding: '4px 8px',
        borderRadius: '6px',
        border: `1px solid ${theme.palette.divider}`,
        fontFamily: 'monospace',
        fontSize: '0.9rem', // Slightly adjust font size if needed
      }}>
        {formatTime(currentTime)}
      </Box>
    );
  }
);

TimeDisplay.displayName = 'TimeDisplay'; // For better debugging in React DevTools 