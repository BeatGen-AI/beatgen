# MidiSoundfontPlayer Testing Strategy

## Overview
This document outlines a comprehensive unit testing strategy for the MidiSoundfontPlayer and its dependencies.

## Test Structure

### 1. Mock Setup

#### AudioWorkletNodeSynthesizer Mock
```typescript
// Mock factory for creating custom mock behaviors
export const createMockSynth = (overrides?: Partial<AudioWorkletNodeSynthesizer>) => {
  const defaultMock = {
    createAudioNode: jest.fn().mockReturnValue(mockAudioNode),
    loadSFont: jest.fn().mockResolvedValue(1),
    setSFontBankOffset: jest.fn(),
    getSFontBankOffset: jest.fn().mockResolvedValue(100),
    midiProgramSelect: jest.fn(),
    midiControl: jest.fn(),
    midiAllNotesOff: jest.fn(),
    closePlayer: jest.fn(),
    createSequencer: jest.fn().mockResolvedValue(mockSequencer),
    getSFontObject: jest.fn().mockResolvedValue({
      getPresetIterable: jest.fn().mockResolvedValue([{ bankNum: 0, num: 0 }])
    }),
    ...overrides
  };
  return defaultMock as jest.Mocked<AudioWorkletNodeSynthesizer>;
};
```

#### SequencerWrapper Mock
```typescript
// Mock factory for SequencerWrapper
export const createMockSequencerWrapper = (overrides?: Partial<SequencerWrapper>) => {
  const defaultMock = {
    initialize: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    mute: jest.fn(),
    unmute: jest.fn(),
    setVolume: jest.fn(),
    seekToGlobalTime: jest.fn().mockResolvedValue(undefined),
    resetPosition: jest.fn(),
    dispose: jest.fn().mockResolvedValue(undefined),
    setOffset: jest.fn(),
    getOffset: jest.fn().mockReturnValue(0),
    setBPM: jest.fn(),
    getBPM: jest.fn().mockReturnValue(120),
    getChannel: 0,
    isMuted: false,
    ...overrides
  };
  return defaultMock as jest.Mocked<SequencerWrapper>;
};
```

#### AudioContext Mock
```typescript
export const createMockAudioContext = () => ({
  destination: {},
  audioWorklet: {
    addModule: jest.fn().mockResolvedValue(undefined)
  },
  sampleRate: 44100,
  currentTime: 0,
  state: 'running' as AudioContextState
} as unknown as AudioContext);
```

### 2. Test Suite Organization

```
MidiSoundfontPlayer/
├── Initialization
│   ├── Constructor defaults
│   ├── Synthesizer initialization
│   ├── Error handling
│   └── Race conditions
├── Track Management
│   ├── Adding tracks
│   ├── Removing tracks
│   ├── Channel assignment
│   └── Soundfont loading
├── Playback Control
│   ├── Play/Pause/Stop
│   ├── Seeking
│   ├── Position tracking
│   └── State consistency
├── Track-specific Controls
│   ├── Individual play/pause
│   ├── Mute/unmute
│   ├── Volume control
│   ├── Offset management
│   └── BPM control
├── Global Controls
│   ├── Global BPM
│   ├── Master position
│   └── Bank offset management
├── Cleanup
│   ├── Resource disposal
│   ├── Memory leaks prevention
│   └── Error recovery
└── Edge Cases
    ├── Concurrent operations
    ├── Channel exhaustion
    └── Rapid state changes
```

### 3. Key Test Cases

#### Initialization Tests
```typescript
describe('Initialization', () => {
  it('should handle multiple initialization attempts gracefully', async () => {
    const promises = Array(5).fill(null).map(() => 
      player.initSynthesizer(mockAudioContext)
    );
    
    await Promise.all(promises);
    expect(mockSynth.createAudioNode).toHaveBeenCalledTimes(1);
  });

  it('should recover from initialization failure', async () => {
    mockAudioContext.audioWorklet.addModule = jest.fn()
      .mockRejectedValueOnce(new Error('First attempt fails'))
      .mockResolvedValue(undefined);
    
    await expect(player.initSynthesizer(mockAudioContext)).rejects.toThrow();
    await expect(player.initSynthesizer(mockAudioContext)).resolves.toBeUndefined();
  });
});
```

