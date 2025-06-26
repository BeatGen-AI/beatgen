# Timeline Performance Optimization Plan with Virtual Scrolling

## 1. Analysis of Components Requiring Viewport Culling

### Components Currently Rendering All Items
- **KonvaTimeline Grid Lines**: Renders all measure/beat/subdivision lines regardless of viewport
- **Track Instances**: All track instances are rendered even when off-screen
- **Time Ruler**: Renders all measure numbers and tick marks
- **Track Content Renderers**: 
  - MidiTrackRenderer: Renders all MIDI notes
  - AudioTrackRenderer: Generates full waveform data
  - DrumTrackRenderer: Renders all drum hits

### Performance Bottlenecks Identified
1. **Grid Rendering**: ~3,200+ DOM elements for a 100-measure timeline
2. **Track Instance Rendering**: Each track creates multiple Konva nodes
3. **MIDI Note Rendering**: Can have thousands of notes in view
4. **No Viewport-Based Culling**: Everything renders regardless of visibility

## 2. Virtual Scrolling Implementation Strategy

### Core Principle
Only render what's visible in the viewport plus a small buffer zone for smooth scrolling.

### Implementation Approach

#### A. Viewport Calculation Utilities
```typescript
// Calculate visible range with buffer
interface VisibleRange {
  startTicks: number;
  endTicks: number;
  startTrack: number;
  endTrack: number;
  startMeasure: number;
  endMeasure: number;
}

const calculateVisibleRange = (
  viewport: Viewport, 
  pixelsPerTick: number,
  trackHeight: number,
  pixelsPerMeasure: number,
  buffer: { x: number; y: number } = { x: 200, y: 100 }
): VisibleRange => {
  // Time range (X-axis)
  const startTicks = Math.max(0, (viewport.x - buffer.x) / pixelsPerTick);
  const endTicks = (viewport.x + viewport.width + buffer.x) / pixelsPerTick;
  
  // Track range (Y-axis)
  const startTrack = Math.max(0, Math.floor((viewport.y - buffer.y) / trackHeight));
  const endTrack = Math.ceil((viewport.y + viewport.height + buffer.y) / trackHeight);
  
  // Measure range for grid
  const startMeasure = Math.max(0, Math.floor((viewport.x - buffer.x) / pixelsPerMeasure));
  const endMeasure = Math.ceil((viewport.x + viewport.width + buffer.x) / pixelsPerMeasure);
  
  return { startTicks, endTicks, startTrack, endTrack, startMeasure, endMeasure };
};
```

#### B. Component-Specific Optimizations

##### 1. Grid Lines Optimization
```typescript
// In KonvaTimeline.tsx, replace grid rendering with:
const GridWithViewportCulling = React.memo(({ 
  viewport, 
  measureCount, 
  pixelsPerMeasure, 
  timeSignature,
  totalHeight 
}) => {
  const visibleRange = useMemo(() => 
    calculateVisibleRange(viewport, pixelsPerTick, trackHeight, pixelsPerMeasure),
    [viewport, pixelsPerTick, trackHeight, pixelsPerMeasure]
  );
  
  // Only render visible measures
  return (
    <>
      {Array.from({ 
        length: visibleRange.endMeasure - visibleRange.startMeasure + 1 
      }).map((_, idx) => {
        const measureIndex = visibleRange.startMeasure + idx;
        if (measureIndex >= measureCount) return null;
        
        const x = measureIndex * pixelsPerMeasure;
        // Render measure, beat, and subdivision lines
        return <MeasureGrid key={measureIndex} x={x} ... />;
      })}
    </>
  );
});
```

##### 2. Track Instance Culling
```typescript
// Filter konvaItems before rendering
const visibleKonvaItems = useMemo(() => {
  const range = calculateVisibleRange(viewport, pixelsPerTick, GRID_CONSTANTS.trackHeight, pixelsPerMeasure);
  
  return konvaItems.filter(item => {
    // Check time bounds
    const itemStartX = item.x * pixelsPerTick;
    const itemEndX = (item.x + item.width) * pixelsPerTick;
    const isTimeVisible = itemEndX >= (viewport.x - 200) && itemStartX <= (viewport.x + viewport.width + 200);
    
    // Check track bounds
    const trackIndex = Math.floor(item.y / GRID_CONSTANTS.trackHeight);
    const isTrackVisible = trackIndex >= range.startTrack && trackIndex <= range.endTrack;
    
    return isTimeVisible && isTrackVisible;
  });
}, [konvaItems, viewport, pixelsPerTick]);
```

