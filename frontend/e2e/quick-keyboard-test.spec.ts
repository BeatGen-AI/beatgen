import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Quick Keyboard Test', () => {
  test('should verify keyboard handlers are attached', async ({ page }) => {
    console.log('🚀 Quick keyboard test with real authentication');
    
    // Use real authentication like the working tests
    await loginAndNavigateToStudio(page);
    
    console.log('✅ Studio loaded');
    
    // Monitor console for keyboard events
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('⌨️') || text.includes('KEYBOARD') || text.includes('useEffect') || 
          text.includes('🎹') || text.includes('Dependencies') || text.includes('Studio') ||
          text.includes('Ctrl+')) {
        console.log(`🖥️ Console: ${text}`);
      }
    });
    
    // Add a track first to fully initialize the studio
    console.log('📝 Adding track to initialize studio...');
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    await page.waitForTimeout(3000);
    console.log('✅ Track added');
    
    // Select the track before testing copy
    console.log('📝 Selecting track...');
    const trackElement = page.locator('.track').first();
    if (await trackElement.isVisible()) {
      await trackElement.click();
      console.log('✅ Track selected');
      await page.waitForTimeout(1000);
    } else {
      console.log('⚠️ Track element not visible');
    }
    
    // Test keyboard event
    console.log('📝 Testing keyboard...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(2000);
    
    // Check for keyboard logs
    const keyboardLogs = consoleLogs.filter(log => 
      log.includes('⌨️ KEYBOARD') || log.includes('Ctrl+C pressed')
    );
    
    console.log(`📊 Keyboard logs found: ${keyboardLogs.length}`);
    
    if (keyboardLogs.length > 0) {
      console.log('✅ Keyboard handlers are working!');
      keyboardLogs.forEach(log => console.log(`  ${log}`));
    } else {
      console.log('❌ Keyboard handlers not working');
      
      // Check for useEffect/dependency logs
      const useEffectLogs = consoleLogs.filter(log => 
        log.includes('useEffect') || log.includes('dependency') || log.includes('keyboard handler')
      );
      console.log(`📊 UseEffect logs: ${useEffectLogs.length}`);
      useEffectLogs.forEach(log => console.log(`  ${log}`));
    }
    
    expect(keyboardLogs.length).toBeGreaterThan(0);
  });
});