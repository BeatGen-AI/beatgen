// import React, { forwardRef, useRef, useImperativeHandle, useState, useCallback, useMemo } from 'react';
// import { Box, useTheme } from '@mui/material';
// import type { SxProps, Theme } from '@mui/material/styles';
// import { GRID_CONSTANTS, calculatePositionTime, ticksToPixels, pixelsToTicks, calculateTrackWidth } from '../../constants/gridConstants';
// import { MUSIC_CONSTANTS } from '../../constants/musicConstants';
// import Track from '../track/Track';
// import PlaybackCursor, { PlaybackCursorRef } from './PlaybackCursor';
// import { CombinedTrack } from 'src/platform/types/project';
// import { Position } from '../track/types';
// import { useAppTheme } from '../../../lib/theme-provider';
// import { cn } from '@/lib/utils';
// import { SelectionOverlay, InteractionToolbar, Tool, DragGhost, useInteractions, DraggableResizableItem } from '../../shared/interactions';
// import { getSnapSizeInPixels, GridSnapOption } from '../piano-roll2/gridConstants';
// import { TimelineTrackItem } from './types';

// export interface TimelineProps {
//   tracks: CombinedTrack[];
//   currentTime?: number;
//   isPlaying?: boolean;
//   measureCount?: number;
//   zoomLevel?: number;
//   bpm?: number;
//   timeSignature?: [number, number];
//   onTrackPositionChange?: (trackId: string, newPosition: Position, isDragEnd: boolean) => void;
//   onTimeChange?: (newTime: number) => void;
//   gridLineStyle?: {
//     borderRight: string;
//   };
//   sx?: SxProps<Theme>;
  
//   // Shared interaction system props
//   selectedTool?: Tool;
//   onToolChange?: (tool: Tool) => void;
//   showToolbar?: boolean;
//   gridSnapSize?: GridSnapOption;
//   onTrackSelect?: (trackIds: string[]) => void;
//   onTrackDelete?: (trackId: string) => void;
//   onTrackDuplicate?: (trackId: string) => void;
//   onTrackResizeEnd?: (trackId: string, deltaPixels: number, direction: 'left' | 'right') => void;
//   selectedTrackIds?: string[];
  
//   // Group operations for clipboard functionality
//   onCopyTracks?: (tracks: CombinedTrack[]) => void;
//   onCutTracks?: (tracks: CombinedTrack[]) => void;
//   onPasteTracks?: (tracks: CombinedTrack[], position?: { x: number; y: number }) => void;
//   onDeleteTracks?: (trackIds: string[]) => void;
//   onDuplicateTracks?: (trackIds: string[]) => void;
  
//   // Instance-specific handlers
//   onInstancePositionChange?: (trackId: string, instanceId: string, newPosition: Position, isDragEnd: boolean) => void;
//   onInstanceResizeEnd?: (trackId: string, instanceId: string, deltaPixels: number, direction: 'left' | 'right') => void;
//   updateMultipleInstancePositions?: (instanceUpdates: Array<{trackId: string, instanceId: string, deltaX: number, deltaY: number}>) => void;
//   resizeMultipleInstances?: (instanceUpdates: Array<{trackId: string, instanceId: string, widthDelta: number, anchor: 'left' | 'right'}>) => void;
// }

// // Define imperative handle interface
// export interface TimelineRef {
//   playbackCursor: {
//     play: () => void;
//     pause: () => void;
//     stop: () => void;
//     seek: (time: number) => void;
//   };
//   // Include the HTMLDivElement methods we need
//   addEventListener: HTMLDivElement['addEventListener'];
//   removeEventListener: HTMLDivElement['removeEventListener'];
//   // Include properties we need for scroll handling
//   scrollLeft: number;
//   scrollWidth: number;
//   clientWidth: number;
// }

// export const Timeline = forwardRef<TimelineRef, TimelineProps>(({
//   tracks,
//   currentTime = 0,
//   isPlaying = false,
//   measureCount = GRID_CONSTANTS.measureCount,
//   zoomLevel = 1,
//   bpm = 120,
//   timeSignature = [4, 4],
//   onTrackPositionChange = () => {},
//   onTimeChange = () => {},
//   gridLineStyle = {
//     borderRight: `${GRID_CONSTANTS.borderWidth} solid ${GRID_CONSTANTS.borderColor}`
//   },
//   sx,
//   selectedTool = 'select',
//   onToolChange,
//   showToolbar = false,
//   gridSnapSize: propGridSnapSize,
//   onTrackSelect,
//   onTrackDelete,
//   onTrackDuplicate,
//   onTrackResizeEnd,
//   selectedTrackIds = [],
//   onCopyTracks,
//   onCutTracks,
//   onPasteTracks,
//   onDeleteTracks,
//   onDuplicateTracks,
//   onInstancePositionChange,
//   onInstanceResizeEnd,
//   updateMultipleInstancePositions,
//   resizeMultipleInstances
// }, ref) => {
//   const theme = useTheme();
//   const { studioMode } = useAppTheme();
  
