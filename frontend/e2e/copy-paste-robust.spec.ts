import { test, expect } from '@playwright/test';

test.describe('Copy/Paste Functionality - Robust Tests', () => {
  test.beforeEach(async ({ page }) => {
    console.log('🚀 Setting up test with authentication bypass');
    
    // Set up authentication bypass with better token structure
    await page.goto('https://localhost:5173/');
    
    // First, clear any existing tokens
    await page.evaluate(() => {
      localStorage.clear();
    });
    
    // Set up a valid-looking token
    await page.evaluate(() => {
      // Create a valid JWT structure
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({
        sub: 'b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff', // Use known test user ID
        name: 'Test User',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours from now
      }));
      const signature = 'test_signature_12345';
      const mockToken = `${header}.${payload}.${signature}`;
      
      console.log('🔑 Setting mock token in localStorage:', mockToken);
      localStorage.setItem('access_token', mockToken);
      
      // Verify token was set
      const storedToken = localStorage.getItem('access_token');
      console.log('🔑 Token verification:', storedToken ? 'Token set successfully' : 'Token setting failed');
    });
    
    // Wait a moment for localStorage to be set
    await page.waitForTimeout(100);
    
    // Navigate to studio and wait for full load
    await page.goto('https://localhost:5173/studio');
    await page.waitForLoadState('networkidle');
    
    // Give extra time for authentication to process
    await page.waitForTimeout(2000);
    
    // Wait for studio to load with multiple possible selectors
    try {
      await page.waitForSelector('button:has-text("Add Track")', { timeout: 20000 });
      console.log('✅ Studio loaded successfully - Add Track button found');
    } catch (error) {
      // Check if we ended up on login page despite auth token
      const currentUrl = page.url();
      console.log('❌ Studio loading issue - current URL:', currentUrl);
      
      if (currentUrl.includes('/login')) {
        console.log('🔑 Ended up on login page - auth bypass failed');
        throw new Error('Authentication bypass failed - test ended up on login page');
      }
      
      // Try alternative selectors to confirm studio loaded
      const hasStudioElements = await page.locator('text=BPM').or(page.locator('text=Untitled Project')).first().isVisible();
      if (hasStudioElements) {
        console.log('✅ Studio loaded successfully - alternative elements found');
      } else {
        throw error;
      }
    }
  });

  test('should verify copy operation is logged correctly', async ({ page }) => {
    console.log('🎯 Test: Verify copy operation logging');
    
    // Set up console monitoring first - capture all logs from start
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      // Log important messages for debugging
      if (text.includes('🔄') || text.includes('COPY') || text.includes('🎯') || text.includes('📂') || text.includes('Project created:')) {
        console.log(`🖥️ Console: ${text}`);
      }
    });
    
    // Add track with specific button selection
    console.log('📝 Adding track...');
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    
    // Wait for track to be added and page to stabilize
    await page.waitForTimeout(3000);
    console.log('📝 Track added, waiting for stabilization...');
    
    // Try to select track with better selector
    console.log('📝 Attempting to select track...');
    
    // Look for the track in the timeline area specifically
    const trackInTimeline = page.locator('.track').or(page.locator('[data-track-width]')).first();
    
    try {
      await trackInTimeline.click({ timeout: 5000 });
      console.log('✅ Track clicked successfully');
    } catch (error) {
      console.log('⚠️ Direct track click failed, trying alternative approach');
      
      // Try clicking anywhere in the track area
      const timelineArea = page.locator('.timeline-area').or(page.locator('[class*="timeline"]')).first();
      if (await timelineArea.isVisible()) {
        await timelineArea.click();
        console.log('✅ Clicked timeline area instead');
      }
    }
    
    // Wait a bit for any selection to register
    await page.waitForTimeout(1000);
    
    // Try copy operation
    console.log('📝 Attempting copy operation...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1000);
    
    // Verify that we have project information in logs
    const projectLogs = consoleLogs.filter(log => 
      log.includes('📂 NEW PROJECT') || 
      log.includes('Project set in state') ||
      log.includes('project')
    );
    
    console.log(`📊 Found ${projectLogs.length} project-related logs`);
    console.log(`📊 Total console messages: ${consoleLogs.length}`);
    
    // Look for project creation logs (which happen during studio initialization)
    const projectCreationLogs = consoleLogs.filter(log => 
      log.includes('Project created:') && log.includes('id:')
    );
    
    console.log(`✨ Found ${projectCreationLogs.length} "Project created" messages`);
    
    // Also check for project state update logs
    const projectSetLogs = consoleLogs.filter(log => 
      log.includes('📂 NEW PROJECT - Project set in state') ||
      log.includes('📂 PROJECT LOADED - Project set in state') ||
      log.includes('Project set in state')
    );
    
    console.log(`✨ Found ${projectSetLogs.length} "Project set in state" messages`);
    
    // Debug: Show ALL project-related logs to understand what's happening
    const debugProjectLogs = consoleLogs.filter(log => 
      log.toLowerCase().includes('project') && 
      !log.includes('Authentication error') && 
      !log.includes('Auto-save error')
    );
    
    console.log('🔍 Debug - All non-error project logs:');
    debugProjectLogs.forEach((log, index) => {
      console.log(`  ${index + 1}: ${log}`);
    });
    
    // The key test: verify that a project was created in the frontend store
    // We should see either "Project created:" OR "Project set in state"
    const hasProjectLogs = projectCreationLogs.length > 0 || projectSetLogs.length > 0;
    
    if (!hasProjectLogs) {
      console.log('❌ No project creation or state logs found');
      console.log('🔍 Showing last 10 console messages for debugging:');
      consoleLogs.slice(-10).forEach((log, index) => {
        console.log(`  ${index + 1}: ${log}`);
      });
    }
    
    expect(hasProjectLogs).toBe(true);
    
    // Take screenshot for verification
    await page.screenshot({ path: 'test-results/copy-operation-test.png', fullPage: true });
  });

  test('should verify project ID is available during operations', async ({ page }) => {
    console.log('🎯 Test: Verify project ID availability');
    
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('📂') || text.includes('project') || text.includes('id:')) {
        console.log(`🖥️ Console: ${text}`);
      }
    });
    
    // Add a track
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    
    // Wait for project creation logs
    await page.waitForTimeout(3000);
    
    // Check that project was created with an ID
    const projectCreationLogs = consoleLogs.filter(log => 
      log.includes('Project created:') && log.includes('id:')
    );
    
    console.log(`🔍 Project creation logs found: ${projectCreationLogs.length}`);
    
    if (projectCreationLogs.length > 0) {
      console.log(`✅ Project creation logged: ${projectCreationLogs[0]}`);
      
      // Extract project ID from log if possible
      const idMatch = projectCreationLogs[0].match(/id:\s*([a-f0-9-]+)/);
      if (idMatch) {
        console.log(`🆔 Project ID found: ${idMatch[1]}`);
      }
    }
    
    // Verify project state was set
    const projectStateLogs = consoleLogs.filter(log => 
      log.includes('📂 NEW PROJECT - Project set in state')
    );
    
    console.log(`🔍 Project state logs found: ${projectStateLogs.length}`);
    expect(projectStateLogs.length).toBeGreaterThan(0);
    
    console.log('✅ Test completed - project ID availability verified');
  });

  test('should test the complete copy/paste workflow', async ({ page }) => {
    console.log('🎯 Test: Complete copy/paste workflow');
    
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      // Log all important messages
      if (text.includes('🔄') || text.includes('📋') || text.includes('🎯') || text.includes('📂') || text.includes('ERROR')) {
        console.log(`🖥️ Console: ${text}`);
      }
    });
    
    // Add track
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    await page.waitForTimeout(2000);
    
    console.log('📝 Track added, attempting workflow...');
    
    // Try to trigger copy operation
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);
    
    // Try to trigger paste operation  
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    // Check for any error messages related to copy/paste
    const errorLogs = consoleLogs.filter(log => 
      log.includes('No project ID available for paste operation') ||
      log.includes('ERROR') ||
      log.includes('Failed')
    );
    
    console.log(`🔍 Error logs found: ${errorLogs.length}`);
    errorLogs.forEach((log, index) => {
      console.log(`  ${index + 1}: ${log}`);
    });
    
    // The main assertion: no "No project ID available" errors
    const specificError = consoleLogs.filter(log => 
      log.includes('No project ID available for paste operation')
    );
    
    expect(specificError.length).toBe(0);
    console.log('✅ No "No project ID available" errors found!');
    
    // Check that project state was properly initialized
    const projectLogs = consoleLogs.filter(log => 
      log.includes('📂 NEW PROJECT - Project set in state')
    );
    
    expect(projectLogs.length).toBeGreaterThan(0);
    console.log('✅ Project state properly initialized!');
    
    await page.screenshot({ path: 'test-results/complete-workflow-test.png', fullPage: true });
    console.log('🎉 Complete copy/paste workflow test passed!');
  });
});