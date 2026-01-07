import React, { useMemo, useState, useEffect } from 'react';
import { Group, Rect, Line } from 'react-konva';
import { CombinedTrack } from 'src/platform/types/project';
import { DrumTrackRead, SamplerTrackRead } from 'src/platform/types/dto/track_models/drum_track';
import { MUSIC_CONSTANTS } from '../../../../constants/musicConstants';
import { useStudioStore } from '../../../../stores/studioStore';
import DrumPatternPreview from '../components/DrumPatternPreview';
import { getVisibleTimeRange } from '../../../../utils/timelinePositioning';

export interface DrumTrackRendererProps {
  track: CombinedTrack;
  width: number;
  height: number;
  pixelsPerTick: number;
  contentOffset: number;
  color: string;
}

// Constants for pattern conversion
const PREVIEW_COLS = 64; // Show 4 bars (16 steps * 4)
const TICKS_PER_STEP = MUSIC_CONSTANTS.pulsesPerQuarterNote / 4; // 120 ticks per step

/**
 * Renders drum pattern visualization for drum tracks using DrumGridPreview.
 */
export const DrumTrackRenderer: React.FC<DrumTrackRendererProps> = ({
  track,
  width,
  height,
  pixelsPerTick,
  contentOffset,
  color
}) => {
  // Validate props
  if (isNaN(width) || width <= 0) {
    console.warn('DrumTrackRenderer: Invalid width', width);
    return null;
  }
  
  // State for live pattern from DrumMachine
  const [livePattern, setLivePattern] = useState<boolean[][] | null>(null);
  
  // Listen for drum pattern changes from DrumMachine
  useEffect(() => {
    const handlePatternChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ trackId: string; pattern: boolean[][] }>;
      if (customEvent.detail?.trackId === track.id && customEvent.detail.pattern) {
        setLivePattern(customEvent.detail.pattern);
      }
    };

    document.addEventListener('drumPatternChanged', handlePatternChange);
    
    // Request the drum machine to compute and send the pattern
    // This simulates what happens when clicking on the track
    setTimeout(() => {
      // Dispatch an event to request the pattern from any mounted DrumMachine
      document.dispatchEvent(new CustomEvent('requestDrumPattern', { 
        detail: { trackId: track.id } 
      }));
    }, 100);
    
    return () => document.removeEventListener('drumPatternChanged', handlePatternChange);
  }, [track.id]);

  // Get sampler tracks from drum track
  const samplerTracks = useMemo(() => {
    if (track.track_type === 'DRUM') {
      const drumTrack = track.track as DrumTrackRead;
      return drumTrack.sampler_tracks || [];
    }
    return [];
  }, [track]);
  
  // Subscribe to noteVersion to trigger re-renders when notes change
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _noteVersion = useStudioStore(state => state.noteVersion);

  // Get notes from Zustand store for all sampler tracks
  const getTrackNotes = useStudioStore(state => state.getTrackNotes);

  // Build notes map from Zustand store
  const allTrackNotes = useMemo(() => {
    const notesMap: { [trackId: string]: ReturnType<typeof getTrackNotes> } = {};
    samplerTracks.forEach(track => {
      notesMap[track.id] = getTrackNotes(track.id) || [];
    });
    return notesMap;
  }, [samplerTracks, getTrackNotes, _noteVersion]);

  // Compute pattern from live MIDI notes as fallback
  const fallbackPattern = useMemo(() => {
    if (samplerTracks.length === 0) return null;
    
    // Compute grid from live MIDI notes (same as DrumMachine)
    return samplerTracks.map((track) => {
      const gridRow = Array(PREVIEW_COLS).fill(false);
      const trackNotes = allTrackNotes[track.id] || [];
      
      trackNotes.forEach(note => {
        const column = Math.floor(note.column / TICKS_PER_STEP);
        if (column >= 0 && column < PREVIEW_COLS) {
          gridRow[column] = true;
        }
      });
      
      return gridRow;
    });
  }, [samplerTracks, allTrackNotes]);
  
  // Use live pattern if available, otherwise use empty fallback
  const displayPattern = livePattern || fallbackPattern;
  
  // Create empty pattern if no pattern is available
  const finalPattern = useMemo(() => {
    if (displayPattern && displayPattern.length > 0) {
      return displayPattern;
    }
    
    // Create empty pattern based on sampler tracks
    const numRows = samplerTracks.length || 1;
    return Array(numRows).fill(null).map(() => Array(PREVIEW_COLS).fill(false));
  }, [displayPattern, samplerTracks]);
  
  // Calculate visible time range for beat markers
  const visibleRange = useMemo(() => {
    return getVisibleTimeRange(width, contentOffset, pixelsPerTick);
  }, [width, contentOffset, pixelsPerTick]);
  
  return (
    <Group>
      {/* Background with border */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="rgba(0,0,0,0.2)"
        stroke={color}
        strokeWidth={1}
        cornerRadius={2}
      />
      
      {/* Drum pattern using timeline positioning */}
      <DrumPatternPreview
        pattern={finalPattern}
        width={width}
        height={height}
        pixelsPerTick={pixelsPerTick}
        contentOffset={contentOffset}
        ticksPerStep={TICKS_PER_STEP}
        color={color}
      />
      
      {/* Beat/measure grid lines using timeline positioning */}
      {Array.from({ length: Math.floor(PREVIEW_COLS / 4) + 1 }).map((_, i) => {
        const stepIndex = i * 4;
        const ticks = stepIndex * TICKS_PER_STEP;
        const x = (ticks * pixelsPerTick) + contentOffset;
        const isMeasure = i % 4 === 0;
        
        // Only render lines within visible bounds
        if (x < 0 || x > width) return null;
        
        return (
          <Line
            key={`beat-${i}`}
            points={[x, 2, x, height - 2]}
            stroke={color}
            strokeWidth={isMeasure ? 1 : 0.5}
            opacity={isMeasure ? 0.3 : 0.1}
          />
        );
      })}
    </Group>
  );
};

export default DrumTrackRenderer;