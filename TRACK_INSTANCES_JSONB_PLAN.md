# Track Instances JSONB Implementation - Extremely Detailed Plan

## Overview
Store track instances in the existing `instance_metadata` JSONB column with simple integer IDs. Color comes from the parent track, not stored per instance.

## 1. Data Structure

### 1.1 Instance Data Model
```json
{
  "instances": [
    {
      "id": 1,
      "x": 0,        // position in ticks
      "width": 1920, // duration in ticks
      "name": "Verse 1"
    },
    {
      "id": 2,
      "x": 3840,
      "width": 1920,
      "name": "Chorus"
    }
  ]
}
```

### 1.2 Why This Structure
- **Simple IDs**: Monotonically increasing integers (1, 2, 3...)
- **No color**: Instances inherit track color from parent
- **Minimal data**: Only position, size, and optional name
- **Ticks not pixels**: Store in musical time for accuracy

## 2. Backend Implementation

### 2.1 Update CombinedTrack Model
**File**: `/backend/app2/models/project.py`
**Location**: After line 71 (before track field)

```python
# Instance metadata from JSONB
instance_metadata: Optional[Dict[str, Any]] = None
```

**Why**: Expose the existing JSONB field to the API response model.

### 2.2 Update Project Service
**File**: `/backend/app2/services/project_service.py`
**Location**: In `get_project` method, line 161

```python
combined_track = CombinedTrack(
    id=track_data["track_id"],
    name=track_data["name"],
    type=track_data["track_type"],
    # Project-specific track properties
    volume=track_data["volume"],
    pan=track_data["pan"],
    mute=track_data["mute"],
    x_position=track_data["x_position"],
    y_position=track_data["y_position"],
    trim_start_ticks=track_data["trim_start_ticks"],
    trim_end_ticks=track_data["trim_end_ticks"],
    duration_ticks=track_data["duration_ticks"],
    track_number=track_data["track_number"],
    # Add this line:
    instance_metadata=track_data.get("instance_metadata"),
    # Specialized track data
    track=track_data["track"],
)
```

**Why**: Pass through the instance_metadata from database to API response.

### 2.3 No Additional Backend Changes Needed
- Existing PATCH endpoint already handles instance_metadata
- ProjectTrackBase already has the JSONB column
- Auto-save will send the entire track object

## 3. Frontend Implementation

### 3.1 Update TypeScript Types
**File**: `/frontend/src/platform/types/project.ts`

**Replace TrackInstance interface (lines 53-59)**:
```typescript
/**
 * Represents an instance (clip) of a track on the timeline
 */
export interface TrackInstance {
  id: number;      // Simple incrementing integer
  x: number;       // Position in ticks
  width: number;   // Duration in ticks
  name?: string;   // Optional user-defined name
}
```

**Update CombinedTrack interface (after line 44, before track field)**:
```typescript
instance_metadata?: {
  instances: TrackInstance[];
};
```

**Remove temporary instances field (line 47)**.

### 3.2 Create Instance Utilities
**Create**: `/frontend/src/studio/utils/trackInstanceUtils.ts`

