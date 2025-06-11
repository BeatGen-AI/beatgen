/**
 * Verification Test for Circular Dependency Fix
 * 
 * This test verifies that the circular dependency issue between 
 * AudioFilePlayer and AudioEngineMigrationWrapper has been resolved.
 */

import AudioFilePlayer from '../audioFilePlayer/audioEngine';
import AudioEngineMigrationWrapper from '../AudioEngineMigrationWrapper';
import { migrationFlags } from '../migration';

export class CircularDependencyVerification {
  
  /**
   * Test 1: Verify AudioFilePlayer can be instantiated without errors
   */
  async testAudioFilePlayerInstantiation(): Promise<boolean> {
    console.log('🧪 Test: AudioFilePlayer instantiation...');
    
    try {
      const audioEngine = AudioFilePlayer.getInstance();
      console.log('✅ AudioFilePlayer instantiated successfully');
      
      // Test that it has the expected methods
      const hasCreateTrack = typeof audioEngine.createTrack === 'function';
      const hasGetMigrationStats = typeof audioEngine.getMigrationStats === 'function';
      
      if (!hasCreateTrack || !hasGetMigrationStats) {
        console.error('❌ AudioFilePlayer missing expected methods');
        return false;
      }
      
      console.log('✅ AudioFilePlayer has expected interface');
      return true;
    } catch (error) {
      console.error('❌ AudioFilePlayer instantiation failed:', error);
      return false;
    }
  }

  /**
   * Test 2: Verify AudioEngineMigrationWrapper can be instantiated without errors
   */
  async testMigrationWrapperInstantiation(): Promise<boolean> {
    console.log('🧪 Test: AudioEngineMigrationWrapper instantiation...');
    
    try {
      const wrapper = AudioEngineMigrationWrapper.getInstance();
      console.log('✅ AudioEngineMigrationWrapper instantiated successfully');
      
      // Test that it has the expected methods
      const hasCreateTrack = typeof wrapper.createTrack === 'function';
      const hasCreateTrackInstance = typeof wrapper.createTrackInstance === 'function';
      
      if (!hasCreateTrack || !hasCreateTrackInstance) {
        console.error('❌ AudioEngineMigrationWrapper missing expected methods');
        return false;
      }
      
      console.log('✅ AudioEngineMigrationWrapper has expected interface');
      return true;
    } catch (error) {
      console.error('❌ AudioEngineMigrationWrapper instantiation failed:', error);
      return false;
    }
  }

  /**
   * Test 3: Verify both can work together through initialization
   */
  async testCrossInitialization(): Promise<boolean> {
    console.log('🧪 Test: Cross-initialization without circular dependency...');
    
    try {
      const audioEngine = AudioFilePlayer.getInstance();
      await audioEngine.initialize();
      console.log('✅ AudioFilePlayer initialized successfully');
      
      const stats = audioEngine.getMigrationStats();
      console.log('✅ Migration stats retrieved:', stats);
      
      return true;
    } catch (error) {
      console.error('❌ Cross-initialization failed:', error);
      return false;
    }
  }

  /**
   * Test 4: Verify feature flag toggling works
   */
  async testFeatureFlagSystem(): Promise<boolean> {
    console.log('🧪 Test: Feature flag system...');
    
    try {
      // Test disabling all features
      migrationFlags.disableAllFeatures();
      const disabledConfig = migrationFlags.getFullConfig();
      
      if (disabledConfig.enableTrackInstances || disabledConfig.enableInstanceBasedAudio) {
        console.error('❌ Features should be disabled');
        return false;
      }
      
      // Test enabling Phase 1
      migrationFlags.enablePhase1();
      const enabledConfig = migrationFlags.getFullConfig();
      
      if (!enabledConfig.enableTrackInstances || !enabledConfig.enableInstanceBasedAudio) {
        console.error('❌ Phase 1 features should be enabled');
        return false;
      }
      
      console.log('✅ Feature flag system working correctly');
      return true;
    } catch (error) {
      console.error('❌ Feature flag system test failed:', error);
      return false;
    }
  }

  /**
   * Test 5: Verify basic track creation works without circular dependency
   */
  async testBasicTrackCreation(): Promise<boolean> {
    console.log('🧪 Test: Basic track creation...');
    
    try {
      const audioEngine = AudioFilePlayer.getInstance();
      
      // Test legacy track creation
      migrationFlags.disableAllFeatures();
      const legacyTrack = await audioEngine.createTrack('test_legacy', 'Test Legacy Track');
      console.log('✅ Legacy track created successfully:', legacyTrack);
      
      // Clean up
      audioEngine.removeTrack('test_legacy');
      
      return true;
    } catch (error) {
      console.error('❌ Basic track creation failed:', error);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Circular Dependency Fix Verification...');
    console.log('============================================');
    
    const results = [
      await this.testAudioFilePlayerInstantiation(),
      await this.testMigrationWrapperInstantiation(),
      await this.testCrossInitialization(),
      await this.testFeatureFlagSystem(),
      await this.testBasicTrackCreation()
    ];
    
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    console.log('============================================');
    console.log(`🎯 Verification Results: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 CIRCULAR DEPENDENCY FIX VERIFIED! ✅');
      console.log('   - AudioFilePlayer and AudioEngineMigrationWrapper work correctly');
      console.log('   - No initialization errors or circular dependencies');
      console.log('   - Feature flag system operational');
      console.log('   - Basic track creation functional');
    } else {
      console.log('⚠️  Some verification tests failed. Check the detailed output above.');
    }
    
    // Reset to safe state
    migrationFlags.disableAllFeatures();
  }
}

// Export verification function for console access
export function verifyCircularDependencyFix() {
  const verifier = new CircularDependencyVerification();
  return verifier.runAllTests();
}

// Add to window for easy browser console access
declare global {
  interface Window {
    verifyCircularDependencyFix: () => Promise<void>;
    circularDependencyVerifier: CircularDependencyVerification;
  }
}

if (typeof window !== 'undefined') {
  const verifier = new CircularDependencyVerification();
  window.circularDependencyVerifier = verifier;
  window.verifyCircularDependencyFix = () => verifier.runAllTests();
  
  console.log('🔧 Circular Dependency Fix Verification Available!');
  console.log('Run: window.verifyCircularDependencyFix()');
}