#### Track Management Tests
```typescript
describe('Track Management', () => {
  it('should maintain track order during concurrent additions', async () => {
    const tracks = Array(10).fill(null).map((_, i) => ({
      id: `track${i}`,
      notes: createTestNotes(),
      soundfont: new ArrayBuffer(1024)
    }));
    
    const promises = tracks.map(t => 
      player.addTrack(t.id, t.notes, t.soundfont)
    );
    
    await Promise.all(promises);
    
    const trackIds = player.getTrackIds();
    expect(trackIds).toHaveLength(10);
    tracks.forEach(t => expect(trackIds).toContain(t.id));
  });

  it('should handle partial track initialization failure', async () => {
    let callCount = 0;
    mockSequencerWrapper.initialize = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return Promise.reject(new Error('Track 2 init failed'));
      }
      return Promise.resolve(undefined);
    });
    
    const results = await Promise.allSettled([
      player.addTrack('track1', notes, soundfont),
      player.addTrack('track2', notes, soundfont),
      player.addTrack('track3', notes, soundfont)
    ]);
    
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');
  });
});
```

#### Playback Control Tests
```typescript
describe('Playback Control', () => {
  it('should maintain sync across tracks during playback', async () => {
    // Add tracks with different offsets
    await player.addTrack('track1', notes, soundfont, { startTimeOffset: -1000 });
    await player.addTrack('track2', notes, soundfont, { startTimeOffset: 0 });
    await player.addTrack('track3', notes, soundfont, { startTimeOffset: 1000 });
    
    await player.play();
    
    // Verify all tracks received correct global time
    const calls = mockSequencerWrapper.play.mock.calls;
    expect(calls).toHaveLength(3);
    calls.forEach(call => expect(call[0]).toBe(0)); // All start from global time 0
  });

  it('should handle seek during active playback', async () => {
    await player.play();
    
    // Rapid seeks
    await player.seek(1000);
    await player.seek(2000);
    await player.seek(500);
    
    expect(player.getCurrentTick()).toBe(500);
    expect(player.isPlayerPlaying()).toBe(true);
  });
});
```

### 4. Async Testing Patterns

#### Promise Resolution Testing
```typescript
it('should handle promise rejection in track operations', async () => {
  const errorTracker = jest.fn();
  
  // Set up controlled failures
  mockSynth.loadSFont
    .mockResolvedValueOnce(1)
    .mockRejectedValueOnce(new Error('Soundfont 2 failed'))
    .mockResolvedValueOnce(3);
  
  const operations = [
    player.addTrack('track1', notes, soundfont).catch(errorTracker),
    player.addTrack('track2', notes, soundfont).catch(errorTracker),
    player.addTrack('track3', notes, soundfont).catch(errorTracker)
  ];
  
  await Promise.allSettled(operations);
  
  expect(errorTracker).toHaveBeenCalledTimes(1);
  expect(errorTracker).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Soundfont 2 failed'
  }));
});
```

#### Timeout Testing
```typescript
it('should handle slow operations gracefully', async () => {
  // Simulate slow soundfont loading
  mockSynth.loadSFont.mockImplementation(() => 
    new Promise(resolve => setTimeout(() => resolve(1), 2000))
  );
  
  const startTime = Date.now();
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 3000)
  );
  
  const result = await Promise.race([
    player.addTrack('slowTrack', notes, soundfont),
    timeoutPromise
  ]);
  
  const elapsed = Date.now() - startTime;
  expect(elapsed).toBeGreaterThan(1900);
  expect(elapsed).toBeLessThan(3000);
});
```

### 5. State Verification Strategies

#### State Consistency Checker
```typescript
const verifyPlayerState = (player: MidiSoundfontPlayer, expected: {
  isPlaying: boolean;
  trackCount: number;
  currentTick: number;
  bpm: number;
}) => {
  expect(player.isPlayerPlaying()).toBe(expected.isPlaying);
  expect(player.getTrackIds()).toHaveLength(expected.trackCount);
  expect(player.getCurrentTick()).toBe(expected.currentTick);
  expect(player.getGlobalBPM()).toBe(expected.bpm);
};

// Usage in tests
it('should maintain state consistency through operations', async () => {
  await player.addTrack('track1', notes, soundfont);
  verifyPlayerState(player, {
    isPlaying: false,
    trackCount: 1,
    currentTick: 0,
    bpm: 120
  });
  
  await player.play();
  await player.seek(1000);
  verifyPlayerState(player, {
    isPlaying: true,
    trackCount: 1,
    currentTick: 1000,
    bpm: 120
  });
});
```