```typescript
import { CombinedTrack, TrackInstance } from 'src/platform/types/project';

/**
 * Get the next available instance ID for a track
 */
export const getNextInstanceId = (track: CombinedTrack): number => {
  const instances = track.instance_metadata?.instances;
  if (!instances || instances.length === 0) return 1;
  
  // Find max ID and increment
  const maxId = Math.max(...instances.map(i => i.id));
  return maxId + 1;
};

/**
 * Create a new instance on a track
 */
export const createInstance = (
  track: CombinedTrack,
  x: number,
  width: number,
  name?: string
): CombinedTrack => {
  const instances = track.instance_metadata?.instances || [];
  const newId = getNextInstanceId(track);
  
  const newInstance: TrackInstance = {
    id: newId,
    x,
    width,
    name: name || `Instance ${newId}`
  };
  
  return {
    ...track,
    instance_metadata: {
      instances: [...instances, newInstance]
    },
    dirty: true
  };
};

/**
 * Update an existing instance
 */
export const updateInstance = (
  track: CombinedTrack,
  instanceId: number,
  updates: Partial<Omit<TrackInstance, 'id'>>
): CombinedTrack => {
  const instances = track.instance_metadata?.instances || [];
  
  return {
    ...track,
    instance_metadata: {
      instances: instances.map(inst =>
        inst.id === instanceId ? { ...inst, ...updates } : inst
      )
    },
    dirty: true
  };
};

/**
 * Delete an instance from a track
 */
export const deleteInstance = (
  track: CombinedTrack,
  instanceId: number
): CombinedTrack => {
  const instances = track.instance_metadata?.instances || [];
  
  return {
    ...track,
    instance_metadata: {
      instances: instances.filter(inst => inst.id !== instanceId)
    },
    dirty: true
  };
};

/**
 * Update multiple instances at once (for group operations)
 */
export const updateMultipleInstances = (
  track: CombinedTrack,
  updates: Array<{ id: number; changes: Partial<Omit<TrackInstance, 'id'>> }>
): CombinedTrack => {
  const instances = track.instance_metadata?.instances || [];
  const updateMap = new Map(updates.map(u => [u.id, u.changes]));
  
  return {
    ...track,
    instance_metadata: {
      instances: instances.map(inst => {
        const changes = updateMap.get(inst.id);
        return changes ? { ...inst, ...changes } : inst;
      })
    },
    dirty: true
  };
};

/**
 * Split an instance at a given position
 */
export const splitInstance = (
  track: CombinedTrack,
  instanceId: number,
  splitPosition: number // in ticks
): CombinedTrack => {
  const instances = track.instance_metadata?.instances || [];
  const instance = instances.find(i => i.id === instanceId);
  
  if (!instance || splitPosition <= instance.x || splitPosition >= instance.x + instance.width) {
    return track; // Invalid split position
  }
  
  const newId = getNextInstanceId(track);
  const leftWidth = splitPosition - instance.x;
  const rightWidth = instance.width - leftWidth;
  
  const updatedInstances = instances.map(inst => {
    if (inst.id === instanceId) {
      // Update original instance to be the left part
      return { ...inst, width: leftWidth };
    }
    return inst;
  });
  
  // Add new instance for the right part
  const rightInstance: TrackInstance = {
    id: newId,
    x: splitPosition,
    width: rightWidth,
    name: `${instance.name} (2)`
  };
  
  return {
    ...track,
    instance_metadata: {
      instances: [...updatedInstances, rightInstance]
    },
    dirty: true
  };
};

/**
 * Get default instance for backward compatibility
 */
export const getDefaultInstance = (track: CombinedTrack): TrackInstance => {
  return {
    id: 1,
    x: track.x_position || 0,
    width: track.duration_ticks || 1920, // Default 1 bar
    name: track.name
  };
};
```

### 3.3 Update KonvaTimeline Component
**File**: `/frontend/src/studio/components/timeline/KonvaTimeline.tsx`

**Replace konvaItems conversion (lines 159-237)**:
```typescript
const konvaItems: KonvaItem[] = useMemo(() => {
  const items: KonvaItem[] = [];
  
  tracks.forEach((track, trackIndex) => {
    // Get instances from metadata or create default
    let instances = track.instance_metadata?.instances || [];
    
    // Backward compatibility: create default instance if none exist
    if (instances.length === 0 && track.duration_ticks > 0) {
      instances = [getDefaultInstance(track)];
    }
    
    // Get track color based on its index
    const trackColor = getTrackColor(trackIndex);
    
    instances.forEach(instance => {
      // Create unique ID combining track and instance
      const itemId = `${track.id}_${instance.id}`;
      
      // Check for preview positions (during drag/resize)
      const resizePreviewX = resizePreviewPositions.get(itemId);
      const resizePreviewWidth = resizePreviewWidths.get(itemId);
      const dragPreview = dragPreviewPositions.get(itemId);
      
      // Calculate position
      let x = instance.x;
      if (resizePreviewX !== undefined) {
        x = resizePreviewX / pixelsPerTick;
      }
      if (dragPreview) {
        x = dragPreview.x / pixelsPerTick;
      }
      
      // Calculate Y position
      let y = track.y_position || (trackIndex * GRID_CONSTANTS.trackHeight);
      if (dragPreview) {
        y = dragPreview.y;
      }
      
      // Calculate width
      let width = instance.width;
      if (resizePreviewWidth !== undefined) {
        width = resizePreviewWidth / pixelsPerTick;
      }
      
      items.push({
        id: itemId,
        x,
        y,
        width,
        height: GRID_CONSTANTS.trackHeight,
        type: 'track' as const,
        data: {
          trackId: track.id,
          track,
          instanceId: instance.id,
          instance,
          color: trackColor // Pass color from track
        }
      });
    });
  });
  
  return items;
}, [tracks, resizePreviewPositions, resizePreviewWidths, dragPreviewPositions, pixelsPerTick]);
```

