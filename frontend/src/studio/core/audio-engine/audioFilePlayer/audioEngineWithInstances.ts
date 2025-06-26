import * as Tone from 'tone';
import { convertVolumeToDecibels } from '../../../utils/audioProcessing';
import { TrackPlayer } from '../trackPlayer';
import { InstancePlayer, InstancePlayerFactory } from '../instancePlayer';
import { TrackInstance } from '../../../../platform/types/dto/project_track';

export interface AudioTrackWithInstances {
  id: string;
  name: string;
  channel: Tone.Channel;
  // Map of instance ID to player
  instancePlayers: Map<string, InstancePlayer>;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  // File information for creating new instances
  fileId?: string;
  fileUrl?: string;
  originalDurationTicks?: number;
}

class AudioFilePlayerWithInstances implements TrackPlayer {
  private static instance: AudioFilePlayerWithInstances;
  private mainOutput: Tone.Channel;
  private tracks: Map<string, AudioTrackWithInstances>;
  private playerFactory: InstancePlayerFactory;

  private constructor() {
    this.mainOutput = new Tone.Channel().toDestination();
    this.tracks = new Map();
    this.playerFactory = new InstancePlayerFactory();
  }

  public static getInstance(): AudioFilePlayerWithInstances {
    if (!AudioFilePlayerWithInstances.instance) {
      AudioFilePlayerWithInstances.instance = new AudioFilePlayerWithInstances();
    }
    return AudioFilePlayerWithInstances.instance;
  }

  public async initialize(): Promise<void> {
    try {
      console.log('AudioEngineWithInstances: Starting Tone.js');
      // Tone.js initialization handled by transport
      console.log('AudioEngineWithInstances: Tone.js started successfully');
    } catch (error) {
      console.error('AudioEngineWithInstances: Failed to start Tone.js:', error);
      throw error;
    }
  }

  /**
   * Create a track with initial instances
   */
  public async createTrack(
    id: string, 
    name: string, 
    audioFile?: File,
    instances?: TrackInstance[]
  ): Promise<AudioTrackWithInstances> {
    console.log(`Creating track ${id} with ${instances?.length || 0} instances`);
    this.removeTrack(id);

    const channel = new Tone.Channel().connect(this.mainOutput);
    
    // Default volume is 80 (on 0-100 scale)
    const defaultVolume = 80;
    
    // Convert the default volume to decibels and set the channel volume
    channel.volume.value = convertVolumeToDecibels(defaultVolume, false);
    
    const track: AudioTrackWithInstances = {
      id,
      name: name,
      channel,
      instancePlayers: new Map(),
      volume: defaultVolume,
      pan: 0,
      muted: false,
      soloed: false
    };

    if (audioFile) {
      // Store file information
      track.fileId = `file_${id}`; // In real implementation, use actual file ID
      const buffer = await audioFile.arrayBuffer();
      track.fileUrl = URL.createObjectURL(new Blob([buffer]));
      
      // Create instance players if instances provided
      if (instances && instances.length > 0) {
        const instanceData = instances.map(inst => ({
          id: inst.id,
          trimStartTicks: inst.trim_start_ticks,
          trimEndTicks: inst.trim_end_ticks,
          xPosition: inst.x_position
        }));
        
        track.instancePlayers = await this.playerFactory.createInstancePlayers(
          id,
          track.fileId,
          track.fileUrl,
          channel,
          instanceData
        );
        
        // Positions are already set in createInstancePlayers
      }
      
      await Tone.loaded();
      console.log(`Audio loaded for track ${id} with ${track.instancePlayers.size} instances`);
    }

    this.tracks.set(id, track);
    return track;
  }

  /**
   * Add a new instance to an existing track
   */
  public async addInstance(
    trackId: string,
    instance: TrackInstance
  ): Promise<void> {
    const track = this.tracks.get(trackId);
    if (!track || !track.fileId || !track.fileUrl) {
      throw new Error(`Cannot add instance to track ${trackId}: track not found or no audio file`);
    }

    // Create instance player
    const player = await this.playerFactory.createInstancePlayer(
      instance.id,
      trackId,
      track.fileId,
      track.fileUrl,
      track.channel
    );

    // Set position
    player.setXPosition(instance.x_position);
    
    // Set trim if provided
    if (instance.trim_start_ticks !== undefined && instance.trim_end_ticks !== undefined) {
      // Convert ticks to seconds
      const ticksPerSecond = Tone.Transport.bpm.value * Tone.Transport.PPQ / 60;
      player.setTrimSettings({
        trimStartTicks: instance.trim_start_ticks,
        trimEndTicks: instance.trim_end_ticks,
        trimStartSeconds: instance.trim_start_ticks / ticksPerSecond,
        trimEndSeconds: instance.trim_end_ticks / ticksPerSecond
      });
    }

    track.instancePlayers.set(instance.id, player);
    console.log(`Added instance ${instance.id} to track ${trackId} at position ${instance.x_position}`);
  }