//   // Calculate the total width needed for the entire timeline
//   const totalTimelineWidth = measureCount * GRID_CONSTANTS.measureWidth;
  
//   // Refs for the cursor and container
//   const cursorRef = useRef<PlaybackCursorRef>(null);
//   const containerRef = useRef<HTMLDivElement>(null);
  
//   // Track if we just completed a selection
//   const [justCompletedSelection, setJustCompletedSelection] = useState(false);
  
//   // State for grid snap options
//   const [gridSnapSize, setGridSnapSize] = useState<GridSnapOption>(propGridSnapSize || GridSnapOption.STEP);
//   const [gridSnapEnabled, setGridSnapEnabled] = useState(true);
  
//   // Update gridSnapSize when prop changes
//   React.useEffect(() => {
//     if (propGridSnapSize !== undefined) {
//       setGridSnapSize(propGridSnapSize);
//     }
//   }, [propGridSnapSize]);
  
//   // Calculate actual grid size based on snap option
//   const effectiveGridSize = GRID_CONSTANTS.measureWidth / (timeSignature[0] * 4); // Size of one step
//   const actualSnapSize = React.useMemo(() => {
//     return getSnapSizeInPixels(gridSnapSize, effectiveGridSize);
//   }, [gridSnapSize, effectiveGridSize]);
  
//   // Convert all instances to draggable items
//   const trackItems: TimelineTrackItem[] = React.useMemo(() => 
//     tracks.flatMap(track => 
//       (track.instances || []).map(instance => ({
//         id: instance.id, // Use instance ID
//         x: instance.x_position, // Already in ticks
//         y: instance.y_position, // In pixels
//         width: instance.trim_end_ticks - instance.trim_start_ticks,
//         height: GRID_CONSTANTS.trackHeight,
//         trackId: track.id // Keep reference to parent track
//       }))
//     ),
//     [tracks]
//   );

//   // Calculate pixels per tick based on BPM and time signature
//   const pixelsPerTick = React.useMemo(() => {
//     const beatsPerMeasure = timeSignature[0];
//     const ticksPerBeat = MUSIC_CONSTANTS.pulsesPerQuarterNote;
//     const ticksPerMeasure = ticksPerBeat * beatsPerMeasure;
//     return GRID_CONSTANTS.measureWidth / ticksPerMeasure;
//   }, [timeSignature]);

//   // Use the new unified interaction system
//   const interaction = useInteractions({
//     items: trackItems,
//     pixelsPerTick,
//     zoom: zoomLevel,
//     initialTool: selectedTool,
//     snapToGrid: gridSnapEnabled,
//     gridSize: pixelsToTicks(actualSnapSize, bpm, timeSignature),
//     onSelectionChange: (ids) => {
//       // Convert instance IDs to track IDs
//       const trackIds = [...new Set(ids.map(id => {
//         const trackItem = trackItems.find(item => item.id === id);
//         return trackItem && 'trackId' in trackItem ? trackItem.trackId : null;
//       }).filter(Boolean) as string[])];
//       onTrackSelect?.(trackIds);
//     },
//     onDragMove: (updates) => {
//       updates.forEach((pos, instanceId) => {
//         // Find the parent track for this instance
//         const trackItem = trackItems.find(item => item.id === instanceId);
//         if (!trackItem || !('trackId' in trackItem)) return;
        
//         // Use instance handler if available, otherwise fall back to track handler
//         if (onInstancePositionChange) {
//           onInstancePositionChange(trackItem.trackId, instanceId as string, {
//             x: pos.x, // Already in ticks from interaction
//             y: pos.y  // In pixels
//           }, false);
//         } else {
//           onTrackPositionChange(trackItem.trackId, {
//             x: pos.x,
//             y: pos.y
//           }, false);
//         }
//       });
//     },
//     onDragEnd: (updates) => {
//       updates.forEach((pos, instanceId) => {
//         // Find the parent track for this instance
//         const trackItem = trackItems.find(item => item.id === instanceId);
//         if (!trackItem || !('trackId' in trackItem)) return;
        
//         // Use instance handler if available, otherwise fall back to track handler
//         if (onInstancePositionChange) {
//           onInstancePositionChange(trackItem.trackId, instanceId as string, {
//             x: pos.x,
//             y: pos.y
//           }, true);
//         } else {
//           onTrackPositionChange(trackItem.trackId, {
//             x: pos.x,
//             y: pos.y
//           }, true);
//         }
//       });
//     },
//     onResizeEnd: (updates) => {
//       updates.forEach((dim, instanceId) => {
//         // Find the instance and its parent track
//         const trackItem = trackItems.find(item => item.id === instanceId);
//         if (!trackItem || !('trackId' in trackItem)) return;
        
//         const track = tracks.find(t => t.id === trackItem.trackId);
//         const instance = track?.instances?.find(inst => inst.id === instanceId);
//         if (!track || !instance) return;
        
