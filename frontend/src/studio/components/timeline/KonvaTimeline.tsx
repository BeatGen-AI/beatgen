import React, { useState, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import {
  SelectionRect,
  useKonvaInteractions,
  useCursorManager,
  KonvaItem,
  Tool,
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
import { useAppTheme } from '../../../lib/theme-provider';
import Konva from 'konva';
import { getAudioDuration, calculateAudioDurationTicks } from '../../utils/audioAnalysis';
import { useStudioStore } from '../../stores/studioStore';

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
  
  // Active instances
  activeInstanceByTrack?: Record<string, string>;
  
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
  activeInstanceByTrack = {},
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
  const { studioMode } = useAppTheme();
  
  // Detect if we're on a touch device
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);
  
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
  const [resizeStartPositions, setResizeStartPositions] = useState<Map<string, number>>(new Map());
  const [contentTransforms, setContentTransforms] = useState<Map<string, number>>(new Map());
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  
  // Refs
  const stageRef = useRef<Konva.Stage>(null);
  const konvaBaseRef = useRef<any>(null);
  const playbackCursorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Refs for pinch zoom handling
  const touchStartDistanceRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);
  
  // Sync internal zoom with prop
  useEffect(() => {
    if (zoomLevel !== undefined && zoomLevel !== internalZoom) {
      setInternalZoom(zoomLevel);
    }
  }, [zoomLevel]);
  
  // Sync grid snap size with prop
  useEffect(() => {
    if (propGridSnapSize !== undefined) {
      // If setting to NONE, disable grid snapping but don't change the size
      if (propGridSnapSize === GridSnapOption.NONE) {
        setGridSnapEnabled(false);
      } else {
        // Set the actual snap size and enable snapping if needed
        if (propGridSnapSize !== gridSnapSize) {
          setGridSnapSize(propGridSnapSize);
        }
        if (!gridSnapEnabled) {
          setGridSnapEnabled(true);
        }
      }
    }
  }, [propGridSnapSize, gridSnapSize, gridSnapEnabled]);
  
  // Calculate pixels per tick (moved before calculateContentWidth)
  const pixelsPerTick = useMemo(() => {
    const beatsPerMeasure = timeSignature[0];
    const ticksPerBeat = MUSIC_CONSTANTS.pulsesPerQuarterNote;
    const ticksPerMeasure = ticksPerBeat * beatsPerMeasure;
    const result = (GRID_CONSTANTS.measureWidth * internalZoom) / ticksPerMeasure;
    if (isNaN(result) || result <= 0) {
      console.error('Invalid pixelsPerTick calculation:', { beatsPerMeasure, ticksPerBeat, ticksPerMeasure, internalZoom, result });
      return 1; // Fallback to prevent division by zero
    }
    return result;
  }, [timeSignature, internalZoom]);
  
  // Calculate dimensions
  // Calculate the actual content width based on the rightmost edge of all tracks
  const calculateContentWidth = useMemo(() => {
    let maxRightEdge = 0;
    
    tracks.forEach(track => {
      if (track.instances) {
        track.instances.forEach(instance => {
          // Calculate the right edge of this instance in pixels
          let instanceWidth = instance.trim_end_ticks - instance.trim_start_ticks;
          
          // For AUDIO tracks, use calculated duration only if trim values are invalid
          if (track.track_type === 'AUDIO' && (instanceWidth <= 0 || isNaN(instanceWidth))) {
            const audioDuration = getAudioDuration(track);
            if (audioDuration > 0) {
              const calculatedDurationTicks = calculateAudioDurationTicks(audioDuration, bpm);
              instanceWidth = calculatedDurationTicks - (instance.trim_start_ticks || 0);
            }
          }
          
          const instanceRight = (instance.x_position + instanceWidth) * pixelsPerTick;
          maxRightEdge = Math.max(maxRightEdge, instanceRight);
        });
      }
    });
    
    // Ensure we have at least the minimum width based on measure count
    const minWidth = measureCount * GRID_CONSTANTS.measureWidth * internalZoom;
    
    // Add some padding to the right (e.g., 1 extra measure worth of space)
    const padding = GRID_CONSTANTS.measureWidth * internalZoom;
    
    return Math.max(minWidth, maxRightEdge + padding);
  }, [tracks, measureCount, internalZoom, pixelsPerTick]);
  
  const totalTimelineWidth = calculateContentWidth;
  const totalTimelineHeight = Math.max(600, useStudioStore.getState().getVisibleTrackCount() * GRID_CONSTANTS.trackHeight + 200);
  
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
          
          let width = instance.trim_end_ticks - instance.trim_start_ticks;
          
          // For AUDIO tracks, use calculated duration only if trim values are invalid
          if (track.track_type === 'AUDIO' && (width <= 0 || isNaN(width))) {
            const audioDuration = getAudioDuration(track);
            if (audioDuration > 0) {
              const calculatedDurationTicks = calculateAudioDurationTicks(audioDuration, bpm);
              width = calculatedDurationTicks - (instance.trim_start_ticks || 0);
            }
          }
          
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
            data: { ...track, instanceId: instance.id, instance, trackIndex }
          });
        });
      }
    });
    
    return items;
  }, [tracks, resizePreviewPositions, resizePreviewWidths, dragPreviewPositions, pixelsPerTick]);
  
  // Filter konva items to only include visible ones (viewport culling)
  const visibleKonvaItems = useMemo(() => {
    const buffer = 200; // Add buffer for smooth scrolling
    const viewportLeft = viewport.x - buffer;
    const viewportRight = viewport.x + (stageSize.width || 800) + buffer;
    const viewportTop = viewport.y - buffer;
    const viewportBottom = viewport.y + (stageSize.height || 600) + buffer;
    
    return konvaItems.filter(item => {
      const itemLeft = item.x * pixelsPerTick;
      const itemRight = itemLeft + (item.width * pixelsPerTick);
      const itemTop = item.y;
      const itemBottom = itemTop + item.height;
      
      // Check if item intersects with viewport
      return !(itemRight < viewportLeft || 
               itemLeft > viewportRight || 
               itemBottom < viewportTop || 
               itemTop > viewportBottom);
    });
  }, [konvaItems, viewport, stageSize, pixelsPerTick]);
  
  // Get stage from direct Stage ref
  const [stage, setStage] = useState<Konva.Stage | null>(null);
  
  // Initialize cursor manager
  const cursorManager = useCursorManager(stage);
  
  // Update tool cursor when tool changes
  useEffect(() => {
    cursorManager.setToolCursor(cursorManager.getToolCursor(tool));
  }, [tool, cursorManager]);
  
  // Use the unified interaction system
  const interaction = useKonvaInteractions({
    items: konvaItems,
    stage: stage,
    pixelsPerUnit: pixelsPerTick,
    tool,
    gridSize: gridSnapEnabled ? pixelsToTicks(actualSnapSize, bpm, timeSignature) : 0,
    snapToGrid: gridSnapEnabled,
    trackHeight: GRID_CONSTANTS.trackHeight,
    cursorManager,
    scrollOffset: { x: viewport.x, y: viewport.y },
    
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
    
    onResizeStart: (item, direction) => {
      // Track start position for left resize
      if (direction === 'left') {
        const newStartPositions = new Map();
        
        // Check if this is a group resize
        if (interaction.selectedIds.includes(item.id) && interaction.selectedIds.length > 1) {
          // Track start positions for all selected items
          konvaItems.forEach(konvaItem => {
            if (interaction.selectedIds.includes(konvaItem.id)) {
              const startX = konvaItem.x * pixelsPerTick;
              newStartPositions.set(konvaItem.id, startX);
            }
          });
        } else {
          // Single item resize
          const startX = item.x * pixelsPerTick;
          newStartPositions.set(item.id, startX);
        }
        
        setResizeStartPositions(newStartPositions);
      }
    },
    
    onResizeMove: (updates) => {
      // Update preview widths and positions during resize
      const newPreviewWidths = new Map(resizePreviewWidths);
      const newPreviewPositions = new Map(resizePreviewPositions);
      const newContentTransforms = new Map(contentTransforms);
      
      updates.forEach((dim, instanceId) => {
        if (dim.width !== undefined) {
          // Convert logical width (ticks) to pixels for preview
          const widthInPixels = dim.width * pixelsPerTick;
          newPreviewWidths.set(instanceId, widthInPixels);
        }
        if (dim.start !== undefined) {
          // Convert logical position (ticks) to pixels for preview
          const xInPixels = dim.start * pixelsPerTick;
          newPreviewPositions.set(instanceId, xInPixels);
          
          // Calculate content transform for left resize
          const startX = resizeStartPositions.get(instanceId);
          if (startX !== undefined && interaction.resizeDirection === 'left') {
            const deltaX = xInPixels - startX;
            newContentTransforms.set(instanceId, -deltaX);
          }
        }
      });
      
      setResizePreviewWidths(newPreviewWidths);
      setResizePreviewPositions(newPreviewPositions);
      setContentTransforms(newContentTransforms);
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
      // Clear content transforms after resize ends
      setContentTransforms(new Map());
      setResizeStartPositions(new Map());
      
      // Check if this is a group resize
      if (updates.size > 1 && resizeMultipleInstances) {
        // Group resize - prepare instance updates
        const instanceUpdates: Array<{trackId: string, instanceId: string, widthDelta: number, anchor: 'left' | 'right'}> = [];
        
        console.log('🔍 onResizeEnd - Group resize with updates:', {
          updatesSize: updates.size,
          updates: Array.from(updates.entries()).map(([id, dim]) => ({
            id,
            start: dim.start,
            width: dim.width
          }))
        });
        
        updates.forEach((dim, instanceId) => {
          const item = konvaItems.find(item => item.id === instanceId);
          if (item && item.data) {
            const trackId = item.data.id;
            const instance = item.data.instance;
            if (instance) {
              // Determine resize direction and delta
              if (dim.start !== undefined && dim.width !== undefined) {
                // Left resize - for group resize, still pass position delta
                // The backend treats it as position delta despite the parameter name
                const positionDeltaTicks = dim.start - instance.x_position;
                const deltaPixels = ticksToPixels(positionDeltaTicks, bpm, timeSignature);
                console.log('Group left resize delta calculation:', {
                  instanceId,
                  oldPosition: instance.x_position,
                  newPosition: dim.start,
                  positionDeltaTicks,
                  deltaPixels,
                  oldTrimStart: instance.trim_start_ticks,
                  oldTrimEnd: instance.trim_end_ticks,
                  oldWidth: instance.trim_end_ticks - instance.trim_start_ticks,
                  newWidth: dim.width,
                  expectedNewTrimStart: instance.trim_start_ticks + positionDeltaTicks
                });
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
                // Left resize - pass the position change, not width change
                const positionDeltaTicks = dim.start - instance.x_position;
                const deltaPixels = ticksToPixels(positionDeltaTicks, bpm, timeSignature);
                console.log('Single left resize delta calculation:', {
                  instanceId,
                  oldPosition: instance.x_position,
                  newPosition: dim.start,
                  positionDeltaTicks,
                  deltaPixels,
                  oldTrimStart: instance.trim_start_ticks,
                  oldTrimEnd: instance.trim_end_ticks
                });
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
        // Use clientWidth/clientHeight to exclude scrollbar dimensions
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        setStageSize({ width, height });
        setViewport(prev => ({ ...prev, width, height }));
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
  
  // Handle wheel events on the container div for scrolling
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // Let the browser handle scrolling naturally
    // We don't need custom wheel handling since we're using overflow: 'auto'
    
    // Only handle zoom with Ctrl/Cmd
    if (e.ctrlKey || e.metaKey) {
      // Get the mouse position relative to the timeline for zoom centering
      const rect = containerRef.current?.getBoundingClientRect();
      const mouseX = rect ? e.clientX - rect.left + scrollX : scrollX;
      const timelineX = mouseX / internalZoom;
      
      const scaleBy = 1.1;
      const direction = e.deltaY < 0 ? 1 : -1;
      const newScale = direction > 0 ? internalZoom * scaleBy : internalZoom / scaleBy;
      const clampedScale = Math.max(0.25, Math.min(4, newScale));
      
      setInternalZoom(clampedScale);
      onZoomChange?.(clampedScale);
      
      // Adjust scroll position to keep the mouse position centered
      if (containerRef.current) {
        const newMouseX = timelineX * clampedScale;
        const newScrollX = newMouseX - (mouseX - scrollX);
        containerRef.current.scrollLeft = newScrollX;
      }
    }
  }, [internalZoom, onZoomChange, scrollX]);
  
  // Handle ruler click
  const handleRulerClick = useCallback((timeInSeconds: number) => {
    // Time is already in seconds, just pass it through
    onTimeChange(timeInSeconds);
  }, [onTimeChange]);
  
  // Handle touch events for pinch zoom
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      // Calculate initial horizontal distance between touches
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const horizontalDistance = Math.abs(touch2.clientX - touch1.clientX);
      
      touchStartDistanceRef.current = horizontalDistance;
      touchStartZoomRef.current = internalZoom;
    }
  }, [internalZoom]);
  
  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistanceRef.current !== null) {
      e.preventDefault(); // Prevent browser zoom
      
      // Calculate current horizontal distance between touches
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentHorizontalDistance = Math.abs(touch2.clientX - touch1.clientX);
      
      // Calculate scale based on horizontal distance only
      const scale = currentHorizontalDistance / touchStartDistanceRef.current;
      const newZoom = touchStartZoomRef.current * scale;
      const clampedZoom = Math.max(0.25, Math.min(4, newZoom));
      
      setInternalZoom(clampedZoom);
      onZoomChange?.(clampedZoom);
    }
  }, [onZoomChange]);
  
  const handleTouchEnd = useCallback(() => {
    touchStartDistanceRef.current = null;
  }, []);
  
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative' }}>
      {/* Timeline Container */}
      <div 
        ref={containerRef}
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'auto',
          backgroundColor: studioMode === 'dark' ? '#000000' : '#ffffff',
          // Prevent ALL zoom and pinch gestures - only allow horizontal panning
          touchAction: 'pan-x',
          // Prevent zoom on iOS Safari
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none'
        }}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onScroll={(e) => {
          const target = e.currentTarget;
          const newScrollX = target.scrollLeft;
          const newScrollY = target.scrollTop;
          
          setScrollX(newScrollX);
          setScrollY(newScrollY);
          setViewport(prev => ({
            ...prev,
            x: newScrollX,
            y: newScrollY
          }));
        }}
      >
        {/* Invisible spacer div for scroll dimensions */}
        <div style={{ 
          width: totalTimelineWidth, 
          height: totalTimelineHeight + GRID_CONSTANTS.headerHeight,
          position: 'absolute',
          pointerEvents: 'none'
        }} />
        
        {/* Fixed viewport container */}
        <div style={{
          position: 'sticky',
          top: 0,
          left: 0,
          width: stageSize.width || '100%',
          height: stageSize.height || '100%',
          overflow: 'hidden',
          pointerEvents: 'auto'
        }}>
          {/* Time Ruler - sticky at top */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              height: GRID_CONSTANTS.headerHeight,
              backgroundColor: studioMode === 'dark' ? '#262626' : '#f5f5f5',
              borderTop: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
              borderBottom: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
              overflow: 'hidden'
            }}
          >
            <Stage
              width={stageSize.width || 800}
              height={GRID_CONSTANTS.headerHeight}
              style={{ display: 'block' }}
            >
              <Layer x={-viewport.x}>
                <TimeRuler
                  width={totalTimelineWidth}
                  height={GRID_CONSTANTS.headerHeight}
                  measureCount={Math.ceil(totalTimelineWidth / (GRID_CONSTANTS.measureWidth * internalZoom))}
                  pixelsPerMeasure={GRID_CONSTANTS.measureWidth * internalZoom}
                  timeSignature={timeSignature}
                  bpm={bpm}
                  onClick={handleRulerClick}
                  viewport={{ x: viewport.x, y: 0, width: stageSize.width || 800, height: GRID_CONSTANTS.headerHeight }}
                  zoom={internalZoom}
                  studioMode={studioMode}
                  isTouchDevice={isTouchDevice}
                />
              </Layer>
            </Stage>
          </div>
          
          {/* Main Stage with transformed content */}
          <Stage
            ref={(node) => {
              if (node && !stage) {
                setStage(node);
              }
            }}
            width={stageSize.width || 800}
            height={Math.max(stageSize.height - GRID_CONSTANTS.headerHeight, 600)}
            style={{ 
              display: 'block',
              touchAction: 'auto',
              userSelect: 'none',
              backgroundColor: studioMode === 'dark' ? '#000000' : '#ffffff'
            }}
          >
            <Layer x={-viewport.x} y={-viewport.y}>
            {/* Background - filled to match theme */}
            <Rect
              x={0}
              y={0}
              width={Math.max(totalTimelineWidth, stageSize.width || 800)}
              height={Math.max(stageSize.height, totalTimelineHeight)}
              fill={studioMode === 'dark' ? '#000000' : '#ffffff'}
              onMouseDown={(e) => {
                // This ensures the stage receives mouse events for selection rectangle
              }}
            />
            
            {/* Grid lines - optimized to only render visible measures */}
            {(() => {
              const measureWidth = GRID_CONSTANTS.measureWidth * internalZoom;
              const firstVisibleMeasure = Math.max(0, Math.floor(viewport.x / measureWidth));
              // Calculate total measures needed based on actual content width
              const totalMeasuresNeeded = Math.ceil(totalTimelineWidth / measureWidth);
              const lastVisibleMeasure = Math.min(totalMeasuresNeeded + 1, Math.ceil((viewport.x + (stageSize.width || 800)) / measureWidth) + 1);
              
              return Array.from({ length: lastVisibleMeasure - firstVisibleMeasure + 1 }, (_, idx) => {
                const i = firstVisibleMeasure + idx;
                const x = i * measureWidth;
              
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
                  {i < totalMeasuresNeeded && timeSignature[0] > 1 && Array.from({ length: timeSignature[0] - 1 }).map((_, j) => {
                    const beatX = x + ((j + 1) * GRID_CONSTANTS.measureWidth * internalZoom / timeSignature[0]);
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
                  {i < totalMeasuresNeeded && Array.from({ length: timeSignature[0] }).map((_, beatIndex) => {
                    const beatX = x + (beatIndex * GRID_CONSTANTS.measureWidth * internalZoom / timeSignature[0]);
                    return Array.from({ length: timeSignature[1] - 1 }).map((_, subdivIndex) => {
                      const subdivX = beatX + ((subdivIndex + 1) * GRID_CONSTANTS.measureWidth * internalZoom / (timeSignature[0] * timeSignature[1]));
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
              });
            })()}
            
          {/* Track Instances */}
          {React.useMemo(() => visibleKonvaItems.map((item) => {
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
                contentTransform={contentTransforms.get(item.id) || 0}
                pixelsPerTick={pixelsPerTick}
                bpm={bpm}
                timeSignature={timeSignature}
                gridSnapEnabled={gridSnapEnabled}
                snapSizeInPixels={actualSnapSize}
                selectedCount={interaction.selectedIds.length}
                data={item.data}
                trackColor={item.data?.trackIndex !== undefined ? getTrackColor(item.data.trackIndex) : undefined}
                isTouchDevice={isTouchDevice}
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
                  // Don't open if any track has moved during this interaction
                  if (onTrackClick && !modifiers.shiftKey && !modifiers.ctrlKey && !modifiers.metaKey && !interaction.hasMovedDuringInteraction) {
                    const trackId = item.data?.id;
                    console.log('Track click detected:', { 
                      trackId, 
                      instanceId: id, 
                      item,
                      hasMovedDuringInteraction: interaction.hasMovedDuringInteraction 
                    });
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
            visibleKonvaItems,
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
            onTrackSelect,
            isTouchDevice
          ])}
          
          {/* Selection Rectangle */}
          {interaction.isSelecting && interaction.selectionRect && (
            <SelectionRect
              start={interaction.selectionRect.start}
              end={interaction.selectionRect.end}
              isActive={true}
            />
          )}
          
          {/* Drag Ghost
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
          )} */}
            </Layer>
            
          </Stage>
          
        </div>
      </div>
      
      {/* PlaybackCursor overlay - positioned to cover both ruler and content */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: stageSize.width || 800,
          height: stageSize.height || 600,
          pointerEvents: 'none',
          overflow: 'hidden'
        }}
      >
        <Stage
          width={stageSize.width || 800}
          height={stageSize.height || 600}
          style={{ display: 'block' }}
        >
          <Layer x={-viewport.x}>
            <PlaybackCursor
              ref={playbackCursorRef}
              currentTime={currentTime}
              isPlaying={isPlaying}
              height={stageSize.height || 600}
              pixelsPerTick={pixelsPerTick}
              bpm={bpm}
              timeSignature={timeSignature}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
});

KonvaTimeline.displayName = 'KonvaTimeline';

export default KonvaTimeline;