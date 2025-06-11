# 🎵 Audio Engine Migration Plan: Track Instances Support

## Overview

This document outlines the step-by-step migration from the current single-track audio engine to a position_metadata-based track instances system. The migration enables copy/paste functionality while maintaining backward compatibility.

## Current vs New Architecture

### Current Architecture Problems
```typescript
// PROBLEM: One-to-one mapping
Map<trackId, SinglePlayer>

// Each track = One audio file + One player + One position
AudioTrack {
  id: string,
  player: Tone.Player,      // Expensive to duplicate
  audioFile: File,          // Large memory usage if duplicated
  position: {x, y}          // Tied to single position
}
```

### New Architecture Solution
```typescript
// SOLUTION: Separate shared data from instances
Map<trackId, SharedAudioData>     // One audio buffer shared
Map<instanceId, PlayerInstance>   // Multiple positioned players

SharedAudioData {
  trackId: string,
  buffer: Tone.ToneAudioBuffer,   // Shared across instances
  name: string
}

PlayerInstance {
  instanceId: string,
  trackId: string,              // Reference to shared data
  player: Tone.Player,          // Position-specific player
  position: {x, y}              // Instance-specific position
}
```

## Migration Strategy

### Phase 1: Foundation (Week 1) - CRITICAL PATH
**Goal**: Get AudioFilePlayer working with instances

#### Step 1.1: Create Refactored AudioFilePlayer (Day 1-2)
- ✅ **DONE**: Created `AudioEngineRefactored.ts` with:
  - Shared audio data storage
  - Instance-based player management  
  - Backward compatibility layer

#### Step 1.2: Create TransportController Updates (Day 2-3)
- ✅ **DONE**: Created `TransportControllerRefactored.ts` with:
  - Instance-aware scheduling
  - Position-based playback timing
  - Bulk instance management

#### Step 1.3: Create Integration Layer (Day 3-4)
- ✅ **DONE**: Created `TrackInstanceManager.ts` with:
  - Unified instance management
  - Content/instance separation
  - Legacy compatibility

#### Step 1.4: Implement Migration Pattern (Day 4-5)
```typescript
// Migration wrapper that gradually replaces old system
class AudioEngineMigration {
  private oldEngine: AudioFilePlayer;
  private newEngine: AudioFilePlayerRefactored;
  private useNewEngine: boolean = false; // Feature flag
  
  async createTrack(id: string, name: string, audioFile?: File) {
    if (this.useNewEngine) {
      // Use new instance-based approach
      await this.newEngine.loadSharedTrackData(id, name, audioFile);
      return this.newEngine.createTrackInstance(id, `${id}_default`, {x: 0, y: 0});
    } else {
      // Use legacy approach
      return this.oldEngine.createTrack(id, name, audioFile);
    }
  }
}
```

### Phase 2: Store Integration (Week 2)
**Goal**: Connect new audio engine to Zustand store

#### Step 2.1: Update Store Types
```typescript
// New store interface supporting instances
interface EnhancedTracksSlice {
  // Legacy track data (for content)
  tracks: CombinedTrack[];
  
  // NEW: Instance management
  trackInstances: Map<string, TrackInstanceConfig>;
  
  // NEW: Instance operations
  createTrackInstance: (trackId: string, position: Position) => Promise<string>;
  removeTrackInstance: (instanceId: string) => Promise<void>;
  updateInstancePosition: (instanceId: string, position: Position) => void;
  
  // Copy/paste operations
  copyInstances: (instanceIds: string[]) => void;
  pasteInstances: (position: Position) => Promise<string[]>;
}
```

#### Step 2.2: Implement Store Actions
```typescript
const createTrackInstance = async (trackId: string, position: Position) => {
  const instanceId = `${trackId}_${Date.now()}_${Math.random()}`;
  const trackData = get().findTrackById(trackId);
  
  if (!trackData) throw new Error(`Track ${trackId} not found`);
  
  // Use TrackInstanceManager to create instance
  const manager = TrackInstanceManager.getInstance();
  await manager.createTrackInstance({
    trackId,
    instanceId,
    trackType: trackData.type,
    position,
    volume: trackData.volume,
    pan: trackData.pan,
    muted: trackData.mute
  });
  
  // Update store state
  set(produce(draft => {
    draft.trackInstances.set(instanceId, {
      trackId,
      instanceId,
      trackType: trackData.type,
      position
    });
  }));
  
  return instanceId;
};
```

