import MidiSamplerWithInstances from './midiSamplePlayer/samplerWithInstances';
import { MidiManager } from '../midi/MidiManagerNew';
import { TrackPlayer } from './trackPlayer';
import { TrackInstance } from '../../../platform/types/dto/project_track';
import { Note } from '../../../types/note';

/**
 * Sampler data for tracks
 */
interface SamplerTrackData {
    trackId: string;
    sampler: MidiSamplerWithInstances;
    fileId: string;
    baseMidiNote: number;
    grainSize: number;
    overlap: number;
}

/**
 * Manages sampler instances and handles communication between MidiManager,
 * Transport, and individual sampler instances.
 */
export class SamplerControllerWithInstances implements TrackPlayer {
    // Track data storage
    private tracks: Map<string, SamplerTrackData> = new Map();
    
    // Track which instances belong to which track
    private trackInstances: Map<string, Set<string>> = new Map();
    
    // Track subscriptions
    private trackSubscriptions: Map<string, () => void> = new Map();
    
    // Instance data
    private instances: Map<string, TrackInstance> = new Map();
    
    private readonly DEFAULT_GRAIN_SIZE = 0.1;
    private readonly DEFAULT_OVERLAP = 0.1;
    private readonly DEFAULT_BASE_NOTE = 60;
    
    constructor() {
        console.log('SamplerControllerWithInstances initialized');
    }
    
    /**
     * Initialize a sampler for a specific track
     */
    async initializeSampler(
        trackId: string,
        file: File | undefined,
        fileId: string,
        baseMidiNote: number = this.DEFAULT_BASE_NOTE,
        grainSize: number = this.DEFAULT_GRAIN_SIZE,
        overlap: number = this.DEFAULT_OVERLAP
    ): Promise<void> {
        try {
            console.log(`Initializing sampler for track ${trackId}${file ? ' with file ' + file.name : ' (empty)'}`);
            
            const onLog = (message: string) => {
                console.log(`[Sampler ${trackId}] ${message}`);
            };
            
            const onPlaybackStatusChange = (isPlaying: boolean) => {
                // Handle playback status change if needed
            };
            
            // Clean up existing sampler if present
            this.removeTrack(trackId);
            
            // Create new sampler
            const sampler = new MidiSamplerWithInstances(onLog, onPlaybackStatusChange);
            
            // Initialize audio context
            await sampler.initialize();
            
            // Set base note
            sampler.setBaseNote(baseMidiNote);
            
            // Load audio file if provided
            if (file && fileId) {
                await sampler.loadAudioFile(file, fileId, grainSize, overlap);
            }
            
            // Store track data
            const trackData: SamplerTrackData = {
                trackId,
                sampler,
                fileId,
                baseMidiNote,
                grainSize,
                overlap
            };
            
            this.tracks.set(trackId, trackData);
            this.trackInstances.set(trackId, new Set());
            
            console.log(`Sampler for track ${trackId} initialized successfully.`);
        } catch (error) {
            console.error(`Failed to initialize sampler for track ${trackId}:`, error);
            throw error;
        }
    }
    
    /**
     * Add an instance to a track
     */
    addInstance(
        trackId: string,
        instance: TrackInstance,
        notes: Note[]
    ): void {
        const trackData = this.tracks.get(trackId);
        if (!trackData) {
            console.warn(`No sampler found for track ${trackId}`);
            return;
        }
        
        // Store instance data
        this.instances.set(instance.id, instance);
        
        // Track instance-track relationship
        const instanceSet = this.trackInstances.get(trackId);
        if (instanceSet) {
            instanceSet.add(instance.id);
        }
        
        // Add instance to sampler
        trackData.sampler.addInstance(
            instance.id,
            notes,
            instance.x_position,
            instance.trim_start_ticks,
            instance.trim_end_ticks
        );
        
        console.log(`Added instance ${instance.id} to track ${trackId}`);
    }
    
    /**
     * Remove an instance
     */
    removeInstance(trackId: string, instanceId: string): void {
        const trackData = this.tracks.get(trackId);
        if (!trackData) return;
        
        trackData.sampler.removeInstance(instanceId);
        this.instances.delete(instanceId);
        
        const instanceSet = this.trackInstances.get(trackId);
        if (instanceSet) {
            instanceSet.delete(instanceId);
        }
        
        console.log(`Removed instance ${instanceId} from track ${trackId}`);
    }
    
    /**
     * Register MIDI updates from MidiManager for a specific track
     */
    registerTrackSubscription(trackId: string, midiManager: MidiManager): void {
        console.log(`Subscribing to updates for sampler track ${trackId}`);
        
        // Unsubscribe from previous subscription if it exists
        if (this.trackSubscriptions.has(trackId)) {
            const unsubscribe = this.trackSubscriptions.get(trackId);
            if (unsubscribe) unsubscribe();
            this.trackSubscriptions.delete(trackId);
        }
        
        // Subscribe to track updates
        const unsubscribe = midiManager.subscribeToTrack(trackId, (trackId, notes) => {
            console.log(`SamplerControllerWithInstances: Notes updated for track ${trackId}, total notes: ${notes.length}`);
            
            // Update notes for all instances of this track
            const instanceIds = this.trackInstances.get(trackId);
            if (!instanceIds) return;
            
            const trackData = this.tracks.get(trackId);
            if (!trackData) return;
            
            instanceIds.forEach(instanceId => {
                trackData.sampler.updateInstanceNotes(instanceId, notes);
            });
        });
        
        // Store the unsubscribe function
        this.trackSubscriptions.set(trackId, unsubscribe);
        console.log(`Successfully subscribed to MIDI updates for sampler track ${trackId}`);
    }
    
