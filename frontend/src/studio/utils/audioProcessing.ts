/**
 * Converts a linear volume value (0-100) to decibels (-Infinity to 0)
 * @param linearVolume Volume on a scale of 0-100
 * @param muted Whether the track is muted
 * @returns Decibel value for volume
 */
export function convertVolumeToDecibels(linearVolume: number, muted = false): number {
  if (muted) return -Infinity;
  
  // If volume is 0, return -Infinity (silence)
  if (linearVolume <= 0) return -Infinity;
  
  // Ensure volume is between 0-100
  const safeVolume = Math.max(0, Math.min(100, linearVolume));
  
  // Convert 0-100 to 0-1 for the fader
  const position = safeVolume / 100;
  
  // TEMPORARY: Simple linear mapping for debugging
  // 0% = -20dB, 100% = +6dB (26dB range)
  const dbValue = -20 + (position * 26);
  
  // Debug logging to see what values we're getting
  console.log(`Volume ${linearVolume}% -> Position ${position} -> ${dbValue.toFixed(1)}dB`);
  
  return dbValue;
}

/**
 * Converts decibels to linear volume (0-100)
 * @param dbValue Decibel value for volume
 * @returns Volume on a scale of 0-100
 */
export function convertDecibelsToVolume(dbValue: number): number {
  // If -Infinity, return 0
  if (dbValue === -Infinity) return 0;
  
  // TEMPORARY: Simple linear mapping for debugging
  // Reverse of: -20 + (position * 26) = dbValue
  // So: position = (dbValue + 20) / 26
  const position = Math.max(0, Math.min(1, (dbValue + 20) / 26));
  
  // Convert 0-1 position back to 0-100 volume
  return position * 100;
}

/**
 * Formats a volume value (0-100) to a display string
 * @param volume Volume on a scale of 0-100
 * @returns Formatted string representation
 */
export function formatVolumeLabel(volume: number): string {
  if (volume <= 0) return "-∞ dB";
  
  // Convert to dB for display
  const dbValue = convertVolumeToDecibels(volume);
  
  // Special case for very low values
  if (dbValue <= -40) return "-∞ dB";
  
  // Handle positive dB values specially
  if (dbValue > 0) {
    // Round to 1 decimal place and add + sign
    return `+${Math.round(dbValue * 10) / 10} dB`;
  }
  
  // For 0dB value, don't show decimal
  if (dbValue === 0) return "0 dB";
  
  // For negative values, round to 1 decimal place
  return `${Math.round(dbValue * 10) / 10} dB`;
}

/**
 * Format time (in seconds) to MM:SS:MS format
 * @param seconds Time in seconds
 * @param showMilliseconds Whether to include milliseconds in the output
 * @returns Formatted time string
 */
export function formatTime(seconds: number, showMilliseconds: boolean = true): string {
  if (isNaN(seconds) || seconds < 0) {
    return showMilliseconds ? '00:00:000' : '00:00';
  }

  // Calculate minutes, seconds, and milliseconds
  const minutes = Math.floor(seconds / 60);
  const secondsRemainder = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  // Format with leading zeros
  const formattedMinutes = String(minutes).padStart(2, '0');
  const formattedSeconds = String(secondsRemainder).padStart(2, '0');
  
  if (showMilliseconds) {
    const formattedMilliseconds = String(milliseconds).padStart(3, '0');
    return `${formattedMinutes}:${formattedSeconds}:${formattedMilliseconds}`;
  } else {
    return `${formattedMinutes}:${formattedSeconds}`;
  }
}

/**
 * Upload file with progress tracking
 */
export async function uploadFileWithProgress(
  file: File, 
  url: string, 
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress(percentComplete);
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });
    
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

export async function processAudioFile(file: File): Promise<{
  duration: number;
  sampleRate: number;
  format: string;
  waveform: number[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const AudioContextClass = (window.AudioContext || 
          (window as any).webkitAudioContext) as typeof AudioContext;
        const audioContext = new AudioContextClass();
        const audioBuffer = await audioContext.decodeAudioData(e.target.result as ArrayBuffer);
        
        const format = file.type.split('/')[1]?.toUpperCase() || 'UNKNOWN';
        const duration = audioBuffer.duration;
        const sampleRate = audioBuffer.sampleRate;
        
        // Generate waveform data (100 points)
        const waveform = generateWaveform(audioBuffer, 100);
        
        resolve({
          duration,
          sampleRate,
          format,
          waveform
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function generateWaveform(audioBuffer: AudioBuffer, pointCount: number): number[] {
  const channelData = audioBuffer.getChannelData(0); // Use first channel
  const blockSize = Math.floor(channelData.length / pointCount);
  
  const waveform = [];
  for (let i = 0; i < pointCount; i++) {
    const start = blockSize * i;
    let max = 0;
    for (let j = 0; j < blockSize; j++) {
      if (start + j < channelData.length) {
        const amplitude = Math.abs(channelData[start + j]);
        if (amplitude > max) max = amplitude;
      }
    }
    waveform.push(max);
  }
  
  return waveform;
}

/**
 * Format file size into a human-readable string (B, KB, MB).
 * @param bytes File size in bytes.
 * @returns Formatted file size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class SimpleFader {
  private minDb: number;
  private maxDb: number;
  private unityPos: number;

  constructor(minDb = -60, maxDb = 12, unityPos = 0.75) {
    this.minDb = minDb;
    this.maxDb = maxDb;
    this.unityPos = unityPos;
  }

  /**
   * Convert linear position (0-1) to dB
   * Uses x³·⁵ curve below unity for DAW-like response
   */
  positionToDb(position: number): number {
    position = Math.max(0, Math.min(1, position));
    
    if (position === 0) return -Infinity;
    
    if (position < this.unityPos) {
      // DAW-style curve: x³·⁵ gives much better low-end response
      const normalized = position / this.unityPos;
      const curve = Math.pow(normalized, 3.5);
      return this.minDb + (this.minDb * -curve);
    }
    
    // Linear above unity for predictable boost
    const normalized = (position - this.unityPos) / (1 - this.unityPos);
    return normalized * this.maxDb;
  }

  /**
   * Convert dB to linear position (0-1)
   * Inverse of the x³·⁵ curve
   */
  dbToPosition(db: number): number {
    if (db <= this.minDb || !isFinite(db)) return 0;
    if (db >= this.maxDb) return 1;
    
    if (db > 0) {
      const normalized = db / this.maxDb;
      return this.unityPos + normalized * (1 - this.unityPos);
    }
    
    // Inverse of x³·⁵ is x^(1/3.5)
    const normalized = (db - this.minDb) / (-this.minDb);
    const position = Math.pow(normalized, 1/3.5);
    return position * this.unityPos;
  }

  /**
   * Get amplitude multiplier for audio (0-1+)
   */
  getAmplitude(position: number): number {
    const db = this.positionToDb(position);
    if (!isFinite(db)) return 0;
    return Math.pow(10, db / 20);
  }
}

// Standalone conversion helpers
export function dbToAmplitude(db: number): number {
  if (!isFinite(db)) return 0;
  return Math.pow(10, db / 20);
}

export function amplitudeToDb(amplitude: number): number {
  if (amplitude <= 0) return -Infinity;
  return 20 * Math.log10(amplitude);
}