import * as Tone from 'tone';
import AudioFilePlayer from '../audio-engine/audioFilePlayer/audioEngine';
import { calculatePositionTime } from '../../constants/gridConstants';
import { SoundfontEngineController } from '../audio-engine/soundfontEngineController';
import { SamplerController } from '../audio-engine/samplerController';
import { MUSIC_CONSTANTS } from '@/studio/constants/musicConstants';
import { CombinedTrack } from 'src/platform/types/project';
import { MidiManager } from '../midi/MidiManagerNew';
import { audioContextManager } from '../audio/audioContextManager';

export interface Transport {
    position: number;        // Current playback position
    isPlaying: boolean;
    tempo: number;
    
    play(tracks?: CombinedTrack[]): Promise<void>;
    pause(): void;
    stop(): void;
    seek(position: number): void;
    setPosition(position: number): void;  // Alias for seek for better naming
}

export class TransportController implements Transport {
    private audioEngine: AudioFilePlayer;
    private soundfontController: SoundfontEngineController;
    private samplerController: SamplerController;
    private midiManager: MidiManager | null = null;
    private isStarting: boolean = false;
    private maxPosition: number = 3600;  // Default to 1 hour (3600 seconds) as safety
    private static FADE_TIME = 0.01; // 10ms fade
    private getStoreState?: () => any;  // Store getter for accessing track data

    constructor(initialBpm: number = 120) {
        this.audioEngine = AudioFilePlayer.getInstance();
        Tone.getTransport().bpm.value = initialBpm;
        this.soundfontController = new SoundfontEngineController(initialBpm);
        this.samplerController = new SamplerController();
        
        // We'll initialize the soundfont controller later when the audio context is available
        // This happens in the Store's initializeAudio method via initializeSoundfont
    }
    
    setMidiManager(midiManager: MidiManager): void {
        this.midiManager = midiManager;
    }

    /**
     * Set store getter for accessing track/instance data
     */
    setStoreGetter(getter: () => any): void {
        this.getStoreState = getter;
        // Also pass it to the audio engine
        this.audioEngine.setStoreGetter(getter);
    }

    get position(): number {
        return Tone.getTransport().seconds;
    }

    get isPlaying(): boolean {
        return Tone.getTransport().state === 'started';
    }

    get tempo(): number {
        return Tone.getTransport().bpm.value;
    }

    getSoundfontController(): SoundfontEngineController {
        return this.soundfontController;
    }
    
    getSamplerController(): SamplerController {
        return this.samplerController;
    }

    getAudioEngine(): AudioFilePlayer {
        return this.audioEngine;
    }
    
    /**
     * Converts a track's position (in ticks) to a time offset (in seconds)
     * This is crucial for properly aligning tracks on the timeline
     * 
     * @param trackXTicks Position in ticks
     * @returns Time offset in seconds
     */
    private getTrackTimeOffset(trackXTicks: number): number {
        // First convert ticks to beats
        const ppq = MUSIC_CONSTANTS.pulsesPerQuarterNote; // Standard MIDI ticks per quarter note
        const beats = trackXTicks / ppq;
        
        // Then convert beats to seconds based on current BPM
        const bpm = Tone.getTransport().bpm.value;
        const secondsPerBeat = 60 / bpm;
        
        return beats * secondsPerBeat;
    }
    
    /**
     * Calculates the correct playback time for a track based on:
     * 1. Current transport position
     * 2. Track's position on the timeline
     * 
     * @param transportTime Global transport time in seconds
     * @param trackXTicks The track's X position in ticks
     * @returns The adjusted playback position in seconds
     */
    private calculateTrackPlayPosition(transportTime: number, trackXTicks: number): number {
        // Get track's start time offset based on its position
        const trackOffset = this.getTrackTimeOffset(trackXTicks);
        
        // Cases:
        // 1. If transport < trackOffset: track shouldn't play yet (return negative to indicate this)
        // 2. If transport >= trackOffset: track should play at (transport - trackOffset)
        
        if (transportTime < trackOffset) {
            // Track shouldn't be playing yet
            return -1;
        } else {
            // Calculate time position within the track
            return transportTime - trackOffset;
        }
    }