//         if (dim.start !== undefined) {
//           // Left resize - position changed
//           const deltaPixels = ticksToPixels(dim.start - instance.x_position, bpm, timeSignature);
//           if (onInstanceResizeEnd) {
//             onInstanceResizeEnd(track.id, instanceId as string, deltaPixels, 'left');
//           } else if (onTrackResizeEnd) {
//             onTrackResizeEnd(track.id, deltaPixels, 'left');
//           }
//         } else if (dim.width !== undefined) {
//           // Right resize - width changed
//           const currentWidth = instance.trim_end_ticks - instance.trim_start_ticks;
//           const deltaPixels = ticksToPixels(dim.width - currentWidth, bpm, timeSignature);
//           if (onInstanceResizeEnd) {
//             onInstanceResizeEnd(track.id, instanceId as string, deltaPixels, 'right');
//           } else if (onTrackResizeEnd) {
//             onTrackResizeEnd(track.id, deltaPixels, 'right');
//           }
//         }
//       });
//     },
//     onItemClick: (trackId, tool) => {
//       if (tool === 'eraser') {
//         onTrackDelete?.(trackId as string);
//       } else if (tool === 'pen') {
//         onTrackDuplicate?.(trackId as string);
//       }
//     },
//     onCopy: (items) => {
//       const trackIds = items.map(item => item.id as string);
//       const fullTracks = tracks.filter(t => trackIds.includes(t.id));
//       onCopyTracks?.(fullTracks);
//     },
//     onCut: (items) => {
//       const trackIds = items.map(item => item.id as string);
//       const fullTracks = tracks.filter(t => trackIds.includes(t.id));
//       onCutTracks?.(fullTracks);
//     },
//     onPaste: (items, position) => {
//       const trackIds = items.map(item => item.id as string);
//       const fullTracks = tracks.filter(t => trackIds.includes(t.id));
//       onPasteTracks?.(fullTracks, position);
//     },
//     onDelete: (itemIds) => {
//       const trackIds = itemIds.filter(id => typeof id === 'string') as string[];
//       onDeleteTracks?.(trackIds);
//     },
//     onDuplicate: (itemIds) => {
//       const trackIds = itemIds.filter(id => typeof id === 'string') as string[];
//       onDuplicateTracks?.(trackIds);
//     }
//   });

//   // Extract states we need from the interaction hook
//   const {
//     isDragging,
//     isResizing,
//     draggedItemId,
//     resizingItemId,
//     resizeDirection,
//     selectionState,
//     isSelecting,
//     handleBackgroundMouseDown,
//     handleItemClick,
//     updateSelection,
//     endSelection,
//     handleKeyDown,
//     setTool,
//     toggleSnapToGrid,
//     setGridSize: setInteractionGridSize,
//     selectedTool: interactionSelectedTool,
//     getItemAtPosition,
//     hasSelection,
//     selectedCount,
//     selectMultiple,
//     clearSelection,
//     pixelsToTicks: interactionPixelsToTicks,
//     ticksToPixels: interactionTicksToPixels
//   } = interaction;

//   // Sync grid size changes
//   React.useEffect(() => {
//     setInteractionGridSize(pixelsToTicks(actualSnapSize, bpm, timeSignature));
//   }, [actualSnapSize, bpm, timeSignature, setInteractionGridSize]);

//   // Sync external selection state with interaction manager
//   React.useEffect(() => {
//     // Sync selectedTrackIds with interaction manager
//     const currentSelection = selectionState.selectedIds.filter(id => typeof id === 'string') as string[];
//     const isDifferent = selectedTrackIds.length !== currentSelection.length || 
//                        !selectedTrackIds.every(id => currentSelection.includes(id));
    
//     if (isDifferent) {
      
//       // Use a timeout to break the synchronous update cycle
//       const timeoutId = setTimeout(() => {
//         if (selectedTrackIds.length > 0) {
//           selectMultiple(selectedTrackIds, true);
//         } else {
//           clearSelection();
//         }
//       }, 0);
      
//       return () => clearTimeout(timeoutId);
//     }
//   }, [selectedTrackIds, selectionState.selectedIds, selectMultiple, clearSelection]);

//   // Keyboard event handling for clipboard operations
//   React.useEffect(() => {
//     const handleKeyDownEvent = (event: KeyboardEvent) => {
//       handleKeyDown(event);
//     };

//     // Add event listener to the container
//     const container = containerRef.current;
//     if (container) {
//       container.addEventListener('keydown', handleKeyDownEvent);
//       return () => {
//         container.removeEventListener('keydown', handleKeyDownEvent);
//       };
//     }
//   }, [handleKeyDown]);
  
//   // Use theme color for border if gridLineStyle is default
//   const defaultGridLineStyle = {
//     borderRight: `${GRID_CONSTANTS.borderWidth} solid ${theme.palette.divider}`
//   };
//   const currentGridLineStyle = gridLineStyle.borderRight === `${GRID_CONSTANTS.borderWidth} solid ${GRID_CONSTANTS.borderColor}`
//     ? defaultGridLineStyle
//     : gridLineStyle;
  
//   // Expose imperative methods to parent component
//   useImperativeHandle(ref, () => {
//     const divElement = containerRef.current;
//     if (!divElement) return {} as TimelineRef;
    
