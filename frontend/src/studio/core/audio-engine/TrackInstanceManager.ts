import AudioFilePlayerRefactored, { AudioTrackInstance, SharedAudioData } from './audioFilePlayer/AudioEngineRefactored';
import MidiSoundfontPlayerRefactored, { MidiTrackInstance, SharedMidiData } from './midiSoundfontPlayer/MidiSoundfontPlayerRefactored';
import SamplerControllerRefactored, { SamplerTrackInstance, SharedSamplerData } from './SamplerControllerRefactored';
import DrumControllerRefactored, { DrumTrackInstance, SharedDrumData } from './DrumControllerRefactored';
import TransportControllerRefactored, { TransportTrackInstance } from './TransportControllerRefactored';
import { CombinedTrack } from '../../../platform/types/project';
import { Note } from '../../../types/note';

// SIMPLIFIED: Track instance only stores position data
export interface TrackInstanceConfig {
  trackId: string;
  instanceId: string;
  trackType: 'audio' | 'midi' | 'sampler' | 'drum';
  position: {
    x: number; // Position in ticks
    y: number; // Track lane
  };
  // Volume, pan, mute, etc. are shared from the main track
  // Only position data varies per instance
}

export interface TrackContentData {
  trackId: string;
  name: string;
  trackType: 'audio' | 'midi' | 'sampler' | 'drum';
  // Audio track data
  audioFile?: File;
  // MIDI track data
  midiNotes?: Note[];
  instrumentId?: string;
  // Sampler track data
  baseMidiNote?: number;
  grainSize?: number;
  overlap?: number;
  // Drum track data
  samplerTracksData?: Array<{
    samplerTrackId: string;
    name: string;
    audioFile: File;
    baseMidiNote: number;
    midiNotes: Note[];
  }>;
  drumPattern?: boolean[][];
}

/**
 * TrackInstanceManager
 * 
 * Central coordinator between the store and refactored audio engines.
 * Handles the separation of track content data from position-specific instances.
 */
class TrackInstanceManager {
  private static instance: TrackInstanceManager;
  
  // Refactored engines
  private audioEngine: AudioFilePlayerRefactored;
  private midiEngine: MidiSoundfontPlayerRefactored;
  private samplerEngine: SamplerControllerRefactored;
  private drumEngine: DrumControllerRefactored;
  private transport: TransportControllerRefactored;
  
  // Track content management
  private trackContentData: Map<string, TrackContentData> = new Map(); // trackId -> content
  private trackInstances: Map<string, TrackInstanceConfig> = new Map(); // instanceId -> config

  private constructor() {
    this.audioEngine = AudioFilePlayerRefactored.getInstance();
    this.midiEngine = MidiSoundfontPlayerRefactored.getInstance();
    this.samplerEngine = SamplerControllerRefactored.getInstance();
    this.drumEngine = DrumControllerRefactored.getInstance();
    this.transport = TransportControllerRefactored.getInstance();
  }

  public static getInstance(): TrackInstanceManager {
    if (!TrackInstanceManager.instance) {
      TrackInstanceManager.instance = new TrackInstanceManager();
    }
    return TrackInstanceManager.instance;
  }

  // ========== TRACK CONTENT MANAGEMENT ==========

