# Group Drag Fix for Konva Timeline

## Problem
When multiple tracks are selected and dragged, only the primary track moves. Other selected tracks don't move together.

## Root Cause
The issue was that KonvaTrack components had `draggable={true}` which used Konva's built-in drag behavior. This bypassed the unified interaction system that handles group operations.

## Solution

### 1. Disable Konva's Built-in Dragging (KonvaTrack.tsx)
```typescript
// Changed from:
draggable={true}

// To:
draggable={false}  // Let the interaction system handle dragging
```

### 2. Add Mouse Down Handler (KonvaTrack.tsx)
Added `onMouseDown` prop to start drag via the interaction system:
```typescript
onMouseDown={(e) => {
  // Don't start drag if clicking on transformer handles
  if (e.target.parent?.className === 'Transformer') {
    return;
  }
  
  e.cancelBubble = true;
  if (onMouseDown) {
    onMouseDown(track.id, e);
  }
}}
```

### 3. Connect to Interaction System (KonvaTimeline.tsx)
Added handler to start drag through the interaction system:
```typescript
onMouseDown={(id, e) => {
  // Start drag via interaction system
  const stage = e.target.getStage();
  const pos = stage?.getPointerPosition();
  if (pos && interaction.startDrag) {
    interaction.startDrag(id, pos);
  }
}}
```

### 4. Use Actual Track Positions
Updated to use track's `y_position` field instead of calculating from index:
```typescript
// In konvaItems:
y: track.y_position !== null && track.y_position !== undefined 
  ? track.y_position 
  : index * GRID_CONSTANTS.trackHeight

// When rendering tracks:
const trackY = track.y_position !== null && track.y_position !== undefined 
  ? track.y_position 
  : index * GRID_CONSTANTS.trackHeight;
```

## How It Works
1. User clicks on a track (selected or part of selection)
2. Mouse down event triggers `interaction.startDrag` which:
   - Stores initial positions of ALL selected tracks
   - Sets up drag state
3. Mouse move updates positions of ALL selected tracks via `onDragMove`
4. Parent component updates track positions in state
5. Tracks re-render at new positions
6. Mouse up finalizes positions via `onDragEnd`

## Testing
1. Select multiple tracks (Shift+click or selection rectangle)
2. Drag any selected track
3. All selected tracks should move together
4. Vertical movement should snap to track height grid
5. Horizontal movement should respect grid snap settings