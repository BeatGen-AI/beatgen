import React, { forwardRef, useRef, useImperativeHandle, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { GRID_CONSTANTS, calculatePositionTime, ticksToPixels, pixelsToTicks, calculateTrackWidth } from '../../constants/gridConstants';
import Track from '../track/Track';
import PlaybackCursor, { PlaybackCursorRef } from './PlaybackCursor';
import { CombinedTrack } from 'src/platform/types/project';
import { Position } from '../track/types';
import { useAppTheme } from '../../../platform/theme/ThemeContext';
import { cn } from '@/lib/utils';
import { useInteractionManager, SelectionOverlay, InteractionToolbar, Tool } from '../../shared/interactions';
import { getSnapSizeInPixels, GridSnapOption } from '../piano-roll2/gridConstants';

export interface TimelineProps {
  tracks: CombinedTrack[];
  currentTime?: number;
  isPlaying?: boolean;
  measureCount?: number;
  zoomLevel?: number;
  bpm?: number;
  timeSignature?: [number, number];
  onTrackPositionChange?: (trackId: string, newPosition: Position, isDragEnd: boolean) => void;
  onTimeChange?: (newTime: number) => void;
  gridLineStyle?: {
    borderRight: string;
  };
  sx?: SxProps<Theme>;
  
  // Shared interaction system props
  selectedTool?: Tool;
  onToolChange?: (tool: Tool) => void;
  showToolbar?: boolean;
  onTrackSelect?: (trackIds: string[]) => void;
  onTrackDelete?: (trackId: string) => void;
  onTrackDuplicate?: (trackId: string) => void;
  selectedTrackIds?: string[];
  
  // Group operations for clipboard functionality
  onCopyTracks?: (tracks: CombinedTrack[]) => void;
  onCutTracks?: (tracks: CombinedTrack[]) => void;
  onPasteTracks?: (tracks: CombinedTrack[], position?: { x: number; y: number }) => void;
  onDeleteTracks?: (trackIds: string[]) => void;
  onDuplicateTracks?: (trackIds: string[]) => void;
}

// Define imperative handle interface
export interface TimelineRef {
  playbackCursor: {
    play: () => void;
    pause: () => void;
    stop: () => void;
    seek: (time: number) => void;
  };
  // Include the HTMLDivElement methods we need
  addEventListener: HTMLDivElement['addEventListener'];
  removeEventListener: HTMLDivElement['removeEventListener'];
  // Include properties we need for scroll handling
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export const Timeline = forwardRef<TimelineRef, TimelineProps>(({
  tracks,
  currentTime = 0,
  isPlaying = false,
  measureCount = GRID_CONSTANTS.measureCount,
  zoomLevel = 1,
  bpm = 120,
  timeSignature = [4, 4],
  onTrackPositionChange = () => {},
  onTimeChange = () => {},
  gridLineStyle = {
    borderRight: `${GRID_CONSTANTS.borderWidth} solid ${GRID_CONSTANTS.borderColor}`
  },
  sx,
  selectedTool = 'select',
  onToolChange,
  showToolbar = false,
  onTrackSelect,
  onTrackDelete,
  onTrackDuplicate,
  selectedTrackIds = [],
  onCopyTracks,
  onCutTracks,
  onPasteTracks,
  onDeleteTracks,
  onDuplicateTracks
}, ref) => {
  const theme = useTheme();
  // Calculate the total width needed for the entire timeline
  const totalTimelineWidth = measureCount * GRID_CONSTANTS.measureWidth;
  
  // Refs for the cursor and container
  const cursorRef = useRef<PlaybackCursorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track if we just completed a selection
  const [justCompletedSelection, setJustCompletedSelection] = useState(false);
  
  // State for group drag operations
  const [groupDragState, setGroupDragState] = useState<{
    isDragging: boolean;
    initialPositions: Record<string, { x: number; y: number }>;
    draggedTrackId: string | null;
  }>({
    isDragging: false,
    initialPositions: {},
    draggedTrackId: null
  });

  // State for grid snap options
  const [gridSnapSize, setGridSnapSize] = useState(GridSnapOption.STEP); // Default to "Step" snap
  const [gridSnapEnabled, setGridSnapEnabled] = useState(true);
  
  // Calculate actual grid size based on snap option
  const effectiveGridSize = GRID_CONSTANTS.measureWidth / (timeSignature[0] * 4); // Size of one step
  const actualSnapSize = React.useMemo(() => {
    return getSnapSizeInPixels(gridSnapSize, effectiveGridSize);
  }, [gridSnapSize, effectiveGridSize]);
  
  // Initialize interaction manager for track selection
  const interaction = useInteractionManager({
    initialTool: selectedTool,
    snapToGrid: gridSnapEnabled,
    gridSize: actualSnapSize,
    onSelectionChange: (selectedIds) => {
      onTrackSelect?.(selectedIds);
    },
    onDragStart: (itemId, selectedIds) => {
      console.log('[Timeline] onDragStart called:', { itemId, selectedIds });
      
      // Determine which tracks will be affected by the drag
      const tracksToMove = selectedIds.length > 1 && selectedIds.includes(itemId) 
        ? selectedIds 
        : [itemId];
      
      console.log('[Timeline] Tracks to move:', tracksToMove);
      
      // Store initial positions for all tracks that will be moved
      const initialPositions: Record<string, { x: number; y: number }> = {};
      tracksToMove.forEach(trackId => {
        const track = tracks.find(t => t.id === trackId);
        if (track) {
          initialPositions[trackId] = {
            x: track.x_position,
            y: track.y_position
          };
          console.log('[Timeline] Storing initial position for track:', {
            trackId,
            x_position: track.x_position,
            y_position: track.y_position
          });
        }
      });
      
      console.log('[Timeline] Initial positions stored:', initialPositions);
      
      // Update group drag state
      setGroupDragState({
        isDragging: true,
        initialPositions,
        draggedTrackId: itemId
      });
    },
    onDragMove: (itemId, delta) => {
      console.log('[Timeline] onDragMove called:', {
        itemId,
        delta,
        selectedIds: interaction.selectionState.selectedIds,
        groupDragState: groupDragState.isDragging,
        initialPositions: Object.keys(groupDragState.initialPositions)
      });
      
      // The delta is already snapped by the interaction manager
      // Convert the snapped pixel delta to ticks
      const deltaTicks = pixelsToTicks(Math.abs(delta.x), bpm, timeSignature) * (delta.x >= 0 ? 1 : -1);
      
      // Determine if this is a group drag based on how many tracks we stored initial positions for
      const tracksInGroup = Object.keys(groupDragState.initialPositions);
      const isGroupDrag = tracksInGroup.length > 1 && tracksInGroup.includes(itemId);
      
      console.log('[Timeline] Drag mode:', { 
        isGroupDrag, 
        deltaTicks, 
        deltaPixels: delta.x,
        tracksInGroup,
        itemId,
        snapSize: actualSnapSize
      });
      
      // Calculate snap size in ticks for position snapping
      const snapSizeTicks = pixelsToTicks(actualSnapSize, bpm, timeSignature);
      
      if (isGroupDrag) {
        // For group drag, first calculate the new position of the dragged track
        const draggedInitialPos = groupDragState.initialPositions[itemId];
        if (!draggedInitialPos) return;
        
        // Calculate intended position for the dragged track
        let draggedNewX = draggedInitialPos.x + deltaTicks;
        let draggedNewY = draggedInitialPos.y + delta.y;
        
        // Snap X position if enabled
        if (gridSnapEnabled && gridSnapSize !== GridSnapOption.NONE) {
          draggedNewX = Math.floor(draggedNewX / snapSizeTicks) * snapSizeTicks;
        }
        
        // Snap Y to track row height
        draggedNewY = Math.floor(draggedNewY / GRID_CONSTANTS.trackHeight) * GRID_CONSTANTS.trackHeight;
        
        // Apply boundaries to dragged track
        draggedNewX = Math.max(0, draggedNewX);
        draggedNewY = Math.max(0, draggedNewY);
        
        // Calculate the actual delta from initial to bounded position
        const actualDeltaX = draggedNewX - draggedInitialPos.x;
        const actualDeltaY = draggedNewY - draggedInitialPos.y;
        
        // Apply the same delta to all tracks in the group to maintain relative positions
        tracksInGroup.forEach(trackId => {
          const initialPos = groupDragState.initialPositions[trackId];
          if (initialPos) {
            // Apply the same delta to maintain relative positions
            const newX = Math.max(0, initialPos.x + actualDeltaX);
            const newY = Math.max(0, initialPos.y + actualDeltaY);
            
            console.log('[Timeline] Moving track in group:', { 
              trackId, 
              initialX: initialPos.x, 
              initialY: initialPos.y,
              newX, 
              newY,
              actualDeltaX,
              actualDeltaY
            });
            onTrackPositionChange?.(trackId, { x: newX, y: newY }, false);
          }
        });
      } else {
        // Single track drag
        const initialPos = groupDragState.initialPositions[itemId];
        if (initialPos) {
          // Calculate new position by adding delta to initial position
          let newX = initialPos.x + deltaTicks;
          let newY = initialPos.y + delta.y;
          
          // Snap X position if grid snap is enabled
          if (gridSnapEnabled && gridSnapSize !== GridSnapOption.NONE) {
            newX = Math.floor(newX / snapSizeTicks) * snapSizeTicks;
          }
          
          // Snap Y to track row height
          newY = Math.floor(newY / GRID_CONSTANTS.trackHeight) * GRID_CONSTANTS.trackHeight;
          
          // Apply boundaries
          newX = Math.max(0, newX);
          newY = Math.max(0, newY);
          
          console.log('[Timeline] Moving single track:', { 
            trackId: itemId, 
            initialX: initialPos.x, 
            initialY: initialPos.y,
            newX, 
            newY,
            trackHeight: GRID_CONSTANTS.trackHeight
          });
          onTrackPositionChange?.(itemId, { x: newX, y: newY }, false);
        } else {
          console.warn('[Timeline] No initial position for single track:', itemId);
        }
      }
    },
    onDragEnd: (itemId, selectedIds) => {
      console.log('Track drag ended:', itemId, selectedIds);
      
      // Determine if this was a group drag based on how many tracks we stored initial positions for
      const tracksInGroup = Object.keys(groupDragState.initialPositions);
      const isGroupDrag = tracksInGroup.length > 1 && tracksInGroup.includes(itemId);
      
      if (isGroupDrag) {
        // Send final position updates for all tracks that were moved
        tracksInGroup.forEach(trackId => {
          const track = tracks.find(t => t.id === trackId);
          if (track) {
            onTrackPositionChange?.(trackId, {
              x: track.x_position,
              y: track.y_position
            }, true);
          }
        });
      } else {
        // Single track drag end
        const track = tracks.find(t => t.id === itemId);
        if (track) {
          onTrackPositionChange?.(itemId, {
            x: track.x_position,
            y: track.y_position
          }, true);
        }
      }
      
      // Reset group drag state
      setGroupDragState({
        isDragging: false,
        initialPositions: {},
        draggedTrackId: null
      });
    },
    onItemClick: (itemId, tool) => {
      switch (tool) {
        case 'eraser':
          onTrackDelete?.(itemId);
          break;
        case 'pen':
          onTrackDuplicate?.(itemId);
          break;
        default:
          break;
      }
    },
    onItemDoubleClick: (itemId) => {
      console.log('Track double-clicked:', itemId);
      // Could open track editor or piano roll
    },
    // Clipboard operations
    onCopy: (items) => {
      const trackIds = items.map(item => item.id);
      const fullTracks = tracks.filter(t => trackIds.includes(t.id));
      onCopyTracks?.(fullTracks);
    },
    onCut: (items) => {
      const trackIds = items.map(item => item.id);
      const fullTracks = tracks.filter(t => trackIds.includes(t.id));
      onCutTracks?.(fullTracks);
    },
    onPaste: (items, position) => {
      const trackIds = items.map(item => item.id);
      const fullTracks = tracks.filter(t => trackIds.includes(t.id));
      onPasteTracks?.(fullTracks, position);
    },
    onDelete: (itemIds) => {
      onDeleteTracks?.(itemIds);
    },
    onDuplicate: (itemIds) => {
      onDuplicateTracks?.(itemIds);
    }
  });

  // Sync external selection state with interaction manager
  React.useEffect(() => {
    // Sync selectedTrackIds with interaction manager
    const currentSelection = interaction.selectionState.selectedIds;
    const isDifferent = selectedTrackIds.length !== currentSelection.length || 
                       !selectedTrackIds.every(id => currentSelection.includes(id));
    
    if (isDifferent) {
      console.log('[Timeline] Syncing selection state with interaction manager:', {
        selectedTrackIds,
        currentSelection
      });
      
      if (selectedTrackIds.length > 0) {
        interaction.selectMultiple(selectedTrackIds, true);
      } else {
        interaction.clearSelection();
      }
    }
  }, [selectedTrackIds]);
  
  // Update interaction manager grid size when snap size changes
  React.useEffect(() => {
    interaction.setGridSize(actualSnapSize);
  }, [actualSnapSize]);

  // Keyboard event handling for clipboard operations
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Convert tracks to selectable items for the interaction manager
      const selectableItems = tracks.map(track => ({
        id: track.id,
        type: 'track' as const,
        x: track.x_position,
        y: track.y_position
      }));
      
      interaction.handleKeyDown(event, selectableItems);
    };

    // Add event listener to the container
    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => {
        container.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [tracks, interaction]);
  
  // Use theme color for border if gridLineStyle is default
  const defaultGridLineStyle = {
    borderRight: `${GRID_CONSTANTS.borderWidth} solid ${theme.palette.divider}`
  };
  const currentGridLineStyle = gridLineStyle.borderRight === `${GRID_CONSTANTS.borderWidth} solid ${GRID_CONSTANTS.borderColor}`
    ? defaultGridLineStyle
    : gridLineStyle;
  
  // Expose imperative methods to parent component
  useImperativeHandle(ref, () => {
    const divElement = containerRef.current;
    if (!divElement) return {} as TimelineRef;
    
    return {
      // Explicitly forward the HTMLDivElement methods and properties we need
      addEventListener: divElement.addEventListener.bind(divElement),
      removeEventListener: divElement.removeEventListener.bind(divElement),
      get scrollLeft() { return divElement.scrollLeft; },
      get scrollWidth() { return divElement.scrollWidth; },
      get clientWidth() { return divElement.clientWidth; },
      
      // Add our custom playbackCursor methods
      playbackCursor: {
        play: () => cursorRef.current?.play(),
        pause: () => cursorRef.current?.pause(),
        stop: () => cursorRef.current?.stop(),
        seek: (time: number) => cursorRef.current?.seek(time)
      }
    };
  });
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Shared Interaction Toolbar */}
      {showToolbar && (
        <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <InteractionToolbar
            selectedTool={interaction.toolState.selectedTool}
            onToolChange={(tool) => {
              interaction.setTool(tool);
              onToolChange?.(tool);
            }}
            snapToGrid={gridSnapEnabled}
            onToggleSnapToGrid={() => {
              setGridSnapEnabled(!gridSnapEnabled);
              interaction.toggleSnapToGrid();
            }}
            showGridToggle={true}
            orientation="horizontal"
            size="small"
          />
        </Box>
      )}

      <Box 
        ref={containerRef}
        className="timeline-container"
        tabIndex={0} // Make focusable for keyboard events
        sx={{ 
          flex: 1, 
          position: 'relative', 
          overflow: 'auto',
          willChange: 'transform',
          bgcolor: 'background.default',
          outline: 'none', // Remove default focus outline
          '&:focus': {
            outline: 'none', // Ensure no focus outline
          },
          '& > *': {
            backfaceVisibility: 'hidden',
            perspective: 1000,
          },
          ...sx
        }}
        onMouseDown={(e) => {
          console.log('Timeline onMouseDown');
          const rect = e.currentTarget.getBoundingClientRect();
          const position = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          };
          
          console.log('Timeline container bounds:', {
            containerRect: rect,
            clientX: e.clientX,
            clientY: e.clientY,
            calculatedPosition: position
          });

          // Check if clicking on a track with proper width calculation
          const clickedTrack = tracks.find((track, index) => {
            // Calculate actual track width using proper function
            const actualTrackWidth = calculateTrackWidth(
              (track.duration_ticks || 0) / 960, // Convert ticks to seconds (assuming standard 960 ticks/beat at 120 BPM)
              bpm,
              timeSignature,
              {
                trimStartTicks: track.trim_start_ticks,
                trimEndTicks: track.trim_end_ticks,
                originalDurationTicks: track.duration_ticks
              }
            );
            
            // Calculate actual visual position in timeline
            const visualY = GRID_CONSTANTS.headerHeight + (index * GRID_CONSTANTS.trackHeight);
            // Convert track x_position from ticks to pixels using proper conversion function
            const visualX = ticksToPixels(track.x_position, bpm, timeSignature);

            return position.x >= visualX &&
                   position.x <= visualX + actualTrackWidth &&
                   position.y >= visualY &&
                   position.y <= visualY + GRID_CONSTANTS.trackHeight;
          });

          console.log('Timeline onMouseDown - position:', position);
          console.log('Timeline onMouseDown - clickedTrack:', clickedTrack?.id);
          console.log('Timeline onMouseDown - selectedTool:', selectedTool);

          if (clickedTrack) {
            console.log('Timeline onMouseDown - calling handleItemClick');
            interaction.handleItemClick(clickedTrack.id, {
              shiftKey: e.shiftKey,
              ctrlKey: e.ctrlKey,
              metaKey: e.metaKey
            });
          } else {
            console.log('Timeline onMouseDown - calling handleBackgroundMouseDown');
            interaction.handleBackgroundMouseDown(position, {
              shiftKey: e.shiftKey
            });
          }
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const position = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          };

          if (interaction.isSelecting) {
            console.log('Timeline onMouseMove - updating selection');
            interaction.updateSelection(position);
          }
        }}
        onMouseUp={(e) => {
          console.log('Timeline onMouseUp - isSelecting:', interaction.isSelecting);
          if (interaction.isSelecting) {
            console.log('Timeline onMouseUp - processing selection');
            
            // Get Timeline container bounds for coordinate conversion
            const timelineRect = e.currentTarget.getBoundingClientRect();
            
            // Get actual DOM positions of tracks
            const selectableItems = tracks.map((track, index) => {
              // Find the actual visual track element (with class "track" and proper dimensions)
              const trackElement = document.querySelector(`[data-track-id="${track.id}"].track`);
              if (!trackElement) {
                console.warn(`Track element not found for ID: ${track.id}`);
                return null;
              }
              
              // Get actual rendered position
              const trackRect = trackElement.getBoundingClientRect();
              
              // Convert to Timeline container coordinate system
              const trackX = trackRect.left - timelineRect.left;
              const trackY = trackRect.top - timelineRect.top;
              
              console.log('Track DOM position:', {
                trackId: track.id,
                trackRect: {
                  left: trackRect.left,
                  top: trackRect.top,
                  width: trackRect.width,
                  height: trackRect.height
                },
                timelineRect: {
                  left: timelineRect.left,
                  top: timelineRect.top
                },
                relativeToTimeline: {
                  x: trackX,
                  y: trackY,
                  width: trackRect.width,
                  height: trackRect.height
                }
              });
              
              return {
                id: track.id,
                type: 'track' as const,
                x: trackX,
                y: trackY,
                width: trackRect.width,
                height: trackRect.height
              };
            }).filter(Boolean); // Remove null entries
            
            console.log('Timeline onMouseUp - calling endSelection with', selectableItems.length, 'items');
            interaction.endSelection(selectableItems, e.shiftKey);
            
            // Set flag to prevent click handler from firing
            setJustCompletedSelection(true);
            // Reset the flag after a short delay
            setTimeout(() => setJustCompletedSelection(false), 10);
          }
        }}
      >
        {/* Selection Overlay */}
        <SelectionOverlay
          selectionRect={interaction.selectionState.selectionRect}
          isActive={interaction.isSelecting}
        />

        {/* Playback Cursor with ref for imperative control */}
        <PlaybackCursor 
          ref={cursorRef}
          currentTime={currentTime} 
          isPlaying={isPlaying} 
          bpm={bpm} 
          timeSignature={timeSignature} 
        />

        {/* Time Markers */}
        <TimelineRuler 
          measureCount={measureCount} 
          zoomLevel={zoomLevel} 
          bpm={bpm}
          timeSignature={timeSignature}
          onTimeChange={onTimeChange}
          totalWidth={totalTimelineWidth}
        />

        {/* Tracks or Drop Zone */}
        {tracks.length > -1 ? (
          <TimelineContent
            tracks={tracks}
            measureCount={measureCount}
            zoomLevel={zoomLevel}
            currentTime={currentTime}
            isPlaying={isPlaying}
            bpm={bpm}
            timeSignature={timeSignature}
            onTrackPositionChange={onTrackPositionChange}
            onTimeChange={onTimeChange}
            totalWidth={totalTimelineWidth}
            selectedTool={interaction.toolState.selectedTool}
            selectedTrackIds={selectedTrackIds}
            interaction={interaction}
            justCompletedSelection={justCompletedSelection}
          />
        ) : (
          <EmptyTimelineDropZone onTimeChange={onTimeChange} bpm={bpm} timeSignature={timeSignature} />
        )}
      </Box>
    </Box>
  );
});