//     return {
//       // Explicitly forward the HTMLDivElement methods and properties we need
//       addEventListener: divElement.addEventListener.bind(divElement),
//       removeEventListener: divElement.removeEventListener.bind(divElement),
//       get scrollLeft() { return divElement.scrollLeft; },
//       get scrollWidth() { return divElement.scrollWidth; },
//       get clientWidth() { return divElement.clientWidth; },
      
//       // Add our custom playbackCursor methods
//       playbackCursor: {
//         play: () => cursorRef.current?.play(),
//         pause: () => cursorRef.current?.pause(),
//         stop: () => cursorRef.current?.stop(),
//         seek: (time: number) => cursorRef.current?.seek(time)
//       }
//     };
//   });

//   // Handle timeline click to set playback position
//   const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
//     // Don't handle clicks if we just completed a rectangle selection
//     if (justCompletedSelection) {
//       return;
//     }
    
//     // Only handle direct clicks on the background, not on tracks
//     if ((e.target as HTMLElement).closest('.track')) {
//       return;
//     }
    
//     // Get click position relative to the content area
//     const rect = e.currentTarget.getBoundingClientRect();
//     const clickX = e.clientX - rect.left;
    
//     // Adjust for zoom level
//     const adjustedX = clickX / zoomLevel;
    
//     // Convert pixel position to time in seconds
//     const newTime = calculatePositionTime(adjustedX, bpm, timeSignature);
    
    
//     // Call the callback with the new time
//     onTimeChange(newTime);
//   }, [justCompletedSelection, zoomLevel, bpm, timeSignature, onTimeChange]);

//   // Handle mouse events on container
//   const handleContainerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
//     const rect = e.currentTarget.getBoundingClientRect();
//     const position = {
//       x: e.clientX - rect.left,
//       y: e.clientY - rect.top
//     };
    
//     // Check if clicking on a track
//     const clickedItem = getItemAtPosition(position.x, position.y);

//     if (clickedItem) {
//       handleItemClick(clickedItem.id, {
//         shiftKey: e.shiftKey,
//         ctrlKey: e.ctrlKey,
//         metaKey: e.metaKey
//       });
//     } else {
//       handleBackgroundMouseDown(position, {
//         shiftKey: e.shiftKey
//       });
//     }
//   }, [getItemAtPosition, handleItemClick, handleBackgroundMouseDown]);

//   const handleContainerMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
//     const rect = e.currentTarget.getBoundingClientRect();
//     const position = {
//       x: e.clientX - rect.left,
//       y: e.clientY - rect.top
//     };

//     if (isSelecting) {
//       updateSelection(position);
//     }
//   }, [isSelecting, updateSelection]);

//   const handleContainerMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
//     if (isSelecting) {
//       endSelection(e.shiftKey);
      
//       // Set flag to prevent click handler from firing
//       setJustCompletedSelection(true);
//       // Reset the flag after a short delay
//       setTimeout(() => setJustCompletedSelection(false), 10);
//     }
//   }, [isSelecting, endSelection]);
  
//   return (
//     <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
//       {/* Shared Interaction Toolbar */}
//       {showToolbar && (
//         <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
//           <InteractionToolbar
//             selectedTool={interactionSelectedTool}
//             onToolChange={(tool) => {
//               setTool(tool);
//               onToolChange?.(tool);
//             }}
//             snapToGrid={gridSnapEnabled}
//             onToggleSnapToGrid={() => {
//               setGridSnapEnabled(!gridSnapEnabled);
//               toggleSnapToGrid();
//             }}
//             gridSnapSize={gridSnapSize}
//             onGridSnapSizeChange={(size) => {
//               setGridSnapSize(size);
//               // If setting to NONE, disable grid snapping
//               if (size === GridSnapOption.NONE) {
//                 setGridSnapEnabled(false);
//                 toggleSnapToGrid();
//               } else if (!gridSnapEnabled) {
//                 // If selecting a size other than NONE, enable grid snapping
//                 setGridSnapEnabled(true);
//                 toggleSnapToGrid();
//               }
//             }}
//             showGridToggle={true}
//             orientation="horizontal"
//             size="small"
//           />
//         </Box>
//       )}

//       <Box 
//         ref={containerRef}
//         className="timeline-container"
//         tabIndex={0} // Make focusable for keyboard events
//         sx={{ 
//           flex: 1, 
//           position: 'relative', 
//           overflow: 'auto',
//           willChange: 'transform',
//           bgcolor: 'background.default',
//           outline: 'none', // Remove default focus outline
//           '&:focus': {
//             outline: 'none', // Ensure no focus outline
//           },
//           '& > *': {
//             backfaceVisibility: 'hidden',
//             perspective: 1000,
//           },
//           ...sx
//         }}
//         onMouseDown={handleContainerMouseDown}
//         onMouseMove={handleContainerMouseMove}
//         onMouseUp={handleContainerMouseUp}
//       >
//         {/* Selection Overlay */}
//         <SelectionOverlay
//           selectionRect={selectionState.selectionRect}
//           isActive={isSelecting}
//         />

