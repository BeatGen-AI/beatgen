import { test, expect } from '@playwright/test';

test.describe('Simple Keyboard Test', () => {
  test('should test basic keyboard event detection', async ({ page }) => {
    console.log('🚀 Starting simple keyboard test');
    
    // Navigate to any page (even a simple one) to test keyboard events
    await page.goto('data:text/html,<html><body><script>window.testEvents = []; document.addEventListener("keydown", e => { window.testEvents.push({key: e.key, ctrl: e.ctrlKey}); console.log("KEY:", e.key, "CTRL:", e.ctrlKey); });</script><h1>Test Page</h1></body></html>');
    
    await page.waitForTimeout(500);
    
    // Monitor console logs
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      console.log(`🖥️ Console: ${text}`);
    });
    
    // Press Ctrl+C
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);
    
    // Check if events were captured
    const events = await page.evaluate(() => (window as any).testEvents);
    console.log('📊 Captured events:', events);
    console.log('📊 Console logs:', consoleLogs);
    
    expect(events.length).toBeGreaterThan(0);
    expect(consoleLogs.length).toBeGreaterThan(0);
  });
});