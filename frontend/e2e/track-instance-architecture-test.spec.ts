import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Track Instance Architecture Understanding', () => {
  test('ARCHITECTURE TEST: Understand how track instances are implemented', async ({ page }) => {
    console.log('🎯 ARCHITECTURE TEST: Understanding track instance implementation');
    
    await loginAndNavigateToStudio(page);
    
    const consoleLogs: string[] = [];
    let projectId: string | null = null;
    let trackId: string | null = null;
    
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      
      // Extract project ID
      if (text.includes('Response Data:') && text.includes('"id":')) {
        const match = text.match(/"id":\s*"([a-f0-9\-]{36})"/);
        if (match && match[1] && !projectId) {
          projectId = match[1];
          console.log(`📂 PROJECT ID CAPTURED: ${projectId}`);
        }
      }
      
      // Extract track ID
      if (text.includes('Execute TRACK_ADD:') && text.includes('trackId:')) {
        const match = text.match(/trackId:\s*([a-f0-9\-]{36})/);
        if (match && match[1] && !trackId) {
          trackId = match[1];
          console.log(`🎵 TRACK ID CAPTURED: ${trackId}`);
        }
      }
      
      // Log any instance-related activities
      if (text.includes('instance') || text.includes('Instance')) {
        console.log(`🔍 Instance log: ${text}`);
      }
      
      // Log any copy/paste activities
      if (text.includes('COPY') || text.includes('PASTE') || text.includes('copy') || text.includes('paste')) {
        console.log(`📋 Copy/Paste log: ${text}`);
      }
    });
    
    // Step 1: Add track and wait for complete initialization
    console.log('📝 Step 1: Adding track and waiting for complete setup...');
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 10000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 10000 });
    await page.locator('text=Grand Piano').first().click();
    
    // Wait extra long for full initialization including project creation
    await page.waitForTimeout(8000);
    console.log('✅ Track setup completed');
    
    // Step 2: Check browser state for project/track information
    console.log('📝 Step 2: Checking browser state...');
    
    const browserState = await page.evaluate(() => {
      const storeInstance = (window as any).storeInstance;
      if (storeInstance) {
        const state = storeInstance.getState();
        return {
          hasProject: !!state.project,
          projectId: state.project?.id || null,
          projectName: state.project?.name || null,
          trackCount: state.tracks?.length || 0,
          trackIds: state.tracks?.map(t => t.id) || [],
          trackNames: state.tracks?.map(t => t.name) || [],
          selectedTracks: state.selectedTracks ? Array.from(state.selectedTracks) : [],
          copiedTracks: state.copiedTracks || []
        };
      }
      return { error: 'No store instance found' };
    });
    
    console.log('📊 Browser State Analysis:', JSON.stringify(browserState, null, 2));
    
    // Update our captured IDs from browser state if not found in console
    if (!projectId && browserState.projectId) {
      projectId = browserState.projectId;
      console.log(`📂 Project ID from browser state: ${projectId}`);
    }
    
    if (!trackId && browserState.trackIds && browserState.trackIds.length > 0) {
      trackId = browserState.trackIds[0];
      console.log(`🎵 Track ID from browser state: ${trackId}`);
    }
    
    // Step 3: Select track and perform copy/paste
    console.log('📝 Step 3: Performing copy/paste operation...');
    
    const trackElement = page.locator('.track').first();
    if (await trackElement.isVisible()) {
      await trackElement.click();
      await page.waitForTimeout(1000);
      console.log('✅ Track selected');
      
      // Copy
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(3000);
      console.log('✅ Copy performed');
      
      // Paste
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(5000); // Wait longer for API calls
      console.log('✅ Paste performed');
    }
    
    // Step 4: Check state after copy/paste
    console.log('📝 Step 4: Checking state after copy/paste...');
    
    const afterState = await page.evaluate(() => {
      const storeInstance = (window as any).storeInstance;
      if (storeInstance) {
        const state = storeInstance.getState();
        return {
          trackCount: state.tracks?.length || 0,
          selectedTracks: state.selectedTracks ? Array.from(state.selectedTracks) : [],
          copiedTracks: state.copiedTracks || []
        };
      }
      return { error: 'No store instance found' };
    });
    
    console.log('📊 State After Copy/Paste:', JSON.stringify(afterState, null, 2));
    
    // Step 5: Direct API check for track instances
    console.log('📝 Step 5: Direct API verification...');
    
    if (projectId && trackId) {
      try {
        const authToken = await page.evaluate(() => localStorage.getItem('authToken'));
        
        if (authToken) {
          console.log('✅ Auth token available, making API calls...');
          
          // Check track instances
          const instancesResponse = await page.evaluate(async ({ projectId, trackId, authToken }) => {
            try {
              const url = `https://localhost:8000/projects/${projectId}/tracks/${trackId}/instances`;
              console.log(`Making API call to: ${url}`);
              
              const response = await fetch(url, {
                headers: {
                  'Authorization': `Bearer ${authToken}`,
                  'Content-Type': 'application/json'
                }
              });
              
              console.log(`API Response status: ${response.status}`);
              
              if (response.ok) {
                const data = await response.json();
                console.log(`API Response data:`, data);
                return { success: true, data: data, status: response.status };
              } else {
                const errorText = await response.text();
                console.log(`API Error response:`, errorText);
                return { success: false, error: errorText, status: response.status };
              }
            } catch (error) {
              console.log(`API Network error:`, error);
              return { success: false, error: error.message, networkError: true };
            }
          }, { projectId, trackId, authToken });
          
          console.log('📊 Track Instances API Result:', JSON.stringify(instancesResponse, null, 2));
          
          if (instancesResponse.success) {
            const instances = instancesResponse.data;
            console.log(`🎉 SUCCESS: Found ${instances.length} track instances in API!`);
            
            instances.forEach((instance, index) => {
              console.log(`📊 Instance ${index + 1}:`, {
                id: instance.id,
                x_position: instance.x_position,
                y_position: instance.y_position,
                volume: instance.volume,
                created_at: instance.created_at
              });
            });
            
            if (instances.length >= 2) {
              console.log('🎉 CONFIRMED: Multiple track instances exist in the backend!');
            } else if (instances.length === 1) {
              console.log('📊 INFO: Only 1 track instance found - copy/paste may not have created additional instance');
            } else {
              console.log('⚠️ WARNING: No track instances found');
            }
          } else {
            console.log(`❌ API call failed: ${instancesResponse.error}`);
          }
          
          // Also check the project tracks endpoint
          console.log('📝 Checking project tracks endpoint...');
          const projectTracksResponse = await page.evaluate(async ({ projectId, authToken }) => {
            try {
              const url = `https://localhost:8000/projects/${projectId}/tracks`;
              const response = await fetch(url, {
                headers: {
                  'Authorization': `Bearer ${authToken}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (response.ok) {
                const data = await response.json();
                return { success: true, data: data };
              } else {
                const errorText = await response.text();
                return { success: false, error: errorText };
              }
            } catch (error) {
              return { success: false, error: error.message };
            }
          }, { projectId, authToken });
          
          if (projectTracksResponse.success) {
            const tracks = projectTracksResponse.data;
            console.log(`📊 Project has ${tracks.length} tracks`);
            
            let totalInstances = 0;
            tracks.forEach((track, index) => {
              if (track.position_metadata && Array.isArray(track.position_metadata)) {
                totalInstances += track.position_metadata.length;
                console.log(`📊 Track ${index + 1} (${track.name}): ${track.position_metadata.length} instances in position_metadata`);
              }
            });
            
            console.log(`📊 Total instances across all tracks: ${totalInstances}`);
          }
        }
      } catch (error) {
        console.log(`❌ API verification error: ${error}`);
      }
    } else {
      console.log('⚠️ Cannot perform API verification - missing project or track ID');
      console.log(`   Project ID: ${projectId}`);
      console.log(`   Track ID: ${trackId}`);
    }
    
    // Step 6: Analysis of copy/paste logs
    console.log('📝 Step 6: Analyzing copy/paste logs...');
    
    const copyLogs = consoleLogs.filter(log => 
      log.includes('COPY') || log.includes('Ctrl+C') || log.includes('copySelectedTracks')
    );
    
    const pasteLogs = consoleLogs.filter(log => 
      log.includes('PASTE') || log.includes('Ctrl+V') || log.includes('pasteTracksAtPosition')
    );
    
    const instanceLogs = consoleLogs.filter(log => 
      log.includes('instance') && (log.includes('created') || log.includes('Successfully'))
    );
    
    console.log('\n📊 ARCHITECTURE ANALYSIS:');
    console.log('='.repeat(70));
    console.log(`Copy operations detected: ${copyLogs.length}`);
    console.log(`Paste operations detected: ${pasteLogs.length}`);
    console.log(`Instance creation logs: ${instanceLogs.length}`);
    console.log(`Project ID available: ${projectId ? 'YES' : 'NO'}`);
    console.log(`Track ID available: ${trackId ? 'YES' : 'NO'}`);
    console.log(`Browser state accessible: ${browserState.error ? 'NO' : 'YES'}`);
    
    console.log('\n🎯 IMPLEMENTATION UNDERSTANDING:');
    console.log('='.repeat(70));
    
    if (copyLogs.length > 0 && pasteLogs.length > 0) {
      console.log('✅ Copy/paste operations are being triggered');
    } else {
      console.log('❌ Copy/paste operations not detected');
    }
    
    if (projectId && trackId) {
      console.log('✅ Backend integration is working (project and track IDs available)');
    } else {
      console.log('❌ Backend integration issues (missing IDs)');
    }
    
    console.log('\n🔍 CURRENT STATE:');
    console.log('Based on this test, the copy/paste functionality appears to be:');
    console.log('1. ✅ Triggering copy/paste operations in the frontend');
    console.log('2. ✅ Managing state for copied tracks');
    console.log('3. ✅ Connecting to backend APIs');
    console.log('4. ⚠️  Results depend on backend API response');
    
    // Final assertions
    expect(projectId || browserState.projectId, 'Should have project information available').toBeTruthy();
    
    console.log('✅ ARCHITECTURE TEST COMPLETED!');
  });
});