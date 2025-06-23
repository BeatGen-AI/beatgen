import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Group, Rect, Text, Label, Tag } from 'react-konva';
import { CombinedTrack } from 'src/platform/types/project';
import { AudioTrackRenderer } from './tracks/AudioTrackRenderer';
import { MidiTrackRenderer } from './tracks/MidiTrackRenderer';
import { DrumTrackRenderer } from './tracks/DrumTrackRenderer';
import { GRID_CONSTANTS } from '../../../constants/gridConstants';

export interface KonvaTrackProps {
  track: CombinedTrack;
  instanceId?: string; // Add instance ID prop
  x: number;
  y: number;
  width: number;
  height: number;
  isSelected: boolean;
  isDragging?: boolean;
  isPrimary?: boolean;
  isResizing?: boolean;
  resizeDirection?: 'left' | 'right' | null;
  previewWidth?: number;
  pixelsPerTick: number;
  bpm: number;
  timeSignature: [number, number];
  onClick?: (id: string, e: any) => void;
  onMouseDown?: (id: string, e: any) => void;
  onResizeStart?: (id: string, direction: 'left' | 'right', mousePos: { x: number; y: number }) => void;
  selectedCount?: number;
  gridSnapEnabled?: boolean;
  snapSizeInPixels?: number;
  data?: any; // Additional data for color etc
}

/**
 * Konva-based track component for the timeline.
 * Renders track visualization with type-specific content.
 */
