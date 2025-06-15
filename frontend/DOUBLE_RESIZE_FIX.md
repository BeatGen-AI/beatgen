# Double Resize Fix

## Problem
Tracks were jumping to incorrect positions because resize was being executed twice:
1. First resize moved tracks to correct position (e.g., x:2880)
2. Second resize applied the same delta again, doubling the position (e.g., x:5760)

## Root Cause
Studio.tsx was handling group resize in two ways:
1. Timeline's interaction manager was calling `onTrackResizeEnd` for each track in the group
2. Studio's `handleTrackResize` was also calling `resizeMultipleTracks` for the same group

This caused:
- Timeline → onTrackResizeEnd → handleTrackResizeEnd (for each track)
- Studio → resizeMultipleTracks → GroupTrackResize action

Both paths were creating and executing resize actions, resulting in double application.

## Solution
Removed the duplicate group resize handling in Studio.tsx. Now:
- Timeline's interaction manager handles all group resize logic internally
- Studio.tsx just passes through to the single track handler
- No more checking for group operations in Studio's handleTrackResize

## Code Change
In Studio.tsx, simplified handleTrackResize:
```typescript
// Before: Was checking for group and calling resizeMultipleTracks
const handleTrackResize = useCallback((trackId: string, deltaPixels: number, direction: 'left' | 'right') => {
  // Timeline's interaction manager handles group resize internally
  // We just need to pass through to the single track handler
  console.log('Track resize:', trackId, 'delta:', deltaPixels, 'direction:', direction);
  handleTrackResizeEnd(trackId, deltaPixels, direction);
}, [handleTrackResizeEnd]);
```

## Result
- Single execution of resize operations
- Tracks stay at the position shown during drag
- No more jumping or doubling of positions