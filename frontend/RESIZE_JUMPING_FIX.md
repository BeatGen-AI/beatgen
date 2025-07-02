# Track Resize Jumping Fix

## Problem
When resizing tracks (both single and group), they would jump to a different size when releasing the mouse. The track would become smaller or larger than what was shown during the drag.

## Root Cause
The issue was caused by conflicting resize logic between individual and group resize handling in BaseTrackPreview:
1. `lastResizeDataRef` was being updated by both individual resize logic AND the group resize effect
2. When resizing as part of a group, BaseTrackPreview was still using its individual resize end logic
3. This caused the resize to be handled twice with potentially different values

## Solution
Added clear separation between individual and group resize modes using an `isInteractionManaged` flag:

### Changes Made

#### 1. BaseTrackPreview.tsx
- Added `isInteractionManaged` state to track when resize is managed by the interaction manager
- Set `isInteractionManaged = true` when starting a group resize through interaction manager
- Skip updating `lastResizeDataRef` during mouse move when `isInteractionManaged = true`
- Skip individual resize end logic when `isInteractionManaged = true`
- Don't update `lastResizeDataRef` in the group resize effect
- Reset `isInteractionManaged` flag when group resize ends

#### 2. Timeline.tsx
- Cleaned up the single track resize case - it now does nothing (as intended)
- BaseTrackPreview handles single track resize entirely

## How It Works Now

### Single Track Resize:
1. User starts resize on a single selected track
2. BaseTrackPreview handles everything internally
3. Updates `lastResizeDataRef` during drag
4. Calls `onResizeEnd` when mouse is released

### Group Track Resize:
1. User starts resize on a track that's part of a multi-selection
2. BaseTrackPreview detects this and sets `isInteractionManaged = true`
3. Interaction manager handles the resize through Timeline
4. BaseTrackPreview receives resize deltas via props but doesn't update `lastResizeDataRef`
5. Timeline calls `onResizeEnd` for all tracks in the group
6. BaseTrackPreview skips its individual resize end logic

## Result
- No more double-handling of resize operations
- Tracks stay at the size shown during drag
- Clear separation between individual and group resize logic
- No conflicting state updates