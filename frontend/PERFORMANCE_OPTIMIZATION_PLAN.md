# Performance Optimization Plan: Virtual Scrolling & Viewport Culling

## Current Architecture Analysis

### Components That Need Viewport Culling
1. **KonvaTimeline.tsx**
   - Track instances rendering (lines 818-942)
   - Grid lines rendering (lines 768-815)
   - No current viewport-based filtering

2. **TimeRuler.tsx**
   - Renders all measures, beats, and subdivisions (lines 73-149)
   - No viewport culling implemented

3. **Track Renderers**
   - AudioTrackRenderer.tsx
   - MidiTrackRenderer.tsx
   - DrumTrackRenderer.tsx
   - Each renders full content regardless of viewport

## Implementation Plan

### 1. Viewport-Based Culling for Track Instances

```typescript
// Add to KonvaTimeline.tsx
const getVisibleItems = (items: KonvaItem[], viewport: Viewport, pixelsPerTick: number) => {
  const buffer = 100; // Buffer in pixels to render items slightly outside viewport
  
  return items.filter(item => {
    const itemX = item.x * pixelsPerTick;
    const itemWidth = item.width * pixelsPerTick;
    const itemEndX = itemX + itemWidth;
    
    // Check horizontal visibility
    const isHorizontallyVisible = 
      itemEndX >= (viewport.x - buffer) && 
      itemX <= (viewport.x + viewport.width + buffer);
    
    // Check vertical visibility
    const isVerticallyVisible = 
      item.y + item.height >= (viewport.y - buffer) && 
      item.y <= (viewport.y + viewport.height + buffer);
    
    return isHorizontallyVisible && isVerticallyVisible;
  });
};

// Update the render logic (around line 818)
const visibleItems = useMemo(() => 
  getVisibleItems(konvaItems, viewport, pixelsPerTick),
  [konvaItems, viewport, pixelsPerTick]
);
```

### 2. Efficient Visible Range Calculation

```typescript
// Utility functions for calculating visible ranges
export const calculateVisibleTimeRange = (
  viewport: Viewport, 
  pixelsPerTick: number,
  bpm: number,
  timeSignature: [number, number]
) => {
  const ticksPerBeat = MUSIC_CONSTANTS.pulsesPerQuarterNote;
  const startTicks = Math.floor(viewport.x / pixelsPerTick);
  const endTicks = Math.ceil((viewport.x + viewport.width) / pixelsPerTick);
  
  return { startTicks, endTicks };
};

export const calculateVisibleTrackRange = (
  viewport: Viewport,
  trackHeight: number
) => {
  const startTrack = Math.floor(viewport.y / trackHeight);
  const endTrack = Math.ceil((viewport.y + viewport.height) / trackHeight);
  
  return { startTrack, endTrack };
};
```

### 3. Grid Line Optimization

```typescript
// Optimized grid rendering with viewport culling
const renderVisibleGridLines = () => {
  const { startMeasure, endMeasure } = calculateVisibleMeasures(viewport, pixelsPerMeasure);
  const buffer = 2; // Render 2 extra measures on each side
  
  const visibleStartMeasure = Math.max(0, startMeasure - buffer);
  const visibleEndMeasure = Math.min(measureCount, endMeasure + buffer);
  
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
              height={totalTimelineHeight}
              fill="rgba(128, 128, 128, 0.8)"
            />
            {/* Beat and subdivision lines... */}
          </React.Fragment>
        );
      })}
    </>
  );
};
```

### 4. React.memo Optimization Strategy

```typescript
// Enhanced memo comparison for KonvaTrack
export default React.memo(KonvaTrack, (prevProps, nextProps) => {
  // Early return for visibility changes
  if (prevProps.isVisible !== nextProps.isVisible) {
    return !nextProps.isVisible; // Skip render if not visible
  }
  
  // Existing comparison logic...
  return (
    prevProps.track.id === nextProps.track.id &&
    prevProps.instanceId === nextProps.instanceId &&
    // ... other comparisons
  );
});

// Memo wrapper for track renderers
const MemoizedAudioTrackRenderer = React.memo(AudioTrackRenderer, (prev, next) => {
  return (
    prev.track.id === next.track.id &&
    prev.width === next.width &&
    prev.contentOffset === next.contentOffset &&
    prev.pixelsPerTick === next.pixelsPerTick
  );
});
```

### 5. RequestAnimationFrame Integration

