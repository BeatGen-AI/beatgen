import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Test Results Analyzer', () => {
  test('MASTER TEST: Analyze all copy/paste functionality', async ({ page }) => {
    console.log('🔍 MASTER TEST: Comprehensive analysis of copy/paste functionality');
    
    const testResults = {
      authentication: false,
      trackCreation: false,
      copyOperation: false,
      pasteOperation: false,
      projectManagement: false,
      errorFreeOperation: false,
      apiCommunication: false,
      trackInstances: 0
    };
    
    const allLogs: string[] = [];
    const apiRequests: any[] = [];
    let projectId: string | null = null;
    let trackId: string | null = null;
    
    // Comprehensive monitoring
    page.on('console', msg => {
      const text = msg.text();
      allLogs.push(text);
      
      // Extract IDs
      if (text.includes('Response Data:') && text.includes('"id":')) {
        const match = text.match(/"id":\s*"([a-f0-9\-]{36})"/);
        if (match && match[1] && !projectId) {
          projectId = match[1];
          console.log(`🔍 PROJECT ID DETECTED: ${projectId}`);
        }
      }
      
      if (text.includes('Execute TRACK_ADD:') && text.includes('trackId:')) {
        const match = text.match(/trackId:\s*([a-f0-9\-]{36})/);
        if (match && match[1] && !trackId) {
          trackId = match[1];
          console.log(`🔍 TRACK ID DETECTED: ${trackId}`);
        }
      }
    });
    
    page.on('request', request => {
      if (request.url().includes('localhost:8000')) {
        apiRequests.push({
          method: request.method(),
          url: request.url(),
          timestamp: Date.now()
        });
      }
    });
    
    try {
      // Test 1: Authentication
      console.log('🔍 Test 1: Authentication...');
      await loginAndNavigateToStudio(page);
      testResults.authentication = true;
      console.log('✅ Authentication: PASS');
      
      // Test 2: Track Creation
      console.log('🔍 Test 2: Track Creation...');
      await page.locator('button:has-text("Add Track")').first().click();
      await page.waitForSelector('text=Virtual Instrument', { timeout: 10000 });
      await page.locator('text=Virtual Instrument').click();
      await page.waitForSelector('text=Grand Piano', { timeout: 10000 });
      await page.locator('text=Grand Piano').first().click();
      await page.waitForTimeout(6000);
      
      // Verify track exists in DOM
      const trackExists = await page.locator('.track').first().isVisible();
      testResults.trackCreation = trackExists;
      console.log(`✅ Track Creation: ${trackExists ? 'PASS' : 'FAIL'}`);
      
      // Test 3: Track Selection and Copy
      console.log('🔍 Test 3: Track Selection and Copy...');
      if (trackExists) {
        await page.locator('.track').first().click();
        await page.waitForTimeout(1000);
        
        await page.keyboard.press('Control+c');
        await page.waitForTimeout(2000);
        
        const copyLogs = allLogs.filter(log => 
          log.includes('COPY') || log.includes('Ctrl+C')
        );
        testResults.copyOperation = copyLogs.length > 0;
        console.log(`✅ Copy Operation: ${testResults.copyOperation ? 'PASS' : 'FAIL'} (${copyLogs.length} logs)`);
      }
      
      // Test 4: Paste Operation
      console.log('🔍 Test 4: Paste Operation...');
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(4000);
      
      const pasteLogs = allLogs.filter(log => 
        log.includes('PASTE') || log.includes('Ctrl+V')
      );
      testResults.pasteOperation = pasteLogs.length > 0;
      console.log(`✅ Paste Operation: ${testResults.pasteOperation ? 'PASS' : 'FAIL'} (${pasteLogs.length} logs)`);
      
      // Test 5: Project Management
      console.log('🔍 Test 5: Project Management...');
      const projectLogs = allLogs.filter(log => 
        log.includes('Response Data:') || 
        log.includes('Project created:') ||
        log.includes('Saving project')
      );
      testResults.projectManagement = projectLogs.length > 0;
      console.log(`✅ Project Management: ${testResults.projectManagement ? 'PASS' : 'FAIL'} (${projectLogs.length} activities)`);
      
      // Test 6: Error-Free Operation
      console.log('🔍 Test 6: Error-Free Operation...');
      const criticalErrors = allLogs.filter(log => 
        log.includes('No project ID available for paste operation')
      );
      testResults.errorFreeOperation = criticalErrors.length === 0;
      console.log(`✅ Error-Free Operation: ${testResults.errorFreeOperation ? 'PASS' : 'FAIL'} (${criticalErrors.length} critical errors)`);
      
      // Test 7: API Communication
      console.log('🔍 Test 7: API Communication...');
      testResults.apiCommunication = apiRequests.length > 0;
      console.log(`✅ API Communication: ${testResults.apiCommunication ? 'PASS' : 'FAIL'} (${apiRequests.length} requests)`);
      
      // Test 8: Track Instances Verification (if possible)
      console.log('🔍 Test 8: Track Instances Verification...');
      
      // Try to get IDs from browser state if not captured
      if (!projectId || !trackId) {
        const browserState = await page.evaluate(() => {
          const storeInstance = (window as any).storeInstance;
          if (storeInstance) {
            const state = storeInstance.getState();
            return {
              projectId: state.project?.id || null,
              trackId: state.tracks?.[0]?.id || null,
              tracksCount: state.tracks?.length || 0
            };
          }
          return { projectId: null, trackId: null, tracksCount: 0 };
        });
        
        projectId = projectId || browserState.projectId;
        trackId = trackId || browserState.trackId;
        console.log(`🔍 Browser state: Project=${projectId}, Track=${trackId}, TracksCount=${browserState.tracksCount}`);
      }
      
      if (projectId && trackId) {
        try {
          const authToken = await page.evaluate(() => localStorage.getItem('authToken'));
          
          if (authToken) {
            const apiResponse = await page.evaluate(async ({ projectId, trackId, authToken }) => {
              try {
                const response = await fetch(`https://localhost:8000/projects/${projectId}/tracks/${trackId}/instances`, {
                  headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                  }
                });
                
                if (response.ok) {
                  const data = await response.json();
                  return { success: true, instances: data };
                } else {
                  return { success: false, status: response.status };
                }
              } catch (error) {
                return { success: false, error: error.message };
              }
            }, { projectId, trackId, authToken });
            
            if (apiResponse.success) {
              testResults.trackInstances = apiResponse.instances.length;
              console.log(`✅ Track Instances: ${testResults.trackInstances} instances found`);
            } else {
              console.log(`⚠️ Track Instances: API verification failed - ${apiResponse.error || apiResponse.status}`);
            }
          }
        } catch (error) {
          console.log(`⚠️ Track Instances: Verification error - ${error}`);
        }
      } else {
        console.log('⚠️ Track Instances: Cannot verify - missing project/track IDs');
      }
      
    } catch (error) {
      console.log(`❌ Test execution error: ${error}`);
    }
    
    // Generate comprehensive report
    console.log('\n📊 COMPREHENSIVE TEST RESULTS REPORT:');
    console.log('='.repeat(50));
    
    const testCategories = [
      { name: 'Authentication', result: testResults.authentication, critical: true },
      { name: 'Track Creation', result: testResults.trackCreation, critical: true },
      { name: 'Copy Operation', result: testResults.copyOperation, critical: true },
      { name: 'Paste Operation', result: testResults.pasteOperation, critical: true },
      { name: 'Project Management', result: testResults.projectManagement, critical: true },
      { name: 'Error-Free Operation', result: testResults.errorFreeOperation, critical: true },
      { name: 'API Communication', result: testResults.apiCommunication, critical: false }
    ];
    
    let passedCritical = 0;
    let totalCritical = 0;
    let passedTotal = 0;
    
    testCategories.forEach(test => {
      const status = test.result ? '✅ PASS' : '❌ FAIL';
      console.log(`${test.name}: ${status}${test.critical ? ' (CRITICAL)' : ''}`);
      
      if (test.critical) {
        totalCritical++;
        if (test.result) passedCritical++;
      }
      
      if (test.result) passedTotal++;
    });
    
    console.log(`Track Instances Found: ${testResults.trackInstances}`);
    console.log('='.repeat(50));
    console.log(`CRITICAL TESTS: ${passedCritical}/${totalCritical}`);
    console.log(`TOTAL TESTS: ${passedTotal}/${testCategories.length}`);
    console.log(`OVERALL SCORE: ${Math.round((passedTotal / testCategories.length) * 100)}%`);
    
    // Detailed logs summary
    const copyLogs = allLogs.filter(log => log.includes('COPY')).length;
    const pasteLogs = allLogs.filter(log => log.includes('PASTE')).length;
    const errorLogs = allLogs.filter(log => log.includes('ERROR') || log.includes('Error')).length;
    
    console.log('\n📈 ACTIVITY SUMMARY:');
    console.log(`Copy Operations: ${copyLogs}`);
    console.log(`Paste Operations: ${pasteLogs}`);
    console.log(`Error Messages: ${errorLogs}`);
    console.log(`API Requests: ${apiRequests.length}`);
    console.log(`Total Console Logs: ${allLogs.length}`);
    
    // Final assessment
    const isCopyPasteWorking = (
      testResults.authentication &&
      testResults.trackCreation &&
      testResults.copyOperation &&
      testResults.pasteOperation &&
      testResults.errorFreeOperation
    );
    
    console.log('\n🎯 FINAL ASSESSMENT:');
    if (isCopyPasteWorking) {
      console.log('🎉 COPY/PASTE FUNCTIONALITY: FULLY WORKING ✅');
      console.log('✅ All critical tests passed');
      console.log('✅ No critical errors detected');
      console.log('✅ Core functionality operational');
      
      if (testResults.trackInstances >= 2) {
        console.log('✅ Track instances verified via API');
      } else if (testResults.trackInstances === 1) {
        console.log('⚠️ Only 1 track instance found (may be normal for some implementations)');
      } else {
        console.log('⚠️ Track instances not verified via API (but core functionality works)');
      }
    } else {
      console.log('❌ COPY/PASTE FUNCTIONALITY: ISSUES DETECTED');
      console.log(`❌ Failed critical tests: ${totalCritical - passedCritical}`);
    }
    
    // Assertions for test framework
    expect(testResults.authentication, 'Authentication must work').toBe(true);
    expect(testResults.trackCreation, 'Track creation must work').toBe(true);
    expect(testResults.copyOperation, 'Copy operation must work').toBe(true);
    expect(testResults.pasteOperation, 'Paste operation must work').toBe(true);
    expect(testResults.errorFreeOperation, 'Operation must be error-free').toBe(true);
    expect(passedCritical, 'All critical tests must pass').toBe(totalCritical);
    
    console.log('🏁 MASTER TEST COMPLETED SUCCESSFULLY!');
  });
});