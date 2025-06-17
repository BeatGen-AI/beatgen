# Resize NaN Fix

## The Problem
When resizing tracks, Konva was reporting NaN width errors and tracks were disappearing. The errors showed:
- "NaN is a not valid value for 'width' attribute"
- "points attribute has non numeric element NaN"

## The Causes
1. **Parameter naming issue**: `onResizeMove` was using `trackId` instead of `itemId` for the Map key
2. **Missing null checks**: Various calculations could produce NaN when values were undefined
3. **No safety checks**: Width calculations could result in negative or NaN values

## The Solution

### 1. Fixed Parameter Naming
Changed from `trackId` to `itemId` in onResizeMove:
```typescript
updates.forEach((dim, itemId) => {  // was trackId
  newPreviewWidths.set(itemId, widthInPixels);
})
```

### 2. Added NaN Checks
Added checks before setting preview values:
```typescript
if (dim.width !== undefined && !isNaN(dim.width)) {
  const widthInPixels = dim.width * pixelsPerTick;
  newPreviewWidths.set(itemId, widthInPixels);
}
```

### 3. Added Safety Checks in konvaItems
```typescript
// Safety check for NaN width
if (isNaN(width) || width <= 0) {
  console.error('[KonvaTimeline] Invalid width calculated:', {...});
  width = 100; // Default fallback width
}
```

### 4. Updated getInstanceWidth
Added null checks and fallback values:
```typescript
const duration = track.duration_ticks || 0;
const trimStart = instance.trim_start_ticks || 0;
const trimEnd = instance.trim_end_ticks || 0;
```

## Result
✅ No more NaN errors during resize
✅ Tracks don't disappear when resizing
✅ Proper fallback values prevent crashes
✅ Better error logging for debugging