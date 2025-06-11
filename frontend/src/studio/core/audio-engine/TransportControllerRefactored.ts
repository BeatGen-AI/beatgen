import * as Tone from 'tone';
import AudioFilePlayerRefactored, { AudioTrackInstance } from './audioFilePlayer/AudioEngineRefactored';
import MidiSoundfontPlayerRefactored, { MidiTrackInstance } from './midiSoundfontPlayer/MidiSoundfontPlayerRefactored';
import SamplerControllerRefactored, { SamplerTrackInstance } from './SamplerControllerRefactored';
import DrumControllerRefactored, { DrumTrackInstance } from './DrumControllerRefactored';

// NEW: Enhanced track instance for transport
export interface TransportTrackInstance {
  instanceId: string;
  trackId: string;
  trackType: 'audio' | 'midi' | 'sampler' | 'drum';
  position: {
    x: number; // Position in ticks
    y: number; // Track lane
  };
  trimStartTicks?: number;
  trimEndTicks?: number;
  volume: number;
  pan: number;
  muted: boolean;
  // Add other instance-specific properties as needed
}

class TransportControllerRefactored {
  private static instance: TransportControllerRefactored;
  private audioEngine: AudioFilePlayerRefactored;
  private midiEngine: MidiSoundfontPlayerRefactored;
  private samplerEngine: SamplerControllerRefactored;
  private drumEngine: DrumControllerRefactored;
  
  // NEW: Track all instances across all players
  private allTrackInstances: Map<string, TransportTrackInstance> = new Map();
  private isPlaying = false;
  private currentPosition = 0;
  private currentBPM = 120;

  private constructor() {
    this.audioEngine = AudioFilePlayerRefactored.getInstance();
    this.midiEngine = MidiSoundfontPlayerRefactored.getInstance();
    this.samplerEngine = SamplerControllerRefactored.getInstance();
    this.drumEngine = DrumControllerRefactored.getInstance();
  }

  public static getInstance(): TransportControllerRefactored {
    if (!TransportControllerRefactored.instance) {
      TransportControllerRefactored.instance = new TransportControllerRefactored();
    }
    return TransportControllerRefactored.instance;
  }

  // NEW: Register track instance with transport
  public registerTrackInstance(trackInstance: TransportTrackInstance): void {
    console.log(`Transport: Registering instance ${trackInstance.instanceId} of track ${trackInstance.trackId}`);
    this.allTrackInstances.set(trackInstance.instanceId, trackInstance);
  }

  // NEW: Unregister track instance
  public unregisterTrackInstance(instanceId: string): void {
    console.log(`Transport: Unregistering instance ${instanceId}`);
    this.allTrackInstances.delete(instanceId);
  }

  // NEW: Update instance position and reschedule if playing
  public updateTrackInstancePosition(
    instanceId: string, 
    newPosition: { x: number; y: number }
  ): void {
    const instance = this.allTrackInstances.get(instanceId);
    if (instance) {
      console.log(`Transport: Updating instance ${instanceId} position from (${instance.position.x}, ${instance.position.y}) to (${newPosition.x}, ${newPosition.y})`);
      
      instance.position = newPosition;
      
      // Update in audio engine
      this.audioEngine.setTrackInstancePosition(instanceId, newPosition);
      
      // If currently playing, reschedule this instance
      if (this.isPlaying) {
        this.rescheduleInstance(instanceId);
      }
    }
  }

  // NEW: Main play method that schedules ALL instances
  public async play(startPosition: number = 0): Promise<void> {
    console.log(`Transport: Starting playback at position ${startPosition} with ${this.allTrackInstances.size} instances`);
    
    this.currentPosition = startPosition;
    this.isPlaying = true;

    // Stop any existing playback
    await this.stop();

    // Start Tone.js transport
    Tone.getTransport().start(undefined, startPosition);

    // Schedule ALL track instances
    for (const [instanceId, instance] of this.allTrackInstances.entries()) {
      await this.scheduleTrackInstance(instance, startPosition);
    }

    console.log(`Transport: Scheduled ${this.allTrackInstances.size} track instances for playback`);
  }

  // NEW: Schedule individual track instance
  private async scheduleTrackInstance(
    instance: TransportTrackInstance, 
    transportStartPosition: number
  ): Promise<void> {
    const { instanceId, trackType, position, muted } = instance;
    
    if (muted) {
      console.log(`Transport: Skipping muted instance ${instanceId}`);
      return;
    }

    console.log(`Transport: Scheduling ${trackType} instance ${instanceId} at position ${position.x} ticks`);

    // Calculate timing
    const instanceStartTime = this.ticksToSeconds(position.x);
    const startOffset = instanceStartTime - transportStartPosition;

    try {
      switch (trackType) {
        case 'audio':
          this.audioEngine.scheduleInstancePlayback(instanceId, transportStartPosition, this.currentBPM);
          break;
          
        case 'midi':
          this.midiEngine.scheduleInstancePlayback(instanceId, transportStartPosition, this.currentBPM);
          break;
          
        case 'sampler':
          this.samplerEngine.scheduleInstancePlayback(instanceId, transportStartPosition, this.currentBPM);
          break;
          
        case 'drum':
          this.drumEngine.scheduleInstancePlayback(instanceId, transportStartPosition, this.currentBPM);
          break;
      }
    } catch (error) {
      console.error(`Transport: Failed to schedule instance ${instanceId}:`, error);
    }
  }