    // Track the IDs of scheduled events so we can clean them up
    private scheduledEvents: number[] = [];
    // Track scheduled audio players so we can stop them
    private scheduledPlayers: Set<Tone.Player> = new Set();
    // Track actively playing instances with their stop times
    private activeInstances: Map<string, { player: Tone.Player, stopTime?: number }> = new Map();
    
    public async play(tracks?: CombinedTrack[]): Promise<void> {
        if (this.isStarting) return;
        this.isStarting = true;

        console.log(`[TransportController.play] Entry. Current Tone.Transport.seconds: ${Tone.getTransport().seconds.toFixed(4)}s`);

        try {
            // Ensure both Tone.js and js-synthesizer contexts are resumed
            // This is critical - if context resumption fails, we should not continue playback
            try {
                await audioContextManager.ensureContextsResumed();
                
                // Verify both contexts are actually running before proceeding
                if (!audioContextManager.areContextsRunning()) {
                    console.error('TransportController: Audio contexts not in running state after resumption');
                    this.isStarting = false;
                    throw new Error('Cannot start playback: Audio contexts failed to reach running state');
                }
                
                console.log('TransportController: Audio contexts successfully resumed and verified');
            } catch (contextError) {
                console.error('TransportController: Failed to resume audio contexts - aborting playback:', contextError);
                this.isStarting = false;
                throw new Error(`Cannot start playback: Audio context resumption failed - ${contextError.message}`);
            }
            
            // Clear any previously scheduled events and active instances
            this.clearScheduledEvents();
            // Ensure activeInstances is also cleared (should already be cleared by clearScheduledEvents)
            this.activeInstances.clear();
            
            // CRITICAL: Get the EXACT transport position right before playback starts
            // This ensures we're using the most current position for calculations
            const transportPosition = Tone.getTransport().seconds;
            console.log(`[TransportController.play] transportPosition determined as: ${transportPosition.toFixed(4)}s`);
            console.log(`Starting playback at transport position: ${transportPosition}s`);
            
            // Ensure all player instances are completely reset before starting new playback
            this.audioEngine.getAllPlayerInstances().forEach(instance => {
                if (instance.player) {
                    // Always stop and unsync ALL players before starting playback
                    if (instance.player.state === "started") {
                        instance.player.stop();
                    }
                    
                    // Additional safety: explicitly stop at current time to cancel all schedules
                    // This is critical to prevent any lingering scheduled stops from previous playback
                    instance.player.stop(Tone.now());
                    
                    // CRITICAL: Ensure completely unsynced
                    instance.player.unsync();
                    
                    // Cancel any volume ramps
                    instance.player.volume.cancelScheduledValues(Tone.now());
                }
            });
            
            // Process each track instance with its specific timeline position
            // If tracks are provided, use them; otherwise fall back to audio engine tracks
            if (tracks && tracks.length > 0) {
                console.log(`[Transport] Processing ${tracks.length} tracks with instances`);
                // New instance-aware approach
                for (const track of tracks) {
                    // Skip tracks without instances
                    if (!track.instances || track.instances.length === 0) {
                        console.log(`[Transport] Track ${track.id} has no instances, skipping`);
                        continue;
                    }
                    console.log(`[Transport] Track ${track.id} (${track.track_type}) has ${track.instances.length} instances`);
                    
                    // Process each instance of the track
                    for (const instance of track.instances) {
                        try {
                            const trackXTicks = instance.x_position || 0;
                            const trimStartTicks = instance.trim_start_ticks || 0;
                            const trimEndTicks = instance.trim_end_ticks || track.duration_ticks || 0;
                            
                            // For audio tracks, handle instance-specific playback
                            if (track.track_type === 'AUDIO') {
                                // Ensure the instance exists in the audio engine
                                let playerInstance = this.audioEngine.getPlayerInstance(instance.id);
                                
                                // Create the instance if it doesn't exist
                                if (!playerInstance) {
                                    try {
                                        // First ensure we have the audio buffer loaded
                                        if (!this.audioEngine.getAudioBuffer(track.id)) {
                                            console.warn(`No audio buffer for track ${track.id}, skipping instance ${instance.id}`);
                                            continue;
                                        }
                                        
                                        // Create the instance
                                        await this.audioEngine.createInstance(track.id, instance.id);
                                        playerInstance = this.audioEngine.getPlayerInstance(instance.id);
                                    } catch (err) {
                                        console.error(`Failed to create instance ${instance.id} for track ${track.id}:`, err);
                                        continue;
                                    }
                                }
                                
                                if (!playerInstance || !playerInstance.player) continue;
                                
                                // Calculate the offset when this instance should start playing
                                const trackPositionOffset = this.getTrackTimeOffset(trackXTicks);
                                
                                // Apply trim settings if needed
                                const ppq = MUSIC_CONSTANTS.pulsesPerQuarterNote;
                                const bpm = Tone.getTransport().bpm.value;
                                const trimStartSec = (trimStartTicks / ppq) * (60 / bpm);
                                const trimEndSec = (trimEndTicks / ppq) * (60 / bpm);
                                
                                // Validate trim values
                                if (trimEndSec <= trimStartSec && trimEndTicks > 0) {
                                    console.warn(`Invalid trim for instance ${instance.id}: end (${trimEndSec}s) <= start (${trimStartSec}s)`);
                                    continue;
                                }
                                
                                if (trimStartTicks > 0 || trimEndTicks < track.duration_ticks) {
                                    // Set trim on the player
                                    (playerInstance.player as any)._trimSettings = {
                                        trimEnabled: true,
                                        trimStartSeconds: trimStartSec,
                                        trimEndSeconds: trimEndSec
                                    };
                                }
                                
                                // Stop any existing playback
                                if (playerInstance.player.state === "started") {
                                    playerInstance.player.stop();
                                }
                                // Don't sync to transport - we're managing timing manually
                                playerInstance.player.unsync();
                                
                                // Schedule playback based on timing
                                if (trackPositionOffset <= transportPosition) {
                                    // Track should already be playing - start immediately with offset
                                    const startOffset = Math.max(0, transportPosition - trackPositionOffset);
                                    
                                    // Check if we're still within the trimmed duration
                                    const trimmedDuration = trimEndSec - trimStartSec;
                                    if (startOffset < trimmedDuration) {
                                        // Calculate how much of the trimmed audio should play
                                        const remainingDuration = trimmedDuration - startOffset;
                                        
                                        // Start the player at the correct offset within the trimmed region
                                        const actualStartOffset = trimStartSec + startOffset;
                                        playerInstance.player.start(0, actualStartOffset);
                                        
                                        // Schedule a stop at the exact time the trim should end
                                        // This is critical for accurate trim end timing
                                        if (trimmedDuration > 0) {
                                            // Calculate the exact stop time using Tone.now() plus remaining duration
                                            const stopTime = Tone.now() + remainingDuration;
                                            playerInstance.player.stop(stopTime);
                                            
                                            // Track this active instance
                                            this.activeInstances.set(instance.id, {
                                                player: playerInstance.player,
                                                stopTime: stopTime
                                            });
                                            
                                            console.log(`Audio track ${track.id} instance ${instance.id} started at offset ${actualStartOffset}s, will stop in ${remainingDuration}s`);
                                        } else {
                                            // Track without stop time
                                            this.activeInstances.set(instance.id, {
                                                player: playerInstance.player
                                            });
                                        }
                                    } else {
                                        console.log(`Audio track ${track.id} instance ${instance.id} already past its trim end, not starting`);
                                    }
                                } else {
                                    // Track should start in the future - schedule it
                                    const delaySeconds = trackPositionOffset - transportPosition;
                                    
                                    // Schedule using Tone.Transport.schedule for proper timing
                                    const eventId = Tone.Transport.schedule((time) => {
                                        // Make sure player is stopped before starting
                                        if (playerInstance.player.state === "started") {
                                            playerInstance.player.stop(time);
                                        }
                                        
                                        // Calculate the trimmed duration
                                        const trimmedDuration = trimEndSec - trimStartSec;
                                        
                                        // Start the player at the scheduled time from trim start
                                        playerInstance.player.start(time, trimStartSec);
                                        
                                        // Schedule stop at the exact trim end time
                                        // This ensures trim end is respected even for scheduled playback
                                        if (trimmedDuration > 0) {
                                            const stopTime = time + trimmedDuration;
                                            playerInstance.player.stop(stopTime);
                                            console.log(`Audio track ${track.id} instance ${instance.id} scheduled to start, will stop after ${trimmedDuration}s`);
                                        }
                                    }, `+${delaySeconds}`);
                                    
                                    // Track this scheduled event so we can cancel it if needed
                                    this.scheduledEvents.push(eventId);
                                    this.scheduledPlayers.add(playerInstance.player);
                                    console.log(`Audio track ${track.id} instance ${instance.id} scheduled to start in ${delaySeconds}s`);
                                }
                            }
                        } catch (error) {
                            console.error(`Error scheduling instance ${instance.id} of track ${track.id}:`, error);
                        }
                    }
                }
            } else {
                // Fallback to old approach for backward compatibility
                // Use the deprecated getAllTracks method for now
                this.audioEngine.getAllTracks().forEach(track => {
                    if (!track.player) return;
                    
                    try {
                        const trackXTicks = track.position?.x || 0;
                    
                    // Get track's trim settings if available
                    const hasTrimSettings = 
                        track.player && 
                        (track.player as any)._trimSettings && 
                        (track.player as any)._trimSettings.trimEnabled;
                    
                    // Calculate the offset when this track should start playing
                    // Standard offset based on track position in ticks
                    const trackPositionOffset = this.getTrackTimeOffset(trackXTicks);
                    
                    // If trim settings exist, adjust playback accordingly
                    if (hasTrimSettings) {
                        const trimSettings = (track.player as any)._trimSettings;
                        console.log(`Scheduling trimmed track ${track.id}:`, trimSettings);
                        
                        // Clean start and sync of player
                        if (track.player.state === "started") {
                            track.player.stop();
                        }
                        track.player.unsync();
                        
                        // Calculate how much time has passed since the transport position
                        const effectiveStartTime = Math.max(0, transportPosition - trackPositionOffset);
                        
                        // Check if we should skip ahead in the trimmed audio
                        const trimStartSec = trimSettings.trimStartSeconds;
                        const trimEndSec = trimSettings.trimEndSeconds;
                        const trimmedDuration = trimEndSec - trimStartSec;
                        
                        if (effectiveStartTime <= 0) {
                            // Normal start from beginning of trimmed region
                            console.log(`Starting trimmed track ${track.id} from beginning of trim`);
                            // Set start position to trim start and sync playback
                            track.player.start(0, trimStartSec);
                            track.player.sync();
                        } else if (effectiveStartTime < trimmedDuration) {
                            // Start from a point inside the trimmed region
                            const startOffset = trimStartSec + effectiveStartTime;
                            console.log(`Starting trimmed track ${track.id} from offset ${startOffset}s`);
                            track.player.start(0, startOffset);
                            track.player.sync();
                        } else {
                            // We're past the end of this track - don't schedule
                            console.log(`Transport position ${transportPosition}s is past end of trimmed track ${track.id}`);
                        }
                    } else {
                        // Normal scheduling for untrimmed tracks - existing code path
                        console.log(`Scheduling untrimmed track ${track.id} with offset ${trackPositionOffset}s`);
                        
                        // Clean start and sync of player
                        if (track.player.state === "started") {
                            track.player.stop();
                        }
                        track.player.unsync();
                        
                        // Sync the player with the transport and set its start position
                        // Only schedule if the track should be playing at this position
                        if (trackPositionOffset <= transportPosition) {
                            const startOffset = Math.max(0, transportPosition - trackPositionOffset);
                            
                            // CRITICAL: We must start the player at the correct offset
                            // This is calculated as the difference between transport position
                            // and the track's own position on the timeline
                            track.player.start(0, startOffset);
                            track.player.sync();
                            
                            console.log(`Track ${track.id} synced, starting at offset ${startOffset}s`);
                        } else {
                            // Track is in the future, don't schedule yet
                            console.log(`Track ${track.id} is in the future, not scheduling yet`);
                        }
                    }
                } catch (error) {
                    console.error(`Error scheduling track ${track.id}:`, error);
                }
            });
            }

            // URGENT FIX: Force a clean Transport start
            // This is critical to ensure correct timing
            const transportWasRunning = Tone.getTransport().state === "started";
            if (transportWasRunning) {
                console.log("Transport was already running, pausing before restart");
                Tone.getTransport().pause();
            }
            
            // Double check transport position is still as expected
            console.log(`Transport position before start: ${Tone.getTransport().seconds}s`);
            
            // Start soundfont player if available
            try {
                console.log(`Starting soundfont player. Transport position: ${transportPosition}s`);
                console.log(`Tracks passed to soundfont:`, tracks?.map(t => ({
                    id: t.id,
                    type: t.track_type,
                    instances: t.instances?.length || 0
                })));
                await this.getSoundfontController().play(transportPosition, tracks, this.midiManager);
            } catch (error) {
                console.error('Failed to start soundfont player:', error);
            }
            
            // Start sampler tracks
            try {
                console.log('Starting sampler tracks');
                console.log(`Tracks passed to sampler:`, tracks?.map(t => ({
                    id: t.id,
                    type: t.track_type,
                    instances: t.instances?.length || 0
                })));
                const bpm = Tone.Transport.bpm.value; // Get current BPM
                await this.getSamplerController().play(transportPosition, bpm, tracks, this.midiManager);
            } catch (error) {
                console.error('Failed to start sampler tracks:', error);
            }
            
            // Start transport with a clean slate, BUT from the current transportPosition
            Tone.getTransport().start(undefined, transportPosition);
            console.log(`[TransportController.play] After Tone.Transport.start(undefined, ${transportPosition.toFixed(4)}). Current Tone.Transport.seconds: ${Tone.getTransport().seconds.toFixed(4)}s`);
            console.log(`Transport started from offset ${transportPosition}s, state:`, Tone.getTransport().state);
        } catch (error) {
            console.error('Error starting playback:', error);
            this.stop();
        } finally {
            this.isStarting = false;
        }
    }
    
