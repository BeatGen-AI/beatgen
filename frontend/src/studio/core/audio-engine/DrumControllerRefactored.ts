import SamplerControllerRefactored, { SamplerTrackInstance, SharedSamplerData } from './SamplerControllerRefactored';
import { Note } from '../../../types/note';
import { TrackPlayer } from './trackPlayer';

// NEW: Shared drum track data (collection of samplers)
export interface SharedDrumData {
  trackId: string;
  name: string;
  samplerTracks: Map<string, SharedSamplerData>; // samplerTrackId -> sampler data
  drumPattern?: boolean[][]; // Grid pattern for drum machine
}

// NEW: Drum track instance (collection of sampler instances)
export interface DrumTrackInstance {
  instanceId: string;
  trackId: string;
  samplerInstances: Map<string, SamplerTrackInstance>; // samplerTrackId -> sampler instance
  position: {
    x: number; // Position in ticks
    y: number; // Track lane
  };
  isPlaying: boolean;
  // Volume, pan, mute inherited from shared track data
}

/**
 * Refactored Drum Controller for Track Instances
 * 
 * Drum tracks are composite tracks containing multiple sampler tracks.
 * Supports multiple instances of the same drum kit playing at different positions.
 */
class DrumControllerRefactored implements TrackPlayer {
  private static instance: DrumControllerRefactored;
  
  // Delegate to sampler controller for actual audio
  private samplerController: SamplerControllerRefactored;
  
  // NEW: Separate storage for shared data vs instances
  private sharedTrackData: Map<string, SharedDrumData> = new Map(); // trackId -> shared data
  private trackInstances: Map<string, DrumTrackInstance> = new Map(); // instanceId -> instance
  private trackToInstances: Map<string, string[]> = new Map(); // trackId -> instanceId[]
  
  // Timing
  private bpm: number = 120;

  private constructor() {
    this.samplerController = SamplerControllerRefactored.getInstance();
  }

  public static getInstance(): DrumControllerRefactored {
    if (!DrumControllerRefactored.instance) {
      DrumControllerRefactored.instance = new DrumControllerRefactored();
    }
    return DrumControllerRefactored.instance;
  }

  public async initialize(): Promise<void> {
    await this.samplerController.initialize();
    console.log('DrumControllerRefactored: Initialized');
  }

  // =============================================================================
  // SHARED TRACK DATA MANAGEMENT
  // =============================================================================

  /**
   * Load shared drum track data (collection of sampler tracks)
   */
  public async loadSharedTrackData(
    trackId: string,
    name: string,
    samplerTracksData: Array<{
      samplerTrackId: string;
      name: string;
      audioFile: File;
      baseMidiNote: number;
      midiNotes: Note[];
    }>,
    drumPattern?: boolean[][]
  ): Promise<SharedDrumData> {
    console.log(`Loading shared drum data for track ${trackId} with ${samplerTracksData.length} samplers`);

    // Check if already loaded
    if (this.sharedTrackData.has(trackId)) {
      return this.sharedTrackData.get(trackId)!;
    }

    const samplerTracks = new Map<string, SharedSamplerData>();

    // Load each sampler track
    for (const samplerData of samplerTracksData) {
      const sharedSamplerData = await this.samplerController.loadSharedTrackData(
        samplerData.samplerTrackId,
        samplerData.name,
        samplerData.audioFile,
        samplerData.baseMidiNote,
        0.1, // Default grain size
        0.1, // Default overlap
        samplerData.midiNotes
      );
      
      samplerTracks.set(samplerData.samplerTrackId, sharedSamplerData);
    }

    const sharedData: SharedDrumData = {
      trackId,
      name,
      samplerTracks,
      drumPattern
    };

    this.sharedTrackData.set(trackId, sharedData);
    console.log(`Shared drum data loaded for track ${trackId} with ${samplerTracks.size} samplers`);
    
    return sharedData;
  }

  /**
   * Update shared drum data (affects all instances)
   */
  public async updateSharedTrackData(trackId: string, updates: Partial<SharedDrumData>): Promise<void> {
    const existingData = this.sharedTrackData.get(trackId);
    if (!existingData) {
      throw new Error(`Shared drum track data not found for track ${trackId}`);
    }

    const updatedData = { ...existingData, ...updates };
    this.sharedTrackData.set(trackId, updatedData);

    // If drum pattern updated, affect all instances
    if (updates.drumPattern) {
      console.log(`Updated drum pattern for track ${trackId}, affecting ${this.getInstancesByTrack(trackId).length} instances`);
    }

    // If sampler tracks updated, propagate to sampler controller
    if (updates.samplerTracks) {
      for (const [samplerTrackId, samplerData] of updates.samplerTracks) {
        await this.samplerController.updateSharedTrackData(samplerTrackId, samplerData);
      }
    }
  }

