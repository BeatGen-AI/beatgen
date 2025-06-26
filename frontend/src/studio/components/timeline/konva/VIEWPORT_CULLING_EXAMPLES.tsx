/**
 * Viewport Culling Implementation Examples
 * Ready-to-use code snippets for implementing virtual scrolling in the timeline
 */

import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import { Rect, Line, Group } from 'react-konva';
import { Viewport, KonvaItem } from '../../shared/konva';
import { GRID_CONSTANTS } from '../../../constants/gridConstants';

// ============================================
// 1. VIEWPORT CALCULATION UTILITIES
// ============================================

interface VisibleRange {
  startTicks: number;
  endTicks: number;
  startTrack: number;
  endTrack: number;
  startMeasure: number;
  endMeasure: number;
}

interface ViewportBuffer {
  x: number; // Horizontal buffer in pixels
  y: number; // Vertical buffer in pixels
}

/**
 * Calculate what's visible in the current viewport with configurable buffer
 */
export const calculateVisibleRange = (
  viewport: Viewport,
  pixelsPerTick: number,
  trackHeight: number,
  pixelsPerMeasure: number,
  buffer: ViewportBuffer = { x: 200, y: 100 }
): VisibleRange => {
  // Time range (X-axis) - convert pixels to ticks
  const startTicks = Math.max(0, (viewport.x - buffer.x) / pixelsPerTick);
  const endTicks = (viewport.x + viewport.width + buffer.x) / pixelsPerTick;
  
  // Track range (Y-axis) - calculate visible track indices
  const startTrack = Math.max(0, Math.floor((viewport.y - buffer.y) / trackHeight));
  const endTrack = Math.ceil((viewport.y + viewport.height + buffer.y) / trackHeight);
  
  // Measure range for grid lines
  const startMeasure = Math.max(0, Math.floor((viewport.x - buffer.x) / pixelsPerMeasure));
  const endMeasure = Math.ceil((viewport.x + viewport.width + buffer.x) / pixelsPerMeasure);
  
  return { startTicks, endTicks, startTrack, endTrack, startMeasure, endMeasure };
};

// ============================================
// 2. OPTIMIZED GRID COMPONENT
// ============================================

interface OptimizedGridProps {
  viewport: Viewport;
  measureCount: number;
  pixelsPerMeasure: number;
  timeSignature: [number, number];
  totalHeight: number;
  studioMode: 'light' | 'dark';
}

export const OptimizedGrid = React.memo<OptimizedGridProps>(({
  viewport,
  measureCount,
  pixelsPerMeasure,
  timeSignature,
  totalHeight,
  studioMode
}) => {
  const [beatsPerMeasure, subdivisionsPerBeat] = timeSignature;
  
  // Calculate visible measures with buffer
  const visibleRange = useMemo(() => {
    const buffer = 2; // measures
    const startMeasure = Math.max(0, Math.floor(viewport.x / pixelsPerMeasure) - buffer);
    const endMeasure = Math.min(
      measureCount,
      Math.ceil((viewport.x + viewport.width) / pixelsPerMeasure) + buffer
    );
    return { startMeasure, endMeasure };
  }, [viewport.x, viewport.width, pixelsPerMeasure, measureCount]);
  
  // Memoize grid lines to avoid recalculation
  const gridLines = useMemo(() => {
    const lines = [];
    
    for (let i = visibleRange.startMeasure; i <= visibleRange.endMeasure; i++) {
      if (i >= measureCount) break;
      
      const x = i * pixelsPerMeasure;
      
      // Measure line
      lines.push(
        <Rect
          key={`measure-${i}`}
          x={x}
          y={0}
          width={1}
          height={totalHeight}
          fill="rgba(128, 128, 128, 0.8)"
        />
      );
      
      // Beat lines
      if (i < measureCount && beatsPerMeasure > 1) {
        for (let j = 1; j < beatsPerMeasure; j++) {
          const beatX = x + (j * pixelsPerMeasure / beatsPerMeasure);
          lines.push(
            <Rect
              key={`beat-${i}-${j}`}
              x={beatX}
              y={0}
              width={1}
              height={totalHeight}
              fill="rgba(128, 128, 128, 0.5)"
            />
          );
        }
      }
      
      // Subdivision lines (only render if zoomed in enough)
      if (pixelsPerMeasure > 200) { // Only show subdivisions when zoomed in
        for (let b = 0; b < beatsPerMeasure; b++) {
          for (let s = 1; s < subdivisionsPerBeat; s++) {
            const subdivX = x + (b * pixelsPerMeasure / beatsPerMeasure) + 
                          (s * pixelsPerMeasure / (beatsPerMeasure * subdivisionsPerBeat));
            lines.push(
              <Rect
                key={`subdiv-${i}-${b}-${s}`}
                x={subdivX}
                y={0}
                width={1}
                height={totalHeight}
                fill="rgba(128, 128, 128, 0.25)"
              />
            );
          }
        }
      }
    }
    
    return lines;
  }, [visibleRange, measureCount, pixelsPerMeasure, beatsPerMeasure, subdivisionsPerBeat, totalHeight]);
  
  return <>{gridLines}</>;
}, (prev, next) => {
  // Custom comparison - only re-render if visible range changes
  const prevStart = Math.floor(prev.viewport.x / prev.pixelsPerMeasure);
  const prevEnd = Math.ceil((prev.viewport.x + prev.viewport.width) / prev.pixelsPerMeasure);
  const nextStart = Math.floor(next.viewport.x / next.pixelsPerMeasure);
  const nextEnd = Math.ceil((next.viewport.x + next.viewport.width) / next.pixelsPerMeasure);
  
  return (
    prevStart === nextStart &&
    prevEnd === nextEnd &&
    prev.totalHeight === next.totalHeight &&
    prev.measureCount === next.measureCount &&
    prev.pixelsPerMeasure === next.pixelsPerMeasure
  );
});

