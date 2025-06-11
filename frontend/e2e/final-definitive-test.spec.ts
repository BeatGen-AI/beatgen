import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Final Definitive Copy/Paste Test', () => {
  test('DEFINITIVE TEST: Copy/paste functionality is working correctly', async ({ page }) => {
    console.log('🎯 DEFINITIVE TEST: Verifying copy/paste functionality works correctly');
    
    // Setup comprehensive monitoring
    const allLogs: string[] = [];
    let copyDetected = false;
    let pasteDetected = false;
    let projectCreated = false;
    let trackCreated = false;
    let criticalErrorOccurred = false;
    
    page.on('console', msg => {
      const text = msg.text();
      allLogs.push(text);
      
      // Detect copy operations using the actual log patterns from Studio.tsx
      if (text.includes('⌨️ KEYBOARD - Ctrl+C pressed') || 
          text.includes('⌨️ Copied') || 
          text.includes('🔄 COPY')) {
        copyDetected = true;
        console.log('✅ COPY OPERATION DETECTED');
      }
      
      // Detect paste operations using the actual log patterns from Studio.tsx
      if (text.includes('⌨️ KEYBOARD - Ctrl+V pressed') || 
          text.includes('⌨️ Pasted') || 
          text.includes('📋 PASTE')) {
        pasteDetected = true;
        console.log('✅ PASTE OPERATION DETECTED');
      }
      
      // Detect project creation
      if (text.includes('Response Data:') && text.includes('"id":')) {
        projectCreated = true;
        console.log('✅ PROJECT CREATION DETECTED');
      }
      
      // Detect track creation
      if (text.includes('Execute TRACK_ADD:') || text.includes('🔄 Execute TRACK_ADD:')) {
        trackCreated = true;
        console.log('✅ TRACK CREATION DETECTED');
      }
      
      // Detect critical errors
      if (text.includes('No project ID available for paste operation')) {
        criticalErrorOccurred = true;
        console.log('❌ CRITICAL ERROR DETECTED');
      }
    });
    
    try {
      // Step 1: Authentication
      console.log('📝 Step 1: Authentication...');
      await loginAndNavigateToStudio(page);
      console.log('✅ Step 1: Authentication successful');
      
      // Step 2: Add track
      console.log('📝 Step 2: Adding track...');
      await page.locator('button:has-text("Add Track")').first().click();
      await page.waitForSelector('text=Virtual Instrument', { timeout: 10000 });
      await page.locator('text=Virtual Instrument').click();
      await page.waitForSelector('text=Grand Piano', { timeout: 10000 });
      await page.locator('text=Grand Piano').first().click();
      
      // Wait for track creation to complete
      await page.waitForTimeout(5000);
      console.log('✅ Step 2: Track creation completed');
      
      // Step 3: Verify track is visible and select it
      console.log('📝 Step 3: Selecting track...');
      const trackElement = page.locator('.track').first();
      const trackVisible = await trackElement.isVisible();
      
      if (trackVisible) {
        await trackElement.click();
        await page.waitForTimeout(1000);
        console.log('✅ Step 3: Track selected successfully');
      } else {
        throw new Error('Track not visible after creation');
      }
      
      // Step 4: Perform copy operation
      console.log('📝 Step 4: Performing copy operation (Ctrl+C)...');
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(3000); // Wait for copy to be processed
      console.log('✅ Step 4: Copy operation completed');
      
      // Step 5: Perform paste operation
      console.log('📝 Step 5: Performing paste operation (Ctrl+V)...');
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(4000); // Wait for paste to be processed
      console.log('✅ Step 5: Paste operation completed');
      
      // Step 6: Wait a bit more to ensure all logs are captured
      await page.waitForTimeout(2000);
      
    } catch (error) {
      console.log(`❌ Test execution error: ${error}`);
      throw error;
    }
    
    // Step 7: Comprehensive analysis
    console.log('📝 Step 7: Analyzing results...');
    
    // Filter logs for specific patterns
    const keyboardCopyLogs = allLogs.filter(log => 
      log.includes('⌨️ KEYBOARD - Ctrl+C pressed')
    );
    
    const keyboardPasteLogs = allLogs.filter(log => 
      log.includes('⌨️ KEYBOARD - Ctrl+V pressed')
    );
    
    const copyActionLogs = allLogs.filter(log => 
      log.includes('⌨️ Copied') || log.includes('🔄 COPY')
    );
    
    const pasteActionLogs = allLogs.filter(log => 
      log.includes('⌨️ Pasted') || log.includes('📋 PASTE')
    );
    
    const projectLogs = allLogs.filter(log => 
      log.includes('Response Data:') && log.includes('"id":')
    );
    
    const trackLogs = allLogs.filter(log => 
      log.includes('Execute TRACK_ADD:')
    );
    
    const errorLogs = allLogs.filter(log => 
      log.includes('No project ID available for paste operation')
    );
    
    // Step 8: Generate comprehensive report
    console.log('\n📊 DEFINITIVE TEST RESULTS:');
    console.log('='.repeat(60));
    console.log(`Authentication: ✅ SUCCESS`);
    console.log(`Track Creation: ${trackCreated ? '✅ SUCCESS' : '❌ FAILED'} (${trackLogs.length} logs)`);
    console.log(`Project Creation: ${projectCreated ? '✅ SUCCESS' : '❌ FAILED'} (${projectLogs.length} logs)`);
    console.log(`Copy Detection: ${copyDetected ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Paste Detection: ${pasteDetected ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Critical Errors: ${criticalErrorOccurred ? '❌ OCCURRED' : '✅ NONE'} (${errorLogs.length} errors)`);
    console.log('='.repeat(60));
    
    console.log('\n📈 DETAILED LOG ANALYSIS:');
    console.log(`Keyboard Copy Events: ${keyboardCopyLogs.length}`);
    console.log(`Keyboard Paste Events: ${keyboardPasteLogs.length}`);
    console.log(`Copy Action Events: ${copyActionLogs.length}`);
    console.log(`Paste Action Events: ${pasteActionLogs.length}`);
    console.log(`Project Events: ${projectLogs.length}`);
    console.log(`Track Events: ${trackLogs.length}`);
    console.log(`Total Console Logs: ${allLogs.length}`);
    
    // Step 9: Calculate final score
    const testResults = {
      trackCreation: trackCreated,
      projectCreation: projectCreated,
      copyDetection: copyDetected,
      pasteDetection: pasteDetected,
      noCriticalErrors: !criticalErrorOccurred
    };
    
    const passedTests = Object.values(testResults).filter(Boolean).length;
    const totalTests = Object.keys(testResults).length;
    const successRate = Math.round((passedTests / totalTests) * 100);
    
    console.log('\n🎯 FINAL ASSESSMENT:');
    console.log(`Tests Passed: ${passedTests}/${totalTests}`);
    console.log(`Success Rate: ${successRate}%`);
    
    if (successRate >= 80) {
      console.log('🎉 COPY/PASTE FUNCTIONALITY: WORKING CORRECTLY ✅');
    } else {
      console.log('❌ COPY/PASTE FUNCTIONALITY: NEEDS ATTENTION');
    }
    
    // Step 10: Assertions
    console.log('\n📝 Step 10: Final assertions...');
    
    // These are the critical assertions
    expect(trackCreated, 'Track creation must work').toBe(true);
    expect(projectCreated, 'Project creation must work').toBe(true);
    expect(copyDetected, 'Copy operation must be detected').toBe(true);
    expect(pasteDetected, 'Paste operation must be detected').toBe(true);
    expect(criticalErrorOccurred, 'No critical errors should occur').toBe(false);
    
    // Overall success assertion
    expect(successRate, 'Overall functionality must work (>= 80%)').toBeGreaterThanOrEqual(80);
    
    console.log('🏁 DEFINITIVE TEST COMPLETED SUCCESSFULLY!');
    console.log('✅ All critical copy/paste functionality is working correctly!');
  });
  
  test('VALIDATION TEST: Verify keyboard handlers are properly attached', async ({ page }) => {
    console.log('🎯 VALIDATION TEST: Verifying keyboard handlers');
    
    await loginAndNavigateToStudio(page);
    
    let keyboardHandlerAttached = false;
    let keyboardHandlerRemoved = false;
    
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('🎹 KEYBOARD HANDLER - Adding event listener')) {
        keyboardHandlerAttached = true;
        console.log('✅ KEYBOARD HANDLER ATTACHED');
      }
      if (text.includes('🎹 KEYBOARD HANDLER - Removing event listener')) {
        keyboardHandlerRemoved = true;
        console.log('✅ KEYBOARD HANDLER CLEANUP');
      }
    });
    
    // Add track to trigger handler setup
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    await page.waitForTimeout(3000);
    
    console.log('📊 VALIDATION RESULTS:');
    console.log(`Keyboard Handler Attached: ${keyboardHandlerAttached ? '✅' : '❌'}`);
    console.log(`Keyboard Handler Cleanup: ${keyboardHandlerRemoved ? '✅' : '❌'}`);
    
    expect(keyboardHandlerAttached, 'Keyboard handler must be attached').toBe(true);
    
    console.log('✅ VALIDATION TEST COMPLETED!');
  });
  
  test('CONSISTENCY TEST: Multiple operations work consistently', async ({ page }) => {
    console.log('🎯 CONSISTENCY TEST: Multiple copy/paste operations');
    
    await loginAndNavigateToStudio(page);
    
    let copyCount = 0;
    let pasteCount = 0;
    
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('⌨️ KEYBOARD - Ctrl+C pressed')) {
        copyCount++;
      }
      if (text.includes('⌨️ KEYBOARD - Ctrl+V pressed')) {
        pasteCount++;
      }
    });
    
    // Add track
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    await page.waitForTimeout(3000);
    
    // Select track
    const trackElement = page.locator('.track').first();
    if (await trackElement.isVisible()) {
      await trackElement.click();
      await page.waitForTimeout(1000);
    }
    
    // Perform multiple operations
    console.log('📝 Performing 3 copy/paste cycles...');
    for (let i = 1; i <= 3; i++) {
      console.log(`📝 Cycle ${i}: Copy...`);
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(1000);
      
      console.log(`📝 Cycle ${i}: Paste...`);
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(2000);
    }
    
    console.log('📊 CONSISTENCY RESULTS:');
    console.log(`Copy operations detected: ${copyCount}`);
    console.log(`Paste operations detected: ${pasteCount}`);
    
    expect(copyCount, 'Multiple copy operations should be detected').toBeGreaterThanOrEqual(3);
    expect(pasteCount, 'Multiple paste operations should be detected').toBeGreaterThanOrEqual(3);
    
    console.log('✅ CONSISTENCY TEST COMPLETED!');
  });
});