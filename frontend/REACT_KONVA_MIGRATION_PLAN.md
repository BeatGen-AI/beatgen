# React-Konva Migration Plan: Complete Deep Dive

## Executive Overview
We're migrating both Timeline and PianoRoll components from a hybrid DOM/Canvas approach to a unified react-konva (Canvas-only) rendering system. This solves fundamental coordination issues between DOM elements (Timeline tracks) and Canvas elements (PianoRoll notes) that made unified interactions impossible.

## Current Architecture Problems
1. **Timeline**: Uses DOM elements for tracks (BaseTrackPreview.tsx)
2. **PianoRoll**: Uses react-konva Canvas for notes
3. **Incompatibility**: DOM and Canvas have different coordinate systems, event handling, and rendering pipelines
4. **Failed Unification**: Our attempt to create a unified interaction system failed because:
   - DOM elements use CSS transforms and browser layout
   - Canvas uses immediate mode rendering with pixel coordinates
   - Event propagation works differently
   - Scrolling/viewport management is fundamentally different

## Phase 1: Create Shared Foundation (Week 1)

### 1.1 KonvaBase Component
**File**: `src/studio/components/shared/KonvaBase.tsx`

This abstract base component will:
- **Stage Setup**: Configure Konva.Stage with proper sizing, listening enabled
- **Viewport Management**: Handle scrolling via Konva layers instead of DOM scroll
- **Zoom Handling**: Unified zoom that scales the entire stage
- **Mouse Event Normalization**: Convert all mouse events to logical coordinates (ticks/pixels)
- **Performance Optimizations**: 
  - Implement viewport culling (only render visible items)
  - Use Konva's built-in hit detection optimization
  - Batch redraws with requestAnimationFrame

### 1.2 Shared Visual Components
**Directory**: `src/studio/components/shared/konva/`

**GridLayer.tsx**:
- Unified grid rendering component
- Configurable for horizontal (timeline) or vertical (piano roll) orientation
- Props: `orientation`, `gridSize`, `snapSize`, `measureCount`, `timeSignature`
- Uses Konva.Line for efficient line rendering

**SelectionRect.tsx**:
- Visual feedback for rectangle selection
- Semi-transparent blue rectangle
- Props: `start`, `end`, `isActive`

**DragGhost.tsx**:
- Semi-transparent copies of items being dragged
- Shows all selected items during group operations
- Props: `items`, `offset`, `opacity`

**ResizeHandle.tsx**:
- Reusable resize handle component
- Props: `position`, `direction`, `onResize`, `cursor`
- Hover states and visual feedback

**Ruler.tsx**:
- Configurable ruler for time (timeline) or pitch (piano roll)
- Click-to-seek functionality
- Props: `type`, `range`, `orientation`, `onClick`

### 1.3 Unified Interaction System
**File**: `src/studio/components/shared/konva/useKonvaInteractions.ts`

Single hook managing all interactions:
```typescript
interface UseKonvaInteractionsOptions {
  items: KonvaItem[]
  stage: Konva.Stage
  pixelsPerTick: number
  zoom: number
  tool: Tool
  onDragStart: (items: KonvaItem[]) => void
  onDragMove: (updates: Map<string, Position>) => void
  onDragEnd: (updates: Map<string, Position>) => void
  onResizeStart: (item: KonvaItem, direction: 'left' | 'right') => void
  onResizeMove: (updates: Map<string, Dimensions>) => void
  onResizeEnd: (updates: Map<string, Dimensions>) => void
  // ... more callbacks
}
```

Features:
- **Drag/Drop**: Multi-item drag with group support
- **Selection**: Rectangle selection, click selection, shift/cmd modifiers
- **Resize**: Edge-based resizing with visual feedback
- **Tools**: Select, pen, eraser, highlighter support
- **Keyboard**: Copy/paste, delete, select all
- **Coordinate Conversion**: All internal logic uses ticks, converts at boundaries

## Phase 2: Convert Timeline to Konva (Week 2)

### 2.1 KonvaTimeline Component
**File**: `src/studio/components/timeline/KonvaTimeline.tsx`

Complete Timeline replacement:
```typescript
interface KonvaTimelineProps {
  tracks: CombinedTrack[]
  currentTime: number
  isPlaying: boolean
  measureCount: number
  zoomLevel: number
  bpm: number
  timeSignature: [number, number]
  onTrackPositionChange: (trackId: string, newPosition: Position, isDragEnd: boolean) => void
  onTrackResizeEnd: (trackId: string, deltaPixels: number, direction: 'left' | 'right') => void
  // ... all existing Timeline props
}
```

