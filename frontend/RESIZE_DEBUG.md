# Resize Debug Notes

## Current State Analysis

### What's Implemented:
1. **Grid Menu**: Already exists in InteractionToolbar with all snap options
2. **Snap Logic**: Exists in both interaction manager and BaseTrackPreview
3. **Group Resize**: Timeline tracks resize delta changes and passes to tracks

### Issues Found:
1. **DOM Manipulation**: Timeline was directly manipulating DOM instead of using React state
2. **Two Code Paths**: Resize has two paths - interaction manager (group) and fallback (individual)
3. **Possible Snap Issue**: Need to verify actualSnapSize is being used correctly

### Changes Made:
1. Added resize delta state to Timeline
2. Modified onResizeMove to store delta in state instead of DOM manipulation
3. Added props to pass resize delta through Track -> TrackFactory -> BaseTrackPreview
4. Added effect in BaseTrackPreview to handle resize delta from props

### To Test:
1. Check if toolbar with grid menu is visible
2. Test if changing grid size affects resize snapping
3. Verify resize snaps during drag (not just on release)
4. Test both individual and group resize

### Potential Issues:
- The fallback resize path might not be using actualSnapSize correctly
- Need to ensure both resize paths use consistent snapping