#### Step 2.3: Gradual Migration with Feature Flags
```typescript
// Environment variable or user setting
const ENABLE_TRACK_INSTANCES = process.env.REACT_APP_ENABLE_TRACK_INSTANCES === 'true';

const createTrackAndRegisterWithHistory = async (type, name, options) => {
  if (ENABLE_TRACK_INSTANCES && type === 'AUDIO') {
    // Use new instance-based approach
    return createTrackWithInstances(type, name, options);
  } else {
    // Use legacy approach
    return createTrackLegacy(type, name, options);
  }
};
```

### Phase 3: Component Updates (Week 3)
**Goal**: Update UI components to render multiple instances

#### Step 3.1: New TrackInstance Component
```typescript
// New component for rendering individual instances
interface TrackInstanceProps {
  trackData: CombinedTrack;      // Shared track content
  instance: TrackInstanceConfig; // Position-specific data
  onPositionChange: (newPosition: Position) => void;
  onSelect: () => void;
}

const TrackInstance: React.FC<TrackInstanceProps> = ({ trackData, instance, onPositionChange }) => {
  const isSelected = useStudioStore(state => 
    state.selectedInstances.has(instance.instanceId)
  );
  
  return (
    <Box
      position="absolute"
      left={`${instance.position.x}px`}
      top={`${instance.position.y}px`}
      border={isSelected ? '2px solid green' : '1px solid gray'}
      onDrag={(newPos) => onPositionChange(newPos)}
    >
      <TrackPreview trackData={trackData} instance={instance} />
    </Box>
  );
};
```

#### Step 3.2: Update Track Component
```typescript
const Track: React.FC<TrackProps> = ({ id, index }) => {
  const trackData = useStudioStore(state => state.findTrackById(id));
  const instances = useStudioStore(state => state.getInstancesForTrack(id));
  
  if (!trackData) return null;
  
  // Render all instances of this track
  return (
    <>
      {instances.map(instance => (
        <TrackInstance
          key={instance.instanceId}
          trackData={trackData}
          instance={instance}
          onPositionChange={(pos) => updateInstancePosition(instance.instanceId, pos)}
        />
      ))}
    </>
  );
};
```

### Phase 4: Copy/Paste Implementation (Week 4)
**Goal**: Implement actual copy/paste functionality

#### Step 4.1: Copy Operation
```typescript
const copySelectedInstances = () => {
  const selectedInstanceIds = Array.from(get().selectedInstances);
  const instances = selectedInstanceIds.map(id => get().getInstanceConfig(id));
  
  // Calculate relative positions
  const minX = Math.min(...instances.map(i => i.position.x));
  const minY = Math.min(...instances.map(i => i.position.y));
  
  const clipboardData = {
    instances: instances.map(instance => ({
      ...instance,
      relativePosition: {
        x: instance.position.x - minX,
        y: instance.position.y - minY
      }
    })),
    copyTime: Date.now()
  };
  
  // Store in clipboard
  set(produce(draft => {
    draft.clipboard = clipboardData;
  }));
  
  // Also store in browser clipboard for cross-session paste
  navigator.clipboard.writeText(JSON.stringify(clipboardData));
};
```

#### Step 4.2: Paste Operation
```typescript
const pasteInstances = async (targetPosition: Position) => {
  const { clipboard } = get();
  if (!clipboard) return [];
  
  const newInstances: string[] = [];
  
  for (const instanceData of clipboard.instances) {
    const newPosition = {
      x: targetPosition.x + instanceData.relativePosition.x,
      y: targetPosition.y + instanceData.relativePosition.y
    };
    
    const newInstanceId = await createTrackInstance(instanceData.trackId, newPosition);
    newInstances.push(newInstanceId);
  }
  
  return newInstances;
};
```

#### Step 4.3: Keyboard Shortcuts
```typescript
// In Studio.tsx
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      copySelectedInstances();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      const cursorPosition = getCursorPosition() || {x: 0, y: 0};
      pasteInstances(cursorPosition);
    }
  };
  
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, []);
```

## Implementation Priority Order

### 🚨 CRITICAL PATH - Must be done first:

1. **AudioFilePlayer Refactoring** (Days 1-3)
   - This is the foundation everything else depends on
   - Start with: `/src/studio/core/audio-engine/audioFilePlayer/audioEngine.ts`
   - Replace with refactored version gradually

