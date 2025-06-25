/**
 * Viewport Culling Implementation Example
 * This file demonstrates the specific implementation details for adding
 * viewport culling to the KonvaTimeline component.
 */

import { useMemo, useRef, useCallback } from 'react';
import { Viewport, KonvaItem } from '../../shared/konva';
import { GRID_CONSTANTS } from '../../../constants/gridConstants';
import { MUSIC_CONSTANTS } from '../../../constants/musicConstants';

// ============================================
// 1. VIEWPORT CULLING UTILITIES
// ============================================

/**
 * Calculate which items are visible in the current viewport
 * @param items - All timeline items
 * @param viewport - Current viewport dimensions and position
 * @param pixelsPerTick - Conversion factor for time to pixels
 * @param buffer - Extra pixels to render outside viewport (default 100)
 */
export const getVisibleItems = (
  items: KonvaItem[], 
  viewport: Viewport, 
  pixelsPerTick: number,
  buffer: number = 100
): KonvaItem[] => {
  return items.filter(item => {
    // Convert logical coordinates to pixel coordinates
    const itemX = item.x * pixelsPerTick;
    const itemWidth = item.width * pixelsPerTick;
    const itemEndX = itemX + itemWidth;
    
    // Check horizontal visibility with buffer
    const isHorizontallyVisible = 
      itemEndX >= (viewport.x - buffer) && 
      itemX <= (viewport.x + viewport.width + buffer);
    
    // Check vertical visibility with buffer
    const isVerticallyVisible = 
      item.y + item.height >= (viewport.y - buffer) && 
      item.y <= (viewport.y + viewport.height + buffer);
    
    return isHorizontallyVisible && isVerticallyVisible;
  });
};

/**
 * Calculate visible time range in ticks
 */
export const calculateVisibleTimeRange = (
  viewport: Viewport, 
  pixelsPerTick: number,
  buffer: number = 100
) => {
  const startTicks = Math.floor((viewport.x - buffer) / pixelsPerTick);
  const endTicks = Math.ceil((viewport.x + viewport.width + buffer) / pixelsPerTick);
  
  return { 
    startTicks: Math.max(0, startTicks), 
    endTicks 
  };
};

/**
 * Calculate visible track range by index
 */
export const calculateVisibleTrackRange = (
  viewport: Viewport,
  trackHeight: number,
  buffer: number = 50
) => {
  const startTrack = Math.floor((viewport.y - buffer) / trackHeight);
  const endTrack = Math.ceil((viewport.y + viewport.height + buffer) / trackHeight);
  
  return { 
    startTrack: Math.max(0, startTrack), 
    endTrack 
  };
};

/**
 * Calculate visible measure range
 */
export const calculateVisibleMeasures = (
  viewport: Viewport,
  pixelsPerMeasure: number,
  buffer: number = 2 // Buffer in measures
) => {
  const startMeasure = Math.floor(viewport.x / pixelsPerMeasure) - buffer;
  const endMeasure = Math.ceil((viewport.x + viewport.width) / pixelsPerMeasure) + buffer;
  
  return { 
    startMeasure: Math.max(0, startMeasure), 
    endMeasure 
  };
};

// ============================================
// 2. OPTIMIZED GRID RENDERING COMPONENT
// ============================================

interface OptimizedGridProps {
  viewport: Viewport;
  measureCount: number;
  pixelsPerMeasure: number;
  timeSignature: [number, number];
  totalHeight: number;
}

export const OptimizedGrid: React.FC<OptimizedGridProps> = ({
  viewport,
  measureCount,
  pixelsPerMeasure,
  timeSignature,
  totalHeight
}) => {
  const [beatsPerMeasure] = timeSignature;
  
  // Calculate visible measures with buffer
  const { startMeasure, endMeasure } = useMemo(() => 
    calculateVisibleMeasures(viewport, pixelsPerMeasure),
    [viewport, pixelsPerMeasure]
  );
  
  // Clamp to valid range
  const visibleStartMeasure = Math.max(0, startMeasure);
  const visibleEndMeasure = Math.min(measureCount, endMeasure);
  
  return (
    <>
      {/* Only render visible measure lines */}
      {Array.from({ 
        length: visibleEndMeasure - visibleStartMeasure 
      }).map((_, idx) => {
        const measureIndex = visibleStartMeasure + idx;
        const x = measureIndex * pixelsPerMeasure;
        
        return (
          <React.Fragment key={`grid-${measureIndex}`}>
            {/* Measure line */}
            <Rect
              x={x}
              y={0}
              width={1}
              height={totalHeight}
              fill="rgba(128, 128, 128, 0.8)"
            />
            
            {/* Beat lines - only if visible */}
            {measureIndex < measureCount && beatsPerMeasure > 1 && 
              Array.from({ length: beatsPerMeasure - 1 }).map((_, j) => {
                const beatX = x + ((j + 1) * pixelsPerMeasure / beatsPerMeasure);
                return (
                  <Rect
                    key={`beat-${measureIndex}-${j}`}
                    x={beatX}
                    y={0}
                    width={1}
                    height={totalHeight}
                    fill="rgba(128, 128, 128, 0.5)"
                  />
                );
              })
            }
          </React.Fragment>
        );
      })}
    </>
  );
};

