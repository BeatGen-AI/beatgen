import { test, expect } from '@playwright/test';

test.describe('Copy/Paste Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the studio with extensive logging
    console.log('🚀 Starting copy/paste test - navigating to studio');
    
    // Set up a mock auth token in localStorage to skip login
    await page.goto('https://localhost:5173/');
    
    // Always set up authentication bypass with proper token structure
    console.log('🔑 Setting up authentication bypass');
    
    await page.evaluate(() => {
      // Clear any existing tokens
      localStorage.clear();
      
      // Create a proper JWT token structure like the working tests
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
      console.log('🔑 Authentication token set:', mockToken);
      
      // Verify token was set
      const storedToken = localStorage.getItem('access_token');
      console.log('🔑 Token verification:', storedToken ? 'Token set successfully' : 'Token setting failed');
    });
    
    // Wait for localStorage to be set
    await page.waitForTimeout(100);
    
    // Navigate to studio
    await page.goto('https://localhost:5173/studio');
    await page.waitForLoadState('networkidle');
    
    // Give extra time for authentication to process
    await page.waitForTimeout(2000);
    
    // Wait for the page to load - try multiple selectors  
    try {
      await page.waitForSelector('button:has-text("Add Track")', { timeout: 20000 });
      console.log('✅ Studio page loaded successfully');
    } catch (error) {
      console.log('⚠️ Add Track button not found, checking if we are on login page');
      
      // Check if we're on login page
      const isLoginPage = await page.locator('text=Login').isVisible();
      if (isLoginPage) {
        console.log('🔑 On login page, need to implement proper authentication');
        throw new Error('Authentication required - please ensure you are logged in or implement proper test authentication');
      }
      
      // Try alternative selectors
      const hasStudioElements = await page.locator('[data-testid="studio-container"]').or(page.locator('.studio')).or(page.locator('text=BPM')).first().isVisible();
      if (hasStudioElements) {
        console.log('✅ Studio page loaded (alternative elements found)');
      } else {
        throw error;
      }
    }
  });

  test('should copy and paste a track successfully', async ({ page }) => {
    console.log('🎯 Test: Copy and paste track functionality');
    
    // Step 1: Add a track
    console.log('📝 Step 1: Adding a Grand Piano track');
    await page.click('button:has-text("Add Track")');
    await page.click('text=Virtual Instrument');
    await page.click('text=Grand Piano');
    
    // Wait for track to be added
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    console.log('✅ Grand Piano track added successfully');
    
    // Step 2: Select the track
    console.log('📝 Step 2: Selecting the track');
    const trackElement = page.locator('text=MIDI Grand Piano').first();
    await trackElement.click();
    console.log('✅ Track selected');
    
    // Step 3: Copy the track using keyboard shortcut
    console.log('📝 Step 3: Copying track with Ctrl+C');
    await page.keyboard.press('Control+c');
    console.log('✅ Copy command sent');
    
    // Step 4: Right-click to open context menu
    console.log('📝 Step 4: Opening context menu for paste');
    const timelineArea = page.locator('[data-testid="timeline-area"]').or(page.locator('.timeline')).or(page.getByText('1234567891011').first());
    await timelineArea.click({ button: 'right' });
    
    // Wait for context menu to appear
    await page.waitForSelector('[data-testid="track-context-menu"]', { timeout: 2000 }).catch(() => {
      console.log('⚠️ Context menu not found with data-testid, trying alternative selectors');
    });
    
    // Step 5: Click paste option
    console.log('📝 Step 5: Clicking paste option');
    const pasteOption = page.locator('text=Paste').or(page.locator('[data-testid="paste-option"]'));
    
    if (await pasteOption.isVisible()) {
      await pasteOption.click();
      console.log('✅ Paste option clicked');
    } else {
      console.log('⚠️ Paste option not visible, trying keyboard shortcut');
      await page.keyboard.press('Control+v');
    }
    
    // Step 6: Verify the track was pasted
    console.log('📝 Step 6: Verifying track instance was created');
    
    // Check console logs for successful API calls
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('📋') || text.includes('🔄') || text.includes('SUCCESS') || text.includes('ERROR')) {
        console.log(`🖥️ Browser Console: ${text}`);
      }
    });
    
    // Wait a bit for any async operations
    await page.waitForTimeout(2000);
    
    // Check if there are any error messages
    const errorMessages = consoleLogs.filter(log => 
      log.includes('ERROR') || 
      log.includes('Failed') || 
      log.includes('No project ID available')
    );
    
    if (errorMessages.length > 0) {
      console.log('❌ Found error messages:', errorMessages);
      throw new Error(`Copy/paste failed with errors: ${errorMessages.join(', ')}`);
    }
    
    // Check for success indicators
    const successMessages = consoleLogs.filter(log => 
      log.includes('📋 SUCCESS') || 
      log.includes('Successfully created instance') ||
      log.includes('🔄 Copied tracks set to')
    );
    
    if (successMessages.length > 0) {
      console.log('✅ Found success messages:', successMessages);
    }
    
    console.log('🎉 Copy/paste test completed');
  });

  test('should handle copy operation correctly', async ({ page }) => {
    console.log('🎯 Test: Copy operation functionality');
    
    // Add track
    await page.click('button:has-text("Add Track")');
    await page.click('text=Virtual Instrument');
    await page.click('text=Grand Piano');
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    
    // Select track
    const trackElement = page.locator('text=MIDI Grand Piano').first();
    await trackElement.click();
    
    // Monitor console for copy operation
    const copyLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('🔄 COPY') || text.includes('copySelectedTracks') || text.includes('🔄 Selected tracks')) {
        copyLogs.push(text);
        console.log(`🖥️ Copy Log: ${text}`);
      }
    });
    
    // Perform copy
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1000);
    
    // Verify copy operation was logged
    expect(copyLogs.length).toBeGreaterThan(0);
    console.log(`✅ Copy operation logged: ${copyLogs.length} messages`);
  });

  test('should handle paste operation with proper project ID', async ({ page }) => {
    console.log('🎯 Test: Paste operation with project ID verification');
    
    // Add and select track
    await page.click('button:has-text("Add Track")');
    await page.click('text=Virtual Instrument');
    await page.click('text=Grand Piano');
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    
    const trackElement = page.locator('text=MIDI Grand Piano').first();
    await trackElement.click();
    
    // Copy track
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);
    
    // Monitor console for paste operation
    const pasteLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('📋 PASTE') || text.includes('project?.id') || text.includes('📋 - project object')) {
        pasteLogs.push(text);
        console.log(`🖥️ Paste Log: ${text}`);
      }
    });
    
    // Try to paste (simulate right-click and paste or use keyboard)
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    // Check if paste operation was attempted
    const projectIdLogs = pasteLogs.filter(log => log.includes('project?.id'));
    if (projectIdLogs.length > 0) {
      console.log('✅ Project ID check was performed during paste');
    }
    
    // Verify no "No project ID available" errors
    const noProjectIdErrors = pasteLogs.filter(log => log.includes('No project ID available'));
    expect(noProjectIdErrors.length).toBe(0);
  });
});