import AudioEngineMigrationWrapper from '../AudioEngineMigrationWrapper';
import { migrationFlags } from '../migration';

// Re-export legacy interfaces for backward compatibility
export type { AudioTrack } from './audioEngine.legacy';

/**
 * AudioFilePlayer - Migration Entry Point
 * 
 * This is the new entry point that routes to either the legacy engine
 * or the refactored instance-based engine based on feature flags.
 * 
 * Maintains the same interface as the original AudioFilePlayer for
 * backward compatibility while enabling new instance-based features.
 */
class AudioFilePlayer {
  private static instance: AudioFilePlayer;
  private _migrationWrapper: AudioEngineMigrationWrapper | null = null;

  private constructor() {
    // Don't initialize migration wrapper here to avoid circular dependency
    migrationFlags.log('AudioFilePlayer initialized (migration wrapper will be lazy loaded)');
    
    // Log current migration status
    if (migrationFlags.migrationLoggingEnabled) {
      const config = migrationFlags.getFullConfig();
      console.log('AudioFilePlayer Migration Status:', {
        trackInstances: config.enableTrackInstances,
        instanceBasedAudio: config.enableInstanceBasedAudio,
        sharedBuffers: config.enableSharedAudioBuffers
      });
    }
  }

  public static getInstance(): AudioFilePlayer {
    if (!AudioFilePlayer.instance) {
      AudioFilePlayer.instance = new AudioFilePlayer();
    }
    return AudioFilePlayer.instance;
  }

  // Lazy getter for migration wrapper to avoid circular dependency
  private get migrationWrapper(): AudioEngineMigrationWrapper {
    if (!this._migrationWrapper) {
      this._migrationWrapper = AudioEngineMigrationWrapper.getInstance();
    }
    return this._migrationWrapper;
  }

  // =============================================================================
  // CORE INTERFACE - DELEGATES TO MIGRATION WRAPPER
  // =============================================================================

  public async initialize(): Promise<void> {
    migrationFlags.log('Initializing AudioFilePlayer via migration wrapper');
    await this.migrationWrapper.initialize();
  }

  public async createTrack(id: string, name: string, audioFile?: File) {
    return await this.migrationWrapper.createTrack(id, name, audioFile);
  }

  public removeTrack(id: string): void {
    this.migrationWrapper.removeTrack(id);
  }

  public async setTrackVolume(id: string, volume: number): Promise<void> {
    return await this.migrationWrapper.setTrackVolume(id, volume);
  }

  public async setTrackPan(id: string, pan: number): Promise<void> {
    return await this.migrationWrapper.setTrackPan(id, pan);
  }

  public async setTrackMute(id: string, muted: boolean): Promise<void> {
    return await this.migrationWrapper.setTrackMute(id, muted);
  }

  public getAllTracks() {
    return this.migrationWrapper.getAllTracks();
  }

  public setMasterVolume(volume: number): void {
    this.migrationWrapper.setMasterVolume(volume);
  }

  public stopAllPlayback(): void {
    this.migrationWrapper.stopAllPlayback();
  }

  // =============================================================================
  // LEGACY COMPATIBILITY METHODS
  // =============================================================================

  public pauseAllPlayback(): void {
    // Legacy method - delegate to stop for now
    this.stopAllPlayback();
  }

  public setTrackName(id: string, name: string): void {
    migrationFlags.log(`Setting track name for ${id}: ${name}`);
    // TODO: Implement via migration wrapper if needed
  }

  public setTrackPosition(id: string, x: number, y: number): void {
    migrationFlags.log(`Setting track position for ${id}: (${x}, ${y})`);
    // For new engine tracks, this should update instance positions
    if (migrationFlags.trackInstancesEnabled) {
      try {
        const instances = this.migrationWrapper.getTrackInstances(id);
        instances.forEach(instance => {
          this.migrationWrapper.updateInstancePosition(instance.instanceId, { x, y });
        });
      } catch (error) {
        // If track instances not available, this is a legacy track
        migrationFlags.debug(`Track ${id} position update failed, likely legacy track:`, error);
      }
    }
  }

  public setTrackSolo(id: string, soloed: boolean): void {
    migrationFlags.log(`Setting track solo for ${id}: ${soloed}`);
    // TODO: Implement solo functionality for new engine
    // For now, log the request
    console.warn('Track solo functionality not yet implemented for migrated tracks');
  }

  public setTrackTrim(trackId: string, trimStartTicks: number, trimEndTicks: number): void {
    migrationFlags.log(`Setting track trim for ${trackId}: ${trimStartTicks} - ${trimEndTicks}`);
    // Delegate to migration wrapper
    this.migrationWrapper.setTrackTrimStartTicks(trackId, trimStartTicks);
    this.migrationWrapper.setTrackTrimEndTicks(trackId, trimEndTicks);
  }

  public updateTrack(trackId: string, updatedTrack: any): void {
    migrationFlags.log(`Updating track ${trackId}`);
    // TODO: Implement comprehensive track updates via migration wrapper
    console.warn('updateTrack method needs implementation for migrated audio engine');
  }

