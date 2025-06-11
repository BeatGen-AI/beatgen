import { test, expect } from '@playwright/test';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    console.log('🚀 Setting up keyboard shortcut test');
    
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

  test('should detect keyboard shortcuts for copy operation', async ({ page }) => {
    console.log('🎯 Testing keyboard shortcut detection for copy');
    
    // Monitor console for keyboard logs
    const keyboardLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('⌨️') || text.includes('KEYBOARD') || text.includes('Ctrl+')) {
        keyboardLogs.push(text);
        console.log(`🖥️ Keyboard Log: ${text}`);
      }
    });
    
    // Focus the studio area to ensure keyboard events are captured
    await page.locator('body').click();
    
    // Wait a moment
    await page.waitForTimeout(500);
    
    // Press Ctrl+C
    console.log('📝 Pressing Ctrl+C...');
    await page.keyboard.press('Control+c');
    
    // Wait for any logs to appear
    await page.waitForTimeout(1000);
    
    console.log(`📊 Found ${keyboardLogs.length} keyboard logs`);
    keyboardLogs.forEach((log, index) => {
      console.log(`  ${index + 1}: ${log}`);
    });
    
    // Check if the keyboard shortcut was detected
    const ctrlCLogs = keyboardLogs.filter(log => 
      log.includes('Ctrl+C') || log.includes('⌨️ KEYBOARD')
    );
    
    if (ctrlCLogs.length === 0) {
      console.log('❌ No Ctrl+C keyboard logs detected');
      console.log('🔍 This suggests the keyboard event handler is not working properly');
    } else {
      console.log(`✅ Found ${ctrlCLogs.length} Ctrl+C detection logs`);
    }
    
    // The test passes if we detect keyboard shortcuts
    expect(ctrlCLogs.length).toBeGreaterThan(0);
  });

  test('should detect keyboard shortcuts for paste operation', async ({ page }) => {
    console.log('🎯 Testing keyboard shortcut detection for paste');
    
    const keyboardLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('⌨️') || text.includes('KEYBOARD') || text.includes('Ctrl+')) {
        keyboardLogs.push(text);
        console.log(`🖥️ Keyboard Log: ${text}`);
      }
    });
    
    // Focus the studio area
    await page.locator('body').click();
    await page.waitForTimeout(500);
    
    // Press Ctrl+V
    console.log('📝 Pressing Ctrl+V...');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    const ctrlVLogs = keyboardLogs.filter(log => 
      log.includes('Ctrl+V') || log.includes('⌨️ KEYBOARD')
    );
    
    console.log(`📊 Found ${ctrlVLogs.length} Ctrl+V logs`);
    expect(ctrlVLogs.length).toBeGreaterThan(0);
  });
});