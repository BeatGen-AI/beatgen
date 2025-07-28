import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GRID_CONSTANTS } from '../../../constants/gridConstants';
import { pixelsToTicks, ticksToPixels } from '../../../constants/gridConstants';
import { CombinedTrack } from 'src/platform/types/project';
import { Position } from '../types';
import { Tool } from '../../../shared/interactions';
import { getFirstInstance } from '../../../utils/instanceHelpers';

/**
 * BaseTrackPreview is the foundation for all track visualizations in the timeline.
 * It provides common functionality like drag-and-drop positioning, visual styling,
 * and appearance management, while delegating track-specific content rendering to
 * specialized components. It also supports resizing from the left and right edges.
 * 
 * This component follows the strategy pattern, where the rendering behavior is
 * provided by the implementing components.
 */
export interface BaseTrackPreviewProps {
  /** Track data including ID, type, and state */
  track: CombinedTrack;
  
  /** Whether the track is currently playing */
  isPlaying: boolean;
  
  /** Current playback time in seconds */
  currentTime: number;
  
  /** Number of measures to display */
  measureCount: number;
  
  /** Style for grid lines */
  gridLineStyle: { borderRight: string };
  
  /** Callback when track position changes */
  onPositionChange: (trackId: string, newPosition: Position, isDragEnd: boolean) => void;
  
  /** Current project BPM */
  bpm: number;
  
  /** Time signature as [beats, beatUnit] */
  timeSignature?: [number, number];
  
  /** Track index for color determination */
  trackIndex?: number;
  
  /** Color for track visualization */
  trackColor: string;
  
  /** Optional style overrides */
  trackStyleOverrides?: React.CSSProperties;
  
  /** Function to render track-specific content */
  renderTrackContent: () => React.ReactNode;
  
  /** Calculated width for the track container */
  trackWidth: number;
  
  /** Full content width (before trimming) - used for positioning the content within the viewport */
  contentWidth?: number;
  
  /** Callback when track resizing finishes */
  onResizeEnd: (trackId: string, newTrimTicks: number, resizeDirection: 'left' | 'right') => void;
  
  /** Selection and tool integration */
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
  
  /** Interaction manager for coordinated drag operations */
  interaction?: any;
  
  /** Grid snap configuration */
  gridSnapEnabled?: boolean;
  gridSnapSize?: number;
  actualSnapSize?: number;
}

