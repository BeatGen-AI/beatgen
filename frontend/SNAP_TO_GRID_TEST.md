# Snap to Grid Test

## What was fixed:

1. **Changed Math.round to Math.floor in useInteractionManager**
   - Piano roll uses Math.floor for snapping, so we updated the interaction manager to match
   - This ensures consistent snapping behavior between piano roll and timeline

2. **Added configurable grid snap size to Timeline**
   - Added gridSnapSize state (default: 5 = "Step")
   - Added gridSnapEnabled state (default: true)
   - Calculate actualSnapSize using getSnapSizeInPixels from piano roll
   - Pass actualSnapSize to interaction manager as gridSize

3. **Update grid size dynamically**
   - Added useEffect to update interaction manager's grid size when snap size changes
   - This ensures the interaction manager always uses the correct snap size

## How to test:

1. Open the timeline with multiple tracks
2. Select multiple tracks (Shift+click or rectangle selection)
3. Drag one of the selected tracks
4. The tracks should:
   - Move together as a group ✓ (already working)
   - Snap to grid positions using Math.floor (like piano roll)
   - Respect the grid snap size setting

## Expected behavior:

- When dragging, tracks should snap to grid positions
- The snapping should feel the same as dragging notes in the piano roll
- Grid snap size should be configurable (though UI for this isn't exposed yet)

## Console logs to watch for:

```
[Timeline] Drag mode: { 
  isGroupDrag: true, 
  deltaTicks: ..., 
  deltaPixels: ...,
  tracksInGroup: [...],
  itemId: ...,
  snapSize: ... // Should show the calculated snap size
}
```