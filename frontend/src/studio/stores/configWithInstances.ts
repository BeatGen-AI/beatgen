import { StoreWithInstances } from '../core/state/storeWithInstances';
import { TrackType, GetFn, AudioTrackOptions, MidiTrackOptions, SamplerTrackOptions, TrackOptions } from './types';
import { db } from '../core/db/dexie-client';
import { TrackInstance } from '../../platform/types/dto/project_track';

// Default configuration for samplers
export const DEFAULT_SAMPLER_CONFIG = {
    baseMidiNote: 60,
    grainSize: 0.1,
    overlap: 0.1
};

/**
 * Create default instance for a track if none exist
 */
function createDefaultInstance(trackId: string, yPosition: number = 0): TrackInstance {
    return {
        id: `${trackId}_instance_0`,
        track_id: trackId,
        x_position: 0,
        y_position: yPosition,
        trim_start_ticks: 0,
        trim_end_ticks: undefined
    };
}

// Track type-specific configurations with instance support
export const TRACK_CONFIG_WITH_INSTANCES: Record<TrackType, {
    getDefaultName: (count: number, instrumentName?: string) => string;
    initTrack: (id: string, file?: File) => Record<string, any>;
    initEngine: (store: StoreWithInstances, trackId: string, get: GetFn, options?: TrackOptions) => Promise<any>;
}> = {
    AUDIO: {
        getDefaultName: (count: number, instrumentName?: string) => instrumentName || `Audio Track ${count}`,
        initTrack: (id: string, file?: File) => ({ 
            type: 'AUDIO' as const, 
            audioFile: file,
            instances: [createDefaultInstance(id)]
        }),
        initEngine: async (store: StoreWithInstances, trackId: string, get: GetFn, options?: TrackOptions) => {
            const file = options && (options as AudioTrackOptions).audioFile;
            if (!file) return Promise.resolve();
            
            console.log(`TRACK_CONFIG_WITH_INSTANCES[audio].initEngine: Loading file for track ${trackId}...`);
            
            // Get track data to access instances
            const trackData = get().findTrackById(trackId);
            const instances = trackData?.track?.instances || [createDefaultInstance(trackId)];
            
            // Load audio file with instances
            await store.loadAudioFile(trackId, file);
            
            console.log(`TRACK_CONFIG_WITH_INSTANCES[audio].initEngine: File loaded for track ${trackId}. Fetching metadata...`);

            // Get metadata from the first instance
            const audioEngine = store.getAudioEngine();
            const trackInstances = await audioEngine.getTrackInstances(trackId);
            
            if (trackInstances.length > 0) {
                const firstInstance = trackInstances[0];
                const player = audioEngine.getInstancePlayer(trackId, firstInstance.id);
                
                if (player?.buffer) {
                    const buffer = player.buffer;
                    const duration = buffer.duration;
                    const sampleRate = buffer.sampleRate;
                    const format = file.type;
                    const size = file.size;

                    console.log(`TRACK_CONFIG_WITH_INSTANCES[audio].initEngine: Metadata for ${trackId}:`, { 
                        duration, sampleRate, format, size 
                    });

                    const { _updateNestedTrackData } = get(); 
                    
                    if (_updateNestedTrackData) {
                        _updateNestedTrackData(trackId, {
                            audio_file_duration: duration,
                            audio_file_sample_rate: sampleRate,
                            audio_file_format: format,
                            audio_file_size: size,
                            audio_file_name: file.name,
                        });
                        console.log(`TRACK_CONFIG_WITH_INSTANCES[audio].initEngine: Dispatched nested state update for ${trackId}.`);
                    } else {
                        console.error(`TRACK_CONFIG_WITH_INSTANCES[audio].initEngine: _updateNestedTrackData function not found!`);
                    }
                }
            }
        },
    },
    MIDI: {
        getDefaultName: (count: number, instrumentName?: string) => instrumentName || `MIDI Track ${count}`,
        initTrack: (id: string) => ({ 
            type: 'MIDI' as const,
            instances: [createDefaultInstance(id)]
        }),
        initEngine: async (store: StoreWithInstances, trackId: string, get: GetFn, options?: TrackOptions) => {
            const instrumentId = options && (options as MidiTrackOptions).instrumentId;
            if (!instrumentId) return Promise.resolve();
            
            // Connection to soundfont will handle instances
            return store.connectTrackToSoundfont(trackId, instrumentId);
        },
    },
    DRUM: {
        getDefaultName: (count: number, instrumentName?: string) => instrumentName || `Drum Sequencer ${count}`,
        initTrack: (id: string) => ({ 
            type: 'DRUM' as const, 
            drumPattern: Array(4).fill(null).map(() => Array(64).fill(false)),
            instances: [createDefaultInstance(id)]
        }),
        initEngine: async (store: StoreWithInstances, trackId: string, get: GetFn, options?: TrackOptions) => {
            // Drum tracks may need special handling for instances
            // For now, just resolve
            return Promise.resolve();
        },
    },
    SAMPLER: {
        getDefaultName: (count: number, instrumentName?: string) => instrumentName || `Sampler ${count}`,
        initTrack: (id: string, file?: File) => ({ 
            type: 'SAMPLER' as const, 
            baseMidiNote: DEFAULT_SAMPLER_CONFIG.baseMidiNote,
            grainSize: DEFAULT_SAMPLER_CONFIG.grainSize,
            overlap: DEFAULT_SAMPLER_CONFIG.overlap,
            instances: [createDefaultInstance(id)]
        }),
        initEngine: async (store: StoreWithInstances, trackId: string, get: GetFn, options?: SamplerTrackOptions) => {
            const sampleManager = store.getSampleManager();
            if (!sampleManager) {
                console.error(`SampleManager not available on Store instance for sampler initEngine (track: ${trackId})`);
                return Promise.resolve();
            }

            const storageKey = options?.storage_key;
            const trackName = options?.name;

            if (!storageKey) {
                console.warn(`TRACK_CONFIG_WITH_INSTANCES[sampler].initEngine: No storage_key provided in options for track ${trackId}. Cannot load sample.`);
                const existingBlob = await sampleManager.getSampleBlob(trackId, '', 'sample');
                if (!existingBlob) {
                    console.error(`Failed to get blob via ID ${trackId} either.`);
                    return Promise.resolve();
                }
                console.log(`Found cached blob for ID ${trackId} despite missing storageKey in options.`);
            }
            
            console.log(`TRACK_CONFIG_WITH_INSTANCES[sampler].initEngine: Getting sample blob for track ${trackId} (storageKey: ${storageKey})`);
            const sampleFile = await sampleManager.getSampleBlob(trackId, storageKey!, 'sample', trackName);

            if (!sampleFile) {
                console.error(`TRACK_CONFIG_WITH_INSTANCES[sampler].initEngine: Failed to get sample blob for track ${trackId} using storageKey ${storageKey}`);
                return Promise.resolve();
            }
            
            const trackData = get().findTrackById(trackId);
            const baseMidiNote = options?.baseMidiNote ?? (trackData?.track as any)?.baseMidiNote ?? DEFAULT_SAMPLER_CONFIG.baseMidiNote;
            const grainSize = options?.grainSize ?? (trackData?.track as any)?.grainSize ?? DEFAULT_SAMPLER_CONFIG.grainSize;
            const overlap = options?.overlap ?? (trackData?.track as any)?.overlap ?? DEFAULT_SAMPLER_CONFIG.overlap;

            try {
                console.log(`Connecting sampler ${trackId} to controller using retrieved blob`);
                const file = new File([sampleFile.data], trackName || sampleFile.name, { type: sampleFile.type });
                
                // Connection to sampler will handle instances
                await store.connectTrackToSampler(
                    trackId,
                    file,
                    baseMidiNote,
                    grainSize,
                    overlap
                );
            } catch (connectError) {
                console.error(`Error connecting sampler track ${trackId} in initEngine:`, connectError);
            }
            return Promise.resolve();
        },
    }
};