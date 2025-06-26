import * as Tone from "tone";
import { Note } from "../../../../types/note";
import { AudioBufferManager } from '../audioBufferManager';
import { TrackInstance } from '../../../../platform/types/dto/project_track';
import { MUSIC_CONSTANTS } from '../../../constants/musicConstants';

// Types for event callbacks
type LogCallback = (message: string) => void;
type PlaybackStatusCallback = (isPlaying: boolean) => void;

/**
 * Instance-specific data for samplers
 */
interface SamplerInstance {
    instanceId: string;
    notes: Note[];
    offsetTicks: number;
    trimStartTicks?: number;
    trimEndTicks?: number;
    scheduledEvents: number[];
    activeTimeouts: Set<NodeJS.Timeout>;
}

/**
 * MIDI Sampler with instance support
 */
class MidiSamplerWithInstances {
    private buffer: Tone.ToneAudioBuffer | null = null;
    private fileId: string | null = null;
    private bufferManager: AudioBufferManager;
    
    // Instance storage
    private instances: Map<string, SamplerInstance> = new Map();
    
    // Sampler settings
    private baseNote: number = 60; // C4 MIDI note number
    private grainSize: number = 0.1;
    private overlap: number = 0.1;
    
    // Master gain node for volume control
    private gainNode: Tone.Gain;
    private currentVolume: number = 100; // Store current volume (0-100)
    private isMuted: boolean = false;
    
    // Callbacks
    private onLog: LogCallback;
    private onPlaybackStatusChange: PlaybackStatusCallback;
    
    // Track-level offset (applies to all instances)
    private trackOffsetSeconds: number = 0;

    constructor(
        onLog: LogCallback,
        onPlaybackStatusChange: PlaybackStatusCallback
    ) {
        this.onLog = onLog;
        this.onPlaybackStatusChange = onPlaybackStatusChange;
        this.bufferManager = AudioBufferManager.getInstance();
        
        // Initialize gain node
        this.gainNode = new Tone.Gain(1).toDestination();
    }

    // Initialize audio context
    public async initialize(): Promise<void> {
        try {
            this.log("Audio context initialized");
            return Promise.resolve();
        } catch (error: any) {
            this.log(`Error initializing audio: ${error.message}`);
            return Promise.reject(error);
        }
    }

    /**
     * Load audio file for the sampler
     */
    public async loadAudioFile(
        file: File,
        fileId: string,
        grainSize: number = 0.1,
        overlap: number = 0.1
    ): Promise<void> {
        try {
            this.log(`Loading audio file: ${file.name}`);
            
            // Store settings
            this.grainSize = grainSize;
            this.overlap = overlap;
            this.fileId = fileId;
            
            // Load buffer through buffer manager
            const objectUrl = URL.createObjectURL(file);
            this.buffer = await this.bufferManager.getBuffer(fileId, objectUrl);
            URL.revokeObjectURL(objectUrl);
            
            this.log("Audio sample loaded successfully");
        } catch (error: any) {
            this.log(`Error loading audio: ${error.message}`);
            throw error;
        }
    }

    /**
     * Add an instance with notes
     */
    public addInstance(
        instanceId: string,
        notes: Note[],
        offsetTicks: number,
        trimStartTicks?: number,
        trimEndTicks?: number
    ): void {
        // Remove existing instance if it exists
        this.removeInstance(instanceId);
        
        // Apply trim to notes if needed
        let notesToUse = notes;
        if (trimStartTicks !== undefined || trimEndTicks !== undefined) {
            notesToUse = this.applyTrimToNotes(notes, trimStartTicks || 0, trimEndTicks || Infinity);
        }
        
        const instance: SamplerInstance = {
            instanceId,
            notes: notesToUse,
            offsetTicks,
            trimStartTicks,
            trimEndTicks,
            scheduledEvents: [],
            activeTimeouts: new Set()
        };
        
        this.instances.set(instanceId, instance);
        this.log(`Added instance ${instanceId} with ${notesToUse.length} notes`);
    }

