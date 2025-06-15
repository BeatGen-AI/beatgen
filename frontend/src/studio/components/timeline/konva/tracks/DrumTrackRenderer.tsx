import React, { useMemo } from 'react';
import { Group, Rect, Circle, Line, Text } from 'react-konva';
import { CombinedTrack } from 'src/platform/types/project';
import { DrumTrack } from 'src/platform/types/track_models/drum_track';

export interface DrumTrackRendererProps {
  track: CombinedTrack;
  width: number;
  height: number;
  pixelsPerTick: number;
  contentOffset: number;
  color: string;
}

// Standard drum kit mapping
const DRUM_NAMES = {
  36: 'BD',  // Bass Drum
  38: 'SN',  // Snare
  42: 'HH',  // Hi-Hat Closed
  46: 'OH',  // Hi-Hat Open
  49: 'CR',  // Crash
  51: 'RD',  // Ride
  45: 'TM',  // Tom
  47: 'T2',  // Tom 2
  48: 'T3',  // Tom 3
};

/**
 * Renders drum pattern visualization for drum tracks.
 */
export const DrumTrackRenderer: React.FC<DrumTrackRendererProps> = ({
  track,
  width,
  height,
  pixelsPerTick,
  contentOffset,
  color
}) => {
  // Get drum hits from track
  const drumHits = useMemo(() => {
    if (track.type === 'DRUM') {
      const drumTrack = track as DrumTrack;
      return drumTrack.notes || [];
    }
    return [];
  }, [track]);
  
  // Get unique drum types and create lanes
  const drumLanes = useMemo(() => {
    const uniquePitches = [...new Set(drumHits.map(hit => hit.pitch))].sort((a, b) => a - b);
    const lanes = new Map<number, { y: number; name: string }>();
    
    uniquePitches.forEach((pitch, index) => {
      const laneHeight = height / Math.max(uniquePitches.length, 1);
      lanes.set(pitch, {
        y: index * laneHeight + laneHeight / 2,
        name: DRUM_NAMES[pitch] || `D${pitch}`
      });
    });
    
    return lanes;
  }, [drumHits, height]);
  
  // Calculate hit positions
  const hitCircles = useMemo(() => {
    return drumHits.map(hit => {
      const lane = drumLanes.get(hit.pitch);
      if (!lane) return null;
      
      const x = hit.tick * pixelsPerTick;
      const radius = Math.min(8, height / (drumLanes.size * 2));
      
      return {
        id: hit.id,
        x,
        y: lane.y,
        radius,
        velocity: hit.velocity,
        pitch: hit.pitch
      };
    }).filter(Boolean);
  }, [drumHits, drumLanes, pixelsPerTick, height]);
  
  // Calculate step grid (16th notes)
  const stepGrid = useMemo(() => {
    const stepSize = pixelsPerTick * 120; // 16th note = 120 ticks
    const steps = Math.floor(width / stepSize);
    return Array.from({ length: steps + 1 }).map((_, i) => i * stepSize);
  }, [width, pixelsPerTick]);
  
  return (
    <Group>
      {/* Track background */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={`${color}15`}
      />
      
      {/* Drum lane separators and labels */}
      {Array.from(drumLanes.entries()).map(([pitch, lane], index) => {
        const laneHeight = height / drumLanes.size;
        const y = index * laneHeight;
        
        return (
          <Group key={pitch}>
            {/* Lane separator */}
            <Line
              points={[0, y + laneHeight, width, y + laneHeight]}
              stroke={`${color}20`}
              strokeWidth={1}
            />
            
            {/* Lane label */}
            <Text
              x={5}
              y={y + laneHeight / 2 - 6}
              text={lane.name}
              fontSize={10}
              fontFamily="monospace"
              fill={color}
              opacity={0.6}
            />
          </Group>
        );
      })}
      
      {/* Step grid */}
      {stepGrid.map((x, i) => {
        const isBeat = i % 4 === 0;
        const isMeasure = i % 16 === 0;
        
        return (
          <Line
            key={i}
            points={[x, 0, x, height]}
            stroke={color}
            strokeWidth={isMeasure ? 1 : isBeat ? 0.5 : 0.25}
            opacity={isMeasure ? 0.3 : isBeat ? 0.2 : 0.1}
          />
        );
      })}
      
      {/* Drum hits */}
      {hitCircles.map(hit => {
        if (!hit) return null;
        
        // Calculate opacity and size based on velocity
        const velocityScale = 0.5 + (hit.velocity / 127) * 0.5;
        const radius = hit.radius * velocityScale;
        
        return (
          <Group key={hit.id}>
            {/* Hit circle */}
            <Circle
              x={hit.x}
              y={hit.y}
              radius={radius}
              fill={color}
              opacity={0.8}
            />
            
            {/* Hit accent for high velocity */}
            {hit.velocity > 100 && (
              <Circle
                x={hit.x}
                y={hit.y}
                radius={radius + 2}
                stroke={color}
                strokeWidth={1}
                fill="transparent"
                opacity={0.5}
              />
            )}
          </Group>
        );
      })}
      
      {/* Pattern repeat indicator */}
      {drumHits.length > 0 && (
        <Group>
          {/* Find pattern length (simplified - just show every 4 beats) */}
          {Array.from({ length: Math.floor(width / (pixelsPerTick * 1920)) }).map((_, i) => {
            const x = i * pixelsPerTick * 1920; // Every measure
            return (
              <Rect
                key={i}
                x={x}
                y={0}
                width={2}
                height={height}
                fill={color}
                opacity={0.3}
              />
            );
          })}
        </Group>
      )}
    </Group>
  );
};

export default DrumTrackRenderer;