#### Track State Verification
```typescript
const verifyTrackState = (
  wrapper: SequencerWrapper,
  expected: {
    channel: number;
    isMuted: boolean;
    bpm: number;
    offset: number;
  }
) => {
  expect(wrapper.getChannel).toBe(expected.channel);
  expect(wrapper.isMuted).toBe(expected.isMuted);
  expect(wrapper.getBPM()).toBe(expected.bpm);
  expect(wrapper.getOffset()).toBe(expected.offset);
};
```

### 6. Integration Test Patterns

#### Mock Coordination Tests
```typescript
describe('Mock Coordination', () => {
  it('should coordinate between synth and sequencer mocks', async () => {
    const sequencerStates = new Map<number, any>();
    
    // Track sequencer states by channel
    mockSynth.createSequencer.mockImplementation(() => {
      const channelSequencer = createMockSequencer();
      const channel = mockSequencerWrapper.getChannel;
      sequencerStates.set(channel, channelSequencer);
      return channelSequencer;
    });
    
    await player.addTrack('track1', notes, soundfont, { channel: 0 });
    await player.addTrack('track2', notes, soundfont, { channel: 1 });
    
    expect(sequencerStates.size).toBe(2);
    expect(sequencerStates.has(0)).toBe(true);
    expect(sequencerStates.has(1)).toBe(true);
  });
});
```

### 7. Performance Testing Patterns

```typescript
describe('Performance', () => {
  it('should handle large numbers of tracks efficiently', async () => {
    const startTime = performance.now();
    const trackCount = 100;
    
    const promises = Array(trackCount).fill(null).map((_, i) => 
      player.addTrack(`track${i}`, createTestNotes(10), new ArrayBuffer(1024))
    );
    
    await Promise.all(promises);
    const elapsed = performance.now() - startTime;
    
    expect(player.getTrackIds()).toHaveLength(trackCount);
    expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
  });
});
```

### 8. Memory Leak Prevention Tests

```typescript
describe('Memory Management', () => {
  it('should properly clean up resources on disposal', async () => {
    const trackRefs = new WeakRef(await player.addTrack('track1', notes, soundfont));
    
    player.removeTrack('track1');
    player.dispose();
    
    // Force garbage collection if available (V8 only)
    if (global.gc) {
      global.gc();
      expect(trackRefs.deref()).toBeUndefined();
    }
  });
});
```

## Best Practices

1. **Always clean up in afterEach**
   ```typescript
   afterEach(() => {
     player?.dispose();
     jest.clearAllMocks();
   });
   ```

2. **Use descriptive test names**
   ```typescript
   it('should maintain track synchronization when seeking during playback with multiple tracks at different offsets', ...)
   ```

3. **Test both success and failure paths**
   ```typescript
   it('should handle soundfont loading success', ...)
   it('should recover from soundfont loading failure', ...)
   ```

4. **Verify mock interactions**
   ```typescript
   expect(mockSynth.midiProgramSelect).toHaveBeenCalledWith(
     expect.any(Number), // channel
     expect.any(Number), // sfontId
     expect.any(Number), // bank
     expect.any(Number)  // preset
   );
   ```

5. **Use test data factories**
   ```typescript
   const createTestTrack = (overrides?: Partial<TestTrack>) => ({
     id: 'test-track',
     notes: createTestNotes(),
     soundfont: new ArrayBuffer(1024),
     options: {},
     ...overrides
   });
   ```

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test midiSoundfontPlayer.test.ts

# Run in watch mode
npm test -- --watch

# Run with verbose output
npm test -- --verbose
```

## Coverage Goals

- **Line Coverage**: > 90%
- **Branch Coverage**: > 85%
- **Function Coverage**: > 95%
- **Statement Coverage**: > 90%

Focus areas for high coverage:
- Error handling paths
- Edge cases (empty tracks, invalid values)
- Async operation handling
- State transitions
- Resource cleanup