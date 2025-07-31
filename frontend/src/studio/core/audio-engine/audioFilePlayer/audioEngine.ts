import * as Tone from 'tone';
import { convertVolumeToDecibels } from '../../../utils/audioProcessing';
import { TrackPlayer } from '../trackPlayer';

export interface AudioTrack {
  id: string;
  name: string;
  channel: Tone.Channel;
  player?: Tone.Player;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  trimStartTicks?: number;
  trimEndTicks?: number;
  originalDurationTicks?: number;
  position?: {
    x: number; // Position in ticks from left (musical time position)
    y: number; // Position in pixels from top (track order)
  };
}

class AudioFilePlayer implements TrackPlayer {
  private static instance: AudioFilePlayer;
  private mainOutput: Tone.Channel;
  private tracks: Map<string, AudioTrack>;

  private constructor() {
    this.mainOutput = new Tone.Channel().toDestination();
    this.tracks = new Map();
  }
  setTrackPositionTicks(id: string, position: number): Promise<void> {
    throw new Error('Method not implemented.');
  }
  setTrackTrimStartTicks(id: string, start: number): Promise<void> {
    const track = this.tracks.get(id);
    if (!track) return Promise.resolve();

    this.setTrackTrim(id, start, track.trimEndTicks ?? Infinity);
    return Promise.resolve();
  }

  setTrackTrimEndTicks(id: string, end: number): Promise<void> {
    const track = this.tracks.get(id);
    if (!track) return Promise.resolve();

    this.setTrackTrim(id, track.trimStartTicks ?? 0, end);
    return Promise.resolve();
  }

  async play(position: number): Promise<void> {
  console.log("AudioFilePlayer.play() called with position:", position);

  if (Tone.getContext().state !== "running") {
    await Tone.start();
  }

  const ticksPerSecond = Tone.Transport.bpm.value * Tone.Transport.PPQ / 60;
  const now = Tone.now();

  this.tracks.forEach((track) => {
    if (!track.player) return;

    track.player.stop();
    track.player.unsync();

    const clipStartSeconds = (track.position?.x ?? 0) / ticksPerSecond;

    const trim = (track.player as any)._trimSettings || {};
    const trimStartSeconds = trim.trimStartSeconds ?? 0;
    const trimEndSeconds = trim.trimEndSeconds ?? (track.player.buffer?.duration ?? 0);

    const duration = Math.max(0, trimEndSeconds - trimStartSeconds);
    const absoluteTrimmedStart = clipStartSeconds + trimStartSeconds;
    const absoluteTrimmedEnd = clipStartSeconds + trimEndSeconds;

    // Debug logs
    console.log("Track ID:", track.id);
    console.log("Timeline position:", position);
    console.log("clipStartSeconds:", clipStartSeconds);
    console.log("trimStartSeconds:", trimStartSeconds);
    console.log("trimEndSeconds:", trimEndSeconds);
    console.log("absoluteTrimmedStart:", absoluteTrimmedStart);
    console.log("absoluteTrimmedEnd:", absoluteTrimmedEnd);

    if (position >= absoluteTrimmedEnd) {
      console.log("Position is after trimmed clip — skipping playback");
      return;
    }

    if (position >= absoluteTrimmedStart) {
      const offset = trimStartSeconds + (position - absoluteTrimmedStart);
      const remainingDuration = Math.max(0, trimEndSeconds - offset);

      console.log("Starting immediately at offset:", offset, "for duration:", remainingDuration);
      track.player.start(now, offset, remainingDuration);
    } else {
      const delay = absoluteTrimmedStart - position;

      console.log("Scheduling playback with delay:", delay, "at trimStartSeconds:", trimStartSeconds);
      track.player.start(now + delay, trimStartSeconds, duration);
    }
  });
}


  async pause(): Promise<void> {
    // Pause the global transport — synced players will pause with it
    Tone.Transport.pause();
    // Do NOT unsync or stop players, so resume works correctly
  }

  async stop(): Promise<void> {
    // Stop the transport and reset timeline
    Tone.Transport.stop();
    Tone.Transport.seconds = 0;

    // Stop all players immediately
    this.tracks.forEach((track) => {
      if (track.player) {
        track.player.stop();
      }
    });
  }

  public static getInstance(): AudioFilePlayer {
    if (!AudioFilePlayer.instance) {
      AudioFilePlayer.instance = new AudioFilePlayer();
    }
    return AudioFilePlayer.instance;
  }

  public async initialize(): Promise<void> {
    try {
      console.log('AudioEngine: Starting Tone.js');
      //await Tone.start();
      // Set context to start immediately
      //Tone.getContext().resume();
      console.log('AudioEngine: Tone.js started successfully');
    } catch (error) {
      console.error('AudioEngine: Failed to start Tone.js:', error);
      throw error;
    }
  }

  public async createTrack(id: string, name: string, audioFile?: File): Promise<AudioTrack> {
    console.log(`Creating track ${id}, cleaning up existing...`);
    this.removeTrack(id);

    const channel = new Tone.Channel().connect(this.mainOutput);

    // Default volume is 80 (on 0-100 scale, which represents original volume)
    const defaultVolume = 80;

    // Convert the default volume to decibels and set the channel volume
    channel.volume.value = convertVolumeToDecibels(defaultVolume, false);

    // Get track name from the filename if available
    const trackName = audioFile ? audioFile.name.split('.')[0] : "MIDI Instrument";

    const track: AudioTrack = {
      id,
      name: name,
      channel,
      volume: defaultVolume,
      pan: 0,
      muted: false,
      soloed: false
    };

    if (audioFile) {
      console.log(`Loading audio file for track ${id}`);
      const buffer = await audioFile.arrayBuffer();
      const player = new Tone.Player({
        url: URL.createObjectURL(new Blob([buffer])),
        loop: false,
        autostart: false,
      }).connect(channel);

      // Do NOT sync with transport immediately
      // This would cause unexpected behavior - players should only be synced right before playing
      track.player = player;
      await Tone.loaded();
      console.log(`Audio loaded for track ${id}`);
    }

    this.tracks.set(id, track);
    return track;
  }

