# Track Instance Duplication Implementation Plan

## Correct TrackInstance Schema

```typescript
interface TrackInstance {
  id: number;              // Simple incrementing integer  
  x: number;               // Horizontal position in ticks
  y: number;               // Vertical position in pixels
  trim_start_ticks: number; // How many ticks from source start to skip
  trim_end_ticks: number;   // How many ticks from source end to skip
}
```

## Width Calculation

```typescript
// Instance visible width = full duration - start trim - end trim
const instanceWidth = track.duration_ticks - instance.trim_start_ticks - instance.trim_end_ticks;
```

## Key Relationships

- **Track**: Has `duration_ticks` (full source length), `name`, and other metadata
- **Instance**: Specifies which portion to play and where on the timeline
- **Width**: Always derived from duration and trims, never stored

## Root Causes of Current Issues

1. **Schema Mismatch**: Current code expects `width` property that shouldn't exist
2. **Wrong Property Access**: `onDuplicate` uses `item.data?.id` instead of `item.data?.trackId`
3. **Outdated duplication logic**: Uses old property names and structure
4. **Width vs Trim confusion**: Code stores width instead of calculating it

## Implementation Steps

### 1. Update TrackInstance Type ✅
In `/src/platform/types/project.ts` - COMPLETED

### 2. Add Width Calculation Helper
In `trackInstanceUtils.ts`:
```typescript
export const getInstanceWidth = (track: CombinedTrack, instance: TrackInstance): number => {
  return track.duration_ticks - instance.trim_start_ticks - instance.trim_end_ticks;
};
```

### 3. Update All Width References
Replace direct `instance.width` access with calculated width:
- In `KonvaTimeline` when creating konva items
- In resize handlers
- In rendering components
- In duplication logic

### 4. Fix Resize Logic
- **Left resize**: 
  - Update `x` (position moves)
  - Update `trim_start_ticks` (trim changes by same amount)
  - Width auto-updates via calculation
  
- **Right resize**:
  - Update `trim_end_ticks` only
  - Position stays same
  - Width auto-updates via calculation

### 5. Fix Instance Creation
Default instance for a track:
```typescript
{
  id: 1,
  x: 0,
  y: track.y_position || 0,
  trim_start_ticks: 0,
  trim_end_ticks: 0  // Full track plays
}
```

### 6. Fix Duplication Logic
When duplicating:
- Copy x, y, trim_start_ticks, trim_end_ticks
- Apply position offset to x
- Optionally offset y for visual separation
- Use `getNextInstanceId()` for ID

### 7. Update KonvaTimeline
- Calculate width when creating items: `width: getInstanceWidth(track, instance)`
- Fix property access: `item.data?.trackId` instead of `item.data?.id`

### 8. Update Save/Load
Ensure instance_metadata only stores the 5 core properties, not derived width

## Benefits

- Single source of truth (no width redundancy)
- Cleaner data model
- Automatic width updates when trim changes
- Less chance for data inconsistency
- Matches how DAWs typically work internally

## Progress Tracking

- [x] Update TrackInstance type definition
- [ ] Update trackInstanceUtils.ts with new schema
- [ ] Fix KonvaTimeline instance rendering
- [ ] Fix resize handlers
- [ ] Fix duplication logic
- [ ] Update instance actions
- [ ] Test all functionality