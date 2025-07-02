# AudioFilePlayer Unit Testing Strategy

## Overview

This document outlines the comprehensive unit testing strategy for the `AudioFilePlayer` class, which manages audio tracks and playback using Tone.js. The testing approach focuses on isolation through mocking, proper singleton management, and thorough coverage of all functionality.

## Key Testing Challenges & Solutions

### 1. Singleton Pattern Testing

**Challenge**: The AudioFilePlayer uses a singleton pattern, which can cause state leakage between tests.

**Solution**:
```typescript
beforeEach(() => {
  // Reset singleton instance
  (AudioFilePlayer as any).instance = undefined;
  audioFilePlayer = AudioFilePlayer.getInstance();
});

afterEach(() => {
  // Clean up singleton instance
  (AudioFilePlayer as any).instance = undefined;
});
```

**Additional Utility**:
```typescript
export function resetAudioFilePlayerInstance(): void {
  (AudioFilePlayer as any).instance = undefined;
}
```

### 2. Tone.js Mocking

**Challenge**: Tone.js components are complex audio nodes that interact with the Web Audio API.

**Solution**: Complete mock implementation of Tone.js components:

```typescript
vi.mock('tone', () => ({
  Channel: vi.fn(() => ({
    connect: vi.fn().mockReturnThis(),
    toDestination: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
    volume: { value: 0 },
    pan: { value: 0 }
  })),
  Player: vi.fn((config) => {
    const player = {
      connect: vi.fn().mockReturnThis(),
      dispose: vi.fn(),
      stop: vi.fn(),
      volume: { value: 0 },
      state: 'stopped',
      buffer: null,
      // ... other properties
    };
    // Simulate async loading
    if (config?.url) {
      setTimeout(() => {
        player.buffer = { duration: 10 };
      }, 0);
    }
    return player;
  }),
  Transport: {
    bpm: { value: 120 },
    PPQ: 192,
    // ... other properties
  }
}));
```

### 3. Async Operations

**Challenge**: Audio file loading is asynchronous and needs proper handling in tests.

**Solution**: Use async/await patterns and helpers:

```typescript
// Helper function
export function waitForAsync(ms: number = 10): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Usage in tests
const track = await audioFilePlayer.createTrack('track1', 'Test Track', mockFile);
await waitForAsync(); // Wait for buffer to load
```

## Test Categories

### 1. Singleton Pattern Tests
- Verify same instance returned on multiple calls
- Test instance reset functionality
- Ensure no state leakage between test suites

### 2. Initialization Tests
- Test successful initialization
- Verify main output channel creation
- Test error handling during initialization

### 3. Track Management Tests
- **Creation**: With/without audio files, default values, cleanup of existing tracks
- **Removal**: Proper disposal of resources, handling non-existent tracks
- **Updates**: Property updates, preservation of audio instances

### 4. Audio Control Tests
- **Volume**: Linear to dB conversion, channel and player sync, master volume
- **Pan**: Range conversion (-100 to 100 → -1 to 1)
- **Mute**: Volume preservation, -Infinity when muted

### 5. Solo Functionality Tests
- Single track solo behavior
- Multiple tracks soloed simultaneously
- Volume restoration when unsoloing
- Interaction with explicitly muted tracks

### 6. Trim Functionality Tests
- Tick to seconds conversion
- Clamping to buffer duration
- Trim settings persistence
- Edge cases (no buffer, no player)

### 7. Playback Control Tests
- Stop all playback (only running players)
- Pause functionality (maintains sync)
- State management

### 8. Integration Tests
- Complete track lifecycle
- Multiple tracks with complex interactions
- Solo/mute state combinations

## Mock Data Patterns

### Audio File Mock
```typescript
const mockFile = new File(['audio data'], 'test.mp3', { type: 'audio/mp3' });
```

### Track State Mock
```typescript
const mockTrack: AudioTrack = {
  id: 'track1',
  name: 'Test Track',
  channel: mockChannel,
  player: mockPlayer,
  volume: 80,
  pan: 0,
  muted: false,
  soloed: false
};
```

