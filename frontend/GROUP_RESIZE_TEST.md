# Group Resize Test Plan

## Test Steps

### 1. Basic Single Track Resize
1. Create a new project with at least 2 tracks
2. Select a single track
3. Hover over the left edge - verify resize handle appears
4. Drag the left edge - verify track resizes from left
5. Hover over the right edge - verify resize handle appears  
6. Drag the right edge - verify track resizes from right
7. Verify minimum width constraint is respected

### 2. Group Resize - Right Edge
1. Select multiple tracks (Shift+Click or Ctrl+Click)
2. Hover over the right edge of any selected track
3. Verify all selected tracks show resize handles with visual feedback
4. Drag the right edge
5. Verify all selected tracks resize together by the same amount
6. Verify grid snapping works correctly

### 3. Group Resize - Left Edge
1. Select multiple tracks
2. Hover over the left edge of any selected track
3. Drag the left edge
4. Verify all selected tracks:
   - Resize from the left by the same amount
   - Move their position to maintain the right edge
   - Content stays visually stable
5. Verify grid snapping works correctly

### 4. Edge Cases
1. Test with tracks of different widths
2. Test when one track hits minimum width
3. Test undo/redo after group resize
4. Test with mix of track types (MIDI, Audio, Drum)

## Expected Behavior

- **Visual Feedback**: 
  - Selected tracks show blue outline
  - Resize handles visible on all selected tracks
  - Primary resize track has stronger visual indicator
  - Handles have hover state

- **Resize Logic**:
  - All tracks resize by the same pixel amount
  - Grid snapping applies to the primary track
  - Other tracks follow with the same delta
  - Minimum width respected for all tracks

- **State Updates**:
  - Trim values update correctly
  - Position updates for left resize
  - History/undo system captures the group operation

## Console Logs to Check

Look for these console logs during testing:
- `[BaseTrackPreview] handleResizeMouseDown` - When starting resize
- `[Timeline] onResizeStart` - When group resize begins
- `[Timeline] onResizeMove` - During resize drag
- `[Timeline] onResizeEnd` - When resize completes
- `[Timeline] Group resize final delta` - Final resize amount

## Success Criteria

✅ Single track resize still works as before
✅ Multiple selected tracks resize together
✅ Visual feedback shows which tracks are being resized
✅ Grid snapping works correctly
✅ Minimum width constraints respected
✅ Undo/redo works with group resize
✅ No visual glitches or jumps during resize