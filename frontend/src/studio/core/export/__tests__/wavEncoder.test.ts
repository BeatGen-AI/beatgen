import { WavEncoder } from '../wavEncoder';

describe('WavEncoder', () => {
  it('should encode a simple audio buffer to WAV', () => {
    // Create a simple test audio buffer
    const sampleRate = 44100;
    const duration = 1; // 1 second
    const audioBuffer = new AudioBuffer({
      numberOfChannels: 2,
      length: sampleRate * duration,
      sampleRate: sampleRate
    });
    
    // Fill with a simple sine wave
    const frequency = 440; // A4 note
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.5;
      }
    }
    
    // Encode to WAV
    const wavBlob = WavEncoder.encodeWAV(audioBuffer, 16);
    
    // Verify the blob
    expect(wavBlob).toBeInstanceOf(Blob);
    expect(wavBlob.type).toBe('audio/wav');
    expect(wavBlob.size).toBeGreaterThan(44); // WAV header is 44 bytes + audio data
  });
  
  it('should normalize audio buffer correctly', () => {
    const audioBuffer = new AudioBuffer({
      numberOfChannels: 1,
      length: 100,
      sampleRate: 44100
    });
    
    // Fill with values that peak at 0.5
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = i < 50 ? 0.5 : -0.5;
    }
    
    // Normalize with -0.1 dB headroom
    const normalized = WavEncoder.normalize(audioBuffer);
    
    // Check that peak is close to target
    const normalizedData = normalized.getChannelData(0);
    const peak = Math.max(...normalizedData.map(Math.abs));
    const targetPeak = Math.pow(10, -0.1 / 20); // -0.1 dB in linear
    
    expect(peak).toBeCloseTo(targetPeak, 5);
  });
});