import AudioFilePlayerRefactored, { AudioTrackInstance, SharedAudioData, AudioTrack as RefactoredAudioTrack } from './audioFilePlayer/AudioEngineRefactored';
import AudioFilePlayerLegacy, { AudioTrack as LegacyAudioTrack } from './audioFilePlayer/audioEngine.legacy';
import TrackInstanceManager, { TrackInstanceConfig, TrackContentData } from './TrackInstanceManager';
import { migrationFlags } from './migration';
import { TrackPlayer } from './trackPlayer';

/**
 * AudioEngineMigrationWrapper
 * 
 * Provides a unified interface that gradually migrates from the legacy audio engine
 * to the new instance-based audio engine using feature flags.
 * 
 * This wrapper maintains backward compatibility while enabling new features.
 */
class AudioEngineMigrationWrapper implements TrackPlayer {
  private static instance: AudioEngineMigrationWrapper;
  
  // Engine instances (lazy initialized to avoid circular dependency)
  private _legacyEngine: AudioFilePlayerLegacy | null = null;
  private _refactoredEngine: AudioFilePlayerRefactored | null = null;
  private _instanceManager: TrackInstanceManager | null = null;
  
  // Track which tracks are using which engine
  private trackEngineMap: Map<string, 'legacy' | 'refactored'> = new Map();

  private constructor() {
    // Don't initialize engines here to avoid circular dependency
    migrationFlags.log('AudioEngineMigrationWrapper initialized (engines will be lazy loaded)');
  }

  // Lazy getters to avoid circular dependency

  private get legacyEngine(): AudioFilePlayerLegacy {
    if (!this._legacyEngine) {
      this._legacyEngine = AudioFilePlayerLegacy.getInstance();
    }
    return this._legacyEngine;
  }

  private get refactoredEngine(): AudioFilePlayerRefactored {
    if (!this._refactoredEngine) {
      this._refactoredEngine = AudioFilePlayerRefactored.getInstance();
    }
    return this._refactoredEngine;
  }

  private get instanceManager(): TrackInstanceManager {
    if (!this._instanceManager) {
      this._instanceManager = TrackInstanceManager.getInstance();
    }
    return this._instanceManager;
  }

  public static getInstance(): AudioEngineMigrationWrapper {
    if (!AudioEngineMigrationWrapper.instance) {
      AudioEngineMigrationWrapper.instance = new AudioEngineMigrationWrapper();
    }
    return AudioEngineMigrationWrapper.instance;
  }

  public async initialize(): Promise<void> {
    migrationFlags.log('Initializing audio engines');
    
    // Always initialize legacy engine for backward compatibility
    await this.legacyEngine.initialize();
    
    // Initialize refactored engine if instance features are enabled
    if (migrationFlags.instanceBasedAudioEnabled) {
      await this.refactoredEngine.initialize();
    }
    
    migrationFlags.log('Audio engines initialized successfully');
  }

  // =============================================================================
  // CORE TRACK CREATION - MIGRATION POINT
  // =============================================================================

  public async createTrack(id: string, name: string, audioFile?: File): Promise<LegacyAudioTrack> {
    migrationFlags.log(`Creating track ${id} with migration logic`);

    // Decision logic: Use new engine for audio tracks if features are enabled
    const useNewEngine = migrationFlags.instanceBasedAudioEnabled && 
                        migrationFlags.sharedAudioBuffersEnabled &&
                        audioFile; // Only use new engine for audio files initially

    if (useNewEngine) {
      migrationFlags.log(`Creating track ${id} using refactored engine`);
      return await this.createTrackWithNewEngine(id, name, audioFile);
    } else {
      migrationFlags.log(`Creating track ${id} using legacy engine`);
      return await this.createTrackWithLegacyEngine(id, name, audioFile);
    }
  }

  private async createTrackWithLegacyEngine(id: string, name: string, audioFile?: File): Promise<LegacyAudioTrack> {
    this.trackEngineMap.set(id, 'legacy');
    
    // Ensure legacy engine is initialized
    
    return await this.legacyEngine.createTrack(id, name, audioFile);
  }

  private async createTrackWithNewEngine(id: string, name: string, audioFile?: File): Promise<LegacyAudioTrack> {
    this.trackEngineMap.set(id, 'refactored');
    
    try {
      // Load shared track content
      const contentData: TrackContentData = {
        trackId: id,
        name,
        trackType: 'audio',
        audioFile
      };
      
      await this.instanceManager.loadTrackContent(contentData);
      
      // Create default instance for backward compatibility
      const instanceId = `${id}_default_instance`;
      const instanceConfig: TrackInstanceConfig = {
        trackId: id,
        instanceId,
        trackType: 'audio',
        position: { x: 0, y: 0 }
        // Volume, pan, mute are stored on the main track, not per-instance
      };
      
      await this.instanceManager.createTrackInstance(instanceConfig);
      
      // Return legacy-compatible track object
      const refactoredTrack = await this.refactoredEngine.createTrack(id, name, audioFile);
      
      migrationFlags.debug(`Created refactored track ${id} with instance ${instanceId}`);
      return refactoredTrack;
      
    } catch (error) {
      migrationFlags.log(`Failed to create track ${id} with new engine, falling back to legacy:`, error);
      
      // Fallback to legacy engine
      this.trackEngineMap.set(id, 'legacy');
      return await this.legacyEngine.createTrack(id, name, audioFile);
    }
  }

