/**
 * WAV file encoder utilities
 * Converts AudioBuffer to WAV format
 */

export class WavEncoder {
  /**
   * Encode an AudioBuffer to WAV format
   * @param audioBuffer The audio buffer to encode
   * @param bitDepth The bit depth (16, 24, or 32)
   * @returns Blob containing the WAV file
   */
  static encodeWAV(audioBuffer: AudioBuffer, bitDepth: 16 | 24 | 32 = 16): Blob {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = bitDepth === 32 ? 3 : 1; // 3 for 32-bit float, 1 for PCM
    const bytesPerSample = bitDepth / 8;
    
    // Interleave channels
    const length = audioBuffer.length * numberOfChannels;
    const buffer = new ArrayBuffer(44 + length * bytesPerSample);
    const view = new DataView(buffer);
    
    // Write WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF'); // ChunkID
    view.setUint32(4, 36 + length * bytesPerSample, true); // ChunkSize
    writeString(8, 'WAVE'); // Format
    writeString(12, 'fmt '); // Subchunk1ID
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, format, true); // AudioFormat
    view.setUint16(22, numberOfChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * numberOfChannels * bytesPerSample, true); // ByteRate
    view.setUint16(32, numberOfChannels * bytesPerSample, true); // BlockAlign
    view.setUint16(34, bitDepth, true); // BitsPerSample
    writeString(36, 'data'); // Subchunk2ID
    view.setUint32(40, length * bytesPerSample, true); // Subchunk2Size
    
    // Write interleaved audio data
    const offset = 44;
    const channels: Float32Array[] = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }
    
    let index = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = channels[channel][i];
        
        if (bitDepth === 32) {
          // 32-bit float
          view.setFloat32(offset + index * 4, sample, true);
          index++;
        } else if (bitDepth === 24) {
          // 24-bit PCM
          const value = Math.max(-1, Math.min(1, sample));
          const intValue = value < 0 ? value * 0x800000 : value * 0x7FFFFF;
          const byte1 = intValue & 0xFF;
          const byte2 = (intValue >> 8) & 0xFF;
          const byte3 = (intValue >> 16) & 0xFF;
          
          view.setUint8(offset + index * 3, byte1);
          view.setUint8(offset + index * 3 + 1, byte2);
          view.setUint8(offset + index * 3 + 2, byte3);
          index++;
        } else {
          // 16-bit PCM
          const value = Math.max(-1, Math.min(1, sample));
          view.setInt16(
            offset + index * 2,
            value < 0 ? value * 0x8000 : value * 0x7FFF,
            true
          );
          index++;
        }
      }
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }
  
  /**
   * Mix multiple audio buffers into a single buffer
   * @param buffers Array of audio buffers to mix
   * @param outputSampleRate The desired output sample rate
   * @returns Mixed audio buffer
   */
  static mixBuffers(buffers: AudioBuffer[], outputSampleRate: number): AudioBuffer {
    if (buffers.length === 0) {
      throw new Error('No buffers to mix');
    }
    
    // Find the maximum duration and channel count
    let maxDuration = 0;
    let maxChannels = 0;
    
    for (const buffer of buffers) {
      const duration = buffer.length / buffer.sampleRate;
      maxDuration = Math.max(maxDuration, duration);
      maxChannels = Math.max(maxChannels, buffer.numberOfChannels);
    }
    
    // Create output buffer
    const outputLength = Math.ceil(maxDuration * outputSampleRate);
    const outputBuffer = new AudioBuffer({
      numberOfChannels: maxChannels,
      length: outputLength,
      sampleRate: outputSampleRate
    });
    
    // Mix buffers
    for (const buffer of buffers) {
      const ratio = outputSampleRate / buffer.sampleRate;
      
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const inputData = buffer.getChannelData(channel);
        const outputData = outputBuffer.getChannelData(channel);
        
        // Simple linear interpolation for sample rate conversion
        for (let i = 0; i < outputLength; i++) {
          const inputIndex = i / ratio;
          const inputIndexFloor = Math.floor(inputIndex);
          const inputIndexCeil = Math.ceil(inputIndex);
          
          if (inputIndexCeil >= inputData.length) {
            break;
          }
          
          const fraction = inputIndex - inputIndexFloor;
          const sample = inputData[inputIndexFloor] * (1 - fraction) +
                        inputData[inputIndexCeil] * fraction;
          
          outputData[i] += sample;
        }
      }
    }
    
    return outputBuffer;
  }
  
  /**
   * Normalize an audio buffer to prevent clipping
   * @param buffer The audio buffer to normalize
   * @param headroom Headroom in dB (default -0.1 dB)
   * @returns Normalized audio buffer
   */
  static normalize(buffer: AudioBuffer, headroom: number = -0.1): AudioBuffer {
    const normalizedBuffer = new AudioBuffer({
      numberOfChannels: buffer.numberOfChannels,
      length: buffer.length,
      sampleRate: buffer.sampleRate
    });
    
    // Find peak amplitude
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        peak = Math.max(peak, Math.abs(data[i]));
      }
    }
    
    // Calculate normalization factor
    const targetPeak = Math.pow(10, headroom / 20); // Convert dB to linear
    const factor = peak > 0 ? targetPeak / peak : 1;
    
    // Apply normalization
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = normalizedBuffer.getChannelData(channel);
      
      for (let i = 0; i < inputData.length; i++) {
        outputData[i] = inputData[i] * factor;
      }
    }
    
    return normalizedBuffer;
  }
}