interface TimelineRulerProps {
  measureCount: number;
  zoomLevel: number;
  bpm?: number;
  timeSignature?: [number, number];
  onTimeChange?: (newTime: number) => void;
  totalWidth?: number;
}

// SIMPLIFIED TimelineRuler for testing
// function TimelineRuler({ totalWidth }: TimelineRulerProps) {
//   const theme = useTheme();
//   return (
//     <Box
//       sx={{
//         display: 'flex',
//         position: 'sticky', // Keep sticky for now
//         top: 0,
//         bgcolor: 'background.paper',
//         zIndex: 2,
//         height: GRID_CONSTANTS.headerHeight,
//         boxSizing: 'border-box',
//         transformOrigin: "top left",
//         borderBottom: `1px solid ${theme.palette.divider}`,
//         boxShadow: theme.shadows[2],
//         alignItems: 'center',
//         justifyContent: 'center',
//         fontSize: '14px',
//         color: 'text.secondary',
//       }}
//       style={{
//         width: totalWidth ? `${totalWidth}px` : '100%',
//       }}
//     >
//       Simplified Ruler - Test
//     </Box>
//   );
// }

// --- START NEW TimelineRuler IMPLEMENTATION ---
function TimelineRuler({
  measureCount,
  zoomLevel = 1, // Keep zoomLevel if it might affect rendering density later
  bpm = 120,
  timeSignature = [4, 4],
  onTimeChange = () => {},
  // gridLineStyle, // No longer needed for ruler internal lines
  totalWidth
}: TimelineRulerProps) {
  // const theme = useTheme(); // MUI theme, not directly needed for these specific changes
  const { studioMode } = useAppTheme(); // Get studioMode
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Define colors based on studioMode
  const isDark = studioMode === 'dark';

  // Adjusted light mode colors to be lighter shades of gray (via black with low alpha)
  const SUBDIVISION_LINE_COLOR = isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(0, 0, 0, 0.10)';
  const BEAT_LINE_COLOR = isDark ? 'rgba(255, 255, 255, 0.40)' : 'rgba(0, 0, 0, 0.20)';
  const MEASURE_LINE_COLOR = isDark ? 'rgba(255, 255, 255, 0.70)' : 'rgba(0, 0, 0, 0.40)';

  const beatsPerMeasure = timeSignature[0];
  const measureWidthPixels = GRID_CONSTANTS.measureWidth;
  const beatWidthPixels = measureWidthPixels / beatsPerMeasure;

  // Handler for ruler clicks to set playback position
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const adjustedX = clickX / zoomLevel; // Assuming zoom affects ruler scale
    const newTime = calculatePositionTime(adjustedX, bpm, timeSignature);
    onTimeChange(newTime);
  };

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = totalWidth || canvas.parentElement?.clientWidth || 0;
    const canvasHeight = GRID_CONSTANTS.headerHeight;

    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Drawing logic
    const subdivisionsPerBeat = timeSignature[1];
    const subdivisionWidthPixels = beatWidthPixels / subdivisionsPerBeat;

    // 1. Draw subdivision lines (dimmest, shortest from bottom)
    ctx.strokeStyle = SUBDIVISION_LINE_COLOR;
    ctx.lineWidth = 1;
    for (let m = 0; m < measureCount; m++) {
      for (let b = 0; b < beatsPerMeasure; b++) {
        for (let s = 1; s < subdivisionsPerBeat; s++) {
          const x = m * measureWidthPixels + b * beatWidthPixels + s * subdivisionWidthPixels;
          ctx.beginPath();
          ctx.moveTo(x + 0.5, canvasHeight * 0.85); // Start at 85% from top (bottom 15%)
          ctx.lineTo(x + 0.5, canvasHeight);
          ctx.stroke();
        }
      }
    }

    // 2. Draw beat lines (medium prominence, medium height from bottom)
    ctx.strokeStyle = BEAT_LINE_COLOR;
    ctx.lineWidth = 0.5; // Make beat lines thinner
    for (let m = 0; m < measureCount; m++) {
      for (let b = 1; b < beatsPerMeasure; b++) { // Start from beat 1
        const x = m * measureWidthPixels + b * beatWidthPixels;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, canvasHeight * 0); // Start at 70% from top (bottom 30%)
        ctx.lineTo(x + 0.5, canvasHeight);
        ctx.stroke();
      }
    }

    // 3. Draw measure lines (most prominent, full height)
    ctx.strokeStyle = MEASURE_LINE_COLOR;
    ctx.lineWidth = 1; // Target image lines look sharp, not overly thick
    for (let i = 0; i <= measureCount; i++) {
      const x = i * measureWidthPixels;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0); // Full height
      ctx.lineTo(x + 0.5, canvasHeight);
      ctx.stroke();
    }

  }, [
    totalWidth,
    measureCount,
    beatsPerMeasure,
    timeSignature,
    zoomLevel, 
    SUBDIVISION_LINE_COLOR, BEAT_LINE_COLOR, MEASURE_LINE_COLOR // Redraw if colors change
  ]);

  return (
    // Main sticky container - Apply Tailwind classes
    <div
      className={cn(
        "sticky top-0 z-[2] box-border overflow-hidden shadow-sm border-b",
        isDark ? "bg-neutral-900 border-b-neutral-700" // Darker neutral gray for dark mode
               : "bg-neutral-100 border-b-neutral-300" // Neutral light gray for light mode
        )}
      style={{ // Height and dynamic width still via style prop
        height: `${GRID_CONSTANTS.headerHeight}px`,
        width: totalWidth ? `${totalWidth}px` : '100%',
      }}
      onClick={handleRulerClick}
    >
      {/* Canvas for drawing lines */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
      />
      {/* Measure Numbers */}
      {Array.from({ length: measureCount }).map((_, measureIndex) => (
        <div
          key={`measure-num-${measureIndex}`}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 text-sm select-none z-[1]",
            isDark ? "text-neutral-200" : "text-neutral-700" // Text colors adjusted for contrast
            )}
          style={{ // Dynamic left positioning
            left: `${measureIndex * measureWidthPixels + 5}px`,
          }}
        >
          {measureIndex + 1}
        </div>
      ))}
      {/* Beat Numbers */}
      {Array.from({ length: measureCount }).map((_, measureIndex) => (
        Array.from({ length: beatsPerMeasure -1 }).map((_, beatIndexInMeasure) => {
          const actualBeatNumber = beatIndexInMeasure + 2;
          const beatXPosition = measureIndex * measureWidthPixels + (actualBeatNumber -1) * beatWidthPixels;
          return (
            <div
              key={`beat-num-${measureIndex}-${actualBeatNumber}`}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 text-[8px] select-none z-[1]",
                isDark ? "text-neutral-400" : "text-neutral-500" // Muted text colors adjusted for contrast
                )}
              style={{ // Dynamic left positioning, similar to measure numbers but offset from beat line
                left: `${beatXPosition + 4}px`, 
              }}
            >
              {actualBeatNumber}
            </div>
          );
        })
      ))}
    </div>
  );
}
// --- END NEW TimelineRuler IMPLEMENTATION ---