    // Clear any scheduled events (called when stopping, seeking, or starting playback)
    private clearScheduledEvents(): void {
        console.log(`Clearing all scheduled events (${this.scheduledEvents.length})`);
        this.scheduledEvents.forEach(id => {
            Tone.getTransport().clear(id);
        });
        this.scheduledEvents = [];
        
        // Clear active instances - these are currently playing with scheduled stops
        console.log(`Clearing ${this.activeInstances.size} active instances`);
        this.activeInstances.forEach((info, instanceId) => {
            // Force stop immediately to cancel any scheduled stops
            if (info.player.state === "started") {
                info.player.stop();
            }
            // Double-stop to ensure all schedules are cancelled
            info.player.stop(Tone.now());
        });
        this.activeInstances.clear();
        
        // Also stop any scheduled audio players
        console.log(`Clearing ${this.scheduledPlayers.size} scheduled audio players`);
        this.scheduledPlayers.forEach(player => {
            // Stop the player immediately if it's playing
            if (player.state === "started") {
                player.stop();
            }
            // Cancel any scheduled starts or stops
            // Calling stop() with Tone.now() ensures immediate cancellation
            player.stop(Tone.now());
        });
        this.scheduledPlayers.clear();
    }

    public pause(): void {
        console.log('Pausing playback at position:', this.position);
        
        // Clear any scheduled events
        this.clearScheduledEvents();
        
        // Pause soundfont player if available
        try {
            console.log('Pausing soundfont player');
            this.getSoundfontController().pause();
        } catch (error) {
            console.error('Failed to pause soundfont player:', error);
        }
        
        // Pause sampler tracks
        try {
            console.log('Pausing sampler tracks');
            this.getSamplerController().pause();
        } catch (error) {
            console.error('Failed to pause sampler tracks:', error);
        }
        
        // Fade out before stopping
        this.audioEngine.getAllPlayerInstances().forEach(instance => {
            if (instance.player) {
                instance.player.volume.rampTo(-Infinity, TransportController.FADE_TIME);
            }
        });

        // Save current position for reference
        const currentPosition = this.position;

        // Wait for fade before pausing
        setTimeout(() => {
            // Pause the transport first (doesn't reset position)
            Tone.getTransport().pause();
            
            // Stop all playing player instances to ensure clean state
            this.audioEngine.getAllPlayerInstances().forEach(instance => {
                if (instance.player && instance.player.state === "started") {
                    instance.player.stop();
                }
                // Always unsync to ensure clean state for next playback
                if (instance.player) {
                    instance.player.unsync();
                }
            });
            
            console.log('Transport: Paused at position', currentPosition);
        }, TransportController.FADE_TIME * 1000);
    }

