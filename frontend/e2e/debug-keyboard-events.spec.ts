import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Debug Keyboard Events', () => {
  test('should test if keyboard events are actually being captured by handlers', async ({ page }) => {
    console.log('⌨️ DEBUG: Testing keyboard event capture');
    
    // Capture all console messages
    const consoleErrors: string[] = [];
    const consoleLogs: string[] = [];
    
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' && !text.includes('Failed to load resource') && !text.includes('422')) {
        consoleErrors.push(text);
        console.log(`🔴 Browser Error: ${text}`);
      } else {
        consoleLogs.push(text);
        console.log(`🌐 Browser Log: ${text}`);
      }
    });
    
    // Step 1: Login and navigate to studio
    console.log('⌨️ STEP 1: Login and navigate to studio');
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(5000);
    
    // Step 2: Wait and check for store exposure
    console.log('⌨️ STEP 2: Checking store exposure');
    const storeExposed = await page.evaluate(() => {
      return {
        hasUseStudioStore: 'useStudioStore' in window,
        hasStudioStore: 'studioStore' in window,
        windowKeys: Object.keys(window).filter(k => k.includes('studio') || k.includes('Store'))
      };
    });
    console.log('⌨️ Store exposure:', JSON.stringify(storeExposed, null, 2));
    
    // Step 3: Add event listener test
    console.log('⌨️ STEP 3: Adding test event listener');
    await page.evaluate(() => {
      // Add a test event listener to see if ANY keyboard events are being captured
      window.addEventListener('keydown', (e) => {
        console.log(`🧪 TEST EVENT LISTENER - Key pressed: ${e.key}, ctrl: ${e.ctrlKey}, meta: ${e.metaKey}`);
      });
      console.log('🧪 Test event listener added');
    });
    
    // Step 4: Try different keyboard methods
    console.log('⌨️ STEP 4: Testing different keyboard event methods');
    
    // Method 1: Direct page.keyboard
    console.log('⌨️ Method 1: page.keyboard.press');
    await page.focus('body');
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(500);
    
    // Method 2: Using page.keyboard.down/up
    console.log('⌨️ Method 2: page.keyboard.down/up');
    await page.keyboard.down('Control');
    await page.keyboard.press('c');
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);
    
    // Method 3: Dispatch event directly
    console.log('⌨️ Method 3: dispatchEvent');
    await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'v',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);
      console.log('🧪 Dispatched Ctrl+V event directly');
    });
    await page.waitForTimeout(500);
    
    // Step 5: Check if any keyboard events were captured
    const keyboardEventLogs = consoleLogs.filter(log => 
      log.includes('🧪 TEST EVENT LISTENER') || 
      log.includes('⌨️ KEYBOARD') ||
      log.includes('Key pressed')
    );
    
    console.log(`⌨️ STEP 5: Keyboard event logs captured: ${keyboardEventLogs.length}`);
    if (keyboardEventLogs.length > 0) {
      console.log('⌨️ Keyboard events detected:');
      keyboardEventLogs.forEach((log, index) => console.log(`  ${index + 1}. ${log}`));
    } else {
      console.log('❌ No keyboard events detected');
    }
    
    // Step 6: Check store state after events
    const storeState = await page.evaluate(() => {
      const win = window as any;
      if (win.useStudioStore) {
        try {
          const state = win.useStudioStore.getState();
          return {
            selectedTracksSize: state.selectedTracks?.size || 0,
            copiedTracksLength: state.copiedTracks?.length || 0,
            tracksLength: state.tracks?.length || 0,
            trackInstancesSize: state.trackInstances?.size || 0,
            functions: {
              copySelectedTracks: typeof state.copySelectedTracks,
              pasteTracksAtPosition: typeof state.pasteTracksAtPosition,
              canPaste: typeof state.canPaste,
              selectAllTracks: typeof state.selectAllTracks
            }
          };
        } catch (e) {
          return { error: e.message };
        }
      }
      return { storeNotFound: true };
    });
    
    console.log('⌨️ STEP 6: Store state after keyboard events:');
    console.log(JSON.stringify(storeState, null, 2));
    
    // Step 7: Test manual function calls
    console.log('⌨️ STEP 7: Testing manual function calls');
    const manualCallResults = await page.evaluate(() => {
      const win = window as any;
      if (win.useStudioStore) {
        try {
          const state = win.useStudioStore.getState();
          
          // Try calling functions directly
          console.log('🧪 Manual call: selectAllTracks()');
          state.selectAllTracks();
          
          console.log('🧪 Manual call: copySelectedTracks()');
          state.copySelectedTracks();
          
          console.log('🧪 Manual call: pasteTracksAtPosition(300, 150)');
          state.pasteTracksAtPosition(300, 150);
          
          return { success: true, message: 'Manual function calls completed' };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
      return { success: false, error: 'Store not found' };
    });
    
    console.log('⌨️ Manual call results:', JSON.stringify(manualCallResults, null, 2));
    await page.waitForTimeout(2000);
    
    // Step 8: Check for track instances after manual calls
    const finalInstanceCount = await page.locator('[data-track-instance-id]').count();
    console.log(`⌨️ STEP 8: Track instances after manual calls: ${finalInstanceCount}`);
    
    // Step 9: Final analysis
    const finalLogs = consoleLogs.filter(log => 
      log.includes('📋') || log.includes('🔄') || log.includes('COPY') || 
      log.includes('PASTE') || log.includes('createTrackInstance') ||
      log.includes('Manual call')
    );
    
    console.log('⌨️ FINAL ANALYSIS:');
    console.log(`  - Store exposed: ${storeExposed.hasUseStudioStore}`);
    console.log(`  - Keyboard events captured: ${keyboardEventLogs.length > 0}`);
    console.log(`  - Manual function calls: ${manualCallResults.success}`);
    console.log(`  - Copy/paste activity: ${finalLogs.length}`);
    console.log(`  - Track instances created: ${finalInstanceCount}`);
    console.log(`  - Console errors: ${consoleErrors.length}`);
    
    if (finalLogs.length > 0) {
      console.log('⌨️ Copy/paste activity logs:');
      finalLogs.forEach((log, index) => console.log(`  ${index + 1}. ${log}`));
    }
    
    // Test should pass if we can at least call functions manually
    expect(manualCallResults.success).toBe(true);
  });
});