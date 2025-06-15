# Y-Axis Grid Snapping Fix

## Problem
When dragging tracks vertically, they weren't snapping to the track grid, making it difficult to align tracks properly.

## Solution
Added Y-axis snapping to the track height grid in the interaction system.

### Changes Made

#### 1. Added trackHeight parameter to useKonvaInteractions (useKonvaInteractions.ts)
```typescript
export interface UseKonvaInteractionsOptions {
  // ... existing options
  /** Track height for Y-axis snapping (in pixels) */
  trackHeight?: number;
}
```

#### 2. Added Y-axis snap function (useKonvaInteractions.ts)
```typescript
// Snap Y position to track grid
const snapYToTrackGrid = useCallback((y: number) => {
  return Math.round(y / trackHeight) * trackHeight;
}, [trackHeight]);
```

#### 3. Applied Y-axis snapping during drag (useKonvaInteractions.ts)
```typescript
updates.set(itemId, {
  x: snapToGridValue(newX),
  y: snapYToTrackGrid(newY) // Snap Y to track grid
});
```

#### 4. Passed trackHeight from KonvaTimeline (KonvaTimeline.tsx)
```typescript
const interaction = useKonvaInteractions({
  // ... other options
  trackHeight: GRID_CONSTANTS.trackHeight,
});
```

#### 5. Removed redundant Y-axis snapping (KonvaTimeline.tsx)
Removed the manual Y-axis snapping in onDragMove and onDragEnd handlers since it's now handled by the interaction system.

## Result
- Tracks now snap to the track height grid when dragged vertically
- Works for both individual track drag and group drag
- Consistent snapping behavior across all drag operations
- Visual feedback shows tracks aligning to proper grid positions