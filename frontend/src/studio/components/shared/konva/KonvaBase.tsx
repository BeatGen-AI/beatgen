import React, { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import Konva from 'konva';
import { Stage, Layer, Text } from 'react-konva';
import { Box } from '@mui/material';

/**
 * Viewport configuration for controlling visible area
 */
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Common props for all Konva-based components
 */
export interface KonvaBaseProps {
  /** Width of the canvas in pixels */
  width: number;
  
  /** Height of the canvas in pixels */
  height: number;
  
  /** Total content width (can be larger than canvas width for scrolling) */
  contentWidth: number;
  
  /** Total content height (can be larger than canvas height for scrolling) */
  contentHeight: number;
  
  /** Current zoom level (1.0 = 100%) */
  zoom?: number;
  
  /** Viewport configuration for scrolling */
  viewport?: Viewport;
  
  /** Callback when viewport changes (for syncing scroll position) */
  onViewportChange?: (viewport: Viewport) => void;
  
  /** Callback for mouse wheel events (for custom zoom/scroll handling) */
  onWheel?: (e: Konva.KonvaEventObject<WheelEvent>) => void;
  
  /** Whether to enable performance optimizations */
  enableOptimizations?: boolean;
  
  /** Children to render in the main layer */
  children: React.ReactNode;
  
  /** Additional layers to render (e.g., grid, overlays) */
  additionalLayers?: React.ReactNode;
  
  /** Background color */
  backgroundColor?: string;
  
  /** Whether to show debug info */
  debug?: boolean;
}

export interface KonvaBaseRef {
  /** Get the Konva stage instance */
  getStage: () => Konva.Stage | null;
  
  /** Get the main layer instance */
  getMainLayer: () => Konva.Layer | null;
  
  /** Convert screen coordinates to content coordinates */
  screenToContent: (point: { x: number; y: number }) => { x: number; y: number };
  
  /** Convert content coordinates to screen coordinates */
  contentToScreen: (point: { x: number; y: number }) => { x: number; y: number };
  
  /** Force a redraw of the canvas */
  redraw: () => void;
  
  /** Batch multiple updates together */
  batchDraw: () => void;
}

/**
 * Base component for all Konva-based canvas rendering.
 * Provides common functionality like viewport management, zoom, and coordinate conversion.
 */
export const KonvaBase = forwardRef<KonvaBaseRef, KonvaBaseProps>(({
  width,
  height,
  contentWidth,
  contentHeight,
  zoom = 1.0,
  viewport,
  onViewportChange,
  onWheel,
  enableOptimizations = true,
  children,
  additionalLayers,
  backgroundColor = '#1a1a1a',
  debug = false
}, ref) => {
  const stageRef = useRef<Konva.Stage>(null);
  const mainLayerRef = useRef<Konva.Layer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track if we're currently dragging for performance optimizations
  const [isDragging, setIsDragging] = useState(false);
  
  // Calculate effective viewport
  const effectiveViewport = viewport || {
    x: 0,
    y: 0,
    width: width,
    height: height
  };
  
  // Apply zoom to content positioning
  const stageX = -effectiveViewport.x * zoom;
  const stageY = -effectiveViewport.y * zoom;
  const stageScaleX = zoom;
  const stageScaleY = zoom;
  
  // Convert screen coordinates to content coordinates
  const screenToContent = useCallback((point: { x: number; y: number }) => {
    const stage = stageRef.current;
    if (!stage) return point;
    
    const stagePos = stage.position();
    const stageScale = stage.scale();
    
    return {
      x: (point.x - stagePos.x) / stageScale.x,
      y: (point.y - stagePos.y) / stageScale.y
    };
  }, []);
  
  // Convert content coordinates to screen coordinates
  const contentToScreen = useCallback((point: { x: number; y: number }) => {
    const stage = stageRef.current;
    if (!stage) return point;
    
    const stagePos = stage.position();
    const stageScale = stage.scale();
    
    return {
      x: point.x * stageScale.x + stagePos.x,
      y: point.y * stageScale.y + stagePos.y
    };
  }, []);
  
  // Force redraw
  const redraw = useCallback(() => {
    mainLayerRef.current?.draw();
  }, []);
  
  // Batch draw for performance
  const batchDraw = useCallback(() => {
    mainLayerRef.current?.batchDraw();
  }, []);
  
  // Handle wheel events for zooming/scrolling
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    
    if (onWheel) {
      onWheel(e);
    } else if (onViewportChange) {
      // Default scroll behavior - only horizontal
      const deltaX = e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX || e.evt.deltaY;
      
      const newViewport = {
        ...effectiveViewport,
        x: Math.max(0, Math.min(contentWidth - width / zoom, effectiveViewport.x + deltaX / zoom)),
        y: 0 // Always keep y at 0
      };
      
      onViewportChange(newViewport);
    }
  }, [onWheel, onViewportChange, effectiveViewport, contentWidth, contentHeight, width, height, zoom]);
  
  // Performance optimizations
  useEffect(() => {
    if (!enableOptimizations) return;
    
    const stage = stageRef.current;
    const layer = mainLayerRef.current;
    
    if (!stage || !layer) return;
    
    // Configure Konva for better performance
    Konva.pixelRatio = 1; // Disable high DPI scaling for performance
    
    // Enable hit detection caching
    stage.listening(true);
    
    // Optimize shape rendering
    if (isDragging) {
      // Disable anti-aliasing during drag for better performance
      layer.listening(false);
    } else {
      layer.listening(true);
    }
    
    // Use layer caching for complex scenes
    if (contentWidth * contentHeight > 1000000) { // Large scenes
      layer.cache();
    }
    
    return () => {
      layer.clearCache();
    };
  }, [enableOptimizations, isDragging, contentWidth, contentHeight]);
  
  // Viewport culling - only render visible items
  const isInViewport = useCallback((x: number, y: number, width: number, height: number) => {
    const viewX = effectiveViewport.x;
    const viewY = effectiveViewport.y;
    const viewWidth = effectiveViewport.width / zoom;
    const viewHeight = effectiveViewport.height / zoom;
    
    return !(
      x + width < viewX ||
      x > viewX + viewWidth ||
      y + height < viewY ||
      y > viewY + viewHeight
    );
  }, [effectiveViewport, zoom]);
  
  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
    getMainLayer: () => mainLayerRef.current,
    screenToContent,
    contentToScreen,
    redraw,
    batchDraw
  }), [screenToContent, contentToScreen, redraw, batchDraw]);
  
  // Handle drag events for performance tracking
  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);
  
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    // Force a high-quality redraw after drag
    redraw();
  }, [redraw]);
  
  return (
    <ViewportContext.Provider value={{ viewport: effectiveViewport, zoom, isInViewport }}>
      <Box
        ref={containerRef}
        sx={{
          width,
          height,
          backgroundColor,
          position: 'relative',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'default'
        }}
      >
        <Stage
          ref={stageRef}
          width={width}
          height={height}
          x={stageX}
          y={stageY}
          scaleX={stageScaleX}
          scaleY={stageScaleY}
          onWheel={handleWheel}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          draggable={false} // We'll handle dragging at the item level
        >
          {/* Additional layers (e.g., grid, rulers) */}
          {additionalLayers}
          
          {/* Main content layer */}
          <Layer ref={mainLayerRef}>
            {children}
          </Layer>
          
          {/* Debug overlay */}
          {debug && (
            <Layer>
              <DebugInfo
                viewport={effectiveViewport}
                zoom={zoom}
                contentSize={{ width: contentWidth, height: contentHeight }}
                canvasSize={{ width, height }}
                isDragging={isDragging}
              />
            </Layer>
          )}
        </Stage>
      </Box>
    </ViewportContext.Provider>
  );
});

