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
import { GRID_CONSTANTS, ticksToPixels, pixelsToTicks, getTrackColor } from '../../constants/gridConstants';
import { MUSIC_CONSTANTS } from '../../constants/musicConstants';
import { GridSnapOption, getSnapSizeInPixels } from '../piano-roll2/gridConstants';
import { getDefaultInstance, updateMultipleInstances, getInstanceWidth } from '../../utils/trackInstanceUtils';
import { useStudioStore } from '../../stores/studioStore';
import { Actions } from '../../core/state/history/actions';
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
  updateTrack?: (trackId: string, updates: Partial<CombinedTrack>) => void;
  
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
  
  // New instance operations
  onInstanceCreate?: (trackId: string, x: number, width: number) => void;
  onInstanceDelete?: (trackId: string, instanceId: number) => void;
  onBatchInstanceUpdate?: (updates: Map<string, Array<{ id: number; changes: Partial<{ x: number; width: number; name: string }> }>>) => void;
  onInstanceSplit?: (trackId: string, instanceId: number, splitPosition: number) => void;
  
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
  updateTrack,
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
  onInstanceCreate,
  onInstanceDelete,
  onBatchInstanceUpdate,
  onInstanceSplit,
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
    
    // Safety check
    if (isNaN(result) || result <= 0) {
      console.error('[KonvaTimeline] Invalid pixelsPerTick calculated:', {
        beatsPerMeasure,
        ticksPerBeat,
        ticksPerMeasure,
        measureWidth: GRID_CONSTANTS.measureWidth,
        internalZoom,
        result
      });
      return 0.5; // Fallback value
    }
    
    return result;
  }, [timeSignature, internalZoom]);
  
  // Calculate actual grid snap size
  const effectiveGridSize = GRID_CONSTANTS.measureWidth / (timeSignature[0] * 4);
  const actualSnapSize = useMemo(() => {
    return getSnapSizeInPixels(gridSnapSize, effectiveGridSize);
  }, [gridSnapSize, effectiveGridSize]);
  
  // Store drag start positions for delta calculations
  const dragStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  
  // Convert track instances to KonvaItems
  const konvaItems: KonvaItem[] = useMemo(() => {
    console.log('[KonvaTimeline] Recalculating konvaItems');
    const items: KonvaItem[] = [];
    
    tracks.forEach((track, trackIndex) => {
      // Get instances from metadata or create default
      let instances = track.instance_metadata?.instances || [];
      
      // Backward compatibility: create default instance if none exist
      if (instances.length === 0 && track.duration_ticks > 0) {
        instances = [getDefaultInstance(track)];
        console.log('[KonvaTimeline] Created default instance for track:', track.id, instances);
        console.log('[KonvaTimeline] Track instance_metadata:', track.instance_metadata);
        
        // Important: We need to update the track with instance_metadata
        // But we can't do it here in the render function - it would cause infinite loops
        // Instead, the track should be updated when it's first created or loaded
      }
      
      // Get track color based on its index
      const trackColor = getTrackColor(trackIndex);
      
      instances.forEach(instance => {
        // Create unique ID combining track and instance
        const itemId = `${track.id}_${instance.id}`;
        
        // Check for preview positions (during drag/resize)
        const resizePreviewX = resizePreviewPositions.get(itemId);
        const resizePreviewWidth = resizePreviewWidths.get(itemId);
        const dragPreview = dragPreviewPositions.get(itemId);
        
        // Calculate position
        let x = instance.x || 0;
        if (resizePreviewX !== undefined && !isNaN(resizePreviewX)) {
          x = resizePreviewX / pixelsPerTick;
        }
        
        // Safety check for NaN position
        if (isNaN(x)) {
          console.error('[KonvaTimeline] Invalid x position:', {
            itemId,
            instanceX: instance.x,
            resizePreviewX,
            pixelsPerTick
          });
          x = 0;
        }
        
        // Don't use drag preview since we're updating positions directly
        
        // Log actual position values
        console.log('[KonvaTimeline] Item position calculation:', {
          itemId,
          instanceX: instance.x,
          finalX: x,
          pixelsPerTick
        });
        
        // Calculate Y position - use instance Y
        let y = instance.y || 0;
        
        // Safety check for NaN Y position
        if (isNaN(y)) {
          console.error('[KonvaTimeline] Invalid y position:', {
            itemId,
            instanceY: instance.y
          });
          y = 0;
        }
        
        // Calculate width from track duration and trims
        let width = getInstanceWidth(track, instance);
        if (resizePreviewWidth !== undefined && !isNaN(resizePreviewWidth)) {
          width = resizePreviewWidth / pixelsPerTick;
        }
        
        // Safety check for NaN
        if (isNaN(width) || width <= 0) {
          console.error('[KonvaTimeline] Invalid width calculated:', {
            itemId,
            width,
            trackDuration: track.duration_ticks,
            instanceTrimStart: instance.trim_start_ticks,
            instanceTrimEnd: instance.trim_end_ticks,
            resizePreviewWidth
          });
          width = 100; // Default fallback width
        }
        
        items.push({
          id: itemId,
          x,
          y,
          width,
          height: GRID_CONSTANTS.trackHeight,
          type: 'track' as const,
          data: {
            trackId: track.id,
            track,
            instanceId: instance.id,
            instance,
            color: trackColor // Pass color from track
          }
        });
      });
    });
    
    return items;
  }, [tracks, resizePreviewPositions, resizePreviewWidths, dragPreviewPositions, pixelsPerTick, selectedTrackIds]);
  
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
    
    onDragStart: (items) => {
      // Store initial positions when drag starts
      dragStartPositions.current.clear();
      items.forEach(item => {
        dragStartPositions.current.set(item.id, { x: item.x, y: item.y });
      });
    },
    
    
    onDragMove: (updates) => {
      // Always handle as instance moves - update positions directly
      updates.forEach((pos, itemId) => {
        const lastUnderscoreIndex = itemId.lastIndexOf('_');
        if (lastUnderscoreIndex === -1) return;
        
        const trackId = itemId.substring(0, lastUnderscoreIndex);
        const instanceIdStr = itemId.substring(lastUnderscoreIndex + 1);
        
        console.log('[KonvaTimeline] Drag move - updating instance:', { trackId, instanceIdStr, x: pos.x, y: pos.y });
        
        // Update instance position during drag (no history)
        onInstancePositionChange?.(trackId, instanceIdStr, { x: pos.x, y: pos.y }, false);
      });
      
      // Clear any drag preview since we're updating positions directly
      setDragPreviewPositions(new Map());
    },
    
    onDragEnd: (updates) => {
      console.log('[KonvaTimeline] onDragEnd called with updates:', updates);
      
      // Clear drag preview AFTER we process the updates
      const clearPreview = () => {
        console.log('[KonvaTimeline] Clearing drag preview');
        setDragPreviewPositions(new Map());
      };
      
      // We'll clear drag start positions at the end
      const clearDragStart = () => {
        console.log('[KonvaTimeline] Clearing drag start positions');
        dragStartPositions.current.clear();
      };
      
      // Always handle as instance moves - each update is for a specific instance
      console.log('[KonvaTimeline] Processing instance position updates');
      
      // Check if we're moving multiple instances
      if (updates.size > 1 && updateMultipleInstancePositions) {
        // Multiple instances selected - batch update
        const instanceUpdates: Array<{trackId: string, instanceId: string, deltaX: number, deltaY: number}> = [];
        
        updates.forEach((pos, itemId) => {
          const lastUnderscoreIndex = itemId.lastIndexOf('_');
          if (lastUnderscoreIndex === -1) return;
          
          const trackId = itemId.substring(0, lastUnderscoreIndex);
          const instanceIdStr = itemId.substring(lastUnderscoreIndex + 1);
          
          // Get original position
          const originalPos = dragStartPositions.current.get(itemId);
          if (!originalPos) {
            console.error('[KonvaTimeline] No drag start position found for:', itemId);
            return;
          }
          
          const deltaX = pos.x - originalPos.x;
          const deltaY = pos.y - originalPos.y;
          
          instanceUpdates.push({
            trackId,
            instanceId: instanceIdStr,
            deltaX,
            deltaY
          });
        });
        
        console.log('[KonvaTimeline] Batch updating multiple instances:', instanceUpdates);
        updateMultipleInstancePositions(instanceUpdates);
        
      } else {
        // Single instance - just update it
        updates.forEach((pos, itemId) => {
          // Parse composite ID
          const lastUnderscoreIndex = itemId.lastIndexOf('_');
          if (lastUnderscoreIndex === -1) return;
          
          const trackId = itemId.substring(0, lastUnderscoreIndex);
          const instanceIdStr = itemId.substring(lastUnderscoreIndex + 1);
          
          console.log('[KonvaTimeline] Drag end - finalizing instance:', { trackId, instanceIdStr, x: pos.x, y: pos.y });
          
          // Call position change with isDragEnd=true to create history
          onInstancePositionChange?.(trackId, instanceIdStr, { x: pos.x, y: pos.y }, true);
        });
      }
      
      // Clear immediately since we're not using preview for instances
      clearDragStart();
      clearPreview();
    },
    
    onResizeMove: (updates) => {
      // Update preview widths and positions during resize
      const newPreviewWidths = new Map(resizePreviewWidths);
      const newPreviewPositions = new Map(resizePreviewPositions);
      
      updates.forEach((dim, itemId) => {
        if (dim.width !== undefined && !isNaN(dim.width)) {
          // Convert logical width (ticks) to pixels for preview
          const widthInPixels = dim.width * pixelsPerTick;
          newPreviewWidths.set(itemId, widthInPixels);
        }
        if (dim.start !== undefined && !isNaN(dim.start)) {
          // Convert logical position (ticks) to pixels for preview
          const xInPixels = dim.start * pixelsPerTick;
          newPreviewPositions.set(itemId, xInPixels);
        }
      });
      
      setResizePreviewWidths(newPreviewWidths);
      setResizePreviewPositions(newPreviewPositions);
    },
    
    onResizeEnd: (updates) => {
      // Clear preview widths and positions
      setResizePreviewWidths(new Map());
      setResizePreviewPositions(new Map());
      
      // Handle resize end for each item
      updates.forEach((dim, itemId) => {
        const item = konvaItems.find(item => item.id === itemId);
        if (!item || !item.data) return;
        
        const trackId = item.data.trackId;
        const instance = item.data.instance;
        const track = item.data.track;
        
        if (!instance || !onInstanceResizeEnd) return;
        
        // Extract instance ID
        const instanceIdNum = parseInt(itemId.split('_').pop() || '0');
        
        // For left resize
        if (dim.start !== undefined && dim.width !== undefined) {
          const positionDeltaTicks = dim.start - instance.x;
          const deltaPixels = ticksToPixels(positionDeltaTicks, bpm, timeSignature);
          onInstanceResizeEnd(trackId, String(instanceIdNum), deltaPixels, 'left');
        } 
        // For right resize
        else if (dim.width !== undefined) {
          const currentWidthTicks = getInstanceWidth(track, instance);
          const newWidthTicks = dim.width;
          const deltaTicks = newWidthTicks - currentWidthTicks;
          const deltaPixels = ticksToPixels(deltaTicks, bpm, timeSignature);
          onInstanceResizeEnd(trackId, String(instanceIdNum), deltaPixels, 'right');
        }
      });
        // Group resize - collect all updates and batch them
        const trackUpdates = new Map<string, Array<{ id: number; changes: Partial<{ x: number; y: number; trim_start_ticks: number; trim_end_ticks: number }> }>>();
        
        updates.forEach((dim, itemId) => {
          const item = konvaItems.find(item => item.id === itemId);
          if (item && item.data) {
            const trackId = item.data.trackId;
            const instance = item.data.instance;
            const track = item.data.track;
            if (instance) {
              // Extract instance ID from composite itemId
              const instanceIdNum = parseInt(itemId.split('_').pop() || '0');
              
              let changes: Partial<{ x: number; y: number; trim_start_ticks: number; trim_end_ticks: number }> = {};
              
              // For left resize, we need to update position and trim_start
              if (dim.start !== undefined && dim.width !== undefined) {
                // Left resize
                const positionDeltaTicks = dim.start - instance.x;
                const deltaTicks = positionDeltaTicks;
                
                changes.x = instance.x + deltaTicks;
                changes.trim_start_ticks = Math.max(0, instance.trim_start_ticks + deltaTicks);
              } else if (dim.width !== undefined) {
                // Right resize - only width changed, update trim_end
                const currentWidthTicks = getInstanceWidth(track, instance);
                const newWidthTicks = dim.width;
                const deltaTicks = newWidthTicks - currentWidthTicks;
                
                // When width increases (positive delta), trim_end should decrease
                const newTrimEnd = Math.max(0, instance.trim_end_ticks - deltaTicks);
                const maxTrimEnd = track.duration_ticks - instance.trim_start_ticks - 1;
                changes.trim_end_ticks = Math.min(newTrimEnd, maxTrimEnd);
              }
              
              // Add to batch updates
              if (!trackUpdates.has(trackId)) {
                trackUpdates.set(trackId, []);
              }
              trackUpdates.get(trackId)!.push({
                id: instanceIdNum,
                changes
              });
            }
          }
        });
        
        // Execute batch update
        if (trackUpdates.size > 0) {
          onBatchInstanceUpdate(trackUpdates);
        }
      } else {
        // Single instance resize
        updates.forEach((dim, itemId) => {
          const item = konvaItems.find(item => item.id === itemId);
          if (item && item.data) {
            const trackId = item.data.trackId;
            const instance = item.data.instance;
            if (instance && onInstanceResizeEnd) {
              // For left resize, we need to update the trim
              if (dim.start !== undefined && dim.width !== undefined) {
                // Left resize
                const positionDeltaTicks = dim.start - instance.x;
                const deltaPixels = ticksToPixels(positionDeltaTicks, bpm, timeSignature);
                // Extract instance ID from composite itemId
                const instanceIdNum = parseInt(itemId.split('_').pop() || '0');
                onInstanceResizeEnd(trackId, String(instanceIdNum), deltaPixels, 'left');
              } else if (dim.width !== undefined) {
                // Right resize - only width changed
                const track = item.data.track;
                const currentWidthTicks = getInstanceWidth(track, instance);
                const newWidthTicks = dim.width;
                const deltaTicks = newWidthTicks - currentWidthTicks;
                const deltaPixels = ticksToPixels(deltaTicks, bpm, timeSignature);
                // Extract instance ID from composite itemId
                const instanceIdNum = parseInt(itemId.split('_').pop() || '0');
                onInstanceResizeEnd(trackId, String(instanceIdNum), deltaPixels, 'right');
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
      const trackIds = [...new Set(items.map(item => item.data?.trackId).filter(Boolean))];
      const fullTracks = tracks.filter(t => trackIds.includes(t.id));
      setClipboard(fullTracks);
      onCopyTracks?.(fullTracks);
    },
    
    onCut: (items) => {
      // Extract unique track IDs from instance items
      const trackIds = [...new Set(items.map(item => item.data?.trackId).filter(Boolean))];
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
      // For delete, we might want to delete specific instances, not entire tracks
      // TODO: Implement instance-specific delete
      // For now, extract track IDs and delete entire tracks
      const trackIds = [...new Set(konvaItems
        .filter(item => itemIds.includes(item.id))
        .map(item => item.data?.trackId)
        .filter(Boolean))];
      onDeleteTracks?.(trackIds);
    },
    
    onDuplicate: (itemIds) => {
      // Extract unique track IDs from instance IDs
      const trackIds = [...new Set(konvaItems
        .filter(item => itemIds.includes(item.id))
        .map(item => item.data?.trackId)
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
            
            return (
              <KonvaTrack
                key={item.id}
                track={item.data.track}
                instanceId={item.data.instanceId}
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
                data={item.data} // Pass the full data for color and other props
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
      </Box>
    </Box>
  );
});

KonvaTimeline.displayName = 'KonvaTimeline';

export default KonvaTimeline;