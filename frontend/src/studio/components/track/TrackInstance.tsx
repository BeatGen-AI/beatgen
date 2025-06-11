import React, { useCallback, useMemo } from 'react';
import { Box } from '@mui/material';
import { Position } from './types';
import { useStudioStore } from '../../stores/studioStore';
import { usePianoRollStore } from '../../stores/usePianoRollStore';
import BaseTrackPreview from './base/BaseTrackPreview';
import TrackFactory from './TrackFactory';
import { GRID_CONSTANTS, calculateTrackWidth, pixelsToTicks, ticksToPixels, getTrackColor } from '../../constants/gridConstants';
import { CombinedTrack } from 'src/platform/types/project';
import { TrackInstance as TrackInstanceType } from '../../stores/types';
import { calculateAudioTrackWidth } from '../../utils/trackWidthCalculators';
import { useGridStore } from '../../core/state/gridStore';
import WaveformDisplay from './WaveformDisplay';
import MidiNotesPreview from '../piano-roll/components/MidiNotesPreview';
import DrumGridPreview from './drum/DrumGridPreview';

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
  const studioState = useStudioStore(state => state.store);
  const bpm = useStudioStore(state => state.bpm);
  const timeSignature = useStudioStore(state => state.timeSignature);
  const updateInstancePosition = useStudioStore(state => state.updateInstancePosition);
  const removeTrackInstance = useStudioStore(state => state.removeTrackInstance);
  const isPlaying = useStudioStore(state => state.isPlaying);
  const currentTime = useStudioStore(state => state.currentTime);
  const measureCount = useStudioStore(state => state.measureCount);
  const openDrumMachine = useStudioStore(state => state.openDrumMachine);
  
  const { openPianoRoll } = usePianoRollStore();

  // Get measure width for calculations
  const audioMeasureWidth = useGridStore(state => state.audioMeasurePixelWidth);
  
  // Calculate width based on the track duration and type
  const trackWidth = useMemo(() => {
      const minimumWidth = 200; // Minimum 200px width
      
      if (!track?.duration_ticks) {
          console.log(`TrackInstance: No duration_ticks for track ${track?.id}, using minimum width`);
          return minimumWidth; 
      }
      
      // Calculate width based on track type (same logic as the respective TrackPreview components)
      let calculatedWidth: number;
      
      if (track.type === 'AUDIO') {
        calculatedWidth = calculateAudioTrackWidth(
          track.duration_ticks,
          bpm ?? 120,
          audioMeasureWidth
        );
      } else {
        // For MIDI, SAMPLER, DRUM tracks, use the existing calculation
        const startTicks = track.trim_start_ticks || 0;
        const endTicks = track.trim_end_ticks || track.duration_ticks;
        const visibleDurationTicks = Math.max(0, endTicks - startTicks);
        calculatedWidth = ticksToPixels(visibleDurationTicks, bpm ?? 120, timeSignature ?? [4, 4]);
      }
      
      const finalWidth = Math.max(minimumWidth, calculatedWidth);
      
      console.log(`TrackInstance: Width calculation for ${track.id}:`, {
          type: track.type,
          duration_ticks: track.duration_ticks,
          calculatedWidth,
          finalWidth
      });
      
      return finalWidth;
  }, [track, bpm, timeSignature, audioMeasureWidth]);
  
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
      // BaseTrackPreview sends position in ticks, but track instances store in pixels
      const pixelsX = ticksToPixels(newPosition.x, bpm ?? 120, timeSignature ?? [4, 4]);
      const pixelPosition = {
        x: pixelsX,
        y: newPosition.y // Y stays in pixels
      };
      
      updateInstancePosition(instance.instanceId, pixelPosition);
    }
  }, [instance.instanceId, updateInstancePosition, bpm, timeSignature]);

  const handleResizeEnd = useCallback((trackId: string, trimDeltaPixels: number, resizeDirection: 'left' | 'right') => {
    console.log(`TrackInstance: Resize end for instance ${instance.instanceId}`, trimDeltaPixels, resizeDirection);
    // TODO: Implement instance-specific resize if needed
    // For now, resizing affects the entire track, not individual instances
  }, [instance.instanceId]);

  // Create a track object with instance-specific position
  // Convert track instance pixel positions to ticks to match BaseTrackPreview expectations
  const trackWithInstancePosition = useMemo(() => {
    const ticksX = pixelsToTicks(instance.position.x, bpm ?? 120, timeSignature ?? [4, 4]);
    
    return {
      ...track,
      x_position: ticksX, // Convert pixels to ticks
      y_position: instance.position.y, // Y stays in pixels
      index
    };
  }, [track, instance.position, index, bpm, timeSignature]);
  
  // Calculate full content width for proper content rendering
  const fullContentWidth = useMemo(() => {
    if (track.type === 'AUDIO') {
      return calculateAudioTrackWidth(
        track.duration_ticks || 8,
        bpm ?? 120,
        audioMeasureWidth
      );
    } else {
      // For MIDI, SAMPLER, DRUM tracks
      return ticksToPixels(track.duration_ticks || 3840, bpm ?? 120, timeSignature ?? [4, 4]);
    }
  }, [track, bpm, timeSignature, audioMeasureWidth]);
  
  // Get track color and notes for rendering
  const trackColor = getTrackColor(index);
  
  // Get notes for MIDI/SAMPLER tracks
  const midiManager = studioState?.getMidiManager();
  const trackNotes = midiManager?.getTrackNotes(track.id) || [];
  
  // Render track-specific content (same logic as respective TrackPreview components)
  const renderTrackContent = useCallback(() => {
    switch (track.type) {
      case 'AUDIO':
        return (
          <WaveformDisplay 
            audioFile={undefined} // TODO: Fix this
            trackColor={trackColor}
            duration={track.duration_ticks || 0}
            width={fullContentWidth}
          />
        );
      case 'MIDI':
      case 'SAMPLER':
        return (
          <MidiNotesPreview 
            width={fullContentWidth}
            height={GRID_CONSTANTS.trackHeight - 6}
            noteColor={'white'}
            notes={trackNotes}
          />
        );
      case 'DRUM':
        return (
          <DrumGridPreview 
            pattern={[]} // TODO: Get drum pattern
            width={fullContentWidth}
            height={GRID_CONSTANTS.trackHeight - 6}
            trackColor={trackColor}
          />
        );
      default:
        return null;
    }
  }, [track.type, trackColor, fullContentWidth, track.duration_ticks, trackNotes]);

  return (
    <Box 
      onClick={handleTrackClick}
      onContextMenu={handleContextMenu}
      sx={{ 
        position: 'relative', // Wrapper for click handling
      }}
      data-track-instance-id={instance.instanceId}
      data-track-id={track.id}
      data-track-type={track.type}
      data-selected={isSelected}
    >
      <BaseTrackPreview
        track={trackWithInstancePosition}
        isPlaying={isPlaying}
        currentTime={currentTime}
        measureCount={measureCount}
        gridLineStyle={gridLineStyle || { borderRight: '1px solid #333' }}
        onPositionChange={handlePositionChange}
        onResizeEnd={handleResizeEnd}
        bpm={bpm ?? 120}
        timeSignature={timeSignature ?? [4, 4]}
        trackIndex={index}
        trackColor={trackColor}
        trackStyleOverrides={{
          outline: isSelected ? '2px solid #2196f3' : 'none',
          outlineOffset: '-2px',
          zIndex: 10, // Ensure instances are above background elements
        }}
        renderTrackContent={renderTrackContent}
        trackWidth={trackWidth}
        contentWidth={fullContentWidth}
      />
    </Box>
  );
}

export default TrackInstance;