##### 3. MIDI Note Culling in Renderers
```typescript
// In MidiTrackRenderer.tsx
const visibleNotes = useMemo(() => {
  // Calculate visible time range relative to track content
  const viewStartTicks = Math.max(0, -contentOffset / pixelsPerTick);
  const viewEndTicks = viewStartTicks + (width / pixelsPerTick);
  
  return notes.filter(note => {
    const noteEnd = note.column + note.length;
    return noteEnd >= viewStartTicks && note.column <= viewEndTicks;
  });
}, [notes, contentOffset, pixelsPerTick, width]);
```

## 3. React.memo Optimization Strategy

### Memoization Points

#### A. Heavy Components
```typescript
// Memoize TimeRuler with custom comparison
export const TimeRuler = React.memo(TimeRulerComponent, (prev, next) => {
  return (
    prev.viewport.x === next.viewport.x &&
    prev.viewport.width === next.viewport.width &&
    prev.zoom === next.zoom &&
    prev.measureCount === next.measureCount &&
    prev.pixelsPerMeasure === next.pixelsPerMeasure
  );
});

// Memoize KonvaTrack (already implemented but can be enhanced)
export const KonvaTrack = React.memo(KonvaTrackComponent, (prev, next) => {
  // Add content-based comparison for track data
  const trackDataEqual = (
    prev.track.id === next.track.id &&
    prev.track.mute === next.track.mute &&
    prev.track.name === next.track.name
  );
  
  const positionEqual = (
    prev.x === next.x &&
    prev.y === next.y &&
    prev.width === next.width &&
    prev.height === next.height
  );
  
  const interactionEqual = (
    prev.isSelected === next.isSelected &&
    prev.isDragging === next.isDragging &&
    prev.isResizing === next.isResizing
  );
  
  return trackDataEqual && positionEqual && interactionEqual;
});
```

#### B. Callback Memoization
```typescript
// In KonvaTimeline.tsx
const handleTrackClick = useCallback((trackId: string, instanceId: string) => {
  if (onTrackClick && !interaction.hasMovedDuringInteraction) {
    onTrackClick(trackId, instanceId);
  }
}, [onTrackClick, interaction.hasMovedDuringInteraction]);

const handleRulerClick = useCallback((measure: number) => {
  const ticksPerMeasure = MUSIC_CONSTANTS.pulsesPerQuarterNote * timeSignature[0];
  const ticks = measure * ticksPerMeasure;
  const timeInSeconds = (ticks * 60) / (bpm * MUSIC_CONSTANTS.pulsesPerQuarterNote);
  onTimeChange(timeInSeconds);
}, [bpm, timeSignature, onTimeChange]);
```

## 4. RequestAnimationFrame Integration

### Scroll Handling Optimization
```typescript
// Custom hook for RAF-throttled scroll updates
const useRAFScroll = (callback: (viewport: Viewport) => void) => {
  const rafRef = useRef<number>();
  const lastViewportRef = useRef<Viewport>();
  
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    // Cancel pending RAF
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    rafRef.current = requestAnimationFrame(() => {
      const target = e.currentTarget;
      const newViewport = {
        x: target.scrollLeft,
        y: target.scrollTop,
        width: target.clientWidth,
        height: target.clientHeight
      };
      
      // Only update if viewport actually changed
      if (!lastViewportRef.current || 
          newViewport.x !== lastViewportRef.current.x ||
          newViewport.y !== lastViewportRef.current.y) {
        lastViewportRef.current = newViewport;
        callback(newViewport);
      }
    });
  }, [callback]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);
  
  return handleScroll;
};

// Usage in KonvaTimeline
const handleScroll = useRAFScroll((newViewport) => {
  setViewport(newViewport);
});
```

### Drag/Resize Animation Optimization
Already implemented in `useKonvaInteractions` with RAF for drag updates.

## 5. Lazy Loading Strategy

### Progressive Loading Approach