    public async stop(): Promise<void> {
        console.log('Stopping transport and resetting position to 0');
        this.isStarting = false; // Reset starting state
        
        // Clear any scheduled events
        this.clearScheduledEvents();
        
        // Stop soundfont player if available
        if (this.getSoundfontController()) {
            try {
                console.log('Stopping soundfont player at position', this.position);
                await this.getSoundfontController().stop();
            } catch (error) {
                console.error('Failed to stop soundfont player:', error);
            }
        }
        
        // Stop sampler tracks
        try {
            console.log('Stopping sampler tracks at position', this.position);
            await this.getSamplerController().stop();
        } catch (error) {
            console.error('Failed to stop sampler tracks:', error);
        }
        
        // Stop player instances first with fade out
        this.audioEngine.getAllPlayerInstances().forEach(instance => {
            if (instance.player) {
                instance.player.volume.rampTo(-Infinity, TransportController.FADE_TIME);
            }
        });

        setTimeout(() => {
            // First stop the Transport so no more scheduling happens
            Tone.getTransport().stop();
            
            // Then reset transport position to 0
            Tone.getTransport().seconds = 0;
            
            // Now stop all audio playback
            this.audioEngine.stopAllPlayback();
            
            // Prepare player instances for future playback - completely reset their state
            this.audioEngine.getAllPlayerInstances().forEach(instance => {
                if (instance.player) {
                    // Make sure player is stopped
                    if (instance.player.state === "started") {
                        instance.player.stop();
                    }
                    // Unsync to clear any previous state
                    instance.player.unsync();
                    // Reset volume to original
                    instance.player.volume.cancelScheduledValues(Tone.now());
                    instance.player.volume.value = 0;
                    
                    console.log(`Reset player for instance ${instance.id}`);
                }
            });
            
            console.log('Transport: Successfully reset to position 0');
        }, TransportController.FADE_TIME * 1000);
    }

