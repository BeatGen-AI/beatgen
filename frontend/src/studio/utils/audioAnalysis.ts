import { downloadAudioTrackFile } from '../../platform/api/sounds';

// Global audio context to prevent it from being closed/recreated
let globalAudioContext: AudioContext | null = null;

const getGlobalAudioContext = () => {
  if (!globalAudioContext || globalAudioContext.state === 'closed') {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return globalAudioContext;
};

// Cache for analyzed audio data
const audioAnalysisCache = new Map<string, number[]>();

export interface AudioAnalysisResult {
  waveformData: number[];
  duration: number;
  sampleRate: number;
}

/**
 * Analyzes audio file and returns normalized waveform data
 * @param storageKey - The audio file storage key
 * @param barCount - Number of bars to generate in the waveform
 * @returns Promise<number[]> - Normalized waveform data (0-1 range)
 */
export const analyzeAudioFile = async (storageKey: string, barCount: number): Promise<number[]> => {
  const cacheKey = `${storageKey}_${barCount}`;
  
  console.log('AudioAnalysis: Analyzing audio file with storageKey:', storageKey, 'barCount:', barCount);
  
  // Check cache first
  if (audioAnalysisCache.has(cacheKey)) {
    console.log('AudioAnalysis: Found cached waveform data');
    return audioAnalysisCache.get(cacheKey)!;
  }

  try {
    // Validate storage key first
    if (!storageKey || storageKey.trim() === '') {
      throw new Error('Invalid storage key');
    }

    console.log('AudioAnalysis: Getting audio context');
    
    // Use global audio context
    const audioContext = getGlobalAudioContext();
    console.log('AudioAnalysis: Audio context state:', audioContext.state);
    
    // Resume audio context if it's suspended
    if (audioContext.state === 'suspended') {
      console.log('AudioAnalysis: Resuming suspended audio context');
      await audioContext.resume();
    }

    console.log('AudioAnalysis: Downloading audio file for storage key:', storageKey);
    
    // Download audio file using the API
    const audioBlob = await downloadAudioTrackFile(storageKey);
    console.log('AudioAnalysis: Downloaded blob size:', audioBlob.size, 'type:', audioBlob.type);
    
    const arrayBuffer = await audioBlob.arrayBuffer();
    console.log('AudioAnalysis: ArrayBuffer size:', arrayBuffer.byteLength);
    
    if (arrayBuffer.byteLength === 0) {
      throw new Error('Empty audio file');
    }
    
    console.log('AudioAnalysis: Decoding audio data...');
    
    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log('AudioAnalysis: Audio decoded successfully - duration:', audioBuffer.duration, 'channels:', audioBuffer.numberOfChannels);
    
    if (audioBuffer.length === 0) {
      throw new Error('Invalid audio data');
    }
    
    // Extract channel data (use first channel)
    const channelData = audioBuffer.getChannelData(0);
    console.log('AudioAnalysis: Channel data length:', channelData.length);
    
    // Calculate samples per bar
    const samplesPerBar = Math.floor(channelData.length / barCount);
    const waveformData: number[] = [];
    
    // Generate waveform data using RMS
    for (let i = 0; i < barCount; i++) {
      const startIndex = i * samplesPerBar;
      const endIndex = Math.min(startIndex + samplesPerBar, channelData.length);
      
      // Calculate RMS (Root Mean Square) for better visual representation
      let sum = 0;
      for (let j = startIndex; j < endIndex; j++) {
        sum += channelData[j] * channelData[j];
      }
      const rms = Math.sqrt(sum / (endIndex - startIndex));
      waveformData.push(rms || 0); // Fallback to 0 if NaN
    }
    
    // Normalize to 0-1 range
    const maxAmplitude = Math.max(...waveformData);
    const normalizedData = waveformData.map(val => maxAmplitude > 0 ? val / maxAmplitude : 0);
    
    // Cache the result
    audioAnalysisCache.set(cacheKey, normalizedData);
    
    console.log('AudioAnalysis: Analysis complete! Generated waveform data:', normalizedData.length, 'bars');
    console.log('AudioAnalysis: Sample waveform values:', normalizedData.slice(0, 10));
    console.log('AudioAnalysis: Max amplitude in generated data:', Math.max(...normalizedData));
    
    return normalizedData;
    
  } catch (err) {
    console.error('AudioAnalysis: Audio analysis failed:', err);
    throw err;
  }
};

/**
 * Gets the audio storage key from a CombinedTrack based on track type
 * @param track - The CombinedTrack
 * @returns string | null - The audio storage key or null if not available
 */
export const getAudioStorageKey = (track: any): string | null => {
  if (!track || !track.track) return null;
  
  switch (track.track_type) {
    case 'AUDIO':
      return track.track.audio_file_storage_key || null;
    case 'SAMPLER':
      return track.track.audio_storage_key || null;
    default:
      return null;
  }
};

/**
 * Gets the audio duration from a CombinedTrack based on track type
 * @param track - The CombinedTrack
 * @returns number - The duration in seconds, or 0 if not available
 */
export const getAudioDuration = (track: any): number => {
  if (!track || !track.track) return 0;
  
  switch (track.track_type) {
    case 'AUDIO':
      return track.track.audio_file_duration || 0;
    case 'SAMPLER':
      return track.track.audio_file_duration || 0;
    default:
      return 0;
  }
};

/**
 * Calculates duration_ticks from audio duration in seconds using project BPM
 * @param durationInSeconds - Audio duration in seconds
 * @param bpm - Project BPM
 * @returns number - Duration in ticks (480 ticks per beat)
 */
export const calculateDurationTicks = (durationInSeconds: number, bpm: number): number => {
  if (durationInSeconds <= 0 || bpm <= 0) return 0;
  
  // Convert duration to ticks using project BPM
  const ticksPerSecond = 480 * bpm / 60; // 480 ticks per beat, using project BPM
  return Math.round(durationInSeconds * ticksPerSecond);
};

/**
 * Clear the audio analysis cache
 */
export const clearAudioAnalysisCache = () => {
  audioAnalysisCache.clear();
};