  /**
   * Add a new sampler to an existing drum track
   */
  public async addSamplerToTrack(
    trackId: string, 
    samplerTrackId: string,
    name: string,
    audioFile: File,
    baseMidiNote: number,
    midiNotes: Note[]
  ): Promise<void> {
    const sharedData = this.sharedTrackData.get(trackId);
    if (!sharedData) {
      throw new Error(`Drum track ${trackId} not found`);
    }

    // Load the new sampler
    const sharedSamplerData = await this.samplerController.loadSharedTrackData(
      samplerTrackId,
      name,
      audioFile,
      baseMidiNote,
      0.1,
      0.1,
      midiNotes
    );

    // Add to drum track
    sharedData.samplerTracks.set(samplerTrackId, sharedSamplerData);

    // Update all existing drum instances to include the new sampler
    const drumInstances = this.getInstancesByTrack(trackId);
    for (const drumInstance of drumInstances) {
      await this.addSamplerInstanceToDrumInstance(drumInstance.instanceId, samplerTrackId);
    }

    console.log(`Added sampler ${samplerTrackId} to drum track ${trackId}`);
  }

  // =============================================================================
  // TRACK INSTANCE MANAGEMENT
  // =============================================================================

  /**
   * Create a new instance of existing drum track content
   */
  public async createTrackInstance(
    trackId: string,
    instanceId: string,
    position: { x: number; y: number }
  ): Promise<DrumTrackInstance> {
    console.log(`Creating drum instance ${instanceId} for track ${trackId} at position (${position.x}, ${position.y})`);

    // Validate shared data exists
    const sharedData = this.sharedTrackData.get(trackId);
    if (!sharedData) {
      throw new Error(`Shared drum track data not found for track ${trackId}. Load shared data first.`);
    }

    const instance: DrumTrackInstance = {
      instanceId,
      trackId,
      samplerInstances: new Map(),
      position,
      isPlaying: false
    };

    // Create sampler instances for each sampler in the drum kit
    for (const [samplerTrackId, samplerData] of sharedData.samplerTracks) {
      const samplerInstanceId = `${instanceId}_${samplerTrackId}`;
      
      const samplerInstance = await this.samplerController.createTrackInstance(
        samplerTrackId,
        samplerInstanceId,
        position // Same position as drum instance
      );
      
      instance.samplerInstances.set(samplerTrackId, samplerInstance);
    }

    // Store instance
    this.trackInstances.set(instanceId, instance);
    
    // Update trackId -> instanceIds mapping
    if (!this.trackToInstances.has(trackId)) {
      this.trackToInstances.set(trackId, []);
    }
    this.trackToInstances.get(trackId)!.push(instanceId);

    console.log(`Created drum instance ${instanceId} with ${instance.samplerInstances.size} samplers`);
    return instance;
  }

  private async addSamplerInstanceToDrumInstance(drumInstanceId: string, samplerTrackId: string): Promise<void> {
    const drumInstance = this.trackInstances.get(drumInstanceId);
    if (!drumInstance) return;

    const samplerInstanceId = `${drumInstanceId}_${samplerTrackId}`;
    
    const samplerInstance = await this.samplerController.createTrackInstance(
      samplerTrackId,
      samplerInstanceId,
      drumInstance.position
    );
    
    drumInstance.samplerInstances.set(samplerTrackId, samplerInstance);
  }

  /**
   * Remove a specific drum track instance
   */
  public removeTrackInstance(instanceId: string): void {
    console.log(`Removing drum instance ${instanceId}`);
    
    const instance = this.trackInstances.get(instanceId);
    if (!instance) return;

    const trackId = instance.trackId;

    // Stop if playing
    if (instance.isPlaying) {
      this.stopInstance(instanceId);
    }

    // Remove all sampler instances
    for (const [samplerTrackId, samplerInstance] of instance.samplerInstances) {
      this.samplerController.removeTrackInstance(samplerInstance.instanceId);
    }
    instance.samplerInstances.clear();

    // Remove from instance tracking
    this.trackInstances.delete(instanceId);

    // Update trackId -> instanceIds mapping
    const instances = this.trackToInstances.get(trackId);
    if (instances) {
      const index = instances.indexOf(instanceId);
      if (index !== -1) {
        instances.splice(index, 1);
        
        // If no more instances, clean up shared data
        if (instances.length === 0) {
          this.removeSharedTrackData(trackId);
          this.trackToInstances.delete(trackId);
        }
      }
    }
  }

  /**
   * Remove all instances of a track and its shared data
   */
  public removeTrack(trackId: string): void {
    console.log(`Removing all drum instances of track ${trackId}`);
    
    const instances = this.trackToInstances.get(trackId) || [];
    instances.forEach(instanceId => {
      this.removeTrackInstance(instanceId);
    });
  }

