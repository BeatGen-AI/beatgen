# Instance-Based Audio Playback Implementation Summary

## Overview
This implementation adds support for track instances - multiple instances of the same track with different positions and trim settings. The system maintains backward compatibility while enabling efficient memory usage through shared audio buffers.

## Architecture

### Core Components

1. **AudioBufferManager** (`audioBufferManager.ts`)
   - Manages shared audio buffers with reference counting
   - Implements LRU cache eviction
   - Prevents memory duplication for multiple instances

2. **InstancePlayer** (`instancePlayer.ts`)
   - Lightweight player instances that share buffers
   - Supports trim settings and position offsets
   - Can be pooled for performance

3. **TransportControllerWithInstances** (`transportControllerWithInstances.ts`)
   - Coordinates playback across all instance-aware engines
   - Implements instance-based scheduling instead of track-based
   - Handles lookahead scheduling for smooth playback

### Audio Engines

1. **AudioFilePlayerWithInstances** (`audioFilePlayer/audioEngineWithInstances.ts`)
   - Manages audio file playback for track instances
   - Each track has Map<instanceId, InstancePlayer>
   - Supports adding/removing instances dynamically

2. **SoundfontEngineControllerWithInstances** (`soundfontEngineControllerWithInstances.ts`)
   - MIDI playback with soundfont support
   - Instance-specific MIDI sequencers
   - Channel pooling for efficiency

3. **SamplerControllerWithInstances** (`samplerControllerWithInstances.ts`)
   - Sample-based playback with instance support
   - Granular synthesis parameters per instance
   - Note scheduling per instance

### Integration Layer

1. **StoreWithInstances** (`storeWithInstances.ts`)
   - Extends base Store class with instance support
   - Manages instance lifecycle
   - Coordinates between UI and audio engines

2. **TransportWithInstances** (`transportWithInstances.ts`)
   - Replaces original transport controller
   - Provides unified interface for all engines
   - Handles instance-specific operations

3. **useStoreWithInstances** (`useStoreWithInstances.ts`)
   - Zustand store integration
   - Maps UI actions to instance operations
   - Maintains compatibility with existing UI

### Performance Optimizations

1. **InstancePlayerPool** (`instancePool.ts`)
   - Object pooling for player instances
   - Reduces GC pressure
   - Reuses player objects

2. **ViewportCuller** (`viewportCuller.ts`)
   - Only activates instances near playback position
   - Implements lookahead for smooth playback
   - Reduces CPU usage for large projects

3. **PerformanceMonitor** (`performanceMonitor.ts`)
   - Tracks resource usage
   - Provides optimization suggestions
   - Emits warnings for performance issues

### Error Handling

1. **AudioEngineErrorHandler** (`errorHandler.ts`)
   - Centralized error handling
   - Recovery strategies for common failures
   - Error logging and reporting

2. **AudioEngineValidator** (`validation.ts`)
   - Input validation for all operations
   - Prevents common configuration errors
   - Type-safe parameter checking

## Usage

### Basic Usage

```typescript
// Create store with instances
const store = new StoreWithInstances();
await store.initializeAudio();

// Load audio file (creates default instance)
await store.loadAudioFile(trackId, audioFile);

// Add additional instances
const instance: TrackInstance = {
    id: 'instance_2',
    track_id: trackId,
    x_position: 1920, // 1 measure offset
    y_position: 0,
    trim_start_ticks: 0,
    trim_end_ticks: 1920
};
await store.addTrackInstance(trackId, instance);

// Update instance position
await store.updateTrackInstance(trackId, instanceId, {
    x_position: 3840 // Move to measure 2
});

// Remove instance
await store.removeTrackInstance(trackId, instanceId);
```

### UI Integration

```typescript
// Use the instance-aware store hook
const store = useStoreWithInstances();

// Track operations automatically handle instances
const handleTrackMove = (trackId: string, newPosition: Position) => {
    // This will move the first instance
    store.handleTrackPositionChange(trackId, newPosition, true);
};

// Direct instance operations
const handleInstanceMove = (trackId: string, instanceId: string, newPosition: Position) => {
    store.handleInstancePositionChange(trackId, instanceId, newPosition, true);
};
```

## Migration Guide

### From Track-Based to Instance-Based

1. **Update Store Import**
   ```typescript
   // Before
   import { Store } from './store';
   
   // After
   import { StoreWithInstances } from './storeWithInstances';
   ```

2. **Update Track Data Model**
   - Tracks now have an `instances` array
   - Position data moved to instances
   - Default instance created automatically

3. **Update UI Components**
   - Use instance methods for position/resize
   - Support multiple instances per track
   - Update rendering for instances

## Performance Considerations

1. **Memory Usage**
   - Shared buffers reduce memory footprint
   - Buffer manager implements LRU eviction
   - Monitor with PerformanceMonitor

2. **CPU Usage**
   - Viewport culling reduces active instances
   - Instance pooling reduces allocations
   - Lookahead scheduling batches operations

3. **Scalability**
   - Tested up to 100 active instances
   - Automatic quality adjustments available
   - Performance warnings guide optimization

## Future Enhancements

1. **Streaming Support**
   - For files > 10MB
   - Reduces initial load time
   - Lower memory usage

2. **Advanced Culling**
   - LOD system for distant instances
   - Predictive loading
   - Dynamic quality adjustment

3. **Instance Effects**
   - Per-instance audio effects
   - Crossfading between instances
   - Instance-specific automation

## Testing

Run integration tests:
```bash
npm test -- --testPathPattern=instance
```

Performance benchmarks:
```bash
npm run benchmark:instances
```

## Troubleshooting

### Common Issues

1. **Instance not playing**
   - Check viewport culling bounds
   - Verify instance is added to engine
   - Check trim settings

2. **Memory warnings**
   - Increase buffer cache size
   - Implement streaming for large files
   - Use viewport culling more aggressively

3. **Performance issues**
   - Reduce lookahead time
   - Enable instance pooling
   - Check performance monitor suggestions