# Group Drag and Y-Axis Snap Fixes

## What was fixed:

### 1. Group Drag Maintains Relative Positions
**Problem**: When dragging multiple tracks and hitting boundaries, tracks would lose their relative spacing.

**Solution**: 
- Calculate the new position for the dragged track first
- Apply boundaries to get the actual possible movement
- Calculate the actual delta (bounded position - initial position)
- Apply this same delta to ALL tracks in the group
- This ensures all tracks move by the same amount, maintaining spacing

**Code logic**:
```typescript
// Calculate where the dragged track wants to go
let draggedNewX = draggedInitialPos.x + deltaTicks;
let draggedNewY = draggedInitialPos.y + delta.y;

// Apply snapping and boundaries
draggedNewX = Math.max(0, draggedNewX);
draggedNewY = Math.max(0, draggedNewY);

// Calculate actual movement delta
const actualDeltaX = draggedNewX - draggedInitialPos.x;
const actualDeltaY = draggedNewY - draggedInitialPos.y;

// Apply same delta to all tracks
tracksInGroup.forEach(trackId => {
  const newX = initialPos.x + actualDeltaX;
  const newY = initialPos.y + actualDeltaY;
});
```

### 2. Y-Axis Snapping to Track Rows
**Problem**: Tracks could be positioned between rows, making the timeline look messy.

**Solution**:
- Added Y-axis snapping using `GRID_CONSTANTS.trackHeight`
- Formula: `Math.floor(newY / trackHeight) * trackHeight`
- This ensures tracks always align to row boundaries

**Example**:
- If `trackHeight = 60`
- Dragging to Y=75 snaps to Y=60 (row 1)
- Dragging to Y=125 snaps to Y=120 (row 2)

## Benefits:

1. **Clean Layout**: Tracks always align to rows, no more in-between positioning
2. **Consistent Group Movement**: Selected tracks maintain their relative spacing
3. **Boundary Respect**: When one track hits a boundary, all tracks stop together
4. **Better UX**: Movement feels more controlled and predictable