// ============================================
// 3. SCROLL HANDLER WITH RAF
// ============================================

export const useOptimizedScroll = (
  containerRef: React.RefObject<HTMLDivElement>,
  onViewportChange: (viewport: Viewport) => void
) => {
  const scrollRAF = useRef<number>();
  
  const handleScroll = useCallback(() => {
    // Cancel any pending RAF
    if (scrollRAF.current) {
      cancelAnimationFrame(scrollRAF.current);
    }
    
    // Schedule update on next frame
    scrollRAF.current = requestAnimationFrame(() => {
      const target = containerRef.current;
      if (!target) return;
      
      onViewportChange({
        x: target.scrollLeft,
        y: target.scrollTop,
        width: target.clientWidth,
        height: target.clientHeight
      });
    });
  }, [containerRef, onViewportChange]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollRAF.current) {
        cancelAnimationFrame(scrollRAF.current);
      }
    };
  }, []);
  
  return handleScroll;
};

// ============================================
// 4. PERFORMANCE MONITOR HOOK
// ============================================

export const usePerformanceMonitor = (enabled: boolean = false) => {
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const fps = useRef(0);
  
  useEffect(() => {
    if (!enabled) return;
    
    let rafId: number;
    
    const measureFPS = () => {
      frameCount.current++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime.current >= 1000) {
        fps.current = frameCount.current;
        console.log(`Timeline FPS: ${frameCount.current}`);
        frameCount.current = 0;
        lastTime.current = currentTime;
      }
      
      rafId = requestAnimationFrame(measureFPS);
    };
    
    rafId = requestAnimationFrame(measureFPS);
    
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [enabled]);
  
  return fps.current;
};

// ============================================
// 5. EXAMPLE INTEGRATION IN KONVATIMELINE
// ============================================

/**
 * Example of how to integrate viewport culling in KonvaTimeline
 * 
 * In KonvaTimeline.tsx, replace the track rendering section (lines 818-942) with:
 */

/*
// Calculate visible items
const visibleKonvaItems = useMemo(() => 
  getVisibleItems(konvaItems, viewport, pixelsPerTick),
  [konvaItems, viewport, pixelsPerTick]
);

// Render only visible tracks
{visibleKonvaItems.map((item) => {
  // ... existing KonvaTrack rendering logic
  return (
    <KonvaTrack
      key={item.id}
      // ... existing props
      isVisible={true} // Add visibility flag
    />
  );
})}

// Replace grid rendering with OptimizedGrid component
<OptimizedGrid
  viewport={viewport}
  measureCount={measureCount}
  pixelsPerMeasure={GRID_CONSTANTS.measureWidth * internalZoom}
  timeSignature={timeSignature}
  totalHeight={totalTimelineHeight}
/>
*/

// ============================================
// 6. TRACK RENDERER OPTIMIZATION
// ============================================

/**
 * Example optimization for MidiTrackRenderer
 * Add viewport awareness to avoid rendering invisible notes
 */
export const useVisibleNotes = (
  notes: Note[],
  viewport: Viewport,
  pixelsPerTick: number,
  contentOffset: number
) => {
  return useMemo(() => {
    const { startTicks, endTicks } = calculateVisibleTimeRange(viewport, pixelsPerTick);
    
    return notes.filter(note => {
      // Check if note is in visible time range
      const noteStart = note.column;
      const noteEnd = note.column + note.length;
      
      return noteEnd >= startTicks && noteStart <= endTicks;
    });
  }, [notes, viewport, pixelsPerTick]);
};

// ============================================
// 7. DEBUGGING UTILITIES
// ============================================

/**
 * Debug component to visualize viewport culling
 */
export const ViewportDebugOverlay: React.FC<{
  viewport: Viewport;
  visibleItems: number;
  totalItems: number;
}> = ({ viewport, visibleItems, totalItems }) => {
  if (process.env.NODE_ENV !== 'development') return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 10,
      right: 10,
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '4px',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 9999
    }}>
      <div>Viewport: {viewport.x.toFixed(0)}x{viewport.y.toFixed(0)}</div>
      <div>Size: {viewport.width.toFixed(0)}x{viewport.height.toFixed(0)}</div>
      <div>Visible: {visibleItems}/{totalItems} items</div>
      <div>Culled: {((1 - visibleItems/totalItems) * 100).toFixed(1)}%</div>
    </div>
  );
};