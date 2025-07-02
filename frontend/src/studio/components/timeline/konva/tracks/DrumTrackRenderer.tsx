import React, { useMemo, useState, useEffect } from 'react';
import { Group, Rect, Line } from 'react-konva';
import { CombinedTrack } from 'src/platform/types/project';
import { DrumTrackRead, SamplerTrackRead } from 'src/platform/types/dto/track_models/drum_track';
import { MUSIC_CONSTANTS } from '../../../../constants/musicConstants';
import { useStudioStore } from '../../../../stores/studioStore';
import { Note } from '../../../../../types/note';

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
  
  // Get live MIDI notes from MidiManager
  const { store } = useStudioStore();
  const midiManager = store?.getMidiManager();
  const [allTrackNotes, setAllTrackNotes] = useState<{ [trackId: string]: Note[] }>({});
  
  // Subscribe to MIDI notes for all sampler tracks
  useEffect(() => {
    if (!midiManager || samplerTracks.length === 0) {
      setAllTrackNotes({});
      return;
    }
    
    const unsubscribers: (() => void)[] = [];
    const notesMap: { [trackId: string]: Note[] } = {};
    
    // Subscribe to each sampler track's notes
    samplerTracks.forEach(track => {
      const trackId = track.id;
      
      // Get initial notes
      const initialNotes = midiManager.getTrackNotes(trackId) || [];
      notesMap[trackId] = initialNotes;
      
      // Subscribe to updates
      const unsubscribe = midiManager.subscribeToTrack(trackId, (_, updatedNotes) => {
        setAllTrackNotes(prev => ({
          ...prev,
          [trackId]: updatedNotes
        }));
      });
      
      unsubscribers.push(unsubscribe);
    });
    
    setAllTrackNotes(notesMap);
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [midiManager, samplerTracks]);

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
  
  // Calculate grid dimensions
  const numRows = displayPattern?.length || samplerTracks.length || 1;
  const numCols = PREVIEW_COLS;
  const padding = 2; // Padding around the grid
  const gap = 1; // Gap between cells
  
  // Calculate cell dimensions accounting for gaps
  const totalGapWidth = (numCols - 1) * gap;
  const totalGapHeight = (numRows - 1) * gap;
  const cellWidth = (width - (2 * padding) - totalGapWidth) / numCols;
  const cellHeight = (height - (2 * padding) - totalGapHeight) / numRows;
  
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
      
      {/* Grid cells */}
      {(() => {
        // Use display pattern if available, otherwise create empty grid
        const gridPattern = displayPattern || [new Array(PREVIEW_COLS).fill(false)];
        
        return gridPattern.map((row, rowIndex) => 
          row.map((isActive, colIndex) => {
            const x = padding + colIndex * (cellWidth + gap);
            const y = padding + rowIndex * (cellHeight + gap);
            
            return (
              <React.Fragment key={`cell-${rowIndex}-${colIndex}`}>
                <Rect
                  x={x}
                  y={y}
                  width={cellWidth}
                  height={cellHeight}
                  fill={isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.05)'}
                  cornerRadius={1}
                />
                {/* Add glow effect for active cells */}
                {isActive && (
                  <Rect
                    x={x - 1}
                    y={y - 1}
                    width={cellWidth + 2}
                    height={cellHeight + 2}
                    fill="transparent"
                    stroke="rgba(255, 255, 255, 0.6)"
                    strokeWidth={0.5}
                    cornerRadius={1}
                    shadowColor="white"
                    shadowBlur={2}
                    shadowOpacity={0.4}
                  />
                )}
              </React.Fragment>
            );
          })
        );
      })()}
      
      {/* Beat/measure grid lines (optional - for better visibility) */}
      {Array.from({ length: Math.floor(numCols / 4) + 1 }).map((_, i) => {
        const x = padding + i * 4 * (cellWidth + gap);
        const isMeasure = i % 4 === 0;
        
        if (x > width - padding) return null; // Don't draw lines outside bounds
        
        return (
          <Line
            key={`beat-${i}`}
            points={[x, padding, x, height - padding]}
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