export const BaseTrackPreview: React.FC<BaseTrackPreviewProps> = ({
  track,
  isPlaying,
  currentTime,
  onPositionChange,
  trackColor,
  trackStyleOverrides = {},
  renderTrackContent,
  trackWidth,
  contentWidth,
  timeSignature = [4, 4],
  bpm,
  onResizeEnd,
  isSelected = false,
  selectedTool = 'select',
  isGroupDrag = false,
  isPrimaryDrag = false,
  isGroupResize = false,
  isPrimaryResize = false,
  resizeDelta,
  resizeDirection: propResizeDirection,
  resizeInitialDimensions,
  onTrackClick,
  onTrackDoubleClick,
  interaction,
  gridSnapEnabled = true,
  gridSnapSize,
  actualSnapSize
}) => {
  // Use the provided content width or default to track width if not specified
  const actualContentWidth = contentWidth || trackWidth;
  
  // Refs and state for drag functionality
  const trackRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Track the content transform during left-side resize
  const [contentTransform, setContentTransform] = useState(0);
  
  // Calculate the normal content offset for trimming from the beginning
  const calculateContentOffset = () => {
    const firstInstance = getFirstInstance(track);
    if (!track.duration_ticks || !firstInstance?.trim_start_ticks) return 0;
    
    // Calculate what percentage of the original content is trimmed from start
    const trimRatio = firstInstance.trim_start_ticks / track.duration_ticks;
    
    // Apply that ratio to the full content width to get the offset
    return -(trimRatio * actualContentWidth);
  };
  
  // The normal position offset for content (used when not actively resizing)
  const contentOffsetX = calculateContentOffset();

  // Calculate selection styles
  const getSelectionStyles = () => {
    const baseSelectionStyles: any = {};
    
    if (isSelected) {
      baseSelectionStyles.outline = '3px solid #2196f3';
      baseSelectionStyles.outlineOffset = '-2px';
      baseSelectionStyles.zIndex = 1001; // Selected tracks have higher z-index
      
      if (isGroupDrag) {
        baseSelectionStyles.transform = 'scale(1.02)';
        baseSelectionStyles.opacity = 0.9;
        if (isPrimaryDrag) {
          baseSelectionStyles.boxShadow = '0 8px 32px rgba(33, 150, 243, 0.4)';
        }
      } else if (isGroupResize) {
        baseSelectionStyles.opacity = 0.95;
        if (isPrimaryResize) {
          baseSelectionStyles.boxShadow = '0 4px 16px rgba(33, 150, 243, 0.6)';
          baseSelectionStyles.borderColor = '#1976d2';
        }
      }
    } else if (selectedTool === 'select') {
      baseSelectionStyles['&:hover'] = {
        outline: '2px dashed rgba(33, 150, 243, 0.7)',
        backgroundColor: 'rgba(33, 150, 243, 0.05)'
      };
    }
    
    return baseSelectionStyles;
  };

  // Create base style object for track
  const trackStyleInline = {
    height: GRID_CONSTANTS.trackHeight,
    left: `${ticksToPixels(getFirstInstance(track)?.x_position ?? 0, bpm, timeSignature)}px`,
    top: `${getFirstInstance(track)?.y_position ?? 0}px`,
    cursor: isSelected ? 'grab' : getToolCursor(),
    zIndex: isSelected ? 1001 : 1000,
    transition: (interaction?.isDragging || interaction?.isResizing || isGroupDrag || isGroupResize) ? 'none' : 'width 0.2s ease, left 0.2s ease, top 0.2s ease, transform 0.2s ease',
    width: `${trackWidth}px`,
    backgroundColor: 'rgba(26, 26, 26, 0.8)',
    borderBottomColor: GRID_CONSTANTS.borderColor,
    ...trackStyleOverrides
  };

  // Generate hover styles dynamically
  const hoverStyle = {
    boxShadow: `0 0 12px ${trackColor}`,
    zIndex: 9999
  };

  // Generate selection styles for inline use
  const selectionStylesInline = getSelectionStyles();

  // Get tool-specific cursor
  function getToolCursor() {
    switch (selectedTool) {
      case 'select':
        return 'pointer';
      case 'eraser':
        return 'crosshair';
      case 'pen':
        return 'copy';
      case 'highlighter':
        return 'cell';
      default:
        return 'grab';
    }
  }

  // Mouse event handlers for dragging and selection
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!trackRef.current) {
      return;
    }
    
    // Prevent dragging when clicking on controls or resize handles
    if ((e.target as HTMLElement).closest('.track-control') || (e.target as HTMLElement).closest('.resize-handle')) {
      return;
    }

    // Handle tool-specific interactions first
    if (selectedTool !== 'select') {
      e.stopPropagation();
      if (onTrackClick) {
        onTrackClick(track.id, {
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey
        });
      }
      return;
    }

    // For select tool, handle selection logic
    if (selectedTool === 'select' && onTrackClick) {
      onTrackClick(track.id, {
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey
      });
    }

    // Use interaction manager for coordinated drag operations
    if (interaction && selectedTool === 'select' && interaction.startDrag) {
      // Find container element for scroll offset
      const container = trackRef.current.closest('.timeline-container');
        
      if (!container) {
        return;
      }
      
      // Get the bounding rect to calculate proper position
      const rect = trackRef.current.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      // Calculate mouse offset within the track (where the user clicked relative to track's top-left)
      const mouseOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      
      // Calculate absolute mouse position in the container's coordinate space
      const mousePosition = {
        x: e.clientX - containerRect.left + container.scrollLeft,
        y: e.clientY - containerRect.top + container.scrollTop
      };
      
      interaction.startDrag(track.id, mousePosition, mouseOffset);
      
      e.preventDefault();
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent, direction: 'left' | 'right') => {
    if (!trackRef.current) return;
    
    const container = trackRef.current.closest('.timeline-container');
      
    if (!container) {
      return;
    }

    // Use interaction manager for resize
    if (interaction && selectedTool === 'select' && interaction.startResize) {
      // Get the container's bounding rect for proper coordinate calculation
      const containerRect = container.getBoundingClientRect();
      
      // Calculate mouse position in container's coordinate space
      const mousePosition = {
        x: e.clientX - containerRect.left + container.scrollLeft,
        y: e.clientY - containerRect.top + container.scrollTop
      };
      
      interaction.startResize(track.id, direction, mousePosition);
      
      e.stopPropagation();
      e.preventDefault();
    }
  };
  
  // Sync position AND width from props to DOM
  useEffect(() => {
    if (trackRef.current) {
      const firstInstance = getFirstInstance(track);
      // Convert track position from ticks to pixels for display
      const pixelX = ticksToPixels(firstInstance?.x_position ?? 0, bpm, timeSignature);
      
      trackRef.current.style.left = `${pixelX}px`;
      trackRef.current.style.top = `${firstInstance?.y_position ?? 0}px`;
      trackRef.current.style.width = `${trackWidth}px`;
      
    }
  }, [track.instances, trackWidth, track.id, bpm, timeSignature, track.duration_ticks]);
  
  // Handle resize delta from parent (when using interaction manager for group resize)
  useEffect(() => {
    if (isGroupResize && resizeDelta && resizeInitialDimensions && propResizeDirection && trackRef.current) {
      const delta = resizeDelta.x;
      const initialDim = resizeInitialDimensions;
      
      
      // Disable transitions during resize
      trackRef.current.style.transition = 'none';
      if (contentRef.current) {
        contentRef.current.style.transition = 'none';
      }
      
      if (propResizeDirection === 'right') {
        // Right resize - just change width
        const newWidth = Math.max(48, initialDim.width + delta);
        trackRef.current.style.width = `${newWidth}px`;
        // Keep position unchanged
        const firstInstance = getFirstInstance(track);
        const currentPosPixels = ticksToPixels(firstInstance?.x_position ?? 0, bpm, timeSignature);
        trackRef.current.style.left = `${currentPosPixels}px`;
      } else if (propResizeDirection === 'left') {
        // Left resize - change both position and width
        const newWidth = Math.max(48, initialDim.width - delta);
        const widthDiff = initialDim.width - newWidth;
        const initialPosPixels = ticksToPixels(initialDim.x, bpm, timeSignature);
        const newX = initialPosPixels + widthDiff;
        
        trackRef.current.style.width = `${newWidth}px`;
        trackRef.current.style.left = `${newX}px`;
        
        // Adjust content transform
        if (contentRef.current) {
          const containerDeltaX = newX - initialPosPixels;
          const initialTransform = calculateContentOffset();
          const transform = initialTransform - containerDeltaX;
          contentRef.current.style.transform = `translateX(${transform}px)`;
          setContentTransform(transform);
        }
      }
    } else if (!isGroupResize && contentTransform !== 0) {
      // Reset content transform when not resizing
      setContentTransform(0);
      if (contentRef.current) {
        contentRef.current.style.transform = `translateX(${contentOffsetX}px)`;
      }
    }
  }, [isGroupResize, resizeDelta, resizeInitialDimensions, propResizeDirection, bpm, timeSignature, track.instances, track.id, trackWidth, contentTransform, contentOffsetX]);

  // Calculate the transform to use for content position
  const getContentTransform = () => {
    if (contentTransform !== 0) {
      // Use the manually set transform if we have one
      return contentTransform;
    } 
    // Otherwise use normal offset based on trim values
    return contentOffsetX;
  };

  // Define styles for resize handles
  const resizeHandleStyleInline = {
    zIndex: 1002,
    backgroundColor: isGroupResize ? 'rgba(33, 150, 243, 0.3)' : 'transparent'
  };

  // Handle double click for selection integration
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (onTrackDoubleClick) {
      e.stopPropagation();
      onTrackDoubleClick(track.id);
    }
  }, [onTrackDoubleClick, track.id]);

  return (
    <div className="relative">
      {/* Selection indicators */}
      {isSelected && (
        <>
          {/* Selection background */}
          <div
            className={`absolute -top-1 -left-1 -right-1 -bottom-1 rounded-lg pointer-events-none -z-10 ${
              isPrimaryDrag ? 'border-2 border-blue-500' : ''
            }`}
            style={{
              backgroundColor: isPrimaryDrag 
                ? 'rgba(33, 150, 243, 0.25)' 
                : 'rgba(33, 150, 243, 0.15)'
            }}
          />
          
          {/* Selection badge */}
          <div
            className="absolute top-1 right-1 w-[18px] h-[18px] text-white rounded-full flex items-center justify-center font-bold pointer-events-none shadow-sm"
            style={{
              backgroundColor: isPrimaryDrag ? '#ff9800' : '#2196f3',
              fontSize: isPrimaryDrag ? '8px' : '10px',
              zIndex: 1002,
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            {isPrimaryDrag ? '◉' : '✓'}
          </div>
        </>
      )}

      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className="track flex absolute box-border border-b rounded-md m-0 p-0 overflow-hidden group"
        style={{
          ...trackStyleInline,
          ...selectionStylesInline,
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid'
        }}
        onMouseEnter={(e) => {
          Object.assign(e.currentTarget.style, hoverStyle);
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '';
          e.currentTarget.style.zIndex = isSelected ? '1001' : '1000';
        }}
        data-track-width={trackWidth} // Add data attribute for debugging
        data-track-id={track.id} // Add for selection layer integration
      >
        {/* Left Resize Handle */}
        <div
          className="resize-handle resize-handle-left absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-500/50 transition-colors"
          style={{
            ...resizeHandleStyleInline,
            left: '-4px'
          }}
          onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
        />
        
        {/* Right Resize Handle */}
        <div
          className="resize-handle resize-handle-right absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-500/50 transition-colors"
          style={{
            ...resizeHandleStyleInline,
            right: '-4px'
          }}
          onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
        />

        {/* Track Timeline Content (Original Inner Box) */}
        <div 
          className="flex flex-1 relative overflow-hidden h-full m-0 p-0 box-border border-l-0 border-r-0 transition-opacity duration-200 pointer-events-none group-hover:shadow-inner"
          style={{
            width: `${trackWidth}px`,
            background: `linear-gradient(180deg, ${trackColor}80 0%, ${trackColor} 100%)`,
            opacity: track.mute ? 0.4 : 0.85
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = track.mute ? '0.5' : '1';
            e.currentTarget.style.boxShadow = 'inset 0 0 10px rgba(255,255,255,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = track.mute ? '0.4' : '0.85';
            e.currentTarget.style.boxShadow = '';
          }}
        >
          {/* Track Type Badge */}
          <div 
            className="absolute right-2.5 top-1.5 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase opacity-70 pointer-events-none"
            style={{
              backgroundColor: track.track_type === 'AUDIO' ? '#4caf50' : 
                              track.track_type === 'MIDI' ? '#2196f3' : 
                              track.track_type === 'DRUM' ? '#ff9800' : '#9c27b0'
            }}
          >
            {track.track_type}
          </div>
          
          {/* Content Wrapper - Visible part is controlled by the container's overflow: hidden */}
          <div 
            ref={contentRef}
            className="track-content-wrapper absolute top-0 left-0 h-full flex items-center justify-start opacity-80 pointer-events-none"
            style={{
              width: `${actualContentWidth}px`,
              transform: `translateX(${getContentTransform()}px)`,
              transition: (isGroupResize || interaction?.isResizing) ? 'none' : 'transform 0.2s ease'
            }}
          >
            {renderTrackContent()}
          </div>
          
          {/* Track Name */}
          <div 
            className="absolute left-2.5 top-1.5 text-white text-xs font-bold pointer-events-none"
            style={{
              textShadow: '1px 1px 2px rgba(0,0,0,0.7)'
            }}
          >
            {track.name}
          </div>
          
          {/* Muted indicator */}
          {track.mute && (
            <div 
              className="absolute w-full h-full flex items-center justify-center text-white text-sm font-bold pointer-events-none"
              style={{
                backgroundColor: 'rgba(0,0,0,0.4)'
              }}
            >
              MUTED
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BaseTrackPreview;