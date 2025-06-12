# Group Drag Debugging Guide

## How to Test Group Dragging

1. **Open Browser Console** (F12 or right-click → Inspect → Console)

2. **Select Multiple Tracks**
   - Hold Shift and click multiple tracks OR
   - Use rectangle selection to select multiple tracks
   - You should see blue outlines around selected tracks

3. **Try to Drag One of the Selected Tracks**
   - Click and drag any selected track
   - Watch the console for these messages:

## Expected Console Output

When you start dragging a selected track, you should see:

```
[BaseTrackPreview] handleMouseDown called for track: <trackId>
[BaseTrackPreview] Select tool detected
[BaseTrackPreview] Calling onTrackClick for selection
[BaseTrackPreview] Starting interaction manager drag process
[BaseTrackPreview] Calling interaction.startDrag
[Timeline] onDragStart called: { itemId: <trackId>, selectedIds: [<id1>, <id2>, ...] }
[Timeline] Tracks to move: [<id1>, <id2>, ...]
[Timeline] Initial positions stored: { <id1>: {x: ..., y: ...}, <id2>: {x: ..., y: ...} }
```

When you move the mouse while dragging:

```
[Timeline] onDragMove called: { itemId: <trackId>, delta: {x: ..., y: ...}, ... }
[Timeline] Drag mode: { isGroupDrag: true, deltaTicks: ..., deltaPixels: ... }
[Timeline] Moving track in group: { trackId: <id1>, initialX: ..., newX: ... }
[Timeline] Moving track in group: { trackId: <id2>, initialX: ..., newX: ... }
```

## What to Look For

1. **Are the Timeline callbacks being triggered?**
   - If you see `[BaseTrackPreview] Calling interaction.startDrag` but NO `[Timeline] onDragStart`, the interaction manager connection is broken

2. **Are initial positions being stored?**
   - Check if `[Timeline] Initial positions stored` shows all selected track IDs

3. **Is group drag being detected?**
   - Look for `isGroupDrag: true` in the drag move logs

4. **Are all selected tracks being moved?**
   - You should see "Moving track in group" for EACH selected track

## Common Issues

- **No Timeline callbacks**: The interaction manager isn't connected properly
- **Empty selectedIds**: The selection state isn't being maintained
- **isGroupDrag: false**: The selection check is failing
- **No initial positions**: The groupDragState isn't being updated properly

## FIXED: Selection State Sync Issue

The issue was that `interaction.selectionState.selectedIds` was empty even though tracks were selected. We've fixed this by:

1. **Syncing selectedTrackIds with interaction manager** - Added useEffect to sync the parent's selectedTrackIds with the interaction manager
2. **Using groupDragState.initialPositions for group detection** - Instead of relying on interaction.selectionState.selectedIds, we now use the number of tracks in groupDragState.initialPositions to determine if it's a group drag

Now `isGroupDrag` should be `true` when multiple tracks are selected and dragged together!