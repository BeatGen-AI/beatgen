# Audio Test Utilities

This directory contains comprehensive test utilities for testing audio-related functionality in the BeatGen studio application.

## Overview

The test utilities are organized into several modules:

- **audioContextMocks.ts** - Mock implementations of Web Audio API classes
- **midiTestData.ts** - Generators for MIDI and note test data
- **audioFileUtils.ts** - Utilities for creating and testing audio files
- **timeUtils.ts** - Time control and timing test utilities
- **audioAssertions.ts** - Custom assertions for audio-specific testing
- **testFactories.ts** - Factories for creating complex test objects
- **index.ts** - Main entry point with convenience exports

## Usage Examples

### Basic Setup

```typescript
import { setupAudioTest, createMockAudioContext } from '@/studio/test-utils';

describe('MyAudioComponent', () => {
  let cleanup: () => void;

  beforeEach(() => {
    const setup = setupAudioTest();
    cleanup = setup.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should initialize audio context', async () => {
    const context = createMockAudioContext();
    expect(context.state).toBe('suspended');
    
    await context.resume();
    expect(context.state).toBe('running');
  });
});
```

### Testing with MIDI Data

```typescript
import { 
  createTestNotes, 
  createTestMidiTrack,
  MIDI_TEST_PATTERNS 
} from '@/studio/test-utils';

it('should handle MIDI notes', () => {
  // Create a scale pattern
  const notes = createTestNotes({
    count: 8,
    pattern: 'scale',
    startRow: 60, // Middle C
  });

  // Create a chord
  const chord = createTestNotes({
    count: 3,
    pattern: 'chord',
    startColumn: 0,
  });

  // Use predefined patterns
  const chromatic = createTestNotes({
    customPattern: MIDI_TEST_PATTERNS.CHROMATIC,
    pattern: 'custom',
  });
});
```

### Testing Audio Files

```typescript
import { 
  createValidWavFile, 
  createMockAudioFile,
  simulateAudioFileLoad 
} from '@/studio/test-utils';

it('should load audio file', async () => {
  const file = createValidWavFile({
    duration: 2,
    sampleRate: 44100,
    frequency: 440, // A4
  });

  const buffer = await simulateAudioFileLoad(file, {
    onProgress: (progress) => {
      console.log(`Loading: ${progress}%`);
    },
  });

  expect(buffer).toBeDefined();
});
```

### Time-based Testing

```typescript
import { 
  createMockTimerController, 
  TransportTimeHelper 
} from '@/studio/test-utils';

it('should handle timing', () => {
  const timer = createMockTimerController();
  timer.setupGlobalMocks();

  let callbackCalled = false;
  timer.scheduleAfter(1000, () => {
    callbackCalled = true;
  });

  // Advance time by 500ms
  timer.advance(500);
  expect(callbackCalled).toBe(false);

  // Advance to 1000ms total
  timer.advance(500);
  expect(callbackCalled).toBe(true);

  // Test musical time
  const transport = new TransportTimeHelper(120); // 120 BPM
  expect(transport.beatsToSeconds(4)).toBe(2); // 4 beats = 2 seconds
  expect(transport.notationToSeconds('1:0:0')).toBe(2); // 1 bar = 2 seconds
});
```

### Custom Assertions

```typescript
import { 
  expectNote, 
  expectAudioBuffer,
  expectMidiNoteTiming,
  expectVelocity 
} from '@/studio/test-utils';

it('should match note properties', () => {
  const note = createTestNote({ row: 60, velocity: 80 });

  // Custom note assertions
  expectNote(note).toMatchNote({ row: 60, velocity: 80 });
  expectNote(note).toBeWithinRange(0, 127, 'row');

  // Velocity assertions
  expectVelocity(note.velocity).toBeValid();
  expectVelocity(note.velocity).toBeInDynamicRange('mf');
});

it('should validate audio buffer', () => {
  const buffer = context.createBuffer(2, 44100, 44100);

  expectAudioBuffer(buffer).toHaveProperties({
    duration: 1,
    numberOfChannels: 2,
    sampleRate: 44100,
  });

  expectAudioBuffer(buffer).toHaveSilence();
});
```

### Complex Test Scenarios

```typescript
import { 
  createTestProject,
  createTestTrack,
  createMultiTrackScenario 
} from '@/studio/test-utils';

it('should handle multi-track project', async () => {
  const project = createTestProject({
    name: 'My Test Project',
    bpm: 140,
    tracks: [
      createTestTrack({
        name: 'Piano',
        type: 'midi',
        notes: createTestNotes({ count: 16 }),
      }),
      createTestTrack({
        name: 'Drums',
        type: 'drum',
        notes: createTestNotes({
          customPattern: MIDI_TEST_PATTERNS.BASIC_DRUM_PATTERN,
          pattern: 'custom',
        }),
      }),
    ],
  });

  expect(project.tracks).toHaveLength(2);
});
```

### Performance Testing

```typescript
import { createPerformanceMonitor } from '@/studio/test-utils';

it('should measure performance', async () => {
  const monitor = createPerformanceMonitor();

  // Measure operation time
  const stop = monitor.start('audioProcessing');
  await processAudio();
  stop();

  const metrics = monitor.getMetrics('audioProcessing');
  expect(metrics.avg).toBeLessThan(100); // Should complete in < 100ms
});
```

## Best Practices

1. **Always clean up**: Use the cleanup functions provided to avoid memory leaks and test interference.

2. **Use appropriate mocks**: Choose the right level of mocking for your tests:
   - Unit tests: Use full mocks
   - Integration tests: Use partial mocks or real implementations where appropriate

3. **Test timing carefully**: Use `MockTimerController` for deterministic time-based tests.

4. **Validate audio data**: Use the custom assertions to ensure audio data meets expectations.

5. **Create reusable test data**: Use the factory functions to create consistent test data across tests.

## Integration with Testing Frameworks

These utilities are designed to work with Vitest but can be adapted for Jest with minimal changes. The main difference would be in the import statements and some mock function syntax.

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/studio/test-utils/setup.ts'],
  },
});
```

### Test Setup File

```typescript
// setup.ts
import { setupGlobalAudioMocks } from './audioContextMocks';

// Setup global mocks before all tests
beforeAll(() => {
  setupGlobalAudioMocks();
});
```

## Contributing

When adding new test utilities:

1. Follow the existing patterns and naming conventions
2. Add TypeScript types for all parameters and return values
3. Include JSDoc comments for complex functions
4. Update this README with usage examples
5. Consider backwards compatibility

## Troubleshooting

### Common Issues

1. **"AudioContext is not defined"**
   - Make sure to call `setupGlobalAudioMocks()` before your tests

2. **Timing tests are flaky**
   - Use `MockTimerController` instead of real timers
   - Ensure you're advancing time explicitly in tests

3. **File loading fails**
   - Check that you're using the mock FileReader
   - Ensure the file data is properly formatted

4. **Audio nodes not connecting**
   - Verify that mock functions are properly set up
   - Check that you're using the mocked audio context