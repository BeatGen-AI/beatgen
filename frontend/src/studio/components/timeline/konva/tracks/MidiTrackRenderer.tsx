import React, { useMemo } from 'react';
import { Group, Rect, Line } from 'react-konva';
import { CombinedTrack } from 'src/platform/types/project';
import { MidiTrackRead } from 'src/platform/types/dto/track_models/midi_track';
import { SamplerTrackRead } from 'src/platform/types/dto/track_models/sampler_track';

export interface MidiTrackRendererProps {
  track: CombinedTrack;
  width: number;
  height: number;
  pixelsPerTick: number;
  contentOffset: number;
  color: string;
}

// Memoized note component for better performance
const MidiNote = React.memo<{ note: any; }>(({ note }) => {
  return (
    <Group key={note.id}>
      <Rect
        x={note.x}
        y={note.y}
        width={note.width}
        height={note.height}
        fill="white"
        opacity={1}
        cornerRadius={2}
        shadowColor="white"
        shadowBlur={3}
        shadowOpacity={0.2}
      />
    </Group>
  );
}, (prev, next) => {
  // Only re-render if the note data actually changed
  return (
    prev.note.id === next.note.id &&
    prev.note.x === next.note.x &&
    prev.note.y === next.note.y &&
    prev.note.width === next.note.width &&
    prev.note.height === next.note.height
  );
});

MidiNote.displayName = 'MidiNote';

// Memoized placeholder bars component
const PlaceholderBars = React.memo<{ width: number; height: number; color: string }>(
  ({ width, height, color }) => {
    // Generate random heights once and memoize them
    const barHeights = React.useMemo(() => 
      Array.from({ length: 12 }, () => Math.random() * 12 + 4),
      [] // Empty deps means these heights are generated once per mount
    );
    
    return (
      <Group>
        {barHeights.map((randomHeight, i) => {
          const x = (width / 12) * i + (width / 24);
          const barWidth = 4;
          return (
            <Rect
              key={i}
              x={x - barWidth / 2}
              y={(height - randomHeight) / 2}
              width={barWidth}
              height={randomHeight}
              fill={color}
              opacity={0.6}
              cornerRadius={2}
            />
          );
        })}
      </Group>
    );
  }
);

PlaceholderBars.displayName = 'PlaceholderBars';

/**
 * Renders MIDI note preview for MIDI and Sampler tracks.
 */
export const MidiTrackRenderer: React.FC<MidiTrackRendererProps> = ({
  track,
  width,
  height,
  pixelsPerTick,
  contentOffset,
  color
}) => {
  // Validate props
  if (isNaN(width) || width <= 0) {
    console.warn('MidiTrackRenderer: Invalid width', width);
    return null;
  }
  
  // Get MIDI notes from track
  const midiNotes = useMemo(() => {
    if (track.track_type === 'MIDI') {
      const midiTrack = track.track as MidiTrackRead;
      if (midiTrack?.midi_notes_json?.notes) {
        return midiTrack.midi_notes_json.notes as Array<any>;
      }
    } else if (track.track_type === 'SAMPLER') {
      const samplerTrack = track.track as SamplerTrackRead;
      if (samplerTrack?.midi_notes_json?.notes) {
        return samplerTrack.midi_notes_json.notes as Array<any>;
      }
    }
    return [];
  }, [track.track_type, track.track]);
  
  // Calculate note range for better scaling (same logic as MidiNotesPreview)
  const { minNoteRow, maxNoteRow, noteRange } = useMemo(() => {
    let minRow = 127;
    let maxRow = 0;
    
    if (midiNotes.length > 0) {
      midiNotes.forEach(note => {
        if (note.row < minRow) minRow = note.row;
        if (note.row > maxRow) maxRow = note.row;
      });
    } else {
      // Default range if no notes
      minRow = 60; // Middle C
      maxRow = 72; // One octave above middle C
    }
    
    // Ensure we have at least a small range for scaling
    if (maxRow - minRow < 6) {
      const midPoint = Math.floor((maxRow + minRow) / 2);
      minRow = midPoint - 3;
      maxRow = midPoint + 3;
    }
    
    // Add some padding to the range
    minRow = Math.max(0, minRow - 2);
    maxRow = Math.min(127, maxRow + 2);
    
    return {
      minNoteRow: minRow,
      maxNoteRow: maxRow,
      noteRange: maxRow - minRow + 1
    };
  }, [midiNotes]);
  
  // Calculate note positions and dimensions
  const noteRects = useMemo(() => {
    // Validate inputs
    if (isNaN(pixelsPerTick) || pixelsPerTick <= 0 || isNaN(height) || height <= 0) {
      return [];
    }
    
    const noteHeightScale = height / noteRange;
    const noteHeight = noteHeightScale * 0.9; // Slight gap between notes
    
    const rects = [];
    for (let i = 0; i < midiNotes.length; i++) {
      const note = midiNotes[i];
      const x = note.column * pixelsPerTick;
      // Calculate relative position in our range and invert Y (high notes at top)
      const relativePosition = maxNoteRow - note.row;
      const y = relativePosition * noteHeightScale;
      const width = note.length * pixelsPerTick;
      
      // Skip invalid notes
      if (isNaN(x) || isNaN(y) || isNaN(width)) {
        continue;
      }
      
      rects.push({
        id: note.id,
        x: x, // Don't scale for timeline
        y: y, // Don't scale for timeline
        width: Math.max(1, width), // Minimum 1 pixel width
        height: noteHeight, // Don't scale for timeline
        velocity: note.velocity || 100
      });
    }
    
    return rects;
  }, [midiNotes, pixelsPerTick, height, noteRange, maxNoteRow, minNoteRow]);
  
  // Group notes by time for chord visualization
  const chordLines = useMemo(() => {
    const lines: { x: number; notes: number }[] = [];
    const threshold = 10; // Group notes within 10 ticks
    
    noteRects.forEach(note => {
      const existingLine = lines.find(line => Math.abs(line.x - note.x) < threshold * pixelsPerTick);
      if (existingLine) {
        existingLine.notes++;
      } else {
        lines.push({ x: note.x, notes: 1 });
      }
    });
    
    return lines.filter(line => line.notes > 1);
  }, [noteRects, pixelsPerTick]);
  
  return (
    <Group>
      {/* Track background - removed gradient for cleaner look */}
      
      {/* MIDI notes */}
      {noteRects.map(note => (
        <MidiNote key={note.id} note={note} />
      ))}
      
      {/* Show placeholder bars when no notes */}
      {midiNotes.length === 0 && (
        <PlaceholderBars width={width} height={height} color={color} />
      )}
    </Group>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default React.memo(MidiTrackRenderer, (prevProps, nextProps) => {
  // Quick checks for common changes during drag
  if (
    prevProps.width !== nextProps.width ||
    prevProps.height !== nextProps.height ||
    prevProps.pixelsPerTick !== nextProps.pixelsPerTick ||
    prevProps.color !== nextProps.color
  ) {
    return false;
  }
  
  // Check if track reference changed
  if (prevProps.track !== nextProps.track) {
    // Check if the actual notes data changed
    const prevNotes = prevProps.track.track?.midi_notes_json?.notes;
    const nextNotes = nextProps.track.track?.midi_notes_json?.notes;
    
    // Quick length check
    if (prevNotes?.length !== nextNotes?.length) {
      return false;
    }
    
    // If track ID or type changed, re-render
    if (prevProps.track.id !== nextProps.track.id ||
        prevProps.track.track_type !== nextProps.track.track_type) {
      return false;
    }
  }
  
  return true;
});