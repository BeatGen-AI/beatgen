import { test, expect } from '@playwright/test';

test.describe('Keyboard Debug', () => {
  test.beforeEach(async ({ page }) => {
    console.log('🚀 Setting up keyboard debug test');
    
    // Clear localStorage and set mock token
    await page.goto('https://localhost:5173/');
    await page.evaluate(() => {
      localStorage.clear();
      const mockToken = btoa(JSON.stringify({ sub: 'test-user', exp: Date.now() / 1000 + 86400 }));
      localStorage.setItem('access_token', `header.${mockToken}.signature`);
    });
    
    // Navigate to studio
    await page.goto('https://localhost:5173/studio');
    await page.waitForLoadState('networkidle');
    
    // Wait for studio to load
    await page.waitForSelector('button:has-text("Add Track")', { timeout: 20000 });
    console.log('✅ Studio loaded');
  });

  test('should debug keyboard event handling', async ({ page }) => {
    console.log('🎯 Debugging keyboard event handling');
    
    // Monitor ALL console logs for debugging
    const allLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      allLogs.push(text);
      // Log keyboard-related and Studio-related messages
      if (text.includes('⌨️') || text.includes('KEYBOARD') || text.includes('Studio') || text.includes('useEffect')) {
        console.log(`🖥️ Debug Log: ${text}`);
      }
    });
    
    // First, check if the Studio component has proper event handlers
    console.log('📝 Checking Studio component state...');
    const studioState = await page.evaluate(() => {
      // Check if there are any event listeners on window
      const hasWindowListeners = !!(window as any)._eventListeners || 
                                  window.addEventListener.toString().includes('native') ||
                                  Object.keys(window).some(key => key.includes('event'));
                                  
      // Check for React/Studio related globals
      const hasReactStudio = !!(window as any).React || 
                             !!(window as any).storeInstance ||
                             document.querySelector('[data-testid*="studio"]') ||
                             document.querySelector('.studio') ||
                             document.body.innerHTML.includes('Add Track');
                             
      return {
        hasWindowListeners,
        hasReactStudio,
        bodyHtml: document.body.innerHTML.substring(0, 500), // First 500 chars for debugging
        documentTitle: document.title,
        url: window.location.href
      };
    });
    
    console.log('🔍 Studio state check:', JSON.stringify(studioState, null, 2));
    
    // Try adding our own event listener to see if events work at all
    console.log('📝 Adding test event listener...');
    await page.evaluate(() => {
      let eventCount = 0;
      const testHandler = (e: KeyboardEvent) => {
        eventCount++;
        console.log(`🧪 TEST EVENT HANDLER: ${e.key}, ctrl: ${e.ctrlKey}, count: ${eventCount}`);
      };
      
      window.addEventListener('keydown', testHandler);
      (window as any).testEventCount = () => eventCount;
    });
    
    await page.waitForTimeout(200);
    
    // Now test keyboard events
    console.log('📝 Testing keyboard events...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);
    
    // Check if our test handler worked
    const testEventCount = await page.evaluate(() => {
      return (window as any).testEventCount ? (window as any).testEventCount() : 0;
    });
    
    console.log(`🧪 Test event handler captured ${testEventCount} events`);
    
    // Look for any keyboard-related logs
    const keyboardLogs = allLogs.filter(log => 
      log.includes('⌨️') || 
      log.includes('KEYBOARD') || 
      log.includes('TEST EVENT') ||
      log.includes('Ctrl+') ||
      log.includes('keydown')
    );
    
    console.log(`📊 Found ${keyboardLogs.length} keyboard-related logs:`);
    keyboardLogs.forEach((log, index) => {
      console.log(`  ${index + 1}: ${log}`);
    });
    
    // The key insight: Does ANY keyboard handling work?
    const hasAnyKeyboardHandling = testEventCount > 0;
    console.log(`🎯 Keyboard events working: ${hasAnyKeyboardHandling ? 'YES' : 'NO'}`);
    
    if (!hasAnyKeyboardHandling) {
      console.log('❌ Basic keyboard events are not working in Playwright');
      console.log('🔍 This suggests a fundamental issue with event handling in the test environment');
    } else {
      console.log('✅ Basic keyboard events work, but Studio handlers may not be attached');
    }
    
    // Pass if basic events work, even if Studio handlers don't
    expect(hasAnyKeyboardHandling).toBe(true);
  });
});