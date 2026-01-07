/**
 * Utility functions for timeline-based positioning in track renderers.
 * These functions handle the conversion between timeline coordinates and pixel positions
 * for consistent viewport behavior across different track types.
 */

import { MUSIC_CONSTANTS } from '../constants/musicConstants';
import { DEFAULT_MEASURE_WIDTH } from '../core/state/gridStore';

export interface VisibleTimeRange {
  startTicks: number;
  endTicks: number;
}

/**
 * Convert timeline position (in ticks) to pixel position
 * @param ticks - Timeline position in ticks
 * @param pixelsPerTick - Zoom level (pixels per tick)
 * @param contentOffset - Viewport offset in pixels
 * @returns Pixel position on screen
 */
export function timelinePositionToPixels(
  ticks: number,
  pixelsPerTick: number,
  contentOffset: number
): number {
  return (ticks * pixelsPerTick) + contentOffset;
}

/**
 * Convert pixel position to timeline position (in ticks)
 * @param pixels - Pixel position on screen
 * @param pixelsPerTick - Zoom level (pixels per tick)
 * @param contentOffset - Viewport offset in pixels
 * @returns Timeline position in ticks
 */
export function pixelPositionToTimeline(
  pixels: number,
  pixelsPerTick: number,
  contentOffset: number
): number {
  return (pixels - contentOffset) / pixelsPerTick;
}

/**
 * Calculate the visible time range for the current viewport
 * @param width - Viewport width in pixels
 * @param contentOffset - Viewport offset in pixels
 * @param pixelsPerTick - Zoom level (pixels per tick)
 * @returns Object with startTicks and endTicks of visible range
 */
export function getVisibleTimeRange(
  width: number,
  contentOffset: number,
  pixelsPerTick: number
): VisibleTimeRange {
  const startTicks = pixelPositionToTimeline(0, pixelsPerTick, contentOffset);
  const endTicks = pixelPositionToTimeline(width, pixelsPerTick, contentOffset);
  
  return {
    startTicks: Math.max(0, startTicks), // Don't go negative
    endTicks: Math.max(0, endTicks)
  };
}

/**
 * Check if a timeline position is within the visible viewport
 * @param ticks - Timeline position in ticks
 * @param visibleRange - Visible time range from getVisibleTimeRange
 * @returns True if the position is visible
 */
export function isPositionVisible(
  ticks: number,
  visibleRange: VisibleTimeRange
): boolean {
  return ticks >= visibleRange.startTicks && ticks <= visibleRange.endTicks;
}

/**
 * Check if a timeline range (with duration) is within or overlaps the visible viewport
 * @param startTicks - Start position in ticks
 * @param durationTicks - Duration in ticks
 * @param visibleRange - Visible time range from getVisibleTimeRange
 * @returns True if the range overlaps with visible area
 */
export function isRangeVisible(
  startTicks: number,
  durationTicks: number,
  visibleRange: VisibleTimeRange
): boolean {
  const endTicks = startTicks + durationTicks;
  
  // Check if ranges overlap
  return startTicks <= visibleRange.endTicks && endTicks >= visibleRange.startTicks;
}

/**
 * Calculate the width in pixels for a given duration in ticks
 * @param durationTicks - Duration in ticks
 * @param pixelsPerTick - Zoom level (pixels per tick)
 * @returns Width in pixels
 */
export function durationToPixels(
  durationTicks: number,
  pixelsPerTick: number
): number {
  return durationTicks * pixelsPerTick;
}

/**
 * Calculate grid positions for a repeating pattern
 * @param stepCount - Number of steps in the pattern
 * @param ticksPerStep - Ticks per step (e.g., 120 for 16th notes)
 * @param pixelsPerTick - Zoom level (pixels per tick)
 * @param contentOffset - Viewport offset in pixels
 * @param visibleRange - Visible time range to filter results
 * @returns Array of step positions that are visible
 */
export function getVisiblePatternSteps(
  stepCount: number,
  ticksPerStep: number,
  pixelsPerTick: number,
  contentOffset: number,
  visibleRange: VisibleTimeRange
): Array<{ stepIndex: number; x: number; ticks: number }> {
  const steps: Array<{ stepIndex: number; x: number; ticks: number }> = [];
  
  for (let stepIndex = 0; stepIndex < stepCount; stepIndex++) {
    const ticks = stepIndex * ticksPerStep;
    
    if (isPositionVisible(ticks, visibleRange)) {
      const x = timelinePositionToPixels(ticks, pixelsPerTick, contentOffset);
      steps.push({ stepIndex, x, ticks });
    }
  }
  
  return steps;
}

/**
 * Calculate the number of ticks per pixel for the given time signature.
 * This is a pure utility function - pass in the time signature parameters.
 *
 * @param beatsPerMeasure - Number of beats per measure (e.g., 4 for 4/4)
 * @returns Ticks per pixel at current settings
 */
export function getTicksPerPixel(beatsPerMeasure: number): number {
  const TICKS_PER_BEAT = MUSIC_CONSTANTS.pulsesPerQuarterNote;
  const MEASURE_WIDTH = DEFAULT_MEASURE_WIDTH;
  const beatWidth = MEASURE_WIDTH / beatsPerMeasure;
  const ticksPerPixel = TICKS_PER_BEAT / beatWidth;
  return ticksPerPixel;
}

/**
 * Calculate the number of pixels per tick for the given time signature.
 * This is a pure utility function - pass in the time signature parameters.
 *
 * @param beatsPerMeasure - Number of beats per measure (e.g., 4 for 4/4)
 * @returns Pixels per tick at current settings
 */
export function getPixelsPerTick(beatsPerMeasure: number): number {
  return 1 / getTicksPerPixel(beatsPerMeasure);
}