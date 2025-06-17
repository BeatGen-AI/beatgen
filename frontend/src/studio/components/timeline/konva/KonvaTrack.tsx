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
  const groupRef = useRef<any>(null);
  const backgroundRef = useRef<any>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  
  // Use prop preview width if provided (during resize), otherwise use internal state
  const previewWidth = propPreviewWidth || null;
  
  // Get track color from props (passed from parent)
  const trackColor = useMemo(() => {
    // If color is explicitly passed in data, use it
    if (data?.color) {
      return data.color;
    }
    
    // Otherwise fall back to type-based colors
    switch (track.type) {
      case 'AUDIO':
        return '#4caf50';
      case 'MIDI':
      case 'SAMPLER':
        return '#2196f3';
      case 'DRUM':
        return '#ff9800';
      default:
        return '#9c27b0';
    }
  }, [track.type, data?.color]);
  
  // Calculate content offset for trimmed tracks
  const contentOffset = useMemo(() => {
    if (!track.trim_start_ticks || !track.duration_ticks) return 0;
    const trimRatio = track.trim_start_ticks / track.duration_ticks;
    const fullWidth = track.duration_ticks * pixelsPerTick;
    return -(trimRatio * fullWidth);
  }, [track.trim_start_ticks, track.duration_ticks, pixelsPerTick]);
  
  
  // Render track content based on type
  const renderTrackContent = () => {
    const contentProps = {
      track,
      width: previewWidth || width,
      height,
      pixelsPerTick,
      contentOffset,
      color: trackColor
    };
    
    
    switch (track.type) {
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
      width={width}
      height={height}
      draggable={false}  // Disable Konva dragging, use manual position updates
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.cancelBubble = true; // Prevent stage from deselecting
        if (onClick) {
          // Create composite ID for consistency
          const compositeId = instanceId ? `${track.id}_${instanceId}` : track.id;
          onClick(compositeId, e);
        }
      }}
      onMouseDown={(e) => {
        // Don't start drag if clicking on resize handles
        if (isResizingLeft || isResizingRight) {
          return;
        }
        
        e.cancelBubble = true;
        if (onMouseDown) {
          // Create composite ID for consistency
          const compositeId = instanceId ? `${track.id}_${instanceId}` : track.id;
          onMouseDown(compositeId, e);
        }
      }}
    >
      {/* Track background */}
      <Rect
        ref={backgroundRef}
        x={0}
        y={0}
        width={previewWidth || width}
        height={height}
        fill={trackColor}
        stroke={isSelected ? '#fff' : '#333'}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={4}
        opacity={isDragging ? 0.7 : 1}
        shadowEnabled={false}
        perfectDrawEnabled={false}
        draggable={false}  // Prevent the rect from being dragged independently
      />
      
      {/* Resize preview outline */}
      {isResizing && previewWidth && previewWidth !== width && (
        <Rect
          x={0}
          y={0}
          width={previewWidth}
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
      <Group clip={{ x: 0, y: 0, width: previewWidth || width, height }}>
        {renderTrackContent()}
      </Group>
      
      {/* Track label */}
      <Label x={5} y={5}>
        <Tag fill="rgba(0, 0, 0, 0.7)" cornerRadius={3} />
        <Text
          text={track.name}
          fontSize={12}
          fill="white"
          padding={4}
        />
      </Label>
      
      {/* Selection highlight */}
      {isSelected && !isDragging && (
        <Rect
          x={-2}
          y={-2}
          width={(previewWidth || width) + 4}
          height={height + 4}
          stroke="#4a90e2"
          strokeWidth={2}
          fill="transparent"
          cornerRadius={4}
          listening={false}
        />
      )}
      
      {/* Custom resize handles - show on hover for all tracks */}
      {isHovered && !isDragging && !isResizing && (
        <>
          {/* Left resize handle */}
          <Rect
            x={0}
            y={0}
            width={8}
            height={height}
            fill={isResizingLeft ? "rgba(74, 144, 226, 0.5)" : "transparent"}
            stroke={isSelected ? "#4a90e2" : "#666"}
            strokeWidth={isResizingLeft ? 2 : 1}
            opacity={isResizingLeft ? 1 : 0.7}
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
              console.log('🔧 KonvaTrack - LEFT resize handle mouseDown', {
                trackId: track.id,
                instanceId,
                idUsed: instanceId || track.id,
                onResizeStart: !!onResizeStart,
                event: e
              });
              e.cancelBubble = true;
              if (onResizeStart) {
                const stage = e.target.getStage();
                const pos = stage?.getPointerPosition();
                console.log('🔧 KonvaTrack - LEFT resize getting position', {
                  stage: !!stage,
                  pos
                });
                if (pos) {
                  // Create composite ID for resize system
                  const compositeId = instanceId ? `${track.id}_${instanceId}` : track.id;
                  console.log('🔧 KonvaTrack - LEFT resize calling onResizeStart', {
                    instanceId,
                    trackId: track.id,
                    compositeId,
                    direction: 'left',
                    pos
                  });
                  onResizeStart(compositeId, 'left', pos);
                }
              }
            }}
          />
          
          {/* Right resize handle */}
          <Rect
            x={(previewWidth || width) - 8}
            y={0}
            width={8}
            height={height}
            fill={isResizingRight ? "rgba(74, 144, 226, 0.5)" : "transparent"}
            stroke={isSelected ? "#4a90e2" : "#666"}
            strokeWidth={isResizingRight ? 2 : 1}
            opacity={isResizingRight ? 1 : 0.7}
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
              console.log('🔧 KonvaTrack - RIGHT resize handle mouseDown', {
                trackId: track.id,
                instanceId,
                idUsed: instanceId || track.id,
                onResizeStart: !!onResizeStart,
                event: e
              });
              e.cancelBubble = true;
              if (onResizeStart) {
                const stage = e.target.getStage();
                const pos = stage?.getPointerPosition();
                console.log('🔧 KonvaTrack - RIGHT resize getting position', {
                  stage: !!stage,
                  pos
                });
                if (pos) {
                  // Use instance ID if provided, otherwise fall back to track ID
                  // Create composite ID for resize system
                  const compositeId = instanceId ? `${track.id}_${instanceId}` : track.id;
                  console.log('🔧 KonvaTrack - RIGHT resize calling onResizeStart', {
                    instanceId,
                    trackId: track.id,
                    compositeId,
                    direction: 'right',
                    pos
                  });
                  onResizeStart(compositeId, 'right', pos);
                }
              }
            }}
          />
          
          {/* Visual resize indicators */}
          {(isResizingLeft || isResizingRight || isResizing) && (
            <Text
              x={(previewWidth || width) / 2}
              y={height / 2 - 6}
              text={`${Math.round(previewWidth || width)}px`}
              fontSize={12}
              fill="white"
              align="center"
              width={previewWidth || width}
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
  return (
    prevProps.track.id === nextProps.track.id &&
    prevProps.instanceId === nextProps.instanceId &&
    prevProps.x === nextProps.x &&
    prevProps.y === nextProps.y &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isPrimary === nextProps.isPrimary &&
    prevProps.isResizing === nextProps.isResizing &&
    prevProps.resizeDirection === nextProps.resizeDirection &&
    prevProps.previewWidth === nextProps.previewWidth &&
    prevProps.pixelsPerTick === nextProps.pixelsPerTick &&
    prevProps.bpm === nextProps.bpm &&
    prevProps.timeSignature[0] === nextProps.timeSignature[0] &&
    prevProps.timeSignature[1] === nextProps.timeSignature[1] &&
    prevProps.gridSnapEnabled === nextProps.gridSnapEnabled &&
    prevProps.snapSizeInPixels === nextProps.snapSizeInPixels &&
    prevProps.selectedCount === nextProps.selectedCount
  );
});