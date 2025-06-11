import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Debug Keyboard Handlers', () => {
  test('should debug keyboard handler activation and stability', async ({ page }) => {
    console.log('🔍 DEBUG: Checking keyboard handler activation and function references');
    
    // Capture all console messages, especially keyboard-related ones
    const consoleErrors: string[] = [];
    const consoleLogs: string[] = [];
    
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' && !text.includes('Failed to load resource') && !text.includes('422')) {
        consoleErrors.push(text);
        console.log(`🔴 Browser Error: ${text}`);
      } else if (
        text.includes('🎹') || text.includes('⌨️') || text.includes('KEYBOARD') ||
        text.includes('📋') || text.includes('🔄') || text.includes('COPY') || 
        text.includes('PASTE') || text.includes('selectedTracks') || text.includes('copiedTracks') ||
        text.includes('useEffect') || text.includes('Dependencies') || text.includes('event listener')
      ) {
        consoleLogs.push(text);
        console.log(`🌐 Browser Log: ${text}`);
      }
    });
    
    // Step 1: Login and navigate to studio
    console.log('🔍 STEP 1: Login and navigate to studio');
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    // Step 2: Wait for store to be fully initialized
    console.log('🔍 STEP 2: Waiting for store initialization');
    await page.waitForTimeout(2000);
    
    // Step 3: Check if keyboard handler logs appeared
    const keyboardHandlerLogs = consoleLogs.filter(log => log.includes('🎹 KEYBOARD HANDLER'));
    console.log(`🔍 STEP 3: Found ${keyboardHandlerLogs.length} keyboard handler initialization logs`);
    
    if (keyboardHandlerLogs.length > 0) {
      console.log('✅ Keyboard handler useEffect ran:');
      keyboardHandlerLogs.forEach(log => console.log(`  - ${log}`));
    } else {
      console.log('❌ No keyboard handler initialization logs found');
    }
    
    // Step 4: Check store state directly
    const storeAnalysis = await page.evaluate(() => {
      const win = window as any;
      if (win.useStudioStore) {
        const state = win.useStudioStore.getState();
        return {
          hasSelectedTracks: !!state.selectedTracks,
          selectedTracksSize: state.selectedTracks?.size || 0,
          hasCopiedTracks: Array.isArray(state.copiedTracks),
          copiedTracksLength: state.copiedTracks?.length || 0,
          hasTracksArray: Array.isArray(state.tracks),
          tracksLength: state.tracks?.length || 0,
          hasCopyFunction: typeof state.copySelectedTracks === 'function',
          hasPasteFunction: typeof state.pasteTracksAtPosition === 'function',
          hasCanPasteFunction: typeof state.canPaste === 'function',
          hasSelectAllFunction: typeof state.selectAllTracks === 'function',
          hasClearSelectionFunction: typeof state.clearSelection === 'function',
        };
      }
      return { error: 'Store not found' };
    });
    
    console.log('🔍 STEP 4: Store analysis:');
    Object.entries(storeAnalysis).forEach(([key, value]) => {
      console.log(`  - ${key}: ${value}`);
    });
    
    // Step 5: Try creating a track to ensure the environment is ready
    console.log('🔍 STEP 5: Creating a track to trigger store updates');
    try {
      await page.click('button:has-text("Add Track")');
      await page.waitForTimeout(500);
      await page.click('text=Virtual Instrument');
      await page.waitForTimeout(500);
      await page.click('text=Grand Piano');
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('⚠️ Track creation failed, but continuing');
    }
    
    // Step 6: Check for additional keyboard handler logs after track creation
    const additionalKeyboardLogs = consoleLogs.filter(log => 
      log.includes('🎹 KEYBOARD HANDLER') && !keyboardHandlerLogs.includes(log)
    );
    
    if (additionalKeyboardLogs.length > 0) {
      console.log('🔍 STEP 6: Additional keyboard handler logs after track creation:');
      additionalKeyboardLogs.forEach(log => console.log(`  - ${log}`));
    }
    
    // Step 7: Force test keyboard events with specific focus
    console.log('🔍 STEP 7: Testing keyboard events with explicit focus');
    
    // Focus on the main studio container
    await page.focus('body');
    await page.waitForTimeout(500);
    
    // Test Ctrl+A first (should be easiest to detect)
    console.log('🔍 Testing Ctrl+A...');
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(1000);
    
    // Check for Ctrl+A logs
    const ctrlALogs = consoleLogs.filter(log => log.includes('Ctrl+A pressed'));
    if (ctrlALogs.length > 0) {
      console.log('✅ Ctrl+A keyboard event detected!');
      ctrlALogs.forEach(log => console.log(`  - ${log}`));
    } else {
      console.log('❌ Ctrl+A keyboard event NOT detected');
    }
    
    // Test Ctrl+C
    console.log('🔍 Testing Ctrl+C...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1000);
    
    // Check for Ctrl+C logs
    const ctrlCLogs = consoleLogs.filter(log => log.includes('Ctrl+C pressed'));
    if (ctrlCLogs.length > 0) {
      console.log('✅ Ctrl+C keyboard event detected!');
      ctrlCLogs.forEach(log => console.log(`  - ${log}`));
    } else {
      console.log('❌ Ctrl+C keyboard event NOT detected');
    }
    
    // Test Ctrl+V
    console.log('🔍 Testing Ctrl+V...');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    // Check for Ctrl+V logs
    const ctrlVLogs = consoleLogs.filter(log => log.includes('Ctrl+V pressed'));
    if (ctrlVLogs.length > 0) {
      console.log('✅ Ctrl+V keyboard event detected!');
      ctrlVLogs.forEach(log => console.log(`  - ${log}`));
    } else {
      console.log('❌ Ctrl+V keyboard event NOT detected');
    }
    
    // Step 8: Final analysis
    console.log('🔍 FINAL ANALYSIS:');
    console.log(`  - Keyboard handler initialization logs: ${keyboardHandlerLogs.length}`);
    console.log(`  - Total keyboard-related logs: ${consoleLogs.filter(l => l.includes('🎹') || l.includes('⌨️')).length}`);
    console.log(`  - Ctrl+A detected: ${ctrlALogs.length > 0}`);
    console.log(`  - Ctrl+C detected: ${ctrlCLogs.length > 0}`);
    console.log(`  - Ctrl+V detected: ${ctrlVLogs.length > 0}`);
    console.log(`  - Store functions available: ${storeAnalysis.hasCopyFunction && storeAnalysis.hasPasteFunction}`);
    console.log(`  - Console errors: ${consoleErrors.length}`);
    
    // Print all keyboard-related logs for debugging
    if (consoleLogs.length > 0) {
      console.log('🔍 All keyboard-related logs:');
      consoleLogs.forEach((log, index) => console.log(`  ${index + 1}. ${log}`));
    }
    
    // Test should pass if no critical errors
    expect(consoleErrors.length).toBeLessThan(5); // Allow some minor errors
  });
});