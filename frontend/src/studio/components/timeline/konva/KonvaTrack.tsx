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
    console.error('KonvaTrack received invalid props:', { 
      x, 
      y, 
      width, 
      height, 
      trackId: track?.id, 
      instanceId,
      previewWidth: propPreviewWidth,
      pixelsPerTick
    });
    return null;
  }
  const groupRef = useRef<any>(null);
  const backgroundRef = useRef<any>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  
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
    
    // Otherwise fall back to type-based colors
    switch (track.track_type) {
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
  }, [track.track_type, data?.color]);
  
  // Calculate content offset for trimmed tracks
  const contentOffset = useMemo(() => {
    if (!track.instance_metadata || !track.duration_ticks || track.duration_ticks === 0) return 0;
    if (isNaN(pixelsPerTick) || pixelsPerTick <= 0) return 0;
    const trimRatio = track.instance_metadata[0].trim_start_ticks / track.duration_ticks;
    const fullWidth = track.duration_ticks * pixelsPerTick;
    const result = -(trimRatio * fullWidth);
    return isNaN(result) ? 0 : result;
  }, [track.instance_metadata, track.duration_ticks, pixelsPerTick]);
  
  
  // Render track content based on type
  const renderTrackContent = () => {
    const contentProps = {
      track,
      width: displayWidth,
      height,
      pixelsPerTick,
      contentOffset,
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
        {renderTrackContent()}
      </Group>
      
      {/* Track type badge */}
      <Group x={displayWidth - 10} y={5}>
        <Rect
          x={-50}
          y={0}
          width={40}
          height={16}
          fill={
            track.track_type === 'AUDIO' ? '#4caf50' : 
            track.track_type === 'MIDI' ? '#2196f3' : 
            track.track_type === 'SAMPLER' ? '#2196f3' :
            track.track_type === 'DRUM' ? '#ff9800' : '#9c27b0'
          }
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
                  // Use instance ID directly - it's already the full ID
                  const idToUse = instanceId || track.id;
                  console.log('🔧 KonvaTrack - LEFT resize calling onResizeStart', {
                    instanceId,
                    trackId: track.id,
                    idToUse,
                    direction: 'left',
                    pos
                  });
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
                  // Use instance ID directly - it's already the full ID
                  const idToUse = instanceId || track.id;
                  console.log('🔧 KonvaTrack - RIGHT resize calling onResizeStart', {
                    instanceId,
                    trackId: track.id,
                    idToUse,
                    direction: 'right',
                    pos
                  });
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