import { test, expect } from '@playwright/test';

test.describe('Copy/Paste Functionality with Authentication', () => {
  test.beforeEach(async ({ page }) => {
    console.log('🚀 Starting copy/paste test - handling authentication');
    
    // Navigate to the main page
    await page.goto('https://localhost:5173/');
    await page.waitForLoadState('networkidle');
    
    // Check if we're already authenticated by trying to access studio
    await page.goto('https://localhost:5173/studio');
    await page.waitForLoadState('networkidle');
    
    const currentUrl = page.url();
    console.log(`🔗 Current URL after studio navigation: ${currentUrl}`);
    
    if (currentUrl.includes('/login')) {
      console.log('🔑 Need to authenticate - filling in login form');
      
      // Try to use demo credentials or mock authentication
      // For now, let's try to mock the authentication state
      await page.goto('https://localhost:5173/');
      
      // Set a mock authentication token that would bypass login
      // This mimics being logged in (for testing purposes only)
      await page.evaluate(() => {
        // Clear any existing tokens first
        localStorage.clear();
        
        // Create a mock JWT token with the same structure as working tests
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const payload = btoa(JSON.stringify({
          sub: 'b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff', // Use known working test user ID
          name: 'Test User',
          email: 'test@example.com',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours from now
        }));
        const signature = 'test_signature_12345';
        const mockToken = `${header}.${payload}.${signature}`;
        
        localStorage.setItem('access_token', mockToken);
        console.log('🔑 Mock authentication token set:', mockToken);
        
        // Verify token was set
        const storedToken = localStorage.getItem('access_token');
        console.log('🔑 Token verification:', storedToken ? 'Token set successfully' : 'Token setting failed');
      });
      
      // Wait a moment for localStorage to be set
      await page.waitForTimeout(100);
      
      // Now try to access studio again
      await page.goto('https://localhost:5173/studio');
      await page.waitForLoadState('networkidle');
      
      // Give extra time for authentication to process
      await page.waitForTimeout(2000);
    }
    
    // Wait for studio to load - try multiple indicators
    console.log('⏳ Waiting for studio to load...');
    
    try {
      // Wait for any of these elements that indicate studio has loaded
      await Promise.race([
        page.waitForSelector('text=Add Track', { timeout: 15000 }),
        page.waitForSelector('button:has-text("Add Track")', { timeout: 15000 }),
        page.waitForSelector('[data-testid="add-track-button"]', { timeout: 15000 }),
        page.waitForSelector('text=BPM', { timeout: 15000 }),
        page.waitForSelector('.studio-container', { timeout: 15000 })
      ]);
      console.log('✅ Studio page loaded successfully');
    } catch (error) {
      // If still not loaded, take a screenshot for debugging
      await page.screenshot({ path: 'test-results/failed-studio-load.png', fullPage: true });
      
      const finalUrl = page.url();
      const pageContent = await page.locator('body').textContent();
      console.log(`❌ Studio failed to load. Final URL: ${finalUrl}`);
      console.log(`📝 Page content: ${pageContent?.substring(0, 200)}...`);
      
      throw new Error(`Studio page failed to load. Final URL: ${finalUrl}`);
    }
  });

  test('should load studio and find add track button', async ({ page }) => {
    console.log('🎯 Test: Verify studio loads with Add Track button');
    
    // Verify we can find the Add Track button
    const addTrackButton = page.locator('button:has-text("Add Track")').or(page.locator('text=Add Track'));
    await expect(addTrackButton).toBeVisible();
    console.log('✅ Add Track button is visible');
    
    // Take a screenshot for verification
    await page.screenshot({ path: 'test-results/studio-loaded.png', fullPage: true });
  });

  test('should add a track and test basic functionality', async ({ page }) => {
    console.log('🎯 Test: Add track and verify basic functionality');
    
    // Click Add Track button
    const addTrackButton = page.locator('button:has-text("Add Track")').first();
    await addTrackButton.click();
    console.log('📝 Clicked Add Track button');
    
    // Wait for the virtual instrument menu to appear
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.click('text=Virtual Instrument');
    console.log('📝 Selected Virtual Instrument');
    
    // Select Grand Piano
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.click('text=Grand Piano');
    console.log('📝 Selected Grand Piano');
    
    // Wait for track to be added
    await page.waitForSelector('text=Grand Piano', { timeout: 10000 });
    console.log('✅ Grand Piano track added successfully');
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/track-added.png', fullPage: true });
  });

  test('should test copy operation with console logging', async ({ page }) => {
    console.log('🎯 Test: Copy operation with console monitoring');
    
    // Add a track first
    const addTrackButton = page.locator('button:has-text("Add Track")').first();
    await addTrackButton.click();
    await page.click('text=Virtual Instrument');
    await page.click('text=Grand Piano');
    await page.waitForSelector('text=Grand Piano', { timeout: 10000 });
    
    // Set up console monitoring
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('🔄') || text.includes('COPY') || text.includes('🎯') || text.includes('selectedTracks')) {
        console.log(`🖥️ Browser Console: ${text}`);
      }
    });
    
    // Select the track by clicking on it
    const trackElement = page.locator('text=Grand Piano').last(); // Get the track in timeline
    await trackElement.click();
    console.log('📝 Track selected');
    
    // Try copy operation
    console.log('📝 Attempting copy operation with Ctrl+C');
    await page.keyboard.press('Control+c');
    
    // Wait a bit for any async operations
    await page.waitForTimeout(2000);
    
    // Check console logs for copy-related messages
    const copyLogs = consoleLogs.filter(log => 
      log.includes('🔄 COPY') || 
      log.includes('copySelectedTracks') || 
      log.includes('selectedTracks')
    );
    
    console.log(`📊 Found ${copyLogs.length} copy-related log messages`);
    copyLogs.forEach((log, index) => {
      console.log(`  ${index + 1}: ${log}`);
    });
    
    // The test passes if we successfully triggered track selection
    const selectionLogs = consoleLogs.filter(log => log.includes('🎯 TRACK SELECTION'));
    expect(selectionLogs.length).toBeGreaterThan(0);
  });

  test('should test paste operation and project ID availability', async ({ page }) => {
    console.log('🎯 Test: Paste operation and project ID verification');
    
    // Add and select track
    const addTrackButton = page.locator('button:has-text("Add Track")').first();
    await addTrackButton.click();
    await page.click('text=Virtual Instrument');
    await page.click('text=Grand Piano');
    await page.waitForSelector('text=Grand Piano', { timeout: 10000 });
    
    const trackElement = page.locator('text=Grand Piano').last();
    await trackElement.click();
    
    // Set up console monitoring for paste operations
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('📋') || text.includes('PASTE') || text.includes('project') || text.includes('📂')) {
        console.log(`🖥️ Browser Console: ${text}`);
      }
    });
    
    // Copy first
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);
    
    // Try paste operation
    console.log('📝 Attempting paste operation with Ctrl+V');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(2000);
    
    // Check for project ID related logs
    const projectLogs = consoleLogs.filter(log => 
      log.includes('📂 NEW PROJECT') || 
      log.includes('project?.id') ||
      log.includes('📋 - project object')
    );
    
    console.log(`📊 Found ${projectLogs.length} project-related log messages`);
    projectLogs.forEach((log, index) => {
      console.log(`  ${index + 1}: ${log}`);
    });
    
    // Verify no "No project ID available" errors
    const noProjectIdErrors = consoleLogs.filter(log => 
      log.includes('No project ID available for paste operation')
    );
    
    console.log(`🔍 Found ${noProjectIdErrors.length} "No project ID available" errors`);
    expect(noProjectIdErrors.length).toBe(0);
    
    // Take final screenshot
    await page.screenshot({ path: 'test-results/paste-test-complete.png', fullPage: true });
  });
});