# Custom Resize Handles Implementation

## Problem
Konva's Transformer component stretches the track content when resizing, which looks bad for audio/MIDI tracks. We need resize that changes the track bounds without scaling the content.

## Solution
Replaced Konva Transformer with custom resize handles that:
1. Change track width without scaling content
2. Provide visual feedback during resize
3. Support grid snapping
4. Show preview during drag

## Implementation Details

### 1. Removed Konva Transformer (KonvaTrack.tsx)
- Removed `import { Transformer }` 
- Removed transformer ref and attachment logic
- Removed transformer component

### 2. Added Custom Resize Handles (KonvaTrack.tsx)
```typescript
// State for hover and preview
const [isResizingLeft, setIsResizingLeft] = useState(false);
const [isResizingRight, setIsResizingRight] = useState(false);
const [previewWidth, setPreviewWidth] = useState<number | null>(null);

// Left and right resize handle rects with:
- Hover effects (cursor change, fill color)
- Mouse down to start resize via interaction system
- Visual feedback (stroke, opacity changes)
```

### 3. Visual Feedback
- Preview outline during resize (dashed border)
- Width display text showing current size
- Background and content adjust to preview width
- Handles highlight on hover

### 4. Resize Logic (useKonvaInteractions.ts)
- Left resize: Reduces width from start (trim effect)
- Right resize: Extends width from end
- Both maintain track position (no movement)
- Grid snapping applied to width changes

### 5. Key Features
- No content stretching - uses clipping instead
- Real-time preview during drag
- Grid-snapped resize
- Visual indicators for resize state
- Works with group selection

## Benefits
1. **Better UX**: Content doesn't stretch/distort
2. **Precise Control**: See exact pixel width during resize
3. **Consistent Behavior**: Same resize behavior for all track types
4. **Visual Clarity**: Clear hover states and resize preview

## Testing
1. Hover over track edges - cursor changes to resize
2. Drag left edge - track width reduces (trim from start)
3. Drag right edge - track width extends
4. Grid snapping works during resize
5. Preview shows during drag
6. Content is clipped, not stretched