    /**
     * Remove an instance
     */
    public removeInstance(instanceId: string): void {
        const instance = this.instances.get(instanceId);
        if (!instance) return;
        
        // Clear scheduled events
        instance.scheduledEvents.forEach(id => {
            Tone.Transport.clear(id);
        });
        
        // Clear timeouts
        instance.activeTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        
        this.instances.delete(instanceId);
        this.log(`Removed instance ${instanceId}`);
    }

    /**
     * Apply trim to notes
     */
    private applyTrimToNotes(
        notes: Note[],
        trimStartTicks: number,
        trimEndTicks: number
    ): Note[] {
        return notes.filter(note => {
            const noteStart = note.column;
            const noteEnd = note.column + note.length;
            
            // Note must start within trim bounds
            return noteStart >= trimStartTicks && noteStart < trimEndTicks;
        }).map(note => {
            // Adjust note position relative to trim start
            return {
                ...note,
                column: note.column - trimStartTicks
            };
        });
    }

    /**
     * Create a temporary player for a note
     */
    private createAndConfigurePlayer(): Tone.GrainPlayer | null {
        if (!this.buffer) {
            this.log("Cannot create player: no buffer loaded");
            return null;
        }
        
        try {
            const player = new Tone.GrainPlayer({
                url: this.buffer,
                grainSize: this.grainSize,
                overlap: this.overlap
            });
            player.connect(this.gainNode);
            player.volume.value = -Infinity; // Start silent
            return player;
        } catch (error) {
            this.log(`Error creating player: ${error}`);
            return null;
        }
    }

    /**
     * Convert ticks to seconds
     */
    private ticksToSeconds(ticks: number, bpm: number): number {
        const ppq = MUSIC_CONSTANTS.pulsesPerQuarterNote;
        const beats = ticks / ppq;
        const secondsPerBeat = 60 / bpm;
        return beats * secondsPerBeat;
    }

    /**
     * Play MIDI for a specific instance
     */
    public playMidiInstance(
        instanceId: string,
        bpm: number,
        startTime: number = 0
    ): void {
        const instance = this.instances.get(instanceId);
        if (!instance || !this.buffer) {
            this.log(`Cannot play instance ${instanceId}: not found or no buffer`);
            return;
        }
        
        this.log(`Playing instance ${instanceId} with ${instance.notes.length} notes`);
        
        // Clear any existing scheduled events for this instance
        this.clearInstanceScheduledEvents(instanceId);
        
        // Calculate instance offset in seconds
        const instanceOffsetSeconds = this.ticksToSeconds(instance.offsetTicks, bpm);
        const effectiveStartTime = startTime - instanceOffsetSeconds - this.trackOffsetSeconds;
        
        // Look ahead time for scheduling
        const lookAheadTime = 0.1;
        
        // Schedule notes
        instance.notes.forEach(note => {
            const noteTimeInTicks = note.column;
            const noteTimeInSeconds = this.ticksToSeconds(noteTimeInTicks, bpm);
            
            // Skip notes that would have already played
            if (noteTimeInSeconds < effectiveStartTime) return;
            
            // Calculate absolute transport time
            const absoluteTransportTime = noteTimeInSeconds + instanceOffsetSeconds + this.trackOffsetSeconds - lookAheadTime;
            
            const scheduleId = Tone.Transport.schedule((time) => {
                const player = this.createAndConfigurePlayer();
                if (!player) return;
                
                try {
                    const pitchShiftAmount = note.row - this.baseNote;
                    player.detune = pitchShiftAmount * 100;
                    
                    const velocity = note.velocity !== undefined ? note.velocity / 127 : 0.8;
                    player.volume.value = Tone.gainToDb(velocity);
                    
                    const durationInSeconds = this.ticksToSeconds(note.length, bpm);
                    
                    player.start(time + lookAheadTime).stop(time + lookAheadTime + durationInSeconds);
                    
                    // Schedule disposal
                    const timeoutId = setTimeout(() => {
                        try {
                            if (!player.disposed) player.dispose();
                        } catch (e) {
                            this.log(`Error disposing player: ${e}`);
                        }
                        instance.activeTimeouts.delete(timeoutId);
                    }, (durationInSeconds * 1000) + 200);
                    
                    instance.activeTimeouts.add(timeoutId);
                } catch (error) {
                    this.log(`Error playing note in instance ${instanceId}: ${error}`);
                    if (!player.disposed) player.dispose();
                }
            }, absoluteTransportTime);
            
            instance.scheduledEvents.push(scheduleId);
        });
        
        this.log(`Scheduled ${instance.scheduledEvents.length} events for instance ${instanceId}`);
    }

