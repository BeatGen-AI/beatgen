import React, { useCallback, useMemo, useEffect } from 'react';
import { Box } from '@mui/material';
import { Position } from './types';
import { useStudioStore } from '../../stores/studioStore';
import { usePianoRollStore } from '../../stores/usePianoRollStore';
import TrackFactory from './TrackFactory';
import { GRID_CONSTANTS, calculateTrackWidth, pixelsToTicks, ticksToPixels, getTrackColor } from '../../constants/gridConstants';
import { CombinedTrack } from 'src/platform/types/project'; // Import CombinedTrack if needed
import { Store } from '../../core/state/store';
import { Actions } from '../../core/state/history/actions';
import { MidiTrack } from 'src/platform/types/track_models/midi_track'; // Keep MidiTrack import

/**
 * Track component serves as the main entry point for rendering tracks in the timeline.
 * It handles high-level track state management and events, delegating rendering to specialized components.
 */
interface TrackProps {
  id: string;
  index: number;
  gridLineStyle?: { borderRight: string };
}

function Track(props: TrackProps) {
  const { id, index, gridLineStyle } = props;
  // Fix: Select tracks array individually
  const tracks = useStudioStore(state => state.tracks);
  // Select other state/actions individually
  const store = useStudioStore(state => state.store);
  const bpm = useStudioStore(state => state.bpm);
  const timeSignature = useStudioStore(state => state.timeSignature);
  const executeHistoryAction = useStudioStore(state => state.executeHistoryAction);
  const handleTrackPositionChange = useStudioStore(state => state.handleTrackPositionChange);
  const handleTrackResizeEndAction = useStudioStore(state => state.handleTrackResizeEnd); // Renamed to avoid conflict
  const isPlaying = useStudioStore(state => state.isPlaying);
  const currentTime = useStudioStore(state => state.currentTime);
  const measureCount = useStudioStore(state => state.measureCount);
  const openDrumMachine = useStudioStore(state => state.openDrumMachine);
  
  const { openPianoRoll, closePianoRoll } = usePianoRollStore(); // Corrected closePianoRoll access

  // Effect for cleanup on unmount
  useEffect(() => {
    // Return the cleanup function
    return () => {
      console.log(`Track component unmounting, cleaning up resources for track ID: ${id}`);
      // Access the transport controller via the store instance
      const transport = store?.getTransport(); 
      if (transport) {
        // Call the removeTrack method which should handle sampler cleanup
        transport.removeTrack(id); 
      } else {
        console.warn(`Store or transport not available during cleanup for track ${id}`);
      }
    };
  }, [id, store]); // Depend on id and store instance

  // Fix: Use useMemo to derive fullTrack from tracks array
  const fullTrack = useMemo(() => tracks.find(t => t.id === id), [tracks, id]);

  // Calculate width based on the memoized fullTrack
  const trackWidth = useMemo(() => {
      if (!fullTrack?.duration_ticks) return 100; 
      const startTicks = fullTrack.trim_start_ticks || 0;
      const endTicks = fullTrack.trim_end_ticks || fullTrack.duration_ticks;
      const visibleDurationTicks = Math.max(0, endTicks - startTicks);
      // Ensure bpm and timeSignature are valid before calculation
      return ticksToPixels(visibleDurationTicks, bpm ?? 120, timeSignature ?? [4, 4]);
  }, [fullTrack, bpm, timeSignature]);
  
  // Track selection state
  const isSelected = useStudioStore(state => state.isTrackSelected(id));
  const selectTrack = useStudioStore(state => state.selectTrack);
  const clearSelection = useStudioStore(state => state.clearSelection);
  const openContextMenu = useStudioStore(state => state.openContextMenu);

  // Callbacks use memoized fullTrack or selected actions
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    console.log('🖱️ TRACK CLICK - Track clicked:', id);
    console.log('🖱️ - fullTrack exists:', !!fullTrack);
    console.log('🖱️ - ctrlKey:', e.ctrlKey);
    console.log('🖱️ - metaKey:', e.metaKey);
    console.log('🖱️ - shiftKey:', e.shiftKey);
    console.log('🖱️ - current isSelected:', isSelected);
    
    if (!fullTrack) return;
    
    // Handle selection
    if (e.ctrlKey || e.metaKey) {
      // Add to selection
      console.log('🖱️ - Action: Add to selection');
      selectTrack(id, true);
    } else if (e.shiftKey) {
      // TODO: Implement range selection
      console.log('🖱️ - Action: Range selection (not implemented)');
      selectTrack(id, false);
    } else {
      // Single selection
      console.log('🖱️ - Action: Single selection');
      selectTrack(id, false);
    }
    
    // Open appropriate editor for single tracks (not when multi-selecting)
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (fullTrack.type === 'DRUM') {
        openDrumMachine(id); 
      } else if (fullTrack.type === 'MIDI' || fullTrack.type === 'SAMPLER') {
        openPianoRoll(id); 
      }
    }
  }, [fullTrack, id, openDrumMachine, openPianoRoll, selectTrack]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Select track if not already selected
    if (!isSelected) {
      selectTrack(id, false);
    }
    
    // Open context menu at mouse position
    openContextMenu(e.clientX, e.clientY, id);
  }, [id, isSelected, selectTrack, openContextMenu]);

  const handlePositionChangeForFactory = useCallback((trackId: string, newPosition: Position, isDragEnd: boolean) => {
      handleTrackPositionChange(trackId, newPosition, isDragEnd);
  }, [handleTrackPositionChange]);

  // handleResizeEndCallback now calls the slice action
  const handleResizeEndCallback = useCallback((deltaPixels: number, resizeDirection: 'left' | 'right') => {
    if (handleTrackResizeEndAction) { 
        handleTrackResizeEndAction(id, deltaPixels, resizeDirection);
    } else {
        console.error("handleTrackResizeEnd action not found in store!");
    }
  }, [id, handleTrackResizeEndAction]); // Depends on id and the action itself

  const handleResizeEndForFactoryCallback = useCallback((trackId: string, trimDeltaPixels: number, resizeDirection: "left" | "right") => {
      handleResizeEndCallback(trimDeltaPixels, resizeDirection);
  }, [handleResizeEndCallback]);

  if (!fullTrack) { 
      // It might briefly be undefined when tracks array updates before memo runs
      console.warn(`Track component ID ${id}: fullTrack data not found this render cycle.`);
      return null; // Don't render if track data isn't available
  }

  const trackWithIndex = fullTrack as (CombinedTrack & { index?: number });
  const trackColor = getTrackColor(trackWithIndex?.index ?? 0);

  return (
    <Box 
      onClick={handleTrackClick}
      onContextMenu={handleContextMenu}
      sx={{ 
        position: 'relative', 
        cursor: 'pointer',
        outline: isSelected ? '2px solid #2196f3' : 'none',
        outlineOffset: '-2px',
        borderRadius: '6px'
      }}
      data-track-id={id}
      data-track-type={fullTrack.type}
      data-selected={isSelected}
    >
      <TrackFactory
        track={fullTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        measureCount={measureCount}
        gridLineStyle={gridLineStyle}
        onPositionChange={handlePositionChangeForFactory}
        onResizeEnd={handleResizeEndForFactoryCallback}
        bpm={bpm}
        timeSignature={timeSignature}
        trackIndex={index}
        trackWidth={trackWidth}
      />
    </Box>
  );
}

export default Track;