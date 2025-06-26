import * as Tone from 'tone';
import { TransportControllerWithInstances } from './transportControllerWithInstances';
import AudioFilePlayerWithInstances from '../audio-engine/audioFilePlayer/audioEngineWithInstances';
import { SoundfontEngineControllerWithInstances } from '../audio-engine/soundfontEngineControllerWithInstances';
import SamplerControllerWithInstances from '../audio-engine/samplerControllerWithInstances';
import { TrackInstance } from '../../../platform/types/dto/project_track';
import { MidiManager } from '../midi/MidiManagerNew';

/**
 * Updated TransportController that uses instance-aware audio engines
 * This replaces the original TransportController for instance-based playback
 */
export class TransportWithInstances {
    private transportController: TransportControllerWithInstances;
    private audioEngine: AudioFilePlayerWithInstances;
    private soundfontController: SoundfontEngineControllerWithInstances;
    private samplerController: SamplerControllerWithInstances;
    private initialized: boolean = false;

    constructor() {
        // Initialize instance-aware audio engines
        this.audioEngine = AudioFilePlayerWithInstances.getInstance();
        this.soundfontController = new SoundfontEngineControllerWithInstances();
        this.samplerController = new SamplerControllerWithInstances();

        // Create transport controller with instance-aware engines
        this.transportController = new TransportControllerWithInstances(
            this.audioEngine,
            this.soundfontController,
            this.samplerController
        );

        // Set default BPM
        Tone.getTransport().bpm.value = 120;
    }

    /**
     * Initialize the transport and audio engines
     */
    async initialize(audioContext?: AudioContext): Promise<void> {
        if (this.initialized) return;

        try {
            // Initialize audio file player
            await this.audioEngine.initialize();

            // Initialize soundfont controller with audio context
            if (audioContext) {
                this.soundfontController.initialize(audioContext);
            }

            // Initialize transport controller
            await this.transportController.initialize();

            this.initialized = true;
            console.log('TransportWithInstances: Initialized successfully');
        } catch (error) {
            console.error('TransportWithInstances: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Add track instances to the transport system
     */
    async addTrackInstances(trackId: string, instances: TrackInstance[], trackType: string): Promise<void> {
        // Add instances to appropriate engine based on track type
        switch (trackType) {
            case 'audio':
            case 'AUDIO':
                for (const instance of instances) {
                    await this.audioEngine.addInstance(trackId, instance);
                }
                break;
            
            case 'midi':
            case 'MIDI':
                // MIDI tracks handled by soundfont controller
                // Instances added when connecting to soundfont
                break;
            
            case 'sampler':
            case 'SAMPLER':
                // Sampler tracks handled by sampler controller
                // Instances added when connecting to sampler
                break;
            
            default:
                console.warn(`Unknown track type: ${trackType}`);
        }
    }

    /**
     * Remove a track instance
     */
    async removeTrackInstance(trackId: string, instanceId: string, trackType: string): Promise<void> {
        switch (trackType) {
            case 'audio':
            case 'AUDIO':
                await this.audioEngine.removeInstance(trackId, instanceId);
                break;
            
            case 'midi':
            case 'MIDI':
                this.soundfontController.removeInstance(trackId, instanceId);
                break;
            
            case 'sampler':
            case 'SAMPLER':
                this.samplerController.removeInstance(trackId, instanceId);
                break;
        }
    }

    /**
     * Update instance position or trim
     */
    async updateTrackInstance(
        trackId: string, 
        instanceId: string, 
        updates: Partial<TrackInstance>,
        trackType: string
    ): Promise<void> {
        switch (trackType) {
            case 'audio':
            case 'AUDIO':
                const instances = await this.audioEngine.getTrackInstances(trackId);
                const instance = instances.find(inst => inst.id === instanceId);
                if (instance) {
                    Object.assign(instance, updates);
                    // Reposition player if needed
                    if (updates.x_position !== undefined) {
                        const player = this.audioEngine.getInstancePlayer(trackId, instanceId);
                        if (player) {
                            await player.setPositionTicks(updates.x_position);
                        }
                    }
                }
                break;
            
            // Handle other track types as needed
        }
    }

    /**
     * Load audio file with instances
     */
    async loadAudioFile(
        trackId: string, 
        file: File, 
        instances: TrackInstance[],
        position?: { x: number, y: number }
    ): Promise<void> {
        // Load file into audio engine
        await this.audioEngine.loadAudioFile(trackId, file);

        // Add all instances
        for (const instance of instances) {
            await this.audioEngine.addInstance(trackId, instance);
        }

        console.log(`Loaded audio file for track ${trackId} with ${instances.length} instances`);
    }

    /**
     * Connect track to soundfont with instances
     */
    async connectTrackToSoundfont(
        trackId: string,
        instrumentId: string,
        midiManager: MidiManager,
        instances: TrackInstance[]
    ): Promise<void> {
        await this.soundfontController.connectTrackToSoundfont(
            trackId,
            instrumentId,
            midiManager,
            instances
        );
    }

    /**
     * Connect track to sampler with instances
     */
    async connectTrackToSampler(
        trackId: string,
        file: File,
        fileId: string,
        midiManager: MidiManager,
        instances: TrackInstance[],
        baseMidiNote?: number,
        grainSize?: number,
        overlap?: number
    ): Promise<void> {
        await this.samplerController.connectTrackToSampler(
            trackId,
            file,
            fileId,
            midiManager,
            instances,
            baseMidiNote,
            grainSize,
            overlap
        );
    }

    // Playback control methods
    async play(): Promise<void> {
        await this.transportController.play();
    }

    async pause(): Promise<void> {
        await this.transportController.pause();
    }

    async stop(): Promise<void> {
        await this.transportController.stop();
    }

    async seek(position: number): Promise<void> {
        await this.transportController.seek(position);
    }
    
    // Backward compatibility alias for seek
    setPosition(position: number): void {
        this.seek(position).catch(error => {
            console.error('Error setting position:', error);
        });
    }

    // Getters for engines
    getAudioEngine(): AudioFilePlayerWithInstances {
        return this.audioEngine;
    }

    getSoundfontController(): SoundfontEngineControllerWithInstances {
        return this.soundfontController;
    }

    getSamplerController(): SamplerControllerWithInstances {
        return this.samplerController;
    }

    getTransportController(): TransportControllerWithInstances {
        return this.transportController;
    }

    // BPM and time signature
    setBPM(bpm: number): void {
        this.transportController.setBPM(bpm);
    }

    getBPM(): number {
        return this.transportController.getBPM();
    }

    setTimeSignature(numerator: number, denominator: number): void {
        Tone.getTransport().timeSignature = [numerator, denominator];
    }

    // Track parameter updates
    async setTrackVolume(trackId: string, volume: number): Promise<void> {
        await this.transportController.setTrackVolume(trackId, volume);
    }

    async setTrackMute(trackId: string, mute: boolean): Promise<void> {
        await this.transportController.setTrackMute(trackId, mute);
    }

    async setTrackPan(trackId: string, pan: number): Promise<void> {
        await this.transportController.setTrackPan(trackId, pan);
    }
    
    // Handle track position changes during playback
    handleTrackPositionChange(trackId: string, newPositionXTicks: number): void {
        // Forward to the transport controller
        this.transportController.handleTrackPositionChange(trackId, newPositionXTicks);
    }

    // Clean up
    dispose(): void {
        this.transportController.dispose();
        this.audioEngine.dispose();
        this.samplerController.dispose();
        // Note: soundfontController doesn't have dispose method
    }
}