import { MidiSoundfontPlayerWithInstances, InstanceOptions } from './midiSoundfontPlayer/midiSoundfontPlayerWithInstances';
import { MidiManager } from '../midi/MidiManagerNew';
import { db } from '../db/dexie-client';
import { Note } from '../../../types/note';
import { TrackPlayer } from './trackPlayer';
import { TrackInstance } from '../../../platform/types/dto/project_track';

/**
 * Controller for the MidiSoundfontPlayer that supports instances
 */
export class SoundfontEngineControllerWithInstances implements TrackPlayer {
    private midiPlayer: MidiSoundfontPlayerWithInstances;
    private trackSubscriptions: Map<string, () => void> = new Map();
    
    // Track instance data
    private trackInstances: Map<string, Map<string, TrackInstance>> = new Map();
    
    constructor() {
        this.midiPlayer = new MidiSoundfontPlayerWithInstances();
    }
    
    /**
     * Initialize the SoundfontPlayer with an AudioContext
     */
    async initialize(audioContext: AudioContext): Promise<void> {
        try {
            console.log('Initializing SoundfontEngineControllerWithInstances');
            await this.midiPlayer.initSynthesizer(audioContext);
            console.log('SoundfontEngineControllerWithInstances initialized successfully');
        } catch (error) {
            console.error('Failed to initialize SoundfontEngineControllerWithInstances:', error);
            throw error;
        }
    }
    
    /**
     * Subscribe to a specific track for MIDI updates
     */
    registerTrackSubscription(trackId: string, midiManager: MidiManager): void {
        console.log(`Subscribing to updates for track ${trackId}`);
        
        // Unsubscribe from previous subscription if it exists
        if (this.trackSubscriptions.has(trackId)) {
            const unsubscribe = this.trackSubscriptions.get(trackId);
            if (unsubscribe) unsubscribe();
            this.trackSubscriptions.delete(trackId);
        }
        
        // Subscribe to track updates
        const unsubscribe = midiManager.subscribeToTrack(trackId, async (trackId, notes) => {
            try {
                console.log(`SoundfontEngineControllerWithInstances: Notes updated for track ${trackId}`);
                
                // Update track data in the player
                const trackData = this.midiPlayer['tracks'].get(trackId);
                if (trackData) {
                    // Update notes for all instances of this track
                    await this.updateTrackNotes(trackId, notes);
                } else {
                    console.warn(`No track data found for ${trackId}, client needs to add track first`);
                }
                
            } catch (error) {
                console.error(`Failed to update MIDI playback for track ${trackId}:`, error);
            }
        });
        
        // Store the unsubscribe function
        this.trackSubscriptions.set(trackId, unsubscribe);
        console.log(`Subscription for track ${trackId} registered successfully`);
    }
    
    /**
     * Get soundfont data using SoundfontManager
     */
    private async getSoundfontData(instrumentId: string): Promise<{ data: ArrayBuffer, storage_key?: string } | null> {
        try {
            console.log(`Fetching soundfont data for instrument ${instrumentId}`);
            
            // Import SoundfontManager dynamically to avoid circular dependencies
            const { default: SoundfontManager } = await import('../soundfont/soundfontManager');
            const soundfontManager = SoundfontManager.getInstance(db);
            
            const result = await soundfontManager.getSoundfont(instrumentId);
            
            console.log(`Loaded soundfont data (${result.data.byteLength} bytes) for instrument ${instrumentId}`);
            
            return result;
        } catch (error) {
            console.error(`Failed to get soundfont data for instrument ${instrumentId}:`, error);
            return null;
        }
    }
    