// ============================================
// 3. VIEWPORT-AWARE TRACK FILTERING
// ============================================

/**
 * Filter track instances to only those visible in viewport
 */
export const useVisibleTracks = (
  konvaItems: KonvaItem[],
  viewport: Viewport,
  pixelsPerTick: number,
  trackHeight: number,
  buffer: ViewportBuffer = { x: 200, y: 100 }
): KonvaItem[] => {
  return useMemo(() => {
    const range = calculateVisibleRange(viewport, pixelsPerTick, trackHeight, 0, buffer);
    
    return konvaItems.filter(item => {
      // Check time bounds (X-axis)
      const itemStartX = item.x * pixelsPerTick;
      const itemEndX = (item.x + item.width) * pixelsPerTick;
      const isTimeVisible = itemEndX >= (viewport.x - buffer.x) && 
                           itemStartX <= (viewport.x + viewport.width + buffer.x);
      
      // Check track bounds (Y-axis)
      const itemEndY = item.y + item.height;
      const isTrackVisible = itemEndY >= (viewport.y - buffer.y) && 
                            item.y <= (viewport.y + viewport.height + buffer.y);
      
      return isTimeVisible && isTrackVisible;
    });
  }, [konvaItems, viewport, pixelsPerTick, trackHeight, buffer]);
};

// ============================================
// 4. RAF-THROTTLED SCROLL HANDLER
// ============================================

export const useRAFScroll = (
  onViewportChange: (viewport: Viewport) => void,
  deps: React.DependencyList = []
) => {
  const rafRef = useRef<number>();
  const lastViewportRef = useRef<Viewport>();
  
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    // Cancel any pending RAF
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    rafRef.current = requestAnimationFrame(() => {
      const target = e.currentTarget;
      const newViewport: Viewport = {
        x: target.scrollLeft,
        y: target.scrollTop,
        width: target.clientWidth,
        height: target.clientHeight
      };
      
      // Only update if viewport actually changed significantly
      if (!lastViewportRef.current || 
          Math.abs(newViewport.x - lastViewportRef.current.x) > 1 ||
          Math.abs(newViewport.y - lastViewportRef.current.y) > 1 ||
          newViewport.width !== lastViewportRef.current.width ||
          newViewport.height !== lastViewportRef.current.height) {
        lastViewportRef.current = newViewport;
        onViewportChange(newViewport);
      }
    });
  }, [...deps, onViewportChange]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);
  
  return handleScroll;
};

// ============================================
// 5. OPTIMIZED MIDI NOTE RENDERING
// ============================================

interface VisibleNote {
  id: string | number;
  row: number;
  column: number;
  length: number;
  velocity: number;
}