```typescript
// Scroll handler with RAF optimization
const handleScroll = useCallback(() => {
  if (scrollRAF.current) {
    cancelAnimationFrame(scrollRAF.current);
  }
  
  scrollRAF.current = requestAnimationFrame(() => {
    const target = containerRef.current;
    if (!target) return;
    
    setViewport(prev => ({
      ...prev,
      x: target.scrollLeft,
      y: target.scrollTop
    }));
  });
}, []);

// Cleanup
useEffect(() => {
  return () => {
    if (scrollRAF.current) {
      cancelAnimationFrame(scrollRAF.current);
    }
  };
}, []);
```

### 6. Lazy Loading Strategy

```typescript
// Progressive loading for track content
interface LazyLoadConfig {
  initialLoadRange: number; // Ticks to load initially
  loadAheadRange: number;   // Ticks to load ahead of viewport
  unloadBehindRange: number; // Ticks to keep behind viewport
}

const useProgressiveLoading = (
  track: CombinedTrack,
  viewport: Viewport,
  config: LazyLoadConfig
) => {
  const [loadedRange, setLoadedRange] = useState({
    start: 0,
    end: config.initialLoadRange
  });
  
  useEffect(() => {
    const visibleRange = calculateVisibleTimeRange(viewport, pixelsPerTick, bpm, timeSignature);
    
    // Expand loaded range if needed
    if (visibleRange.endTicks + config.loadAheadRange > loadedRange.end) {
      setLoadedRange(prev => ({
        ...prev,
        end: visibleRange.endTicks + config.loadAheadRange
      }));
    }
  }, [viewport]);
  
  return loadedRange;
};
```

### 7. TimeRuler Optimization

```typescript
// TimeRuler.tsx optimization
const TimeRulerOptimized: React.FC<TimeRulerProps> = ({ ... }) => {
  // Calculate visible measure range
  const visibleMeasures = useMemo(() => {
    const startMeasure = Math.floor(viewport.x / pixelsPerMeasure);
    const endMeasure = Math.ceil((viewport.x + viewport.width) / pixelsPerMeasure);
    
    return {
      start: Math.max(0, startMeasure - 1),
      end: Math.min(measureCount, endMeasure + 1)
    };
  }, [viewport, pixelsPerMeasure, measureCount]);
  
  // Only render visible measures
  return (
    <Layer>
      {/* Render only visible subdivisions */}
      {Array.from({ 
        length: visibleMeasures.end - visibleMeasures.start 
      }).map((_, idx) => {
        const measureIndex = visibleMeasures.start + idx;
        // Render measure content...
      })}
    </Layer>
  );
};
```

### 8. Performance Monitoring

```typescript
// Add performance monitoring utilities
const usePerformanceMonitor = () => {
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  
  useEffect(() => {
    const measureFPS = () => {
      frameCount.current++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime.current >= 1000) {
        console.log(`FPS: ${frameCount.current}`);
        frameCount.current = 0;
        lastTime.current = currentTime;
      }
      
      requestAnimationFrame(measureFPS);
    };
    
    if (process.env.NODE_ENV === 'development') {
      measureFPS();
    }
  }, []);
};
```

## Implementation Priority

1. **High Priority (Immediate Impact)**
   - Viewport culling for track instances
   - Grid line optimization
   - TimeRuler viewport culling

2. **Medium Priority (Significant Impact)**
   - React.memo optimizations
   - RequestAnimationFrame for scroll
   - Track renderer optimizations

3. **Low Priority (Future Enhancement)**
   - Progressive loading
   - Performance monitoring
   - Advanced caching strategies

## Expected Performance Gains

- **Initial Render**: 50-70% faster for large timelines (>100 tracks)
- **Scroll Performance**: 60-80% improvement in FPS during scroll
- **Memory Usage**: 40-60% reduction for long timelines
- **Interaction Responsiveness**: Near-instant response for drag/resize operations

## Testing Strategy

1. Create test scenarios with varying timeline sizes:
   - Small: 10 tracks, 32 measures
   - Medium: 50 tracks, 128 measures
   - Large: 200 tracks, 512 measures

2. Measure key metrics:
   - Initial render time
   - Scroll FPS
   - Memory usage
   - Time to interactive

3. Use Chrome DevTools Performance profiler to identify bottlenecks

## Next Steps

1. Implement viewport culling for track instances
2. Add performance monitoring in development
3. Optimize grid rendering
4. Test with large datasets
5. Fine-tune buffer sizes and thresholds