    /**
     * Add track data to the player (notes and soundfont)
     */
    async addTrackData(
        trackId: string, 
        instrumentId: string, 
        midiManager: MidiManager
    ): Promise<void> {
        // Ensure the track exists in MidiManager
        if (!midiManager.hasTrack(trackId)) {
            console.log(`Track ${trackId} not found in MidiManager, creating it now`);
            midiManager.createTrack(trackId, instrumentId);
        }
        
        // Get soundfont data
        const soundfontResult = await this.getSoundfontData(instrumentId);
        if (!soundfontResult) {
            throw new Error(`No soundfont data found for instrument ${instrumentId}`);
        }
        
        // Get notes from MidiManager
        const notes = midiManager.getTrackNotes(trackId) || [];
        
        // Add track data to player
        await this.midiPlayer.addTrackData(
            trackId,
            notes,
            soundfontResult.data,
            instrumentId
        );
        
        // Subscribe to future updates
        this.registerTrackSubscription(trackId, midiManager);
        
        console.log(`Track data added for ${trackId} with instrument ${instrumentId}`);
    }
    
    /**
     * Add an instance of a track
     */
    async addTrackInstance(
        trackId: string,
        instance: TrackInstance
    ): Promise<void> {
        // Store instance data
        if (!this.trackInstances.has(trackId)) {
            this.trackInstances.set(trackId, new Map());
        }
        this.trackInstances.get(trackId)!.set(instance.id, instance);
        
        // Create instance in player
        const options: InstanceOptions = {
            x_position: instance.x_position,
            trim_start_ticks: instance.trim_start_ticks,
            trim_end_ticks: instance.trim_end_ticks
        };
        
        await this.midiPlayer.addInstance(trackId, instance.id, options);
        
        console.log(`Added instance ${instance.id} for track ${trackId}`);
    }
    
    /**
     * Remove a track instance
     */
    removeTrackInstance(trackId: string, instanceId: string): void {
        this.midiPlayer.removeInstance(instanceId);
        
        const trackInstanceMap = this.trackInstances.get(trackId);
        if (trackInstanceMap) {
            trackInstanceMap.delete(instanceId);
        }
        
        console.log(`Removed instance ${instanceId} from track ${trackId}`);
    }
    
    /**
     * Update notes for all instances of a track
     */
    private async updateTrackNotes(trackId: string, notes: Note[]): Promise<void> {
        // Get all instances of this track
        const instanceIds = this.midiPlayer.getTrackInstanceIds(trackId);
        
        // Re-create all instances with updated notes
        const trackInstanceMap = this.trackInstances.get(trackId);
        if (!trackInstanceMap) return;
        
        for (const instanceId of instanceIds) {
            const instance = trackInstanceMap.get(instanceId);
            if (instance) {
                // Remove and re-add instance with new notes
                this.midiPlayer.removeInstance(instanceId);
                
                const options: InstanceOptions = {
                    x_position: instance.x_position,
                    trim_start_ticks: instance.trim_start_ticks,
                    trim_end_ticks: instance.trim_end_ticks
                };
                
                await this.midiPlayer.addInstance(trackId, instanceId, options);
            }
        }
        
        console.log(`Updated notes for ${instanceIds.length} instances of track ${trackId}`);
    }
    
    /**
     * Connect a MIDI track to a soundfont with instances
     */
    async connectTrackToSoundfont(
        trackId: string,
        instrumentId: string,
        midiManager: MidiManager,
        instances: TrackInstance[]
    ): Promise<void> {
        try {
            console.log(`Connecting track ${trackId} to soundfont ${instrumentId} with ${instances.length} instances`);
            
            // Add track data
            await this.addTrackData(trackId, instrumentId, midiManager);
            
            // Add all instances
            for (const instance of instances) {
                await this.addTrackInstance(trackId, instance);
            }
            
            console.log(`Successfully connected track ${trackId} with ${instances.length} instances`);
        } catch (error) {
            console.error(`Failed to connect track ${trackId} to soundfont:`, error);
            throw error;
        }
    }
    
    /**
     * Remove an instance
     */
    removeInstance(trackId: string, instanceId: string): void {
        this.removeTrackInstance(trackId, instanceId);
    }
    
