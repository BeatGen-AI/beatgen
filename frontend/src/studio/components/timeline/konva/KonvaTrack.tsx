import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Group, Rect, Text, Label, Tag } from 'react-konva';
import { CombinedTrack } from 'src/platform/types/project';
import { AudioTrackRenderer } from './tracks/AudioTrackRenderer';
import { MidiTrackRenderer } from './tracks/MidiTrackRenderer';
import { DrumTrackRenderer } from './tracks/DrumTrackRenderer';
import { GRID_CONSTANTS } from '../../../constants/gridConstants';
import { getInstanceById } from '@/studio/utils/instanceHelpers';
import { useTheme } from '@mui/material/styles';

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
  contentTransform?: number; // Content transform passed from parent
  pixelsPerTick: number;
  bpm: number;
  timeSignature: [number, number];
  onClick?: (id: string, e: any) => void;
  onMouseDown?: (id: string, e: any) => void;
  onResizeStart?: (id: string, direction: 'left' | 'right', mousePos: { x: number; y: number }) => void;
  selectedCount?: number;
  gridSnapEnabled?: boolean;
  snapSizeInPixels?: number;
  trackColor?: string; // Track color prop
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
  contentTransform: propContentTransform = 0,
  pixelsPerTick,
  bpm,
  timeSignature,
  onClick,
  onMouseDown,
  onResizeStart,
  selectedCount = 1,
  gridSnapEnabled = true,
  snapSizeInPixels = 12.5,
  trackColor,
  data
}) => {
  // Return null if track has a drum_track_id
  if (track.track_type === 'SAMPLER' && 
      track.track && 
      'drum_track_id' in track.track && 
      track.track.drum_track_id != null) {
    return null;
  }

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
  const theme = useTheme();
  
  // Removed cursor reset - now handled by cursor manager in interaction system
  
  // Use prop preview width if provided (during resize), otherwise use internal state
  const previewWidth = propPreviewWidth || null;
  
  // Ensure we have valid width values
  const displayWidth = Math.max(1, previewWidth || width || 1);
  const isValidWidth = !isNaN(displayWidth) && displayWidth > 0;
  
  // Use trackColor prop or fall back to data.color
  const finalTrackColor = trackColor || data?.color || '#9c27b0';
  
  // Calculate the base content offset from trim values
  const calculateBaseContentOffset = () => {
    // Get the specific instance data from props
    const instance = getInstanceById(track, instanceId);
    if (!instance) {
      console.error('KonvaTrack: No instance data found!', {
        trackId: track?.id,
        instanceId,
        track
      });
      return 0;
    }
    
    if (!track.duration_ticks || !instance.trim_start_ticks) return 0;
    
    // Calculate what percentage of the original content is trimmed from start
    const trimRatio = instance.trim_start_ticks / track.duration_ticks;
    
    // Apply that ratio to the full content width to get the offset
    // We need to calculate the full content width (untrimmed)
    const fullContentWidth = track.duration_ticks * pixelsPerTick;
    return -(trimRatio * fullContentWidth);
  };
  
  // Combine base offset with any additional transform from resize
  const contentOffset = calculateBaseContentOffset() + propContentTransform;
  
  
  // Render track content based on type
  const renderTrackContent = () => {
    const contentProps = {
      track,
      width: displayWidth,
      height,
      pixelsPerTick,
      contentOffset,
      color: finalTrackColor
    };
    
    
    switch (track.track_type) {
      case 'AUDIO':
        return <AudioTrackRenderer {...contentProps} bpm={bpm} />;
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
        console.log('🎯 KonvaTrack onClick', {
          instanceId,
          trackId: track.id,
          isResizingLeft,
          isResizingRight,
          isResizing,
          isDragging,
          cancelBubble: e.cancelBubble,
          propagationStopped: e.evt.cancelBubble
        });
        
        e.cancelBubble = true; // Prevent stage from deselecting
        if (onClick) {
          // Use instance ID directly
          const idToUse = instanceId || track.id;
          onClick(idToUse, e);
        }
      }}
      onMouseDown={(e) => {
        console.log('🎯 KonvaTrack onMouseDown START', {
          instanceId,
          trackId: track.id,
          isResizingLeft,
          isResizingRight,
          willReturn: isResizingLeft || isResizingRight,
          cancelBubble: e.cancelBubble,
          propagationStopped: e.evt.cancelBubble
        });
        
        // Reset resize handle states when starting drag
        // This prevents stuck hover states from blocking drag
        setIsResizingLeft(false);
        setIsResizingRight(false);
        
        e.cancelBubble = true;
        console.log('🎯 KonvaTrack onMouseDown PROCEEDING', {
          instanceId,
          cancelBubbleAfter: e.cancelBubble
        });
        
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
        cornerRadius={6}
        opacity={track.mute ? 0.4 : 0.85}
        shadowEnabled={isHovered && !track.mute}
        shadowColor={finalTrackColor}
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
          0, `${finalTrackColor}80`,
          1, finalTrackColor
        ]}
        cornerRadius={6}
        opacity={track.mute ? 0.4 : 0.85}
        listening={false}
      />
      
      {/* Selection border - inset */}
      {isSelected && (
        <Rect
          x={1.5}
          y={1.5}
          width={displayWidth - 2}
          height={height - 2}
          stroke={theme.palette.mode === 'dark' ? 'white' : '#222222'}
          strokeWidth={2}
          fill="transparent"
          cornerRadius={4}
          listening={false}
        />
      )}
      
      
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
          width={track.track_type.length * 8 + 2}
          height={16}
          fill={finalTrackColor}
          cornerRadius={3}
          opacity={0.7}
          listening={false}
        />
        <Text
          x={-50}
          y={3}
          width={track.track_type.length * 8 + 2}
          text={track.track_type}
          fontSize={10}
          fontFamily="Sen"
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
        fontFamily="Sen"
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
            fontFamily="Sen"
            fontStyle="bold"
            fill="white"
            align="center"
            offsetX={20}
            listening={false}
          />
        </>
      )}
      
      
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
              setIsResizingLeft(true);
              // Set cursor directly for resize handle
              const stage = e.target.getStage();
              if (stage) {
                stage.container().style.cursor = 'ew-resize';
              }
            }}
            onMouseLeave={(e) => {
              setIsResizingLeft(false);
              // Reset cursor
              const stage = e.target.getStage();
              if (stage) {
                stage.container().style.cursor = 'default';
              }
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
              setIsResizingRight(true);
              // Set cursor directly for resize handle
              const stage = e.target.getStage();
              if (stage) {
                stage.container().style.cursor = 'ew-resize';
              }
            }}
            onMouseLeave={(e) => {
              setIsResizingRight(false);
              // Reset cursor
              const stage = e.target.getStage();
              if (stage) {
                stage.container().style.cursor = 'default';
              }
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