    public seek(position: number): void {
        // Bounds checking
        position = Math.max(0, Math.min(position, this.maxPosition));
        
        const wasPlaying = this.isPlaying;
        const prevPosition = this.position;
        
        console.log(`SEEKING: From ${prevPosition}s to ${position}s (delta: ${position - prevPosition}s)`);
        
        // COMPLETELY RESET EVERYTHING
        
        // 1. First stop the Transport entirely
        // This is more aggressive than pause and ensures a clean slate
        Tone.getTransport().stop();
        
        // 2. Clear all scheduled events
        this.clearScheduledEvents();
        
        // 3. Seek in soundfont player if available
        try {
            console.log(`Seeking soundfont player to ${position}s`);
            this.getSoundfontController().seek(position * 1000);
        } catch (error) {
            console.error('Failed to seek soundfont player:', error);
        }
        
        // 3b. Handle seeking sampler tracks
        try {
            console.log(`Seeking sampler tracks to ${position}s`);
            
            // Get current BPM for timing calculations
            const bpm = Tone.Transport.bpm.value;
            
            // Seek the sampler controller
            this.getSamplerController().seek(position, bpm);
        } catch (error) {
            console.error('Failed to seek sampler tracks:', error);
        }
        
        // 4. Completely reset all player instances
        this.audioEngine.getAllPlayerInstances().forEach(instance => {
            if (instance.player) {
                // Ensure player is fully stopped - this cancels any scheduled stops
                if (instance.player.state === "started") {
                    instance.player.stop();
                }
                
                // Additional safety: explicitly stop at current time to cancel schedules
                instance.player.stop(Tone.now());
                
                // Completely reset player state - unsync from transport
                instance.player.unsync();
                
                // Clear any volume automations and reset to 0
                instance.player.volume.cancelScheduledValues(Tone.now());
                instance.player.volume.value = 0;
                
                // Get track data from store if available to restore volume/mute
                if (this.getStoreState) {
                    const state = this.getStoreState();
                    const track = state.tracks?.find((t: any) => t.id === instance.trackId);
                    if (track) {
                        this.audioEngine.setTrackVolume(instance.trackId, track.volume || 80);
                        this.audioEngine.setTrackMute(instance.trackId, track.mute || false);
                    }
                }
            }
        });
        
        // 5. Set the Transport position with a clean state
        // Because we completely stopped the transport, this should be reliable
        Tone.getTransport().seconds = position;
        
        // Double check that it actually set correctly
        console.log(`Transport position set to ${position}s, verified: ${Tone.getTransport().seconds}s`);
        
        if (Math.abs(Tone.getTransport().seconds - position) > 0.001) {
            console.warn("Transport position didn't set properly - forcing again");
            Tone.getTransport().seconds = position;
        }
        
        // If was playing, restart with the new position
        if (wasPlaying) {
            // Get tracks from store to pass to play() method
            let tracks: CombinedTrack[] | undefined;
            if (this.getStoreState) {
                const state = this.getStoreState();
                tracks = state.tracks;
            }
            
            // Use a small delay to ensure Tone.js state is updated
            // This is a crucial step to ensure reliable seeking
            setTimeout(() => {
                console.log(`Restarting playback from position: ${Tone.getTransport().seconds}s with ${tracks?.length || 0} tracks`);
                this.play(tracks); 
            }, 30); // 30ms is a good compromise
        }
    }

