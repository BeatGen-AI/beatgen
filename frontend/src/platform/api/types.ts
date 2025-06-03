/**
 * Common API types and interfaces shared across the application
 */

/**
 * Custom error interface that includes status and response properties
 * Extends the base Error interface to provide additional API-specific error information
 */
export interface ApiError extends Error {
  status?: number;
  response?: any;
}