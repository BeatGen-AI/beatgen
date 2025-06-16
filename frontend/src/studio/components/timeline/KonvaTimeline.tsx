import React, { useState, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Box } from '@mui/material';
import { Stage, Layer, Rect, Text } from 'react-konva';
import {
  KonvaBase,
  GridLayer,
  SelectionRect,
  DragGhost,
  Ruler,
  useKonvaInteractions,
  KonvaItem,
  Tool,
  Position,
  Dimensions,
  Viewport
} from '../shared/konva';
import { KonvaTrack } from './konva/KonvaTrack';
import { PlaybackCursor } from './konva/PlaybackCursor';
import { TimeRuler } from './konva/TimeRuler';
import { CombinedTrack } from 'src/platform/types/project';
import { Position as TrackPosition } from '../track/types';
import { GRID_CONSTANTS, ticksToPixels, pixelsToTicks } from '../../constants/gridConstants';
import { MUSIC_CONSTANTS } from '../../constants/musicConstants';
import { GridSnapOption, getSnapSizeInPixels } from '../piano-roll2/gridConstants';
import Konva from 'konva';

export interface KonvaTimelineProps {
  tracks: CombinedTrack[];
  currentTime?: number;
  isPlaying?: boolean;
  measureCount?: number;
  zoomLevel?: number;
  bpm?: number;
  timeSignature?: [number, number];
  onTrackPositionChange?: (trackId: string, newPosition: TrackPosition, isDragEnd: boolean) => void;
  onTimeChange?: (newTime: number) => void;
  
  // Selection and tool integration
  selectedTool?: Tool;
  onToolChange?: (tool: Tool) => void;
  showToolbar?: boolean;
  gridSnapSize?: GridSnapOption;
  onTrackSelect?: (trackIds: string[]) => void;
  onTrackDelete?: (trackId: string) => void;
  onTrackDuplicate?: (trackId: string) => void;
  onTrackResizeEnd?: (trackId: string, deltaPixels: number, direction: 'left' | 'right') => void;
  selectedTrackIds?: string[];
  
  // Group operations for clipboard functionality
  onCopyTracks?: (tracks: CombinedTrack[]) => void;
  onCutTracks?: (tracks: CombinedTrack[]) => void;
  onPasteTracks?: (tracks: CombinedTrack[], position?: { x: number; y: number }) => void;
  onDeleteTracks?: (trackIds: string[]) => void;
  onDuplicateTracks?: (trackIds: string[]) => void;
  
  // Zoom control
  onZoomChange?: (newZoom: number) => void;
}

// Define imperative handle interface (same as original Timeline)
export interface KonvaTimelineRef {
  playbackCursor: {
    play: () => void;
    pause: () => void;
    stop: () => void;
    seek: (time: number) => void;
  };
  // Viewport control
  scrollTo: (x: number, y: number) => void;
  getViewport: () => Viewport;
}

