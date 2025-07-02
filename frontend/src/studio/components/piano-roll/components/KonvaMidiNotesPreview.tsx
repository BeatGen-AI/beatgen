import React, { useMemo } from 'react';
import { Group, Rect } from 'react-konva';
import { Note } from '../../../../types/note';

interface KonvaMidiNotesPreviewProps {
  notes: Note[];
  width: number;
  height: number;
  noteColor: string;
  pixelsPerTick: number;
  contentOffset: number;
  trackId?: string; // Add trackId for unique key generation
}

const KonvaMidiNotesPreview: React.FC<KonvaMidiNotesPreviewProps> = ({ 
  notes,
  width, 
  height,
  noteColor,
  pixelsPerTick,
  contentOffset,
  trackId = 'default'
}) => {
  // Memoize the random heights so they don't change on every render
  const randomHeights = useMemo(() => 
    Array.from({length: 12}).map(() => Math.random() * 12 + 4),
    [] // Empty dependency array means this only runs once when component mounts
  );

  // Validate props
  if (isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
    console.warn('KonvaMidiNotesPreview: Invalid dimensions', { width, height });
    return null;
  }
  
  // Calculate note range and positions
  const { minNoteRow, maxNoteRow, noteRange } = useMemo(() => {
    let min = 127;
    let max = 0;
    
    if (notes.length > 0) {
      notes.forEach(note => {
        if (note.row < min) min = note.row;
        if (note.row > max) max = note.row;
      });
    } else {
      // Default range if no notes
      min = 60; // Middle C
      max = 72; // One octave above middle C
    }
    
    // Ensure we have at least a small range for scaling
    if (max - min < 6) {
      const midPoint = Math.floor((max + min) / 2);
      min = midPoint - 3;
      max = midPoint + 3;
    }
    
    // Add some padding to the range
    min = Math.max(0, min - 2);
    max = Math.min(127, max + 2);
    
    const range = max - min + 1;
    
    return { minNoteRow: min, maxNoteRow: max, noteRange: range };
  }, [notes]);
  
  const noteHeightScale = height / noteRange; 

  // Calculate note rectangles
  const noteRects = useMemo(() => {
    return notes.map((note, index) => {
      // Calculate position with content offset for trimming
      const x = (note.column * pixelsPerTick) + contentOffset;
      // Calculate relative position in our range and invert Y (high notes at top)
      const relativePosition = maxNoteRow - note.row;
      const y = relativePosition * noteHeightScale;
      const noteWidth = note.length * pixelsPerTick;
      const noteHeight = noteHeightScale * 0.9; // Slight gap between notes
      
      return {
        key: `${trackId}-${`note-${index}-${note.column}-${note.row}`}`,
        x,
        y,
        width: Math.max(1, noteWidth), // Minimum 1 pixel width
        height: noteHeight,
        velocity: note.velocity || 0.8
      };
    });
  }, [notes, pixelsPerTick, contentOffset, maxNoteRow, noteHeightScale, trackId]);

  return (
    <Group>
      {/* Render notes */}
      {noteRects.map(note => {
        // Calculate opacity based on velocity
        const velocityOpacity = 0.7 + (note.velocity / 127) * 0.3;
        
        return (
          <Group key={note.key}>
            {/* Note shadow/glow effect */}
            <Rect
              x={note.x}
              y={note.y}
              width={note.width}
              height={note.height}
              fill={noteColor}
              opacity={velocityOpacity * 0.3}
              cornerRadius={2}
              shadowColor={noteColor}
              shadowBlur={3}
              shadowOpacity={0.2}
            />
            
            {/* Main note rectangle */}
            <Rect
              x={note.x}
              y={note.y}
              width={note.width}
              height={note.height}
              fill={noteColor}
              opacity={velocityOpacity}
              cornerRadius={2}
            />
          </Group>
        );
      })}
      
      {/* Empty state with random bars */}
      {notes.length === 0 && (
        <Group x={width / 2 - (randomHeights.length * 5) / 2} y={height / 2}>
          {randomHeights.map((barHeight, i) => (
            <Rect
              key={i}
              x={i * 5}
              y={-barHeight / 2}
              width={4}
              height={barHeight}
              fill={noteColor}
              opacity={0.6}
              cornerRadius={2}
            />
          ))}
        </Group>
      )}
    </Group>
  );
};

export default KonvaMidiNotesPreview;