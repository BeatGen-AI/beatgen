# SamplerController Testing Strategy

## Overview

This directory contains a comprehensive testing suite for the `SamplerController` class, which manages audio sampler instances and coordinates between MIDI data and audio playback. The testing strategy includes unit tests, integration tests, and utility functions to ensure thorough coverage and maintainable test code.

## Test Files

### 1. `samplerController.test.ts` - Unit Tests
The main unit test suite that tests SamplerController in isolation with mocked dependencies.

**Coverage Areas:**
- Constructor and initialization
- Sampler instance management (creation, removal, retrieval)
- MIDI subscription management
- Playback control (play, pause, stop, seek)
- Parameter control (volume, mute, offset, grain size, etc.)
- Resource cleanup and disposal
- Error handling and edge cases
- TrackPlayer interface implementation

### 2. `samplerController.integration.test.ts` - Integration Tests
Tests that verify real interactions between SamplerController, MidiSampler, and Tone.js with minimal mocking.

**Coverage Areas:**
- Audio file loading and playback
- MIDI Manager synchronization
- Transport control with Tone.js
- Multi-track coordination
- Resource management under real conditions
- Error recovery scenarios
- Concurrent operations

### 3. `samplerController.test-utils.ts` - Test Utilities
Reusable utilities and helpers for testing sampler-related functionality.

**Utilities Provided:**
- Mock factories (Files, Notes, MidiManager, MidiSampler)
- Tone.js mock setup
- Multi-track scenario builders
- WAV file generation for integration tests
- Assertion helpers
- Snapshot utilities

## Testing Strategy

### 1. Mock Setup

#### MidiSampler Mocking
```typescript
const mockMidiSampler = {
    initialize: vi.fn().mockResolvedValue(undefined),
    loadAudioFile: vi.fn().mockResolvedValue(undefined),
    setBaseNote: vi.fn(),
    setNotes: vi.fn(),
    getNotes: vi.fn().mockReturnValue([]),
    playNote: vi.fn(),
    playMidi: vi.fn(),
    stopPlayback: vi.fn(),
    dispose: vi.fn(),
    // ... other methods
};
```

#### File Object Mocking
```typescript
const mockFile = new File(['audio content'], 'test.wav', { type: 'audio/wav' });
```

#### MidiManager Mocking
```typescript
const mockMidiManager = {
    hasTrack: vi.fn().mockReturnValue(true),
    createTrack: vi.fn(),
    subscribeToTrack: vi.fn().mockReturnValue(() => {}), // unsubscribe function
    getTrackNotes: vi.fn().mockReturnValue([]),
};
```

### 2. Test Suite Organization

#### Unit Test Structure
```
SamplerController
├── Constructor and Initialization
├── Sampler Management
│   ├── initializeSampler
│   ├── removeSampler
│   ├── getSampler
│   ├── hasSampler
│   └── getActiveSamplerIds
├── MIDI Subscription Management
│   ├── registerTrackSubscription
│   └── connectTrackToSampler
├── Playback Control
│   ├── playNote
│   └── Transport Integration
│       ├── play
│       ├── pause
│       ├── stop
│       └── seek
├── Parameter Control
│   ├── setBaseMidiNote
│   ├── setGrainSize
│   ├── setOverlap
│   ├── setTrackOffset
│   ├── setTrackVolume
│   └── setTrackMute
├── Resource Cleanup
│   └── dispose
├── Edge Cases and Error Handling
└── TrackPlayer Interface Implementation
```

### 3. Map-Based Instance Management Testing

The SamplerController uses Maps to manage sampler instances and subscriptions. Key testing patterns:

```typescript
// Test map operations
it('should store sampler in map after initialization', async () => {
    await samplerController.initializeSampler('track-1', mockFile);
    expect(samplerController.hasSampler('track-1')).toBe(true);
    expect(samplerController.getSampler('track-1')).toBe(mockMidiSampler);
});

// Test map cleanup
it('should remove sampler from map on disposal', () => {
    samplerController.removeSampler('track-1');
    expect(samplerController.hasSampler('track-1')).toBe(false);
});

// Test concurrent map access
it('should handle concurrent map operations', async () => {
    const promises = trackIds.map(id => 
        samplerController.initializeSampler(id, mockFile)
    );
    await Promise.all(promises);
    expect(samplerController.getActiveSamplerIds()).toHaveLength(trackIds.length);
});
```

### 4. Transport Integration Testing

Tests verify proper integration with audio transport system:

```typescript
// Test coordinated playback
it('should coordinate playback with transport', async () => {
    await samplerController.play(5, 120);
    
    // Verify all samplers received play command
    expect(mockMidiSampler.playMidi).toHaveBeenCalledWith(120, 5);
});

// Test seek behavior
it('should stop and restart on seek', async () => {
    await samplerController.seek(10, 120);
    
    expect(mockMidiSampler.stopPlayback).toHaveBeenCalled();
    expect(mockMidiSampler.playMidi).toHaveBeenCalledWith(120, 10);
});
```

