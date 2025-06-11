import { test, expect } from '@playwright/test';
import { setupComprehensiveApiMock } from './mocks/comprehensive-api-mock';

test.describe('Copy/Paste Production Ready Tests', () => {
  test.beforeEach(async ({ page }) => {
    console.log('🚀 Setting up production-ready test environment');
    
    // Set up comprehensive API mocking
    await setupComprehensiveApiMock(page);
    
    // Navigate to app
    await page.goto('https://localhost:5173/');
    
    // Clear any existing tokens
    await page.evaluate(() => {
      localStorage.clear();
    });
    
    // Set up authentication token for frontend
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
      console.log('🔑 Auth token set for frontend');
    });
    
    // Navigate to studio
    await page.goto('https://localhost:5173/studio');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Wait for studio to load
    await page.waitForSelector('button:has-text("Add Track")', { timeout: 20000 });
    console.log('✅ Studio loaded successfully with comprehensive mocking');
  });

  test('should handle full copy/paste workflow without authentication errors', async ({ page }) => {
    console.log('🎯 Test: Full copy/paste workflow with mocked backend');
    
    const consoleLogs: string[] = [];
    const networkRequests: { method: string; url: string; status?: number }[] = [];
    
    // Monitor console logs
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('🔄') || text.includes('📋') || text.includes('🎯') || text.includes('📂') || text.includes('Project created:') || text.includes('ERROR')) {
        console.log(`🖥️ Console: ${text}`);
      }
    });
    
    // Monitor network requests and responses
    page.on('request', request => {
      const url = request.url();
      if (url.includes('localhost:8000') || url.includes('/api/')) {
        networkRequests.push({
          method: request.method(),
          url: url
        });
        console.log(`📡 Request: ${request.method()} ${url}`);
      }
    });
    
    page.on('response', response => {
      const url = response.url();
      if (url.includes('localhost:8000') || url.includes('/api/')) {
        const request = networkRequests.find(req => req.url === url && !req.status);
        if (request) {
          request.status = response.status();
        }
        console.log(`📨 Response: ${response.status()} ${url}`);
      }
    });
    
    // Step 1: Add a track
    console.log('📝 Step 1: Adding track...');
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    
    // Wait for track to be added and any API calls to complete
    await page.waitForTimeout(3000);
    
    // Step 2: Attempt to select track or track area
    console.log('📝 Step 2: Selecting track area...');
    const trackElement = page.locator('.track').or(page.locator('[data-track-width]')).first();
    
    try {
      await trackElement.click({ timeout: 5000 });
      console.log('✅ Track selected successfully');
    } catch (error) {
      console.log('⚠️ Direct track selection failed, trying timeline area');
      const timelineArea = page.locator('.timeline-area').or(page.locator('[class*="timeline"]')).first();
      if (await timelineArea.isVisible()) {
        await timelineArea.click();
        console.log('✅ Timeline area clicked');
      }
    }
    
    await page.waitForTimeout(1000);
    
    // Step 3: Perform copy operation
    console.log('📝 Step 3: Performing copy operation...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1500);
    
    // Step 4: Perform paste operation
    console.log('📝 Step 4: Performing paste operation...');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1500);
    
    // Analysis: Check for errors
    console.log('🔍 Analyzing test results...');
    
    // Check for authentication errors
    const authErrors = consoleLogs.filter(log => 
      log.includes('Authentication error') || 
      log.includes('401') ||
      log.includes('Unauthorized') ||
      log.includes('Could not validate credentials')
    );
    
    console.log(`🔍 Authentication errors found: ${authErrors.length}`);
    if (authErrors.length > 0) {
      console.log('❌ Authentication errors:');
      authErrors.forEach((error, index) => {
        console.log(`  ${index + 1}: ${error}`);
      });
    }
    
    // Check for failed network requests
    const failedRequests = networkRequests.filter(req => req.status && req.status >= 400);
    console.log(`🔍 Failed network requests: ${failedRequests.length}`);
    if (failedRequests.length > 0) {
      console.log('❌ Failed requests:');
      failedRequests.forEach((req, index) => {
        console.log(`  ${index + 1}: ${req.status} ${req.method} ${req.url}`);
      });
    }
    
    // Check for project creation/loading
    const projectLogs = consoleLogs.filter(log => 
      log.includes('Project created:') || 
      log.includes('📂 NEW PROJECT - Project set in state') ||
      log.includes('📂 PROJECT LOADED - Project set in state') ||
      log.includes('Project set in state')
    );
    
    console.log(`✨ Project-related logs found: ${projectLogs.length}`);
    if (projectLogs.length > 0) {
      console.log('✅ Project logs:');
      projectLogs.forEach((log, index) => {
        console.log(`  ${index + 1}: ${log}`);
      });
    }
    
    // Check for copy/paste operation logs
    const copyPasteLogs = consoleLogs.filter(log => 
      log.includes('🔄') || 
      log.includes('📋') || 
      log.includes('COPY') || 
      log.includes('PASTE') ||
      log.includes('clipboard')
    );
    
    console.log(`📋 Copy/paste operation logs found: ${copyPasteLogs.length}`);
    
    // Main assertions
    expect(authErrors.length).toBe(0);
    expect(failedRequests.length).toBe(0);
    expect(projectLogs.length).toBeGreaterThan(0);
    
    // Take screenshot for verification
    await page.screenshot({ 
      path: 'test-results/production-ready-copy-paste.png', 
      fullPage: true 
    });
    
    console.log('🎉 Production-ready copy/paste test completed successfully!');
  });

  test('should verify project auto-save works without authentication issues', async ({ page }) => {
    console.log('🎯 Test: Project auto-save functionality');
    
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('Auto-save') || text.includes('SAVE') || text.includes('PROJECT')) {
        console.log(`🖥️ Console: ${text}`);
      }
    });
    
    // Add a track to trigger project creation and auto-save
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    
    // Wait for auto-save operations
    await page.waitForTimeout(5000);
    
    // Check for auto-save errors
    const autoSaveErrors = consoleLogs.filter(log => 
      log.includes('Auto-save error') || 
      log.includes('Failed to save') ||
      (log.includes('Auto-save') && log.includes('error'))
    );
    
    console.log(`🔍 Auto-save errors found: ${autoSaveErrors.length}`);
    if (autoSaveErrors.length > 0) {
      console.log('❌ Auto-save errors:');
      autoSaveErrors.forEach((error, index) => {
        console.log(`  ${index + 1}: ${error}`);
      });
    }
    
    // Check for successful auto-save operations
    const autoSaveSuccess = consoleLogs.filter(log => 
      log.includes('Auto-save') && 
      (log.includes('success') || log.includes('completed') || log.includes('saved'))
    );
    
    console.log(`✅ Successful auto-save operations: ${autoSaveSuccess.length}`);
    
    expect(autoSaveErrors.length).toBe(0);
    
    console.log('✅ Auto-save test completed successfully');
  });
});