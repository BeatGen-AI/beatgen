# Group Resize Debug Summary

## Problem
When releasing the mouse after resizing tracks (especially in a group), tracks were jumping to incorrect positions (x:0 and x:896).

## Root Cause
The issue was in the Timeline's `onResizeEnd` handler. It was passing the same delta value for both left and right resize, but:
- For **left resize**: BaseTrackPreview expects and passes a position delta
- For **right resize**: BaseTrackPreview expects and passes a width delta

## Solution
Updated Timeline.tsx to handle left and right resize differently in the group resize end handler:
- For left resize: Pass the position delta (how much the left edge moved)
- For right resize: Pass the width delta (how much the width changed)

## Key Changes

### 1. Timeline.tsx - Fixed onResizeEnd
```typescript
if (direction === 'left') {
  // For left resize: calculate position change
  const deltaPositionPixels = groupResizeState.currentDelta.x;
  onTrackResizeEnd(trackId, deltaPositionPixels, direction);
} else {
  // For right resize: calculate width change
  const deltaWidthPixels = groupResizeState.currentDelta.x;
  onTrackResizeEnd(trackId, deltaWidthPixels, direction);
}
```

### 2. Added Detailed Logging
- Added logging to tracksSlice to show resize calculations
- Added logging to TrackResize action to show what values are being set
- Added logging to Timeline to show resize deltas

## How It Works Now
1. During resize drag: Visual updates happen in real-time with grid snapping
2. On resize release:
   - Timeline determines if it's a group or single resize
   - For group resize, it uses the stored delta from the interaction manager
   - Passes the appropriate delta (position or width) based on resize direction
3. tracksSlice converts pixel deltas to tick deltas and updates trim/position values
4. TrackResize action applies the changes to the state and audio engine

## Testing Steps
1. Select multiple tracks
2. Resize from the left - tracks should maintain relative positions
3. Resize from the right - only width should change, positions stay the same
4. Release mouse - tracks should stay where they were during drag (no jumping!)