interface TimelineContentProps extends TimelineRulerProps {
  tracks: CombinedTrack[];
  currentTime: number;
  isPlaying: boolean;
  bpm: number;
  timeSignature: [number, number];
  onTrackPositionChange: (trackId: string, newPosition: Position, isDragEnd: boolean) => void;
  onTimeChange: (newTime: number) => void;
  totalWidth?: number;
  selectedTool: Tool;
  selectedTrackIds: string[];
  interaction: any; // Type from useInteractionManager
  justCompletedSelection: boolean;
}

function TimelineContent({
  tracks,
  measureCount,
  zoomLevel,
  currentTime,
  isPlaying,
  bpm,
  timeSignature,
  onTrackPositionChange,
  onTimeChange,
  totalWidth,
  selectedTool,
  selectedTrackIds,
  interaction,
  justCompletedSelection
}: TimelineContentProps) {
  // const theme = useTheme(); // No longer need theme for grid colors
  
  // Handler for timeline content clicks to set playback position
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't handle clicks if we just completed a rectangle selection
    if (justCompletedSelection) {
      console.log('Click ignored - just completed rectangle selection');
      return;
    }
    
    // Only handle direct clicks on the background, not on tracks
    if ((e.target as HTMLElement).closest('.track')) {
      console.log('Click on track - ignoring for timeline click');
      return;
    }
    
    // Get click position relative to the content area
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    
    // Adjust for zoom level
    const adjustedX = clickX / zoomLevel;
    
    // Convert pixel position to time in seconds
    const newTime = calculatePositionTime(adjustedX, bpm, timeSignature);
    
    console.log('Timeline content clicked!', {
      clickX,
      adjustedX,
      newTime,
      zoomLevel,
      bpm,
      timeSignature,
      target: e.target,
      currentTarget: e.currentTarget
    });
    
    // Call the callback with the new time
    onTimeChange(newTime);
  };
  
  // Define fixed gray colors for grid lines
  const fixedMeasureColor = 'rgba(128, 128, 128, 0.8)'; // Medium Gray, strong alpha
  const fixedBeatColor = 'rgba(128, 128, 128, 0.5)';    // Medium Gray, medium alpha
  const fixedSubdivisionColor = 'rgba(128, 128, 128, 0.25)'; // Medium Gray, low alpha

  return (
    <Box 
      sx={{ 
        minHeight: '100%',
        position: 'relative',
        willChange: "transform",
        imageRendering: "crisp-edges",
        transformOrigin: "top left",
        cursor: 'pointer',
      }}
      style={{
        width: totalWidth ? `${totalWidth}px` : '100%',
      }}
      onClick={handleTimelineClick}
    >
      {/* Pass fixed gray colors to GridOverlay */}
      <GridOverlay 
        measureCount={measureCount} 
        timeSignature={timeSignature} 
        measureColor={fixedMeasureColor} 
        beatColor={fixedBeatColor}         
        subdivisionColor={fixedSubdivisionColor}
      />

      {tracks.map((track, index) => (
        <Track 
          key={track.id}
          id={track.id}
          index={index}
          isSelected={selectedTrackIds.includes(track.id)}
          selectedTool={selectedTool}
          isGroupDrag={interaction.isDragging && selectedTrackIds.includes(track.id)}
          isPrimaryDrag={interaction.dragState.draggedItemId === track.id}
          onTrackClick={(trackId, event) => {
            interaction.handleItemClick(trackId, event);
          }}
          onTrackDoubleClick={(trackId) => {
            interaction.handleItemDoubleClick(trackId);
          }}
          interaction={interaction}
          // gridLineStyle={gridLineStyle} // Removed, GridOverlay handles this
        />
      ))}
    </Box>
  );
}

