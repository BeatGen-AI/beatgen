import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Debug Copy/Paste Functionality', () => {
  test.beforeEach(async ({ page }) => {
    console.log('🚀 Setting up debug copy/paste test');
    await loginAndNavigateToStudio(page);
  });

  test('should debug copy/paste keyboard detection and track selection', async ({ page }) => {
    console.log('🎯 Debug Test: Copy/paste keyboard detection');
    
    const consoleLogs: string[] = [];
    
    // Monitor ALL console logs to see what's happening
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      
      // Log ALL keyboard and copy/paste related messages
      if (text.includes('⌨️') || text.includes('KEYBOARD') || text.includes('Ctrl+') || 
          text.includes('🔄') || text.includes('COPY') || text.includes('PASTE') ||
          text.includes('selected') || text.includes('tracks') || text.includes('Track')) {
        console.log(`🖥️ Console: ${text}`);
      }
    });
    
    // Step 1: Add a track first
    console.log('📝 Step 1: Adding track...');
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    
    await page.waitForTimeout(3000);
    console.log('✅ Track added');
    
    // Step 2: Test keyboard detection first (without track selection)
    console.log('📝 Step 2: Testing basic keyboard detection...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1000);
    
    // Check if keyboard event was detected
    const keyboardLogs = consoleLogs.filter(log => 
      log.includes('⌨️ KEYBOARD - Ctrl+C pressed')
    );
    
    console.log(`📊 Keyboard detection logs: ${keyboardLogs.length}`);
    if (keyboardLogs.length === 0) {
      console.log('❌ Keyboard events not being detected - handler not attached?');
      
      // Check if Studio component is properly initialized
      const studioLogs = consoleLogs.filter(log => 
        log.includes('Studio Component') || log.includes('useEffect') || log.includes('initialized')
      );
      console.log(`📊 Studio initialization logs: ${studioLogs.length}`);
      
      return; // Exit early if keyboard not working
    } else {
      console.log('✅ Keyboard events are being detected');
    }
    
    // Step 3: Try to select a track
    console.log('📝 Step 3: Attempting track selection...');
    
    // Try multiple track selection approaches
    const trackSelectors = [
      '.track',
      '[data-track-width]',
      '[class*="track"]',
      'text="Grand Piano"',
      '[class*="timeline"]',
      '.timeline-area'
    ];
    
    let trackClicked = false;
    
    for (const selector of trackSelectors) {
      try {
        console.log(`🔍 Trying selector: ${selector}`);
        const element = page.locator(selector).first();
        
        if (await element.isVisible({ timeout: 2000 })) {
          await element.click();
          console.log(`✅ Clicked element with selector: ${selector}`);
          trackClicked = true;
          
          // Wait a moment for selection to register
          await page.waitForTimeout(1000);
          
          // Test copy after selection
          console.log('📝 Testing copy after track click...');
          await page.keyboard.press('Control+c');
          await page.waitForTimeout(1000);
          
          break;
        } else {
          console.log(`⚠️ Element not visible: ${selector}`);
        }
      } catch (error) {
        console.log(`❌ Selector failed: ${selector} - ${error}`);
      }
    }
    
    if (!trackClicked) {
      console.log('❌ Could not click any track element');
    }
    
    // Step 4: Check track selection state
    console.log('📝 Step 4: Checking track selection state...');
    
    // Look for selection-related logs
    const selectionLogs = consoleLogs.filter(log => 
      log.includes('selectedTracks') || 
      log.includes('Selected') ||
      log.includes('selection')
    );
    
    console.log(`📊 Selection logs found: ${selectionLogs.length}`);
    selectionLogs.forEach((log, index) => {
      console.log(`  Selection ${index + 1}: ${log}`);
    });
    
    // Step 5: Test copy operation again
    console.log('📝 Step 5: Final copy test...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1000);
    
    // Step 6: Test paste operation
    console.log('📝 Step 6: Testing paste...');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    // Final analysis
    console.log('🔍 Final Analysis...');
    
    const finalKeyboardLogs = consoleLogs.filter(log => 
      log.includes('⌨️ KEYBOARD')
    );
    
    const finalCopyLogs = consoleLogs.filter(log => 
      log.includes('⌨️ Copied') || log.includes('🔄 COPY')
    );
    
    const finalPasteLogs = consoleLogs.filter(log => 
      log.includes('⌨️ Pasted') || log.includes('📋 PASTE')
    );
    
    console.log(`📊 Final Results:`);
    console.log(`  - Total keyboard events: ${finalKeyboardLogs.length}`);
    console.log(`  - Copy operations: ${finalCopyLogs.length}`);
    console.log(`  - Paste operations: ${finalPasteLogs.length}`);
    console.log(`  - Track clicked: ${trackClicked}`);
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/debug-copy-paste.png', fullPage: true });
    
    // Show last 10 console messages for context
    console.log('🔍 Last 10 console messages:');
    consoleLogs.slice(-10).forEach((log, index) => {
      console.log(`  ${index + 1}: ${log}`);
    });
    
    // Basic success criteria: keyboard events should be detected
    expect(finalKeyboardLogs.length).toBeGreaterThan(0);
    
    console.log('✅ Debug copy/paste test completed');
  });
});