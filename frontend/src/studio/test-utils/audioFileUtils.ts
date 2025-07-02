import { vi } from 'vitest';

/**
 * Audio File Testing Utilities
 */

/**
 * Create a mock File object with audio data
 */
export function createMockAudioFile(config: {
  name?: string;
  size?: number;
  type?: string;
  lastModified?: number;
  content?: ArrayBuffer;
} = {}): File {
  const {
    name = 'test-audio.wav',
    size = 1024 * 100, // 100KB default
    type = 'audio/wav',
    lastModified = Date.now(),
    content,
  } = config;

  const fileContent = content || new ArrayBuffer(size);
  
  const file = new File([fileContent], name, {
    type,
    lastModified,
  });

  // Add additional properties that might be checked
  Object.defineProperty(file, 'size', {
    value: size,
    writable: false,
  });

  return file;
}

/**
 * Create a valid WAV file header and data
 */
export function createWavFileData(config: {
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  duration?: number;
  frequency?: number;
} = {}): ArrayBuffer {
  const {
    sampleRate = 44100,
    bitDepth = 16,
    channels = 2,
    duration = 1, // 1 second
    frequency = 440, // A4
  } = config;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * blockAlign;
  const fileSize = 44 + dataSize; // 44 bytes for header

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // Helper to write string
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, fileSize - 8, true); // File size - 8
  writeString(8, 'WAVE');

  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Generate audio samples (sine wave)
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    
    for (let channel = 0; channel < channels; channel++) {
      if (bitDepth === 16) {
        const value = Math.floor(sample * 0x7FFF);
        view.setInt16(offset, value, true);
        offset += 2;
      } else if (bitDepth === 24) {
        const value = Math.floor(sample * 0x7FFFFF);
        view.setUint8(offset, value & 0xFF);
        view.setUint8(offset + 1, (value >> 8) & 0xFF);
        view.setUint8(offset + 2, (value >> 16) & 0xFF);
        offset += 3;
      }
    }
  }

  return buffer;
}

/**
 * Create a mock audio file with valid WAV data
 */
export function createValidWavFile(config?: Parameters<typeof createWavFileData>[0] & {
  name?: string;
}): File {
  const { name = 'test.wav', ...wavConfig } = config || {};
  const wavData = createWavFileData(wavConfig);
  
  return new File([wavData], name, { type: 'audio/wav' });
}

/**
 * Create an MP3 file mock (simplified)
 */
export function createMockMp3File(config: {
  name?: string;
  duration?: number;
  bitrate?: number;
} = {}): File {
  const {
    name = 'test.mp3',
    duration = 1,
    bitrate = 128000, // 128 kbps
  } = config;

  // Calculate approximate file size
  const size = Math.floor((bitrate * duration) / 8);
  
  // Create a simple buffer with MP3 header
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  
  // Simple MP3 frame header (not complete, but recognizable)
  view.setUint8(0, 0xFF); // Frame sync
  view.setUint8(1, 0xFB); // MPEG-1, Layer 3, no protection
  
  return new File([buffer], name, { type: 'audio/mpeg' });
}

/**
 * Mock FileReader for testing file loading
 */
export class MockFileReader implements Partial<FileReader> {
  public result: string | ArrayBuffer | null = null;
  public error: DOMException | null = null;
  public readyState: 0 | 1 | 2 = 0; // EMPTY
  
  public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  public onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  public onprogress: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;

  readAsArrayBuffer(file: Blob): void {
    this.readyState = 1; // LOADING
    
    setTimeout(() => {
      if (this.error) {
        this.readyState = 2; // DONE
        if (this.onerror) {
          this.onerror.call(this as any, new ProgressEvent('error'));
        }
      } else {
        // Simulate reading the file
        if (file instanceof File) {
          file.arrayBuffer().then(buffer => {
            this.result = buffer;
            this.readyState = 2; // DONE
            if (this.onload) {
              this.onload.call(this as any, new ProgressEvent('load'));
            }
          });
        }
      }
    }, 10); // Simulate async operation
  }