  // =============================================================================
  // TRACK INSTANCE OPERATIONS - NEW FUNCTIONALITY
  // =============================================================================

  public async createTrackInstance(
    trackId: string, 
    instanceId: string, 
    position: { x: number; y: number }
  ): Promise<string> {
    if (!migrationFlags.trackInstancesEnabled) {
      throw new Error('Track instances are not enabled. Enable with migrationFlags.enablePhase1()');
    }

    migrationFlags.log(`Creating instance ${instanceId} for track ${trackId} at position (${position.x}, ${position.y})`);

    // Ensure track content is loaded in new engine
    if (!this.trackEngineMap.has(trackId) || this.trackEngineMap.get(trackId) === 'legacy') {
      throw new Error(`Track ${trackId} must be created with new engine to support instances`);
    }

    const instanceConfig: TrackInstanceConfig = {
      trackId,
      instanceId,
      trackType: 'audio', // TODO: Get from track data
      position
      // All other properties (volume, pan, mute, trim) are shared from the main track
    };

    await this.instanceManager.createTrackInstance(instanceConfig);
    
    migrationFlags.debug(`Created instance ${instanceId} at position (${position.x}, ${position.y})`);
    return instanceId;
  }

  public async removeTrackInstance(instanceId: string): Promise<void> {
    if (!migrationFlags.trackInstancesEnabled) {
      throw new Error('Track instances are not enabled');
    }

    migrationFlags.log(`Removing instance ${instanceId}`);
    await this.instanceManager.removeTrackInstance(instanceId);
  }

  public updateInstancePosition(instanceId: string, position: { x: number; y: number }): void {
    if (!migrationFlags.trackInstancesEnabled) {
      throw new Error('Track instances are not enabled');
    }

    migrationFlags.debug(`Updating instance ${instanceId} position to (${position.x}, ${position.y})`);
    this.instanceManager.updateInstancePosition(instanceId, position);
  }

  public getTrackInstances(trackId: string): TrackInstanceConfig[] {
    if (!migrationFlags.trackInstancesEnabled) {
      return [];
    }

    return this.instanceManager.getInstancesByTrack(trackId);
  }

  // =============================================================================
  // UNIFIED TRACK OPERATIONS - ROUTE TO APPROPRIATE ENGINE
  // =============================================================================

  public async removeTrack(id: string): Promise<void> {
    const engine = this.trackEngineMap.get(id);
    
    if (engine === 'refactored') {
      migrationFlags.log(`Removing refactored track ${id} and all instances`);
      this.instanceManager.removeMultipleInstances(
        this.instanceManager.getInstancesByTrack(id).map(i => i.instanceId)
      );
      this.refactoredEngine.removeTrack(id);
    } else {
      migrationFlags.log(`Removing legacy track ${id}`);
        this.legacyEngine.removeTrack(id);
    }
    
    this.trackEngineMap.delete(id);
  }

  public async setTrackVolume(id: string, volume: number): Promise<void> {
    const engine = this.trackEngineMap.get(id);
    
    if (engine === 'refactored') {
      // For refactored tracks, volume is shared across all instances
      // Update the shared track data and all instances will inherit it
      migrationFlags.log(`Setting shared volume for refactored track ${id}: ${volume}`);
      // TODO: Update shared track data volume and refresh all instances
      console.log('Volume updates for refactored tracks not yet implemented');
    } else {
      await this.legacyEngine.setTrackVolume(id, volume);
    }
  }

  public async setTrackPan(id: string, pan: number): Promise<void> {
    const engine = this.trackEngineMap.get(id);
    
    if (engine === 'refactored') {
      // For refactored tracks, pan is shared across all instances
      migrationFlags.log(`Setting shared pan for refactored track ${id}: ${pan}`);
      // TODO: Update shared track data pan and refresh all instances
      console.log('Pan updates for refactored tracks not yet implemented');
    } else {
      await this.legacyEngine.setTrackPan(id, pan);
    }
  }

  public async setTrackMute(id: string, muted: boolean): Promise<void> {
    const engine = this.trackEngineMap.get(id);
    
    if (engine === 'refactored') {
      // For refactored tracks, mute is shared across all instances
      migrationFlags.log(`Setting shared mute for refactored track ${id}: ${muted}`);
      // TODO: Update shared track data mute and refresh all instances
      console.log('Mute updates for refactored tracks not yet implemented');
    } else {
      await this.legacyEngine.setTrackMute(id, muted);
    }
  }

  public getAllTracks(): LegacyAudioTrack[] {
    // Combine tracks from both engines
    try {
      const legacyTracks = this.legacyEngine.getAllTracks();
      const refactoredTracks = this.refactoredEngine.getAllTracks();
      
      migrationFlags.debug(`Returning ${legacyTracks.length} legacy + ${refactoredTracks.length} refactored tracks`);
      return [...legacyTracks, ...refactoredTracks];
    } catch (error) {
      console.error('Error getting all tracks:', error);
      return [];
    }
  }