  /**
   * Load track content data (audio file, MIDI data, etc.)
   * This is called once per unique track
   */
  public async loadTrackContent(contentData: TrackContentData): Promise<void> {
    console.log(`TrackInstanceManager: Loading content for track ${contentData.trackId}`);
    
    this.trackContentData.set(contentData.trackId, contentData);

    try {
      switch (contentData.trackType) {
        case 'audio':
          await this.audioEngine.loadSharedTrackData(
            contentData.trackId,
            contentData.name,
            contentData.audioFile
          );
          break;
          
        case 'midi':
          if (!contentData.instrumentId) {
            throw new Error(`MIDI track ${contentData.trackId} requires instrumentId`);
          }
          await this.midiEngine.loadSharedTrackData(
            contentData.trackId,
            contentData.name,
            contentData.instrumentId,
            contentData.midiNotes || []
          );
          break;
          
        case 'sampler':
          if (!contentData.audioFile) {
            throw new Error(`Sampler track ${contentData.trackId} requires audioFile`);
          }
          await this.samplerEngine.loadSharedTrackData(
            contentData.trackId,
            contentData.name,
            contentData.audioFile,
            contentData.baseMidiNote || 60,
            contentData.grainSize || 0.1,
            contentData.overlap || 0.1,
            contentData.midiNotes || []
          );
          break;
          
        case 'drum':
          if (!contentData.samplerTracksData || contentData.samplerTracksData.length === 0) {
            throw new Error(`Drum track ${contentData.trackId} requires samplerTracksData`);
          }
          await this.drumEngine.loadSharedTrackData(
            contentData.trackId,
            contentData.name,
            contentData.samplerTracksData,
            contentData.drumPattern
          );
          break;
      }
      
      console.log(`TrackInstanceManager: Successfully loaded content for track ${contentData.trackId}`);
    } catch (error) {
      console.error(`TrackInstanceManager: Failed to load content for track ${contentData.trackId}:`, error);
      throw error;
    }
  }

  /**
   * Update track content (affects all instances)
   */
  public async updateTrackContent(trackId: string, updates: Partial<TrackContentData>): Promise<void> {
    console.log(`TrackInstanceManager: Updating content for track ${trackId}`);
    
    const existingContent = this.trackContentData.get(trackId);
    if (!existingContent) {
      throw new Error(`Track content not found for track ${trackId}`);
    }

    // Update content data
    const updatedContent = { ...existingContent, ...updates };
    this.trackContentData.set(trackId, updatedContent);

    // Apply updates to all engines and instances
    const instances = this.getInstancesByTrack(trackId);
    
    switch (existingContent.trackType) {
      case 'audio':
        // Update shared audio data if needed
        if (updates.audioFile) {
          await this.audioEngine.loadSharedTrackData(trackId, updatedContent.name, updates.audioFile);
        }
        
        // Update all instances
        this.audioEngine.updateAllInstancesOfTrack(trackId, {
          // Apply content-level changes to all instances
        });
        break;
        
      case 'midi':
        // TODO: Update MIDI content and all instances
        break;
        
      case 'sampler':
        // TODO: Update sampler content and all instances
        break;
    }

    console.log(`TrackInstanceManager: Updated content for track ${trackId}, affecting ${instances.length} instances`);
  }

  // ========== TRACK INSTANCE MANAGEMENT ==========

