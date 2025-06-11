/**
 * Selection system exports
 * Extracted from piano roll logic for reuse across components
 */

// Core utilities
export * from './selectionUtils';

// Grid constants (for convenience)
export { GridSnapOption, getSnapSizeInPixels, getAllGridSnapOptions, getGridSnapOptionName } from '../../components/piano-roll2/gridConstants';

// React hook
export { default as useMultiSelection } from './useMultiSelection';

// Test utilities
export { default as testSelection } from './test-selection';