  public setMasterVolume(volume: number): void {
    this.legacyEngine.setMasterVolume(volume);
    this.refactoredEngine.setMasterVolume(volume);
  }

  public stopAllPlayback(): void {
    migrationFlags.log('Stopping all playback on both engines');
    this.legacyEngine.stopAllPlayback();
    this.refactoredEngine.stopAllPlayback();
  }

  // =============================================================================
  // PLAYBACK CONTROL - ROUTE TO INSTANCE MANAGER
  // =============================================================================

  public async play(position: number): Promise<void> {
    if (migrationFlags.instanceBasedAudioEnabled) {
      migrationFlags.log(`Starting playback at position ${position} via instance manager`);
      await this.instanceManager.play(position);
    } else {
      // Legacy playback would need to be handled by transport controller
      migrationFlags.log('Instance-based playback not enabled, playback control handled elsewhere');
    }
  }

  public async pause(): Promise<void> {
    if (migrationFlags.instanceBasedAudioEnabled) {
      await this.instanceManager.pause();
    }
    this.legacyEngine.stopAllPlayback(); // Legacy engines just stop
  }

  public async stop(): Promise<void> {
    if (migrationFlags.instanceBasedAudioEnabled) {
      await this.instanceManager.stop();
    }
    this.legacyEngine.stopAllPlayback();
  }

  // =============================================================================
  // MIGRATION UTILITIES
  // =============================================================================

  public migrateTrackToNewEngine(trackId: string): Promise<void> {
    migrationFlags.log(`Migrating track ${trackId} from legacy to refactored engine`);
    
    const legacyTrack = this.legacyEngine.getAllTracks().find(t => t.id === trackId);
    if (!legacyTrack) {
      throw new Error(`Legacy track ${trackId} not found`);
    }

    // TODO: Implement track migration logic
    // This would involve:
    // 1. Extract track data from legacy engine
    // 2. Create equivalent in refactored engine
    // 3. Preserve all properties and audio files
    // 4. Remove from legacy engine
    // 5. Update engine mapping

    throw new Error('Track migration not yet implemented');
  }

  public getEngineForTrack(trackId: string): 'legacy' | 'refactored' | undefined {
    return this.trackEngineMap.get(trackId);
  }

  public getMigrationStats(): {
    legacyTracks: number;
    refactoredTracks: number;
    totalInstances: number;
    featuresEnabled: string[];
  } {
    const legacyCount = this.legacyEngine.getAllTracks().length;
    const refactoredCount = this.refactoredEngine.getAllTracks().length;
    const instanceCount = this.instanceManager.getAllInstances().length;

    const enabledFeatures = [];
    if (migrationFlags.trackInstancesEnabled) enabledFeatures.push('trackInstances');
    if (migrationFlags.instanceBasedAudioEnabled) enabledFeatures.push('instanceBasedAudio');
    if (migrationFlags.sharedAudioBuffersEnabled) enabledFeatures.push('sharedAudioBuffers');

    return {
      legacyTracks: legacyCount,
      refactoredTracks: refactoredCount,
      totalInstances: instanceCount,
      featuresEnabled: enabledFeatures
    };
  }

  // =============================================================================
  // TrackPlayer INTERFACE IMPLEMENTATION
  // =============================================================================

  setTrackPositionTicks(id: string, position: number): Promise<void> {
    // Route to appropriate engine or throw if not supported
    const engine = this.trackEngineMap.get(id);
    if (engine === 'refactored') {
      // For refactored tracks, this should update instance positions
      migrationFlags.log(`Position update for refactored track ${id} not yet fully implemented`);
      return Promise.resolve();
    } else {
      // Legacy engine doesn't implement this method, so we'll handle it here
      migrationFlags.log(`Position ticks update for legacy track ${id}: ${position}`);
      return Promise.resolve();
    }
  }

  setTrackTrimStartTicks(id: string, start: number): Promise<void> {
    const engine = this.trackEngineMap.get(id);
    if (engine === 'refactored') {
      return this.refactoredEngine.setTrackTrimStartTicks(id, start);
    } else {
      // Legacy engine doesn't implement this method, so we'll handle it here
      migrationFlags.log(`Trim start ticks update for legacy track ${id}: ${start}`);
      return Promise.resolve();
    }
  }

  setTrackTrimEndTicks(id: string, end: number): Promise<void> {
    const engine = this.trackEngineMap.get(id);
    if (engine === 'refactored') {
      return this.refactoredEngine.setTrackTrimEndTicks(id, end);
    } else {
      // Legacy engine doesn't implement this method, so we'll handle it here
      migrationFlags.log(`Trim end ticks update for legacy track ${id}: ${end}`);
      return Promise.resolve();
    }
  }
}

export default AudioEngineMigrationWrapper;

// Export convenience functions for debugging
declare global {
  interface Window {
    audioEngineWrapper: AudioEngineMigrationWrapper;
  }
}

if (typeof window !== 'undefined') {
  window.audioEngineWrapper = AudioEngineMigrationWrapper.getInstance();
}