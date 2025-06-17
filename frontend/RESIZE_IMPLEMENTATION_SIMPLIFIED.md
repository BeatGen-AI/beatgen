# Resize Implementation - Simplified Approach

## The Approach
We're using a preview-based system for resize (similar to how many DAWs work):

1. **During Resize (onResizeMove)**:
   - Update preview positions/widths in state
   - Visual feedback through preview rendering
   - No actual data changes yet

2. **On Resize End (onResizeEnd)**:
   - Clear previews
   - Calculate deltas from original to final position
   - Call `onInstanceResizeEnd` which creates history action
   - The history action updates the actual instance data

## Why This Approach?
- **Separation of concerns**: Visual preview vs actual data changes
- **Better performance**: Only one data update at the end
- **Cleaner undo/redo**: Single history action per resize
- **Consistent with drag behavior**: Both use preview during operation

## Current Implementation

### Visual Preview
```typescript
onResizeMove: (updates) => {
  updates.forEach((dim, itemId) => {
    if (dim.width !== undefined) {
      const widthInPixels = dim.width * pixelsPerTick;
      newPreviewWidths.set(itemId, widthInPixels);
    }
    if (dim.start !== undefined) {
      const xInPixels = dim.start * pixelsPerTick;
      newPreviewPositions.set(itemId, xInPixels);
    }
  });
}
```

### Finalize Resize
```typescript
onResizeEnd: (updates) => {
  // Clear previews
  setResizePreviewWidths(new Map());
  setResizePreviewPositions(new Map());
  
  // Calculate deltas and call handler
  updates.forEach((dim, itemId) => {
    if (dim.start !== undefined && dim.width !== undefined) {
      // Left resize
      const deltaPixels = ticksToPixels(dim.start - instance.x, bpm, timeSignature);
      onInstanceResizeEnd(trackId, instanceId, deltaPixels, 'left');
    } else if (dim.width !== undefined) {
      // Right resize
      const deltaTicks = dim.width - currentWidth;
      const deltaPixels = ticksToPixels(deltaTicks, bpm, timeSignature);
      onInstanceResizeEnd(trackId, instanceId, deltaPixels, 'right');
    }
  });
}
```

## Known Issues to Fix
1. Need to ensure `handleInstanceResizeEnd` correctly handles the deltas
2. May need to adjust how we calculate the deltas
3. Should add logging to debug the resize flow