2. **TransportController Updates** (Days 3-5)
   - Update: `/src/studio/core/state/transport.ts`
   - Must coordinate multiple instances

3. **Store Integration** (Days 5-7)
   - Update: `/src/studio/stores/slices/tracksSlice.ts`
   - Add instance management

### ⚡ HIGH PRIORITY - Core functionality:

4. **TrackInstance Component** (Days 7-10)
   - Create new component for rendering instances
   - Update Track.tsx to use instances

5. **Copy/Paste Logic** (Days 10-12)
   - Implement clipboard operations
   - Add keyboard shortcuts

### 🔧 MEDIUM PRIORITY - Polish:

6. **MIDI Player Refactoring** (Days 12-15)
   - Refactor MidiSoundfontPlayer for instances
   - Similar pattern to AudioFilePlayer

7. **Visual Feedback** (Days 15-17)
   - Selection indicators
   - Copy/paste animations
   - Position guides

## Migration Execution Strategy

### Week 1: Start with Minimal Viable Audio Engine

**Day 1-2: Replace AudioFilePlayer**
```bash
# 1. Create new file alongside old one
cp audioEngine.ts audioEngineOld.ts

# 2. Replace audioEngine.ts with refactored version
# Use our AudioEngineRefactored.ts as base

# 3. Update imports gradually
# Start with just one component using new engine
```

**Day 3-4: Feature Flag Testing**
```typescript
// Add feature flag to test new engine safely
const USE_INSTANCE_ENGINE = localStorage.getItem('use_instance_engine') === 'true';

// In studio initialization
if (USE_INSTANCE_ENGINE) {
  audioEngine = AudioFilePlayerRefactored.getInstance();
} else {
  audioEngine = AudioFilePlayer.getInstance(); // Legacy
}
```

**Day 5: Basic Instance Creation**
```typescript
// Minimal instance creation in store
const createTrackInstance = async (trackId: string) => {
  const manager = TrackInstanceManager.getInstance();
  const instanceId = await manager.createTrackInstance({
    trackId,
    instanceId: `${trackId}_${Date.now()}`,
    trackType: 'audio',
    position: {x: 0, y: 0}
  });
  return instanceId;
};
```

### Week 2: Store Integration & Backward Compatibility

**Focus**: Make new system work with existing UI components without breaking anything.

### Week 3: Component Updates

**Focus**: Update components to render multiple instances while maintaining single-instance appearance for legacy tracks.

### Week 4: Copy/Paste Implementation

**Focus**: Add actual copy/paste functionality that users can test.

## Risk Mitigation

### 1. Backward Compatibility
- Keep old AudioFilePlayer alongside new one
- Use feature flags to switch between systems
- Maintain same public interface for legacy components

### 2. Performance Testing
- Test with 50+ instances to ensure performance
- Memory usage monitoring
- Audio latency testing

### 3. User Testing Strategy
- Start with power users who want copy/paste
- Gradual rollout with opt-in feature flag
- Easy fallback to legacy system

### 4. Data Safety
- No breaking changes to project save format
- New position_metadata is additive only
- Legacy projects continue working unchanged

## Success Criteria

### Phase 1 Success:
- [ ] AudioFilePlayer supports multiple instances
- [ ] Single audio file can have 3+ instances playing simultaneously
- [ ] No regression in existing single-track functionality

### Phase 2 Success:
- [ ] Store can create/remove track instances
- [ ] UI renders multiple instances of same track
- [ ] No UI performance degradation

### Phase 3 Success:
- [ ] Copy/paste works with Ctrl+C/Ctrl+V
- [ ] Multiple instances can be selected and copied
- [ ] Paste preserves relative positioning

### Phase 4 Success:
- [ ] Feature is used by 30% of active users
- [ ] No major bugs reported
- [ ] Performance benchmarks met

## Next Immediate Steps

1. **Copy refactored files to project** (30 minutes)
2. **Create feature flag system** (1 hour)
3. **Test AudioEngineRefactored with single track** (2 hours)
4. **Update one component to use new engine** (4 hours)
5. **Test basic instance creation** (2 hours)

**Total estimated time for Phase 1**: 5-7 days of focused development

The key insight is that **AudioFilePlayer is the critical bottleneck** - once that's refactored to support instances, everything else becomes much easier to implement.