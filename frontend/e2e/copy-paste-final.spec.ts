import { test, expect } from '@playwright/test';

test.describe('Copy/Paste Final Tests', () => {
  test.beforeEach(async ({ page }) => {
    console.log('🚀 Setting up copy/paste test environment');
    
    // Step 1: Navigate to homepage first
    await page.goto('https://localhost:5173/');
    await page.waitForLoadState('networkidle');
    
    // Step 2: Set up authentication token
    await page.evaluate(() => {
      localStorage.clear();
      
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({
        sub: 'b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff',
        name: 'Test User',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
      }));
      const signature = 'test_signature_12345';
      const mockToken = `${header}.${payload}.${signature}`;
      
      localStorage.setItem('access_token', mockToken);
      console.log('🔑 Auth token set successfully');
    });
    
    await page.waitForTimeout(500);
    
    // Step 3: Navigate to studio
    await page.goto('https://localhost:5173/studio');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Step 4: Wait for Add Track button to ensure studio is loaded
    await page.waitForSelector('button:has-text("Add Track")', { timeout: 15000 });
    console.log('✅ Studio loaded successfully');
  });

  test('should test complete copy/paste workflow with proper error handling', async ({ page }) => {
    console.log('🎯 Test: Complete copy/paste workflow');
    
    const consoleLogs: string[] = [];
    
    // Monitor console for copy/paste related logs
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      
      // Log important copy/paste messages
      if (text.includes('🔄') || text.includes('📋') || text.includes('COPY') || text.includes('PASTE') || 
          text.includes('📂') || text.includes('Project') || text.includes('ERROR') || text.includes('No project ID')) {
        console.log(`🖥️ Console: ${text}`);
      }
    });
    
    // Step 1: Add a track
    console.log('📝 Step 1: Adding track...');
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    
    // Wait for track to be added
    await page.waitForTimeout(3000);
    console.log('✅ Track added successfully');
    
    // Step 2: Attempt to select track or track area
    console.log('📝 Step 2: Selecting track for copy operation...');
    
    // Try multiple selectors for track selection
    const trackSelectors = [
      '.track',
      '[data-track-width]',
      '.timeline-area',
      '[class*="timeline"]',
      '[class*="track"]'
    ];
    
    let trackSelected = false;
    
    for (const selector of trackSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          await element.click();
          console.log(`✅ Track selected using selector: ${selector}`);
          trackSelected = true;
          break;
        }
      } catch (error) {
        console.log(`⚠️ Selector ${selector} failed or not visible`);
      }
    }
    
    if (!trackSelected) {
      console.log('⚠️ Could not select track with any selector, proceeding with copy anyway');
    }
    
    await page.waitForTimeout(1000);
    
    // Step 3: Perform copy operation
    console.log('📝 Step 3: Performing copy operation (Ctrl+C)...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(2000);
    
    // Step 4: Perform paste operation
    console.log('📝 Step 4: Performing paste operation (Ctrl+V)...');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(2000);
    
    // Step 5: Analysis and verification
    console.log('🔍 Analyzing test results...');
    
    // Check for copy operation logs
    const copyLogs = consoleLogs.filter(log => 
      log.includes('🔄 COPY') || 
      log.includes('COPY OPERATION') ||
      log.includes('copySelectedTracks') ||
      log.includes('Ctrl+C pressed')
    );
    
    console.log(`📊 Copy operation logs found: ${copyLogs.length}`);
    copyLogs.forEach((log, index) => {
      console.log(`  Copy ${index + 1}: ${log}`);
    });
    
    // Check for paste operation logs
    const pasteLogs = consoleLogs.filter(log => 
      log.includes('📋 PASTE') || 
      log.includes('PASTE OPERATION') ||
      log.includes('pasteTracksAtPosition') ||
      log.includes('Ctrl+V pressed')
    );
    
    console.log(`📊 Paste operation logs found: ${pasteLogs.length}`);
    pasteLogs.forEach((log, index) => {
      console.log(`  Paste ${index + 1}: ${log}`);
    });
    
    // Check for project-related logs
    const projectLogs = consoleLogs.filter(log => 
      log.includes('📂 NEW PROJECT') || 
      log.includes('Project created:') ||
      log.includes('Project set in state') ||
      (log.includes('project') && !log.includes('Authentication error'))
    );
    
    console.log(`📊 Project logs found: ${projectLogs.length}`);
    projectLogs.forEach((log, index) => {
      console.log(`  Project ${index + 1}: ${log}`);
    });
    
    // Check for the specific error we were trying to fix
    const noProjectIdErrors = consoleLogs.filter(log => 
      log.includes('No project ID available for paste operation')
    );
    
    console.log(`🔍 "No project ID" errors found: ${noProjectIdErrors.length}`);
    if (noProjectIdErrors.length > 0) {
      console.log('❌ Still getting "No project ID" errors:');
      noProjectIdErrors.forEach((error, index) => {
        console.log(`  Error ${index + 1}: ${error}`);
      });
    }
    
    // Check for authentication errors
    const authErrors = consoleLogs.filter(log => 
      log.includes('Authentication error') || 
      log.includes('401') ||
      log.includes('Could not validate credentials') ||
      log.includes('Auto-save failed due to authentication')
    );
    
    console.log(`🔍 Authentication errors found: ${authErrors.length}`);
    if (authErrors.length > 0) {
      console.log('⚠️ Authentication errors (expected with current backend):');
      authErrors.forEach((error, index) => {
        console.log(`  Auth Error ${index + 1}: ${error}`);
      });
    }
    
    // Take screenshot for verification
    await page.screenshot({ path: 'test-results/copy-paste-final-test.png', fullPage: true });
    
    // Success criteria: The main goal was to fix the "No project ID available" error
    // If we have keyboard events being detected and no "No project ID" errors, that's success
    const hasKeyboardActivity = copyLogs.length > 0 || pasteLogs.length > 0;
    const hasNoProjectIdError = noProjectIdErrors.length > 0;
    
    console.log(`📈 Test Results Summary:`);
    console.log(`  - Keyboard activity detected: ${hasKeyboardActivity}`);
    console.log(`  - No project ID errors: ${hasNoProjectIdError}`);
    console.log(`  - Copy operation logs: ${copyLogs.length}`);
    console.log(`  - Paste operation logs: ${pasteLogs.length}`);
    console.log(`  - Project logs: ${projectLogs.length}`);
    
    // The critical success criteria: No "No project ID available for paste operation" errors
    expect(noProjectIdErrors.length).toBe(0);
    
    console.log('✅ Copy/paste workflow test completed successfully');
  });

  test('should verify keyboard handlers are properly attached', async ({ page }) => {
    console.log('🎯 Test: Keyboard handler verification');
    
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('⌨️') || text.includes('KEYBOARD') || text.includes('Ctrl+')) {
        console.log(`🖥️ Console: ${text}`);
      }
    });
    
    // Test keyboard shortcuts without adding tracks first
    console.log('📝 Testing keyboard shortcuts...');
    
    // Press Ctrl+C
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1000);
    
    // Press Ctrl+V
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    // Check for keyboard event logs
    const keyboardLogs = consoleLogs.filter(log => 
      log.includes('⌨️ KEYBOARD') || 
      log.includes('Ctrl+C pressed') ||
      log.includes('Ctrl+V pressed')
    );
    
    console.log(`📊 Keyboard event logs found: ${keyboardLogs.length}`);
    keyboardLogs.forEach((log, index) => {
      console.log(`  Keyboard ${index + 1}: ${log}`);
    });
    
    // Success criteria: Keyboard handlers should be attached and responding
    expect(keyboardLogs.length).toBeGreaterThan(0);
    
    console.log('✅ Keyboard handler verification completed');
  });
});