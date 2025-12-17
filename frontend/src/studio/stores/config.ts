import { Store } from '../core/state/store';
import { TrackType, GetFn, AudioTrackOptions, MidiTrackOptions, SamplerTrackOptions, TrackOptions } from './types';
import { db } from '../core/db/dexie-client';
import { getAudioEngine } from '../core/audio-engine/AudioEngine';

// Default configuration for samplers
export const DEFAULT_SAMPLER_CONFIG = {
  baseMidiNote: 60,
  grainSize: 0.1,
  overlap: 0.1
};

// Track type-specific configurations with unified interface
// NOTE: This relies on the Store instance being available. 
// If slices need this config *before* the store is fully initialized in the RootState,
// this might need adjustment (e.g., passing store explicitly to initEngine calls).
export const TRACK_CONFIG: Record<TrackType, {
    getDefaultName: (count: number, instrumentName?: string) => string;
    initTrack: (id: string, file?: File) => Record<string, any>;
    initEngine: (store: Store, trackId: string, get: GetFn, options?: TrackOptions) => Promise<any>;
}> = {
  AUDIO: {
    getDefaultName: (count: number, instrumentName?: string) => instrumentName || `Audio Track ${count}`,
    initTrack: (id: string, file?: File) => ({ type: 'AUDIO' as const, audioFile: file }),
    initEngine: async (_store: Store, trackId: string, get: GetFn, options?: TrackOptions) => {
      const file = options && (options as AudioTrackOptions).audioFile;
      if (!file) return Promise.resolve();

      // Load into new AudioEngine
      const newEngine = getAudioEngine();
      if (!newEngine.isReady()) {
        throw new Error(`TRACK_CONFIG[audio].initEngine: New AudioEngine not ready when loading buffer for ${trackId}`);
      }
      await newEngine.loadAudioBuffer(trackId, file);

      // Get metadata from the new engine's loaded buffer
      const buffer = newEngine.getAudioBuffer(trackId);
      if (!buffer) {
        throw new Error(`TRACK_CONFIG[audio].initEngine: Failed to get audio buffer after loading for track ${trackId}`);
      }

      const duration = buffer.duration;
      const sampleRate = buffer.sampleRate;
      const format = file.type;
      const size = file.size;

      const { _updateNestedTrackData } = get();

      if (_updateNestedTrackData) {
        _updateNestedTrackData(trackId, {
          audio_file_duration: duration,
          audio_file_sample_rate: sampleRate,
          audio_file_format: format,
          audio_file_size: size,
          audio_file_name: file.name,
        });
      } else {
        console.error(`TRACK_CONFIG[audio].initEngine: _updateNestedTrackData function not found!`);
      }
    },
  },
  MIDI: {
    getDefaultName: (count: number, instrumentName?: string) => instrumentName || `MIDI Track ${count}`,
    initTrack: (id: string) => ({ type: 'MIDI' as const }),
    initEngine: async (store: Store, trackId: string, get: GetFn, options?: TrackOptions) => {
      const instrumentId = options && (options as MidiTrackOptions).instrumentId;
      return instrumentId ? store.connectTrackToSoundfont(trackId, instrumentId) : Promise.resolve();
    },
  },
  DRUM: {
    getDefaultName: (count: number, instrumentName?: string) => instrumentName || `Drum Sequencer ${count}`,
    initTrack: (id: string) => ({ 
      type: 'DRUM' as const, 
      drumPattern: Array(4).fill(null).map(() => Array(64).fill(false)) 
    }),
    initEngine: async (store: Store, trackId: string, get: GetFn, options?: TrackOptions) => Promise.resolve(),
  },
  SAMPLER: {
    getDefaultName: (count: number, instrumentName?: string) => instrumentName || `Sampler ${count}`,
    initTrack: (id: string, file?: File) => ({ 
      type: 'SAMPLER' as const, 
      baseMidiNote: DEFAULT_SAMPLER_CONFIG.baseMidiNote,
      grainSize: DEFAULT_SAMPLER_CONFIG.grainSize,
      overlap: DEFAULT_SAMPLER_CONFIG.overlap
    }),
    initEngine: async (store: Store, trackId: string, _get: GetFn, options?: SamplerTrackOptions) => {
      const sampleManager = store.getSampleManager();
      if (!sampleManager) {
        console.error(`SampleManager not available on Store instance for sampler initEngine (track: ${trackId})`);
        return Promise.resolve();
      }

      // Look for audio_storage_key (what we set in track data) or storage_key (from options)
      const storageKey = (options as any)?.audio_storage_key || options?.storage_key;
      const trackName = options?.name;

      if (!storageKey) {
          console.warn(`TRACK_CONFIG[sampler].initEngine: No storage_key provided for track ${trackId}. Trying fallback.`);
          const existingBlob = await sampleManager.getSampleBlob(trackId, '', 'sample');
          if (!existingBlob) {
              console.error(`TRACK_CONFIG[sampler].initEngine: Failed to get blob for track ${trackId}`);
              return Promise.resolve();
          }
      }

      const sampleFile = await sampleManager.getSampleBlob(trackId, storageKey!, 'sample', trackName);

      if (!sampleFile) {
        console.error(`TRACK_CONFIG[sampler].initEngine: Failed to get sample blob for track ${trackId}`);
        return Promise.resolve();
      }

      try {
        const file = new File([sampleFile.data], trackName || sampleFile.name, { type: sampleFile.type });

        // Load into new AudioEngine
        const newEngine = getAudioEngine();
        if (!newEngine.isReady()) {
          throw new Error(`TRACK_CONFIG[sampler].initEngine: New AudioEngine not ready when loading buffer for ${trackId}`);
        }
        await newEngine.loadAudioBuffer(trackId, file);
      } catch (connectError) {
        console.error(`Error loading sampler track ${trackId} in initEngine:`, connectError);
      }
      return Promise.resolve();
    },
  }
};