  public removeTrack(id: string): void {
    const track = this.tracks.get(id);
    if (track) {
      if (track.player) {
        track.player.stop();
        track.player.dispose();  // dispose handles both unsync and disconnect
      }
      track.channel.dispose();
      this.tracks.delete(id);
    }
  }

  public setTrackVolume(id: string, volume: number): Promise<void> {
    const track = this.tracks.get(id);
    if (track) {
      track.volume = volume;

      // Convert UI volume (0-100) to appropriate dB scale using the utility function
      const volumeInDB = convertVolumeToDecibels(volume, track.muted);

      // Set the channel's volume
      track.channel.volume.value = volumeInDB;

      // If there's a player, also set its volume directly to ensure consistency
      if (track.player) {
        track.player.volume.value = volumeInDB;
      }
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
      // Convert volume to decibels using the correct utility function
      track.channel.volume.value = convertVolumeToDecibels(track.volume, muted);

      // If there's a player, also update its volume for consistency
      if (track.player) {
        track.player.volume.value = convertVolumeToDecibels(track.volume, muted);
      }
    }
    return Promise.resolve();
  }

  public getAllTracks(): AudioTrack[] {
    return Array.from(this.tracks.values());
  }

  public setMasterVolume(volume: number): void {
    this.mainOutput.volume.value = volume;
  }

  // Stops all playback and should only be used for full stop, not pause
  public stopAllPlayback(): void {
    console.log('Stopping all playback (full stop)');
    this.tracks.forEach((track, id) => {
      if (track.player) {
        console.log(`Stopping player for track ${id}`);
        // With Tone.js, we need to be careful with stop() as it completely stops the player
        // Only stop if it's actually playing
        if (track.player.state === "started") {
          track.player.stop();
        }

        // Do NOT resync here - this is a critical fix
        // Players should only be synced right before starting them with a specific offset
      }
    });
  }

  // Add a method specifically for pausing (doesn't actually stop the players)
  public pauseAllPlayback(): void {
    console.log('Pausing all playback (maintain position)');
    // For pause, we don't actually call stop() on the players
    // We just let the transport pause and the players will pause with it
    // since they are synced to the transport
    this.tracks.forEach((track, id) => {
      if (track.player && track.player.state === "started") {
        console.log(`Track ${id} player synced with paused transport`);
      }
    });
  }

  // Add method to update track name
  public setTrackName(id: string, name: string): void {
    const track = this.tracks.get(id);
    if (track) {
      track.name = name;
    }
  }

  // Set a track's position on the timeline
  public setTrackPosition(id: string, x: number, y: number): void {
    const track = this.tracks.get(id);
    if (track) {
      track.position = { x, y };
      console.log(`AudioEngine: Set track ${id} position to x:${x}, y:${y}`);
    }
  }

  // Set a track's solo state
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

  public setTrackTrim(trackId: string, trimStartTicks: number, trimEndTicks: number): void {
    const track = this.tracks.get(trackId);
    if (!track || !track.player) return;

    track.trimStartTicks = trimStartTicks;
    track.trimEndTicks = trimEndTicks;

    if (track.player instanceof Tone.Player) {
      const ticksPerSecond = Tone.Transport.bpm.value * Tone.Transport.PPQ / 60;
      const trimStartSeconds = trimStartTicks / ticksPerSecond;
      const trimEndSeconds = trimEndTicks / ticksPerSecond;

      console.log(`Updating trim for ${trackId}: start=${trimStartSeconds}s, end=${trimEndSeconds}s`);

      if (track.player.buffer) {
        const bufferDuration = track.player.buffer.duration;

        const startSec = Math.min(Math.max(0, trimStartSeconds), bufferDuration);
        const endSec = Math.min(Math.max(startSec, trimEndSeconds), bufferDuration);

        (track.player as any)._trimSettings = {
          trimStartSeconds: startSec,
          trimEndSeconds: endSec,
          trimEnabled: true,
        };
      } else {
        console.warn(`Cannot set trim for ${trackId}: player has no buffer`);
      }
    }
  }




  public updateTrack(trackId: string, updatedTrack: AudioTrack): void {
    // Check if track exists in the map
    if (!this.tracks.has(trackId)) return;

    // Get the existing track
    const existingTrack = this.tracks.get(trackId);

    // Update the track in the tracks map
    this.tracks.set(trackId, {
      ...existingTrack,
      ...updatedTrack,
      // Ensure player and channel instances are preserved
      player: existingTrack.player,
      channel: existingTrack.channel
    });

    // If the track has trim settings, apply them
    if (updatedTrack.trimStartTicks !== undefined && updatedTrack.trimEndTicks !== undefined) {
      this.setTrackTrim(trackId, updatedTrack.trimStartTicks, updatedTrack.trimEndTicks);
    }
  }

}

export default AudioFilePlayer; 