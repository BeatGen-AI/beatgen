# Timeline Track Group Operations Implementation Plan

## Overview
Implement copy/paste, group resizing, and group moving functionality for timeline tracks, similar to FL Studio's piano roll functionality.

## Implementation Phases

### Phase 1: Extend Interaction Manager with Clipboard Operations
- [x] Add ClipboardState interface to `src/studio/shared/interactions/types.ts`
- [x] Add ResizeState interface to `src/studio/shared/interactions/types.ts`
- [x] Extend useInteractionManager in `src/studio/shared/interactions/useInteractionManager.ts` with:
  - [x] Clipboard state management (copied items, operation type)
  - [x] Keyboard event handlers for shortcuts
  - [x] Copy method (`copyItems`)
  - [x] Cut method (`cutItems`)
  - [x] Paste method (`pasteItems`)
  - [x] Delete method (`deleteItems`)
  - [x] Duplicate method (`duplicateItems`)
  - [ ] Group resize functionality with direction handling

### Phase 2: Enhance Track Operations in Store
- [x] Add track duplication methods to `src/studio/stores/slices/tracksSlice.ts`:
  - [x] `duplicateTrack(trackId: string): CombinedTrack`
  - [x] `duplicateMultipleTracks(trackIds: string[]): CombinedTrack[]`
  - [x] `deleteMultipleTracks(trackIds: string[]): void`
  - [x] `resizeMultipleTracks(trackIds: string[], widthDelta: number, anchor: 'left' | 'right'): void`
- [x] Add clipboard operations for tracks with proper ID generation
- [x] Integrate with existing history system for undo/redo support

### Phase 3: Timeline Component Enhancements
- [x] Add keyboard event listeners to `src/studio/components/timeline/Timeline.tsx`
- [x] Connect keyboard shortcuts to interaction manager actions
- [x] Add visual feedback for copy/paste operations
- [x] Implement group drag operations for multiple selected tracks
- [x] Add paste position calculation (mouse position or end of timeline)
- [x] Update Timeline props to support new operations

### Phase 4: Track Resizing Implementation
- [ ] Add resize handles to `src/studio/components/track/base/BaseTrackPreview.tsx` when selected
- [ ] Implement resize logic similar to piano roll notes
- [ ] Add visual feedback during resize operations
- [ ] Ensure proper snapping to grid during resize
- [ ] Add resize utilities to `src/studio/shared/interactions/selectionUtils.ts`

### Phase 5: Integration and Polish
- [ ] Update `src/studio/Studio.tsx` to connect new operations to timeline
- [ ] Add keyboard shortcut tooltips and help text
- [ ] Test all operations with multiple track types (audio, MIDI, drum, sampler)
- [ ] Ensure proper focus management for keyboard events
- [ ] Add visual indicators for clipboard operations
- [ ] Test undo/redo functionality with group operations

## Expected Keyboard Shortcuts
- **Ctrl+C**: Copy selected tracks to clipboard
- **Ctrl+V**: Paste tracks from clipboard at cursor position or end of timeline
- **Ctrl+X**: Cut selected tracks (copy + delete)
- **Delete**: Delete selected tracks
- **Ctrl+D**: Duplicate selected tracks in place

## Expected Group Operations
- **Group Drag**: Move multiple selected tracks together while maintaining relative positions
- **Group Resize**: Resize multiple selected tracks proportionally with left/right handles
- **Visual Feedback**: Selection indicators, resize handles, and operation feedback

## Files to Modify
1. `src/studio/shared/interactions/types.ts`
2. `src/studio/shared/interactions/useInteractionManager.ts`
3. `src/studio/shared/interactions/selectionUtils.ts`
4. `src/studio/stores/slices/tracksSlice.ts`
5. `src/studio/components/timeline/Timeline.tsx`
6. `src/studio/components/track/base/BaseTrackPreview.tsx`
7. `src/studio/Studio.tsx`

## Architecture Notes
- Reuse existing interaction system patterns
- Maintain consistency with piano roll group operations
- Integrate with existing history/undo system
- Preserve current audio engine and state management
- Follow existing code style and TypeScript patterns

## Success Criteria
- [ ] All keyboard shortcuts work as expected
- [ ] Group operations maintain track relationships
- [ ] Visual feedback is clear and responsive
- [ ] Undo/redo works with all new operations
- [ ] No regression in existing functionality
- [ ] Performance remains smooth with multiple tracks