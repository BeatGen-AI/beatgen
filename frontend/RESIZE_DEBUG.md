# Resize Debug Guide

## Issue
Custom resize handles are not working - tracks don't resize when dragging the handles.

## Debug Steps

### 1. Check if resize is starting
Look for console log: `[useKonvaInteractions] Starting resize:`
- If not appearing, the mouse down event isn't reaching the interaction system
- Check if `onResizeStart` is being called in KonvaTrack

### 2. Check if resize is updating
Look for console log: `[useKonvaInteractions] Resize update:`
- If not appearing, mouse move events aren't being captured during resize
- Check if the stage event listeners are properly set up

### 3. Check if preview width is updating
In KonvaTimeline, check if `resizePreviewWidths` state is being updated
- Add console.log in `onResizeMove` callback
- Verify the width calculations are correct

### 4. Check if preview width is passed to track
Verify that `previewWidth` prop is being passed to KonvaTrack
- Should see the track width change during resize

## Potential Issues

1. **Event propagation**: The resize handle mouseDown might be bubbling up
2. **Stage event listeners**: The interaction system might not be capturing mouse move
3. **Width calculation**: The logical to pixel conversion might be incorrect
4. **State updates**: The preview widths might not be triggering re-renders

## Test Procedure
1. Open the Konva timeline
2. Add or select a track
3. Hover over the left or right edge - cursor should change
4. Click and drag - track should resize with preview
5. Release - track should update to new size