# Resize Snap-Back Fix

## The Problem
When resizing instances, they would snap back to their original position/size after release. This was because:
1. We were using a preview system (like drag preview) for resize
2. The resize actions weren't properly updating the instance state during resize
3. History actions were being created with incorrect deltas

## The Solution

### 1. Update Instances During Resize (Like Drag)
Changed `onResizeMove` to update instances directly instead of using preview:
```typescript
onResizeMove: (updates) => {
  // Update instance directly during resize (no history)
  updateTrackInstance(trackId, instanceId, {
    x: newX,
    trim_start_ticks: newTrimStart,
    trim_end_ticks: newTrimEnd
  });
}
```

### 2. Track Original State for History
Added `resizeStartState` ref to store original values:
```typescript
onResizeStart: (item, direction) => {
  resizeStartState.current.set(item.id, {
    x: instance.x,
    trim_start_ticks: instance.trim_start_ticks,
    trim_end_ticks: instance.trim_end_ticks
  });
}
```

### 3. Create History on Resize End
Use original and current state to create proper history:
```typescript
onResizeEnd: (updates) => {
  const action = new Actions.InstanceResize(
    get,
    trackId,
    instanceId,
    originalState.trim_start_ticks,
    originalState.trim_end_ticks,
    originalState.x,
    currentInstance.trim_start_ticks,
    currentInstance.trim_end_ticks,
    currentInstance.x
  );
  executeHistoryAction(action);
}
```

### 4. Remove Preview System
- Removed resize preview positions/widths from konvaItems calculation
- Always use actual instance state for rendering

## How It Works
1. **Resize Start**: Store original instance state
2. **During Resize**: Update instance directly (visual feedback)
3. **Resize End**: Create history action with original → new state
4. **Rendering**: Always uses actual instance state, no preview

## Result
✅ No more snap-back on resize
✅ Live visual feedback during resize
✅ Proper history for undo/redo
✅ Both left and right resize work correctly