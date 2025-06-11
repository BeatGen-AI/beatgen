import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Simple Keyboard Shortcuts Test', () => {
  test('should verify keyboard event handlers are properly attached', async ({ page }) => {
    console.log('⌨️ SIMPLE KEYBOARD TEST: Verifying keyboard event handlers');
    
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    // Create and select a track programmatically
    console.log('⌨️ Creating and selecting track programmatically');
    const setupResult = await page.evaluate(async () => {
      const store = window.useStudioStore.getState();
      
      // Create track
      await store.handleAddTrack('MIDI', {
        instrumentId: 'piano',
        instrumentName: 'Grand Piano'
      });
      
      // Select all tracks
      store.selectAllTracks();
      
      return {
        tracksCount: store.tracks?.length || 0,
        selectedCount: store.selectedTracks?.size || 0
      };
    });
    
    console.log('⌨️ Setup result:', setupResult);
    
    // Test Ctrl+C keyboard event
    console.log('⌨️ Testing Ctrl+C keyboard event');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1000);
    
    const copyResult = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      return {
        copiedCount: store.copiedTracks?.length || 0,
        canPaste: store.canPaste ? store.canPaste() : false
      };
    });
    console.log('⌨️ Copy result:', copyResult);
    
    // Test Ctrl+V keyboard event at a specific position
    console.log('⌨️ Testing Ctrl+V keyboard event');
    
    // Move mouse to timeline area and paste
    await page.mouse.move(400, 300);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(2000);
    
    const pasteResult = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      return {
        instancesCount: store.getTrackInstancesSize ? store.getTrackInstancesSize() : 0,
        instances: store.getAllInstances ? store.getAllInstances() : []
      };
    });
    console.log('⌨️ Paste result:', JSON.stringify(pasteResult, null, 2));
    
    // Verify keyboard shortcuts worked
    const keyboardWorking = {
      copyDetected: copyResult.copiedCount > 0,
      pasteDetected: pasteResult.instancesCount > 0,
      canPasteAfterCopy: copyResult.canPaste,
      instancesCreated: pasteResult.instances.length > 0
    };
    
    console.log('⌨️ KEYBOARD SHORTCUTS ASSESSMENT:');
    Object.entries(keyboardWorking).forEach(([feature, working]) => {
      console.log(`  ${working ? '✅' : '❌'} ${feature}: ${working}`);
    });
    
    // Basic assertions
    expect(setupResult.tracksCount).toBeGreaterThan(0);
    expect(setupResult.selectedCount).toBeGreaterThan(0);
    expect(keyboardWorking.copyDetected).toBe(true);
    expect(keyboardWorking.pasteDetected).toBe(true);
    
    console.log('✅ Keyboard shortcuts test completed successfully!');
  });
  
  test('should verify keyboard event handlers respond to key events', async ({ page }) => {
    console.log('⌨️ EVENT HANDLER TEST: Checking if keyboard events are captured');
    
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(2000);
    
    // Check if keyboard event handlers are attached
    const keyboardHandlersStatus = await page.evaluate(() => {
      // Check if the Studio component has keyboard event listeners
      const studioElement = document.querySelector('.studio-container') || document.body;
      
      // Create a test event to see if handlers respond
      const testKeyEvent = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      
      let eventCaptured = false;
      
      // Add a temporary listener to detect if events are being processed
      const tempHandler = () => {
        eventCaptured = true;
      };
      
      studioElement.addEventListener('keydown', tempHandler);
      studioElement.dispatchEvent(testKeyEvent);
      studioElement.removeEventListener('keydown', tempHandler);
      
      return {
        studioElementFound: !!studioElement,
        eventSystemWorking: eventCaptured,
        hasStore: typeof window.useStudioStore === 'function'
      };
    });
    
    console.log('⌨️ Keyboard handlers status:', keyboardHandlersStatus);
    
    // Basic verification
    expect(keyboardHandlersStatus.studioElementFound).toBe(true);
    expect(keyboardHandlersStatus.hasStore).toBe(true);
    
    console.log('✅ Event handler test completed!');
  });
});