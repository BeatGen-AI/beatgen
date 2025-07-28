import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useAppTheme } from '../../../lib/theme-provider';
import { cn } from '../../../lib/utils';

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
    const { studioMode } = useAppTheme();
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
      if (isPlaying) {
        // If internally playing, and initialTime (from prop, global time) has changed
        // significantly, it means there was a seek. We need to restart our internal timer from this new point.
        // A threshold (e.g., 100ms) prevents reacting to minor jitter if initialTime updates very frequently
        // for reasons other than a major seek.
        if (initialTime !== undefined && Math.abs(currentTime - initialTime) > 0.1) {
          // Stop current interval
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          // Update internal current time to the new global time
          setCurrentTime(initialTime);
          // Reset timer references as if play was just pressed at this new global time
          playWallClockStartTimeRef.current = Date.now();
          timeAtPlayPressRef.current = initialTime;
          // Restart interval
          intervalRef.current = setInterval(() => {
            const elapsedMilliseconds = Date.now() - playWallClockStartTimeRef.current;
            // Ensure the setCurrentTime here references the correct, updated timeAtPlayPressRef
            // This might be an issue if timeAtPlayPressRef is not stable in the closure.
            // Let's ensure we use the ref's current value inside setInterval.
            setCurrentTime(timeAtPlayPressRef.current + elapsedMilliseconds / 1000);
          }, 50);
        }
        // If initialTime hasn't significantly changed, our current running interval is fine.
      } else {
        // If not internally playing, our display should directly reflect initialTime.
        // This handles initial mount, and seeks that occur while TimeDisplay is paused.
        if (initialTime !== undefined && currentTime !== initialTime) {
          setCurrentTime(initialTime);
        }
      }
      // This effect reacts to changes in the global time (initialTime) or
      // when the internal play/pause state of this component changes.
      // currentTime is intentionally omitted from deps to prevent loops, as this effect sets it.
      // The Math.abs(currentTime - initialTime) check uses the current state value of currentTime.
    }, [initialTime, isPlaying]);

    // Cleanup effect to clear interval on component unmount
    useEffect(() => {
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }, []);

    return (
      <div
        className="flex items-center justify-center w-20 min-w-[90px] px-2 py-1 rounded-md font-mono text-sm"
        style={{
          backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
          border: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
          color: studioMode === 'dark' ? '#ffffff' : '#000000'
        }}
      >
        {formatTime(currentTime)}
      </div>
    );
  }
);

TimeDisplay.displayName = 'TimeDisplay'; // For better debugging in React DevTools 