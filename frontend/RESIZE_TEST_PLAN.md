# Timeline Track Resize Test Plan

## Test Setup
1. Open the app at https://localhost:5173
2. Add at least 3-4 tracks to the timeline
3. Ensure the toolbar is visible at the top of the timeline

## Test Cases

### 1. Verify Grid Menu Visibility
- [ ] Toolbar is visible at top of timeline
- [ ] Grid icon button is present
- [ ] Clicking grid icon opens dropdown menu
- [ ] Menu shows all options: None, 1/6 step, 1/4 step, 1/3 step, 1/2 step, Step, 1/6 beat, 1/4 beat, 1/3 beat, 1/2 beat, Beat, Bar
- [ ] Current selection is marked with checkmark

### 2. Individual Track Resize with Snap
- [ ] Set grid to "Step" (default)
- [ ] Resize single track from right edge
  - Should snap to grid during drag
  - Check console for "Using actualSnapSize" message
- [ ] Resize single track from left edge
  - Should snap both position and width
  - Track content should stay in place
- [ ] Change grid to "Beat"
  - Resize should snap to larger increments
- [ ] Set grid to "None"
  - Resize should be smooth without snapping

### 3. Group Track Resize
- [ ] Select multiple tracks (Shift+click or rectangle select)
- [ ] All selected tracks show blue outline
- [ ] Resize any selected track from right edge
  - All selected tracks should resize together
  - Should maintain relative sizes
  - Should snap to grid
- [ ] Resize from left edge
  - All tracks should move and resize together
  - Content should stay in relative position

### 4. Grid Snap Size Changes
- [ ] With tracks selected, change grid size during resize
- [ ] Try each grid option:
  - None: No snapping
  - 1/6 step: Very fine snapping
  - Step: Default snapping
  - Beat: Larger snapping
  - Bar: Snap to full measures

### 5. Edge Cases
- [ ] Try to resize track smaller than minimum width
- [ ] Resize track at beginning of timeline (x=0)
- [ ] Resize track at end of visible timeline
- [ ] Undo/redo resize operations (Ctrl+Z/Ctrl+Y)

## Expected Console Output
When resizing, you should see:
- `[BaseTrackPreview] Using actualSnapSize for resize: <number>`
- `[BaseTrackPreview] snapResize: { value, gridSize, snapped, result }`
- `[Timeline] onResizeMove called:` with delta values

## Known Issues to Fix
1. If grid menu is not visible, check showToolbar prop
2. If snapping isn't working during drag, verify actualSnapSize is passed
3. If group resize isn't smooth, check the resize delta propagation