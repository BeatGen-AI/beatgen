import * as Tone from 'tone';
import AudioFilePlayerWithInstances from '../audio-engine/audioFilePlayer/audioEngineWithInstances';
import { SoundfontEngineControllerWithInstances } from '../audio-engine/soundfontEngineControllerWithInstances';
import SamplerControllerWithInstances from '../audio-engine/samplerControllerWithInstances';
import { TrackInstance } from '../../../platform/types/dto/project_track';
import { MUSIC_CONSTANTS } from '../../constants/musicConstants';

/**
 * Main transport controller that coordinates all instance-aware audio engines
 */
export class TransportControllerWithInstances {
    private audioEngine: AudioFilePlayerWithInstances;
    private soundfontController: SoundfontEngineControllerWithInstances;
    private samplerController: SamplerControllerWithInstances;
    private isStarting: boolean = false;
    private initialized: boolean = false;
    
    constructor(
        audioEngine: AudioFilePlayerWithInstances,
        soundfontController: SoundfontEngineControllerWithInstances,
        samplerController: SamplerControllerWithInstances
    ) {
        this.audioEngine = audioEngine;
        this.soundfontController = soundfontController;
        this.samplerController = samplerController;
    }
    
    /**
     * Initialize the transport controller
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;
        
        try {
            await Tone.start();
            console.log('TransportControllerWithInstances: Tone.js started');
            
            this.initialized = true;
        } catch (error) {
            console.error('TransportControllerWithInstances: Failed to initialize', error);
            throw error;
        }
    }
    
    /**
     * Start playback
     */
    async play(): Promise<void> {
        if (this.isStarting) return;
        this.isStarting = true;
        
        try {
            console.log('TransportControllerWithInstances: Starting playback');
            
            const transportPosition = Tone.getTransport().seconds;
            const bpm = Tone.getTransport().bpm.value;
            
            // Start all engines with current position
            await Promise.all([
                this.audioEngine.play(transportPosition),
                this.soundfontController.play(transportPosition),
                this.samplerController.play(transportPosition, bpm)
            ]);
            
            // Start Tone.js transport
            Tone.getTransport().start();
            
            console.log('TransportControllerWithInstances: Playback started');
        } catch (error) {
            console.error('TransportControllerWithInstances: Failed to start playback', error);
            throw error;
        } finally {
            this.isStarting = false;
        }
    }
    
    /**
     * Pause playback
     */
    async pause(): Promise<void> {
        console.log('TransportControllerWithInstances: Pausing playback');
        
        // Pause Tone.js transport
        Tone.getTransport().pause();
        
        // Pause all engines
        await Promise.all([
            this.audioEngine.pause(),
            this.soundfontController.pause(),
            this.samplerController.pause()
        ]);
        
        console.log('TransportControllerWithInstances: Playback paused');
    }
    
    /**
     * Stop playback
     */
    async stop(): Promise<void> {
        console.log('TransportControllerWithInstances: Stopping playback');
        
        // Stop Tone.js transport
        Tone.getTransport().stop();
        Tone.getTransport().seconds = 0;
        
        // Stop all engines
        await Promise.all([
            this.audioEngine.stop(),
            this.soundfontController.stop(),
            this.samplerController.stop()
        ]);
        
        console.log('TransportControllerWithInstances: Playback stopped');
    }
    
    /**
     * Seek to position
     */
    async seek(positionSeconds: number): Promise<void> {
        console.log(`TransportControllerWithInstances: Seeking to ${positionSeconds}s`);
        
        // Update Tone.js transport position
        Tone.getTransport().seconds = positionSeconds;
        
        // Seek all engines
        await Promise.all([
            this.audioEngine.seek(positionSeconds),
            this.soundfontController.seek(positionSeconds * 1000), // Convert to ms
            this.samplerController.seek(positionSeconds, this.getBPM())
        ]);
        
        console.log('TransportControllerWithInstances: Seek completed');
    }
    
    /**
     * Set BPM
     */
    setBPM(bpm: number): void {
        console.log(`TransportControllerWithInstances: Setting BPM to ${bpm}`);
        Tone.getTransport().bpm.value = bpm;
        
        // Update soundfont controller BPM
        this.soundfontController.setGlobalBPM(bpm);
    }
    
    /**
     * Get current BPM
     */
    getBPM(): number {
        return Tone.getTransport().bpm.value;
    }
    
    /**
     * Get current position
     */
    getPosition(): number {
        return Tone.getTransport().seconds;
    }
    
    /**
     * Check if playing
     */
    isPlaying(): boolean {
        return Tone.getTransport().state === 'started';
    }
    
    // Track control methods
    
    async setTrackVolume(trackId: string, volume: number): Promise<void> {
        await Promise.all([
            this.audioEngine.setTrackVolume(trackId, volume),
            this.soundfontController.setTrackVolume(trackId, volume),
            this.samplerController.setTrackVolume(trackId, volume)
        ]);
    }
    
    async setTrackMute(trackId: string, mute: boolean): Promise<void> {
        await Promise.all([
            this.audioEngine.setTrackMute(trackId, mute),
            this.soundfontController.setTrackMute(trackId, mute),
            this.samplerController.setTrackMute(trackId, mute)
        ]);
    }
    
    async setTrackPan(trackId: string, pan: number): Promise<void> {
        await Promise.all([
            this.audioEngine.setTrackPan(trackId, pan),
            this.soundfontController.setTrackPan(trackId, pan),
            this.samplerController.setTrackPan(trackId, pan)
        ]);
    }
    
    /**
     * Handle track position change during playback
     */
    handleTrackPositionChange(trackId: string, newPositionX: number): void {
        if (!this.isPlaying()) return;
        
        // Convert position to seconds
        const bpm = this.getBPM();
        const ppq = MUSIC_CONSTANTS.pulsesPerQuarterNote;
        const secondsPerBeat = 60 / bpm;
        const beats = newPositionX / ppq;
        const positionSeconds = beats * secondsPerBeat;
        
        console.log(`TransportControllerWithInstances: Track ${trackId} position changed to ${positionSeconds}s`);
        
        // This would trigger re-scheduling of the track's instances
        // Implementation depends on specific engine requirements
    }
    
    /**
     * Clean up resources
     */
    dispose(): void {
        console.log('TransportControllerWithInstances: Disposing');
        
        // Stop playback
        if (this.isPlaying()) {
            this.stop().catch(console.error);
        }
        
        // Engines are disposed by their owners
    }
}