  readAsDataURL(file: Blob): void {
    this.readyState = 1; // LOADING
    
    setTimeout(() => {
      this.result = `data:${file.type};base64,${btoa('mock-data')}`;
      this.readyState = 2; // DONE
      if (this.onload) {
        this.onload.call(this as any, new ProgressEvent('load'));
      }
    }, 10);
  }

  readAsText(file: Blob): void {
    this.readyState = 1; // LOADING
    
    setTimeout(() => {
      this.result = 'mock-text-content';
      this.readyState = 2; // DONE
      if (this.onload) {
        this.onload.call(this as any, new ProgressEvent('load'));
      }
    }, 10);
  }

  abort(): void {
    this.readyState = 0; // EMPTY
  }

  // Helper method to simulate error
  simulateError(error: DOMException): void {
    this.error = error;
  }
}

/**
 * Setup FileReader mock
 */
export function setupFileReaderMock(): MockFileReader {
  const mockReader = new MockFileReader();
  
  (global as any).FileReader = vi.fn(() => mockReader);
  
  return mockReader;
}

/**
 * Create audio metadata for testing
 */
export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  bitDepth: number;
  format: string;
  bitrate?: number;
}

export function createAudioMetadata(overrides?: Partial<AudioMetadata>): AudioMetadata {
  return {
    duration: 10,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitDepth: 16,
    format: 'wav',
    bitrate: undefined,
    ...overrides,
  };
}

/**
 * Simulate audio file loading with progress events
 */
export async function simulateAudioFileLoad(
  file: File,
  options: {
    onProgress?: (progress: number) => void;
    delay?: number;
    shouldFail?: boolean;
    errorMessage?: string;
  } = {}
): Promise<ArrayBuffer> {
  const { onProgress, delay = 100, shouldFail = false, errorMessage = 'Failed to load audio file' } = options;

  return new Promise((resolve, reject) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      
      if (onProgress) {
        onProgress(Math.min(progress, 100));
      }

      if (progress >= 100) {
        clearInterval(interval);
        
        if (shouldFail) {
          reject(new Error(errorMessage));
        } else {
          file.arrayBuffer().then(resolve).catch(reject);
        }
      }
    }, delay / 5);
  });
}

/**
 * Create a Blob URL mock
 */
export function createMockBlobUrl(file: File): string {
  return `blob:http://localhost:3000/${Date.now()}-${file.name}`;
}

/**
 * Mock URL.createObjectURL and URL.revokeObjectURL
 */
export function setupUrlMocks() {
  const urlMap = new Map<string, Blob>();
  
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:mock/${Date.now()}`;
    urlMap.set(url, blob);
    return url;
  });
  
  URL.revokeObjectURL = vi.fn((url: string) => {
    urlMap.delete(url);
  });
  
  return {
    urlMap,
    cleanup: () => {
      urlMap.clear();
      (URL.createObjectURL as any).mockRestore?.();
      (URL.revokeObjectURL as any).mockRestore?.();
    },
  };
}

/**
 * Generate audio buffer with specific patterns for testing
 */
export function generateTestAudioBuffer(
  context: AudioContext,
  config: {
    duration?: number;
    pattern?: 'silence' | 'sine' | 'noise' | 'impulse';
    frequency?: number;
    amplitude?: number;
  } = {}
): AudioBuffer {
  const {
    duration = 1,
    pattern = 'sine',
    frequency = 440,
    amplitude = 0.5,
  } = config;

  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    
    switch (pattern) {
      case 'silence':
        // Leave as zeros
        break;
        
      case 'sine':
        for (let i = 0; i < length; i++) {
          data[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
        }
        break;
        
      case 'noise':
        for (let i = 0; i < length; i++) {
          data[i] = amplitude * (Math.random() * 2 - 1);
        }
        break;
        
      case 'impulse':
        data[0] = amplitude;
        break;
    }
  }

  return buffer;
}