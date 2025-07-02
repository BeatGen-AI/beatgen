# AudioFilePlayer Testing Guide

## Quick Start

1. **Install dependencies** (if not already installed):
   ```bash
   npm install
   ```

2. **Run tests**:
   ```bash
   # Run all tests
   npm test

   # Run tests once (no watch mode)
   npm run test:run

   # Run with UI
   npm run test:ui

   # Run with coverage
   npm run test:coverage
   ```

3. **Run specific test file**:
   ```bash
   # Run only AudioFilePlayer tests
   npx vitest audioEngine.test.ts

   # Run example scenarios
   npx vitest audioEngine.example.test.ts
   ```

## Test Files

- **`audioEngine.test.ts`** - Main test suite with comprehensive coverage
- **`audioEngine.example.test.ts`** - Real-world scenario examples
- **`TESTING_STRATEGY.md`** - Detailed testing strategy documentation
- **`vitest.config.ts`** - Test configuration
- **`src/test/setup.ts`** - Global test setup

## Key Testing Concepts

### Singleton Reset
The AudioFilePlayer uses a singleton pattern. Always reset between tests:
```typescript
beforeEach(() => {
  (AudioFilePlayer as any).instance = undefined;
});
```

### Async Operations
Use the helper function for async operations:
```typescript
await waitForAsync(); // Default 10ms
await waitForAsync(50); // Custom delay
```

### Mock Files
Create mock audio files using the global utility:
```typescript
const mockFile = global.testUtils.createMockFile('test.mp3', 'audio/mp3');
```

## Common Commands

```bash
# Run tests matching a pattern
npx vitest -t "solo"

# Run tests in a specific file
npx vitest src/studio/core/audio-engine/audioFilePlayer/audioEngine.test.ts

# Debug a specific test
npx vitest -t "should handle solo" --reporter=verbose

# Watch mode for a specific file
npx vitest audioEngine.test.ts --watch
```

## Debugging Tests

1. **Add console logs**:
   ```typescript
   console.log('Track state:', track);
   ```

2. **Check mock calls**:
   ```typescript
   expect(mockChannel.connect).toHaveBeenCalledTimes(1);
   console.log('Mock calls:', mockChannel.connect.mock.calls);
   ```

3. **Use debugger**:
   ```typescript
   debugger; // Pause execution here
   ```

## Coverage Report

After running `npm run test:coverage`, open `coverage/index.html` in your browser to see detailed coverage report.

## Troubleshooting

- **"Cannot find module 'vitest'"** - Run `npm install`
- **Tests hanging** - Check for unresolved promises or missing `await`
- **Mocks not working** - Ensure mocks are defined before imports
- **State leaking** - Verify singleton reset in beforeEach