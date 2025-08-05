# Audio Playback System Migration Guide

## Overview

This guide explains how to migrate from the old audio playback system to the new unified, instance-aware architecture.

## Architecture Changes

### Old System
- **Multiple abstractions**: TransportController → AudioEngine/SoundfontController/SamplerController → Individual Players
- **Instance handling**: Inconsistent across track types (aggregation for MIDI/Sampler, single-instance for Audio)
- **Timing calculations**: Scattered across multiple files
- **Complex state management**: Transport position calculations mixed with playback logic

### New System
- **Unified interface**: All track types implement `UnifiedTrackPlayer`
- **Consistent instance handling**: Each instance gets its own player
- **Centralized timing**: All calculations through `TimingCalculator`
- **Clear separation**: `InstancePlaybackManager` handles coordination, players handle playback

## Migration Steps

### Step 1: Install New Components

The new system exists alongside the old one, so you can migrate gradually:

```typescript
// New files added:
src/studio/core/audio-engine/
├── unified/
│   └── UnifiedTrackPlayer.ts          // Unified interface
├── timing/
│   └── TimingCalculator.ts            // Centralized timing
├── players/
│   ├── AudioInstancePlayer.ts         // Audio track player
│   ├── MidiInstancePlayer.ts          // MIDI track player
│   ├── SamplerInstancePlayer.ts       // Sampler track player
│   └── DrumTrackCoordinator.ts        // Drum track coordinator
├── InstancePlaybackManager.ts         // Instance coordination
├── RefactoredTransportController.ts   // Simplified transport
├── TrackPlayerFactory.ts              // Player creation
└── StoreIntegration.ts               // Integration helper
```

### Step 2: Update Store.ts

Replace the current audio initialization:

```typescript
// OLD
import { TransportController } from './transport';
import AudioFilePlayer from '../audio-engine/audioFilePlayer/audioEngine';
import { SoundfontEngineController } from '../audio-engine/soundfontEngineController';
import { SamplerController } from '../audio-engine/samplerController';

// NEW
import { StoreAudioIntegration } from '../audio-engine/StoreIntegration';

export class Store {
  // OLD
  // private transport: TransportController;
  // private audioEngine: AudioFilePlayer;
  // private soundfontController: SoundfontEngineController;
  // private samplerController: SamplerController;
  
  // NEW
  private audioIntegration: StoreAudioIntegration;
  
  constructor() {
    // OLD
    // this.transport = new TransportController(120);
    // this.audioEngine = AudioFilePlayer.getInstance();
    // this.soundfontController = new SoundfontEngineController(120);
    // this.samplerController = new SamplerController();
    
    // NEW
    this.audioIntegration = new StoreAudioIntegration(120);
  }
  
  async initializeAudio() {
    // OLD
    // await this.audioEngine.initialize();
    // await this.soundfontController.initialize(audioContext);
    
    // NEW
    await this.audioIntegration.initialize();
  }
}
```

### Step 3: Update Transport Methods

Replace transport methods in Store:

```typescript
// OLD
async play() {
  const tracks = this.zustandStore.getState().tracks;
  await this.transport.play(tracks);
}

async pause() {
  this.transport.pause();
}

async stop() {
  await this.transport.stop();
}

// NEW
async play() {
  await this.audioIntegration.play();
}

async pause() {
  await this.audioIntegration.pause();
}

async stop() {
  await this.audioIntegration.stop();
}
```

### Step 4: Update Track Loading

When loading tracks:

```typescript
// OLD
async loadTrack(track: CombinedTrack) {
  if (track.track_type === 'AUDIO') {
    await this.transport.loadAudioFile(track.id, audioFile, position);
  } else if (track.track_type === 'MIDI') {
    await this.soundfontController.connectTrackToSoundfont(track.id, instrumentId, this.midiManager);
  } else if (track.track_type === 'SAMPLER') {
    await this.samplerController.connectTrackToSampler(track.id, file, this.midiManager);
  }
}

// NEW
async loadTrack(track: CombinedTrack) {
  await this.audioIntegration.registerTrack(track);
}
```

### Step 5: Update Track Operations

Update volume, mute, and other operations:

```typescript
// OLD
setTrackVolume(trackId: string, volume: number) {
  const track = this.findTrack(trackId);
  if (track.track_type === 'AUDIO') {
    this.audioEngine.setTrackVolume(trackId, volume);
  } else if (track.track_type === 'MIDI') {
    this.soundfontController.setTrackVolume(trackId, volume);
  } else if (track.track_type === 'SAMPLER') {
    this.samplerController.setTrackVolume(trackId, volume);
  }
}

// NEW
async setTrackVolume(trackId: string, volume: number) {
  await this.audioIntegration.setTrackVolume(trackId, volume);
}
```

### Step 6: Update MIDI Operations

MIDI note operations now include instance IDs:

```typescript
// OLD
addMidiNote(trackId: string, note: Note) {
  this.midiManager.addNote(trackId, note);
}

// NEW
addMidiNote(trackId: string, instanceId: string, note: Note) {
  this.audioIntegration.addMidiNote(trackId, instanceId, note);
}
```

## Benefits After Migration

1. **Simpler Code**: Transport controller reduced from 700+ lines to ~200 lines
2. **Better Instance Support**: All track types properly support multiple instances
3. **Easier Maintenance**: Clear separation of concerns
4. **Better Performance**: More efficient instance management
5. **Easier Testing**: Each component can be tested independently

## Testing the Migration

1. **Test Basic Playback**:
   - Play/pause/stop for each track type
   - Seek to different positions
   - BPM changes

2. **Test Instance Features**:
   - Multiple instances of the same track
   - Different trim settings per instance
   - Instance position changes during playback

3. **Test Track Operations**:
   - Volume changes
   - Mute/unmute
   - Track addition/removal

4. **Test MIDI Operations**:
   - Note addition/removal
   - Note editing
   - Instance-specific notes

## Rollback Plan

If issues arise, the old system remains intact. You can switch back by:

1. Reverting Store.ts changes
2. Using original TransportController instead of RefactoredTransportController
3. The old files are not deleted, just not used

## Gradual Migration

You can migrate track-by-track:

1. Start with AUDIO tracks (simplest)
2. Then SAMPLER tracks
3. Then MIDI tracks
4. Finally DRUM tracks (most complex)

Use feature flags if needed:

```typescript
const USE_NEW_AUDIO_SYSTEM = true;

if (USE_NEW_AUDIO_SYSTEM) {
  await this.audioIntegration.play();
} else {
  await this.transport.play(tracks);
}
```

## Common Issues and Solutions

### Issue: Audio doesn't play after migration
- **Check**: Audio contexts are initialized
- **Solution**: Ensure `audioIntegration.initialize()` is called

### Issue: MIDI notes don't play
- **Check**: MIDI Manager is connected
- **Solution**: Verify `midiManager.registerInstance()` is called for each instance

### Issue: Trim settings not working
- **Check**: TimingCalculator calculations
- **Solution**: Verify instance trim values are correctly set

## Next Steps

After successful migration:

1. Remove old transport.ts
2. Remove old audioEngine.ts
3. Remove instance aggregation logic from soundfontEngineController
4. Clean up unused imports and methods
5. Update tests to use new system