//         {/* Playback Cursor with ref for imperative control */}
//         <PlaybackCursor 
//           ref={cursorRef}
//           currentTime={currentTime} 
//           isPlaying={isPlaying} 
//           bpm={bpm} 
//           timeSignature={timeSignature} 
//         />

//         {/* Time Markers */}
//         <TimelineRuler 
//           measureCount={measureCount} 
//           zoomLevel={zoomLevel} 
//           bpm={bpm}
//           timeSignature={timeSignature}
//           onTimeChange={onTimeChange}
//           totalWidth={totalTimelineWidth}
//         />

//         {/* Tracks or Drop Zone */}
//         {tracks.length > -1 ? (
//           <TimelineContent
//             tracks={tracks}
//             measureCount={measureCount}
//             zoomLevel={zoomLevel}
//             currentTime={currentTime}
//             isPlaying={isPlaying}
//             bpm={bpm}
//             timeSignature={timeSignature}
//             onTrackPositionChange={onTrackPositionChange}
//             onTimeChange={onTimeChange}
//             totalWidth={totalTimelineWidth}
//             selectedTool={interactionSelectedTool}
//             selectedTrackIds={selectedTrackIds}
//             interaction={interaction}
//             justCompletedSelection={justCompletedSelection}
//             gridSnapEnabled={gridSnapEnabled}
//             gridSnapSize={gridSnapSize}
//             actualSnapSize={actualSnapSize}
//             isDragging={isDragging}
//             isResizing={isResizing}
//             draggedItemId={draggedItemId}
//             resizingItemId={resizingItemId}
//             resizeDirection={resizeDirection}
//             onClick={handleTimelineClick}
//           />
//         ) : (
//           <EmptyTimelineDropZone onTimeChange={onTimeChange} bpm={bpm} timeSignature={timeSignature} />
//         )}
//       </Box>
//     </Box>
//   );
// });

// interface TimelineRulerProps {
//   measureCount: number;
//   zoomLevel: number;
//   bpm?: number;
//   timeSignature?: [number, number];
//   onTimeChange?: (newTime: number) => void;
//   totalWidth?: number;
// }

// function TimelineRuler({
//   measureCount,
//   zoomLevel = 1,
//   bpm = 120,
//   timeSignature = [4, 4],
//   onTimeChange = () => {},
//   totalWidth
// }: TimelineRulerProps) {
//   const { studioMode } = useAppTheme();
//   const canvasRef = useRef<HTMLCanvasElement>(null);

//   // Define colors based on studioMode
//   const isDark = studioMode === 'dark';

//   // Adjusted light mode colors to be lighter shades of gray (via black with low alpha)
//   const SUBDIVISION_LINE_COLOR = isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(0, 0, 0, 0.10)';
//   const BEAT_LINE_COLOR = isDark ? 'rgba(255, 255, 255, 0.40)' : 'rgba(0, 0, 0, 0.20)';
//   const MEASURE_LINE_COLOR = isDark ? 'rgba(255, 255, 255, 0.70)' : 'rgba(0, 0, 0, 0.40)';

//   const beatsPerMeasure = timeSignature[0];
//   const measureWidthPixels = GRID_CONSTANTS.measureWidth;
//   const beatWidthPixels = measureWidthPixels / beatsPerMeasure;

//   // Handler for ruler clicks to set playback position
//   const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
//     const rect = e.currentTarget.getBoundingClientRect();
//     const clickX = e.clientX - rect.left;
//     const adjustedX = clickX / zoomLevel;
//     const newTime = calculatePositionTime(adjustedX, bpm, timeSignature);
//     onTimeChange(newTime);
//   };

//   React.useEffect(() => {
//     const canvas = canvasRef.current;
//     if (!canvas) return;

//     const ctx = canvas.getContext('2d');
//     if (!ctx) return;

//     const dpr = window.devicePixelRatio || 1;
//     const canvasWidth = totalWidth || canvas.parentElement?.clientWidth || 0;
//     const canvasHeight = GRID_CONSTANTS.headerHeight;

//     canvas.width = canvasWidth * dpr;
//     canvas.height = canvasHeight * dpr;
//     canvas.style.width = `${canvasWidth}px`;
//     canvas.style.height = `${canvasHeight}px`;
//     ctx.scale(dpr, dpr);

//     ctx.clearRect(0, 0, canvasWidth, canvasHeight);

//     // Drawing logic
//     const subdivisionsPerBeat = timeSignature[1];
//     const subdivisionWidthPixels = beatWidthPixels / subdivisionsPerBeat;

//     // 1. Draw subdivision lines (dimmest, shortest from bottom)
//     ctx.strokeStyle = SUBDIVISION_LINE_COLOR;
//     ctx.lineWidth = 1;
//     for (let m = 0; m < measureCount; m++) {
//       for (let b = 0; b < beatsPerMeasure; b++) {
//         for (let s = 1; s < subdivisionsPerBeat; s++) {
//           const x = m * measureWidthPixels + b * beatWidthPixels + s * subdivisionWidthPixels;
//           ctx.beginPath();
//           ctx.moveTo(x + 0.5, canvasHeight * 0.85); // Start at 85% from top (bottom 15%)
//           ctx.lineTo(x + 0.5, canvasHeight);
//           ctx.stroke();
//         }
//       }
//     }