    public async setTempo(bpm: number): Promise<void> {
        // Add bounds checking
        const validBpm = Math.max(1, Math.min(bpm, 999));
        Tone.getTransport().bpm.value = validBpm;
        await this.soundfontController.setGlobalBPM(validBpm);
        
        // Update BPM for sampler tracks if they are playing
        if (this.isPlaying) {
            const currentPosition = this.position;
            this.samplerController.seek(currentPosition, validBpm);
        }
    }

    public dispose(): void {
        this.stop();
        Tone.getTransport().dispose();
    }

    public async loadAudioFile(trackId: string, file: File, position?: { x: number, y: number }): Promise<void> {
        try {
            // Load the audio buffer for the track
            await this.audioEngine.loadAudioBuffer(trackId, file);
            
            // Create the channel for the track
            await this.audioEngine.createTrackChannel(trackId, file.name);
            
            // Create a default first instance (for backward compatibility)
            const instanceId = `${trackId}_instance_1`;
            await this.audioEngine.createInstance(trackId, instanceId);
            
            // Get the created instance to check buffer duration
            const instance = this.audioEngine.getPlayerInstance(instanceId);
            if (!instance?.player) {
                throw new Error(`Failed to create player instance for track ${trackId}`);
            }

            // Safely access buffer duration
            const duration = instance.player.buffer?.duration ?? 0;
            this.maxPosition = Math.max(this.maxPosition, duration);
            
            // Position is now managed per-instance in the store, not in AudioEngine
            if (position) {
                console.log(`TransportController: Track ${trackId} position should be set in store at x:${position.x}, y:${position.y}`);
                // The actual position setting should be handled by the store/action layer
            }
        } catch (error) {
            console.error(`Failed to load audio file for track ${trackId}:`, error);
            throw error; // Re-throw to let caller handle the error
        }
    }

