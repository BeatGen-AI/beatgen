import React, { useMemo } from 'react';
import { Group, Rect, Line } from 'react-konva';
import { CombinedTrack } from 'src/platform/types/project';
import { MidiTrackRead } from 'src/platform/types/dto/track_models/midi_track';
import { SamplerTrackRead } from 'src/platform/types/dto/track_models/sampler_track';
import { Note } from 'src/types/note';
import KonvaMidiNotesPreview from '../../../piano-roll/components/KonvaMidiNotesPreview';
import { useTrackNotes } from '../../../../hooks/useTrackNotes';

export interface MidiTrackRendererProps {
  track: CombinedTrack;
  width: number;
  height: number;
  pixelsPerTick: number;
  contentOffset: number;
  color: string;
}

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
  
  // Get live notes from MidiManager
  const { notes: liveNotes, hasTrack } = useTrackNotes(track.id);
  
  // Get static notes from track data as fallback
  const staticNotes = useMemo(() => {
    let rawNotes: Array<any> = [];
    
    if (track.track_type === 'MIDI') {
      const midiTrack = track.track as MidiTrackRead;
      if (midiTrack.midi_notes_json?.notes) {
        rawNotes = midiTrack.midi_notes_json.notes as Array<any>;
      }
    } else if (track.track_type === 'SAMPLER') {
      const samplerTrack = track.track as SamplerTrackRead;
      if (samplerTrack.midi_notes_json?.notes) {
        rawNotes = samplerTrack.midi_notes_json.notes as Array<any>;
      }
    }
    
    // Convert to Note format
    return rawNotes.map((note, index): Note => ({
      id: note.id ?? index,
      row: note.row ?? note.pitch ?? 0,
      column: note.column ?? note.start ?? 0,
      length: note.length ?? note.duration ?? 1,
      velocity: note.velocity ?? 0.8
    }));
  }, [track]);
  
  // Use live notes if track exists in MidiManager, otherwise fall back to static data
  const notes = useMemo(() => {
    // If track exists in MidiManager, use live notes (even if empty)
    if (hasTrack) {
      return liveNotes;
    }
    
    // Otherwise use static notes from track data
    return staticNotes;
  }, [liveNotes, staticNotes, track.id, hasTrack]);
  
  
  // Group notes by time for chord visualization
  const chordLines = useMemo(() => {
    const lines: { x: number; notes: number }[] = [];
    const threshold = 10; // Group notes within 10 ticks
    
    notes.forEach(note => {
      const noteX = (note.column * pixelsPerTick) + contentOffset;
      const existingLine = lines.find(line => Math.abs(line.x - noteX) < threshold * pixelsPerTick);
      if (existingLine) {
        existingLine.notes++;
      } else {
        lines.push({ x: noteX, notes: 1 });
      }
    });
    
    return lines.filter(line => line.notes > 1);
  }, [notes, pixelsPerTick, contentOffset]);
  
  return (
    <Group>
      {/* Track background gradient */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: 0, y: height }}
        fillLinearGradientColorStops={[0, `${color}10`, 1, `${color}05`]}
      />
      
      {/* Piano roll grid lines (subtle) */}
      {Array.from({ length: 12 }).map((_, i) => {
        const y = (i / 12) * height;
        return (
          <Line
            key={i}
            points={[0, y, width, y]}
            stroke={`${color}10`}
            strokeWidth={0.5}
          />
        );
      })}
      
      {/* Chord indicators */}
      {chordLines.map((line, i) => (
        <Line
          key={i}
          points={[line.x, 0, line.x, height]}
          stroke={`${color}30`}
          strokeWidth={2}
          dash={[4, 4]}
        />
      ))}
      
      {/* MIDI notes using KonvaMidiNotesPreview */}
      <KonvaMidiNotesPreview
        notes={notes}
        width={width}
        height={height}
        noteColor={'white'}
        pixelsPerTick={pixelsPerTick}
        contentOffset={contentOffset}
        trackId={track.id}
      />
      
      {/* Beat markers */}
      {Array.from({ length: Math.floor(width / (pixelsPerTick * 480)) }).map((_, i) => {
        const x = i * pixelsPerTick * 480; // Every beat
        return (
          <Line
            key={i}
            points={[x, 0, x, height]}
            stroke={`${color}15`}
            strokeWidth={1}
            dash={[1, 3]}
          />
        );
      })}
    </Group>
  );
};

export default MidiTrackRenderer;