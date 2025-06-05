/**
 * Pagination constants used throughout the application
 * These values ensure consistent pagination behavior across all track types
 */

export const PAGINATION_CONSTANTS = {
  /**
   * Number of items to display initially when a paginated component loads
   * Used for the first render before any "Show More" clicks
   */
  INITIAL_DISPLAY_COUNT: 12,

  /**
   * Number of additional items to show when "Show More" is clicked
   * Controls the increment size for progressive disclosure
   */
  DISPLAY_INCREMENT: 6,

  /**
   * Number of items to fetch from the backend API per request
   * Larger values reduce API calls but increase memory usage
   */
  API_PAGE_SIZE: 20,

  /**
   * Buffer threshold for prefetching the next page
   * When displayed items are within this many items of the fetched total,
   * trigger the next API call
   */
  FETCH_THRESHOLD: 10,

  /**
   * Maximum items to show before forcing pagination
   * Prevents performance issues with very large datasets
   */
  MAX_ITEMS_WITHOUT_PAGINATION: 100,
} as const;

/**
 * Pagination configuration for different track types
 * Allows customization per track type while maintaining consistency
 */
export const TRACK_PAGINATION_CONFIG = {
  PROJECTS: {
    INITIAL_DISPLAY_COUNT: PAGINATION_CONSTANTS.INITIAL_DISPLAY_COUNT,
    DISPLAY_INCREMENT: PAGINATION_CONSTANTS.DISPLAY_INCREMENT,
    API_PAGE_SIZE: PAGINATION_CONSTANTS.API_PAGE_SIZE,
  },
  AUDIO_TRACKS: {
    INITIAL_DISPLAY_COUNT: PAGINATION_CONSTANTS.INITIAL_DISPLAY_COUNT,
    DISPLAY_INCREMENT: PAGINATION_CONSTANTS.DISPLAY_INCREMENT,
    API_PAGE_SIZE: PAGINATION_CONSTANTS.API_PAGE_SIZE,
  },
  MIDI_TRACKS: {
    INITIAL_DISPLAY_COUNT: PAGINATION_CONSTANTS.INITIAL_DISPLAY_COUNT,
    DISPLAY_INCREMENT: PAGINATION_CONSTANTS.DISPLAY_INCREMENT,
    API_PAGE_SIZE: PAGINATION_CONSTANTS.API_PAGE_SIZE,
  },
  SAMPLER_TRACKS: {
    INITIAL_DISPLAY_COUNT: PAGINATION_CONSTANTS.INITIAL_DISPLAY_COUNT,
    DISPLAY_INCREMENT: PAGINATION_CONSTANTS.DISPLAY_INCREMENT,
    API_PAGE_SIZE: 10, // Smaller page size for performance
  },
  DRUM_TRACKS: {
    INITIAL_DISPLAY_COUNT: PAGINATION_CONSTANTS.INITIAL_DISPLAY_COUNT,
    DISPLAY_INCREMENT: PAGINATION_CONSTANTS.DISPLAY_INCREMENT,
    API_PAGE_SIZE: 10, // Smaller page size for performance
  },
} as const;

/**
 * Type definitions for pagination configuration
 */
export type PaginationConfig = typeof TRACK_PAGINATION_CONFIG.PROJECTS;

/**
 * Helper function to get pagination config for a specific track type
 */
export function getPaginationConfig(trackType: keyof typeof TRACK_PAGINATION_CONFIG): PaginationConfig {
  return TRACK_PAGINATION_CONFIG[trackType];
}

/**
 * Validation constants for pagination parameters
 */
export const PAGINATION_LIMITS = {
  MIN_PAGE_SIZE: 1,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_NUMBER: 1,
  MAX_DISPLAY_COUNT: 1000,
} as const;