  /**
   * Create a new instance of existing track content
   * SIMPLIFIED: Only position data varies per instance
   */
  public async createTrackInstance(config: TrackInstanceConfig): Promise<void> {
    console.log(`TrackInstanceManager: Creating instance ${config.instanceId} for track ${config.trackId} at position (${config.position.x}, ${config.position.y})`);

    // Validate track content exists
    const contentData = this.trackContentData.get(config.trackId);
    if (!contentData) {
      throw new Error(`Track content not found for track ${config.trackId}. Load content first.`);
    }

    // Store instance config (position-only)
    this.trackInstances.set(config.instanceId, config);

    try {
      // Create instance in appropriate engine with only position data
      switch (config.trackType) {
        case 'audio':
          await this.audioEngine.createTrackInstance(
            config.trackId,
            config.instanceId,
            config.position,
            {} // No volume/pan/mute options - all shared from main track
          );
          break;
          
        case 'midi':
          await this.midiEngine.createTrackInstance(
            config.trackId,
            config.instanceId,
            config.position
          );
          break;
          
        case 'sampler':
          await this.samplerEngine.createTrackInstance(
            config.trackId,
            config.instanceId,
            config.position
          );
          break;
          
        case 'drum':
          await this.drumEngine.createTrackInstance(
            config.trackId,
            config.instanceId,
            config.position
          );
          break;
      }

      // Register with transport (get shared properties from track content)
      const transportInstance: TransportTrackInstance = {
        instanceId: config.instanceId,
        trackId: config.trackId,
        trackType: config.trackType,
        position: config.position,
        // These come from the shared track data, not per-instance
        trimStartTicks: 0, // TODO: Get from shared track
        trimEndTicks: 0,   // TODO: Get from shared track
        volume: 80,        // TODO: Get from shared track
        pan: 0,            // TODO: Get from shared track
        muted: false       // TODO: Get from shared track
      };
      
      this.transport.registerTrackInstance(transportInstance);
      
      console.log(`TrackInstanceManager: Successfully created instance ${config.instanceId}`);
    } catch (error) {
      // Clean up on failure
      this.trackInstances.delete(config.instanceId);
      console.error(`TrackInstanceManager: Failed to create instance ${config.instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Remove a track instance
   */
  public async removeTrackInstance(instanceId: string): Promise<void> {
    console.log(`TrackInstanceManager: Removing instance ${instanceId}`);

    const config = this.trackInstances.get(instanceId);
    if (!config) {
      console.warn(`TrackInstanceManager: Instance ${instanceId} not found`);
      return;
    }

    try {
      // Remove from appropriate engine
      switch (config.trackType) {
        case 'audio':
          this.audioEngine.removeTrackInstance(instanceId);
          break;
          
        case 'midi':
          this.midiEngine.removeTrackInstance(instanceId);
          break;
          
        case 'sampler':
          this.samplerEngine.removeTrackInstance(instanceId);
          break;
          
        case 'drum':
          this.drumEngine.removeTrackInstance(instanceId);
          break;
      }

      // Unregister from transport
      this.transport.unregisterTrackInstance(instanceId);
      
      // Remove from tracking
      this.trackInstances.delete(instanceId);
      
      console.log(`TrackInstanceManager: Successfully removed instance ${instanceId}`);
    } catch (error) {
      console.error(`TrackInstanceManager: Failed to remove instance ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Update instance position
   */
  public updateInstancePosition(instanceId: string, newPosition: { x: number; y: number }): void {
    const config = this.trackInstances.get(instanceId);
    if (!config) {
      console.warn(`TrackInstanceManager: Instance ${instanceId} not found for position update`);
      return;
    }

    console.log(`TrackInstanceManager: Updating position for instance ${instanceId} to (${newPosition.x}, ${newPosition.y})`);

    // Update local config
    config.position = newPosition;

    // Update in transport (handles rescheduling if playing)
    this.transport.updateTrackInstancePosition(instanceId, newPosition);
  }

  /**
   * Update instance properties (SIMPLIFIED: only position updates)
   */
  public updateInstanceProperties(instanceId: string, updates: { position?: { x: number; y: number } }): void {
    const config = this.trackInstances.get(instanceId);
    if (!config) {
      console.warn(`TrackInstanceManager: Instance ${instanceId} not found for property update`);
      return;
    }

    console.log(`TrackInstanceManager: Updating properties for instance ${instanceId}`, updates);

    // Only position can be updated per instance
    if (updates.position) {
      this.updateInstancePosition(instanceId, updates.position);
    }
  }

  // ========== BULK OPERATIONS ==========

  /**
   * Create multiple instances efficiently
   */
  public async createMultipleInstances(configs: TrackInstanceConfig[]): Promise<void> {
    console.log(`TrackInstanceManager: Creating ${configs.length} instances`);

    const results = await Promise.allSettled(
      configs.map(config => this.createTrackInstance(config))
    );

    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
      console.error(`TrackInstanceManager: ${failures.length} instances failed to create`);
      // Could implement partial cleanup here if needed
    }

    console.log(`TrackInstanceManager: Successfully created ${configs.length - failures.length}/${configs.length} instances`);
  }

  /**
   * Remove multiple instances efficiently
   */
  public async removeMultipleInstances(instanceIds: string[]): Promise<void> {
    console.log(`TrackInstanceManager: Removing ${instanceIds.length} instances`);

    const results = await Promise.allSettled(
      instanceIds.map(instanceId => this.removeTrackInstance(instanceId))
    );

    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
      console.error(`TrackInstanceManager: ${failures.length} instances failed to remove`);
    }

    console.log(`TrackInstanceManager: Successfully removed ${instanceIds.length - failures.length}/${instanceIds.length} instances`);
  }

  // ========== QUERY METHODS ==========

  public getTrackContent(trackId: string): TrackContentData | undefined {
    return this.trackContentData.get(trackId);
  }

  public getInstanceConfig(instanceId: string): TrackInstanceConfig | undefined {
    return this.trackInstances.get(instanceId);
  }

  public getInstancesByTrack(trackId: string): TrackInstanceConfig[] {
    return Array.from(this.trackInstances.values()).filter(
      config => config.trackId === trackId
    );
  }

  public getAllInstances(): TrackInstanceConfig[] {
    return Array.from(this.trackInstances.values());
  }

  public getAllTrackContent(): TrackContentData[] {
    return Array.from(this.trackContentData.values());
  }

  // ========== PLAYBACK CONTROL ==========

  public async play(startPosition: number = 0): Promise<void> {
    console.log(`TrackInstanceManager: Starting playback at position ${startPosition}`);
    await this.transport.play(startPosition);
  }

  public async pause(): Promise<void> {
    console.log('TrackInstanceManager: Pausing playback');
    await this.transport.pause();
  }

  public async stop(): Promise<void> {
    console.log('TrackInstanceManager: Stopping playback');
    await this.transport.stop();
  }

  public async seek(position: number): Promise<void> {
    console.log(`TrackInstanceManager: Seeking to position ${position}`);
    await this.transport.seek(position);
  }

  public setBPM(bpm: number): void {
    this.transport.setBPM(bpm);
  }

  // ========== LEGACY COMPATIBILITY ==========

  /**
   * Create track instance from legacy CombinedTrack
   * Used for backward compatibility during migration
   * SIMPLIFIED: Only extracts position data
   */
  public async createInstanceFromLegacyTrack(track: CombinedTrack): Promise<string> {
    const instanceId = `${track.id}_legacy_${Date.now()}`;
    
    // Load content if not already loaded
    if (!this.trackContentData.has(track.id)) {
      const contentData: TrackContentData = {
        trackId: track.id,
        name: track.name,
        trackType: track.type as any, // TODO: Ensure type compatibility
        // audioFile: track.audioFile, // TODO: Get from track data
        // midiNotes: track.midiNotes, // TODO: Get from track data
      };
      
      await this.loadTrackContent(contentData);
    }

    // Create instance with only position data
    const config: TrackInstanceConfig = {
      trackId: track.id,
      instanceId,
      trackType: track.type as any,
      position: {
        x: track.x_position || 0,
        y: track.y_position || 0
      }
      // Volume, pan, mute, trim, etc. are stored on the main track, not per-instance
    };

    await this.createTrackInstance(config);
    return instanceId;
  }

  // ========== DEBUG UTILITIES ==========

  public debugLogState(): void {
    console.log('TrackInstanceManager State:');
    console.log(`  Track Content: ${this.trackContentData.size} tracks`);
    console.log(`  Track Instances: ${this.trackInstances.size} instances`);
    
    for (const [trackId, contentData] of this.trackContentData.entries()) {
      const instances = this.getInstancesByTrack(trackId);
      console.log(`    Track ${trackId} (${contentData.trackType}): ${instances.length} instances`);
    }
    
    this.transport.debugLogInstances();
  }
}

export default TrackInstanceManager;