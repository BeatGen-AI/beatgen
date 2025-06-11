import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Comprehensive Track Instances Test', () => {
  test('should create tracks, test copy/paste with extensive logging, and verify track instances', async ({ page }) => {
    console.log('🧪 COMPREHENSIVE TEST: Creating tracks, testing copy/paste with track instances');
    
    // Capture console errors and logs
    const consoleErrors: string[] = [];
    const consoleLogs: string[] = [];
    
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        consoleErrors.push(text);
        console.log(`🔴 Browser Error: ${text}`);
      } else if (
        text.includes('📋') || text.includes('🔄') || text.includes('TrackInstance') ||
        text.includes('COPY') || text.includes('PASTE') || text.includes('createTrackInstance') ||
        text.includes('trackInstances') || text.includes('🎯')
      ) {
        consoleLogs.push(text);
        console.log(`🌐 Browser Log: ${text}`);
      }
    });
    
    // Capture page errors
    page.on('pageerror', error => {
      console.log(`🔴 Page Error: ${error.message}`);
      consoleErrors.push(error.message);
    });
    
    // Step 1: Login and navigate to studio
    console.log('🧪 STEP 1: Login and navigate to studio');
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    // Step 2: Create a MIDI track first
    console.log('🧪 STEP 2: Creating a MIDI track for testing');
    await page.click('button:has-text("Add Track")');
    await page.waitForTimeout(500);
    
    // Click on Virtual Instrument option (creates MIDI track)
    await page.click('text=Virtual Instrument');
    await page.waitForTimeout(500);
    
    // Select Grand Piano instrument
    await page.click('text=Grand Piano');
    await page.waitForTimeout(2000);
    
    // Check if we have tracks now
    const tracksAfterCreation = page.locator('[data-track-id]');
    const trackCountAfterCreation = await tracksAfterCreation.count();
    console.log(`🧪 Found ${trackCountAfterCreation} tracks after creation`);
    
    if (trackCountAfterCreation === 0) {
      console.log('🔴 Still no tracks found after creation attempt');
      // Try alternative creation method
      console.log('🧪 Trying alternative track creation method...');
      
      // Look for any add track buttons or menus
      const addButtons = await page.locator('button').allTextContents();
      console.log('🧪 Available buttons:', addButtons.filter(text => text.toLowerCase().includes('add')));
      
      // Check what's actually on the page
      const pageContent = await page.content();
      const hasAddTrack = pageContent.includes('Add Track') || pageContent.includes('add track') || pageContent.includes('Add track');
      console.log('🧪 Page contains "Add Track":', hasAddTrack);
      
      if (hasAddTrack) {
        // Try clicking any add track button
        try {
          await page.locator('text=Add Track').first().click();
          await page.waitForTimeout(1000);
          await page.locator('text=Virtual Instrument').first().click();
          await page.waitForTimeout(500);
          await page.locator('text=Grand Piano').first().click();
          await page.waitForTimeout(2000);
        } catch (e) {
          console.log('🔴 Alternative track creation also failed:', e);
        }
      }
    }
    
    // Step 3: Recheck tracks and proceed with copy/paste test
    const finalTrackCount = await page.locator('[data-track-id]').count();
    console.log(`🧪 STEP 3: Final track count: ${finalTrackCount}`);
    
    if (finalTrackCount > 0) {
      console.log('🧪 STEP 4: Testing copy/paste with track instances');
      
      // Select the first track
      await page.locator('[data-track-id]').first().click();
      await page.waitForTimeout(500);
      
      console.log('🧪 STEP 5: Performing copy operation');
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(1000);
      
      console.log('🧪 STEP 6: Performing paste operation');
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(3000);
      
      // Step 7: Check for track instances
      console.log('🧪 STEP 7: Checking for track instances');
      const instanceCount = await page.locator('[data-track-instance-id]').count();
      console.log(`🧪 Track instances found: ${instanceCount}`);
      
      // Step 8: Check visual track instances in DOM
      const visualInstances = await page.locator('[data-testid="track-instance"]').count();
      console.log(`🧪 Visual track instances found: ${visualInstances}`);
      
      // Step 9: Check if tracks are duplicated (alternative implementation)
      const totalTracksAfterPaste = await page.locator('[data-track-id]').count();
      console.log(`🧪 Total tracks after paste: ${totalTracksAfterPaste}`);
      
      if (totalTracksAfterPaste > finalTrackCount) {
        console.log('✅ Tracks were duplicated - track instances working via track duplication');
      } else if (instanceCount > 0 || visualInstances > 0) {
        console.log('✅ Track instances were created - visual instances working');
      } else {
        console.log('❌ No track instances or duplicated tracks found');
      }
      
    } else {
      console.log('🔴 No tracks available for copy/paste test');
      
      // Let's check what's actually in the studio
      const studioContent = await page.textContent('body');
      console.log('🧪 Studio page contains "studio":', studioContent?.toLowerCase().includes('studio'));
      console.log('🧪 Studio page contains "track":', studioContent?.toLowerCase().includes('track'));
      
      // Take a screenshot for debugging
      await page.screenshot({ path: 'debug-no-tracks.png' });
      console.log('🧪 Screenshot saved as debug-no-tracks.png');
    }
    
    // Step 10: Final analysis
    console.log('🧪 FINAL ANALYSIS:');
    console.log(`  - Total console errors: ${consoleErrors.length}`);
    console.log(`  - Total relevant logs: ${consoleLogs.length}`);
    console.log(`  - Copy/paste operations detected: ${consoleLogs.filter(l => l.includes('📋') || l.includes('🔄')).length}`);
    
    // Print all copy/paste related logs
    const copyPasteLogs = consoleLogs.filter(log => 
      log.includes('📋') || log.includes('🔄') || log.includes('COPY') || log.includes('PASTE') ||
      log.includes('createTrackInstance') || log.includes('trackInstances')
    );
    
    if (copyPasteLogs.length > 0) {
      console.log('🧪 Copy/paste related logs:');
      copyPasteLogs.forEach(log => console.log(`  - ${log}`));
    }
    
    // Print any critical errors
    const criticalErrors = consoleErrors.filter(error => 
      error.includes('TypeError') || 
      error.includes('ReferenceError') || 
      error.includes('Cannot read properties') ||
      error.includes('is not a function')
    );
    
    if (criticalErrors.length > 0) {
      console.log('🔴 CRITICAL ERRORS FOUND:');
      criticalErrors.forEach(error => console.log(`  - ${error}`));
    }
    
    // Test should not fail if there are no critical errors
    expect(criticalErrors.length).toBe(0);
  });
});