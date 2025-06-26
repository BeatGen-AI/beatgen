import { Store, StoreInterface } from './store';
import { TransportWithInstances } from './transportWithInstances';
import { TrackInstance } from '../../../platform/types/dto/project_track';
import { CombinedTrack } from '../../../platform/types/project';
import * as Tone from 'tone';

/**
 * Extended Store class that supports track instances
 * This replaces the original Store for instance-based audio playback
 */
export class StoreWithInstances extends Store implements StoreInterface {
    private transportWithInstances: TransportWithInstances;
    
    constructor() {
        super();
        
        // Replace the transport controller with instance-aware version
        this.transportWithInstances = new TransportWithInstances();
        
        // Override the transport controller getter
        (this as any).transportController = this.transportWithInstances;
    }

    /**
     * Initialize audio with instance support
     */
    public async initializeAudio(): Promise<void> {
        // Check if already initialized using reflection since initialized is private
        const isInitialized = (this as any).initialized;
        if (isInitialized) return;
        
        try {
            // Initialize the instance-aware audio engines first
            await this.transportWithInstances.getAudioEngine().initialize();
            
            // Get Tone.js context and extract raw audio context
            const toneContext = Tone.getContext();
            const rawContext = toneContext.rawContext;
            
            // Create audio context for soundfont
            const audioContext = new AudioContext({
                latencyHint: 'interactive',
                sampleRate: rawContext.sampleRate
            });

            // Initialize transport with instances
            await this.transportWithInstances.initialize(audioContext);
            
            // Mark as initialized
            (this as any).initialized = true;
            
            // Initialize runtime data for existing tracks
            this.initializeRuntimeTrackDataWithInstances();
            
            console.log('StoreWithInstances: Audio initialization completed');
        } catch (error) {
            console.error('StoreWithInstances: Audio initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize runtime data with instance support
     */
    private initializeRuntimeTrackDataWithInstances(): void {
        const project = this.getProjectManager().getCurrentProject();
        if (!project) return;

        console.log('Initializing runtime data with instances for existing tracks...');
        
        project.tracks.forEach(track => {
            // Initialize track instances in audio engines
            if (track.instances && track.instances.length > 0) {
                this.initializeTrackInstances(track.id, track.instances, track.track_type);
            }
        });
    }

    /**
     * Initialize track instances in appropriate audio engine
     */
    private async initializeTrackInstances(
        trackId: string, 
        instances: TrackInstance[], 
        trackType: string
    ): Promise<void> {
        try {
            await this.transportWithInstances.addTrackInstances(trackId, instances, trackType);
            console.log(`Initialized ${instances.length} instances for track ${trackId}`);
        } catch (error) {
            console.error(`Failed to initialize instances for track ${trackId}:`, error);
        }
    }

    /**
     * Load audio file with instance support
     */
    public async loadAudioFile(
        trackId: string, 
        file: File, 
        position?: { x: number, y: number }
    ): Promise<void> {
        // Auto-initialize if not already initialized
        const isInitialized = (this as any).initialized;
        if (!isInitialized) {
            console.log('Store not initialized, initializing now...');
            await this.initializeAudio();
        }
        
        // Access track through the project's tracks array instead of getTrackById
        const project = this.getProjectManager().getCurrentProject();
        if (!project) {
            throw new Error('No project loaded');
        }
        
        const track = project.tracks.find(t => t.id === trackId);
        if (!track) {
            throw new Error(`Track ${trackId} not found`);
        }

        // Get track instances
        const instances = track.instances || [];
        
        // If no instances exist, create a default one
        if (instances.length === 0) {
            const defaultInstance: TrackInstance = {
                id: `${trackId}_instance_0`,
                track_id: trackId,
                x_position: position?.x || 0,
                y_position: position?.y || 0,
                trim_start_ticks: 0,
                trim_end_ticks: undefined
            };
            instances.push(defaultInstance);
            
            // Update track with instance
            this.getProjectManager().updateTrack(trackId, { instances });
        }

        // Load audio file with instances
        await this.transportWithInstances.loadAudioFile(trackId, file, instances, position);
    }

    /**
     * Connect track to soundfont with instance support
     */
    public async connectTrackToSoundfont(
        trackId: string,
        instrumentId: string
    ): Promise<void> {
        // Auto-initialize if not already initialized
        const isInitialized = (this as any).initialized;
        if (!isInitialized) {
            console.log('Store not initialized, initializing now...');
            await this.initializeAudio();
        }
        
        // Access track through the project's tracks array instead of getTrackById
        const project = this.getProjectManager().getCurrentProject();
        if (!project) {
            throw new Error('No project loaded');
        }
        
        const track = project.tracks.find(t => t.id === trackId);
        if (!track) {
            throw new Error(`Track ${trackId} not found`);
        }

        const instances = track.instances || [];
        
        // Create default instance if none exist
        if (instances.length === 0) {
            const defaultInstance: TrackInstance = {
                id: `${trackId}_instance_0`,
                track_id: trackId,
                x_position: 0,
                y_position: track.y_position || 0,
                trim_start_ticks: 0,
                trim_end_ticks: undefined
            };
            instances.push(defaultInstance);
            
            // Update track with instance
            this.getProjectManager().updateTrack(trackId, { instances });
        }

        try {
            console.log(`Connecting track ${trackId} to soundfont ${instrumentId} with ${instances.length} instances`);
            
            await this.transportWithInstances.connectTrackToSoundfont(
                trackId,
                instrumentId,
                this.getMidiManager(),
                instances
            );
            
            console.log(`Successfully connected track ${trackId} to soundfont ${instrumentId}`);
        } catch (error) {
            console.error(`Failed to connect track ${trackId} to soundfont ${instrumentId}:`, error);
            throw error;
        }
    }

    /**
     * Connect track to sampler with instance support
     */
    public async connectTrackToSampler(
        trackId: string,
        file: File,
        baseMidiNote?: number,
        grainSize?: number,
        overlap?: number
    ): Promise<void> {
        // Auto-initialize if not already initialized
        const isInitialized = (this as any).initialized;
        if (!isInitialized) {
            console.log('Store not initialized, initializing now...');
            await this.initializeAudio();
        }
        
        // Access track through the project's tracks array instead of getTrackById
        const project = this.getProjectManager().getCurrentProject();
        if (!project) {
            throw new Error('No project loaded');
        }
        
        const track = project.tracks.find(t => t.id === trackId);
        if (!track) {
            throw new Error(`Track ${trackId} not found`);
        }

        const instances = track.instances || [];
        
        // Create default instance if none exist
        if (instances.length === 0) {
            const defaultInstance: TrackInstance = {
                id: `${trackId}_instance_0`,
                track_id: trackId,
                x_position: 0,
                y_position: track.y_position || 0,
                trim_start_ticks: 0,
                trim_end_ticks: undefined
            };
            instances.push(defaultInstance);
            
            // Update track with instance
            this.getProjectManager().updateTrack(trackId, { instances });
        }

        try {
            console.log(`Connecting track ${trackId} to sampler with file ${file.name} and ${instances.length} instances`);
            
            // Generate file ID for buffer manager
            const fileId = `${trackId}_${Date.now()}`;
            
            await this.transportWithInstances.connectTrackToSampler(
                trackId,
                file,
                fileId,
                this.getMidiManager(),
                instances,
                baseMidiNote,
                grainSize,
                overlap
            );
            
            console.log(`Successfully connected track ${trackId} to sampler`);
        } catch (error) {
            console.error(`Failed to connect track ${trackId} to sampler:`, error);
            throw error;
        }
    }

    /**
     * Add a track instance
     */
    public async addTrackInstance(
        trackId: string,
        instance: TrackInstance
    ): Promise<void> {
        // Access track through the project's tracks array instead of getTrackById
        const project = this.getProjectManager().getCurrentProject();
        if (!project) {
            throw new Error('No project loaded');
        }
        
        const track = project.tracks.find(t => t.id === trackId);
        if (!track) {
            throw new Error(`Track ${trackId} not found`);
        }

        // Add to project manager
        const instances = [...(track.instances || []), instance];
        this.getProjectManager().updateTrack(trackId, { instances });

        // Add to audio engine
        await this.transportWithInstances.addTrackInstances(trackId, [instance], track.track_type);
    }

    /**
     * Remove a track instance
     */
    public async removeTrackInstance(
        trackId: string,
        instanceId: string
    ): Promise<void> {
        // Access track through the project's tracks array instead of getTrackById
        const project = this.getProjectManager().getCurrentProject();
        if (!project) {
            throw new Error('No project loaded');
        }
        
        const track = project.tracks.find(t => t.id === trackId);
        if (!track) {
            throw new Error(`Track ${trackId} not found`);
        }

        // Remove from project manager
        const instances = (track.instances || []).filter(inst => inst.id !== instanceId);
        this.getProjectManager().updateTrack(trackId, { instances });

        // Remove from audio engine
        await this.transportWithInstances.removeTrackInstance(trackId, instanceId, track.track_type);
    }

    /**
     * Update a track instance
     */
    public async updateTrackInstance(
        trackId: string,
        instanceId: string,
        updates: Partial<TrackInstance>
    ): Promise<void> {
        // Access track through the project's tracks array instead of getTrackById
        const project = this.getProjectManager().getCurrentProject();
        if (!project) {
            throw new Error('No project loaded');
        }
        
        const track = project.tracks.find(t => t.id === trackId);
        if (!track) {
            throw new Error(`Track ${trackId} not found`);
        }

        // Update in project manager
        const instances = (track.instances || []).map(inst => 
            inst.id === instanceId ? { ...inst, ...updates } : inst
        );
        this.getProjectManager().updateTrack(trackId, { instances });

        // Update in audio engine
        await this.transportWithInstances.updateTrackInstance(trackId, instanceId, updates, track.track_type);
    }

    /**
     * Override getTransport to return instance-aware transport
     */
    public getTransport(): any {
        return this.transportWithInstances;
    }

    /**
     * Override getAudioEngine to return instance-aware version
     */
    public getAudioEngine(): any {
        return this.transportWithInstances.getAudioEngine();
    }

    /**
     * Override getSoundfontController to return instance-aware version
     */
    public getSoundfontController(): any {
        return this.transportWithInstances.getSoundfontController();
    }

    /**
     * Override getSamplerController to return instance-aware version
     */
    public getSamplerController(): any {
        return this.transportWithInstances.getSamplerController();
    }
}