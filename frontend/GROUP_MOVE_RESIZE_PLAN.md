# Group Moving and Resizing Implementation Plan

## Overview
Implement group moving and resizing functionality for timeline tracks, similar to FL Studio's piano roll group operations. This allows users to move and resize multiple selected tracks simultaneously while maintaining their relative positions and proportions.

## Implementation Phases

### Phase 1: Group Moving Implementation
- [x] Enhance Timeline drag handlers to support group operations
  - [x] Store initial positions of all selected tracks on drag start
  - [x] Update Timeline `onDragMove` to apply delta to all selected tracks
  - [x] Modify `onDragEnd` to batch update all selected tracks
- [x] Add group position update methods to `src/studio/stores/slices/tracksSlice.ts`
  - [x] `updateMultipleTrackPositions(trackIds: string[], deltaX: number, deltaY: number): void`
  - [x] Maintain relative positioning between tracks
  - [x] Integrate with history system for undo/redo
- [x] Update Studio component to handle group position changes
  - [x] Add callback handlers for group position updates
  - [x] Connect Timeline to new group position methods
- [ ] Test group moving functionality
  - [ ] Multiple track selection and group drag
  - [ ] Relative positioning maintenance
  - [ ] Grid snapping with group operations

### Phase 2: Group Resizing - Interaction Manager Extension
- [ ] Add resize state management to `src/studio/shared/interactions/useInteractionManager.ts`
  - [ ] Extend ResizeState interface with group resize support
  - [ ] Add resize operation callbacks to UseInteractionManagerOptions
  - [ ] Implement resize state tracking (resizing item, direction, initial dimensions)
- [ ] Implement group resize methods
  - [ ] `startGroupResize(itemId: string, direction: 'left' | 'right', initialDimensions: Record<string, {x: number, width: number}>): void`
  - [ ] `updateGroupResize(delta: {x: number}): void`
  - [ ] `endGroupResize(): void`
- [ ] Add resize direction and anchor point support
  - [ ] Support left-edge resize (move start position, adjust width)
  - [ ] Support right-edge resize (adjust width only)
  - [ ] Handle group resize calculations
- [ ] Add visual feedback state for group resize operations
  - [ ] Resize preview state
  - [ ] Visual indicators for affected tracks

### Phase 3: Group Resizing - UI Implementation
- [ ] Modify `src/studio/components/track/base/BaseTrackPreview.tsx` for group resize
  - [ ] Show resize handles when track is part of multi-selection
  - [ ] Add visual indicators for group resize operations
  - [ ] Implement resize event handlers for groups
  - [ ] Add resize handle styling for group operations
- [ ] Enhance resize visual feedback
  - [ ] Highlight all tracks being resized
  - [ ] Show resize preview for entire group
  - [ ] Display resize delta information
- [ ] Add resize callbacks to Timeline component props
  - [ ] `onGroupResizeStart?: (trackIds: string[], direction: 'left' | 'right') => void`
  - [ ] `onGroupResizeMove?: (trackIds: string[], delta: {x: number}, direction: 'left' | 'right') => void`
  - [ ] `onGroupResizeEnd?: (trackIds: string[]) => void`
- [ ] Connect resize operations to interaction manager
  - [ ] Wire resize handlers to interaction manager methods
  - [ ] Handle resize state transitions

### Phase 4: Store Integration for Group Resize
- [ ] Add group resize methods to `src/studio/stores/slices/tracksSlice.ts`
  - [ ] `resizeMultipleTracksAbsolute(trackIds: string[], widthDelta: number, anchor: 'left' | 'right'): void`
  - [ ] `resizeMultipleTracksProportional(trackIds: string[], scaleFactor: number): void`
  - [ ] Handle different resize modes (absolute vs proportional)
- [ ] Implement resize anchor support
  - [ ] Left anchor resizing (adjust x_position and duration_ticks)
  - [ ] Right anchor resizing (adjust duration_ticks only)
  - [ ] Maintain minimum track durations
- [ ] Integrate with history system
  - [ ] Create resize actions for undo/redo
  - [ ] Batch resize operations for atomic undo
  - [ ] Store initial and final states
- [ ] Handle edge cases
  - [ ] Prevent negative durations
  - [ ] Handle grid snapping during resize
  - [ ] Maintain track relationships

### Phase 5: Testing and Polish
- [ ] Test group moving with various scenarios
  - [ ] Different track types (MIDI, Audio, Drum, Sampler)
  - [ ] Multiple selection sizes (2, 5, 10+ tracks)
  - [ ] Edge positions (start/end of timeline)
  - [ ] Grid snapping enabled/disabled
- [ ] Test group resizing with different configurations
  - [ ] Left vs right anchor points
  - [ ] Different resize amounts
  - [ ] Mixed track types in selection
  - [ ] Minimum duration constraints
- [ ] Verify undo/redo functionality
  - [ ] Group move operations are undoable
  - [ ] Group resize operations are undoable
  - [ ] Complex operation sequences work correctly
- [ ] Test integration with existing features
  - [ ] Clipboard operations (copy/paste) work with group operations
  - [ ] Tool switching doesn't break group operations
  - [ ] Piano roll integration remains stable
- [ ] Add visual feedback and polish
  - [ ] Smooth animations for group operations
  - [ ] Clear visual indicators for group state
  - [ ] Proper cursor changes during operations
  - [ ] Keyboard shortcut tooltips

## Architecture Notes

### Design Principles
- **Reuse Patterns**: Adapt proven piano roll group operation patterns
- **Maintain Compatibility**: Preserve existing track architecture and behavior
- **FL Studio Paradigms**: Follow familiar DAW interaction patterns
- **Performance**: Efficient batch operations for multiple tracks

### Key Components
1. **Timeline.tsx**: Main drag orchestration and event handling
2. **BaseTrackPreview.tsx**: Individual track resize handles and visual feedback
3. **useInteractionManager.ts**: Group operation state management
4. **tracksSlice.ts**: Store operations for group updates
5. **Studio.tsx**: Integration layer connecting all components

### State Management Flow
1. **Selection**: User selects multiple tracks via rectangle or shift-click
2. **Operation Start**: User begins drag/resize on one track in selection
3. **Group Detection**: System detects group operation and stores initial states
4. **Live Updates**: All selected tracks update in real-time during operation
5. **Operation End**: Final positions/sizes committed to store with history

## Expected User Experience

### Group Moving
1. Select multiple tracks using rectangle selection or Shift+click
2. Drag any selected track
3. All selected tracks move together maintaining relative positions
4. Grid snapping applies to the entire group
5. Visual feedback shows all tracks being moved

### Group Resizing
1. Select multiple tracks
2. Hover over resize handle of any selected track
3. Resize handles appear on all selected tracks
4. Drag resize handle to resize entire group
5. Left handle: moves all tracks and adjusts widths
6. Right handle: adjusts widths maintaining positions
7. Visual preview shows final sizes during resize

### Integration Features
- **Undo/Redo**: All group operations are undoable
- **Copy/Paste**: Works seamlessly with group selections
- **Grid Snapping**: Respects snap settings for all group operations
- **Tool Integration**: Group operations work with all timeline tools
- **Keyboard Shortcuts**: Group operations respond to keyboard shortcuts

## Success Criteria
- [ ] Multiple tracks can be moved as a cohesive group
- [ ] Group resizing works smoothly with visual feedback
- [ ] All operations integrate with undo/redo system
- [ ] Performance remains smooth with large selections
- [ ] User experience matches FL Studio interaction patterns
- [ ] No regression in existing single-track functionality
- [ ] Comprehensive test coverage for edge cases