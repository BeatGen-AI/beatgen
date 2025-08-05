import { ProjectManager } from './project';
import { RefactoredTransportController } from '../audio-engine/RefactoredTransportController';
import { MidiManager } from '../midi/MidiManagerNew';
import { InstrumentManager } from '../instruments/InstrumentManager';
import { TrackPlayerFactory } from '../audio-engine/TrackPlayerFactory';
import { AudioInstancePlayer } from '../audio-engine/players/AudioInstancePlayer';
import { MidiInstancePlayer } from '../audio-engine/players/MidiInstancePlayer';
import { SamplerInstancePlayer } from '../audio-engine/players/SamplerInstancePlayer';
import { DrumTrackCoordinator } from '../audio-engine/players/DrumTrackCoordinator';
import { CombinedTrack } from 'src/platform/types/project';
import { db } from '../db/dexie-client';
import SampleManager from '../samples/sampleManager';
import { audioContextManager } from '../audio/audioContextManager';
import SoundfontManager from '../soundfont/soundfontManager';

/**
 * Refactored Store that uses the new unified audio playback system.
 * This replaces the old Store.ts with a cleaner architecture.
 */
export class RefactoredStore {
  public projectManager: ProjectManager;
  private transportController: RefactoredTransportController;
  private midiManager: MidiManager;
  private instrumentManager: InstrumentManager;
  private sampleManager: SampleManager;
  private soundfontManager: SoundfontManager;
  private playerFactory: TrackPlayerFactory;
  private initialized: boolean = false;
  private trackPlayers: Map<string, any> = new Map(); // Store track players for direct access
  
  constructor() {
    this.projectManager = new ProjectManager();
    this.midiManager = new MidiManager();
    this.instrumentManager = new InstrumentManager();
    this.sampleManager = SampleManager.getInstance(db);
    this.soundfontManager = SoundfontManager.getInstance(db);
    
    // Initialize with default BPM
    this.transportController = new RefactoredTransportController(120);
    
    // Create player factory with MIDI manager
    this.playerFactory = new TrackPlayerFactory(this.midiManager);
  }
  
