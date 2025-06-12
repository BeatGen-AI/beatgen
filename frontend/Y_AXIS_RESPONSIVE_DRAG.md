# Y-Axis Responsive Drag Implementation

## What was fixed:

### Problem
Y-axis dragging felt unresponsive because it was based on delta movement. If you grabbed a track near its bottom edge and dragged down, you had to move the mouse almost a full track height before it would jump to the next row.

### Solution
Changed Y-axis calculation from delta-based to absolute position-based:

1. **Store mouse offset within track** when drag starts
   - When starting drag, calculate where within the track the mouse was clicked
   - Store this offset: `mouseOffsetY = mouseY - trackTop`

2. **Calculate target row based on mouse position**
   - Instead of: `newY = initialY + deltaY`
   - Now: `targetY = mousePosition.y - mouseOffsetY`
   - Then snap to row: `newY = Math.floor(targetY / trackHeight) * trackHeight`

3. **Maintain relative positions for group drag**
   - Calculate the bounded position for the dragged track first
   - Calculate actual delta from initial to final position
   - Apply same delta to all tracks in group

## Implementation Details:

```typescript
// When drag starts (BaseTrackPreview)
const mouseOffsetY = e.clientY - trackBounds.top;
(window as any).__dragMouseOffsetY = mouseOffsetY;

// During drag (Timeline)
if (mousePosition) {
  // Calculate which row the mouse is over
  const targetY = mousePosition.y - mouseOffsetY;
  draggedNewY = Math.floor(targetY / GRID_CONSTANTS.trackHeight) * GRID_CONSTANTS.trackHeight;
}
```

## Benefits:

1. **Immediate response**: Track jumps to the row under the mouse cursor
2. **Natural feel**: Track follows mouse position directly
3. **Maintains grab point**: Track stays at same position relative to mouse
4. **Group integrity**: All tracks in group maintain relative positions