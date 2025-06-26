# Left Resize Operation Trace

This document traces the complete flow of a left resize operation when a user drags a track instance's left handle 50 pixels to the right.

## Initial State
- Track instance positioned at x=200 ticks (100 pixels at 2 pixels/tick)
- Instance width: 400 ticks (200 pixels)
- trim_start_ticks: 0
- trim_end_ticks: 400
- Content offset: 0 (no initial trim)

## Phase 1: Mouse Down on Left Resize Handle

### 1.1 User Interaction (KonvaTrack.tsx)
```javascript
// Line 396-425: Left resize handle onMouseDown
onMouseDown={(e) => {
  e.cancelBubble = true;
  if (onResizeStart) {
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (pos) {
      onResizeStart(instanceId, 'left', pos);
    }
  }
}}
```

### 1.2 KonvaTimeline Receives Resize Start
```javascript
// Line 891-896: onResizeStart handler
onResizeStart={(id, direction, mousePos) => {
  if (interaction.startResize) {
    interaction.startResize(id, direction, mousePos);
  }
}}
```

### 1.3 useKonvaInteractions.startResize (Line 378-433)
```javascript
startResize(instanceId, 'left', { x: 200, y: 150 })
// Captures snapshot of current state:
resizeStartRef.current = {
  mousePos: { x: 200, y: 150 },
  item: { id: instanceId, x: 200, y: 60, width: 400, height: 60 },
  direction: 'left',
  allItems: Map { instanceId => {...} } // For group resize
}
// Sets state:
setIsResizing(true)
setResizingItemId(instanceId)
setResizeDirection('left')
```

### 1.4 KonvaTimeline.onResizeStart Callback (Line 317-339)
```javascript
// Tracks start position for content transform calculation
if (direction === 'left') {
  const newStartPositions = new Map();
  const startX = item.x * pixelsPerTick; // 200 * 2 = 400 pixels
  newStartPositions.set(item.id, startX);
  setResizeStartPositions(newStartPositions); // Stores 400
}
```

## Phase 2: Mouse Move (Dragging Right by 50 pixels)

### 2.1 Stage Mouse Move Event
```javascript
// useKonvaInteractions.handleMouseMove (Line 636-655)
// Mouse position: { x: 250, y: 150 }
if (isCurrentlyResizing) {
  updateResize({ x: 250, y: 150 });
}
```

### 2.2 updateResize Calculation (Line 435-483)
```javascript
// Delta calculation:
const deltaXPixels = 250 - 200 = 50 pixels
const deltaX = pixelsToLogical(50) = 50 / 2 = 25 ticks

// For left resize:
const originalItem = { x: 200, width: 400, ... }
const newWidth = 400 - 25 = 375 ticks
const widthDelta = 400 - 375 = 25 ticks
const newX = 200 + 25 = 225 ticks

// Updates map:
updates.set(instanceId, {
  start: 225,  // New x position in ticks
  width: 375,  // New width in ticks
  height: 60
})

// Triggers callback
onResizeMove(updates)
```

### 2.3 KonvaTimeline.onResizeMove (Line 341-370)
```javascript
// Updates preview state:
updates.forEach((dim, instanceId) => {
  if (dim.width !== undefined) {
    // 375 * 2 = 750 pixels
    newPreviewWidths.set(instanceId, 750);
  }
  if (dim.start !== undefined) {
    // 225 * 2 = 450 pixels
    newPreviewPositions.set(instanceId, 450);
    
    // Calculate content transform:
    const startX = resizeStartPositions.get(instanceId); // 400 pixels
    const deltaX = 450 - 400 = 50 pixels
    newContentTransforms.set(instanceId, -50); // Negative to shift content left
  }
})

setResizePreviewWidths(newPreviewWidths);
setResizePreviewPositions(newPreviewPositions);
setContentTransforms(newContentTransforms);
```

### 2.4 React Re-render with Preview

#### KonvaTimeline renders KonvaTrack with:
```javascript
{
  x: 450,              // Preview position in pixels
  width: 750,          // Preview width in pixels
  previewWidth: 750,   // Explicitly passed preview
  contentTransform: -50 // Shift content left by 50px
}
```

#### KonvaTrack Content Rendering (Line 141-148):
```javascript
// Base content offset from trim:
const baseOffset = -(0 / 400) * 800 = 0

// Combined with resize transform:
const contentOffset = 0 + (-50) = -50 pixels

// This shifts the content 50 pixels to the left within the track bounds,
// making it appear as if the left edge was trimmed while content stays in place
```