//     // 2. Draw beat lines (medium prominence, medium height from bottom)
//     ctx.strokeStyle = BEAT_LINE_COLOR;
//     ctx.lineWidth = 0.5; // Make beat lines thinner
//     for (let m = 0; m < measureCount; m++) {
//       for (let b = 1; b < beatsPerMeasure; b++) { // Start from beat 1
//         const x = m * measureWidthPixels + b * beatWidthPixels;
//         ctx.beginPath();
//         ctx.moveTo(x + 0.5, canvasHeight * 0); // Start at 70% from top (bottom 30%)
//         ctx.lineTo(x + 0.5, canvasHeight);
//         ctx.stroke();
//       }
//     }

//     // 3. Draw measure lines (most prominent, full height)
//     ctx.strokeStyle = MEASURE_LINE_COLOR;
//     ctx.lineWidth = 1; // Target image lines look sharp, not overly thick
//     for (let i = 0; i <= measureCount; i++) {
//       const x = i * measureWidthPixels;
//       ctx.beginPath();
//       ctx.moveTo(x + 0.5, 0); // Full height
//       ctx.lineTo(x + 0.5, canvasHeight);
//       ctx.stroke();
//     }

//   }, [
//     totalWidth,
//     measureCount,
//     beatsPerMeasure,
//     timeSignature,
//     zoomLevel, 
//     SUBDIVISION_LINE_COLOR, BEAT_LINE_COLOR, MEASURE_LINE_COLOR
//   ]);

//   return (
//     <div
//       className={cn(
//         "sticky top-0 z-[2] box-border overflow-hidden shadow-sm border-b",
//         isDark ? "bg-neutral-900 border-b-neutral-700"
//                : "bg-neutral-100 border-b-neutral-300"
//         )}
//       style={{
//         height: `${GRID_CONSTANTS.headerHeight}px`,
//         width: totalWidth ? `${totalWidth}px` : '100%',
//       }}
//       onClick={handleRulerClick}
//     >
//       {/* Canvas for drawing lines */}
//       <canvas
//         ref={canvasRef}
//         className="absolute top-0 left-0 w-full h-full pointer-events-none"
//       />
//       {/* Measure Numbers */}
//       {Array.from({ length: measureCount }).map((_, measureIndex) => (
//         <div
//           key={`measure-num-${measureIndex}`}
//           className={cn(
//             "absolute top-1/2 -translate-y-1/2 text-sm select-none z-[1]",
//             isDark ? "text-neutral-200" : "text-neutral-700"
//             )}
//           style={{
//             left: `${measureIndex * measureWidthPixels + 5}px`,
//           }}
//         >
//           {measureIndex + 1}
//         </div>
//       ))}
//       {/* Beat Numbers */}
//       {Array.from({ length: measureCount }).map((_, measureIndex) => (
//         Array.from({ length: beatsPerMeasure -1 }).map((_, beatIndexInMeasure) => {
//           const actualBeatNumber = beatIndexInMeasure + 2;
//           const beatXPosition = measureIndex * measureWidthPixels + (actualBeatNumber -1) * beatWidthPixels;
//           return (
//             <div
//               key={`beat-num-${measureIndex}-${actualBeatNumber}`}
//               className={cn(
//                 "absolute top-1/2 -translate-y-1/2 text-[8px] select-none z-[1]",
//                 isDark ? "text-neutral-400" : "text-neutral-500"
//                 )}
//               style={{
//                 left: `${beatXPosition + 4}px`, 
//               }}
//             >
//               {actualBeatNumber}
//             </div>
//           );
//         })
//       ))}
//     </div>
//   );
// }

// interface TimelineContentProps extends TimelineRulerProps {
//   tracks: CombinedTrack[];
//   currentTime: number;
//   isPlaying: boolean;
//   bpm: number;
//   timeSignature: [number, number];
//   onTrackPositionChange: (trackId: string, newPosition: Position, isDragEnd: boolean) => void;
//   onTimeChange: (newTime: number) => void;
//   totalWidth?: number;
//   selectedTool: Tool;
//   selectedTrackIds: string[];
//   interaction: any; // Type from useTimelineInteractions
//   justCompletedSelection: boolean;
//   gridSnapEnabled?: boolean;
//   gridSnapSize?: GridSnapOption;
//   actualSnapSize?: number;
//   isDragging?: boolean;
//   isResizing?: boolean;
//   draggedItemId?: string | number | null;
//   resizingItemId?: string | number | null;
//   resizeDirection?: 'left' | 'right' | null;
//   onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
// }