#### A. Track Content Loading
```typescript
interface LazyLoadState {
  loadedRanges: Map<string, { start: number; end: number }[]>;
  pendingLoads: Set<string>;
}

const useLazyTrackContent = (tracks: CombinedTrack[], viewport: Viewport) => {
  const [loadState, setLoadState] = useState<LazyLoadState>({
    loadedRanges: new Map(),
    pendingLoads: new Set()
  });
  
  useEffect(() => {
    const visibleRange = calculateVisibleRange(viewport, pixelsPerTick, trackHeight, pixelsPerMeasure);
    
    tracks.forEach(track => {
      const trackRanges = loadState.loadedRanges.get(track.id) || [];
      const needsLoad = !trackRanges.some(range => 
        range.start <= visibleRange.startTicks && 
        range.end >= visibleRange.endTicks
      );
      
      if (needsLoad && !loadState.pendingLoads.has(track.id)) {
        // Queue load for this track's visible range
        loadTrackContent(track.id, visibleRange.startTicks, visibleRange.endTicks);
      }
    });
  }, [viewport, tracks]);
  
  return loadState;
};
```

#### B. MIDI Note Chunking
```typescript
// Load MIDI notes in chunks
const CHUNK_SIZE = 500; // notes per chunk

const useLazyMidiNotes = (trackId: string, visibleRange: { start: number; end: number }) => {
  const [loadedNotes, setLoadedNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    let cancelled = false;
    
    const loadNotes = async () => {
      setIsLoading(true);
      
      // Simulate chunked loading
      const allNotes = await fetchNotesForRange(trackId, visibleRange);
      
      for (let i = 0; i < allNotes.length && !cancelled; i += CHUNK_SIZE) {
        const chunk = allNotes.slice(i, i + CHUNK_SIZE);
        
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        if (!cancelled) {
          setLoadedNotes(prev => [...prev, ...chunk]);
        }
      }
      
      setIsLoading(false);
    };
    
    loadNotes();
    
    return () => { cancelled = true; };
  }, [trackId, visibleRange]);
  
  return { notes: loadedNotes, isLoading };
};
```

## 6. Implementation Priority

### Phase 1: Core Viewport Culling (Immediate Impact)
1. Implement `calculateVisibleRange` utility
2. Add viewport culling to grid lines
3. Filter track instances by viewport
4. Update TimeRuler to only render visible measures

### Phase 2: Track Content Optimization
1. Implement MIDI note culling in renderers
2. Add viewport awareness to audio waveform generation
3. Optimize drum hit rendering

### Phase 3: React Optimization
1. Enhance React.memo usage with proper comparisons
2. Memoize all event callbacks
3. Implement useRAFScroll for smooth scrolling

### Phase 4: Advanced Features
1. Implement lazy loading for track content
2. Add progressive MIDI note loading
3. Create LOD (Level of Detail) system for zoomed-out views

## 7. Performance Monitoring

```typescript
// Debug overlay component
const PerformanceMonitor = () => {
  const [metrics, setMetrics] = useState({
    fps: 0,
    renderTime: 0,
    visibleItems: 0,
    totalItems: 0
  });
  
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const measure = () => {
      frameCount++;
      const now = performance.now();
      
      if (now - lastTime >= 1000) {
        setMetrics(prev => ({
          ...prev,
          fps: frameCount,
          renderTime: (now - lastTime) / frameCount
        }));
        frameCount = 0;
        lastTime = now;
      }
      
      requestAnimationFrame(measure);
    };
    
    requestAnimationFrame(measure);
  }, []);
  
  return (
    <div className="performance-overlay">
      <div>FPS: {metrics.fps}</div>
      <div>Render: {metrics.renderTime.toFixed(2)}ms</div>
      <div>Visible: {metrics.visibleItems}/{metrics.totalItems}</div>
    </div>
  );
};
```

## Expected Performance Improvements

1. **Grid Rendering**: 95% reduction in DOM elements (only ~160 for visible area)
2. **Track Rendering**: 80-90% reduction for large projects
3. **Scroll Performance**: Consistent 60fps scrolling
4. **Memory Usage**: 50-70% reduction for large timelines
5. **Initial Load**: 3-5x faster for projects with many tracks

## Conclusion

This optimization plan focuses on implementing viewport culling as the primary performance improvement, with additional optimizations for React rendering and progressive loading. The phased approach allows for incremental improvements while maintaining stability.