  // NEW: Reschedule single instance (useful for position changes during playback)
  private async rescheduleInstance(instanceId: string): Promise<void> {
    const instance = this.allTrackInstances.get(instanceId);
    if (!instance) return;

    console.log(`Transport: Rescheduling instance ${instanceId} due to position change`);

    // Stop current playback for this instance
    if (instance.trackType === 'audio') {
      const audioInstance = this.audioEngine.getInstance(instanceId);
      if (audioInstance?.player) {
        audioInstance.player.stop();
      }
    }

    // Reschedule with current transport position
    await this.scheduleTrackInstance(instance, this.currentPosition);
  }

  public async pause(): Promise<void> {
    console.log('Transport: Pausing playback');
    this.isPlaying = false;
    
    // Pause Tone.js transport
    Tone.getTransport().pause();
    
    // Stop all instances
    this.audioEngine.stopAllPlayback();
    this.midiEngine.stopAllPlayback();
    this.samplerEngine.stopAllPlayback();
    this.drumEngine.stopAllPlayback();
  }

  public async stop(): Promise<void> {
    console.log('Transport: Stopping playback');
    this.isPlaying = false;
    this.currentPosition = 0;
    
    // Stop Tone.js transport
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    
    // Stop all instances
    this.audioEngine.stopAllPlayback();
    this.midiEngine.stopAllPlayback();
    this.samplerEngine.stopAllPlayback();
    this.drumEngine.stopAllPlayback();
  }

  public async seek(position: number): Promise<void> {
    console.log(`Transport: Seeking to position ${position}`);
    this.currentPosition = position;
    
    if (this.isPlaying) {
      // If playing, restart from new position
      await this.play(position);
    } else {
      // Just update position
      Tone.getTransport().seconds = position;
    }
  }

  // NEW: Get timing utilities
  public setBPM(bpm: number): void {
    console.log(`Transport: Setting BPM to ${bpm}`);
    this.currentBPM = bpm;
    Tone.getTransport().bpm.value = bpm;
  }

  public getBPM(): number {
    return this.currentBPM;
  }

  public getCurrentPosition(): number {
    return this.isPlaying ? Tone.getTransport().seconds : this.currentPosition;
  }

  public isTransportPlaying(): boolean {
    return this.isPlaying;
  }

  // Utility methods
  private ticksToSeconds(ticks: number): number {
    // Convert ticks to seconds based on current BPM and time signature
    // Assuming 4/4 time, 480 ticks per quarter note (standard MIDI)
    const quarterNotesPerSecond = this.currentBPM / 60;
    const ticksPerQuarterNote = 480;
    return ticks / (ticksPerQuarterNote * quarterNotesPerSecond);
  }

  private secondsToTicks(seconds: number): number {
    const quarterNotesPerSecond = this.currentBPM / 60;
    const ticksPerQuarterNote = 480;
    return seconds * (ticksPerQuarterNote * quarterNotesPerSecond);
  }

  public getTrackTimeOffset(positionTicks: number): number {
    return this.ticksToSeconds(positionTicks);
  }

  // NEW: Bulk operations for efficiency
  public registerMultipleInstances(instances: TransportTrackInstance[]): void {
    console.log(`Transport: Registering ${instances.length} instances`);
    instances.forEach(instance => {
      this.registerTrackInstance(instance);
    });
  }

  public unregisterMultipleInstances(instanceIds: string[]): void {
    console.log(`Transport: Unregistering ${instanceIds.length} instances`);
    instanceIds.forEach(instanceId => {
      this.unregisterTrackInstance(instanceId);
    });
  }

  // NEW: Get instance information
  public getAllInstances(): TransportTrackInstance[] {
    return Array.from(this.allTrackInstances.values());
  }

  public getInstancesByTrack(trackId: string): TransportTrackInstance[] {
    return Array.from(this.allTrackInstances.values()).filter(
      instance => instance.trackId === trackId
    );
  }

  public getInstancesByType(trackType: string): TransportTrackInstance[] {
    return Array.from(this.allTrackInstances.values()).filter(
      instance => instance.trackType === trackType
    );
  }

  // NEW: Handle track instance property changes
  public updateInstanceVolume(instanceId: string, volume: number): void {
    const instance = this.allTrackInstances.get(instanceId);
    if (instance) {
      instance.volume = volume;
      
      // Update in appropriate engine
      if (instance.trackType === 'audio') {
        this.audioEngine.setTrackInstanceVolume(instanceId, volume);
      }
      // TODO: Update for other track types when refactored
    }
  }

  public updateInstanceMute(instanceId: string, muted: boolean): void {
    const instance = this.allTrackInstances.get(instanceId);
    if (instance) {
      instance.muted = muted;
      
      // Update in appropriate engine
      if (instance.trackType === 'audio') {
        this.audioEngine.setTrackInstanceMute(instanceId, muted);
      }
      
      // If currently playing, reschedule to apply mute change
      if (this.isPlaying) {
        this.rescheduleInstance(instanceId);
      }
      // TODO: Update for other track types when refactored
    }
  }

  public updateInstancePan(instanceId: string, pan: number): void {
    const instance = this.allTrackInstances.get(instanceId);
    if (instance) {
      instance.pan = pan;
      
      // Update in appropriate engine
      if (instance.trackType === 'audio') {
        this.audioEngine.setTrackInstancePan(instanceId, pan);
      }
      // TODO: Update for other track types when refactored
    }
  }

  // NEW: Debug utilities
  public debugLogInstances(): void {
    console.log('Transport: Current instances:');
    for (const [instanceId, instance] of this.allTrackInstances.entries()) {
      console.log(`  ${instanceId}: track=${instance.trackId}, type=${instance.trackType}, pos=(${instance.position.x}, ${instance.position.y}), muted=${instance.muted}`);
    }
  }
}

export default TransportControllerRefactored;