  /**
   * Remove an instance from a track
   */
  public removeInstance(trackId: string, instanceId: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;

    const player = track.instancePlayers.get(instanceId);
    if (player) {
      player.dispose();
      track.instancePlayers.delete(instanceId);
      console.log(`Removed instance ${instanceId} from track ${trackId}`);
    }
  }

  /**
   * Update instance trim settings
   */
  public setInstanceTrim(
    trackId: string,
    instanceId: string,
    trimStartTicks: number,
    trimEndTicks: number
  ): void {
    const track = this.tracks.get(trackId);
    if (!track) return;

    const player = track.instancePlayers.get(instanceId);
    if (!player) return;

    // Convert ticks to seconds
    const ticksPerSecond = Tone.Transport.bpm.value * Tone.Transport.PPQ / 60;
    
    player.setTrimSettings({
      trimStartTicks,
      trimEndTicks,
      trimStartSeconds: trimStartTicks / ticksPerSecond,
      trimEndSeconds: trimEndTicks / ticksPerSecond
    });
  }

  /**
   * Get all instances for a track
   */
  public getTrackInstances(trackId: string): InstancePlayer[] {
    const track = this.tracks.get(trackId);
    if (!track) return [];
    
    return Array.from(track.instancePlayers.values());
  }

  /**
   * Get a specific instance player
   */
  public getInstancePlayer(trackId: string, instanceId: string): InstancePlayer | undefined {
    return this.tracks.get(trackId)?.instancePlayers.get(instanceId);
  }

  public removeTrack(id: string): void {
    const track = this.tracks.get(id);
    if (track) {
      // Dispose all instance players
      track.instancePlayers.forEach(player => {
        player.dispose();
      });
      track.instancePlayers.clear();
      
      track.channel.dispose();
      this.tracks.delete(id);
      console.log(`Removed track ${id} and all its instances`);
    }
  }

  public setTrackVolume(id: string, volume: number): Promise<void> {
    const track = this.tracks.get(id);
    if (track) {
      track.volume = volume;
      
      // Convert UI volume (0-100) to appropriate dB scale
      const volumeInDB = convertVolumeToDecibels(volume, track.muted);
      
      // Set the channel's volume (affects all instances)
      track.channel.volume.value = volumeInDB;
    }
    return Promise.resolve();
  }

  public setTrackPan(id: string, pan: number): Promise<void> {
    const track = this.tracks.get(id);
    if (track) {
      track.pan = pan;
      // Convert from UI range (-100 to 100) to Tone.js range (-1 to 1)
      const normalizedPan = pan / 100;
      track.channel.pan.value = normalizedPan;
    }
    return Promise.resolve();
  }

  public setTrackMute(id: string, muted: boolean): Promise<void> {
    const track = this.tracks.get(id);
    if (track) {
      track.muted = muted;
      // Convert volume to decibels
      track.channel.volume.value = convertVolumeToDecibels(track.volume, muted);
    }
    return Promise.resolve();
  }

  public getAllTracks(): AudioTrackWithInstances[] {
    return Array.from(this.tracks.values());
  }

  public getTrack(id: string): AudioTrackWithInstances | undefined {
    return this.tracks.get(id);
  }

  public setMasterVolume(volume: number): void {
    this.mainOutput.volume.value = volume;
  }

  /**
   * Stop all instances across all tracks
   */
  public stopAllPlayback(): void {
    console.log('Stopping all playback (full stop)');
    this.tracks.forEach((track, trackId) => {
      track.instancePlayers.forEach((player, instanceId) => {
        if (player.state === "started") {
          console.log(`Stopping instance ${instanceId} of track ${trackId}`);
          player.stop();
        }
      });
    });
  }
  
  /**
   * Pause all instances (maintain sync with transport)
   */
  public pauseAllPlayback(): void {
    console.log('Pausing all playback (maintain position)');
    // Instances will pause with transport since they're synced
    this.tracks.forEach((track, trackId) => {
      track.instancePlayers.forEach((player, instanceId) => {
        if (player.state === "started") {
          console.log(`Instance ${instanceId} of track ${trackId} synced with paused transport`);
        }
      });
    });
  }

  public setTrackName(id: string, name: string): void {
    const track = this.tracks.get(id);
    if (track) {
      track.name = name;
    }
  }
  
  public setTrackSolo(id: string, soloed: boolean): void {
    const track = this.tracks.get(id);
    if (track) {
      track.soloed = soloed;
      
      // If soloing this track, mute all other non-soloed tracks
      if (soloed) {
        this.tracks.forEach((otherTrack) => {
          if (otherTrack.id !== id && !otherTrack.soloed) {
            // Temporarily mute this track by setting volume to -Infinity
            otherTrack.channel.volume.value = -Infinity;
          }
        });
      } else {
        // When un-soloing, restore volumes of all tracks that aren't explicitly muted
        this.tracks.forEach((otherTrack) => {
          if (!otherTrack.muted && !otherTrack.soloed) {
            otherTrack.channel.volume.value = convertVolumeToDecibels(otherTrack.volume, false);
          }
        });
      }
    }
  }

