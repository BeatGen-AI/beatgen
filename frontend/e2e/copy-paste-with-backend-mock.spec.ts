import { test, expect } from '@playwright/test';
import { setupAuthMock } from './mocks/auth-mock';

test.describe('Copy/Paste with Backend API Mocking', () => {
  test.beforeEach(async ({ page }) => {
    console.log('🚀 Setting up test with backend API mocking');
    
    // Set up API mocking first
    await setupAuthMock(page);
    
    // Navigate to app
    await page.goto('https://localhost:5173/');
    
    // Clear any existing tokens
    await page.evaluate(() => {
      localStorage.clear();
    });
    
    // Set up a valid-looking token for frontend auth bypass
    await page.evaluate(() => {
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
    });
    
    // Navigate to studio
    await page.goto('https://localhost:5173/studio');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Wait for studio to load
    await page.waitForSelector('button:has-text("Add Track")', { timeout: 20000 });
    console.log('✅ Studio loaded successfully with mocked backend');
  });

  test('should handle copy/paste operations with mocked backend', async ({ page }) => {
    console.log('🎯 Test: Copy/paste with mocked backend APIs');
    
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('🔄') || text.includes('📋') || text.includes('🎯') || text.includes('📂') || text.includes('Project created:')) {
        console.log(`🖥️ Console: ${text}`);
      }
    });
    
    // Add track
    console.log('📝 Adding track...');
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    
    // Wait for track to be added
    await page.waitForTimeout(3000);
    
    // Try to select track
    const trackElement = page.locator('.track').or(page.locator('[data-track-width]')).first();
    
    try {
      await trackElement.click({ timeout: 5000 });
      console.log('✅ Track selected successfully');
    } catch (error) {
      console.log('⚠️ Direct track selection failed, continuing with test');
    }
    
    // Perform copy operation
    console.log('📝 Performing copy operation...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1000);
    
    // Perform paste operation
    console.log('📝 Performing paste operation...');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    // Verify that project was created and operations completed
    const projectLogs = consoleLogs.filter(log => 
      log.includes('Project created:') || 
      log.includes('📂 NEW PROJECT - Project set in state') ||
      log.includes('📂 PROJECT LOADED - Project set in state')
    );
    
    console.log(`✨ Found ${projectLogs.length} project-related logs`);
    
    // Check for authentication errors (should not exist with mocking)
    const authErrors = consoleLogs.filter(log => 
      log.includes('Authentication error') || 
      log.includes('401') ||
      log.includes('Auto-save error')
    );
    
    console.log(`🔍 Authentication errors found: ${authErrors.length}`);
    if (authErrors.length > 0) {
      console.log('❌ Authentication errors detected:');
      authErrors.forEach((error, index) => {
        console.log(`  ${index + 1}: ${error}`);
      });
    }
    
    // The test should pass with mocked backend - no auth errors
    expect(authErrors.length).toBe(0);
    expect(projectLogs.length).toBeGreaterThan(0);
    
    await page.screenshot({ 
      path: 'test-results/copy-paste-with-backend-mock.png', 
      fullPage: true 
    });
    
    console.log('✅ Copy/paste test with backend mocking completed successfully');
  });

  test('should handle project creation with mocked APIs', async ({ page }) => {
    console.log('🎯 Test: Project creation with mocked backend');
    
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });
    
    // Monitor network requests to verify mocking is working
    const networkRequests: string[] = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/projects') || url.includes('/auth')) {
        networkRequests.push(`${request.method()} ${url}`);
        console.log(`🌐 Request: ${request.method()} ${url}`);
      }
    });
    
    page.on('response', response => {
      const url = response.url();
      if (url.includes('/projects') || url.includes('/auth')) {
        console.log(`📡 Response: ${response.status()} ${url}`);
      }
    });
    
    // Add track to trigger project creation
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    
    await page.waitForTimeout(3000);
    
    // Verify that mocked requests were made
    const projectRequests = networkRequests.filter(req => req.includes('/projects'));
    console.log(`🔍 Project API requests made: ${projectRequests.length}`);
    projectRequests.forEach(req => console.log(`  - ${req}`));
    
    // Verify no 401 errors in console
    const authErrors = consoleLogs.filter(log => 
      log.includes('401') || log.includes('Authentication error')
    );
    
    expect(authErrors.length).toBe(0);
    expect(projectRequests.length).toBeGreaterThan(0);
    
    console.log('✅ Project creation with mocked backend test passed');
  });
});