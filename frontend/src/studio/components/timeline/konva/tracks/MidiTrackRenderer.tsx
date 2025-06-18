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
  // Get MIDI notes from track
  const midiNotes = useMemo(() => {
    if (track.track_type === 'MIDI') {
      const midiTrack = track.track as MidiTrackRead;
      if (midiTrack.midi_notes_json?.notes) {
        return midiTrack.midi_notes_json.notes as Array<any>;
      }
    } else if (track.track_type === 'SAMPLER') {
      const samplerTrack = track.track as SamplerTrackRead;
      if (samplerTrack.midi_notes_json?.notes) {
        return samplerTrack.midi_notes_json.notes as Array<any>;
      }
    }
    return [];
  }, [track]);
  
  // Calculate note positions and dimensions
  const noteRects = useMemo(() => {
    const minNote = 0;
    const maxNote = 127;
    const noteRange = maxNote - minNote + 1;
    const noteHeight = Math.max(2, height / noteRange);
    
    return midiNotes.map(note => {
      const x = note.tick * pixelsPerTick;
      const y = height - ((note.pitch - minNote) / noteRange) * height - noteHeight;
      const width = note.duration * pixelsPerTick;
      
      return {
        id: note.id,
        x,
        y,
        width: Math.max(1, width), // Minimum 1 pixel width
        height: noteHeight,
        velocity: note.velocity
      };
    });
  }, [midiNotes, pixelsPerTick, height]);
  
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
      
      {/* MIDI notes */}
      {noteRects.map(note => {
        // Calculate opacity based on velocity
        const velocityOpacity = 0.4 + (note.velocity / 127) * 0.6;
        
        return (
          <Group key={note.id}>
            {/* Note rectangle */}
            <Rect
              x={note.x}
              y={note.y}
              width={note.width}
              height={note.height}
              fill={color}
              opacity={velocityOpacity}
              cornerRadius={Math.min(2, note.height / 2)}
            />
            
            {/* Note border for visibility */}
            <Rect
              x={note.x}
              y={note.y}
              width={note.width}
              height={note.height}
              stroke={color}
              strokeWidth={0.5}
              fill="transparent"
              opacity={0.8}
              cornerRadius={Math.min(2, note.height / 2)}
            />
          </Group>
        );
      })}
      
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