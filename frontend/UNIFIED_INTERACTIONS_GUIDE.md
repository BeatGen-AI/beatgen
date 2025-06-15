# Unified Interactions System Guide

## Overview

This guide explains the unified interaction system that provides consistent drag, resize, and selection behavior for both timeline tracks and piano roll notes, with proper zoom support for both.

## Core Components

### 1. Main Hook (`useInteractions.ts`)

The central hook that combines all interaction features:
- Takes `pixelsPerTick` and `zoom` parameters
- Both timeline and piano roll use zoom (timeline for display, piano roll for editing)
- Handles coordinate conversions internally
- Provides unified API for drag, resize, selection, and tools

```typescript
// Timeline usage
const interaction = useInteractions({
  items: trackItems,
  pixelsPerTick: GRID_CONSTANTS.measureWidth / ticksPerMeasure,
  zoom: zoomLevel,
  // ... callbacks
});

// Piano Roll usage
const interaction = useInteractions({
  items: noteItems,
  pixelsPerTick: GRID_SIZE / PULSES_PER_QUARTER_NOTE,
  zoom: zoomLevel,
  // ... callbacks
});
```

### 2. Supporting Hooks

- **`useResizeDrag.ts`** - Handles drag and resize operations with group support
- **`useSelection.ts`** - Rectangle selection and multi-select logic
- **`useTool.ts`** - Tool state management (select, pen, eraser, etc.)
- **`useClipboard.ts`** - Copy/cut/paste operations

### 3. Visual Components

- **`SelectionOverlay.tsx`** - Rectangle selection visual
- **`InteractionToolbar.tsx`** - Tool selection UI
- **`ResizeHandle.tsx`** - Resize handle component
- **`DragGhost.tsx`** - Drag preview visual

## Key Features

1. **Unified Zoom Handling**: Both timeline and piano roll use zoom
2. **Grid Snapping**: Works in logical units (ticks)
3. **Group Operations**: Select, drag, and resize multiple items
4. **Tool System**: Consistent tool behavior across components
5. **Keyboard Shortcuts**: Standard shortcuts for all operations
6. **Performance**: Optimized with memoization and batched updates

## Implementation Example

```typescript
// Convert your items to the standard format
const items: DraggableResizableItem[] = tracks.map(track => ({
  id: track.id,
  x: track.x_position, // In ticks
  y: track.y_position, // In pixels
  width: track.duration_ticks,
  height: GRID_CONSTANTS.trackHeight
}));

// Calculate pixels per tick
const pixelsPerTick = GRID_CONSTANTS.measureWidth / (ticksPerBeat * beatsPerMeasure);

// Use the interaction hook
const interaction = useInteractions({
  items,
  pixelsPerTick,
  zoom: zoomLevel,
  onDragMove: (updates) => {
    updates.forEach((pos, itemId) => {
      // Position is already in ticks
      updateItemPosition(itemId, pos.x, pos.y);
    });
  }
  // ... other callbacks
});
```

## Benefits

1. **DRY Principle**: Single implementation for both timeline and piano roll
2. **Consistency**: Same behavior and features everywhere
3. **Maintainability**: Changes in one place affect both components
4. **Type Safety**: Full TypeScript support with generics
5. **Extensibility**: Easy to add new tools or features

## Migration from Old System

Replace component-specific interaction logic with the unified hook:

```typescript
// Old: Custom drag handling
const handleMouseDown = (e) => {
  // Custom logic for each component
};

// New: Unified system
const interaction = useInteractions({ ... });
// Use interaction.handleItemClick, interaction.startDrag, etc.
```

The unified system handles all the complexity of coordinate conversion, zoom, grid snapping, and group operations internally.