  // =============================================================================
  // NEW INSTANCE-BASED METHODS (Only available when features enabled)
  // =============================================================================

  /**
   * Create a new instance of an existing track (SIMPLIFIED: position-only)
   * @param trackId - The ID of the track to instantiate
   * @param position - Position for the new instance
   * @returns The ID of the new instance
   */
  public async createTrackInstance(
    trackId: string, 
    position: { x: number; y: number }
  ): Promise<string> {
    if (!migrationFlags.trackInstancesEnabled) {
      throw new Error('Track instances are not enabled. Use window.audioMigration.enablePhase1() to enable.');
    }

    const instanceId = `${trackId}_instance_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    await this.migrationWrapper.createTrackInstance(trackId, instanceId, position);
    return instanceId;
  }

  /**
   * Remove a specific track instance
   */
  public async removeTrackInstance(instanceId: string): Promise<void> {
    if (!migrationFlags.trackInstancesEnabled) {
      throw new Error('Track instances are not enabled');
    }
    
    await this.migrationWrapper.removeTrackInstance(instanceId);
  }

  /**
   * Update the position of a track instance
   */
  public updateInstancePosition(instanceId: string, position: { x: number; y: number }): void {
    if (!migrationFlags.trackInstancesEnabled) {
      throw new Error('Track instances are not enabled');
    }
    
    this.migrationWrapper.updateInstancePosition(instanceId, position);
  }

  /**
   * Get all instances for a track
   */
  public getTrackInstances(trackId: string) {
    if (!migrationFlags.trackInstancesEnabled) {
      return [];
    }
    
    return this.migrationWrapper.getTrackInstances(trackId);
  }

  /**
   * Copy selected instances to clipboard (for copy/paste functionality)
   */
  public copyInstances(instanceIds: string[]): void {
    if (!migrationFlags.trackInstancesEnabled) {
      throw new Error('Track instances are not enabled');
    }
    
    migrationFlags.log(`Copying ${instanceIds.length} instances`);
    // TODO: Implement clipboard functionality
    console.warn('Copy instances functionality not yet implemented');
  }

  /**
   * Paste instances from clipboard at specified position
   */
  public async pasteInstances(position: { x: number; y: number }): Promise<string[]> {
    if (!migrationFlags.trackInstancesEnabled) {
      throw new Error('Track instances are not enabled');
    }
    
    migrationFlags.log(`Pasting instances at position (${position.x}, ${position.y})`);
    // TODO: Implement clipboard functionality
    console.warn('Paste instances functionality not yet implemented');
    return [];
  }

  // =============================================================================
  // DEBUGGING AND MIGRATION UTILITIES
  // =============================================================================

  public getMigrationStats() {
    return this.migrationWrapper.getMigrationStats();
  }

  public getEngineForTrack(trackId: string) {
    return this.migrationWrapper.getEngineForTrack(trackId);
  }

  public debugLogState(): void {
    const stats = this.getMigrationStats();
    console.log('AudioFilePlayer State:', {
      ...stats,
      migrationConfig: migrationFlags.getFullConfig()
    });
  }

  // =============================================================================
  // FEATURE FLAG CONVENIENCE METHODS
  // =============================================================================

  public enableInstanceFeatures(): void {
    migrationFlags.enablePhase1();
    console.log('✅ Track instance features enabled! You can now:');
    console.log('  - Create multiple instances of the same track');
    console.log('  - Copy and paste track segments');
    console.log('  - Use shared audio buffers for better performance');
  }

  public disableInstanceFeatures(): void {
    migrationFlags.disableAllFeatures();
    console.log('❌ Track instance features disabled. Using legacy audio engine only.');
  }

  public isUsingNewEngine(trackId?: string): boolean {
    if (trackId) {
      return this.migrationWrapper.getEngineForTrack(trackId) === 'refactored';
    }
    return migrationFlags.instanceBasedAudioEnabled;
  }
}

export default AudioFilePlayer;

// =============================================================================
// CONSOLE DEBUGGING UTILITIES
// =============================================================================

declare global {
  interface Window {
    audioEngine: AudioFilePlayer;
  }
}

if (typeof window !== 'undefined') {
  const audioEngine = AudioFilePlayer.getInstance();
  window.audioEngine = audioEngine;
  
  // Import and setup migration tests
  import('../tests/migrationTest').then(({ runMigrationTests }) => {
    window.runMigrationTests = runMigrationTests;
  });
  
  // Import circular dependency fix verification
  import('../tests/verifyFix').then(({ verifyCircularDependencyFix }) => {
    window.verifyCircularDependencyFix = verifyCircularDependencyFix;
  });
  
  // Add helpful console methods
  console.log('🎵 AudioEngine Migration Ready!');
  console.log('Use these commands to test the migration:');
  console.log('  window.verifyCircularDependencyFix() - Verify fix is working');
  console.log('  window.audioMigration.enablePhase1() - Enable track instances');
  console.log('  window.audioEngine.debugLogState() - Show current state');
  console.log('  window.audioEngine.getMigrationStats() - Get migration statistics');
  console.log('  window.runMigrationTests() - Run migration tests');
}