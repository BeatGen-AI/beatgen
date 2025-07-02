# SoundfontEngineController Testing Strategy

This document outlines the comprehensive unit testing strategy for the `SoundfontEngineController` class, which follows the controller pattern to coordinate between `MidiSoundfontPlayer`, `MidiManager`, and the soundfont loading system.

## Table of Contents
1. [Overview](#overview)
2. [Mock Setup](#mock-setup)
3. [Test Organization](#test-organization)
4. [Integration Test Scenarios](#integration-test-scenarios)
5. [Error Handling Test Cases](#error-handling-test-cases)
6. [Best Practices](#best-practices)

## Overview

The `SoundfontEngineController` acts as a facade that:
- Manages the lifecycle of the `MidiSoundfontPlayer`
- Coordinates with `MidiManager` for MIDI note data
- Handles soundfont loading through the database
- Implements the `TrackPlayer` interface for transport control
- Manages track subscriptions for real-time updates

## Mock Setup

### 1. MidiSoundfontPlayer Mock

```typescript
const mockMidiPlayer = {
  initSynthesizer: vi.fn().mockResolvedValue(undefined),
  waitForInitialization: vi.fn().mockResolvedValue(undefined),
  addTrack: vi.fn().mockResolvedValue(undefined),
  removeTrack: vi.fn(),
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  stop: vi.fn().mockResolvedValue(undefined),
  seek: vi.fn().mockResolvedValue(undefined),
  muteTrack: vi.fn(),
  setTrackVolume: vi.fn(),
  setTrackOffset: vi.fn(),
  setGlobalBPM: vi.fn().mockResolvedValue(undefined),
  getTrack: vi.fn(),
  getTrackIds: vi.fn().mockReturnValue([]),
  isPlayerPlaying: vi.fn().mockReturnValue(false),
  getCurrentTick: vi.fn().mockReturnValue(0),
  dispose: vi.fn()
};
```

**Key Points:**
- Mock all public methods of `MidiSoundfontPlayer`
- Use `mockResolvedValue` for async methods
- Provide sensible defaults (empty arrays, false booleans, zero values)
- Allow method behavior to be overridden per test

### 2. MidiManager Mock

```typescript
const mockMidiManager = {
  hasTrack: vi.fn().mockReturnValue(false),
  createTrack: vi.fn(),
  getTrackNotes: vi.fn().mockReturnValue([]),
  subscribeToTrack: vi.fn().mockReturnValue(() => {})
};
```

**Key Points:**
- Focus on methods used by the controller
- `subscribeToTrack` returns an unsubscribe function
- Default to "track doesn't exist" for `hasTrack`

### 3. Database and Soundfont Loading Mock

```typescript
vi.mock('../soundfont/soundfontManager', () => ({
  default: {
    getInstance: vi.fn(() => ({
      getSoundfont: vi.fn().mockResolvedValue({
        data: new ArrayBuffer(1024),
        storage_key: 'test-soundfont-key'
      })
    }))
  }
}));
```

**Key Points:**
- Mock the module at the top level
- Return realistic data structures (ArrayBuffer for soundfont data)
- Include optional fields like `storage_key`

### 4. Helper Functions

```typescript
// Create mock notes with realistic data
const createMockNotes = (count: number = 3): Note[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    row: 60 + i,  // MIDI note numbers
    column: i * 480,  // Timing in ticks
    length: 480,  // Note duration
    trackId: 'test-track',
    velocity: 100
  }));
};

// Create mock sequencer wrapper
const createMockSequencerWrapper = (): Partial<SequencerWrapper> => ({
  getChannel: 1,
  updateWithNotes: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  // ... other methods
});
```

## Test Organization

### 1. Initialization Tests

Test the controller's initialization lifecycle:

```typescript
describe('Initialization', () => {
  it('should create a new MidiSoundfontPlayer instance on construction')
  it('should initialize the MidiSoundfontPlayer with AudioContext')
  it('should handle initialization errors')
  it('should wait for initialization before adding tracks')
});
```

### 2. Transport Methods

Test playback control methods:

```typescript
describe('Transport Methods', () => {
  describe('play', () => {
    it('should start playback without seeking')
    it('should seek before playing when startTime is provided')
  });
  
  describe('pause', () => {
    it('should pause playback and log player state')
  });
  
  describe('stop', () => {
    it('should stop playback')
  });
  
  describe('seek', () => {
    it('should seek to position in milliseconds')
  });
});
```

### 3. Track Operations

Test track management methods:

```typescript
describe('Track Operations', () => {
  describe('addTrack', () => {
    it('should add a track with notes and soundfont')
    it('should handle errors when adding track fails')
  });
  
  describe('muteTrack', () => {
    it('should mute a track')
    it('should unmute a track')
  });
  
  describe('setTrackVolume', () => {
    it('should set track volume with MIDI conversion')
  });
});
```

### 4. Track Subscription Management

Test the subscription system for real-time updates:

```typescript
describe('Track Subscription Management', () => {
  describe('registerTrackSubscription', () => {
    it('should subscribe to track updates')
    it('should unsubscribe from previous subscription')
    it('should handle track updates for existing tracks')
    it('should warn when track does not exist in sequencer')
    it('should handle errors in update callback')
  });
});
```

## Integration Test Scenarios

### 1. Complete Playback Workflow

```typescript
it('should handle complete playback workflow', async () => {
  // 1. Connect track
  await controller.connectTrackToSoundfont(trackId, 'piano', mockMidiManager);
  
  // 2. Set track properties
  await controller.setTrackVolume(trackId, 75);
  controller.setTrackOffset(trackId, 500);
  
  // 3. Start playback
  await controller.play(2.0);
  
  // 4. Pause and seek
  await controller.pause();
  await controller.seek(5000);
  
  // 5. Resume and stop
  await controller.play();
  await controller.stop();
});
```

### 2. Multi-Track Scenario

```typescript
it('should handle multi-track scenario', async () => {
  const tracks = ['track-1', 'track-2', 'track-3'];
  
  // Connect multiple tracks
  for (const trackId of tracks) {
    await controller.connectTrackToSoundfont(trackId, 'piano', mockMidiManager);
  }
  
  // Control individual tracks
  controller.muteTrack('track-2', true);
  await controller.setTrackVolume('track-1', 100);
  
  // Start synchronized playback
  await controller.play();
});
```

### 3. Dynamic Updates During Playback

```typescript
it('should handle dynamic track updates during playback', async () => {
  // Setup and start playback
  await controller.connectTrackToSoundfont(trackId, 'piano', mockMidiManager);
  await controller.play();
  
  // Simulate note update via subscription
  const callback = mockMidiManager.subscribeToTrack.mock.calls[0][1];
  callback(trackId, updatedNotes);
  
  // Verify sequencer was updated
  expect(mockSequencer.updateWithNotes).toHaveBeenCalledWith(updatedNotes);
});
```

## Error Handling Test Cases

### 1. Initialization Errors

```typescript
it('should handle initialization not started error', async () => {
  mockMidiPlayer.waitForInitialization.mockRejectedValueOnce(
    new Error('Synthesizer initialization not started')
  );
  
  await expect(
    controller.connectTrackToSoundfont('track-1', 'piano', mockMidiManager)
  ).rejects.toThrow('Cannot connect track track-1 to soundfont: MidiPlayer not initialized');
});
```

### 2. Resource Loading Errors

```typescript
it('should handle soundfont data not found', async () => {
  mockSoundfontManager.getSoundfont.mockResolvedValueOnce(null);
  
  await expect(
    controller.connectTrackToSoundfont('track-1', 'piano', mockMidiManager)
  ).rejects.toThrow('No soundfont data found for instrument piano');
});
```

### 3. Track Operation Errors

```typescript
it('should handle track add errors during connection', async () => {
  mockMidiPlayer.addTrack.mockRejectedValueOnce(new Error('Audio worklet error'));
  
  await expect(
    controller.connectTrackToSoundfont('track-1', 'piano', mockMidiManager)
  ).rejects.toThrow('Audio worklet error');
});
```

## Best Practices

### 1. Test Isolation

- Always use `beforeEach` to create fresh mocks
- Clear all mocks with `vi.clearAllMocks()`
- Dispose of the controller in `afterEach`

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  controller = new SoundfontEngineController();
});

afterEach(() => {
  controller.dispose();
});
```

### 2. Async Testing

- Always `await` async operations
- Use `mockResolvedValue` for successful async mocks
- Use `mockRejectedValue` for error cases

```typescript
// Success case
mockMidiPlayer.play.mockResolvedValue(undefined);
await expect(controller.play()).resolves.not.toThrow();

// Error case
mockMidiPlayer.play.mockRejectedValue(new Error('Playback failed'));
await expect(controller.play()).rejects.toThrow('Playback failed');
```

### 3. Spy on Console Methods

- Use `vi.spyOn(console, 'log')` to verify logging behavior
- Important for debugging and monitoring features

```typescript
const consoleSpy = vi.spyOn(console, 'log');
await controller.pause();
expect(consoleSpy).toHaveBeenCalledWith('SoundfontEngineController: Pausing playback');
```

### 4. Edge Cases and Boundaries

Always test:
- Empty arrays (`[]`)
- Zero and negative values
- Null/undefined handling
- Extreme values (very large numbers)
- Rapid state changes

### 5. Mock Verification

Use Vitest's mock assertions:
- `toHaveBeenCalled()` - method was called
- `toHaveBeenCalledTimes(n)` - called exactly n times
- `toHaveBeenCalledWith(args)` - called with specific arguments
- `not.toHaveBeenCalled()` - method was not called

### 6. Test Naming Conventions

- Use descriptive test names that explain the scenario
- Follow the pattern: "should [expected behavior] when [condition]"
- Group related tests with `describe` blocks

## Running the Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test soundfontEngineController.test.ts

# Run in watch mode
npm test -- --watch

# Run with UI
npm test -- --ui
```

## Future Considerations

1. **Performance Tests**: Add benchmarking for multi-track scenarios
2. **Real Integration Tests**: Test with actual audio files and soundfonts
3. **Memory Leak Tests**: Verify proper cleanup of resources
4. **Concurrency Tests**: Test parallel track operations
5. **Browser Compatibility**: Test AudioWorklet support across browsers