/**
 * Filter MIDI notes to only those visible in the track's viewport
 */
export const useVisibleNotes = (
  notes: VisibleNote[],
  width: number,
  contentOffset: number,
  pixelsPerTick: number,
  buffer: number = 100 // Buffer in pixels
): VisibleNote[] => {
  return useMemo(() => {
    // Calculate visible time range in ticks
    const viewStartTicks = Math.max(0, (-contentOffset - buffer) / pixelsPerTick);
    const viewEndTicks = viewStartTicks + ((width + buffer * 2) / pixelsPerTick);
    
    // Filter notes that are at least partially visible
    return notes.filter(note => {
      const noteEnd = note.column + note.length;
      return noteEnd >= viewStartTicks && note.column <= viewEndTicks;
    });
  }, [notes, width, contentOffset, pixelsPerTick, buffer]);
};

// ============================================
// 6. PERFORMANCE MONITORING COMPONENT
// ============================================

interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  visibleItems: number;
  totalItems: number;
  culledPercentage: number;
}

export const usePerformanceMonitor = (
  visibleItems: number,
  totalItems: number,
  enabled: boolean = false
): PerformanceMetrics => {
  const [metrics, setMetrics] = React.useState<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
    visibleItems: 0,
    totalItems: 0,
    culledPercentage: 0
  });
  
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  
  useEffect(() => {
    if (!enabled) return;
    
    let rafId: number;
    
    const measure = () => {
      frameCountRef.current++;
      const now = performance.now();
      
      if (now - lastTimeRef.current >= 1000) {
        const frameTime = (now - lastTimeRef.current) / frameCountRef.current;
        
        setMetrics({
          fps: frameCountRef.current,
          frameTime,
          visibleItems,
          totalItems,
          culledPercentage: totalItems > 0 
            ? ((totalItems - visibleItems) / totalItems) * 100 
            : 0
        });
        
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }
      
      rafId = requestAnimationFrame(measure);
    };
    
    rafId = requestAnimationFrame(measure);
    
    return () => cancelAnimationFrame(rafId);
  }, [enabled, visibleItems, totalItems]);
  
  return metrics;
};

// ============================================
// 7. EXAMPLE INTEGRATION
// ============================================

/**
 * Example of how to integrate these optimizations in KonvaTimeline
 */
export const ExampleIntegration = () => {
  // In KonvaTimeline.tsx, replace the track rendering section with:
  
  /*
  // 1. Use viewport-aware track filtering
  const visibleKonvaItems = useVisibleTracks(
    konvaItems,
    viewport,
    pixelsPerTick,
    GRID_CONSTANTS.trackHeight
  );
  
  // 2. Use RAF-throttled scroll handler
  const handleScroll = useRAFScroll((newViewport) => {
    setViewport(newViewport);
  });
  
  // 3. Replace grid with optimized version
  <OptimizedGrid
    viewport={viewport}
    measureCount={measureCount}
    pixelsPerMeasure={GRID_CONSTANTS.measureWidth * internalZoom}
    timeSignature={timeSignature}
    totalHeight={totalTimelineHeight}
    studioMode={studioMode}
  />
  
  // 4. Render only visible tracks
  {visibleKonvaItems.map((item) => (
    <KonvaTrack
      key={item.id}
      // ... existing props
    />
  ))}
  
  // 5. Add performance monitoring in development
  {process.env.NODE_ENV === 'development' && (
    <PerformanceOverlay
      metrics={usePerformanceMonitor(
        visibleKonvaItems.length,
        konvaItems.length,
        true
      )}
    />
  )}
  */
  
  return null;
};

// ============================================
// 8. PERFORMANCE OVERLAY COMPONENT
// ============================================

const PerformanceOverlay: React.FC<{ metrics: PerformanceMetrics }> = ({ metrics }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 10,
      right: 10,
      background: 'rgba(0, 0, 0, 0.8)',
      color: '#00ff00',
      padding: '10px',
      borderRadius: '4px',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 9999,
      minWidth: '200px'
    }}>
      <div>FPS: {metrics.fps}</div>
      <div>Frame Time: {metrics.frameTime.toFixed(2)}ms</div>
      <div>Visible: {metrics.visibleItems}/{metrics.totalItems}</div>
      <div>Culled: {metrics.culledPercentage.toFixed(1)}%</div>
    </div>
  );
};