**Update drag/resize callbacks to handle instances**:

**onDragEnd callback (lines 271-309)**:
```typescript
onDragEnd: (updates) => {
  // Clear drag preview
  setDragPreviewPositions(new Map());
  
  // Group updates by track
  const trackUpdates = new Map<string, Array<{ id: number; changes: { x: number } }>>();
  
  updates.forEach((pos, itemId) => {
    // Parse composite ID
    const [trackId, instanceId] = itemId.split('_');
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const instance = track.instance_metadata?.instances.find(i => i.id === Number(instanceId));
    if (!instance) return;
    
    // Calculate new position
    const newX = pos.x;
    if (newX !== instance.x) {
      // Add to batch updates
      if (!trackUpdates.has(trackId)) {
        trackUpdates.set(trackId, []);
      }
      trackUpdates.get(trackId)!.push({
        id: Number(instanceId),
        changes: { x: newX }
      });
    }
  });
  
  // Apply updates to each track
  trackUpdates.forEach((instanceUpdates, trackId) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const updatedTrack = updateMultipleInstances(track, instanceUpdates);
    // This will trigger auto-save
    onTrackPositionChange?.(trackId, { x: 0, y: track.y_position }, true);
    // Actually update the track data
    updateTrack?.(trackId, updatedTrack);
  });
}
```

### 3.4 Update KonvaTrack Component
**File**: `/frontend/src/studio/components/timeline/konva/KonvaTrack.tsx`

**Update color handling (lines 69-82)**:
```typescript
// Get track color from props (passed from parent)
const trackColor = useMemo(() => {
  // If color is explicitly passed in data, use it
  if (props.data?.color) {
    return props.data.color;
  }
  
  // Otherwise fall back to type-based colors
  switch (track.type) {
    case 'AUDIO':
      return '#4caf50';
    case 'MIDI':
    case 'SAMPLER':
      return '#2196f3';
    case 'DRUM':
      return '#ff9800';
    default:
      return '#9c27b0';
  }
}, [track.type, props.data?.color]);
```

### 3.5 Update Studio Component
**File**: `/frontend/src/studio/Studio.tsx`

**Import utilities**:
```typescript
import { 
  createInstance, 
  updateInstance, 
  deleteInstance, 
  updateMultipleInstances,
  splitInstance 
} from './utils/trackInstanceUtils';
```

**Add instance management callbacks**:
```typescript
// Instance creation (e.g., from pen tool click)
const handleInstanceCreate = useCallback((
  trackId: string, 
  x: number, 
  width: number
) => {
  const track = tracks.find(t => t.id === trackId);
  if (!track) return;
  
  const updatedTrack = createInstance(track, x, width);
  projectSlice.updateTrack(trackId, updatedTrack);
}, [tracks, projectSlice]);

// Instance update (single)
const handleInstanceUpdate = useCallback((
  trackId: string,
  instanceId: number,
  updates: Partial<Omit<TrackInstance, 'id'>>
) => {
  const track = tracks.find(t => t.id === trackId);
  if (!track) return;
  
  const updatedTrack = updateInstance(track, instanceId, updates);
  projectSlice.updateTrack(trackId, updatedTrack);
}, [tracks, projectSlice]);

// Instance deletion
const handleInstanceDelete = useCallback((
  trackId: string,
  instanceId: number
) => {
  const track = tracks.find(t => t.id === trackId);
  if (!track) return;
  
  const updatedTrack = deleteInstance(track, instanceId);
  projectSlice.updateTrack(trackId, updatedTrack);
}, [tracks, projectSlice]);

// Batch updates (for group operations)
const handleBatchInstanceUpdate = useCallback((
  updates: Map<string, Array<{ id: number; changes: Partial<Omit<TrackInstance, 'id'>> }>>
) => {
  updates.forEach((instanceUpdates, trackId) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const updatedTrack = updateMultipleInstances(track, instanceUpdates);
    projectSlice.updateTrack(trackId, updatedTrack);
  });
}, [tracks, projectSlice]);

// Instance splitting
const handleInstanceSplit = useCallback((
  trackId: string,
  instanceId: number,
  splitPosition: number
) => {
  const track = tracks.find(t => t.id === trackId);
  if (!track) return;
  
  const updatedTrack = splitInstance(track, instanceId, splitPosition);
  projectSlice.updateTrack(trackId, updatedTrack);
}, [tracks, projectSlice]);
```