export const KonvaTrack: React.FC<KonvaTrackProps> = ({
  track,
  instanceId,
  x,
  y,
  width,
  height,
  isSelected,
  isDragging = false,
  isPrimary = false,
  isResizing = false,
  resizeDirection = null,
  previewWidth: propPreviewWidth,
  pixelsPerTick,
  bpm,
  timeSignature,
  onClick,
  onMouseDown,
  onResizeStart,
  selectedCount = 1,
  gridSnapEnabled = true,
  snapSizeInPixels = 12.5,
  data
}) => {
  // Validate required numeric props
  if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
    return null;
  }
  const groupRef = useRef<any>(null);
  const backgroundRef = useRef<any>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [resizeContentOffset, setResizeContentOffset] = useState(0);
  const [resizeStartX, setResizeStartX] = useState<number | null>(null);
  
  // Use prop preview width if provided (during resize), otherwise use internal state
  const previewWidth = propPreviewWidth || null;
  
  // Ensure we have valid width values
  const displayWidth = Math.max(1, previewWidth || width || 1);
  const isValidWidth = !isNaN(displayWidth) && displayWidth > 0;
  
  // Get track color from props (passed from parent)
  const trackColor = useMemo(() => {
    // If color is explicitly passed in data, use it
    if (data?.color) {
      return data.color;
    }
    
    // This should not happen - color should always be passed from parent
    return '#9c27b0';
  }, [data?.color]);
  
  // Get the instance data
  const instance = useMemo(() => {
    return track.instances?.find(inst => inst.id === instanceId);
  }, [track.instances, instanceId]);
  
  // Calculate full content width
  const fullContentWidth = useMemo(() => {
    if (!track.duration_ticks || isNaN(pixelsPerTick) || pixelsPerTick <= 0) return displayWidth;
    return track.duration_ticks * pixelsPerTick;
  }, [track.duration_ticks, pixelsPerTick, displayWidth]);
  
  // Calculate base content offset for trimmed tracks
  const baseContentOffset = useMemo(() => {
    if (!instance || !track.duration_ticks || track.duration_ticks === 0) return 0;
    if (isNaN(pixelsPerTick) || pixelsPerTick <= 0) return 0;
    const trimRatio = instance.trim_start_ticks / track.duration_ticks;
    const result = -(trimRatio * fullContentWidth);
    return isNaN(result) ? 0 : result;
  }, [instance, track.duration_ticks, pixelsPerTick, fullContentWidth]);
  
  // Calculate final content offset including resize adjustments
  const contentOffset = baseContentOffset + resizeContentOffset;
  
  // Track when resize starts
  useEffect(() => {
    if (isResizing && resizeStartX === null) {
      // Resize just started, record the initial x position
      setResizeStartX(x);
    } else if (!isResizing && resizeStartX !== null) {
      // Resize ended, clear the start position
      setResizeStartX(null);
      setResizeContentOffset(0);
    }
  }, [isResizing, resizeStartX, x]);

  // Update content offset during left resize to keep content stable
  useEffect(() => {
    if (isResizing && resizeDirection === 'left' && resizeStartX !== null) {
      // Calculate how much the track has moved from its original position
      const positionDelta = x - resizeStartX;
      // Move content in opposite direction to compensate
      setResizeContentOffset(-positionDelta);
    }
  }, [isResizing, resizeDirection, x, resizeStartX]);
  
  // Render track content based on type
  const renderTrackContent = () => {
    const contentProps = {
      track,
      width: fullContentWidth, // Use full content width, not display width
      height,
      pixelsPerTick,
      contentOffset: 0, // Don't pass offset to renderer, handle it in Group transform
      color: trackColor
    };
    
    switch (track.track_type) {
      case 'AUDIO':
        return <AudioTrackRenderer {...contentProps} />;
      case 'MIDI':
      case 'SAMPLER':
        return <MidiTrackRenderer {...contentProps} />;
      case 'DRUM':
        return <DrumTrackRenderer {...contentProps} />;
      default:
        return null;
    }
  };
  
  
  return (
    <Group
      ref={groupRef}
      x={x}
      y={y}
      width={displayWidth}
      height={height}
      draggable={false}  // Disable Konva dragging, use manual position updates
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.cancelBubble = true; // Prevent stage from deselecting
        if (onClick) {
          // Use instance ID directly
          const idToUse = instanceId || track.id;
          onClick(idToUse, e);
        }
      }}
      onMouseDown={(e) => {
        // Don't start drag if clicking on resize handles
        if (isResizingLeft || isResizingRight) {
          return;
        }
        
        e.cancelBubble = true;
        if (onMouseDown) {
          // Use instance ID directly
          const idToUse = instanceId || track.id;
          onMouseDown(idToUse, e);
        }
      }}
    >
      {/* Track background */}
      <Rect
        ref={backgroundRef}
        x={0}
        y={0}
        width={displayWidth}
        height={height}
        fill="rgba(26, 26, 26, 0.8)"
        stroke={isSelected ? '#2196f3' : 'transparent'}
        strokeWidth={isSelected ? 3 : 0}
        strokeScaleEnabled={false}
        cornerRadius={6}
        opacity={track.mute ? 0.4 : 0.85}
        shadowEnabled={isHovered && !track.mute}
        shadowColor={trackColor}
        shadowBlur={12}
        shadowOpacity={1}
        perfectDrawEnabled={false}
        draggable={false}  // Prevent the rect from being dragged independently
      />
      
      {/* Gradient overlay */}
      <Rect
        x={0}
        y={0}
        width={displayWidth}
        height={height}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: 0, y: height }}
        fillLinearGradientColorStops={[
          0, `${trackColor}80`,
          1, trackColor
        ]}
        cornerRadius={6}
        opacity={track.mute ? 0.4 : 0.85}
        listening={false}
      />
      
      {/* Resize preview outline */}
      {isResizing && previewWidth && previewWidth !== width && isValidWidth && (
        <Rect
          x={0}
          y={0}
          width={displayWidth}
          height={height}
          stroke="rgba(74, 144, 226, 0.8)"
          strokeWidth={2}
          fill="transparent"
          cornerRadius={4}
          dash={[5, 5]}
          listening={false}
        />
      )}
      
      {/* Track content - clipped to track bounds */}
      <Group clip={{ x: 0, y: 0, width: displayWidth, height }}>
        {/* Content wrapper with transform for trimming and resize */}
        <Group x={contentOffset}>
          {renderTrackContent()}
        </Group>
      </Group>
      
      {/* Track type badge */}
      <Group x={displayWidth - 10} y={5}>
        <Rect
          x={-50}
          y={0}
          width={40}
          height={16}
          fill={trackColor}
          cornerRadius={3}
          opacity={0.7}
          listening={false}
        />
        <Text
          x={-50}
          y={3}
          width={40}
          text={track.track_type}
          fontSize={10}
          fontStyle="bold"
          fill="white"
          align="center"
          listening={false}
        />
      </Group>
      
      {/* Track name */}
      <Text
        x={10}
        y={6}
        text={track.name}
        fontSize={12}
        fontStyle="bold"
        fill="white"
        shadowColor="rgba(0,0,0,0.7)"
        shadowBlur={2}
        shadowOffset={{ x: 1, y: 1 }}
        listening={false}
      />
      
      {/* Muted indicator */}
      {track.mute && (
        <>
          <Rect
            x={0}
            y={0}
            width={displayWidth}
            height={height}
            fill="rgba(0,0,0,0.4)"
            cornerRadius={6}
            listening={false}
          />
          <Text
            x={displayWidth / 2}
            y={height / 2 - 7}
            text="MUTED"
            fontSize={14}
            fontStyle="bold"
            fill="white"
            align="center"
            offsetX={20}
            listening={false}
          />
        </>
      )}
      
      {/* Selection highlight - already handled by stroke on main background rect */}
      
      {/* Custom resize handles - show on hover for all tracks */}
      {isHovered && !isDragging && !isResizing && isValidWidth && (
        <>
          {/* Left resize handle */}
          <Rect
            x={-4}
            y={0}
            width={8}
            height={height}
            fill={isResizingLeft ? "rgba(33, 150, 243, 0.5)" : "transparent"}
            opacity={1}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) {
                stage.container().style.cursor = 'ew-resize';
              }
              setIsResizingLeft(true);
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage && !isResizing) {
                stage.container().style.cursor = 'default';
              }
              setIsResizingLeft(false);
            }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              if (onResizeStart) {
                const stage = e.target.getStage();
                const pos = stage?.getPointerPosition();
                if (pos) {
                  // Use instance ID directly - it's already the full ID
                  const idToUse = instanceId || track.id;
                  onResizeStart(idToUse, 'left', pos);
                }
              }
            }}
          />
          
          {/* Right resize handle */}
          <Rect
            x={Math.max(0, displayWidth - 4)}
            y={0}
            width={8}
            height={height}
            fill={isResizingRight ? "rgba(33, 150, 243, 0.5)" : "transparent"}
            opacity={1}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) {
                stage.container().style.cursor = 'ew-resize';
              }
              setIsResizingRight(true);
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage && !isResizing) {
                stage.container().style.cursor = 'default';
              }
              setIsResizingRight(false);
            }}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              if (onResizeStart) {
                const stage = e.target.getStage();
                const pos = stage?.getPointerPosition();
                if (pos) {
                  // Use instance ID directly - it's already the full ID
                  const idToUse = instanceId || track.id;
                  onResizeStart(idToUse, 'right', pos);
                }
              }
            }}
          />
          
          {/* Visual resize indicators */}
          {(isResizingLeft || isResizingRight || isResizing) && isValidWidth && (
            <Text
              x={displayWidth / 2}
              y={height / 2 - 6}
              text={`${Math.round(displayWidth)}px`}
              fontSize={12}
              fill="white"
              align="center"
              width={displayWidth}
              listening={false}
            />
          )}
        </>
      )}
    </Group>
  );
};