    // Transport methods
    
    async play(startTimeInSeconds?: number): Promise<void> {
        console.log(`SoundfontEngineControllerWithInstances: Starting playback`);
        if (startTimeInSeconds !== undefined) {
            await this.midiPlayer.seek(startTimeInSeconds * 1000);
        }
        await this.midiPlayer.play();
    }
    
    pause(): Promise<void> {
        console.log('SoundfontEngineControllerWithInstances: Pausing playback');
        this.midiPlayer.pause();
        return Promise.resolve();
    }
    
    async stop(): Promise<void> {
        console.log('SoundfontEngineControllerWithInstances: Stopping playback');
        await this.midiPlayer.stop();
    }
    
    async seek(positionInMilliseconds: number): Promise<void> {
        console.log(`SoundfontEngineControllerWithInstances: Seeking to ${positionInMilliseconds}ms`);
        await this.midiPlayer.seek(positionInMilliseconds);
    }
    
    // Track operations
    
    removeTrack(trackId: string): void {
        console.log(`SoundfontEngineControllerWithInstances: Removing track ${trackId}`);
        
        // Unsubscribe from updates
        const unsubscribe = this.trackSubscriptions.get(trackId);
        if (unsubscribe) {
            unsubscribe();
            this.trackSubscriptions.delete(trackId);
        }
        
        // Remove from player
        this.midiPlayer.removeTrack(trackId);
        
        // Remove instance data
        this.trackInstances.delete(trackId);
    }
    
    setTrackVolume(trackId: string, volume: number): Promise<void> {
        // Convert from app's volume scale (0-100) to MIDI volume scale (0-127)
        const midiVolume = Math.round((volume / 100) * 127);
        
        // Set volume for all instances of this track
        const instanceIds = this.midiPlayer.getTrackInstanceIds(trackId);
        instanceIds.forEach(instanceId => {
            this.midiPlayer.setInstanceVolume(instanceId, midiVolume);
        });
        
        return Promise.resolve();
    }
    
    setTrackMute(trackId: string, mute: boolean): Promise<void> {
        // Mute all instances of this track
        const instanceIds = this.midiPlayer.getTrackInstanceIds(trackId);
        instanceIds.forEach(instanceId => {
            this.midiPlayer.muteInstance(instanceId, mute);
        });
        
        return Promise.resolve();
    }
    
    async setGlobalBPM(bpm: number): Promise<void> {
        console.log(`SoundfontEngineControllerWithInstances: Setting global BPM to ${bpm}`);
        await this.midiPlayer.setGlobalBPM(bpm);
    }
    
    /**
     * Clean up resources
     */
    dispose(): void {
        console.log('Disposing SoundfontEngineControllerWithInstances');
        
        // Unsubscribe from all track subscriptions
        for (const [trackId, unsubscribe] of this.trackSubscriptions.entries()) {
            unsubscribe();
            console.log(`Unsubscribed from track ${trackId}`);
        }
        this.trackSubscriptions.clear();
        
        this.midiPlayer.dispose();
        console.log('Disposed MidiSoundfontPlayerWithInstances');
    }
    
    // Legacy methods for TrackPlayer interface
    setTrackPan(id: string, pan: number): Promise<void> {
        console.warn('setTrackPan not implemented for soundfont engine');
        return Promise.resolve();
    }
    
    setTrackPositionTicks(id: string, position: number): Promise<void> {
        console.warn('setTrackPositionTicks - use instance methods instead');
        return Promise.resolve();
    }
    
    setTrackTrimStartTicks(id: string, start: number): Promise<void> {
        console.warn('setTrackTrimStartTicks - use instance methods instead');
        return Promise.resolve();
    }
    
    setTrackTrimEndTicks(id: string, end: number): Promise<void> {
        console.warn('setTrackTrimEndTicks - use instance methods instead');
        return Promise.resolve();
    }
}