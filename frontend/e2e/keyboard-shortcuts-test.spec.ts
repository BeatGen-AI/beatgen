import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Keyboard Shortcuts for Track Instances', () => {
  test('should create track instances using Ctrl+C and Ctrl+V keyboard shortcuts', async ({ page }) => {
    console.log('⌨️ KEYBOARD TEST: Testing Ctrl+C and Ctrl+V for track instances');
    
    // Capture console messages for debugging
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('📋') || text.includes('TrackInstance') || text.includes('🎵')) {
        consoleLogs.push(text);
        console.log(`🌐 Browser Log: ${text}`);
      }
    });
    
    // Step 1: Login and navigate to studio
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    // Step 2: Create a track
    console.log('⌨️ STEP 1: Creating a track');
    await page.evaluate(async () => {
      const store = window.useStudioStore.getState();
      await store.handleAddTrack('MIDI', {
        instrumentId: 'piano',
        instrumentName: 'Grand Piano'
      });
    });
    await page.waitForTimeout(2000);
    
    // Step 3: Select the track by clicking on it
    console.log('⌨️ STEP 2: Selecting track');
    const trackElements = await page.locator('[data-track-id]').count();
    console.log(`Found ${trackElements} track elements`);
    
    if (trackElements > 0) {
      // Click on the first track to select it
      await page.locator('[data-track-id]').first().click();
      await page.waitForTimeout(500);
    }
    
    // Verify track is selected
    const selectionState = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      return {
        selectedTracksSize: store.selectedTracks?.size || 0,
        selectedTracks: Array.from(store.selectedTracks || [])
      };
    });
    console.log('⌨️ Selection state:', JSON.stringify(selectionState));
    
    // Step 4: Test Ctrl+C (Copy)
    console.log('⌨️ STEP 3: Testing Ctrl+C keyboard shortcut');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1000);
    
    // Verify tracks were copied
    const copyState = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      return {
        copiedTracksLength: store.copiedTracks?.length || 0,
        copiedTracks: store.copiedTracks || [],
        canPaste: store.canPaste ? store.canPaste() : false
      };
    });
    console.log('⌨️ Copy state after Ctrl+C:', JSON.stringify(copyState));
    
    // Step 5: Position mouse and test Ctrl+V (Paste)
    console.log('⌨️ STEP 4: Testing Ctrl+V keyboard shortcut');
    
    // Move mouse to a position where we want to paste
    await page.mouse.move(400, 250);
    await page.waitForTimeout(500);
    
    // Trigger Ctrl+V
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(2000);
    
    // Step 6: Verify track instances were created
    const instanceState = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      return {
        trackInstancesSize: store.getTrackInstancesSize ? store.getTrackInstancesSize() : 0,
        instances: store.getAllInstances ? store.getAllInstances() : [],
        tracksLength: store.tracks?.length || 0
      };
    });
    
    console.log('⌨️ Instance state after Ctrl+V:', JSON.stringify(instanceState, null, 2));
    
    // Step 7: Test multiple pastes
    console.log('⌨️ STEP 5: Testing multiple paste operations');
    
    // Paste at different positions
    await page.mouse.move(600, 300);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    await page.mouse.move(800, 200);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    // Final verification
    const finalState = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      return {
        trackInstancesSize: store.getTrackInstancesSize ? store.getTrackInstancesSize() : 0,
        instances: store.getAllInstances ? store.getAllInstances() : [],
        tracksLength: store.tracks?.length || 0
      };
    });
    
    console.log('⌨️ Final state after multiple pastes:', JSON.stringify(finalState, null, 2));
    
    // Step 8: Verify DOM elements
    const domInstanceCount = await page.locator('[data-track-instance-id]').count();
    const domTrackCount = await page.locator('[data-track-id]').count();
    
    console.log(`⌨️ DOM verification - Tracks: ${domTrackCount}, Instances: ${domInstanceCount}`);
    
    // Step 9: Test keyboard shortcuts functionality assessment
    const keyboardFunctionality = {
      copyWorking: copyState.copiedTracksLength > 0,
      pasteWorking: instanceState.trackInstancesSize > 0,
      multipleInstances: finalState.trackInstancesSize >= 3,
      domRendering: domInstanceCount > 0,
      storeIntegration: finalState.trackInstancesSize === finalState.instances.length
    };
    
    console.log('⌨️ KEYBOARD SHORTCUTS ASSESSMENT:');
    Object.entries(keyboardFunctionality).forEach(([feature, working]) => {
      console.log(`  ${working ? '✅' : '❌'} ${feature}: ${working}`);
    });
    
    // Test assertions
    expect(keyboardFunctionality.copyWorking).toBe(true);
    expect(keyboardFunctionality.pasteWorking).toBe(true);
    expect(keyboardFunctionality.multipleInstances).toBe(true);
    expect(keyboardFunctionality.domRendering).toBe(true);
    expect(keyboardFunctionality.storeIntegration).toBe(true);
    
    console.log('✅ All keyboard shortcut tests passed!');
  });
  
  test('should handle keyboard shortcuts with different selection states', async ({ page }) => {
    console.log('⌨️ ADVANCED KEYBOARD TEST: Testing edge cases');
    
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    // Create multiple tracks
    console.log('⌨️ Creating multiple tracks');
    for (let i = 0; i < 3; i++) {
      await page.evaluate(async (index) => {
        const store = window.useStudioStore.getState();
        await store.handleAddTrack('MIDI', {
          instrumentId: 'piano',
          instrumentName: `Grand Piano ${index + 1}`
        });
      }, i);
      await page.waitForTimeout(1000);
    }
    
    // Test 1: Copy with no selection
    console.log('⌨️ Test 1: Copy with no selection');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);
    
    const noSelectionCopy = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      return store.copiedTracks?.length || 0;
    });
    console.log(`⌨️ Copy with no selection result: ${noSelectionCopy} tracks copied`);
    
    // Test 2: Select all and copy
    console.log('⌨️ Test 2: Select all tracks and copy');
    await page.keyboard.press('Control+a'); // Assuming Ctrl+A selects all tracks
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);
    
    const selectAllCopy = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      return {
        selectedCount: store.selectedTracks?.size || 0,
        copiedCount: store.copiedTracks?.length || 0
      };
    });
    console.log(`⌨️ Select all and copy result:`, selectAllCopy);
    
    // Test 3: Paste without valid mouse position
    console.log('⌨️ Test 3: Paste at different positions');
    const positions = [
      { x: 100, y: 100 },
      { x: 500, y: 150 },
      { x: 900, y: 200 }
    ];
    
    for (const pos of positions) {
      await page.mouse.move(pos.x, pos.y);
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(1000);
    }
    
    // Final verification
    const advancedTestResult = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      return {
        totalInstances: store.getTrackInstancesSize ? store.getTrackInstancesSize() : 0,
        instances: store.getAllInstances ? store.getAllInstances() : []
      };
    });
    
    console.log('⌨️ Advanced test final result:', JSON.stringify(advancedTestResult, null, 2));
    
    // Should have created multiple instances
    expect(advancedTestResult.totalInstances).toBeGreaterThan(0);
    
    console.log('✅ Advanced keyboard shortcut tests completed!');
  });
});