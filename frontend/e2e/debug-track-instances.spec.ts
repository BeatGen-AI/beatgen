import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Debug Track Instances Implementation', () => {
  test('should debug why copy/paste is not working with track instances', async ({ page }) => {
    console.log('🐛 DEBUG: Checking why track instances broke copy/paste');
    
    // Capture console errors
    const consoleErrors: string[] = [];
    const consoleLogs: string[] = [];
    
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        consoleErrors.push(text);
        console.log(`🔴 Browser Error: ${text}`);
      } else if (text.includes('📋') || text.includes('🔄') || text.includes('TrackInstance')) {
        consoleLogs.push(text);
        console.log(`🌐 Browser Log: ${text}`);
      }
    });
    
    // Capture page errors
    page.on('pageerror', error => {
      console.log(`🔴 Page Error: ${error.message}`);
      consoleErrors.push(error.message);
    });
    
    // Login and navigate to studio
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    console.log('🐛 Studio loaded, checking for any console errors...');
    if (consoleErrors.length > 0) {
      console.log('🔴 Console errors found:');
      consoleErrors.forEach(error => console.log(`  - ${error}`));
    } else {
      console.log('✅ No console errors so far');
    }
    
    // Try to select a track
    console.log('🐛 Attempting to select a track...');
    const tracks = page.locator('[data-track-id]');
    const trackCount = await tracks.count();
    console.log(`🐛 Found ${trackCount} tracks`);
    
    if (trackCount > 0) {
      await tracks.first().click();
      await page.waitForTimeout(500);
      
      console.log('🐛 Attempting copy operation...');
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(1000);
      
      console.log('🐛 Attempting paste operation...');
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(2000);
      
      // Check if any errors occurred
      if (consoleErrors.length > 0) {
        console.log('🔴 Errors during copy/paste:');
        consoleErrors.forEach(error => console.log(`  - ${error}`));
      }
      
      // Check console logs for copy/paste operations
      const copyPasteLogs = consoleLogs.filter(log => 
        log.includes('📋') || log.includes('🔄') || log.includes('COPY') || log.includes('PASTE')
      );
      
      console.log(`🐛 Copy/paste related logs: ${copyPasteLogs.length}`);
      copyPasteLogs.forEach(log => console.log(`  - ${log}`));
      
      // Check if track instances were created
      const instanceCount = await page.locator('[data-track-instance-id]').count();
      console.log(`🐛 Track instances found: ${instanceCount}`);
      
    } else {
      console.log('🔴 No tracks found to test copy/paste');
    }
    
    // Final error summary
    console.log('🐛 FINAL DEBUG SUMMARY:');
    console.log(`  - Total console errors: ${consoleErrors.length}`);
    console.log(`  - Total relevant logs: ${consoleLogs.length}`);
    console.log(`  - Copy/paste operations detected: ${consoleLogs.filter(l => l.includes('📋') || l.includes('🔄')).length}`);
    
    // Expect no critical errors that would break functionality
    const criticalErrors = consoleErrors.filter(error => 
      error.includes('TypeError') || 
      error.includes('ReferenceError') || 
      error.includes('Cannot read properties') ||
      error.includes('is not a function')
    );
    
    if (criticalErrors.length > 0) {
      console.log('🔴 CRITICAL ERRORS FOUND:');
      criticalErrors.forEach(error => console.log(`  - ${error}`));
      throw new Error(`Critical errors detected: ${criticalErrors.join(', ')}`);
    }
  });
});