## Phase 3: Mouse Up (Finalizing Resize)

### 3.1 useKonvaInteractions.endResize (Line 486-529)
```javascript
// Uses stored updates from last updateResize:
const finalUpdates = lastResizeUpdatesRef.current
// Map { instanceId => { start: 225, width: 375, height: 60 } }

onResizeEnd(finalUpdates)
```

### 3.2 KonvaTimeline.onResizeEnd (Line 372-488)
For single instance resize:
```javascript
// Line 461-475: Left resize calculation
const positionDeltaTicks = 225 - 200 = 25 ticks
const deltaPixels = ticksToPixels(25, 120, [4,4]) = 50 pixels

// Calls handler with position delta:
onInstanceResizeEnd(trackId, instanceId, 50, 'left')
```

### 3.3 handleInstanceResizeEnd in tracksSlice (Line 1657-1701)
```javascript
// Current state:
const instance = {
  trim_start_ticks: 0,
  trim_end_ticks: 400,
  x_position: 200
}

// Calculations:
const deltaTicks = pixelsToTicks(50, 120, [4,4]) = 25
newPositionX = 200 + 25 = 225
newPositionX = Math.max(0, 225) = 225

// Adjust trim_start by position delta:
const actualPositionDelta = 225 - 200 = 25
newTrimStartTicks = 0 + 25 = 25

// Final values:
newTrimStartTicks = 25
newTrimEndTicks = 400 (unchanged)
newPositionX = 225
```

### 3.4 InstanceResize Action Creation
```javascript
new InstanceResize(
  get,
  trackId,
  instanceId,
  0,    // oldTrimStartTicks
  400,  // oldTrimEndTicks
  200,  // oldPositionX
  25,   // newTrimStartTicks
  400,  // newTrimEndTicks
  225   // newPositionX
)
```

### 3.5 History System Execution
The action is added to the history stack and executed:
```javascript
// InstanceResize.execute() updates the store:
updateTrackInstance(trackId, instanceId, {
  trim_start_ticks: 25,
  trim_end_ticks: 400,
  x_position: 225
})
```

### 3.6 State Cleanup in KonvaTimeline
```javascript
// Lines 394-398: Clear preview state
setResizePreviewWidths(new Map());
setResizePreviewPositions(new Map());
setContentTransforms(new Map());
setResizeStartPositions(new Map());
```

## Phase 4: Final Render

### 4.1 Store Update Triggers Re-render
The track instance now has:
- x_position: 225 ticks (112.5 pixels)
- trim_start_ticks: 25
- trim_end_ticks: 400
- Visible width: 375 ticks (187.5 pixels)

### 4.2 KonvaTrack Final Rendering
```javascript
// No more preview values, using actual data:
{
  x: 112.5,     // 225 ticks * 0.5 pixels/tick
  width: 187.5, // 375 ticks * 0.5 pixels/tick
  previewWidth: undefined,
  contentTransform: 0  // No transform needed
}

// Content offset calculation:
const trimRatio = 25 / 400 = 0.0625
const fullContentWidth = 400 * 0.5 = 200 pixels
const contentOffset = -(0.0625 * 200) = -12.5 pixels

// This permanently shifts content 12.5 pixels left,
// hiding the first 25 ticks of content
```

## Summary

The left resize operation maintains visual continuity through:

1. **During Resize**: A temporary `contentTransform` shifts content to counteract the position change, keeping content stationary relative to the timeline.

2. **After Resize**: The trim values are updated to permanently hide the trimmed content, and the temporary transform is removed.

3. **Visual Result**: The user sees the left edge of the track move right while the visible content remains in the same timeline position throughout the operation.

## Key State Transitions

| Phase | Position | Width | Trim Start | Content Transform | Visual Effect |
|-------|----------|-------|------------|-------------------|---------------|
| Initial | 200 ticks | 400 ticks | 0 | 0 | Normal display |
| During Resize | 225 ticks | 375 ticks | 0 | -50px | Content held in place |
| After Resize | 225 ticks | 375 ticks | 25 | 0 | Content permanently trimmed |

## History System Storage

The InstanceResize action stores:
- Track ID and Instance ID
- Old state: trim_start=0, trim_end=400, x_position=200
- New state: trim_start=25, trim_end=400, x_position=225

This allows perfect undo/redo of the resize operation.