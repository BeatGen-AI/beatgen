# Track Move Fix Complete

## The Problem
When moving tracks, they would snap back to their original position. This was happening because:
1. Positions were being updated during drag (live preview)
2. On drag end, we calculated delta from already-updated positions
3. This resulted in applying the movement twice

## The Solution

### 1. Store Original Positions on Drag Start
Added `dragStartPositions` ref to store initial positions when drag begins:
```typescript
onDragStart: (items) => {
  dragStartPositions.current.clear();
  items.forEach(item => {
    dragStartPositions.current.set(item.id, { x: item.x, y: item.y });
  });
}
```

### 2. Calculate Delta from Original Positions
Use stored positions to calculate the actual movement:
```typescript
const originalPos = dragStartPositions.current.get(itemId);
const deltaX = newPos.x - originalPos.x;
const deltaY = newPos.y - originalPos.y;
```

### 3. Prevent State Updates During Track Move Drag
Added check in `onDragMove` to skip state updates in track move mode:
```typescript
const isTrackMoveMode = selectedTrackIds && selectedTrackIds.length > 0;
if (isTrackMoveMode) {
  return; // Just show preview, don't update state
}
```

### 4. Use Proper History Actions
Track moves now use `updateMultipleTrackPositions` which creates `GroupAction` with `TrackPosition` actions.

## How It Works Now

### Track Move Mode (tracks selected in sidebar):
1. Drag starts → Store original positions
2. During drag → Show visual preview only, no state updates
3. Drag ends → Calculate delta from original positions → Create history action

### Instance Move Mode (default):
1. Drag starts → Store original positions
2. During drag → Update instance positions for live preview
3. Drag ends → Create history action with final positions

## Result
- ✅ Track moves work correctly without snapping back
- ✅ Proper history is created for undo/redo
- ✅ Visual feedback during drag
- ✅ Clean separation between track and instance modes

## Files Modified
- `KonvaTimeline.tsx`: Added drag position tracking and fixed delta calculations
- `Studio.tsx`: Fixed batch update handler to use history actions
- `useKonvaInteractions.ts`: Enhanced to support position tracking

The system now properly handles all drag operations with correct history management.