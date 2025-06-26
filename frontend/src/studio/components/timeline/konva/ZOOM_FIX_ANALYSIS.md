# KonvaTimeline Zoom Calculation Fix

## Issue Summary
The timeline wasn't scrollable at 1.0x zoom because of double multiplication of the zoom factor in width calculations.

## Root Cause
1. `totalTimelineWidth` was calculated with zoom included: `measureCount * GRID_CONSTANTS.measureWidth * internalZoom`
2. CSS width styles were then multiplying by zoom AGAIN: `width: totalTimelineWidth * internalZoom`
3. This created incorrect dimensions at all zoom levels, but only broke scrolling at 1.0x

## Why it broke at 1.0x zoom specifically:
- At 1.0x: totalTimelineWidth = 2000px, CSS width = 2000px × 1 = 2000px (no overflow)
- At 2.0x: totalTimelineWidth = 4000px, CSS width = 4000px × 2 = 8000px (creates overflow, enabling scroll)

## Fixes Applied

### 1. Fixed TimeRuler container width (line 695)
```diff
- width: totalTimelineWidth * internalZoom,
+ width: totalTimelineWidth,
```

### 2. Fixed TimeRuler component props (line 706, 713)
```diff
- width={totalTimelineWidth * internalZoom}
+ width={totalTimelineWidth}
- viewport={{ x: 0, y: 0, width: totalTimelineWidth * internalZoom, height: GRID_CONSTANTS.headerHeight }}
+ viewport={{ x: 0, y: 0, width: totalTimelineWidth, height: GRID_CONSTANTS.headerHeight }}
```

### 3. Fixed main Stage CSS width (line 730)
```diff
- width: totalTimelineWidth * internalZoom,
+ width: totalTimelineWidth,
```

### 4. Fixed background Rect width (line 739)
```diff
- width={totalTimelineWidth / internalZoom}
+ width={totalTimelineWidth}
```

## Remaining Issues to Check
The grid lines calculations still multiply by zoom, which might need adjustment depending on how the coordinate system works. Lines 749, 763, 777, 779 all include zoom calculations that may need review.

## Testing Recommendations
1. Test scrolling at 1.0x zoom - should now work correctly
2. Test scrolling at other zoom levels (0.5x, 2.0x, etc.) - should still work
3. Verify grid lines align correctly with content at all zoom levels
4. Check that mouse interactions (clicking, dragging) work correctly with the new dimensions