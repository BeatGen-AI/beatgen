/**
 * TrackSelectionLayer - Provides DAW-like multi-selection functionality for track instances
 * This component wraps the track instance rendering and adds selection capabilities
 */

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { Box } from '@mui/material';
import { useMultiSelection, GridSnapConfig, GridSnapOption } from '../../core/selection';
import { useStudioStore } from '../../stores/studioStore';
import { TrackInstance as TrackInstanceType } from '../../stores/types';
import { CombinedTrack } from 'src/platform/types/project';
import { GRID_CONSTANTS, pixelsToTicks, ticksToPixels } from '../../constants/gridConstants';
import TrackInstance from '../track/TrackInstance';
import { ToolType } from '../shared';

interface TrackSelectionLayerProps {
  tracks: CombinedTrack[];
  allInstances: TrackInstanceType[];
  trackMap: Map<string, CombinedTrack>;
  measureCount: number;
  zoomLevel: number;
  bpm?: number;
  timeSignature?: [number, number];
  totalWidth?: number;
  onTimelineClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  
  // Keep interface simple - tools are managed in store
}

// Extend TrackInstance to match SelectableItem interface
interface SelectableTrackInstance {
  id: string; // instanceId
  x: number;  // position.x in pixels
  y: number;  // position.y in pixels
  width: number; // calculated or stored width
  height: number; // track height
  // Original track instance data
  instance: TrackInstanceType;
  track: CombinedTrack;
}

