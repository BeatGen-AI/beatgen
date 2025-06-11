/**
 * Audio Engine Migration Feature Flags
 * 
 * Controls the gradual rollout of the new instance-based audio engine
 */

export interface MigrationConfig {
  // Core feature flags
  enableTrackInstances: boolean;
  enableInstanceBasedAudio: boolean;
  enableSharedAudioBuffers: boolean;
  
  // Debug flags
  logMigrationEvents: boolean;
  debugInstanceOperations: boolean;
  
  // Performance flags
  preloadSharedBuffers: boolean;
  batchInstanceUpdates: boolean;
}

// Default configuration - can be overridden by localStorage or environment
// MIGRATION COMPLETE: All features enabled by default
const DEFAULT_CONFIG: MigrationConfig = {
  enableTrackInstances: true,
  enableInstanceBasedAudio: true,
  enableSharedAudioBuffers: true,
  logMigrationEvents: true,
  debugInstanceOperations: true,
  preloadSharedBuffers: true,
  batchInstanceUpdates: true
};

class MigrationFlags {
  private static instance: MigrationFlags;
  private config: MigrationConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): MigrationFlags {
    if (!MigrationFlags.instance) {
      MigrationFlags.instance = new MigrationFlags();
    }
    return MigrationFlags.instance;
  }

  private loadConfig(): MigrationConfig {
    try {
      // Check localStorage for overrides
      const stored = localStorage.getItem('audio_engine_migration_config');
      if (stored) {
        const storedConfig = JSON.parse(stored);
        return { ...DEFAULT_CONFIG, ...storedConfig };
      }

      // Check environment variables
      const envConfig: Partial<MigrationConfig> = {};
      
      if (process.env.REACT_APP_ENABLE_TRACK_INSTANCES === 'true') {
        envConfig.enableTrackInstances = true;
      }
      
      if (process.env.REACT_APP_ENABLE_INSTANCE_AUDIO === 'true') {
        envConfig.enableInstanceBasedAudio = true;
      }

      if (process.env.REACT_APP_ENABLE_SHARED_BUFFERS === 'true') {
        envConfig.enableSharedAudioBuffers = true;
      }

      return { ...DEFAULT_CONFIG, ...envConfig };
    } catch (error) {
      console.warn('Failed to load migration config, using defaults:', error);
      return DEFAULT_CONFIG;
    }
  }

  // Getters for feature flags
  public get trackInstancesEnabled(): boolean {
    return this.config.enableTrackInstances;
  }

  public get instanceBasedAudioEnabled(): boolean {
    return this.config.enableInstanceBasedAudio;
  }

  public get sharedAudioBuffersEnabled(): boolean {
    return this.config.enableSharedAudioBuffers;
  }

  public get migrationLoggingEnabled(): boolean {
    return this.config.logMigrationEvents;
  }

  public get debugInstanceOperations(): boolean {
    return this.config.debugInstanceOperations;
  }

  public get preloadSharedBuffers(): boolean {
    return this.config.preloadSharedBuffers;
  }

  public get batchInstanceUpdates(): boolean {
    return this.config.batchInstanceUpdates;
  }

  // Methods to update config
  public updateConfig(updates: Partial<MigrationConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    
    if (this.migrationLoggingEnabled) {
      console.log('Migration config updated:', updates);
    }
  }

  public enableFeature(feature: keyof MigrationConfig): void {
    this.updateConfig({ [feature]: true });
  }

  public disableFeature(feature: keyof MigrationConfig): void {
    this.updateConfig({ [feature]: false });
  }

  private saveConfig(): void {
    try {
      localStorage.setItem('audio_engine_migration_config', JSON.stringify(this.config));
    } catch (error) {
      console.warn('Failed to save migration config:', error);
    }
  }

  public getFullConfig(): MigrationConfig {
    return { ...this.config };
  }

  public resetToDefaults(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig();
    console.log('Migration config reset to defaults');
  }

  // Convenience methods for common migration scenarios
  public enablePhase1(): void {
    this.updateConfig({
      enableTrackInstances: true,
      enableInstanceBasedAudio: true,
      enableSharedAudioBuffers: true
    });
    console.log('Migration Phase 1 enabled: Basic track instances');
  }

  public enableFullMigration(): void {
    this.updateConfig({
      enableTrackInstances: true,
      enableInstanceBasedAudio: true,
      enableSharedAudioBuffers: true,
      preloadSharedBuffers: true,
      batchInstanceUpdates: true
    });
    console.log('Full migration enabled: All features active');
  }

  public disableAllFeatures(): void {
    this.updateConfig({
      enableTrackInstances: false,
      enableInstanceBasedAudio: false,
      enableSharedAudioBuffers: false
    });
    console.log('All migration features disabled: Using legacy audio engine');
  }

  // Debug logging helper
  public log(message: string, ...args: any[]): void {
    if (this.migrationLoggingEnabled) {
      console.log(`[AudioMigration] ${message}`, ...args);
    }
  }

  public debug(message: string, ...args: any[]): void {
    if (this.debugInstanceOperations) {
      console.debug(`[AudioMigration Debug] ${message}`, ...args);
    }
  }
}

export default MigrationFlags;

// Convenience export for easy access
export const migrationFlags = MigrationFlags.getInstance();

// Export utility functions for console debugging
declare global {
  interface Window {
    audioMigration: {
      enablePhase1: () => void;
      enableFull: () => void;
      disable: () => void;
      getConfig: () => MigrationConfig;
      updateConfig: (updates: Partial<MigrationConfig>) => void;
    };
  }
}

// Add debugging utilities to window for easy testing
if (typeof window !== 'undefined') {
  window.audioMigration = {
    enablePhase1: () => migrationFlags.enablePhase1(),
    enableFull: () => migrationFlags.enableFullMigration(),
    disable: () => migrationFlags.disableAllFeatures(),
    getConfig: () => migrationFlags.getFullConfig(),
    updateConfig: (updates) => migrationFlags.updateConfig(updates)
  };
}