    /**
     * Clear scheduled events for an instance
     */
    private clearInstanceScheduledEvents(instanceId: string): void {
        const instance = this.instances.get(instanceId);
        if (!instance) return;
        
        instance.scheduledEvents.forEach(id => {
            Tone.Transport.clear(id);
        });
        instance.scheduledEvents = [];
        
        instance.activeTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        instance.activeTimeouts.clear();
    }

    /**
     * Stop playback for all instances
     */
    public stopPlayback(): void {
        this.instances.forEach((instance, instanceId) => {
            this.clearInstanceScheduledEvents(instanceId);
        });
        this.log("Stopped all instance playback");
    }

    /**
     * Update notes for an instance
     */
    public updateInstanceNotes(instanceId: string, notes: Note[]): void {
        const instance = this.instances.get(instanceId);
        if (!instance) return;
        
        // Apply trim if needed
        let notesToUse = notes;
        if (instance.trimStartTicks !== undefined || instance.trimEndTicks !== undefined) {
            notesToUse = this.applyTrimToNotes(
                notes, 
                instance.trimStartTicks || 0, 
                instance.trimEndTicks || Infinity
            );
        }
        
        instance.notes = notesToUse;
        this.log(`Updated notes for instance ${instanceId}: ${notesToUse.length} notes`);
    }

    // Settings methods
    
    public setBaseNote(baseNote: number): void {
        this.baseNote = baseNote;
        this.log(`Base note set to ${baseNote}`);
    }

    public setGrainSize(grainSize: number): void {
        this.grainSize = grainSize;
        this.log(`Grain size set to ${grainSize}`);
    }

    public setOverlap(overlap: number): void {
        this.overlap = overlap;
        this.log(`Overlap set to ${overlap}`);
    }

    public setTrackOffset(offsetMs: number): void {
        this.trackOffsetSeconds = offsetMs / 1000;
        this.log(`Track offset set to ${offsetMs}ms`);
    }

    public setVolume(volume: number): void {
        this.currentVolume = volume;
        if (!this.isMuted) {
            const volumeInDb = (volume / 100) * 40 - 40; // 0-100 to -40-0 dB
            this.gainNode.gain.value = Tone.dbToGain(volumeInDb);
        }
    }

    public setMute(muted: boolean): void {
        this.isMuted = muted;
        if (muted) {
            this.gainNode.gain.value = 0;
        } else {
            this.setVolume(this.currentVolume);
        }
    }

    /**
     * Get all instance IDs
     */
    public getInstanceIds(): string[] {
        return Array.from(this.instances.keys());
    }

    /**
     * Dispose and cleanup
     */
    public dispose(): void {
        this.stopPlayback();
        this.instances.clear();
        
        if (this.fileId) {
            this.bufferManager.releaseBuffer(this.fileId);
        }
        
        this.gainNode.dispose();
        this.log("Sampler disposed");
    }

    private log(message: string): void {
        this.onLog(`[MidiSamplerWithInstances] ${message}`);
    }
}

export default MidiSamplerWithInstances;