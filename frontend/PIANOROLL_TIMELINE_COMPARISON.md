# PianoRoll vs Timeline Implementation Comparison

## Overview

Both components implement similar group operations but with different architectures. Timeline uses the shared `useInteractionManager` hook while PianoRoll has its own implementation.

## Key Differences

### 1. Architecture Approach

**Timeline:**
- Uses the shared `useInteractionManager` hook from `studio/shared/interactions`
- Delegates most interaction logic to the centralized system
- Maintains minimal local state for group operations

**PianoRoll:**
- Implements its own interaction handling directly in the component
- Has custom state management for selections, dragging, and resizing
- Does not use the shared interaction system

### 2. State Management

**Timeline State:**
```typescript
// Uses interaction manager's state
const interaction = useInteractionManager({...});

// Additional local state for group operations
const [groupDragState, setGroupDragState] = useState({
  isDragging: boolean,
  initialPositions: Record<string, { x: number; y: number }>,
  draggedTrackId: string | null
});

const [groupResizeState, setGroupResizeState] = useState({
  isResizing: boolean,
  initialDimensions: Record<string, { x: number; width: number; trimStart: number; trimEnd: number }>,
  resizedTrackId: string | null,
  resizeDirection: 'left' | 'right' | null
});
```

**PianoRoll State:**
```typescript
// Own selection state
const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
const [selectionRect, setSelectionRect] = useState<{startX, startY, width, height} | null>(null);
const [isSelecting, setIsSelecting] = useState(false);

// Drag state
const [dragOrigin, setDragOrigin] = useState<{noteId, startX, startY} | null>(null);
const [dragOffset, setDragOffset] = useState<{x, y}>({x: 0, y: 0});
const [selectedNotesStartPos, setSelectedNotesStartPos] = useState<{[id]: {x, y}}>({});

// No centralized resize state - handled per note
```

### 3. Selection Handling

**Timeline:**
- Selection handled by `useInteractionManager`
- Rectangle selection implemented in the shared system
- Selection state changes trigger callbacks

**PianoRoll:**
- Custom selection rectangle implementation
- Direct manipulation of `selectedNoteIds` state
- Manual calculation of items within selection rectangle

### 4. Group Drag Operations

**Timeline:**
```typescript
onDragMove: (itemId, delta, mousePosition, mouseOffset) => {
  // Delta is already snapped by interaction manager
  const deltaTicks = pixelsToTicks(Math.abs(delta.x), bpm, timeSignature) * (delta.x >= 0 ? 1 : -1);
  
  if (isGroupDrag) {
    // Calculate actual delta from dragged item
    const actualDeltaX = draggedNewX - draggedInitialPos.x;
    const actualDeltaY = draggedNewY - draggedInitialPos.y;
    
    // Apply same delta to all selected items
    tracksInGroup.forEach(trackId => {
      const newX = Math.max(0, initialPos.x + actualDeltaX);
      const newY = Math.max(0, initialPos.y + actualDeltaY);
      onTrackPositionChange?.(trackId, { x: newX, y: newY }, false);
    });
  }
}
```

**PianoRoll:**
```typescript
// Creates ghost notes for visual feedback during drag
const ghostNotes = useMemo(() => {
  if (!dragOrigin || !dragOffset || !selectedNoteIds.includes(dragOrigin.noteId)) return [];
  
  return visibleNotes
    .filter(note => selectedNoteIds.includes(note.id) && note.id !== dragOrigin.noteId)
    .map(note => ({
      ...note,
      start: note.start + dragOffset.x / effectiveGridSize,
      top: note.top + dragOffset.y / keyHeight
    }));
}, [dragOrigin, dragOffset, selectedNoteIds, visibleNotes]);

// Updates actual positions on drag end
if (selectedNoteIds.includes(noteId)) {
  const allSelectedPositions = visualNotes
    .filter(n => selectedNoteIds.includes(n.id))
    .map(n => ({
      ...n,
      // Apply same delta to all selected notes
    }));
}
```