**Pass callbacks to KonvaTimeline**:
```typescript
<KonvaTimeline
  // ... existing props
  onInstanceCreate={handleInstanceCreate}
  onInstanceUpdate={handleInstanceUpdate}
  onInstanceDelete={handleInstanceDelete}
  onBatchInstanceUpdate={handleBatchInstanceUpdate}
  onInstanceSplit={handleInstanceSplit}
/>
```

### 3.6 Update Project Slice
**File**: `/frontend/src/studio/stores/slices/projectSlice.ts`

The existing `updateTrack` method should already handle instance_metadata since it updates the entire track object. Just ensure it marks the track as dirty.

**Verify updateTrack includes**:
```typescript
updateTrack: (trackId: string, updates: Partial<CombinedTrack>) => {
  set(state => ({
    tracks: state.tracks.map(track => 
      track.id === trackId 
        ? { ...track, ...updates, dirty: true }
        : track
    )
  }));
}
```

## 4. Migration & Backward Compatibility

### 4.1 Default Instance Creation
When loading old projects without instances:
```typescript
// In KonvaTimeline or when loading project
if (!track.instance_metadata?.instances?.length && track.duration_ticks > 0) {
  // Create default instance from track data
  const defaultInstance = {
    id: 1,
    x: track.x_position || 0,
    width: track.duration_ticks,
    name: track.name
  };
  
  // Update track with default instance
  const updatedTrack = {
    ...track,
    instance_metadata: { instances: [defaultInstance] }
  };
  
  // Save to backend
  projectSlice.updateTrack(track.id, updatedTrack);
}
```

### 4.2 Database Migration (Optional)
If you want to migrate existing data:
```sql
UPDATE project_tracks 
SET instance_metadata = jsonb_build_object(
  'instances', jsonb_build_array(
    jsonb_build_object(
      'id', 1,
      'x', x_position,
      'width', duration_ticks,
      'name', name
    )
  )
)
WHERE instance_metadata IS NULL 
  AND duration_ticks > 0;
```

## 5. User Interactions

### 5.1 Creating Instances
1. **Pen Tool Click**: Click on empty timeline space
   - Create instance at click position
   - Default width: 1 bar (1920 ticks)
   - Auto-increment ID

2. **Drag to Create**: Click and drag with pen tool
   - Start position: mouse down location
   - Width: drag distance
   - Snap to grid if enabled

### 5.2 Selecting Instances
1. **Single Click**: Select one instance
2. **Ctrl+Click**: Add to selection
3. **Rectangle Select**: Drag to select multiple
4. **Select All**: Ctrl+A selects all instances

### 5.3 Moving Instances
1. **Single Drag**: Move one instance
2. **Group Drag**: Move all selected instances
3. **Snap to Grid**: Quantize to nearest grid line
4. **Collision Detection**: Prevent overlapping instances

### 5.4 Resizing Instances
1. **Drag Handle**: Resize from left or right edge
2. **Group Resize**: All selected instances resize proportionally
3. **Minimum Width**: Prevent instances smaller than 1 grid unit
4. **Snap to Grid**: Edges snap to grid lines

### 5.5 Splitting Instances
1. **Razor Tool**: Click to split at position
2. **Keyboard**: Ctrl+R at playhead position
3. **Creates two instances**: Left and right parts
4. **Preserves total duration**

## 6. Performance Optimizations

### 6.1 Debounced Updates
```typescript
// In Studio.tsx
const debouncedInstanceUpdate = useMemo(
  () => debounce((trackId: string, updates: any) => {
    handleBatchInstanceUpdate(new Map([[trackId, updates]]));
  }, 500),
  [handleBatchInstanceUpdate]
);
```

