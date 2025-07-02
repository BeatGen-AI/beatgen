# Mouse Position-Based Dragging Implementation

## Overview
Changed from delta-based dragging to absolute position-based dragging for the Y-axis. This makes tracks always stay under the mouse cursor.

## How It Works

1. **When drag starts** (BaseTrackPreview):
   - Calculate where within the track the user clicked (mouseOffset)
   - Pass this offset to the interaction manager

2. **During drag** (Timeline):
   - For Y-axis: Calculate `targetY = mousePosition.y - mouseOffset.y`
   - This gives us where the track's top edge should be
   - Snap this to the nearest row
   - For X-axis: Still use delta-based movement for stability

3. **Group drag**:
   - Calculate the position for the dragged track first
   - Calculate the delta from initial to new position
   - Apply the same delta to all other tracks in the group

## Key Code Changes

### BaseTrackPreview.tsx
```typescript
// Calculate mouse offset within the track
const trackPixelX = ticksToPixels(track.x_position, bpm, timeSignature);
const mouseOffset = {
  x: mousePosition.x - trackPixelX,
  y: mousePosition.y - track.y_position
};

interaction.startDrag(track.id, mousePosition, initialPositions, mouseOffset);
```

### Timeline.tsx
```typescript
// Use absolute position for Y
if (mousePosition && mouseOffset) {
  const targetY = mousePosition.y - mouseOffset.y;
  draggedNewY = Math.round(targetY / GRID_CONSTANTS.trackHeight) * GRID_CONSTANTS.trackHeight;
}
```

## Benefits
- Track always stays under the mouse cursor
- More intuitive and responsive dragging
- Works with both single and group selection
- Maintains relative positions in group drag