export const KonvaTimeline = forwardRef<KonvaTimelineRef, KonvaTimelineProps>(({
  tracks,
  currentTime = 0,
  isPlaying = false,
  measureCount = GRID_CONSTANTS.measureCount,
  zoomLevel = 1,
  bpm = 120,
  timeSignature = [4, 4],
  onTrackPositionChange = () => {},
  onTimeChange = () => {},
  selectedTool = 'select',
  onToolChange,
  showToolbar = false,
  gridSnapSize: propGridSnapSize,
  onTrackSelect,
  onTrackDelete,
  onTrackDuplicate,
  onTrackResizeEnd,
  selectedTrackIds = [],
  onCopyTracks,
  onCutTracks,
  onPasteTracks,
  onDeleteTracks,
  onDuplicateTracks,
  onZoomChange
}, ref) => {
  // State
  const [tool, setTool] = useState<Tool>(selectedTool);
  const [clipboard, setClipboard] = useState<CombinedTrack[]>([]);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(true);
  const [gridSnapSize, setGridSnapSize] = useState(propGridSnapSize || GridSnapOption.STEP);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, width: 800, height: 600 });
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [internalZoom, setInternalZoom] = useState(zoomLevel || 1);
  const [resizePreviewWidths, setResizePreviewWidths] = useState<Map<string, number>>(new Map());
  const [resizePreviewPositions, setResizePreviewPositions] = useState<Map<string, number>>(new Map());
  const [dragPreviewPositions, setDragPreviewPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  
  // Refs
  const stageRef = useRef<Konva.Stage>(null);
  const konvaBaseRef = useRef<any>(null);
  const playbackCursorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Sync internal zoom with prop
  useEffect(() => {
    if (zoomLevel !== undefined && zoomLevel !== internalZoom) {
      setInternalZoom(zoomLevel);
    }
  }, [zoomLevel]);
  
  // Calculate dimensions
  const totalTimelineWidth = measureCount * GRID_CONSTANTS.measureWidth * internalZoom;
  const totalTimelineHeight = Math.max(600, tracks.length * GRID_CONSTANTS.trackHeight + 200);
  
  // Calculate pixels per tick
  const pixelsPerTick = useMemo(() => {
    const beatsPerMeasure = timeSignature[0];
    const ticksPerBeat = MUSIC_CONSTANTS.pulsesPerQuarterNote;
    const ticksPerMeasure = ticksPerBeat * beatsPerMeasure;
    const result = (GRID_CONSTANTS.measureWidth * internalZoom) / ticksPerMeasure;
    return result;
  }, [timeSignature, internalZoom]);
  
  // Calculate actual grid snap size
  const effectiveGridSize = GRID_CONSTANTS.measureWidth / (timeSignature[0] * 4);
  const actualSnapSize = useMemo(() => {
    return getSnapSizeInPixels(gridSnapSize, effectiveGridSize);
  }, [gridSnapSize, effectiveGridSize]);
  
  // Convert tracks to KonvaItems
  const konvaItems: KonvaItem[] = useMemo(() => {
    const items = tracks.map((track, index) => {
      // Check if we have preview values for this track
      const resizePreviewX = resizePreviewPositions.get(track.id);
      const resizePreviewWidth = resizePreviewWidths.get(track.id);
      const dragPreview = dragPreviewPositions.get(track.id);
      
      // Use drag preview if available, otherwise resize preview, otherwise track position
      let x = track.x_position || 0;
      if (resizePreviewX !== undefined) {
        x = resizePreviewX / pixelsPerTick;
      }
      if (dragPreview) {
        x = dragPreview.x / pixelsPerTick;
      }
      
      let y = track.y_position !== null && track.y_position !== undefined 
        ? track.y_position 
        : index * GRID_CONSTANTS.trackHeight;
      if (dragPreview) {
        y = dragPreview.y;
      }
      
      return {
        id: track.id,
        x,
        y,
        width: resizePreviewWidth !== undefined 
          ? resizePreviewWidth / pixelsPerTick  // Convert preview pixels to ticks
          : (track.duration_ticks ? 
            (track.trim_end_ticks || track.duration_ticks) - (track.trim_start_ticks || 0) : 
            MUSIC_CONSTANTS.pulsesPerQuarterNote * 4),
        height: GRID_CONSTANTS.trackHeight,
        type: 'track' as const,
        data: track
      };
    });
    return items;
  }, [tracks, resizePreviewPositions, resizePreviewWidths, dragPreviewPositions, pixelsPerTick]);
  
  // Get stage from direct Stage ref
  const [stage, setStage] = useState<Konva.Stage | null>(null);
  
  // Use the unified interaction system
  const interaction = useKonvaInteractions({
    items: konvaItems,
    stage: stage,
    pixelsPerUnit: pixelsPerTick,
    tool,
    gridSize: gridSnapEnabled ? pixelsToTicks(actualSnapSize, bpm, timeSignature) : 0,
    snapToGrid: gridSnapEnabled,
    trackHeight: GRID_CONSTANTS.trackHeight,
    
    // Callbacks
    onSelectionChange: (ids) => {
      onTrackSelect?.(ids);
    },
    
    onDragMove: (updates) => {
      // Convert positions to pixels for display preview
      const newDragPositions = new Map<string, { x: number; y: number }>();
      
      updates.forEach((pos, trackId) => {
        newDragPositions.set(trackId, {
          x: pos.x * pixelsPerTick, // Convert to pixels for display
          y: pos.y
        });
      });
      
      setDragPreviewPositions(newDragPositions);
    },
    
    onDragEnd: (updates) => {
      // Clear drag preview
      setDragPreviewPositions(new Map());
      
      // Update actual positions
      updates.forEach((pos, trackId) => {
        onTrackPositionChange(trackId, {
          x: pos.x,
          y: pos.y
        }, true);
      });
    },
    
    onResizeMove: (updates) => {
      // Update preview widths and positions during resize
      const newPreviewWidths = new Map(resizePreviewWidths);
      const newPreviewPositions = new Map(resizePreviewPositions);
      
      updates.forEach((dim, trackId) => {
        if (dim.width !== undefined) {
          // Convert logical width (ticks) to pixels for preview
          const widthInPixels = dim.width * pixelsPerTick;
          newPreviewWidths.set(trackId, widthInPixels);
        }
        if (dim.start !== undefined) {
          // Convert logical position (ticks) to pixels for preview
          const xInPixels = dim.start * pixelsPerTick;
          newPreviewPositions.set(trackId, xInPixels);
        }
      });
      
      setResizePreviewWidths(newPreviewWidths);
      setResizePreviewPositions(newPreviewPositions);
    },
    
    onResizeEnd: (updates) => {
      // Clear preview widths and positions
      setResizePreviewWidths(new Map());
      setResizePreviewPositions(new Map());
      
      updates.forEach((dim, trackId) => {
        const track = tracks.find(t => t.id === trackId);
        if (!track) return;
        
        // For left resize, we need to update the trim
        if (dim.start !== undefined && dim.width !== undefined) {
          // Left resize - onTrackResizeEnd expects the position change in pixels
          if (onTrackResizeEnd) {
            const positionDeltaTicks = dim.start - track.x_position;
            const deltaPixels = ticksToPixels(positionDeltaTicks, bpm, timeSignature);
            onTrackResizeEnd(trackId, deltaPixels, 'left');
          }
        } else if (dim.width !== undefined) {
          // Right resize - only width changed
          if (onTrackResizeEnd) {
            const currentWidthTicks = (track.trim_end_ticks || track.duration_ticks || 0) - (track.trim_start_ticks || 0);
            const newWidthTicks = dim.width; // dim.width is already in ticks
            const deltaTicks = newWidthTicks - currentWidthTicks;
            const deltaPixels = ticksToPixels(deltaTicks, bpm, timeSignature);
            onTrackResizeEnd(trackId, deltaPixels, 'right');
          }
        }
      });
    },
    
    onItemClick: (item, clickTool) => {
      if (clickTool === 'eraser') {
        onTrackDelete?.(item.id);
      } else if (clickTool === 'pen') {
        onTrackDuplicate?.(item.id);
      }
    },
    
    onBackgroundClick: (position, clickTool) => {
      if (clickTool === 'select') {
        // Convert position to time and update playhead
        const timeInSeconds = (position.x * 60) / (bpm * MUSIC_CONSTANTS.pulsesPerQuarterNote);
        onTimeChange(timeInSeconds);
      }
    },
    
    onCopy: (items) => {
      const trackIds = items.map(item => item.id);
      const fullTracks = tracks.filter(t => trackIds.includes(t.id));
      setClipboard(fullTracks);
      onCopyTracks?.(fullTracks);
    },
    
    onCut: (items) => {
      const trackIds = items.map(item => item.id);
      const fullTracks = tracks.filter(t => trackIds.includes(t.id));
      setClipboard(fullTracks);
      onCutTracks?.(fullTracks);
    },
    
    onPaste: (position) => {
      // Pass the clipboard content
      if (clipboard.length > 0) {
        onPasteTracks?.(clipboard, position);
      }
    },
    
    onDelete: (itemIds) => {
      onDeleteTracks?.(itemIds);
    },
    
    onDuplicate: (itemIds) => {
      onDuplicateTracks?.(itemIds);
    }
  });
  
  // Update stage size on container resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setStageSize({ width: rect.width, height: rect.height });
        setViewport(prev => ({ ...prev, width: rect.width, height: rect.height }));
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    
    // Also update on a small delay in case the container hasn't fully rendered
    const timeoutId = setTimeout(updateSize, 100);
    
    return () => {
      window.removeEventListener('resize', updateSize);
      clearTimeout(timeoutId);
    };
  }, []);
  
  // Handle viewport changes
  const handleViewportChange = useCallback((newViewport: Viewport) => {
    setViewport(newViewport);
  }, []);
  
  // Handle wheel events for scrolling and zooming
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    
    // Check if zooming (Ctrl/Cmd + wheel)
    if (e.evt.ctrlKey || e.evt.metaKey) {
      // Zoom functionality
      const scaleBy = 1.1;
      const stage = e.target.getStage();
      if (!stage) return;
      
      const oldScale = internalZoom;
      const mousePointTo = {
        x: stage.getPointerPosition()!.x / oldScale - stage.x() / oldScale,
        y: stage.getPointerPosition()!.y / oldScale - stage.y() / oldScale,
      };
      
      // Calculate new scale
      const direction = e.evt.deltaY < 0 ? 1 : -1;
      const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
      const clampedScale = Math.max(0.25, Math.min(4, newScale)); // Limit zoom between 25% and 400%
      
      // Update zoom level
      setInternalZoom(clampedScale);
      onZoomChange?.(clampedScale);
      
      // Adjust viewport to keep mouse position stable
      const newViewport = {
        ...viewport,
        x: mousePointTo.x - (stage.getPointerPosition()!.x / clampedScale),
        y: mousePointTo.y - (stage.getPointerPosition()!.y / clampedScale),
        width: viewport.width,
        height: viewport.height
      };
      
      // Clamp viewport to content bounds
      newViewport.x = Math.max(0, Math.min(totalTimelineWidth / clampedScale - viewport.width, newViewport.x));
      newViewport.y = 0; // Always keep y at 0
      
      setViewport(newViewport);
    } else {
      // Only horizontal scrolling
      const deltaX = e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX || e.evt.deltaY;
      
      const newViewport = {
        ...viewport,
        x: Math.max(0, Math.min(totalTimelineWidth - viewport.width, viewport.x + deltaX)),
        y: 0 // Always keep y at 0
      };
      
      setViewport(newViewport);
    }
  }, [viewport, totalTimelineWidth, totalTimelineHeight, internalZoom]);
  
  // Handle ruler click
  const handleRulerClick = useCallback((value: number) => {
    // value is the measure number, convert to time
    const ticksPerMeasure = MUSIC_CONSTANTS.pulsesPerQuarterNote * timeSignature[0];
    const ticks = value * ticksPerMeasure;
    const timeInSeconds = (ticks * 60) / (bpm * MUSIC_CONSTANTS.pulsesPerQuarterNote);
    onTimeChange(timeInSeconds);
  }, [bpm, timeSignature, onTimeChange]);
  
  // Imperative handle
  useImperativeHandle(ref, () => ({
    playbackCursor: {
      play: () => playbackCursorRef.current?.play(),
      pause: () => playbackCursorRef.current?.pause(),
      stop: () => playbackCursorRef.current?.stop(),
      seek: (time: number) => playbackCursorRef.current?.seek(time)
    },
    scrollTo: (x: number, y: number) => {
      setViewport(prev => ({
        ...prev,
        x: Math.max(0, Math.min(totalTimelineWidth - prev.width, x)),
        y: Math.max(0, Math.min(totalTimelineHeight - prev.height, y))
      }));
    },
    getViewport: () => viewport
  }), [viewport, totalTimelineWidth, totalTimelineHeight]);
  
  // Get drag ghost items
  const dragGhostItems = interaction.isDragging && interaction.draggedItemId
    ? konvaItems
        .filter(item => interaction.selectedIds.includes(item.id))
        .map(item => ({
          id: item.id,
          x: item.x * pixelsPerTick,
          y: item.y,
          width: item.width * pixelsPerTick,
          height: item.height,
          type: 'track' as const,
          label: item.data?.name || 'Track',
          color: item.data?.type === 'AUDIO' ? '#4caf50' : 
                 item.data?.type === 'MIDI' ? '#2196f3' : 
                 item.data?.type === 'DRUM' ? '#ff9800' : '#9c27b0'
        }))
    : [];
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#1a1a1a' }}>
      {/* Time Ruler - positioned at the top */}
      <Box
        sx={{
          height: GRID_CONSTANTS.headerHeight,
          backgroundColor: '#2a2a2a',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <Stage
          width={stageSize.width}
          height={GRID_CONSTANTS.headerHeight}
          x={-viewport.x * internalZoom}
          scaleX={internalZoom}
          style={{ backgroundColor: '#2a2a2a' }}
        >
          <TimeRuler
            width={totalTimelineWidth}
            height={GRID_CONSTANTS.headerHeight}
            measureCount={measureCount}
            pixelsPerMeasure={GRID_CONSTANTS.measureWidth}
            timeSignature={timeSignature}
            bpm={bpm}
            onClick={handleRulerClick}
            viewport={viewport}
            zoom={internalZoom}
          />
        </Stage>
      </Box>
      
      {/* Timeline Container */}
      <Box 
        ref={containerRef}
        sx={{ 
          flex: 1, 
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#1a1a1a',
          cursor: tool === 'select' ? 'default' : 
                  tool === 'pen' ? 'copy' :
                  tool === 'eraser' ? 'crosshair' :
                  tool === 'highlighter' ? 'cell' : 'default'
        }}
      >
        {/* Direct Stage/Layer for testing */}
        <Stage
          ref={(node) => {
            if (node && !stage) {
              setStage(node);
            }
          }}
          width={stageSize.width}
          height={stageSize.height}
        >
          <Layer>
            {/* Background - extend beyond visible area */}
            <Rect
              x={0}
              y={0}
              width={Math.max(stageSize.width, totalTimelineWidth)}
              height={stageSize.height}
              fill="#1a1a1a"
              onMouseDown={(e) => {
                // This ensures the stage receives mouse events for selection rectangle
              }}
            />
            
            {/* Grid lines - render for full measure count */}
            {Array.from({ length: measureCount }).map((_, i) => {
              const x = i * GRID_CONSTANTS.measureWidth * internalZoom - viewport.x * internalZoom;
              
              // Only render if visible
              if (x > stageSize.width || x < -GRID_CONSTANTS.measureWidth * internalZoom) return null;
              
              return (
                <React.Fragment key={`grid-${i}`}>
                  {/* Measure lines */}
                  <Rect
                    x={x}
                    y={0}
                    width={1}
                    height={stageSize.height}
                    fill="rgba(255, 255, 255, 0.1)"
                  />
                  {/* Beat lines */}
                  {timeSignature[0] > 1 && Array.from({ length: timeSignature[0] - 1 }).map((_, j) => {
                    const beatX = x + ((j + 1) * GRID_CONSTANTS.measureWidth * internalZoom / timeSignature[0]);
                    return (
                      <Rect
                        key={`beat-${i}-${j}`}
                        x={beatX}
                        y={0}
                        width={1}
                        height={stageSize.height}
                        fill="rgba(255, 255, 255, 0.05)"
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}
            
          {/* Tracks */}
          {React.useMemo(() => tracks.map((track, index) => {
            const isSelected = interaction.selectedIds.includes(track.id);
            const isBeingDragged = interaction.isDragging && isSelected;
            const isPrimaryDrag = interaction.draggedItemId === track.id;
            // Check if this track is being resized
            // If the resizing track is selected, all selected tracks are being resized
            // Otherwise, only the specific track is being resized
            const resizingTrackIsSelected = interaction.resizingItemId && interaction.selectedIds.includes(interaction.resizingItemId);
            const isBeingResized = interaction.isResizing && (
              resizingTrackIsSelected 
                ? isSelected  // All selected tracks are being resized
                : interaction.resizingItemId === track.id  // Only this specific track
            );
            
            // Get the item from konvaItems to get drag position if available
            const konvaItem = konvaItems.find(item => item.id === track.id);
            
            // Use track's y_position if available, otherwise calculate based on index
            const baseY = track.y_position !== null && track.y_position !== undefined 
              ? track.y_position 
              : index * GRID_CONSTANTS.trackHeight;
            
            // During drag, the position is already updated in the track via onDragMove
            // So we just use the current position
            const trackY = baseY;
            
            // Get preview width and position for this track during resize
            const previewWidth = resizePreviewWidths.get(track.id);
            const previewX = resizePreviewPositions.get(track.id);
            
            // Get drag preview position
            const dragPreview = dragPreviewPositions.get(track.id);
            const trackX = dragPreview ? dragPreview.x : (previewX !== undefined ? previewX : track.x_position * pixelsPerTick);
            const trackDisplayY = dragPreview ? dragPreview.y : trackY;
            
            
            return (
              <KonvaTrack
                  key={track.id}
                  track={track}
                  x={trackX}
                  y={trackDisplayY}
                  width={((track.trim_end_ticks || track.duration_ticks || 0) - (track.trim_start_ticks || 0)) * pixelsPerTick}
                  height={GRID_CONSTANTS.trackHeight}
                isSelected={isSelected}
                isDragging={isBeingDragged}
                isPrimary={isPrimaryDrag}
                isResizing={isBeingResized}
                resizeDirection={interaction.resizeDirection}
                previewWidth={previewWidth}
                pixelsPerTick={pixelsPerTick}
                bpm={bpm}
                timeSignature={timeSignature}
                gridSnapEnabled={gridSnapEnabled}
                snapSizeInPixels={actualSnapSize}
                selectedCount={interaction.selectedIds.length}
                onClick={(id, e) => {
                  // Handle track selection
                  const modifiers = {
                    shiftKey: e.evt.shiftKey,
                    ctrlKey: e.evt.ctrlKey,
                    metaKey: e.evt.metaKey
                  };
                  
                  const isCurrentlySelected = interaction.selectedIds.includes(id);
                  
                  if (modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey) {
                    // Add to selection
                    const newSelection = isCurrentlySelected
                      ? interaction.selectedIds.filter(trackId => trackId !== id)
                      : [...interaction.selectedIds, id];
                    onTrackSelect?.(newSelection);
                  } else if (!isCurrentlySelected) {
                    // Only replace selection if clicking on an unselected track
                    onTrackSelect?.([id]);
                  }
                  // If track is already selected and no modifiers, don't change selection
                  // This allows dragging/resizing multiple selected tracks
                }}
                onMouseDown={(id, e) => {
                  // Start drag via interaction system
                  const stage = e.target.getStage();
                  const pos = stage?.getPointerPosition();
                  if (pos && interaction.startDrag) {
                    interaction.startDrag(id, pos);
                  }
                }}
                onResizeStart={(id, direction, mousePos) => {
                  // Start resize via interaction system
                  if (interaction.startResize) {
                    interaction.startResize(id, direction, mousePos);
                  }
                }}
              />
            );
          }), [
            tracks,
            interaction.selectedIds,
            interaction.isDragging,
            interaction.draggedItemId,
            interaction.isResizing,
            interaction.resizingItemId,
            interaction.resizeDirection,
            konvaItems,
            resizePreviewWidths,
            resizePreviewPositions,
            dragPreviewPositions,
            pixelsPerTick,
            bpm,
            timeSignature,
            gridSnapEnabled,
            actualSnapSize,
            onTrackPositionChange,
            onTrackSelect,
            onTrackResizeEnd
          ])}
          
          {/* Selection Rectangle */}
          {interaction.isSelecting && interaction.selectionRect && (
            <SelectionRect
              start={interaction.selectionRect.start}
              end={interaction.selectionRect.end}
              isActive={true}
            />
          )}
          
          {/* Drag Ghost */}
          {interaction.isDragging && dragGhostItems.length > 0 && (
            <DragGhost
              items={dragGhostItems}
              offset={{
                x: 0, // The interaction system handles positioning
                y: 0
              }}
              opacity={0.6}
              showCountBadge={dragGhostItems.length > 1}
            />
          )}
          
          {/* Playback Cursor */}
          <PlaybackCursor
            ref={playbackCursorRef}
            currentTime={currentTime}
            isPlaying={isPlaying}
            height={totalTimelineHeight}
            pixelsPerTick={pixelsPerTick}
            bpm={bpm}
            timeSignature={timeSignature}
          />
          </Layer>
        </Stage>
      </Box>
    </Box>
  );
});

KonvaTimeline.displayName = 'KonvaTimeline';

export default KonvaTimeline;