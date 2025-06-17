# Instance Drag Fix

## The Problem
Instances (clips) were snapping back to their original position after dragging because:
1. The position updates during drag weren't being applied
2. The connection between UI and store handlers was broken

## The Solution

### 1. Fixed onDragMove Handler
Added instance position updates during drag for live preview:
```typescript
if (!isTrackMoveMode) {
  // Update instance position during drag (no history)
  onInstancePositionChange?.(trackId, instanceIdStr, { x: pos.x, y: pos.y }, false);
}
```

### 2. Fixed onDragEnd Handler  
Simplified to just call the position handler with isDragEnd=true:
```typescript
// Call position change with isDragEnd=true to create history
onInstancePositionChange?.(trackId, instanceIdStr, { x: pos.x, y: pos.y }, true);
```

### 3. Connected Proper Handler
Changed from custom handler to the store's `handleInstancePositionChange`:
```typescript
onInstancePositionChange={handleInstancePositionChange}
```

## How It Works

### During Drag (isDragEnd=false):
1. Updates instance position in state for live preview
2. Updates audio engine position
3. No history created

### On Drag End (isDragEnd=true):
1. Creates `InstanceMove` action with old and new positions
2. Executes through history manager
3. Updates final position

## Result
- ✅ Instances update position during drag (live preview)
- ✅ Final position is saved on drag end
- ✅ History action created for undo/redo
- ✅ No more snapping back to original position

## Two Modes Working Correctly

### Track Mode (sidebar selection):
- Drags entire tracks
- Uses `updateMultipleTrackPositions`
- Creates `TrackPosition` history

### Instance Mode (default):
- Drags individual instances
- Uses `handleInstancePositionChange`
- Creates `InstanceMove` history

Both modes now properly update positions and create appropriate history for undo/redo.