interface GridOverlayProps {
  measureCount: number;
  timeSignature?: [number, number];
  measureColor?: string;
  beatColor?: string;
  subdivisionColor?: string;
}

function GridOverlay({
  measureCount, 
  timeSignature = [4, 4], 
  // Update defaults to match the fixed grays
  measureColor = 'rgba(128, 128, 128, 0.8)', 
  beatColor = 'rgba(128, 128, 128, 0.5)',
  subdivisionColor = 'rgba(128, 128, 128, 0.25)'
}: GridOverlayProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const beatsPerMeasure = timeSignature[0];
  const beatWidth = GRID_CONSTANTS.measureWidth / beatsPerMeasure;
  
  // Draw grid lines on canvas
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    // Set canvas size to match container
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === container) {
          canvas.width = container.clientWidth;
          canvas.height = container.clientHeight;
          drawGrid();
        }
      }
    });
    
    resizeObserver.observe(container);
    
    // Initial sizing
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    // Draw grid function
    function drawGrid() {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Enable high-DPI rendering for crisp lines
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      ctx.scale(dpr, dpr);
      
      // Clear canvas
      ctx.clearRect(0, 0, container.clientWidth, container.clientHeight);
      
      const denominator = timeSignature[1];
      
      // Colors are now passed directly or use the updated defaults
      const MEASURE_COLOR = measureColor;
      const BEAT_COLOR = beatColor;
      const SUBDIVISION_COLOR = subdivisionColor;
      
      // Ensure pixel-perfect rendering
      const drawLine = (x: number, _opacity: number, color?: string) => { // Opacity parameter ignored now
        const xPos = Math.round(x) + 0.5;
        ctx.beginPath();
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, container.clientHeight);
        // Use the provided color string directly (which includes alpha)
        ctx.strokeStyle = color || SUBDIVISION_COLOR; 
        ctx.lineWidth = 1;
        ctx.stroke();
      };
      
      // Draw all subdivisions (with different opacities)
      // IMPORTANT: For time signatures, denominator tells us the type of note that gets one beat
      // 4 = quarter note gets one beat, 8 = eighth note gets one beat
      // This means we need to adjust how we interpret subdivisions based on the denominator
      console.log(`Drawing grid with time signature ${timeSignature[0]}/${timeSignature[1]}`);
      
      const subdivisionsPerBeat = timeSignature[1]; // Use the denominator directly
      const totalBeats = measureCount * beatsPerMeasure;
      const totalSubdivisions = totalBeats * subdivisionsPerBeat;
      
      // 1. First draw all regular subdivisions
      // Calculate the width of each subdivision
      const subdivisionWidth = beatWidth / subdivisionsPerBeat;
      
      // Debug output
      console.log('Grid subdivision calculation:', {
        measureWidth: GRID_CONSTANTS.measureWidth,
        beatsPerMeasure,
        beatWidth,
        denominator: timeSignature[1],
        subdivisionsPerBeat,
        subdivisionWidth,
        expectedSubdivisionsPerMeasure: beatsPerMeasure * subdivisionsPerBeat
      });

      // For each beat in our timeline
      for (let beatIndex = 0; beatIndex < totalBeats; beatIndex++) {
        const beatStartPosition = beatIndex * beatWidth;
        
        // For each subdivision within this beat (skip the beat itself at position 0)
        for (let subdivision = 1; subdivision < subdivisionsPerBeat; subdivision++) {
          // Calculate the exact position of this subdivision
          const position = beatStartPosition + (subdivision * subdivisionWidth);
          
          // Simplified: Draw all subdivisions with the base SUBDIVISION_COLOR
          // Hierarchy is now mainly handled by the color alpha values passed in.
          // We could still vary color based on isHalfBeat/isQuarterBeat if needed,
          // but let's start simple.
          drawLine(position, 1, SUBDIVISION_COLOR); // Pass opacity 1, color has alpha
        }
      }
      
      // 2. Now draw beat lines on top
      for (let i = 0; i <= totalBeats; i++) {
        // Skip measure lines (we'll draw them last)
        if (i % beatsPerMeasure !== 0) {
          const x = i * beatWidth;
          drawLine(x, 1, BEAT_COLOR); // Pass opacity 1, color has alpha
        }
      }
      
      // 3. Finally draw measure lines (most prominent)
      for (let i = 0; i <= measureCount; i++) {
        const x = i * GRID_CONSTANTS.measureWidth;
        drawLine(x, 1, MEASURE_COLOR); // Pass opacity 1, color has alpha
      }
    }
    
    drawGrid();
    
    // Cleanup
    return () => {
      resizeObserver.disconnect();
    };
  }, [measureCount, beatsPerMeasure, beatWidth, timeSignature, measureColor, beatColor, subdivisionColor]);
  
  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: '100%', // Fill the full width of the parent container
        pointerEvents: 'none', // Important: this makes the grid not catch any mouse events
        zIndex: 1000
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
    </Box>
  );
}

interface EmptyTimelineDropZoneProps {
  onTimeChange?: (newTime: number) => void;
  bpm?: number;
  timeSignature?: [number, number];
}

function EmptyTimelineDropZone({ onTimeChange = () => {}, bpm = 120, timeSignature = [4, 4] }: EmptyTimelineDropZoneProps) {
  const theme = useTheme();
  return (
    <Box sx={{ 
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      color: 'text.secondary',
      height: '100%',
      border: `2px dashed ${theme.palette.divider}`,
      m: 2,
      borderRadius: 2,
      position: 'relative', // For positioning the cursor inside
    }}>
      <Box sx={{ fontSize: 24, mb: 1 }}>♫</Box>
      <Box>Drop a loop or an audio/MIDI/Video file</Box>
      
      {/* We still include the cursor element even in empty state, just hidden until tracks exist */}
      <PlaybackCursor currentTime={0} isPlaying={false} bpm={bpm} timeSignature={timeSignature} />
    </Box>
  );
} 