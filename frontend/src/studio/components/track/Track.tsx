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
import { MidiTrack } from 'src/platform/types/dto/track_models/midi_track'; // Keep MidiTrack import
import { Tool } from '../../shared/interactions';
import { getFirstInstance } from '../../utils/instanceHelpers';

/**
 * Track component serves as the main entry point for rendering tracks in the timeline.
 * It handles high-level track state management and events, delegating rendering to specialized components.
 */
interface TrackProps {
  id: string;
  index: number;
  gridLineStyle?: { borderRight: string };
  
  // Selection and interaction props
  isSelected?: boolean;
  selectedTool?: Tool;
  isGroupDrag?: boolean;
  isPrimaryDrag?: boolean;
  isGroupResize?: boolean;
  isPrimaryResize?: boolean;
  resizeDelta?: { x: number; y: number };
  resizeDirection?: 'left' | 'right' | null;
  resizeInitialDimensions?: { x: number; width: number; trimStart: number; trimEnd: number };
  onTrackClick?: (trackId: string, event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => void;
  onTrackDoubleClick?: (trackId: string) => void;
  interaction?: any;
  
  // Grid snap props
  gridSnapEnabled?: boolean;
  gridSnapSize?: number;
  actualSnapSize?: number;
}

function Track(props: TrackProps) {
  const { 
    id, 
    index, 
    gridLineStyle,
    isSelected = false,
    selectedTool = 'select',
    isGroupDrag = false,
    isPrimaryDrag = false,
    isGroupResize = false,
    isPrimaryResize = false,
    resizeDelta,
    resizeDirection,
    resizeInitialDimensions,
    onTrackClick,
    onTrackDoubleClick,
    interaction,
    gridSnapEnabled = true,
    gridSnapSize,
    actualSnapSize
  } = props;
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
      const firstInstance = getFirstInstance(fullTrack);
      const startTicks = firstInstance?.trim_start_ticks || 0;
      const endTicks = firstInstance?.trim_end_ticks || fullTrack.duration_ticks;
      const visibleDurationTicks = Math.max(0, endTicks - startTicks);
      // Ensure bpm and timeSignature are valid before calculation
      return ticksToPixels(visibleDurationTicks, bpm ?? 120, timeSignature ?? [4, 4]);
  }, [fullTrack, bpm, timeSignature]);
  
  // Callbacks use memoized fullTrack or selected actions
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!fullTrack) return;
    if (fullTrack.track_type === 'DRUM') {
      openDrumMachine(id); 
    } else if (fullTrack.track_type === 'MIDI' || fullTrack.track_type === 'SAMPLER') {
      openPianoRoll(id); 
    }
  }, [fullTrack, id, openDrumMachine, openPianoRoll]);

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
      sx={{ position: 'relative', cursor: 'pointer' }}
      data-track-id={id}
      data-track-type={fullTrack.track_type} 
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
        isSelected={isSelected}
        selectedTool={selectedTool}
        isGroupDrag={isGroupDrag}
        isPrimaryDrag={isPrimaryDrag}
        isGroupResize={isGroupResize}
        isPrimaryResize={isPrimaryResize}
        resizeDelta={resizeDelta}
        resizeDirection={resizeDirection}
        resizeInitialDimensions={resizeInitialDimensions}
        onTrackClick={onTrackClick}
        onTrackDoubleClick={onTrackDoubleClick}
        interaction={interaction}
        gridSnapEnabled={gridSnapEnabled}
        gridSnapSize={gridSnapSize}
        actualSnapSize={actualSnapSize}
      />
    </Box>
  );
}

export default Track;