  // Legacy methods for compatibility
  setTrackPosition(id: string, x: number, y: number): void {
    // In the instance-based system, positions are managed per-instance, not per-track
    // This method is called during track creation in TrackActions, but it's no longer needed
    console.log(`setTrackPosition called for track ${id} - ignored in instance-based system`);
  }
  
  setTrackPositionTicks(id: string, position: number): Promise<void> {
    console.warn('setTrackPositionTicks called on instance-based engine - use instance methods instead');
    return Promise.resolve();
  }
  
  setTrackTrimStartTicks(id: string, start: number): Promise<void> {
    console.warn('setTrackTrimStartTicks called on instance-based engine - use instance methods instead');
    return Promise.resolve();
  }
  
  setTrackTrimEndTicks(id: string, end: number): Promise<void> {
    console.warn('setTrackTrimEndTicks called on instance-based engine - use instance methods instead');
    return Promise.resolve();
  }
  
  play(position: number): Promise<void> {
    console.log(`AudioFilePlayerWithInstances: Starting playback from position ${position}s`);
    
    const bpm = Tone.Transport.bpm.value;
    const ppq = Tone.Transport.PPQ;
    const ticksPerSecond = (bpm * ppq) / 60;
    const currentPositionTicks = position * ticksPerSecond;
    
    this.tracks.forEach((track, trackId) => {
      track.instancePlayers.forEach((player, instanceId) => {
        const xPositionTicks = player.getXPosition();
        const trimSettings = player.getTrimSettings();
        
        // Calculate instance timing
        const instanceStartTicks = xPositionTicks;
        const trimStartTicks = trimSettings?.trimStartTicks || 0;
        const trimEndTicks = trimSettings?.trimEndTicks || Infinity;
        const trimDurationTicks = trimEndTicks - trimStartTicks;
        const instanceEndTicks = instanceStartTicks + trimDurationTicks;
        
        // Check if instance is within playback range
        if (currentPositionTicks >= instanceEndTicks) {
          console.log(`Instance ${instanceId} already finished (end: ${instanceEndTicks}, current: ${currentPositionTicks})`);
          return;
        }
        
        // Sync player to transport
        player.sync();
        
        if (currentPositionTicks <= instanceStartTicks) {
          // Instance hasn't started yet - schedule it for the future
          const startOffsetSeconds = (instanceStartTicks - currentPositionTicks) / ticksPerSecond;
          const trimStartSeconds = trimStartTicks / ticksPerSecond;
          
          // Schedule using Tone.Transport.schedule for precise timing
          Tone.Transport.schedule((time) => {
            console.log(`Starting instance ${instanceId} at transport time ${time}`);
            player.start(time, trimStartSeconds);
          }, `+${startOffsetSeconds}`);
          
          console.log(`Scheduled instance ${instanceId} to start in ${startOffsetSeconds}s`);
        } else {
          // Instance should already be playing - calculate the offset
          const elapsedTicks = currentPositionTicks - instanceStartTicks;
          const offsetTicks = trimStartTicks + elapsedTicks;
          const offsetSeconds = offsetTicks / ticksPerSecond;
          
          // Check if offset is within the trimmed region
          if (offsetTicks < trimEndTicks) {
            console.log(`Starting instance ${instanceId} immediately with offset ${offsetSeconds}s`);
            player.start(Tone.now(), offsetSeconds);
          } else {
            console.log(`Instance ${instanceId} offset beyond trim end`);
          }
        }
      });
    });
    
    return Promise.resolve();
  }
  
  pause(): Promise<void> {
    console.log('AudioFilePlayerWithInstances: Pausing playback');
    
    // Players stay synced to transport, which is paused
    // No need to explicitly pause each player
    this.tracks.forEach((track, trackId) => {
      track.instancePlayers.forEach((player, instanceId) => {
        console.log(`Instance ${instanceId} of track ${trackId} paused with transport`);
      });
    });
    
    return Promise.resolve();
  }
  
  stop(): Promise<void> {
    console.log('AudioFilePlayerWithInstances: Stopping playback');
    
    // Clear all scheduled events on the transport
    Tone.Transport.cancel();
    
    // Unsync all players from transport
    this.tracks.forEach((track, trackId) => {
      track.instancePlayers.forEach((player, instanceId) => {
        player.unsync();
        player.stop();
        console.log(`Stopped and unsynced instance ${instanceId} of track ${trackId}`);
      });
    });
    
    return Promise.resolve();
  }
  
  seek(position: number): Promise<void> {
    console.log(`AudioFilePlayerWithInstances: Seeking to position ${position}s`);
    
    // Clear all scheduled events
    Tone.Transport.cancel();
    
    // Stop all players
    this.tracks.forEach((track, trackId) => {
      track.instancePlayers.forEach((player, instanceId) => {
        player.unsync();
        player.stop();
      });
    });
    
    // If transport is playing, re-schedule all instances from the new position
    if (Tone.Transport.state === 'started') {
      // Re-schedule all instances from the new position
      return this.play(position);
    }
    
    return Promise.resolve();
  }
}

export { AudioFilePlayerWithInstances };
export default AudioFilePlayerWithInstances;