Structure:
- Uses KonvaBase as foundation
- Renders tracks as Konva shapes instead of DOM elements
- Maintains all existing functionality

### 2.2 Track Rendering System
**File**: `src/studio/components/timeline/konva/KonvaTrack.tsx`

Base track component:
```typescript
interface KonvaTrackProps {
  track: CombinedTrack
  isSelected: boolean
  isPrimaryDrag: boolean
  isGroupDrag: boolean
  renderer: TrackRenderer
}
```

Features:
- **Base Shape**: Konva.Rect with rounded corners
- **Selection Highlight**: Konva.Rect with stroke
- **Track Decorations**:
  - Name label (Konva.Text)
  - Type badge (Konva.Label)
  - Mute overlay (semi-transparent Konva.Rect)
- **Content Rendering**: Delegates to specific renderers

**Track Renderers**:
- `AudioTrackRenderer.tsx`: Waveform visualization using Konva.Line
- `MidiTrackRenderer.tsx`: Note preview using small Konva.Rects
- `DrumTrackRenderer.tsx`: Drum pattern grid using Konva.Circle

### 2.3 Timeline-Specific Elements

**TimeRuler.tsx**:
- Konva-based ruler replacing canvas implementation
- Measure numbers, beat markers
- Click-to-seek functionality

**PlaybackCursor.tsx**:
- Vertical line (Konva.Line) showing current playback position
- Smooth animation during playback

**Track Controls**:
- Keep as DOM overlay for complex UI (sliders, buttons)
- Position using absolute positioning over canvas

## Phase 3: Refactor PianoRoll (Week 3)

### 3.1 Extract Reusable Components
- Remove PianoRoll-specific grid, use shared GridLayer
- Update note rendering to use shared DraggableItem
- Standardize all coordinate calculations

### 3.2 Unified DraggableItem
**File**: `src/studio/components/shared/konva/DraggableItem.tsx`

Base component for notes and tracks:
```typescript
interface DraggableItemProps {
  id: string
  x: number // in ticks
  y: number // in pixels (or note number for piano roll)
  width: number // in ticks
  height: number // in pixels
  isSelected: boolean
  renderContent: () => Konva.Node
  onDragStart: () => void
  onDragMove: (delta: Position) => void
  onDragEnd: () => void
  onResizeStart: (direction: 'left' | 'right') => void
  onResizeMove: (delta: number, direction: 'left' | 'right') => void
  onResizeEnd: () => void
}
```

## Phase 4: Implementation Strategy

### 4.1 Four-Week Incremental Migration

**Week 1: Foundation**
- Build all shared components
- No changes to existing code
- Comprehensive unit tests

**Week 2: Timeline Migration**
- Build KonvaTimeline alongside existing Timeline
- A/B testing setup
- Performance benchmarking

**Week 3: Feature Parity**
- Implement all Timeline features in Konva version
- Fix edge cases
- Update PianoRoll to use shared components

**Week 4: Switchover**
- Replace Timeline with KonvaTimeline in Studio.tsx
- Remove old Timeline code
- Final testing and optimization

### 4.2 Key Technical Decisions

**Coordinate System**:
- **Horizontal**: Always use ticks internally
- **Vertical**: Pixels for timeline, note numbers for piano roll
- **Conversions**: Only at input/output boundaries
- **Zoom**: Applied at render time, not stored in state

**Performance Strategy**:
- **Virtualization**: Only render items in viewport + buffer
- **Caching**: Use Konva node caching for complex shapes
- **Batching**: Group updates in requestAnimationFrame
- **Memoization**: React.memo on all components

**State Management**:
- **No Changes**: Keep existing Redux stores
- **Interaction State**: Local to useKonvaInteractions
- **Visual State**: Component-local (scroll, zoom)

## Phase 5: Benefits and Future

### Immediate Benefits
1. **Consistent Behavior**: Drag, resize, select work identically
2. **Better Performance**: No DOM reflows, GPU acceleration
3. **Cleaner Code**: Single rendering approach
4. **Easier Maintenance**: Shared components reduce duplication

### Future Possibilities
1. **Smooth Animations**: CSS transitions don't work on canvas, but we can implement smooth programmatic animations
2. **Advanced Visualizations**: 
   - Automation curves as Konva.Path
   - Velocity/dynamics overlays
   - Real-time spectrum analysis
