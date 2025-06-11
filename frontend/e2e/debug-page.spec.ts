import { test, expect } from '@playwright/test';

test.describe('Debug Page Loading', () => {
  test('should debug what is on the page', async ({ page }) => {
    console.log('🔍 Debug: Checking what loads on the page');
    
    // Navigate to the main page first
    await page.goto('https://localhost:5173/');
    await page.waitForLoadState('networkidle');
    
    // Take a screenshot to see what's there
    await page.screenshot({ path: 'test-results/debug-homepage.png', fullPage: true });
    
    // Get the page title and URL
    const title = await page.title();
    const url = page.url();
    console.log(`📄 Page Title: ${title}`);
    console.log(`🔗 Current URL: ${url}`);
    
    // Check what text is visible on the page
    const bodyText = await page.locator('body').textContent();
    console.log(`📝 Page Content (first 500 chars): ${bodyText?.substring(0, 500)}`);
    
    // Check if we're on login page
    const hasLogin = await page.locator('text=Login').isVisible();
    const hasRegister = await page.locator('text=Register').isVisible();
    const hasStudio = await page.locator('text=Studio').first().isVisible();
    const hasAddTrack = await page.locator('text=Add Track').isVisible();
    
    console.log(`🔑 Has Login: ${hasLogin}`);
    console.log(`📝 Has Register: ${hasRegister}`);
    console.log(`🎵 Has Studio: ${hasStudio}`);
    console.log(`➕ Has Add Track: ${hasAddTrack}`);
    
    // Try to navigate to studio
    console.log('🎯 Attempting to navigate to studio');
    await page.goto('https://localhost:5173/studio');
    await page.waitForLoadState('networkidle');
    
    // Take another screenshot
    await page.screenshot({ path: 'test-results/debug-studio.png', fullPage: true });
    
    const studioTitle = await page.title();
    const studioUrl = page.url();
    console.log(`📄 Studio Page Title: ${studioTitle}`);
    console.log(`🔗 Studio Current URL: ${studioUrl}`);
    
    // Check studio page content
    const studioBodyText = await page.locator('body').textContent();
    console.log(`📝 Studio Page Content (first 500 chars): ${studioBodyText?.substring(0, 500)}`);
    
    // Check for various elements that might indicate studio loaded
    const hasAddTrackOnStudio = await page.locator('text=Add Track').isVisible();
    const hasBPM = await page.locator('text=BPM').or(page.locator('text=bpm')).isVisible();
    const hasTimeline = await page.locator('[class*="timeline"]').isVisible();
    const hasControlBar = await page.locator('[class*="control"]').isVisible();
    
    console.log(`➕ Studio Has Add Track: ${hasAddTrackOnStudio}`);
    console.log(`🎵 Studio Has BPM: ${hasBPM}`);
    console.log(`📊 Studio Has Timeline: ${hasTimeline}`);
    console.log(`🎛️ Studio Has Control Bar: ${hasControlBar}`);
    
    // Get all button text to see what's available
    const buttons = await page.locator('button').all();
    const buttonTexts = await Promise.all(buttons.map(async (button) => {
      try {
        return await button.textContent();
      } catch {
        return null;
      }
    }));
    
    console.log(`🔘 Available buttons: ${buttonTexts.filter(Boolean).join(', ')}`);
  });
});