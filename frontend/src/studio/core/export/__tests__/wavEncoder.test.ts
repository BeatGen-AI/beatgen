import { describe, expect, it, vi, afterEach } from 'vitest';
import { WavEncoder } from '../wavEncoder';

// jsdom does not implement Web Audio. Model only the buffer storage the encoder uses.
class TestAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly channels: Float32Array[];

  constructor(options: AudioBufferOptions) {
    this.numberOfChannels = options.numberOfChannels ?? 1;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.channels = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length));
  }

  getChannelData(channel: number) { return this.channels[channel]; }
}

function makeBuffer(channels: number[][]): AudioBuffer {
  const buffer = new TestAudioBuffer({ numberOfChannels: channels.length, length: channels[0].length, sampleRate: 44100 });
  channels.forEach((samples, channel) => buffer.getChannelData(channel).set(samples));
  return buffer as unknown as AudioBuffer;
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('WavEncoder', () => {
  it.each([16, 24, 32] as const)('writes a stereo WAV header and interleaved samples at %i bits', async bitDepth => {
    const blob = WavEncoder.encodeWAV(makeBuffer([[-1, 0.5], [1, -0.5]]), bitDepth);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 4 * bitDepth / 8);
    const bytes = await readBlob(blob);
    const view = new DataView(bytes);
    const text = (start: number, length: number) => String.fromCharCode(...new Uint8Array(bytes, start, length));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(text(36, 4)).toBe('data');
    expect(view.getUint32(4, true)).toBe(blob.size - 8);
    expect(view.getUint16(20, true)).toBe(bitDepth === 32 ? 3 : 1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(bitDepth);
    expect(view.getUint32(40, true)).toBe(blob.size - 44);
    if (bitDepth === 16) {
      expect(view.getInt16(44, true)).toBe(-32768);
      expect(view.getInt16(46, true)).toBe(32767);
      expect(view.getInt16(48, true)).toBe(16383);
    } else if (bitDepth === 24) {
      expect([...new Uint8Array(bytes, 44, 6)]).toEqual([0, 0, 128, 255, 255, 127]);
    } else {
      expect(view.getFloat32(44, true)).toBe(-1);
      expect(view.getFloat32(48, true)).toBe(1);
      expect(view.getFloat32(52, true)).toBe(0.5);
    }
  });

  it('normalizes to the requested headroom without mutating the input', () => {
    vi.stubGlobal('AudioBuffer', TestAudioBuffer);
    const input = makeBuffer([[0.5, -0.5], [0.25, -0.25]]);
    const result = WavEncoder.normalize(input);
    expect(result.getChannelData(0)[0]).toBeCloseTo(Math.pow(10, -0.1 / 20), 5);
    expect(result.getChannelData(1)[0]).toBeCloseTo(Math.pow(10, -0.1 / 20) / 2, 5);
    expect(input.getChannelData(0)[0]).toBe(0.5);
  });

  it('keeps silence finite', () => {
    vi.stubGlobal('AudioBuffer', TestAudioBuffer);
    expect([...WavEncoder.normalize(makeBuffer([[0, 0]])).getChannelData(0)]).toEqual([0, 0]);
  });
});
