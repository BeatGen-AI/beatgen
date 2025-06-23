import React, { useState, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Box, useTheme } from '@mui/material';
import { Stage, Layer, Rect } from 'react-konva';
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
import { GRID_CONSTANTS, ticksToPixels, pixelsToTicks, getTrackColor } from '../../constants/gridConstants';
import { MUSIC_CONSTANTS } from '../../constants/musicConstants';
import { GridSnapOption, getSnapSizeInPixels } from '../piano-roll2/gridConstants';
import { useAppTheme } from '../../../platform/theme/ThemeContext';
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
  
  // Group operations for position/resize
  updateMultipleTrackPositions?: (trackIds: string[], deltaX: number, deltaY: number) => void;
  resizeMultipleTracks?: (trackIds: string[], widthDelta: number, anchor: 'left' | 'right') => void;
  
  // Instance operations
  onInstancePositionChange?: (trackId: string, instanceId: string, newPosition: TrackPosition, isDragEnd: boolean) => void;
  onInstanceResizeEnd?: (trackId: string, instanceId: string, deltaPixels: number, direction: 'left' | 'right') => void;
  updateMultipleInstancePositions?: (instanceUpdates: Array<{trackId: string, instanceId: string, deltaX: number, deltaY: number}>) => void;
  resizeMultipleInstances?: (instanceUpdates: Array<{trackId: string, instanceId: string, widthDelta: number, anchor: 'left' | 'right'}>) => void;
  onInstanceDelete?: (trackId: string, instanceId: string) => void;
  onDeleteInstances?: (instances: Array<{trackId: string, instanceId: string}>) => void;
  
  // Track click handler
  onTrackClick?: (trackId: string, instanceId: string) => void;
  
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
  updateMultipleTrackPositions,
  resizeMultipleTracks,
  onInstancePositionChange,
  onInstanceResizeEnd,
  updateMultipleInstancePositions,
  resizeMultipleInstances,
  onInstanceDelete,
  onDeleteInstances,
  onTrackClick,
  onZoomChange
}, ref) => {
  const theme = useTheme();
  const { studioMode } = useAppTheme();
  
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
  const baseTimelineWidth = measureCount * GRID_CONSTANTS.measureWidth;
  const totalTimelineWidth = baseTimelineWidth * internalZoom;
  const totalTimelineHeight = Math.max(600, tracks.length * GRID_CONSTANTS.trackHeight + 200);
  
  // Track scroll position
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  
  // Calculate pixels per tick (without zoom since Stage handles scaling)
  const pixelsPerTick = useMemo(() => {
    const beatsPerMeasure = timeSignature[0];
    const ticksPerBeat = MUSIC_CONSTANTS.pulsesPerQuarterNote;
    const ticksPerMeasure = ticksPerBeat * beatsPerMeasure;
    const result = GRID_CONSTANTS.measureWidth / ticksPerMeasure;
    if (isNaN(result) || result <= 0) {
      console.error('Invalid pixelsPerTick calculation:', { beatsPerMeasure, ticksPerBeat, ticksPerMeasure, result });
      return 1; // Fallback to prevent division by zero
    }
    return result;
  }, [timeSignature]);
  
  // Calculate actual grid snap size
  const effectiveGridSize = GRID_CONSTANTS.measureWidth / (timeSignature[0] * 4);
  const actualSnapSize = useMemo(() => {
    return getSnapSizeInPixels(gridSnapSize, effectiveGridSize);
  }, [gridSnapSize, effectiveGridSize]);
  
  // Convert track instances to KonvaItems
  const konvaItems: KonvaItem[] = useMemo(() => {
    const items: KonvaItem[] = [];
    
    tracks.forEach((track, trackIndex) => {
      // Create items for each instance. If no instances, nothing is rendered for this track.
      if (track.instances) {
        track.instances.forEach(instance => {
          // Validate instance data
          if (!instance || typeof instance.trim_start_ticks !== 'number' || typeof instance.trim_end_ticks !== 'number') {
            console.error(`Invalid instance data for track ${track.id}:`, instance);
            return;
          }
          
          const resizePreviewX = resizePreviewPositions.get(instance.id);
          const resizePreviewWidth = resizePreviewWidths.get(instance.id);
          const dragPreview = dragPreviewPositions.get(instance.id);
          
          let x = instance.x_position;
          if (resizePreviewX !== undefined) {
            x = resizePreviewX / pixelsPerTick;
          }
          if (dragPreview) {
            x = dragPreview.x / pixelsPerTick;
          }
          
          let y = instance.y_position;
          if (dragPreview) {
            y = dragPreview.y;
          }
          
          const width = instance.trim_end_ticks - instance.trim_start_ticks;
          
          // Skip invalid instances
          if (isNaN(x) || isNaN(y) || isNaN(width) || width <= 0) {
            console.warn(`Skipping invalid instance ${instance.id}:`, { 
              x, 
              y, 
              width, 
              trim_start_ticks: instance.trim_start_ticks,
              trim_end_ticks: instance.trim_end_ticks,
              instance 
            });
            return;
          }
          
          items.push({
            id: instance.id,
            x,
            y,
            width: resizePreviewWidth !== undefined 
              ? resizePreviewWidth / pixelsPerTick
              : width,
            height: GRID_CONSTANTS.trackHeight,
            type: 'track' as const,
            data: { ...track, instanceId: instance.id, instance, color: getTrackColor(trackIndex) }
          });
        });
      }
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
      
      // Check if this is a group drag
      if (updates.size > 1) {
        // Group drag - prepare instance updates
        const instanceUpdates: Array<{trackId: string, instanceId: string, deltaX: number, deltaY: number}> = [];
        
        updates.forEach((pos, instanceId) => {
          // Find the track and instance
          const item = konvaItems.find(item => item.id === instanceId);
          if (item && item.data) {
            const trackId = item.data.id;
            const instance = item.data.instance;
            if (instance) {
              const deltaX = pos.x - instance.x_position;
              const deltaY = pos.y - instance.y_position;
              instanceUpdates.push({ trackId, instanceId, deltaX, deltaY });
            }
          }
        });
        
        // Use the group instance update function
        if (updateMultipleInstancePositions) {
          updateMultipleInstancePositions(instanceUpdates);
        }
      } else {
        // Single instance drag
        updates.forEach((pos, instanceId) => {
          const item = konvaItems.find(item => item.id === instanceId);
          if (item && item.data) {
            const trackId = item.data.id;
            if (onInstancePositionChange) {
              onInstancePositionChange(trackId, instanceId, {
                x: pos.x,
                y: pos.y
              }, true);
            }
          }
        });
      }
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
      console.log('🎯 KonvaTimeline - onResizeEnd called', {
        updatesSize: updates.size,
        updates: Array.from(updates.entries()),
        hasResizeMultipleInstances: !!resizeMultipleInstances,
        hasOnInstanceResizeEnd: !!onInstanceResizeEnd,
        hasOnTrackResizeEnd: !!onTrackResizeEnd
      });
      
      // Log details about each update
      updates.forEach((dim, instanceId) => {
        const item = konvaItems.find(item => item.id === instanceId);
        console.log('📏 Update details:', {
          instanceId,
          dim,
          itemFound: !!item,
          itemData: item?.data,
          trackId: item?.data?.id,
          instance: item?.data?.instance
        });
      });
      // Clear preview widths and positions
      setResizePreviewWidths(new Map());
      setResizePreviewPositions(new Map());
      
      // Check if this is a group resize
      if (updates.size > 1 && resizeMultipleInstances) {
        // Group resize - prepare instance updates
        const instanceUpdates: Array<{trackId: string, instanceId: string, widthDelta: number, anchor: 'left' | 'right'}> = [];
        
        updates.forEach((dim, instanceId) => {
          const item = konvaItems.find(item => item.id === instanceId);
          if (item && item.data) {
            const trackId = item.data.id;
            const instance = item.data.instance;
            if (instance) {
              // Determine resize direction and delta
              if (dim.start !== undefined && dim.width !== undefined) {
                // Left resize
                const positionDeltaTicks = dim.start - instance.x_position;
                const deltaPixels = ticksToPixels(positionDeltaTicks, bpm, timeSignature);
                instanceUpdates.push({ trackId, instanceId, widthDelta: deltaPixels, anchor: 'left' });
              } else if (dim.width !== undefined) {
                // Right resize
                const currentWidthTicks = instance.trim_end_ticks - instance.trim_start_ticks;
                const newWidthTicks = dim.width;
                const deltaTicks = newWidthTicks - currentWidthTicks;
                const deltaPixels = ticksToPixels(deltaTicks, bpm, timeSignature);
                instanceUpdates.push({ trackId, instanceId, widthDelta: deltaPixels, anchor: 'right' });
              }
            }
          }
        });
        
        // Use the group resize function
        resizeMultipleInstances(instanceUpdates);
      } else {
        // Single instance resize
        updates.forEach((dim, instanceId) => {
          const item = konvaItems.find(item => item.id === instanceId);
          if (item && item.data) {
            const trackId = item.data.id;
            const instance = item.data.instance;
            if (instance && onInstanceResizeEnd) {
              // For left resize, we need to update the trim
              if (dim.start !== undefined && dim.width !== undefined) {
                // Left resize
                const positionDeltaTicks = dim.start - instance.x_position;
                const deltaPixels = ticksToPixels(positionDeltaTicks, bpm, timeSignature);
                onInstanceResizeEnd(trackId, instanceId, deltaPixels, 'left');
              } else if (dim.width !== undefined) {
                // Right resize - only width changed
                const currentWidthTicks = instance.trim_end_ticks - instance.trim_start_ticks;
                const newWidthTicks = dim.width;
                const deltaTicks = newWidthTicks - currentWidthTicks;
                const deltaPixels = ticksToPixels(deltaTicks, bpm, timeSignature);
                onInstanceResizeEnd(trackId, instanceId, deltaPixels, 'right');
              }
            }
          }
        });
      }
    },
    
    onItemClick: (item, clickTool) => {
      if (clickTool === 'eraser') {
        onTrackDelete?.(item.id);
      } else if (clickTool === 'pen') {
        onTrackDuplicate?.(item.id);
      } else if (clickTool === 'select' && onTrackClick) {
        // Handle track click for opening piano roll/drum machine
        const trackId = item.data?.id;
        const instanceId = item.id;
        if (trackId) {
          onTrackClick(trackId, instanceId);
        }
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
      // Extract unique track IDs from instance items
      const trackIds = [...new Set(items.map(item => item.data?.id).filter(Boolean))];
      const fullTracks = tracks.filter(t => trackIds.includes(t.id));
      setClipboard(fullTracks);
      onCopyTracks?.(fullTracks);
    },
    
    onCut: (items) => {
      // Extract unique track IDs from instance items
      const trackIds = [...new Set(items.map(item => item.data?.id).filter(Boolean))];
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
      // Delete specific instances
      if (itemIds.length === 1 && onInstanceDelete) {
        // Single instance deletion
        const item = konvaItems.find(item => item.id === itemIds[0]);
        if (item && item.data) {
          const trackId = item.data.id;
          const instanceId = item.id;
          onInstanceDelete(trackId, instanceId);
        }
      } else if (itemIds.length > 1 && onDeleteInstances) {
        // Multiple instance deletion
        const instancesToDelete: Array<{trackId: string, instanceId: string}> = [];
        
        itemIds.forEach(itemId => {
          const item = konvaItems.find(item => item.id === itemId);
          if (item && item.data) {
            instancesToDelete.push({
              trackId: item.data.id,
              instanceId: item.id
            });
          }
        });
        
        if (instancesToDelete.length > 0) {
          onDeleteInstances(instancesToDelete);
        }
      }
    },
    
    onDuplicate: (itemIds) => {
      // Extract unique track IDs from instance IDs
      const trackIds = [...new Set(konvaItems
        .filter(item => itemIds.includes(item.id))
        .map(item => item.data?.id)
        .filter(Boolean))];
      onDuplicateTracks?.(trackIds);
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
  
  // Handle scroll events
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollX(target.scrollLeft);
    setScrollY(target.scrollTop);
  }, []);
  
  // Handle wheel events for zoom only
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        
        const scaleBy = 1.1;
        const direction = e.deltaY < 0 ? 1 : -1;
        const newScale = direction > 0 ? internalZoom * scaleBy : internalZoom / scaleBy;
        const clampedScale = Math.max(0.25, Math.min(4, newScale));
        
        setInternalZoom(clampedScale);
        onZoomChange?.(clampedScale);
      }
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [internalZoom, onZoomChange]);
  
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
      if (containerRef.current) {
        containerRef.current.scrollLeft = x;
        containerRef.current.scrollTop = y;
      }
    },
    getViewport: () => ({
      x: scrollX,
      y: scrollY,
      width: stageSize.width,
      height: stageSize.height
    })
  }), [scrollX, scrollY, stageSize]);
  
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
          color: item.data?.color || '#9c27b0'
        }))
    : [];
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Timeline Container */}
      <Box 
        ref={containerRef}
        sx={{ 
          flex: 1, 
          position: 'relative',
          overflow: 'auto',
          backgroundColor: studioMode === 'dark' ? '#1a1a1a' : '#fafafa',
          cursor: tool === 'select' ? 'default' : 
                  tool === 'pen' ? 'copy' :
                  tool === 'eraser' ? 'crosshair' :
                  tool === 'highlighter' ? 'cell' : 'default'
        }}
        onScroll={handleScroll}
      >
        {/* Time Ruler - sticky at top like Timeline */}
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            height: GRID_CONSTANTS.headerHeight,
            width: totalTimelineWidth,
            backgroundColor: studioMode === 'dark' ? '#262626' : '#f5f5f5',
            borderBottom: '1px solid',
            borderColor: theme.palette.divider,
          }}
        >
          <Stage
            width={stageSize.width}
            height={GRID_CONSTANTS.headerHeight}
            x={-scrollX}
            scaleX={internalZoom}
            style={{ 
              position: 'sticky',
              left: 0,
              display: 'block' 
            }}
          >
            <TimeRuler
              width={baseTimelineWidth}
              height={GRID_CONSTANTS.headerHeight}
              measureCount={measureCount}
              pixelsPerMeasure={GRID_CONSTANTS.measureWidth}
              timeSignature={timeSignature}
              bpm={bpm}
              onClick={handleRulerClick}
              viewport={{ x: scrollX / internalZoom, y: 0, width: stageSize.width / internalZoom, height: GRID_CONSTANTS.headerHeight }}
              zoom={internalZoom}
              studioMode={studioMode}
            />
          </Stage>
        </Box>
        
        {/* Scrollable spacer for native scrollbar */}
        <div
          style={{
            width: totalTimelineWidth,
            height: Math.max(stageSize.height, totalTimelineHeight),
            position: 'relative',
          }}
        >
          {/* Viewport-sized Stage that stays in view */}
          <Stage
            ref={(node) => {
              if (node && !stage) {
                setStage(node);
                stageRef.current = node;
              }
            }}
            width={stageSize.width}
            height={Math.max(stageSize.height, totalTimelineHeight)}
            x={-scrollX}
            y={-scrollY}
            scaleX={internalZoom}
            scaleY={1}
            style={{
              position: 'sticky',
              top: 0,
              left: 0,
            }}
          >
            <Layer>
            {/* Background */}
            <Rect
              x={scrollX / internalZoom}
              y={0}
              width={(stageSize.width / internalZoom) + 100}
              height={Math.max(stageSize.height, totalTimelineHeight)}
              fill={studioMode === 'dark' ? '#1a1a1a' : '#fafafa'}
              onMouseDown={(e) => {
                // This ensures the stage receives mouse events for selection rectangle
              }}
            />
            
            {/* Grid lines - similar to Timeline GridOverlay */}
            {Array.from({ length: measureCount + 1 }).map((_, i) => {
              const x = i * GRID_CONSTANTS.measureWidth;
              
              return (
                <React.Fragment key={`grid-${i}`}>
                  {/* Measure lines */}
                  <Rect
                    x={x}
                    y={0}
                    width={1}
                    height={Math.max(stageSize.height, totalTimelineHeight)}
                    fill="rgba(128, 128, 128, 0.8)"
                  />
                  {/* Beat lines */}
                  {i < measureCount && timeSignature[0] > 1 && Array.from({ length: timeSignature[0] - 1 }).map((_, j) => {
                    const beatX = x + ((j + 1) * GRID_CONSTANTS.measureWidth / timeSignature[0]);
                    return (
                      <Rect
                        key={`beat-${i}-${j}`}
                        x={beatX}
                        y={0}
                        width={1}
                        height={Math.max(stageSize.height, totalTimelineHeight)}
                        fill="rgba(128, 128, 128, 0.5)"
                      />
                    );
                  })}
                  {/* Subdivision lines */}
                  {i < measureCount && Array.from({ length: timeSignature[0] }).map((_, beatIndex) => {
                    const beatX = x + (beatIndex * GRID_CONSTANTS.measureWidth / timeSignature[0]);
                    return Array.from({ length: timeSignature[1] - 1 }).map((_, subdivIndex) => {
                      const subdivX = beatX + ((subdivIndex + 1) * GRID_CONSTANTS.measureWidth / (timeSignature[0] * timeSignature[1]));
                      return (
                        <Rect
                          key={`subdiv-${i}-${beatIndex}-${subdivIndex}`}
                          x={subdivX}
                          y={0}
                          width={1}
                          height={Math.max(stageSize.height, totalTimelineHeight)}
                          fill="rgba(128, 128, 128, 0.25)"
                        />
                      );
                    });
                  }).flat()}
                </React.Fragment>
              );
            })}
            
          {/* Track Instances */}
          {React.useMemo(() => konvaItems.map((item) => {
            const isSelected = interaction.selectedIds.includes(item.id);
            const isBeingDragged = interaction.isDragging && isSelected;
            const isPrimaryDrag = interaction.draggedItemId === item.id;
            
            // Check if this item is being resized
            const resizingItemIsSelected = interaction.resizingItemId && interaction.selectedIds.includes(interaction.resizingItemId);
            const isBeingResized = interaction.isResizing && (
              resizingItemIsSelected 
                ? isSelected  // All selected items are being resized
                : interaction.resizingItemId === item.id  // Only this specific item
            );
            
            // Get preview width and position for this item during resize
            const previewWidth = resizePreviewWidths.get(item.id);
            const previewX = resizePreviewPositions.get(item.id);
            
            // Get drag preview position
            const dragPreview = dragPreviewPositions.get(item.id);
            const itemX = dragPreview ? dragPreview.x : (previewX !== undefined ? previewX : item.x * pixelsPerTick);
            const itemDisplayY = dragPreview ? dragPreview.y : item.y;
            const itemWidth = previewWidth !== undefined ? previewWidth : item.width * pixelsPerTick;
            
            // Skip rendering if values are invalid
            if (isNaN(itemX) || isNaN(itemDisplayY) || isNaN(itemWidth) || itemWidth <= 0) {
              console.warn(`Skipping render of invalid track ${item.id}:`, { itemX, itemDisplayY, itemWidth });
              return null;
            }
            
            return (
              <KonvaTrack
                key={item.id}
                track={item.data}
                instanceId={item.id}
                x={itemX}
                y={itemDisplayY}
                width={itemWidth}
                height={item.height}
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
                  // Handle instance selection
                  const modifiers = {
                    shiftKey: e.evt.shiftKey,
                    ctrlKey: e.evt.ctrlKey,
                    metaKey: e.evt.metaKey
                  };
                  
                  const isCurrentlySelected = interaction.selectedIds.includes(id);
                  
                  if (modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey) {
                    // Add to selection
                    const newSelection = isCurrentlySelected
                      ? interaction.selectedIds.filter(itemId => itemId !== id)
                      : [...interaction.selectedIds, id];
                    onTrackSelect?.(newSelection);
                  } else if (!isCurrentlySelected) {
                    // Only replace selection if clicking on an unselected item
                    onTrackSelect?.([id]);
                  }
                  // If item is already selected and no modifiers, don't change selection
                  // This allows dragging/resizing multiple selected items
                  
                  // Also handle track click for opening piano roll/drum machine
                  if (selectedTool === 'select' && onTrackClick && !modifiers.shiftKey && !modifiers.ctrlKey && !modifiers.metaKey) {
                    const trackId = item.data?.id;
                    console.log('Track click detected:', { trackId, instanceId: id, item });
                    if (trackId) {
                      onTrackClick(trackId, id);
                    }
                  }
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
            konvaItems,
            interaction.selectedIds,
            interaction.isDragging,
            interaction.draggedItemId,
            interaction.isResizing,
            interaction.resizingItemId,
            interaction.resizeDirection,
            resizePreviewWidths,
            resizePreviewPositions,
            dragPreviewPositions,
            pixelsPerTick,
            bpm,
            timeSignature,
            gridSnapEnabled,
            actualSnapSize,
            onTrackSelect
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
        </div>
      </Box>
    </Box>
  );
});

KonvaTimeline.displayName = 'KonvaTimeline';

export default KonvaTimeline;