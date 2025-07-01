/**
 * Test suite runner for SamplerController
 * 
 * This file imports and runs all SamplerController test suites.
 * Run with: npm test samplerController.test-all
 */

// Import all test suites
import './samplerController.initialization.test';
import './samplerController.transport.test';
import './samplerController.controls.test';
import './samplerController.disposal.test';
import './samplerController.edge-cases.test';
import './samplerController.integration.test';

/**
 * Test Coverage Summary:
 * 
 * 1. Initialization Tests (samplerController.initialization.test.ts)
 *    - initializeSampler method with various scenarios
 *    - connectTrackToSampler workflow
 *    - registerTrackSubscription and MidiManager integration
 *    - Sampler management (get, has, remove)
 *    - Edge cases for initialization
 * 
 * 2. Transport Integration Tests (samplerController.transport.test.ts)
 *    - play() method with multiple samplers
 *    - pause() functionality
 *    - stop() method and cleanup
 *    - seek() implementation
 *    - Transport state management across cycles
 *    - Handling samplers added/removed during playback
 * 
 * 3. Individual Sampler Controls (samplerController.controls.test.ts)
 *    - playNote() for single note preview
 *    - setBaseMidiNote() for pitch adjustment
 *    - setGrainSize() and setOverlap() for granular synthesis
 *    - setTrackOffset() for timing adjustment
 *    - setTrackVolume() and setTrackMute()
 *    - Parameter validation and edge values
 *    - Multiple sampler independent control
 * 
 * 4. Resource Management and Disposal (samplerController.disposal.test.ts)
 *    - Single track disposal
 *    - Full controller disposal
 *    - removeSampler() method
 *    - Memory leak prevention
 *    - Error handling during disposal
 *    - Disposal state verification
 * 
 * 5. Edge Cases and Error Handling (samplerController.edge-cases.test.ts)
 *    - Concurrent operations
 *    - Invalid input handling
 *    - Subscription edge cases
 *    - Transport edge cases
 *    - Resource cleanup edge cases
 *    - State consistency after errors
 *    - Unimplemented method handling
 * 
 * 6. Integration Tests (samplerController.integration.test.ts)
 *    - Full workflow from initialization to disposal
 *    - Multiple tracks with different configurations
 *    - Dynamic track management during playback
 *    - Real-time note updates through MidiManager
 *    - Error recovery scenarios
 *    - Performance scenarios with many tracks
 * 
 * Key Test Scenarios Covered:
 * - Empty samplers (no audio file)
 * - Multiple rapid initializations
 * - Subscription cleanup and memory management
 * - Error propagation and recovery
 * - Concurrent operations on same/different tracks
 * - Parameter validation with extreme values
 * - Transport state consistency
 * - Resource disposal and cleanup
 * - Integration with MidiManager
 * - Performance with many tracks/updates
 */

console.log('Running all SamplerController tests...');