    public removeTrack(trackId: string): void {
        // Clean up sampler if this is a sampler track
        try {
            console.log(`Cleaning up any sampler resources for track ${trackId}`);
            this.samplerController.removeSampler(trackId);
        } catch (error) {
            console.error(`Error cleaning up sampler for track ${trackId}:`, error);
        }
        
        // Recalculate maxPosition when a track is removed
        // Get unique track IDs from all instances
        const remainingTrackIds = new Set<string>();
        this.audioEngine.getAllPlayerInstances().forEach(instance => {
            if (instance.trackId !== trackId) {
                remainingTrackIds.add(instance.trackId);
            }
        });
        
        // Calculate max duration from remaining tracks
        const durations: number[] = [];
        for (const tid of remainingTrackIds) {
            const instances = this.audioEngine.getPlayerInstances(tid);
            if (instances.length > 0 && instances[0].player?.buffer) {
                durations.push(instances[0].player.buffer.duration);
            }
        }
        
        this.maxPosition = Math.max(0, ...durations);
    }
    
    public setPosition(position: number): void {
        console.log(`[TransportController.setPosition] Received position: ${typeof position === 'number' ? position.toFixed(4) : position}`);
        // Just an alias for seek - make sure we pass the position value directly
        this.seek(position);
    }
    