### 5. MIDI Subscription Testing

Tests verify proper subscription management and note updates:

```typescript
// Test subscription lifecycle
it('should manage subscriptions properly', () => {
    const unsubscribe = vi.fn();
    mockMidiManager.subscribeToTrack.mockReturnValue(unsubscribe);
    
    samplerController.registerTrackSubscription('track-1', mockMidiManager);
    samplerController.removeSampler('track-1');
    
    expect(unsubscribe).toHaveBeenCalled();
});

// Test note updates
it('should update sampler notes on MIDI changes', () => {
    let callback;
    mockMidiManager.subscribeToTrack.mockImplementation((id, cb) => {
        callback = cb;
        return () => {};
    });
    
    samplerController.registerTrackSubscription('track-1', mockMidiManager);
    callback('track-1', mockNotes);
    
    expect(mockMidiSampler.setNotes).toHaveBeenCalledWith(mockNotes);
});
```

### 6. Resource Cleanup Testing

Comprehensive tests for proper resource disposal:

```typescript
// Test individual cleanup
it('should clean up sampler resources', () => {
    samplerController.removeSampler('track-1');
    
    expect(mockMidiSampler.dispose).toHaveBeenCalled();
    expect(samplerController.hasSampler('track-1')).toBe(false);
});

// Test global cleanup
it('should dispose all resources', () => {
    samplerController.dispose();
    
    expect(samplerController.getActiveSamplerIds()).toEqual([]);
    expect(mockMidiSampler.dispose).toHaveBeenCalledTimes(samplerCount);
});

// Test cleanup during active playback
it('should handle disposal during playback', async () => {
    await samplerController.play(0, 120);
    samplerController.dispose();
    
    expect(mockMidiSampler.stopPlayback).toHaveBeenCalled();
    expect(mockMidiSampler.dispose).toHaveBeenCalled();
});
```

## Running the Tests

```bash
# Run all tests
npm test samplerController

# Run unit tests only
npm test samplerController.test.ts

# Run integration tests only
npm test samplerController.integration.test.ts

# Run with coverage
npm test -- --coverage samplerController

# Run in watch mode
npm test -- --watch samplerController
```

## Best Practices

1. **Isolation**: Unit tests mock all external dependencies to test SamplerController logic in isolation.

2. **Real Integration**: Integration tests use minimal mocking to verify actual behavior with Tone.js.

3. **Resource Management**: Always clean up resources in `afterEach` to prevent test pollution.

4. **Async Handling**: Use proper async/await patterns and wait helpers for timing-dependent tests.

5. **Error Scenarios**: Test both success and failure paths, including error recovery.

6. **Console Output**: Mock console methods to verify logging behavior without polluting test output.

7. **Concurrent Operations**: Test race conditions and concurrent access to shared resources.

## Common Testing Patterns

### Testing Async Initialization
```typescript
it('should initialize sampler asynchronously', async () => {
    const promise = samplerController.initializeSampler('track-1', mockFile);
    expect(promise).toBeInstanceOf(Promise);
    await promise;
    expect(samplerController.hasSampler('track-1')).toBe(true);
});
```

### Testing Event Subscriptions
```typescript
it('should handle subscription updates', () => {
    const { mockSubscriptions } = createMockMidiManager();
    
    samplerController.registerTrackSubscription('track-1', midiManager);
    expect(mockSubscriptions.has('track-1')).toBe(true);
    
    // Trigger update
    mockSubscriptions.get('track-1')('track-1', notes);
    expect(mockMidiSampler.setNotes).toHaveBeenCalledWith(notes);
});
```

### Testing Resource Lifecycle
```typescript
it('should manage resource lifecycle', async () => {
    // Create
    await samplerController.initializeSampler('track-1', mockFile);
    
    // Update
    samplerController.setBaseMidiNote('track-1', 72);
    
    // Use
    samplerController.playNote('track-1', 60);
    
    // Destroy
    samplerController.removeSampler('track-1');
    
    // Verify cleanup
    expect(mockMidiSampler.dispose).toHaveBeenCalled();
});
```

## Future Enhancements

1. **Performance Testing**: Add tests for performance metrics and resource usage.

2. **Stress Testing**: Test with large numbers of tracks and notes.

3. **Memory Leak Detection**: Add tests to verify proper memory cleanup.

4. **Visual Regression**: Test audio waveform generation if applicable.

5. **E2E Testing**: Add end-to-end tests with real user interactions.

6. **Benchmark Suite**: Create performance benchmarks for optimization tracking.