3. **Custom Cursors**: Draw tool previews directly on canvas
4. **Mini-map**: Bird's eye view of entire project
5. **Track Folders**: Hierarchical organization with expand/collapse

## Migration Checklist

### Shared Components (Week 1)
- [ ] KonvaBase component with viewport management
- [ ] GridLayer supporting both orientations
- [ ] SelectionRect with proper styling
- [ ] DragGhost with multi-item support
- [ ] ResizeHandle with hover states
- [ ] Ruler component (time and pitch variants)
- [ ] useKonvaInteractions hook with all features

### Timeline Components (Week 2)
- [ ] KonvaTimeline container
- [ ] KonvaTrack base component
- [ ] AudioTrackRenderer with waveforms
- [ ] MidiTrackRenderer with note previews
- [ ] DrumTrackRenderer with pattern grid
- [ ] TimeRuler with measure/beat markers
- [ ] PlaybackCursor with smooth animation
- [ ] Track selection system integration

### Integration (Week 3)
- [ ] Update Studio.tsx to support both versions
- [ ] Migrate all track event handlers
- [ ] Test copy/paste with new system
- [ ] Test multi-selection edge cases
- [ ] Performance testing (100+ tracks)
- [ ] Update PianoRoll shared components

### Final Testing (Week 4)
- [ ] Unit tests for all conversions
- [ ] Integration tests for workflows
- [ ] Performance benchmarks vs old system
- [ ] User acceptance testing
- [ ] Remove old Timeline code

## Final Code Structure

```
src/studio/components/
├── shared/
│   ├── konva/
│   │   ├── KonvaBase.tsx              # Base canvas component
│   │   ├── GridLayer.tsx              # Shared grid rendering
│   │   ├── SelectionRect.tsx          # Selection rectangle
│   │   ├── DragGhost.tsx              # Drag preview
│   │   ├── ResizeHandle.tsx           # Resize handles
│   │   ├── Ruler.tsx                  # Time/pitch ruler
│   │   ├── DraggableItem.tsx          # Base draggable
│   │   └── useKonvaInteractions.ts    # Interaction hook
│   └── interactions/                   # DELETE after migration
├── timeline/
│   ├── KonvaTimeline.tsx              # Main timeline component
│   ├── konva/
│   │   ├── KonvaTrack.tsx             # Track base component
│   │   ├── TimeRuler.tsx              # Timeline ruler
│   │   ├── PlaybackCursor.tsx         # Playback indicator
│   │   └── tracks/
│   │       ├── AudioTrackRenderer.tsx  # Audio visualization
│   │       ├── MidiTrackRenderer.tsx   # MIDI visualization
│   │       └── DrumTrackRenderer.tsx   # Drum visualization
│   └── [old components - DELETE]
└── piano-roll2/
    ├── PianoRoll.tsx                  # Updated to use shared
    └── konva/
        └── NoteRenderer.tsx           # Note-specific rendering
```

## Critical Success Factors

1. **No Feature Regression**: Every current feature must work
2. **Performance Improvement**: Measurable performance gains
3. **Code Reduction**: At least 30% less code through sharing
4. **Developer Experience**: Easier to add new features
5. **User Experience**: Smoother, more responsive interactions

This migration represents a fundamental architectural improvement that will make the codebase more maintainable, performant, and extensible for years to come.

## Implementation Notes

### Current Status
- Date: [Current Date]
- Phase: Planning Complete
- Next Step: Begin Phase 1.1 - Create KonvaBase Component

### Key Files to Reference
- Current Timeline: `src/studio/components/timeline/Timeline.tsx`
- Current Track: `src/studio/components/track/base/BaseTrackPreview.tsx`
- Current PianoRoll: `src/studio/components/piano-roll2/PianoRoll.tsx`
- Failed Interaction System: `src/studio/shared/interactions/useInteractions.ts`

### Lessons Learned from Failed Attempt
1. DOM and Canvas coordinate systems are fundamentally incompatible
2. Event handling differs significantly between DOM and Canvas
3. Unified interaction system requires unified rendering approach
4. Performance optimizations work differently for DOM vs Canvas

### Migration Principles
1. **Incremental**: Build alongside existing code, don't break anything
2. **Testable**: Every component should have tests before integration
3. **Performant**: Measure performance at each step
4. **Maintainable**: Clear separation of concerns, reusable components
5. **User-Focused**: No visible changes to end users during migration