// function TimelineContent({
//   tracks,
//   measureCount,
//   zoomLevel,
//   currentTime,
//   isPlaying,
//   bpm,
//   timeSignature,
//   onTrackPositionChange,
//   onTimeChange,
//   totalWidth,
//   selectedTool,
//   selectedTrackIds,
//   interaction,
//   justCompletedSelection,
//   gridSnapEnabled = true,
//   gridSnapSize = GridSnapOption.STEP,
//   actualSnapSize,
//   isDragging = false,
//   isResizing = false,
//   draggedItemId,
//   resizingItemId,
//   resizeDirection,
//   onClick
// }: TimelineContentProps) {
//   // Define fixed gray colors for grid lines
//   const fixedMeasureColor = 'rgba(128, 128, 128, 0.8)'; // Medium Gray, strong alpha
//   const fixedBeatColor = 'rgba(128, 128, 128, 0.5)';    // Medium Gray, medium alpha
//   const fixedSubdivisionColor = 'rgba(128, 128, 128, 0.25)'; // Medium Gray, low alpha

//   return (
//     <Box 
//       sx={{ 
//         minHeight: '100%',
//         position: 'relative',
//         willChange: "transform",
//         imageRendering: "crisp-edges",
//         transformOrigin: "top left",
//         cursor: 'pointer',
//       }}
//       style={{
//         width: totalWidth ? `${totalWidth}px` : '100%',
//       }}
//       onClick={onClick}
//     >
//       {/* Pass fixed gray colors to GridOverlay */}
//       <GridOverlay 
//         measureCount={measureCount} 
//         timeSignature={timeSignature} 
//         measureColor={fixedMeasureColor} 
//         beatColor={fixedBeatColor}         
//         subdivisionColor={fixedSubdivisionColor}
//       />

//       {tracks.map((track, index) => (
//         <Track 
//           key={track.id}
//           id={track.id}
//           index={index}
//           isSelected={selectedTrackIds.includes(track.id)}
//           selectedTool={selectedTool}
//           isGroupDrag={isDragging && selectedTrackIds.includes(track.id) && selectedTrackIds.length > 1}
//           isPrimaryDrag={draggedItemId === track.id}
//           isGroupResize={isResizing && selectedTrackIds.includes(track.id) && selectedTrackIds.length > 1}
//           isPrimaryResize={resizingItemId === track.id}
//           resizeDelta={isResizing ? { x: 0, y: 0 } : undefined} // We'll handle this properly with the new system
//           resizeDirection={resizingItemId === track.id ? resizeDirection : null}
//           resizeInitialDimensions={undefined} // Not needed with new system
//           onTrackClick={(trackId, event) => {
//             interaction.handleItemClick(trackId, event);
//           }}
//           onTrackDoubleClick={(trackId) => {
//             interaction.handleItemDoubleClick(trackId);
//           }}
//           interaction={interaction}
//           gridSnapEnabled={gridSnapEnabled}
//           gridSnapSize={gridSnapSize}
//           actualSnapSize={actualSnapSize}
//         />
//       ))}
//     </Box>
//   );
// }

// interface GridOverlayProps {
//   measureCount: number;
//   timeSignature?: [number, number];
//   measureColor?: string;
//   beatColor?: string;
//   subdivisionColor?: string;
// }

// function GridOverlay({
//   measureCount, 
//   timeSignature = [4, 4], 
//   // Update defaults to match the fixed grays
//   measureColor = 'rgba(128, 128, 128, 0.8)', 
//   beatColor = 'rgba(128, 128, 128, 0.5)',
//   subdivisionColor = 'rgba(128, 128, 128, 0.25)'
// }: GridOverlayProps) {
//   const canvasRef = React.useRef<HTMLCanvasElement>(null);
//   const containerRef = React.useRef<HTMLDivElement>(null);
//   const beatsPerMeasure = timeSignature[0];
//   const beatWidth = GRID_CONSTANTS.measureWidth / beatsPerMeasure;
  
//   // Draw grid lines on canvas
//   React.useEffect(() => {
//     const canvas = canvasRef.current;
//     const container = containerRef.current;
//     if (!canvas || !container) return;
    
//     // Set canvas size to match container
//     const resizeObserver = new ResizeObserver((entries) => {
//       for (const entry of entries) {
//         if (entry.target === container) {
//           canvas.width = container.clientWidth;
//           canvas.height = container.clientHeight;
//           drawGrid();
//         }
//       }
//     });
    
//     resizeObserver.observe(container);
    
//     // Initial sizing
//     canvas.width = container.clientWidth;
//     canvas.height = container.clientHeight;
    
//     // Draw grid function
//     function drawGrid() {
//       const ctx = canvas.getContext('2d');
//       if (!ctx) return;
      
//       // Enable high-DPI rendering for crisp lines
//       const dpr = window.devicePixelRatio || 1;
//       canvas.width = container.clientWidth * dpr;
//       canvas.height = container.clientHeight * dpr;
//       ctx.scale(dpr, dpr);
      
//       // Clear canvas
//       ctx.clearRect(0, 0, container.clientWidth, container.clientHeight);
      
//       const denominator = timeSignature[1];
      
