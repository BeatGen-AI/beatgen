# Snap to Grid Fix - Real-time Snapping During Drag

## What was fixed:

1. **Added real-time position snapping during drag**
   - Previously, only the delta was snapped in the interaction manager
   - Now, we snap the actual final position during dragging
   - Calculate `snapSizeTicks` to convert pixel snap size to tick units
   - Apply snapping formula: `newX = Math.floor(newX / snapSizeTicks) * snapSizeTicks`

2. **Proper grid snap configuration**
   - Use `GridSnapOption.STEP` as default (matches piano roll)
   - Check for `GridSnapOption.NONE` instead of 0
   - Respect `gridSnapEnabled` flag during position calculation

3. **Synchronized snap toggle**
   - Connected Timeline's `gridSnapEnabled` state to the toolbar
   - Toggle both local state and interaction manager state together

## The snapping algorithm:

```typescript
// Calculate snap size in ticks
const snapSizeTicks = pixelsToTicks(actualSnapSize, bpm, timeSignature);

// Calculate new position
let newX = initialPos.x + deltaTicks;

// Snap the position if grid snap is enabled
if (gridSnapEnabled && gridSnapSize !== GridSnapOption.NONE) {
  newX = Math.floor(newX / snapSizeTicks) * snapSizeTicks;
}

newX = Math.max(0, newX);
```

## How it works:

1. The interaction manager provides a snapped delta in pixels
2. We convert this delta to ticks
3. We add the delta to the initial position
4. We snap the final position to the grid (not just the delta)
5. This ensures tracks always align to grid positions during dragging

## Testing:

1. Drag a track - it should snap to grid positions while dragging
2. Drag multiple selected tracks - they should all snap together
3. Toggle snap to grid off - tracks should move smoothly without snapping
4. The snapping should feel identical to dragging notes in the piano roll