// Export memoized version to prevent unnecessary re-renders
export default React.memo(KonvaTrack, (prevProps, nextProps) => {
  // Custom comparison function - only re-render if important props change
  // Skip deep comparison for performance - only check specific fields that matter
  
  // Quick checks for the most common changes
  if (
    prevProps.x !== nextProps.x ||
    prevProps.y !== nextProps.y ||
    prevProps.width !== nextProps.width ||
    prevProps.height !== nextProps.height ||
    prevProps.isSelected !== nextProps.isSelected ||
    prevProps.isDragging !== nextProps.isDragging ||
    prevProps.isResizing !== nextProps.isResizing ||
    prevProps.previewWidth !== nextProps.previewWidth
  ) {
    return false; // Props changed, need to re-render
  }
  
  // Check track-specific data that affects rendering
  if (prevProps.track.id !== nextProps.track.id ||
      prevProps.track.name !== nextProps.track.name ||
      prevProps.track.mute !== nextProps.track.mute ||
      prevProps.track.track_type !== nextProps.track.track_type) {
    return false;
  }
  
  // For MIDI/SAMPLER tracks, check if notes have changed
  if (prevProps.track.track_type === 'MIDI' || prevProps.track.track_type === 'SAMPLER') {
    const prevNotes = prevProps.track.track?.midi_notes_json?.notes;
    const nextNotes = nextProps.track.track?.midi_notes_json?.notes;
    
    // Quick length check first
    if (prevNotes?.length !== nextNotes?.length) {
      return false;
    }
    
    // If both are empty or undefined, they're equal
    if (!prevNotes && !nextNotes) {
      return true;
    }
  }
  
  // All other props can be compared directly
  return (
    prevProps.instanceId === nextProps.instanceId &&
    prevProps.isPrimary === nextProps.isPrimary &&
    prevProps.resizeDirection === nextProps.resizeDirection &&
    prevProps.pixelsPerTick === nextProps.pixelsPerTick &&
    prevProps.bpm === nextProps.bpm &&
    prevProps.timeSignature[0] === nextProps.timeSignature[0] &&
    prevProps.timeSignature[1] === nextProps.timeSignature[1] &&
    prevProps.gridSnapEnabled === nextProps.gridSnapEnabled &&
    prevProps.snapSizeInPixels === nextProps.snapSizeInPixels &&
    prevProps.selectedCount === nextProps.selectedCount &&
    prevProps.data?.color === nextProps.data?.color
  );
});