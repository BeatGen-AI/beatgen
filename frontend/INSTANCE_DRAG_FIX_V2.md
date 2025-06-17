# Instance Drag Fix V2 - Improved Solution

## The Problem
Instances were snapping back because the drag preview system was interfering with direct instance position updates.

## The Solution

### 1. Separated Track Mode vs Instance Mode Preview Logic
In `onDragMove`:
```typescript
if (isTrackMoveMode) {
  // Track mode: Use preview for visual feedback
  setDragPreviewPositions(newDragPositions);
} else {
  // Instance mode: Update positions directly, no preview
  onInstancePositionChange?.(trackId, instanceIdStr, { x: pos.x, y: pos.y }, false);
  setDragPreviewPositions(new Map()); // Clear preview
}
```

### 2. Fixed KonvaItems Position Calculation
Only use drag preview for tracks selected in sidebar:
```typescript
const isTrackSelected = selectedTrackIds && selectedTrackIds.includes(track.id);
if (dragPreview && isTrackSelected) {
  x = dragPreview.x / pixelsPerTick;
}
```

### 3. Improved Preview Clear Timing
Use `requestAnimationFrame` instead of `setTimeout`:
```typescript
requestAnimationFrame(() => {
  clearDragStart();
  clearPreview();
});
```

## How It Works Now

### Instance Mode (Default):
1. During drag: Directly updates instance positions in state
2. No drag preview used (prevents interference)
3. Real-time position updates visible
4. On drag end: Creates history action

### Track Mode (Sidebar Selection):
1. During drag: Uses preview positions for visual feedback
2. Doesn't update state until drag end
3. On drag end: Batch updates all instances of selected tracks

## Key Insight
The snap-back was caused by the preview system overriding the actual instance positions. By separating the preview logic for tracks vs instances, we ensure instances show their real positions during drag.

## Result
✅ Instances move smoothly during drag
✅ No snap-back on release
✅ History properly recorded
✅ Both modes work correctly