    /**
     * Connect a track to a sampler with instances
     */
    async connectTrackToSampler(
        trackId: string,
        file: File,
        fileId: string,
        midiManager: MidiManager,
        instances: TrackInstance[],
        baseMidiNote: number = this.DEFAULT_BASE_NOTE,
        grainSize: number = this.DEFAULT_GRAIN_SIZE,
        overlap: number = this.DEFAULT_OVERLAP
    ): Promise<void> {
        try {
            console.log(`Connecting track ${trackId} to sampler with ${instances.length} instances`);
            
            // Initialize the sampler
            await this.initializeSampler(trackId, file, fileId, baseMidiNote, grainSize, overlap);
            
            // Ensure the track exists in MidiManager
            if (!midiManager.hasTrack(trackId)) {
                midiManager.createTrack(trackId, "sampler");
            }
            
            // Get notes from MidiManager
            const notes = midiManager.getTrackNotes(trackId) || [];
            
            // Add all instances
            instances.forEach(instance => {
                this.addInstance(trackId, instance, notes);
            });
            
            // Subscribe to future updates
            this.registerTrackSubscription(trackId, midiManager);
            
            console.log(`Successfully connected track ${trackId} to sampler`);
        } catch (error) {
            console.error(`Failed to connect track ${trackId} to sampler:`, error);
            throw error;
        }
    }
    
    /**
     * Remove a track and all its resources
     */
    removeTrack(trackId: string): void {
        // Remove all instances
        const instanceIds = this.trackInstances.get(trackId);
        if (instanceIds) {
            instanceIds.forEach(instanceId => {
                this.instances.delete(instanceId);
            });
        }
        this.trackInstances.delete(trackId);
        
        // Unsubscribe from MIDI updates
        if (this.trackSubscriptions.has(trackId)) {
            const unsubscribe = this.trackSubscriptions.get(trackId);
            if (unsubscribe) unsubscribe();
            this.trackSubscriptions.delete(trackId);
        }
        
        // Clean up sampler
        const trackData = this.tracks.get(trackId);
        if (trackData) {
            trackData.sampler.dispose();
            this.tracks.delete(trackId);
        }
        
        console.log(`Removed sampler track ${trackId}`);
    }
    
    // Transport Integration Methods
    
    async play(startTime: number = 0, bpm: number = 120): Promise<void> {
        console.log(`SamplerControllerWithInstances: Starting playback from ${startTime}s`);
        
        this.tracks.forEach((trackData, trackId) => {
            const instanceIds = this.trackInstances.get(trackId);
            if (!instanceIds) return;
            
            instanceIds.forEach(instanceId => {
                try {
                    trackData.sampler.playMidiInstance(instanceId, bpm, startTime);
                } catch (error) {
                    console.error(`Error starting playback for instance ${instanceId}:`, error);
                }
            });
        });
    }
    
    pause(): Promise<void> {
        console.log('SamplerControllerWithInstances: Pausing playback');
        
        this.tracks.forEach(trackData => {
            trackData.sampler.stopPlayback();
        });
        
        return Promise.resolve();
    }
    
    async stop(): Promise<void> {
        console.log('SamplerControllerWithInstances: Stopping playback');
        
        this.tracks.forEach(trackData => {
            trackData.sampler.stopPlayback();
        });
    }
    
    async seek(position: number, bpm: number = 120): Promise<void> {
        console.log(`SamplerControllerWithInstances: Seeking to ${position}s`);
        
        await this.stop();
        await this.play(position, bpm);
    }
    
    // TrackPlayer interface methods
    
    setTrackVolume(trackId: string, volume: number): Promise<void> {
        const trackData = this.tracks.get(trackId);
        if (trackData) {
            trackData.sampler.setVolume(volume);
        }
        return Promise.resolve();
    }
    
    setTrackMute(trackId: string, mute: boolean): Promise<void> {
        const trackData = this.tracks.get(trackId);
        if (trackData) {
            trackData.sampler.setMute(mute);
        }
        return Promise.resolve();
    }
    
    setTrackPan(id: string, pan: number): Promise<void> {
        console.warn('Pan not implemented for samplers');
        return Promise.resolve();
    }
    
    setTrackPositionTicks(id: string, position: number): Promise<void> {
        console.warn('Use instance methods for position changes');
        return Promise.resolve();
    }
    
    setTrackTrimStartTicks(id: string, start: number): Promise<void> {
        console.warn('Use instance methods for trim changes');
        return Promise.resolve();
    }
    
    setTrackTrimEndTicks(id: string, end: number): Promise<void> {
        console.warn('Use instance methods for trim changes');
        return Promise.resolve();
    }
    
    /**
     * Clean up all resources
     */
    dispose(): void {
        // Clean up all tracks
        for (const trackId of this.tracks.keys()) {
            this.removeTrack(trackId);
        }
        
        // Clear all maps
        this.tracks.clear();
        this.trackInstances.clear();
        this.trackSubscriptions.clear();
        this.instances.clear();
        
        console.log('All samplers disposed');
    }
}

export default SamplerControllerWithInstances;