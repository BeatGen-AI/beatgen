import { TrackInstance } from '../../../../platform/types/project';
import { MUSIC_CONSTANTS } from '../../../constants/musicConstants';

/**
 * Centralized timing calculator for all audio playback operations.
 * This is the single source of truth for converting between different time units
 * and calculating playback positions.
 */
export class TimingCalculator {
  private static readonly DEFAULT_PPQ = MUSIC_CONSTANTS.pulsesPerQuarterNote; // 480
  
  /**
   * Convert ticks to seconds based on BPM
   * @param ticks Number of ticks
   * @param bpm Beats per minute
   * @param ppq Pulses per quarter note (default: 480)
   */
  static ticksToSeconds(ticks: number, bpm: number, ppq: number = TimingCalculator.DEFAULT_PPQ): number {
    const beats = ticks / ppq;
    const secondsPerBeat = 60 / bpm;
    return beats * secondsPerBeat;
  }
  
  /**
   * Convert seconds to ticks based on BPM
   * @param seconds Time in seconds
   * @param bpm Beats per minute
   * @param ppq Pulses per quarter note (default: 480)
   */
  static secondsToTicks(seconds: number, bpm: number, ppq: number = TimingCalculator.DEFAULT_PPQ): number {
    const secondsPerBeat = 60 / bpm;
    const beats = seconds / secondsPerBeat;
    return Math.round(beats * ppq);
  }
  
  /**
   * Calculate the global timeline position for an instance in seconds
   * @param instance The track instance
   * @param bpm Current BPM
   */
  static getInstanceStartTime(instance: TrackInstance, bpm: number): number {
    return TimingCalculator.ticksToSeconds(instance.x_position, bpm);
  }
  
  /**
   * Calculate the duration of an instance in seconds
   * @param instance The track instance
   * @param bpm Current BPM
   */
  static getInstanceDuration(instance: TrackInstance, bpm: number): number {
    const durationTicks = instance.trim_end_ticks - instance.trim_start_ticks;
    return TimingCalculator.ticksToSeconds(durationTicks, bpm);
  }
  
  /**
   * Calculate the end time of an instance on the global timeline
   * @param instance The track instance
   * @param bpm Current BPM
   */
  static getInstanceEndTime(instance: TrackInstance, bpm: number): number {
    const startTime = TimingCalculator.getInstanceStartTime(instance, bpm);
    const duration = TimingCalculator.getInstanceDuration(instance, bpm);
    return startTime + duration;
  }
  
  /**
   * Calculate how far into an instance we should start playing based on transport position
   * @param instance The track instance
   * @param transportSeconds Current transport position in seconds
   * @param bpm Current BPM
   * @returns Offset in seconds into the instance, or -1 if instance shouldn't play yet
   */
  static getInstancePlaybackOffset(
    instance: TrackInstance, 
    transportSeconds: number, 
    bpm: number
  ): number {
    const instanceStartTime = TimingCalculator.getInstanceStartTime(instance, bpm);
    
    if (transportSeconds < instanceStartTime) {
      // Transport hasn't reached this instance yet
      return -1;
    }
    
    const offsetIntoInstance = transportSeconds - instanceStartTime;
    const instanceDuration = TimingCalculator.getInstanceDuration(instance, bpm);
    
    if (offsetIntoInstance >= instanceDuration) {
      // We're past the end of this instance
      return -2;
    }
    
    // Add the trim start offset to account for trimmed content
    const trimStartSeconds = TimingCalculator.ticksToSeconds(instance.trim_start_ticks, bpm);
    return trimStartSeconds + offsetIntoInstance;
  }
  
  /**
   * Check if an instance should be playing at the current transport position
   * @param instance The track instance
   * @param transportSeconds Current transport position in seconds
   * @param bpm Current BPM
   */
  static isInstanceActive(
    instance: TrackInstance, 
    transportSeconds: number, 
    bpm: number
  ): boolean {
    const offset = TimingCalculator.getInstancePlaybackOffset(instance, transportSeconds, bpm);
    return offset >= 0; // -1 means not started, -2 means finished
  }
  
  /**
   * Calculate when an instance should be scheduled to start
   * @param instance The track instance
   * @param currentTransportSeconds Current transport position
   * @param bpm Current BPM
   * @returns Delay in seconds until the instance should start, or 0 if it should start immediately
   */
  static getInstanceScheduleDelay(
    instance: TrackInstance,
    currentTransportSeconds: number,
    bpm: number
  ): number {
    const instanceStartTime = TimingCalculator.getInstanceStartTime(instance, bpm);
    const delay = instanceStartTime - currentTransportSeconds;
    return Math.max(0, delay);
  }
  
  /**
   * Convert measures to ticks
   * @param measures Number of measures
   * @param beatsPerMeasure Beats per measure (time signature numerator)
   * @param ppq Pulses per quarter note
   */
  static measuresToTicks(
    measures: number, 
    beatsPerMeasure: number, 
    ppq: number = TimingCalculator.DEFAULT_PPQ
  ): number {
    return Math.round(measures * beatsPerMeasure * ppq);
  }
  
  /**
   * Convert ticks to measures
   * @param ticks Number of ticks
   * @param beatsPerMeasure Beats per measure (time signature numerator)
   * @param ppq Pulses per quarter note
   */
  static ticksToMeasures(
    ticks: number, 
    beatsPerMeasure: number, 
    ppq: number = TimingCalculator.DEFAULT_PPQ
  ): number {
    return ticks / (beatsPerMeasure * ppq);
  }
  
  /**
   * Quantize ticks to the nearest grid division
   * @param ticks The tick value to quantize
   * @param gridDivision Grid division (e.g., 16 for 16th notes)
   * @param ppq Pulses per quarter note
   */
  static quantizeTicks(
    ticks: number, 
    gridDivision: number, 
    ppq: number = TimingCalculator.DEFAULT_PPQ
  ): number {
    const ticksPerDivision = ppq / (gridDivision / 4); // Adjust for quarter note base
    return Math.round(ticks / ticksPerDivision) * ticksPerDivision;
  }
  
  /**
   * Calculate the actual content offset for trimmed audio/MIDI
   * This tells us where in the original content we should start playing
   * @param instance The track instance
   * @param bpm Current BPM
   */
  static getTrimStartOffset(instance: TrackInstance, bpm: number): number {
    return TimingCalculator.ticksToSeconds(instance.trim_start_ticks, bpm);
  }
  
  /**
   * Calculate the loop points for an instance if it were to loop
   * @param instance The track instance
   * @param bpm Current BPM
   * @returns Object with loop start and end in seconds
   */
  static getLoopPoints(instance: TrackInstance, bpm: number): { start: number; end: number } {
    return {
      start: TimingCalculator.ticksToSeconds(instance.trim_start_ticks, bpm),
      end: TimingCalculator.ticksToSeconds(instance.trim_end_ticks, bpm)
    };
  }
}