KonvaBase.displayName = 'KonvaBase';

// Context for passing viewport info to children
interface ViewportContextValue {
  viewport: Viewport;
  zoom: number;
  isInViewport: (x: number, y: number, width: number, height: number) => boolean;
}

export const ViewportContext = React.createContext<ViewportContextValue>({
  viewport: { x: 0, y: 0, width: 0, height: 0 },
  zoom: 1,
  isInViewport: () => true
});

// Debug component
interface DebugInfoProps {
  viewport: Viewport;
  zoom: number;
  contentSize: { width: number; height: number };
  canvasSize: { width: number; height: number };
  isDragging: boolean;
}

const DebugInfo: React.FC<DebugInfoProps> = ({ viewport, zoom, contentSize, canvasSize, isDragging }) => {
  return (
    <>
      <Text
        x={10}
        y={10}
        text={`Viewport: ${Math.round(viewport.x)}, ${Math.round(viewport.y)}`}
        fontSize={12}
        fill="yellow"
      />
      <Text
        x={10}
        y={25}
        text={`Zoom: ${(zoom * 100).toFixed(0)}%`}
        fontSize={12}
        fill="yellow"
      />
      <Text
        x={10}
        y={40}
        text={`Content: ${contentSize.width}x${contentSize.height}`}
        fontSize={12}
        fill="yellow"
      />
      <Text
        x={10}
        y={55}
        text={`Canvas: ${canvasSize.width}x${canvasSize.height}`}
        fontSize={12}
        fill="yellow"
      />
      <Text
        x={10}
        y={70}
        text={`Dragging: ${isDragging ? 'Yes' : 'No'}`}
        fontSize={12}
        fill={isDragging ? 'red' : 'yellow'}
      />
    </>
  );
};

export default KonvaBase;