//       // Colors are now passed directly or use the updated defaults
//       const MEASURE_COLOR = measureColor;
//       const BEAT_COLOR = beatColor;
//       const SUBDIVISION_COLOR = subdivisionColor;
      
//       // Ensure pixel-perfect rendering
//       const drawLine = (x: number, _opacity: number, color?: string) => { // Opacity parameter ignored now
//         const xPos = Math.round(x) + 0.5;
//         ctx.beginPath();
//         ctx.moveTo(xPos, 0);
//         ctx.lineTo(xPos, container.clientHeight);
//         // Use the provided color string directly (which includes alpha)
//         ctx.strokeStyle = color || SUBDIVISION_COLOR; 
//         ctx.lineWidth = 1;
//         ctx.stroke();
//       };
      
//       // Draw all subdivisions (with different opacities)
//       // IMPORTANT: For time signatures, denominator tells us the type of note that gets one beat
//       // 4 = quarter note gets one beat, 8 = eighth note gets one beat
//       // This means we need to adjust how we interpret subdivisions based on the denominator
      
//       const subdivisionsPerBeat = timeSignature[1]; // Use the denominator directly
//       const totalBeats = measureCount * beatsPerMeasure;
//       const totalSubdivisions = totalBeats * subdivisionsPerBeat;
      
//       // 1. First draw all regular subdivisions
//       // Calculate the width of each subdivision
//       const subdivisionWidth = beatWidth / subdivisionsPerBeat;
      

//       // For each beat in our timeline
//       for (let beatIndex = 0; beatIndex < totalBeats; beatIndex++) {
//         const beatStartPosition = beatIndex * beatWidth;
        
//         // For each subdivision within this beat (skip the beat itself at position 0)
//         for (let subdivision = 1; subdivision < subdivisionsPerBeat; subdivision++) {
//           // Calculate the exact position of this subdivision
//           const position = beatStartPosition + (subdivision * subdivisionWidth);
          
//           // Simplified: Draw all subdivisions with the base SUBDIVISION_COLOR
//           // Hierarchy is now mainly handled by the color alpha values passed in.
//           // We could still vary color based on isHalfBeat/isQuarterBeat if needed,
//           // but let's start simple.
//           drawLine(position, 1, SUBDIVISION_COLOR); // Pass opacity 1, color has alpha
//         }
//       }
      
//       // 2. Now draw beat lines on top
//       for (let i = 0; i <= totalBeats; i++) {
//         // Skip measure lines (we'll draw them last)
//         if (i % beatsPerMeasure !== 0) {
//           const x = i * beatWidth;
//           drawLine(x, 1, BEAT_COLOR); // Pass opacity 1, color has alpha
//         }
//       }
      
//       // 3. Finally draw measure lines (most prominent)
//       for (let i = 0; i <= measureCount; i++) {
//         const x = i * GRID_CONSTANTS.measureWidth;
//         drawLine(x, 1, MEASURE_COLOR); // Pass opacity 1, color has alpha
//       }
//     }
    
//     drawGrid();
    
//     // Cleanup
//     return () => {
//       resizeObserver.disconnect();
//     };
//   }, [measureCount, beatsPerMeasure, beatWidth, timeSignature, measureColor, beatColor, subdivisionColor]);
  
//   return (
//     <Box
//       ref={containerRef}
//       sx={{
//         position: 'absolute',
//         top: 0,
//         left: 0,
//         bottom: 0,
//         width: '100%', // Fill the full width of the parent container
//         pointerEvents: 'none', // Important: this makes the grid not catch any mouse events
//         zIndex: 1000
//       }}
//     >
//       <canvas
//         ref={canvasRef}
//         style={{
//           position: 'absolute',
//           top: 0,
//           left: 0,
//           width: '100%',
//           height: '100%',
//           display: 'block'
//         }}
//       />
//     </Box>
//   );
// }

// interface EmptyTimelineDropZoneProps {
//   onTimeChange?: (newTime: number) => void;
//   bpm?: number;
//   timeSignature?: [number, number];
// }

// function EmptyTimelineDropZone({ onTimeChange = () => {}, bpm = 120, timeSignature = [4, 4] }: EmptyTimelineDropZoneProps) {
//   const theme = useTheme();
//   return (
//     <Box sx={{ 
//       flex: 1,
//       display: 'flex',
//       alignItems: 'center',
//       justifyContent: 'center',
//       flexDirection: 'column',
//       color: 'text.secondary',
//       height: '100%',
//       border: `2px dashed ${theme.palette.divider}`,
//       m: 2,
//       borderRadius: 2,
//       position: 'relative', // For positioning the cursor inside
//     }}>
//       <Box sx={{ fontSize: 24, mb: 1 }}>♫</Box>
//       <Box>Drop a loop or an audio/MIDI/Video file</Box>
      
//       {/* We still include the cursor element even in empty state, just hidden until tracks exist */}
//       <PlaybackCursor currentTime={0} isPlaying={false} bpm={bpm} timeSignature={timeSignature} />
//     </Box>
//   );
// }