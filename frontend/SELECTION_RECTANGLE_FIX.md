# Selection Rectangle Fix Summary

## Problem
The selection rectangle wasn't selecting tracks because of coordinate system mismatches:

1. **Y-coordinate issue**: The `konvaItems` array was using `track.y_position` (which is undefined) instead of calculating Y based on track index
2. **Coordinate conversion issue**: Y coordinates were being converted with `pixelsToLogical` but Y is already in pixels (only X needs conversion from pixels to ticks)

## Solution

### 1. Fixed KonvaItems Y Position (KonvaTimeline.tsx)
```typescript
// Before:
y: track.y_position, // In pixels

// After:
y: index * GRID_CONSTANTS.trackHeight, // Calculate based on index
```

### 2. Fixed Coordinate Conversions (useKonvaInteractions.ts)
For all position calculations, only convert X coordinates (which are in ticks), not Y coordinates (which are in pixels):

```typescript
// Before:
const logicalX = pixelsToLogical(x);
const logicalY = pixelsToLogical(y);

// After:
const logicalX = pixelsToLogical(x);
const logicalY = y; // Y is already in pixels, no conversion needed
```

Applied this fix to:
- `getItemAtPosition`
- `startSelection`
- `updateRectSelection`
- `updateDrag`
- `startDrag` (initial offsets)
- `onBackgroundClick` callbacks
- `onPaste` position
- Selection rectangle return value

## Testing
1. Draw a selection rectangle around tracks
2. Tracks within the rectangle should be selected
3. Multi-select with Shift/Ctrl should work
4. Selected tracks should be draggable together

## Result
Selection rectangle now properly detects and selects tracks based on their actual positions.