  private removeSharedTrackData(trackId: string): void {
    const sharedData = this.sharedTrackData.get(trackId);
    if (sharedData) {
      // Remove all sampler tracks from sampler controller
      for (const samplerTrackId of sharedData.samplerTracks.keys()) {
        this.samplerController.removeTrack(samplerTrackId);
      }
      
      this.sharedTrackData.delete(trackId);
      console.log(`Cleaned up shared drum data for track ${trackId}`);
    }
  }

  // =============================================================================
  // PLAYBACK CONTROL
  // =============================================================================

  /**
   * Schedule drum instance playback based on its position
   */
  public scheduleInstancePlayback(instanceId: string, transportPosition: number, bpm: number): void {
    const instance = this.trackInstances.get(instanceId);
    if (!instance) return;

    console.log(`Scheduling drum instance ${instanceId} to play`);

    // Schedule all sampler instances
    for (const [samplerTrackId, samplerInstance] of instance.samplerInstances) {
      this.samplerController.scheduleInstancePlayback(
        samplerInstance.instanceId,
        transportPosition,
        bpm
      );
    }

    instance.isPlaying = true;
  }

  /**
   * Stop a specific instance
   */
  public stopInstance(instanceId: string): void {
    const instance = this.trackInstances.get(instanceId);
    if (instance) {
      // Stop all sampler instances
      for (const [samplerTrackId, samplerInstance] of instance.samplerInstances) {
        this.samplerController.stopInstance(samplerInstance.instanceId);
      }
      instance.isPlaying = false;
    }
  }

  /**
   * Stop all drum playback
   */
  public stopAllPlayback(): void {
    console.log('Stopping all drum instance playback');
    this.trackInstances.forEach((instance, instanceId) => {
      this.stopInstance(instanceId);
    });
  }

  // =============================================================================
  // DRUM PATTERN MANAGEMENT
  // =============================================================================

  /**
   * Update drum pattern for a track (affects all instances)
   */
  public setDrumPattern(trackId: string, pattern: boolean[][]): void {
    const sharedData = this.sharedTrackData.get(trackId);
    if (sharedData) {
      sharedData.drumPattern = pattern;
      console.log(`Updated drum pattern for track ${trackId}`);
      
      // TODO: Convert pattern to MIDI notes and update sampler tracks
      // This would involve converting the grid pattern to Note[] objects
      // and distributing them to the appropriate sampler tracks
    }
  }

  // =============================================================================
  // POSITION MANAGEMENT
  // =============================================================================

  public setTrackInstancePosition(instanceId: string, position: { x: number; y: number }): void {
    const instance = this.trackInstances.get(instanceId);
    if (instance) {
      instance.position = position;
      
      // Update all sampler instance positions
      for (const [samplerTrackId, samplerInstance] of instance.samplerInstances) {
        this.samplerController.setTrackInstancePosition(samplerInstance.instanceId, position);
      }
      
      console.log(`Updated drum instance ${instanceId} position to (${position.x}, ${position.y})`);
    }
  }

  // =============================================================================
  // QUERY METHODS
  // =============================================================================

  public getAllInstances(): DrumTrackInstance[] {
    return Array.from(this.trackInstances.values());
  }

  public getInstancesByTrack(trackId: string): DrumTrackInstance[] {
    const instanceIds = this.trackToInstances.get(trackId) || [];
    return instanceIds.map(id => this.trackInstances.get(id)).filter(Boolean) as DrumTrackInstance[];
  }

  public getInstance(instanceId: string): DrumTrackInstance | undefined {
    return this.trackInstances.get(instanceId);
  }

  // =============================================================================
  // LEGACY COMPATIBILITY & TRACKPLAYER INTERFACE
  // =============================================================================

  async createTrack(id: string, name: string): Promise<any> {
    throw new Error('Use loadSharedTrackData + createTrackInstance for drum tracks');
  }

  setTrackPositionTicks(id: string, position: number): Promise<void> {
    return Promise.resolve();
  }

  setTrackTrimStartTicks(id: string, start: number): Promise<void> {
    return Promise.resolve();
  }

  setTrackTrimEndTicks(id: string, end: number): Promise<void> {
    return Promise.resolve();
  }

  setTrackVolume(id: string, volume: number): Promise<void> {
    // TODO: Implement shared volume control for all samplers
    return Promise.resolve();
  }

  setTrackPan(id: string, pan: number): Promise<void> {
    // TODO: Implement shared pan control for all samplers
    return Promise.resolve();
  }

  setTrackMute(id: string, muted: boolean): Promise<void> {
    // TODO: Implement shared mute control for all samplers
    return Promise.resolve();
  }

  play(position: number): Promise<void> {
    return Promise.resolve();
  }

  pause(): Promise<void> {
    this.stopAllPlayback();
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.stopAllPlayback();
    return Promise.resolve();
  }

  setBPM(bpm: number): void {
    this.bpm = bpm;
    this.samplerController.setBPM(bpm);
  }
}

export default DrumControllerRefactored;