  /**
   * Initialize audio system
   */
  public async initializeAudio(): Promise<void> {
    if (this.initialized) return;
    
    try {
      console.log('[RefactoredStore] Initializing audio system...');
      
      // Initialize the centralized AudioContextManager
      const audioContext = await audioContextManager.initialize();
      console.log('[RefactoredStore] AudioContextManager initialized successfully');
      
      this.initialized = true;
      console.log('[RefactoredStore] Audio system initialized');
    } catch (error) {
      console.error('[RefactoredStore] Audio initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Get the transport controller
   */
  public getTransport(): RefactoredTransportController {
    return this.transportController;
  }
  
  /**
   * Get the MIDI manager
   */
  public getMidiManager(): MidiManager {
    return this.midiManager;
  }
  
  /**
   * Get the instrument manager
   */
  public getInstrumentManager(): InstrumentManager {
    return this.instrumentManager;
  }
  
  /**
   * Get the project manager
   */
  public getProjectManager(): ProjectManager {
    return this.projectManager;
  }
  
  /**
   * Get the sample manager
   */
  public getSampleManager(): SampleManager {
    return this.sampleManager;
  }
  
  /**
   * Load and register a track with the playback system
   */
  public async loadTrack(track: CombinedTrack): Promise<void> {
    console.log(`[RefactoredStore] Loading track ${track.id} (${track.track_type})`);
    
    try {
      // Create appropriate player for the track
      const player = await this.playerFactory.createPlayer(track);
      
      // Store player reference for direct access
      this.trackPlayers.set(track.id, player);
      
      // Register with instance manager
      this.transportController.getInstanceManager().registerTrackPlayer(track.id, player);
      
      // Handle track-specific initialization
      await this.initializeTrackPlayer(track, player);
      
      // Register instances with MIDI manager for MIDI-based tracks
      if (track.track_type === 'MIDI' || track.track_type === 'SAMPLER') {
        if (!this.midiManager.hasTrack(track.id)) {
          this.midiManager.createTrack(track.id, track.track_type.toLowerCase(), track.name);
        }
        
        // Register all instances
        if (track.instances) {
          for (const instance of track.instances) {
            this.midiManager.registerInstance(track.id, instance.id);
          }
        }
      }
      
      console.log(`[RefactoredStore] Track ${track.id} loaded successfully`);
    } catch (error) {
      console.error(`[RefactoredStore] Failed to load track ${track.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Initialize track-specific player settings
   */
  private async initializeTrackPlayer(track: CombinedTrack, player: any): Promise<void> {
    switch (track.track_type) {
      case 'AUDIO':
        await this.initializeAudioPlayer(track, player as AudioInstancePlayer);
        break;
      case 'MIDI':
        await this.initializeMidiPlayer(track, player as MidiInstancePlayer);
        break;
      case 'SAMPLER':
        await this.initializeSamplerPlayer(track, player as SamplerInstancePlayer);
        break;
      case 'DRUM':
        await this.initializeDrumPlayer(track, player as DrumTrackCoordinator);
        break;
    }
  }
  
  /**
   * Initialize audio player
   */
  private async initializeAudioPlayer(track: CombinedTrack, player: AudioInstancePlayer): Promise<void> {
    // Try to load from Dexie cache first
    try {
      const fileFromDb = await db.getAudioFile(track.id);
      if (fileFromDb?.data) {
        console.log(`[RefactoredStore] Loading audio for track ${track.id} from cache`);
        // Convert Blob to File
        const audioFile = new File(
          [fileFromDb.data],
          fileFromDb.name || track.name || `${track.id}_audio`,
          { type: fileFromDb.data.type }
        );
        await player.loadAudioFile(audioFile);
        return;
      }
    } catch (error) {
      console.warn(`[RefactoredStore] Failed to load from cache for track ${track.id}:`, error);
    }
    
    // If not in cache and we have a storage key, try to download
    if (track.track && 'audio_file_storage_key' in track.track) {
      const audioTrack = track.track as any;
      if (audioTrack.audio_file_storage_key) {
        console.warn(`[RefactoredStore] Audio for track ${track.id} not in cache, would need to download from ${audioTrack.audio_file_storage_key}`);
        // In production, this would download from the actual storage service
        // For now, we'll skip loading to avoid errors
      }
    }
  }
  
  /**
   * Initialize MIDI player
   */
  private async initializeMidiPlayer(track: CombinedTrack, player: MidiInstancePlayer): Promise<void> {
    // Load notes from MIDI manager
    if (this.midiManager.hasTrack(track.id)) {
      const notes = this.midiManager.getTrackNotes(track.id) || [];
      player.setNotes(notes);
    }
    
    // Load soundfont
    if (track.track && 'instrument_file' in track.track) {
      const midiTrack = track.track as any;
      if (midiTrack.instrument_file) {
        const soundfontData = await this.soundfontManager.getSoundfont(midiTrack.instrument_file.id);
        if (soundfontData) {
          await player.loadSoundfont(soundfontData.data);
        }
      }
    }
  }
  
  /**
   * Initialize sampler player
   */
  private async initializeSamplerPlayer(track: CombinedTrack, player: SamplerInstancePlayer): Promise<void> {
    if (track.track && 'base_midi_note' in track.track) {
      const samplerTrack = track.track as any;
      player.setBaseMidiNote(samplerTrack.base_midi_note || 60);
      player.setGrainSize(samplerTrack.grain_size || 0.1);
      player.setOverlap(samplerTrack.overlap || 0.1);
    }
    
    // Load notes from MIDI manager
    if (this.midiManager.hasTrack(track.id)) {
      const notes = this.midiManager.getTrackNotes(track.id) || [];
      player.setNotes(notes);
    }
    
    // Try to load audio from cache first
    try {
      const fileFromDb = await db.getAudioFile(track.id);
      if (fileFromDb?.data) {
        console.log(`[RefactoredStore] Loading sampler audio for track ${track.id} from cache`);
        const audioFile = new File(
          [fileFromDb.data],
          fileFromDb.name || track.name || `${track.id}_sampler`,
          { type: fileFromDb.data.type }
        );
        await player.loadAudioFile(audioFile);
        return;
      }
    } catch (error) {
      console.warn(`[RefactoredStore] Failed to load sampler from cache for track ${track.id}:`, error);
    }
    
    // Log warning if audio not in cache
    if (track.track && 'audio_storage_key' in track.track) {
      const samplerTrack = track.track as any;
      console.warn(`[RefactoredStore] Sampler audio for track ${track.id} not in cache, would need to download from ${samplerTrack.audio_storage_key}`);
    }
  }
  
  /**
   * Initialize drum player
   */
  private async initializeDrumPlayer(track: CombinedTrack, player: DrumTrackCoordinator): Promise<void> {
    if (track.track && 'sampler_tracks' in track.track) {
      const drumTrack = track.track as any;
      
      if (drumTrack.sampler_tracks) {
        player.setSamplerTracks(drumTrack.sampler_tracks);
        
        // Initialize each sampler track
        for (const samplerTrack of drumTrack.sampler_tracks) {
          const samplerPlayer = new SamplerInstancePlayer({
            trackId: samplerTrack.id,
            trackType: 'SAMPLER',
            volume: track.volume,
            pan: track.pan,
            muted: track.mute
          });
          
          await samplerPlayer.initialize();
          
          // Configure sampler
          samplerPlayer.setBaseMidiNote(samplerTrack.base_midi_note || 60);
          samplerPlayer.setGrainSize(samplerTrack.grain_size || 0.1);
          samplerPlayer.setOverlap(samplerTrack.overlap || 0.1);
          
          // Load notes if available
          if (this.midiManager.hasTrack(samplerTrack.id)) {
            const notes = this.midiManager.getTrackNotes(samplerTrack.id) || [];
            samplerPlayer.setNotes(notes);
          }
          
          // Try to load audio from cache
          try {
            const fileFromDb = await db.getAudioFile(samplerTrack.id);
            if (fileFromDb?.data) {
              console.log(`[RefactoredStore] Loading drum sampler audio for ${samplerTrack.id} from cache`);
              const audioFile = new File(
                [fileFromDb.data],
                fileFromDb.name || samplerTrack.name || `${samplerTrack.id}_sample`,
                { type: fileFromDb.data.type }
              );
              await samplerPlayer.loadAudioFile(audioFile);
            } else if (samplerTrack.audio_storage_key) {
              console.warn(`[RefactoredStore] Drum sampler audio for ${samplerTrack.id} not in cache, would need to download from ${samplerTrack.audio_storage_key}`);
            }
          } catch (error) {
            console.warn(`[RefactoredStore] Failed to load drum sampler from cache for ${samplerTrack.id}:`, error);
          }
          
          await player.addSamplerPlayer(samplerTrack.id, samplerPlayer);
        }
      }
    }
  }
  
  /**
   * Load audio file for a track
   */
  public async loadAudioFile(trackId: string, file: File): Promise<void> {
    const player = this.trackPlayers.get(trackId) as AudioInstancePlayer;
    if (player) {
      await player.loadAudioFile(file);
    } else {
      console.error(`[RefactoredStore] No player found for track ${trackId}`);
    }
  }
  
  /**
   * Load audio file from URL
   */
  public async loadAudioFileFromUrl(trackId: string, url: string): Promise<void> {
    const player = this.trackPlayers.get(trackId) as AudioInstancePlayer;
    if (player) {
      await player.loadAudioFromUrl(url);
    } else {
      console.error(`[RefactoredStore] No player found for track ${trackId}`);
    }
  }
  
  /**
   * Connect track to soundfont (for backward compatibility)
   */
  public async connectTrackToSoundfont(trackId: string, instrumentId: string): Promise<void> {
    const player = this.trackPlayers.get(trackId) as MidiInstancePlayer;
    if (player) {
      const soundfontData = await this.soundfontManager.getSoundfont(instrumentId);
      if (soundfontData) {
        await player.loadSoundfont(soundfontData.data);
      }
    }
  }
  
  /**
   * Connect track to sampler (for backward compatibility)
   */
  public async connectTrackToSampler(
    trackId: string,
    file: File,
    baseMidiNote?: number,
    grainSize?: number,
    overlap?: number
  ): Promise<void> {
    const player = this.trackPlayers.get(trackId) as SamplerInstancePlayer;
    if (player) {
      await player.loadAudioFile(file);
      if (baseMidiNote !== undefined) player.setBaseMidiNote(baseMidiNote);
      if (grainSize !== undefined) player.setGrainSize(grainSize);
      if (overlap !== undefined) player.setOverlap(overlap);
    }
  }
  
  /**
   * Remove a track
   */
  public async removeTrack(trackId: string): Promise<void> {
    // Unregister from transport
    await this.transportController.getInstanceManager().unregisterTrackPlayer(trackId);
    
    // Remove from player map
    this.trackPlayers.delete(trackId);
    
    // Clean up MIDI manager
    if (this.midiManager.hasTrack(trackId)) {
      this.midiManager.removeTrack(trackId);
    }
  }
  
  /**
   * Play all tracks
   */
  public async play(): Promise<void> {
    const tracks = this.projectManager.getCurrentProject()?.tracks || [];
    await this.transportController.play(tracks);
  }
  
  /**
   * Pause playback
   */
  public async pause(): Promise<void> {
    await this.transportController.pause();
  }
  
  /**
   * Stop playback
   */
  public async stop(): Promise<void> {
    await this.transportController.stop();
  }
  
  /**
   * Seek to position
   */
  public async seek(positionSeconds: number): Promise<void> {
    const tracks = this.projectManager.getCurrentProject()?.tracks || [];
    await this.transportController.seek(positionSeconds, tracks);
  }
  
  /**
   * Set BPM
   */
  public async setBpm(bpm: number): Promise<void> {
    await this.transportController.setTempo(bpm);
    this.midiManager.setBPM(bpm);
    
    // Update all MIDI/Sampler players
    for (const [trackId, player] of this.trackPlayers) {
      if (player instanceof MidiInstancePlayer || player instanceof SamplerInstancePlayer) {
        player.setBpm(bpm);
      }
    }
  }
  
  /**
   * Set track volume
   */
  public setTrackVolume(trackId: string, volume: number): void {
    const player = this.trackPlayers.get(trackId);
    if (player && typeof player.setVolume === 'function') {
      player.setVolume(volume);
    }
  }
  
  /**
   * Set track pan
   */
  public setTrackPan(trackId: string, pan: number): void {
    const player = this.trackPlayers.get(trackId);
    if (player && typeof player.setPan === 'function') {
      player.setPan(pan);
    }
  }
  
  /**
   * Set track mute
   */
  public setTrackMute(trackId: string, muted: boolean): void {
    const player = this.trackPlayers.get(trackId);
    if (player && typeof player.setMute === 'function') {
      player.setMute(muted);
    }
  }
  
  /**
   * Mute track (legacy compatibility)
   */
  public muteTrack(trackId: string, muted: boolean): void {
    this.setTrackMute(trackId, muted);
  }
  
  /**
   * Set track position (for spatial audio)
   */
  public setTrackPosition(trackId: string, x: number, y: number): void {
    const player = this.trackPlayers.get(trackId);
    if (player && typeof player.setPosition === 'function') {
      player.setPosition(x, y);
    }
  }
  
  /**
   * Create a track (for compatibility - track creation is now handled by loadTrack)
   */
  public async createTrack(trackId: string, name: string): Promise<void> {
    console.log(`[RefactoredStore] Track ${trackId} (${name}) will be created when loaded`);
    // Track creation is now handled when loadTrack is called
    // This method exists for backward compatibility
  }
  
  /**
   * Set track trim (for compatibility)
   */
  public setTrackTrim(trackId: string, trimStartTicks: number, trimEndTicks: number): void {
    console.log(`[RefactoredStore] Track ${trackId} trim: ${trimStartTicks}-${trimEndTicks}`);
    // Trim is handled per instance in the new system
  }
  
  /**
   * Set track offset (for compatibility)
   */
  public setTrackOffset(trackId: string, offsetMs: number): void {
    console.log(`[RefactoredStore] Track ${trackId} offset: ${offsetMs}ms`);
    // Offset is handled per instance in the new system
  }
  
  /**
   * Helper: Get storage URL
   */
  private async getStorageUrl(storageKey: string): Promise<string | null> {
    // In a real implementation, this would fetch the actual URL
    // For now, return a placeholder
    return `/api/storage/${storageKey}`;
  }
  
  /**
   * Helper: Convert URL to File
   */
  private async urlToFile(url: string, filename: string): Promise<File> {
    const response = await fetch(url);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type });
  }
  
  /**
   * Clean up resources
   */
  public async dispose(): Promise<void> {
    await this.transportController.dispose();
    
    for (const player of this.trackPlayers.values()) {
      if (player && typeof player.dispose === 'function') {
        await player.dispose();
      }
    }
    
    this.trackPlayers.clear();
  }
  
}