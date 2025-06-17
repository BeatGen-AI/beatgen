# Instance Drag Debug - Investigation Results

## Current Status
After adding extensive logging, we've identified that:

1. **State Updates Are Working**: The instance positions ARE being updated correctly in the state
2. **History Actions Execute**: The InstanceMove action executes and updates the position
3. **Konva Items Rebuild**: The konvaItems array is recalculated with the new positions

## The Real Issue
The problem appears to be a **race condition** or **React rendering issue** where:
- The drag preview is cleared
- The state is updated
- But the visual elements snap back

## Evidence from Logs
1. `handleInstancePositionChange` receives correct positions
2. `updateTrackInstance` updates the state correctly
3. `InstanceMove.execute()` runs and verifies the update
4. `konvaItems` recalculates with the new position

## Next Steps to Try

### 1. Force Re-render After State Update
Add a key to the Stage component that changes when instances update:
```tsx
<Stage key={`stage-${JSON.stringify(tracks.map(t => t.instance_metadata))}`}>
```

### 2. Use React's flushSync
Force synchronous state updates:
```tsx
import { flushSync } from 'react-dom';
// In handleInstancePositionChange
flushSync(() => {
  updateTrackInstance(trackId, instanceId, { x: newX, y: newY });
});
```

### 3. Check Konva Node Updates
The Konva nodes might be caching old positions. Try:
```tsx
// After state update
stage.batchDraw();
```

### 4. Verify No Other Code Is Resetting Position
Search for any other code that might be:
- Calling `updateTrackInstance` with old positions
- Resetting instance positions on some event
- Having side effects that revert positions

## Current Working Theory
The issue is likely that:
1. The preview position is being used for display
2. When preview clears, it reverts to the "old" position briefly
3. Even though state has updated, React hasn't re-rendered yet
4. This creates a visual "snap back" effect

## Solution Approach
The fix will likely involve:
1. Ensuring React re-renders after state update
2. Properly synchronizing preview clear with state update
3. Possibly using a different approach for drag preview