export default function TrackSelectionLayer({
  tracks,
  allInstances,
  trackMap,
  measureCount,
  zoomLevel,
  bpm = 120,
  timeSignature = [4, 4],
  totalWidth,
  onTimelineClick
}: TrackSelectionLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Store actions for track instance management
  const updateInstancePosition = useStudioStore(state => state.updateInstancePosition);
  const updateInstanceTrim = useStudioStore(state => state.updateInstanceTrim);
  const createTrackInstance = useStudioStore(state => state.createTrackInstance);
  const removeTrackInstance = useStudioStore(state => state.removeTrackInstance);
  
  // Timeline tools state from store
  const selectedTool = useStudioStore(state => state.selectedTool);
  const isSelectionMode = selectedTool === 'select';
  
  // Calculate grid configuration for snapping
  const gridConfig = useMemo((): GridSnapConfig => ({
    enabled: true,
    snapOption: GridSnapOption.BEAT_1_4, // Quarter note snapping
    effectiveGridSize: GRID_CONSTANTS.measureWidth / 16, // 16th note grid
    minWidth: GRID_CONSTANTS.measureWidth / 16,
    pixelsPerTick: undefined // Will use grid snapping instead of tick precision
  }), []);

  // Setup selection manager with full track instance functionality
  const selectionManager = useMultiSelection<SelectableTrackInstance>({
    getAllItems: () => {
      // Convert track instances to selectable items with current coordinates
      return allInstances.map(instance => {
        const track = trackMap.get(instance.trackId);
        if (!track) return null;

        // Calculate actual width including instance-specific trim values
        const startTicks = instance.trimStartTicks ?? track.trim_start_ticks ?? 0;
        const endTicks = instance.trimEndTicks ?? track.trim_end_ticks ?? track.duration_ticks ?? 3840;
        const durationTicks = Math.max(0, endTicks - startTicks);
        const calculatedWidth = instance.width ?? ticksToPixels(durationTicks, bpm, timeSignature);
        
        return {
          id: instance.instanceId,
          x: instance.position.x, // Already in pixels from store
          y: instance.position.y, // Already in pixels from store
          width: Math.max(GRID_CONSTANTS.measureWidth / 16, calculatedWidth), // Minimum width
          height: GRID_CONSTANTS.trackHeight,
          instance,
          track
        };
      }).filter(Boolean) as SelectableTrackInstance[];
    },
    
    updateItems: (updates) => {
      // Batch update all track instance positions and dimensions
      updates.forEach((update, instanceId) => {
        const id = instanceId as string;
        const currentInstance = allInstances.find(i => i.instanceId === id);
        
        if (!currentInstance) return;
        
        // Update position if changed
        if (update.x !== undefined || update.y !== undefined) {
          const newPosition = {
            x: update.x ?? currentInstance.position.x,
            y: update.y ?? currentInstance.position.y
          };
          
          // Snap Y position to track lanes
          const trackLaneIndex = Math.floor(newPosition.y / GRID_CONSTANTS.trackHeight);
          newPosition.y = trackLaneIndex * GRID_CONSTANTS.trackHeight;
          
          updateInstancePosition(id, newPosition);
        }
        
        // Update width/trim if changed
        if (update.width !== undefined) {
          const track = trackMap.get(currentInstance.trackId);
          if (track) {
            // Convert width back to ticks for trim calculation
            const widthInTicks = pixelsToTicks(update.width, bpm, timeSignature);
            const currentStartTicks = currentInstance.trimStartTicks ?? track.trim_start_ticks ?? 0;
            const newEndTicks = currentStartTicks + widthInTicks;
            
            updateInstanceTrim(id, currentStartTicks, newEndTicks, update.width);
          }
        }
      });
    },
    
    createItem: (itemData, position) => {
      // Create new track instance for paste operations
      if (itemData.instance && itemData.track) {
        // Snap position to grid
        const trackLaneIndex = Math.floor(position.y / GRID_CONSTANTS.trackHeight);
        const trackLaneY = trackLaneIndex * GRID_CONSTANTS.trackHeight;
        
        const gridSize = GRID_CONSTANTS.measureWidth / 16; // 16th note grid
        const snappedX = Math.round(position.x / gridSize) * gridSize;
        
        // Create the instance synchronously and return a generated ID
        const newInstanceId = `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create the instance asynchronously
        createTrackInstance(itemData.instance.trackId, {
          x: snappedX,
          y: trackLaneY
        }).then(actualId => {
          // If we get back a different ID, we could update our local state
          // For now, we'll rely on the store updates to refresh the instances
          console.log(`Created track instance with ID: ${actualId}`);
        }).catch(console.error);
        
        return newInstanceId;
      }
      return null;
    },
    
    deleteItem: (instanceId) => {
      removeTrackInstance(instanceId as string);
    },
    
    gridSnap: {
      enabled: gridConfig.enabled,
      sizeX: gridConfig.effectiveGridSize,
      sizeY: GRID_CONSTANTS.trackHeight,
      minWidth: gridConfig.minWidth
    }
  });

  // Track mouse position for paste operations (after selectionManager is initialized)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = e.currentTarget.scrollLeft || 0;
    const scrollTop = e.currentTarget.scrollTop || 0;
    
    const newMousePosition = {
      x: e.clientX - rect.left + scrollLeft,
      y: e.clientY - rect.top + scrollTop
    };
    
    setMousePosition(newMousePosition);

    // Continue with selection rectangle if active - use direct state access like piano roll
    if (selectionManager.isSelecting) {
      selectionManager.updateSelectionRectangle(newMousePosition.x, newMousePosition.y);
    }
  }, [selectionManager]);

  // Debug: log tool changes and selection state (after selectionManager is initialized)
  useEffect(() => {
    console.log('🔧 Selected tool changed to:', selectedTool, 'isSelectionMode:', isSelectionMode);
    console.log('🔧 Tool debug info:', {
      selectedTool,
      isSelectionMode,
      timestamp: new Date().toISOString()
    });
  }, [selectedTool, isSelectionMode]);

  useEffect(() => {
    console.log('🔧 Selection state changed:', {
      isSelecting: selectionManager.isSelecting,
      hasRect: !!selectionManager.selectionRect,
      rect: selectionManager.selectionRect,
      timestamp: new Date().toISOString()
    });
  }, [selectionManager.isSelecting, selectionManager.selectionRect]);

  // Debug: Log selection manager initialization
  useEffect(() => {
    console.log('🔧 SELECTION MANAGER INITIALIZED:', {
      hasSelectionManager: !!selectionManager,
      startSelectionRect: typeof selectionManager.startSelectionRect,
      updateSelectionRectangle: typeof selectionManager.updateSelectionRectangle,
      endSelectionRect: typeof selectionManager.endSelectionRect,
      timestamp: new Date().toISOString()
    });
  }, [selectionManager]);

  // Enhanced keyboard shortcuts with full DAW functionality
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Note: Selection mode is now controlled by the toolbar, not the S key
      
      // Global shortcuts (work when selection mode is active or items are selected)
      if (isSelectionMode || selectionManager.hasSelection()) {
        switch (e.key) {
          case 'c':
          case 'C':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              const success = selectionManager.copySelection();
              if (success) {
                console.log(`Copied ${selectionManager.getSelectionCount()} track instance(s)`);
              }
            }
            break;
            
          case 'v':
          case 'V':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              // Paste at current mouse position with grid snapping
              const gridSize = GRID_CONSTANTS.measureWidth / 16;
              const snappedX = Math.round(mousePosition.x / gridSize) * gridSize;
              const trackLaneIndex = Math.floor(mousePosition.y / GRID_CONSTANTS.trackHeight);
              const snappedY = trackLaneIndex * GRID_CONSTANTS.trackHeight;
              
              const newIds = selectionManager.pasteClipboard(snappedX, snappedY);
              if (newIds.length > 0) {
                console.log(`Pasted ${newIds.length} track instance(s) at (${snappedX}, ${snappedY})`);
              }
            }
            break;
            
          case 'x':
          case 'X':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              // Cut = Copy + Delete
              const success = selectionManager.copySelection();
              if (success) {
                selectionManager.deleteSelection();
                console.log(`Cut ${selectionManager.getSelectionCount()} track instance(s)`);
              }
            }
            break;
            
          case 'Delete':
          case 'Backspace':
            e.preventDefault();
            const deletedCount = selectionManager.getSelectionCount();
            selectionManager.deleteSelection();
            console.log(`Deleted ${deletedCount} track instance(s)`);
            break;
            
          case 'a':
          case 'A':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              selectionManager.selectAll();
              console.log(`Selected all ${selectionManager.getSelectionCount()} track instances`);
            }
            break;
            
          case 'Escape':
            e.preventDefault();
            const wasSelecting = selectionManager.hasSelection();
            selectionManager.clearSelection();
            // Clear selection and switch away from select tool if needed
            if (selectedTool === 'select') {
              // Could switch to a default tool, but for now just clear selection
            }
            if (wasSelecting) {
              console.log('Cleared selection and exited selection mode');
            }
            break;
            
          case 'd':
          case 'D':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              // Duplicate selected items at the mouse position
              const success = selectionManager.copySelection();
              if (success) {
                const gridSize = GRID_CONSTANTS.measureWidth / 16;
                const snappedX = Math.round(mousePosition.x / gridSize) * gridSize;
                const trackLaneIndex = Math.floor(mousePosition.y / GRID_CONSTANTS.trackHeight);
                const snappedY = trackLaneIndex * GRID_CONSTANTS.trackHeight;
                
                const newIds = selectionManager.pasteClipboard(snappedX, snappedY);
                console.log(`Duplicated ${newIds.length} track instance(s)`);
              }
            }
            break;
        }
      }
      
      // Additional DAW-specific shortcuts
      if (selectionManager.hasSelection()) {
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            // Nudge left by one grid unit
            if (e.shiftKey) {
              // Move by larger increment (measure)
              nudgeSelectedTracks(-GRID_CONSTANTS.measureWidth);
            } else {
              // Move by small increment (16th note)
              nudgeSelectedTracks(-GRID_CONSTANTS.measureWidth / 16);
            }
            break;
            
          case 'ArrowRight':
            e.preventDefault();
            // Nudge right by one grid unit
            if (e.shiftKey) {
              nudgeSelectedTracks(GRID_CONSTANTS.measureWidth);
            } else {
              nudgeSelectedTracks(GRID_CONSTANTS.measureWidth / 16);
            }
            break;
            
          case 'ArrowUp':
            e.preventDefault();
            // Move up one track lane
            nudgeSelectedTracks(0, -GRID_CONSTANTS.trackHeight);
            break;
            
          case 'ArrowDown':
            e.preventDefault();
            // Move down one track lane
            nudgeSelectedTracks(0, GRID_CONSTANTS.trackHeight);
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSelectionMode, selectionManager, mousePosition]);

  // Helper function to nudge selected tracks
  const nudgeSelectedTracks = useCallback((deltaX: number, deltaY: number = 0) => {
    if (!selectionManager.hasSelection()) return;
    
    // Get all current items and filter for selected ones
    const allItems = allInstances.map(instance => {
      const track = trackMap.get(instance.trackId);
      if (!track) return null;

      const startTicks = instance.trimStartTicks ?? track.trim_start_ticks ?? 0;
      const endTicks = instance.trimEndTicks ?? track.trim_end_ticks ?? track.duration_ticks ?? 3840;
      const durationTicks = Math.max(0, endTicks - startTicks);
      const calculatedWidth = instance.width ?? ticksToPixels(durationTicks, bpm, timeSignature);
      
      return {
        id: instance.instanceId,
        x: instance.position.x,
        y: instance.position.y,
        width: Math.max(GRID_CONSTANTS.measureWidth / 16, calculatedWidth),
        height: GRID_CONSTANTS.trackHeight,
        instance,
        track
      };
    }).filter(Boolean) as SelectableTrackInstance[];
    
    const selectedItems = allItems.filter(item => 
      selectionManager.isSelected(item.id)
    );
    
    const updates = new Map();
    selectedItems.forEach(item => {
      updates.set(item.id, {
        x: item.x + deltaX,
        y: item.y + deltaY
      });
    });
    
    // Update items through store actions
    updates.forEach((update, instanceId) => {
      const id = instanceId as string;
      const currentInstance = allInstances.find(i => i.instanceId === id);
      
      if (currentInstance && (update.x !== undefined || update.y !== undefined)) {
        const newPosition = {
          x: update.x ?? currentInstance.position.x,
          y: update.y ?? currentInstance.position.y
        };
        
        // Snap Y position to track lanes
        const trackLaneIndex = Math.floor(newPosition.y / GRID_CONSTANTS.trackHeight);
        newPosition.y = trackLaneIndex * GRID_CONSTANTS.trackHeight;
        
        updateInstancePosition(id, newPosition);
      }
    });
    
    console.log(`Nudged ${selectedItems.length} track instance(s) by (${deltaX}, ${deltaY})`);
  }, [selectionManager, allInstances, trackMap, bpm, timeSignature, updateInstancePosition]);

  // Enhanced mouse event handlers with group drag support
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    console.log('🖱️ MOUSE DOWN EVENT:', { 
      tool: selectedTool, 
      target: e.target, 
      currentTarget: e.currentTarget,
      button: e.button,
      isSelectionMode,
      elementClassName: (e.target as HTMLElement).className,
      elementTagName: (e.target as HTMLElement).tagName,
      timestamp: new Date().toISOString()
    });
    
    console.log('🖱️ MOUSE DOWN DETAILS:', {
      selectedTool,
      isSelectionMode,
      containerRef: !!containerRef.current,
      allInstancesCount: allInstances.length,
      trackMapSize: trackMap.size,
      selectionManagerInitialized: !!selectionManager,
      timestamp: new Date().toISOString()
    });
    
    // Update mouse position for all operations
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = e.currentTarget.scrollLeft || 0;
    const scrollTop = e.currentTarget.scrollTop || 0;
    
    const currentX = e.clientX - rect.left + scrollLeft;
    const currentY = e.clientY - rect.top + scrollTop;
    
    console.log('🖱️ Mouse position:', { currentX, currentY, scrollLeft, scrollTop });
    
    setMousePosition({ x: currentX, y: currentY });

    // Check if clicking on a track instance
    const clickedInstance = allInstances.find(instance => {
      const track = trackMap.get(instance.trackId);
      if (!track) return false;

      const startTicks = instance.trimStartTicks ?? track.trim_start_ticks ?? 0;
      const endTicks = instance.trimEndTicks ?? track.trim_end_ticks ?? track.duration_ticks ?? 3840;
      const durationTicks = Math.max(0, endTicks - startTicks);
      const calculatedWidth = instance.width ?? ticksToPixels(durationTicks, bpm, timeSignature);
      const itemWidth = Math.max(GRID_CONSTANTS.measureWidth / 16, calculatedWidth);
      
      return currentX >= instance.position.x && currentX <= instance.position.x + itemWidth &&
             currentY >= instance.position.y && currentY <= instance.position.y + GRID_CONSTANTS.trackHeight;
    });

    if (clickedInstance) {
      // Handle tool-specific actions on track instances
      e.stopPropagation();
      
      switch (selectedTool) {
        case 'select':
          // Selection and drag behavior
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            // Add/remove from selection
            selectionManager.toggleSelection(clickedInstance.instanceId, true);
          } else {
            // Replace selection
            if (!selectionManager.isSelected(clickedInstance.instanceId)) {
              selectionManager.clearSelection();
              selectionManager.toggleSelection(clickedInstance.instanceId, false);
            }
          }

          // Start group drag if multiple items are selected
          if (selectionManager.hasSelection()) {
            const success = selectionManager.beginGroupDrag(clickedInstance.instanceId);
            if (success) {
              console.log(`Started group drag with ${selectionManager.getSelectionCount()} track instance(s)`);
            }
          }
          break;
          
        case 'eraser':
          // Delete the clicked instance
          removeTrackInstance(clickedInstance.instanceId);
          console.log(`Erased track instance: ${clickedInstance.instanceId}`);
          break;
          
        case 'highlighter':
          // Add to selection without clearing existing selection
          selectionManager.toggleSelection(clickedInstance.instanceId, true);
          console.log(`Highlighted track instance: ${clickedInstance.instanceId}`);
          break;
          
        case 'pen':
          // Pen tool on existing instance could duplicate it or select it
          selectionManager.clearSelection();
          selectionManager.toggleSelection(clickedInstance.instanceId, false);
          console.log(`Selected track instance with pen: ${clickedInstance.instanceId}`);
          break;
      }
      return;
    }

    // Not clicking on a track instance - handle tool-specific empty area actions
    switch (selectedTool) {
      case 'select':
        // Always start selection rectangle for select tool
        e.stopPropagation();
        console.log('🖱️ ATTEMPTING SELECTION RECTANGLE START:', { 
          x: currentX, 
          y: currentY, 
          clearExisting: !e.shiftKey,
          selectedTool,
          isSelectionMode,
          timestamp: new Date().toISOString()
        });
        
        console.log('🖱️ SELECTION MANAGER STATE BEFORE START:', {
          isSelecting: selectionManager.isSelecting,
          hasRect: !!selectionManager.selectionRect,
          rect: selectionManager.selectionRect,
          startSelectionRectFunction: typeof selectionManager.startSelectionRect,
          timestamp: new Date().toISOString()
        });
        
        // Call startSelectionRect
        selectionManager.startSelectionRect(currentX, currentY, !e.shiftKey);
        
        console.log('🖱️ SELECTION MANAGER STATE AFTER START:', {
          isSelecting: selectionManager.isSelecting,
          hasRect: !!selectionManager.selectionRect,
          rect: selectionManager.selectionRect,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'highlighter':
        // Start selection rectangle for highlighter tool (additive mode)
        e.stopPropagation();
        selectionManager.startSelectionRect(currentX, currentY, false); // Always additive for highlighter
        console.log('🖍️ Started highlighter selection at:', { x: currentX, y: currentY });
        break;
        
      case 'pen':
        // For pen tool, trigger normal timeline click which might create a track instance
        onTimelineClick?.(e);
        break;
        
      case 'eraser':
        // Eraser tool does nothing on empty areas
        onTimelineClick?.(e);
        break;
        
      default:
        onTimelineClick?.(e);
        break;
    }
  }, [selectedTool, selectionManager, onTimelineClick, allInstances, removeTrackInstance]);

  const handleMouseMoveInternal = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = e.currentTarget.scrollLeft || 0;
    const scrollTop = e.currentTarget.scrollTop || 0;
    
    const currentX = e.clientX - rect.left + scrollLeft;
    const currentY = e.clientY - rect.top + scrollTop;
    
    setMousePosition({ x: currentX, y: currentY });

    // Handle group drag
    if (selectionManager.groupDragState.isActive) {
      const deltaX = currentX - mousePosition.x;
      const deltaY = currentY - mousePosition.y;
      selectionManager.updateGroupDrag(deltaX, deltaY);
      return;
    }

    // Handle selection rectangle - match piano roll pattern with direct state access
    if (selectionManager.isSelecting && selectionManager.selectionRect) {
      console.log('🔄 UPDATING SELECTION RECTANGLE:', { 
        x: currentX, 
        y: currentY,
        isSelecting: selectionManager.isSelecting,
        hasRect: !!selectionManager.selectionRect,
        currentRect: selectionManager.selectionRect,
        timestamp: new Date().toISOString()
      });
      selectionManager.updateSelectionRectangle(currentX, currentY);
      console.log('🔄 SELECTION RECTANGLE AFTER UPDATE:', {
        rect: selectionManager.selectionRect,
        timestamp: new Date().toISOString()
      });
    } else {
      // Debug why selection rectangle isn't updating
      if (selectionManager.isSelecting && !selectionManager.selectionRect) {
        console.log('🔄 SELECTION ISSUE: isSelecting=true but no selectionRect:', {
          isSelecting: selectionManager.isSelecting,
          hasRect: !!selectionManager.selectionRect,
          timestamp: new Date().toISOString()
        });
      }
    }
  }, [selectionManager, mousePosition]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // End group drag
    if (selectionManager.groupDragState.isActive) {
      selectionManager.finishGroupDrag();
      console.log(`Finished group drag of ${selectionManager.getSelectionCount()} track instance(s)`);
      return;
    }

    // End selection rectangle - match piano roll pattern with direct state access
    if (selectionManager.isSelecting && selectionManager.selectionRect) {
      console.log('🔚 Ending selection rectangle, additive:', e.shiftKey);
      selectionManager.endSelectionRect(e.shiftKey);
      console.log('🎯 Selected items count:', selectionManager.getSelectionCount());
    }
  }, [selectionManager]);

  // Helper function to get tool-specific cursor
  const getToolCursor = (tool: ToolType): string => {
    switch (tool) {
      case 'select':
        return 'crosshair';
      case 'pen':
        return `url('/icons/pen.svg') 0 16, auto`;
      case 'highlighter':
        return `url('/icons/highlighter.svg') 0 16, auto`;
      case 'eraser':
        return `url('/icons/eraser.svg') 0 16, auto`;
      default:
        return 'pointer';
    }
  };

  // Get selection rectangle state directly like piano roll
  const selectionRect = selectionManager.selectionRect;
  const isSelecting = selectionManager.isSelecting;

  // Render selection rectangle if active - match piano roll pattern
  const renderSelectionRectangle = () => {
    if (!selectionRect || !isSelecting) return null;

    const x = selectionRect.width < 0 ? selectionRect.startX + selectionRect.width : selectionRect.startX;
    const y = selectionRect.height < 0 ? selectionRect.startY + selectionRect.height : selectionRect.startY;
    const width = Math.abs(selectionRect.width);
    const height = Math.abs(selectionRect.height);

    console.log('🔳 SELECTION RECTANGLE:', { 
      x, y, width, height, 
      startX: selectionRect.startX, startY: selectionRect.startY, 
      rawWidth: selectionRect.width, rawHeight: selectionRect.height,
      isSelecting,
      selectedTool
    });

    return (
      <Box
        sx={{
          position: 'absolute',
          left: x,
          top: y,
          width: Math.max(width, 1), // Ensure minimum 1px visibility
          height: Math.max(height, 1), // Ensure minimum 1px visibility
          border: '2px solid #2196f3',
          backgroundColor: 'rgba(33, 150, 243, 0.15)',
          pointerEvents: 'none',
          zIndex: 1000,
          boxShadow: '0 0 8px rgba(33, 150, 243, 0.3)'
        }}
      />
    );
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: totalWidth ? `${totalWidth}px` : '100%',
        minHeight: '100%',
        cursor: selectionManager.groupDragState.isActive ? 'grabbing' : 
                getToolCursor(selectedTool),
        userSelect: 'none' // Prevent text selection during drag operations
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMoveInternal}
      onMouseUp={handleMouseUp}
    >
      {/* Selection mode indicator and info panel */}
      {isSelectionMode && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            zIndex: 1001
          }}
        >
          <Box
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              fontSize: '12px',
              fontWeight: 500,
              textAlign: 'center'
            }}
          >
            Selection Mode
          </Box>
          
          {selectionManager.hasSelection() && (
            <Box
              sx={{
                bgcolor: 'success.main',
                color: 'success.contrastText',
                px: 1,
                py: 0.5,
                borderRadius: 1,
                fontSize: '11px',
                fontWeight: 500,
                textAlign: 'center'
              }}
            >
              {selectionManager.getSelectionCount()} track{selectionManager.getSelectionCount() !== 1 ? 's' : ''} selected
            </Box>
          )}
          
          {(isSelectionMode || selectionManager.hasSelection()) && (
            <Box
              sx={{
                bgcolor: 'info.main',
                color: 'info.contrastText',
                px: 1,
                py: 0.5,
                borderRadius: 1,
                fontSize: '9px',
                lineHeight: 1.3,
                maxWidth: 220
              }}
            >
              <strong>Selection:</strong><br/>
              • Drag to select multiple<br/>
              • Click + Ctrl/Shift for multi-select<br/>
              • Drag selected items to move<br/>
              <br/>
              <strong>Keyboard Shortcuts:</strong><br/>
              • Ctrl+C/X/V - Copy/Cut/Paste<br/>
              • Ctrl+D - Duplicate<br/>
              • Ctrl+A - Select All<br/>
              • Arrow Keys - Nudge position<br/>
              • Delete - Remove selected<br/>
              • Escape - Clear & exit mode
            </Box>
          )}
        </Box>
      )}

      {/* Render track instances with enhanced selection highlights and drag feedback */}
      {allInstances.map((instance, instanceIndex) => {
        const track = trackMap.get(instance.trackId);
        if (!track) return null;

        const isSelected = selectionManager.isSelected(instance.instanceId);
        const isPrimaryDrag = selectionManager.groupDragState.primaryId === instance.instanceId;
        const isGroupDragging = selectionManager.groupDragState.isActive;

        return (
          <Box
            key={instance.instanceId}
            sx={{
              position: 'relative',
              outline: isSelected ? 
                '3px solid #2196f3' : 
                isSelectionMode ? '1px dashed rgba(33, 150, 243, 0.5)' : 'none',
              outlineOffset: '-2px',
              borderRadius: isSelected || isSelectionMode ? '4px' : '0',
              transition: isGroupDragging ? 'none' : 'all 0.2s ease-in-out',
              transform: isSelected && isGroupDragging ? 'scale(1.02)' : 'scale(1)',
              opacity: isSelected && isGroupDragging ? 0.9 : 1,
              zIndex: isSelected ? 10 : 1,
              cursor: isSelected ? 'grab' : selectedTool === 'select' ? 'pointer' : 'default',
              pointerEvents: selectedTool === 'select' ? 'auto' : 'auto', // Allow mouse events to pass through for selection
              '&:hover': isSelectionMode && !isGroupDragging ? {
                outline: '2px dashed #2196f3',
                backgroundColor: 'rgba(33, 150, 243, 0.05)'
              } : {},
              '&::after': isSelected ? {
                content: '""',
                position: 'absolute',
                top: -4,
                left: -4,
                right: -4,
                bottom: -4,
                backgroundColor: isPrimaryDrag ? 'rgba(33, 150, 243, 0.25)' : 'rgba(33, 150, 243, 0.15)',
                borderRadius: '8px',
                pointerEvents: 'none',
                zIndex: -1,
                border: isPrimaryDrag ? '2px solid #2196f3' : 'none'
              } : {},
              '&::before': isSelected ? {
                content: isPrimaryDrag ? '"◉"' : '"✓"',
                position: 'absolute',
                top: 4,
                right: 4,
                width: 18,
                height: 18,
                backgroundColor: isPrimaryDrag ? '#ff9800' : '#2196f3',
                color: 'white',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isPrimaryDrag ? '8px' : '10px',
                fontWeight: 'bold',
                zIndex: 15,
                pointerEvents: 'none',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              } : {}
            }}
            style={{
              pointerEvents: selectedTool === 'select' ? 'none' : 'auto', // Allow background selection to work
            }}
          >
            {/* Transparent selection overlay when select tool is active */}
            {selectedTool === 'select' && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 15,
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  console.log('🎯 Clicked on track instance:', instance.instanceId);
                  
                  if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    // Add/remove from selection
                    selectionManager.toggleSelection(instance.instanceId, true);
                  } else {
                    // Replace selection
                    if (!selectionManager.isSelected(instance.instanceId)) {
                      selectionManager.clearSelection();
                      selectionManager.toggleSelection(instance.instanceId, false);
                    }
                  }

                  // Start group drag if multiple items are selected
                  if (selectionManager.hasSelection()) {
                    const success = selectionManager.beginGroupDrag(instance.instanceId);
                    if (success) {
                      console.log(`Started group drag with ${selectionManager.getSelectionCount()} track instance(s)`);
                    }
                  }
                }}
              />
            )}
            
            <TrackInstance
              instance={instance}
              track={track}
              index={instanceIndex}
            />
          </Box>
        );
      })}

      {/* Selection rectangle overlay - match piano roll conditional rendering */}
      {selectedTool === 'select' && renderSelectionRectangle()}
    </Box>
  );
}