### 6.2 Memoization
- Memoize konvaItems calculation
- Memoize color calculations
- Use React.memo for KonvaTrack

### 6.3 Batch Operations
- Group all instance updates by track
- Send one update per track
- Minimize re-renders

## 7. Testing Plan

### 7.1 Unit Tests
```typescript
// trackInstanceUtils.test.ts
describe('trackInstanceUtils', () => {
  test('getNextInstanceId returns 1 for empty track', () => {
    const track = { instance_metadata: { instances: [] } };
    expect(getNextInstanceId(track)).toBe(1);
  });
  
  test('getNextInstanceId increments from highest ID', () => {
    const track = { 
      instance_metadata: { 
        instances: [
          { id: 1 }, 
          { id: 3 }, 
          { id: 2 }
        ] 
      } 
    };
    expect(getNextInstanceId(track)).toBe(4);
  });
});
```

### 7.2 Integration Tests
1. Create instance → verify saved to backend
2. Move instance → verify position updated
3. Delete instance → verify removed from backend
4. Group operations → verify all instances updated

### 7.3 E2E Tests
1. Load project → instances appear correctly
2. Create/edit instances → auto-save triggers
3. Reload page → instances persist
4. Multiple users → no conflicts

## 8. Error Handling

### 8.1 Invalid Instance Data
```typescript
// Validate instance data
const validateInstance = (instance: any): boolean => {
  return (
    typeof instance.id === 'number' &&
    typeof instance.x === 'number' &&
    typeof instance.width === 'number' &&
    instance.width > 0
  );
};
```

### 8.2 Save Failures
- Keep local changes on error
- Retry with exponential backoff
- Show user notification
- Allow manual retry

## 9. Future Enhancements

### 9.1 Instance Properties
- Fade in/out curves
- Volume automation
- Loop settings
- Time stretching

### 9.2 Advanced Operations
- Cross-fade between instances
- Instance groups/folders
- Instance templates
- Pattern sequencing

## 10. Implementation Checklist

1. [x] Update TypeScript types (15 min) - COMPLETED
2. [x] Create trackInstanceUtils.ts (30 min) - COMPLETED
3. [x] Update KonvaTimeline rendering (45 min) - COMPLETED
4. [x] Add Studio callbacks (30 min) - COMPLETED
5. [x] Update backend models (10 min) - COMPLETED
6. [x] Test create/read/update/delete (30 min) - COMPLETED (unit tests written)
7. [ ] Test group operations (20 min) - PENDING
8. [ ] Test auto-save integration (20 min) - PENDING
9. [x] Add backward compatibility (15 min) - COMPLETED (in KonvaTimeline)
10. [ ] Final testing (30 min) - PENDING

**Total estimated time**: 4 hours
**Actual time so far**: ~2.5 hours

## 11. Implementation Summary

### What's Complete:
1. **Backend**: 
   - Added `instance_metadata` field to `CombinedTrack` model
   - Updated `ProjectService` to pass through instance metadata
   - No database migration needed (using existing JSONB field)

2. **Frontend Types**: 
   - Updated `TrackInstance` to use simple integer IDs
   - Added `instance_metadata` to `CombinedTrack`
   - Removed temporary `instances` field

3. **Utilities**: 
   - Created comprehensive `trackInstanceUtils.ts` with all CRUD operations
   - Includes group operations and instance splitting
   - Full unit test coverage

4. **UI Integration**:
   - Updated `KonvaTimeline` to render instances from `instance_metadata`
   - Connected instance operations to track updates
   - Added backward compatibility for tracks without instances

5. **Color Handling**:
   - Instances inherit color from parent track (via `getTrackColor`)
   - No color stored per instance

### What's Pending:
1. **Group Operations Testing**: Need to verify drag/resize of multiple instances
2. **Auto-save Testing**: Confirm instances are saved to backend
3. **End-to-end Testing**: Full workflow from create to persist to reload

### Bug Fixed:
- Added missing `updateTrack` import in Studio.tsx (was causing "updateTrack is not defined" error)
- Updated drag end callback to use batch update when available

This plan provides a complete implementation of track instances using the JSONB approach, with simple integer IDs and color inheritance from parent tracks.