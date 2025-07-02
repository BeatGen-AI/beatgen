# Coordinate System Fix for Y-Axis Dragging

## The Problem
The mouse cursor appeared to be below the threshold where the track should move down, but the track wasn't moving. This was due to a coordinate system mismatch.

## Root Cause
We were mixing different coordinate systems:
1. **At drag start**: Using viewport coordinates (`e.clientY - trackBounds.top`)
2. **During drag**: Using container-relative coordinates (with scroll offset)

This mismatch meant the calculated Y position was off by the height of elements above the timeline (like the control bar).

## The Fix

### 1. Consistent Mouse Offset Calculation
Changed from viewport-relative to container-relative coordinates:

```typescript
// Before (viewport-relative)
const mouseOffsetY = e.clientY - trackBounds.top;

// After (container-relative)
const mouseYInContainer = e.clientY - containerBounds.top + container.scrollTop;
const trackTopInContainer = track.y_position;
const mouseOffsetY = mouseYInContainer - trackTopInContainer;
```

### 2. Consistent Mouse Position During Drag
Ensured the mouse move handler uses the same coordinate system:

```typescript
const containerBounds = container.getBoundingClientRect();
const currentPosition = {
  x: e.clientX - containerBounds.left + container.scrollLeft,
  y: e.clientY - containerBounds.top + container.scrollTop
};
```

### 3. Reliable Container Reference
Added logic to find the same container element consistently using the track's data attribute.

## Result
Now the Y-axis dragging accurately follows the mouse position. When the mouse crosses the visual threshold of a row boundary, the track immediately snaps to that row, regardless of UI elements above the timeline.