import { CombinedTrack, TrackType } from '../../../platform/types/project';
import { UnifiedTrackPlayer, TrackPlayerConfig } from './unified/UnifiedTrackPlayer';
import { AudioInstancePlayer } from './players/AudioInstancePlayer';
import { MidiInstancePlayer } from './players/MidiInstancePlayer';
import { SamplerInstancePlayer } from './players/SamplerInstancePlayer';
import { DrumTrackCoordinator } from './players/DrumTrackCoordinator';
import { MidiManager } from '../midi/MidiManagerNew';

/**
 * Factory for creating appropriate track players based on track type.
 * This centralizes the logic for player creation and initialization.
 */
export class TrackPlayerFactory {
  private midiManager: MidiManager | null = null;
  
  constructor(midiManager?: MidiManager) {
    this.midiManager = midiManager || null;
  }
  
  /**
   * Create a player for a specific track
   * @param track The track to create a player for
   * @returns The appropriate UnifiedTrackPlayer implementation
   */
  async createPlayer(track: CombinedTrack): Promise<UnifiedTrackPlayer> {
    const config: TrackPlayerConfig = {
      trackId: track.id,
      trackType: track.track_type,
      volume: track.volume,
      pan: track.pan,
      muted: track.mute
    };
    
    let player: UnifiedTrackPlayer;
    
    switch (track.track_type) {
      case 'AUDIO':
        player = await this.createAudioPlayer(track, config);
        break;
        
      case 'MIDI':
        player = await this.createMidiPlayer(track, config);
        break;
        
      case 'SAMPLER':
        player = await this.createSamplerPlayer(track, config);
        break;
        
      case 'DRUM':
        player = await this.createDrumPlayer(track, config);
        break;
        
      default:
        throw new Error(`Unknown track type: ${track.track_type}`);
    }
    
    await player.initialize();
    return player;
  }
  
  /**
   * Create an audio player
   */
  private async createAudioPlayer(
    track: CombinedTrack, 
    config: TrackPlayerConfig
  ): Promise<AudioInstancePlayer> {
    const player = new AudioInstancePlayer(config);
    
    // Load audio if available
    if (track.track && 'audio_file_storage_key' in track.track) {
      // In a real implementation, you'd load from storage
      // For now, we'll just initialize the player
      console.log(`[TrackPlayerFactory] Audio track ${track.id} needs loading from storage`);
      
      // Example: await player.loadAudioFromUrl(storageUrl);
    }
    
    return player;
  }
  
  /**
   * Create a MIDI player
   */
  private async createMidiPlayer(
    track: CombinedTrack, 
    config: TrackPlayerConfig
  ): Promise<MidiInstancePlayer> {
    const player = new MidiInstancePlayer(config);
    
    // Load MIDI notes if available
    if (this.midiManager && this.midiManager.hasTrack(track.id)) {
      const notes = this.midiManager.getTrackNotes(track.id) || [];
      player.setNotes(notes);
    }
    
    // Load soundfont if available
    if (track.track && 'instrument_file' in track.track) {
      // In a real implementation, you'd load the soundfont
      console.log(`[TrackPlayerFactory] MIDI track ${track.id} needs soundfont loading`);
      
      // Example: 
      // const soundfontData = await loadSoundfont(track.track.instrument_file.storage_key);
      // await player.loadSoundfont(soundfontData);
    }
    
    return player;
  }
  
  /**
   * Create a sampler player
   */
  private async createSamplerPlayer(
    track: CombinedTrack, 
    config: TrackPlayerConfig
  ): Promise<SamplerInstancePlayer> {
    const player = new SamplerInstancePlayer(config);
    
    // Set sampler parameters
    if (track.track && 'base_midi_note' in track.track) {
      const samplerTrack = track.track as any; // Type assertion for sampler track
      player.setBaseMidiNote(samplerTrack.base_midi_note || 60);
      player.setGrainSize(samplerTrack.grain_size || 0.1);
      player.setOverlap(samplerTrack.overlap || 0.1);
    }
    
    // Load MIDI notes if available
    if (this.midiManager && this.midiManager.hasTrack(track.id)) {
      const notes = this.midiManager.getTrackNotes(track.id) || [];
      player.setNotes(notes);
    }
    
    // Load audio file if available
    if (track.track && 'audio_storage_key' in track.track) {
      console.log(`[TrackPlayerFactory] Sampler track ${track.id} needs audio loading`);
      // Example: await player.loadAudioFile(audioFile);
    }
    
    return player;
  }
  
  /**
   * Create a drum player
   */
  private async createDrumPlayer(
    track: CombinedTrack, 
    config: TrackPlayerConfig
  ): Promise<DrumTrackCoordinator> {
    const player = new DrumTrackCoordinator(config);
    
    // Set up sampler tracks
    if (track.track && 'sampler_tracks' in track.track) {
      const drumTrack = track.track as any; // Type assertion for drum track
      
      if (drumTrack.sampler_tracks) {
        player.setSamplerTracks(drumTrack.sampler_tracks);
        
        // Create sampler players for each sampler track
        for (const samplerTrack of drumTrack.sampler_tracks) {
          const samplerConfig: TrackPlayerConfig = {
            trackId: samplerTrack.id,
            trackType: 'SAMPLER',
            volume: config.volume,
            pan: config.pan,
            muted: config.muted
          };
          
          const samplerPlayer = new SamplerInstancePlayer(samplerConfig);
          
          // Configure the sampler
          samplerPlayer.setBaseMidiNote(samplerTrack.base_midi_note || 60);
          samplerPlayer.setGrainSize(samplerTrack.grain_size || 0.1);
          samplerPlayer.setOverlap(samplerTrack.overlap || 0.1);
          
          // Load notes if available
          if (this.midiManager && this.midiManager.hasTrack(samplerTrack.id)) {
            const notes = this.midiManager.getTrackNotes(samplerTrack.id) || [];
            samplerPlayer.setNotes(notes);
          }
          
          await player.addSamplerPlayer(samplerTrack.id, samplerPlayer);
        }
      }
    }
    
    return player;
  }
  
  /**
   * Update MIDI manager reference
   */
  setMidiManager(midiManager: MidiManager): void {
    this.midiManager = midiManager;
  }
}