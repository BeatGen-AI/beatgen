import React, { useCallback, useMemo } from 'react';
import { Box } from '@mui/material';
import { Position } from './types';
import { useStudioStore } from '../../stores/studioStore';
import { usePianoRollStore } from '../../stores/usePianoRollStore';
import TrackFactory from './TrackFactory';
import { GRID_CONSTANTS, calculateTrackWidth, pixelsToTicks, ticksToPixels, getTrackColor } from '../../constants/gridConstants';
import { CombinedTrack } from 'src/platform/types/project';
import { TrackInstance as TrackInstanceType } from '../../stores/types';

/**
 * TrackInstance component renders a single instance of a track at a specific position.
 * This allows multiple instances of the same track content to be shown at different positions,
 * similar to how clips work in professional DAWs.
 */
interface TrackInstanceProps {
  instance: TrackInstanceType;
  track: CombinedTrack;
  index: number;
  gridLineStyle?: { borderRight: string };
}

function TrackInstance(props: TrackInstanceProps) {
  const { instance, track, index, gridLineStyle } = props;
  
  // Store state and actions
  const store = useStudioStore(state => state.store);
  const bpm = useStudioStore(state => state.bpm);
  const timeSignature = useStudioStore(state => state.timeSignature);
  const updateInstancePosition = useStudioStore(state => state.updateInstancePosition);
  const removeTrackInstance = useStudioStore(state => state.removeTrackInstance);
  const isPlaying = useStudioStore(state => state.isPlaying);
  const currentTime = useStudioStore(state => state.currentTime);
  const measureCount = useStudioStore(state => state.measureCount);
  const openDrumMachine = useStudioStore(state => state.openDrumMachine);
  
  const { openPianoRoll } = usePianoRollStore();

  // Calculate width based on the track duration
  const trackWidth = useMemo(() => {
      // Ensure minimum width for visibility
      const minimumWidth = 200; // Minimum 200px width
      
      if (!track?.duration_ticks) {
          console.log(`TrackInstance: No duration_ticks for track ${track?.id}, using minimum width`);
          return minimumWidth; 
      }
      
      const startTicks = track.trim_start_ticks || 0;
      const endTicks = track.trim_end_ticks || track.duration_ticks;
      const visibleDurationTicks = Math.max(0, endTicks - startTicks);
      const calculatedWidth = ticksToPixels(visibleDurationTicks, bpm ?? 120, timeSignature ?? [4, 4]);
      
      // Ensure calculated width is at least minimum
      const finalWidth = Math.max(minimumWidth, calculatedWidth);
      
      console.log(`TrackInstance: Width calculation for ${track.id}:`, {
          duration_ticks: track.duration_ticks,
          visibleDurationTicks,
          calculatedWidth,
          finalWidth
      });
      
      return finalWidth;
  }, [track, bpm, timeSignature]);
  
  // Track selection state (based on track ID, not instance ID)
  const isSelected = useStudioStore(state => state.isTrackSelected(track.id));
  const selectTrack = useStudioStore(state => state.selectTrack);
  const openContextMenu = useStudioStore(state => state.openContextMenu);

  // Position from the instance
  const instancePosition: Position = {
    x: instance.position.x,
    y: instance.position.y
  };

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    console.log('🖱️ TRACK INSTANCE CLICK - Instance clicked:', instance.instanceId);
    console.log('🖱️ - track:', track.id);
    console.log('🖱️ - position:', instance.position);
    console.log('🖱️ - ctrlKey:', e.ctrlKey);
    console.log('🖱️ - metaKey:', e.metaKey);
    console.log('🖱️ - shiftKey:', e.shiftKey);
    console.log('🖱️ - current isSelected:', isSelected);
    
    // Handle selection (select the track, not the instance)
    if (e.ctrlKey || e.metaKey) {
      selectTrack(track.id, true);
    } else if (e.shiftKey) {
      // TODO: Implement range selection
      selectTrack(track.id, false);
    } else {
      selectTrack(track.id, false);
    }
    
    // Open appropriate editor for single tracks (not when multi-selecting)
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (track.type === 'DRUM') {
        openDrumMachine(track.id); 
      } else if (track.type === 'MIDI' || track.type === 'SAMPLER') {
        openPianoRoll(track.id); 
      }
    }
  }, [track, instance, isSelected, selectTrack, openDrumMachine, openPianoRoll]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Select track if not already selected
    if (!isSelected) {
      selectTrack(track.id, false);
    }
    
    // Open context menu at mouse position
    openContextMenu(e.clientX, e.clientY, track.id);
  }, [track.id, isSelected, selectTrack, openContextMenu]);

  const handlePositionChange = useCallback((trackId: string, newPosition: Position, isDragEnd: boolean) => {
    console.log(`TrackInstance: Position change for instance ${instance.instanceId}`, newPosition);
    
    // Update instance position
    if (isDragEnd) {
      updateInstancePosition(instance.instanceId, newPosition);
    }
  }, [instance.instanceId, updateInstancePosition]);

  const handleResizeEnd = useCallback((deltaPixels: number, resizeDirection: 'left' | 'right') => {
    console.log(`TrackInstance: Resize end for instance ${instance.instanceId}`, deltaPixels, resizeDirection);
    // TODO: Implement instance-specific resize if needed
    // For now, resizing affects the entire track, not individual instances
  }, [instance.instanceId]);

  const handleResizeEndForFactory = useCallback((trackId: string, trimDeltaPixels: number, resizeDirection: "left" | "right") => {
    handleResizeEnd(trimDeltaPixels, resizeDirection);
  }, [handleResizeEnd]);

  // Create a track object with instance-specific position
  // CRITICAL: Track instances store positions in PIXELS (from timeline clicks)
  // This bypasses the normal tick-to-pixel conversion in BaseTrackPreview
  const trackWithInstancePosition = useMemo(() => ({
    ...track,
    x_position: instance.position.x, // Already in pixels - no conversion needed
    y_position: instance.position.y, // Already in pixels - no conversion needed
    index
  }), [track, instance.position, index]);

  const trackColor = getTrackColor(index);

  return (
    <Box 
      onClick={handleTrackClick}
      onContextMenu={handleContextMenu}
      sx={{ 
        position: 'absolute',
        // CRITICAL FIX: Track instances use direct pixel positioning (no conversion needed)
        // They receive pixel coordinates directly from timeline clicks
        left: `${instance.position.x}px`,
        top: `${instance.position.y}px`,
        cursor: 'pointer',
        outline: isSelected ? '2px solid #2196f3' : 'none',
        outlineOffset: '-2px',
        borderRadius: '6px',
        zIndex: 10, // Ensure instances are above background elements
        minWidth: '200px', // Force minimum width at the container level
        minHeight: '80px', // Force minimum height at the container level
        width: `${trackWidth}px`, // Apply calculated width directly
        height: `${GRID_CONSTANTS.trackHeight}px`, // Apply standard track height
      }}
      data-track-instance-id={instance.instanceId}
      data-track-id={track.id}
      data-track-type={track.type}
      data-selected={isSelected}
    >
      <TrackFactory
        track={trackWithInstancePosition}
        isPlaying={isPlaying}
        currentTime={currentTime}
        measureCount={measureCount}
        gridLineStyle={gridLineStyle}
        onPositionChange={handlePositionChange}
        onResizeEnd={handleResizeEndForFactory}
        bpm={bpm}
        timeSignature={timeSignature}
        trackIndex={index}
        trackWidth={trackWidth}
      />
    </Box>
  );
}

export default TrackInstance;