## Testing Best Practices

### 1. State Isolation
- Always reset mocks in `beforeEach`
- Clear singleton instance between tests
- Use fresh mock instances for each test

### 2. Async Handling
- Use `async/await` for all async operations
- Wait for buffer loading when testing trim functionality
- Handle Promise resolutions properly

### 3. Edge Case Coverage
- Test with non-existent track IDs
- Handle null/undefined values
- Test boundary values (volume 0/100, pan -100/100)

### 4. Mock Verification
- Verify mock function calls with correct parameters
- Check call order when sequence matters
- Use `toHaveBeenCalledWith` for precise assertions

### 5. Integration Testing
- Test realistic user workflows
- Verify state consistency across operations
- Test complex interactions between features

## Common Testing Patterns

### Pattern 1: Test State After Operation
```typescript
it('should update state correctly', async () => {
  const track = await audioFilePlayer.createTrack('track1', 'Test');
  await audioFilePlayer.setTrackVolume('track1', 60);
  
  expect(track.volume).toBe(60);
  expect(track.channel.volume.value).toBe(convertVolumeToDecibels(60, false));
});
```

### Pattern 2: Test Side Effects
```typescript
it('should affect other tracks when soloing', async () => {
  const track1 = await audioFilePlayer.createTrack('track1', 'Track 1');
  const track2 = await audioFilePlayer.createTrack('track2', 'Track 2');
  
  audioFilePlayer.setTrackSolo('track1', true);
  
  expect(track2.channel.volume.value).toBe(-Infinity);
});
```

### Pattern 3: Test Error Handling
```typescript
it('should handle non-existent track gracefully', async () => {
  await expect(audioFilePlayer.setTrackVolume('nonexistent', 50))
    .resolves.not.toThrow();
});
```

## Running Tests

### Setup Requirements
1. Install Vitest: `npm install -D vitest @vitest/ui`
2. Add test script to package.json:
   ```json
   {
     "scripts": {
       "test": "vitest",
       "test:ui": "vitest --ui",
       "test:coverage": "vitest --coverage"
     }
   }
   ```

### Vitest Configuration
Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/']
    }
  }
});
```

### Test Setup File
Create `src/test/setup.ts`:
```typescript
import { beforeAll, afterEach, afterAll } from 'vitest';

beforeAll(() => {
  // Global setup
});

afterEach(() => {
  // Reset all mocks after each test
  vi.clearAllMocks();
});

afterAll(() => {
  // Global cleanup
});
```

## Coverage Goals

Target coverage metrics:
- **Line Coverage**: > 90%
- **Branch Coverage**: > 85%
- **Function Coverage**: > 95%
- **Statement Coverage**: > 90%

Focus areas for high coverage:
1. All public methods
2. Edge cases and error paths
3. State transitions
4. Integration scenarios

## Debugging Tests

### Common Issues & Solutions

1. **Async Timing Issues**
   - Use `waitForAsync()` helper
   - Increase timeout if needed
   - Check mock implementation delays

2. **State Leakage**
   - Verify singleton reset in afterEach
   - Check for shared mock instances
   - Look for module-level state

3. **Mock Not Working**
   - Verify mock path matches import
   - Check mock return values
   - Ensure mock is defined before import

### Debug Utilities
```typescript
// Log current state
console.log('Tracks:', audioFilePlayer.getAllTracks());

// Spy on mock calls
const spy = vi.spyOn(mockChannel, 'connect');

// Check mock call history
expect(mockPlayer.stop).toHaveBeenCalledTimes(1);
expect(mockPlayer.stop.mock.calls).toEqual([[]]);
```

## Future Considerations

1. **Performance Testing**: Add tests for handling large numbers of tracks
2. **Memory Leak Detection**: Test proper cleanup of audio resources
3. **Browser Compatibility**: Test with different Web Audio API implementations
4. **Real Audio Integration**: Consider integration tests with actual Tone.js
5. **Snapshot Testing**: Add snapshot tests for complex state objects