    /**
     * Handle track position changes during playback
     * This recalculates and adjusts the playback for a specific track that was moved
     * 
     * @param trackId The ID of the track being moved
     * @param newPositionXTicks The new X position in ticks
     * @param type Optional type parameter
     */
    public handleTrackPositionChange(trackId: string, newPositionXTicks: number, type?: string): void {
        // Only do anything if we're playing
        if (!this.isPlaying) {
            console.log(`Track ${trackId} position changed, but not playing - no action needed`);
            return;
        }
        
        // Find track instances
        const instances = this.audioEngine.getPlayerInstances(trackId);
        if (!instances || instances.length === 0) {
            // Log a warning instead of just returning silently
            console.warn(`Track ${trackId} instances not found during position change while playing. Skipping sync for now.`);
            return; // Continue to return, but log the warning
        }
        
        console.log(`Handling position change for track ${trackId} to x:${newPositionXTicks} ticks during playback`);
        
        // CRITICAL: This function needs to stop and restart ALL tracks to ensure proper synchronization
        // This is because Tone.js transport synchronization doesn't support repositioning individual tracks
        
        // 1. Capture current global transport position
        const currentPosition = this.position;
        
        // 2. Stop all playback by using the seek method, which properly handles the transport
        console.log(`Pausing playback at ${currentPosition}s and recalculating all tracks`);
        
        // To prevent an infinite loop when the seek itself triggers player updates,
        // we need to temporarily disable the transport
        const wasPlaying = this.isPlaying;
        
        // Stop all playback immediately and clear scheduled events
        this.clearScheduledEvents();
        
        // Stop all player instances and unsync them
        this.audioEngine.getAllPlayerInstances().forEach(instance => {
            if (instance.player) {
                if (instance.player.state === "started") {
                    instance.player.stop();
                }
                instance.player.unsync();
            }
        });
        
        // Pause the transport
        Tone.getTransport().pause();
        
        // Set the global transport position
        Tone.getTransport().seconds = currentPosition;
        
        // Now restart if needed
        if (wasPlaying) {
            // Get tracks from store to pass to play() method
            let tracks: CombinedTrack[] | undefined;
            if (this.getStoreState) {
                const state = this.getStoreState();
                tracks = state.tracks;
            }
            
            // Use setTimeout to allow the UI to update before restarting
            setTimeout(() => {
                console.log(`Restarting playback at position ${currentPosition}s with new track positions`);
                this.play(tracks);
            }, 20); // Small delay to ensure clean restart
        }
    }
}