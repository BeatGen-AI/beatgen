import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Verify Actual Track Instance Functionality', () => {
  test('should verify what actually works vs what needs fixing', async ({ page }) => {
    console.log('🔍 REALITY CHECK: What actually works?');
    
    // Capture console messages
    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' && !text.includes('Failed to load resource')) {
        consoleErrors.push(text);
        console.log(`🔴 Browser Error: ${text}`);
      } else if (
        text.includes('📋') || text.includes('TrackInstance') || 
        text.includes('TIMELINE') || text.includes('🎵')
      ) {
        consoleLogs.push(text);
        console.log(`🌐 Browser Log: ${text}`);
      }
    });
    
    // Step 1: Setup
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    // Step 2: Create track and instances
    console.log('🔍 STEP 1: Creating track and instances');
    const result = await page.evaluate(async () => {
      const store = window.useStudioStore.getState();
      
      // Create track
      await store.handleAddTrack('MIDI', {
        instrumentId: 'piano',
        instrumentName: 'Grand Piano'
      });
      
      // Select and copy
      store.selectAllTracks();
      store.copySelectedTracks();
      
      // Paste instance
      store.pasteTracksAtPosition(400, 200);
      
      return {
        tracksLength: store.tracks?.length || 0,
        trackInstancesSize: store.getTrackInstancesSize ? store.getTrackInstancesSize() : 0,
        instances: store.getAllInstances ? store.getAllInstances() : []
      };
    });
    
    console.log('🔍 Creation result:', JSON.stringify(result, null, 2));
    
    // Step 3: Check DOM elements
    const domAnalysis = await page.evaluate(() => {
      const tracks = Array.from(document.querySelectorAll('[data-track-id]'));
      const instances = Array.from(document.querySelectorAll('[data-track-instance-id]'));
      
      const trackData = tracks.map(el => {
        const rect = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-track-id'),
          type: el.getAttribute('data-track-type'),
          selected: el.getAttribute('data-selected'),
          visible: rect.width > 0 && rect.height > 0,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          styles: {
            display: window.getComputedStyle(el).display,
            visibility: window.getComputedStyle(el).visibility,
            opacity: window.getComputedStyle(el).opacity
          }
        };
      });
      
      const instanceData = instances.map(el => {
        const rect = el.getBoundingClientRect();
        return {
          instanceId: el.getAttribute('data-track-instance-id'),
          trackId: el.getAttribute('data-track-id'),
          type: el.getAttribute('data-track-type'),
          visible: rect.width > 0 && rect.height > 0,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          styles: {
            display: window.getComputedStyle(el).display,
            visibility: window.getComputedStyle(el).visibility,
            opacity: window.getComputedStyle(el).opacity
          }
        };
      });
      
      return { tracks: trackData, instances: instanceData };
    });
    
    console.log('🔍 STEP 2: DOM Analysis');
    console.log('Tracks:', JSON.stringify(domAnalysis.tracks, null, 2));
    console.log('Instances:', JSON.stringify(domAnalysis.instances, null, 2));
    
    // Step 4: Check backend integration
    console.log('🔍 STEP 3: Checking backend errors');
    const backendErrors = consoleErrors.filter(error => 
      error.includes('404') || error.includes('backend') || error.includes('API')
    );
    
    if (backendErrors.length > 0) {
      console.log('🔴 Backend integration issues:');
      backendErrors.forEach(error => console.log(`  - ${error}`));
    } else {
      console.log('✅ No backend errors detected');
    }
    
    // Step 5: Test manual visibility fix
    console.log('🔍 STEP 4: Testing manual visibility fix');
    const visibilityTest = await page.evaluate(() => {
      const instances = document.querySelectorAll('[data-track-instance-id]');
      let fixedCount = 0;
      
      instances.forEach(instance => {
        const el = instance as HTMLElement;
        
        // Try to make element visible
        el.style.minWidth = '100px';
        el.style.minHeight = '50px';
        el.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
        el.style.border = '1px solid #2196f3';
        
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          fixedCount++;
        }
      });
      
      return { totalInstances: instances.length, fixedCount };
    });
    
    console.log('🔍 Visibility fix result:', visibilityTest);
    
    // Step 6: Test interaction after visibility fix
    if (visibilityTest.fixedCount > 0) {
      console.log('🔍 STEP 5: Testing interaction with visible elements');
      try {
        await page.locator('[data-track-instance-id]').first().click();
        console.log('✅ Click interaction works after visibility fix');
      } catch (e) {
        console.log('❌ Click still fails:', e.message);
      }
    }
    
    // Step 7: Audio capability check
    const audioCheck = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      return {
        hasAudioEngine: !!store.store,
        isInitialized: store.isInitialized,
        hasPlayMethod: typeof store.playPause === 'function',
        currentState: {
          isPlaying: store.isPlaying,
          currentTime: store.currentTime
        }
      };
    });
    
    console.log('🔍 STEP 6: Audio capabilities:', JSON.stringify(audioCheck, null, 2));
    
    // Step 8: Final assessment
    console.log('🔍 FINAL ASSESSMENT:');
    console.log('========================');
    
    const assessment = {
      storeIntegration: result.trackInstancesSize > 0,
      domRendering: domAnalysis.instances.length > 0,
      visualVisibility: domAnalysis.instances.some(i => i.visible),
      backendIntegration: backendErrors.length === 0,
      audioCapabilities: audioCheck.hasPlayMethod && audioCheck.isInitialized,
      interactionPossible: visibilityTest.fixedCount > 0
    };
    
    Object.entries(assessment).forEach(([feature, working]) => {
      console.log(`${working ? '✅' : '❌'} ${feature}: ${working}`);
    });
    
    console.log('🔍 KEY ISSUES IDENTIFIED:');
    if (!assessment.visualVisibility) {
      console.log('❌ CRITICAL: Track instances are invisible (0x0 size)');
    }
    if (!assessment.backendIntegration) {
      console.log('❌ CRITICAL: Backend API calls failing');
    }
    if (!assessment.audioCapabilities) {
      console.log('❌ Audio engine not properly initialized');
    }
    
    console.log('🔍 WORKING FEATURES:');
    if (assessment.storeIntegration) {
      console.log('✅ Frontend store and state management');
    }
    if (assessment.domRendering) {
      console.log('✅ DOM element creation and rendering');
    }
    if (assessment.interactionPossible) {
      console.log('✅ Elements can be made interactive with CSS fixes');
    }
    
    // Test passes if basic functionality works
    expect(assessment.storeIntegration).toBe(true);
    expect(assessment.domRendering).toBe(true);
  });
});