### 5. Grid Snapping

**Timeline:**
- Grid snapping handled by `useInteractionManager` using `snapToGridValue`
- Consistent Math.floor approach
- Grid size passed to interaction manager

**PianoRoll:**
- Custom grid snapping implementation
- Uses `getSnapSizeInPixels` with various snap options
- More granular control over snap behavior (1/6 step, 1/4 beat, etc.)

### 6. Resize Operations

**Timeline:**
- Group resize supported through `useInteractionManager`
- Stores initial dimensions for all selected items
- Applies proportional resize to group

**PianoRoll:**
- Individual note resize only (no group resize visible in code)
- Resize handled at the note component level
- Uses `resizingNoteId` to track which note is being resized

## Code Duplication

### 1. Coordinate Conversion
Both implement similar pixel-to-time conversions:
- Timeline: `pixelsToTicks`, `ticksToPixels`
- PianoRoll: Custom calculations with `effectiveGridSize`

### 2. Selection Rectangle Logic
- Timeline: Uses shared `getItemsInRect` from interaction manager
- PianoRoll: Custom implementation to find notes within rectangle

### 3. Drag Delta Calculations
- Very similar logic for calculating and applying position deltas
- Both maintain initial positions and calculate relative movement

### 4. Snap-to-Grid Logic
- Both implement grid snapping but with different approaches
- Could be unified using the shared system

## What's Already Shared

### Via useInteractionManager:
1. Tool state management
2. Basic selection state
3. Clipboard operations (copy/cut/paste)
4. Drag state management
5. Resize state management
6. Grid snapping utilities

## Opportunities for Additional Abstraction

### 1. Unified Note/Track Item Interface
```typescript
interface TimelineItem {
  id: string;
  x: number; // position in ticks
  y: number; // row position
  width: number; // duration in ticks
  type: 'track' | 'note';
}
```

### 2. Shared Group Operations Hook
```typescript
const useGroupOperations = () => {
  const [groupState, setGroupState] = useState<GroupOperationState>();
  
  const startGroupOperation = (itemIds: string[], operation: 'drag' | 'resize') => {...};
  const updateGroupOperation = (delta: Delta) => {...};
  const endGroupOperation = () => {...};
  
  return { groupState, startGroupOperation, updateGroupOperation, endGroupOperation };
};
```

### 3. Common Grid Utilities
```typescript
// Shared grid conversion utilities
const gridUtils = {
  pixelsToTicks: (pixels: number, bpm: number, timeSignature: [number, number]) => {...},
  ticksToPixels: (ticks: number, bpm: number, timeSignature: [number, number]) => {...},
  snapToGrid: (value: number, gridSize: number, snapOption: GridSnapOption) => {...},
  getSnapSize: (snapOption: GridSnapOption, baseGridSize: number) => {...}
};
```

### 4. Selection Rectangle Component
A shared component that handles rectangle selection visualization and item detection.

### 5. Ghost/Preview System
Both components could benefit from a shared ghost/preview rendering system for drag operations.

## How PianoRoll Handles Group Resize

From the analyzed code, **PianoRoll does not appear to implement group resize functionality**. It only tracks individual note resizing through `resizingNoteId`. This is a key difference from Timeline, which supports group resize operations.

## Recommendations

1. **Migrate PianoRoll to use useInteractionManager**: This would eliminate significant code duplication and provide consistent behavior across both components.

2. **Extract Common Grid Utilities**: Create a shared module for all grid-related calculations and conversions.

3. **Implement Group Resize in PianoRoll**: Add support for resizing multiple selected notes together, similar to Timeline's group resize.

4. **Create Shared Ghost Rendering**: Both components use preview/ghost elements during drag operations - this could be abstracted.

5. **Unify Coordinate Systems**: Establish a common coordinate system and conversion utilities that both components can use.

6. **Share Selection Rectangle Logic**: The rectangle selection and item detection logic is very similar and could be shared.