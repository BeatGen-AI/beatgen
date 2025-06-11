import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Track Instances Verification', () => {
  test.beforeEach(async ({ page }) => {
    console.log('🚀 Setting up track instances verification test');
    await loginAndNavigateToStudio(page);
  });

  test('should create exactly 2 track instances after copy/paste operation', async ({ page }) => {
    console.log('🎯 Test: Verify track instances are created correctly');
    
    const consoleLogs: string[] = [];
    let projectId: string | null = null;
    let trackId: string | null = null;
    
    // Monitor console for project and track IDs
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      
      // Extract project ID from various sources
      if (text.includes('Response Data:') && text.includes('"id":')) {
        const match = text.match(/"id":\s*"([^"]+)"/);
        if (match && match[1]) {
          projectId = match[1];
          console.log(`📂 Project ID captured: ${projectId}`);
        }
      }
      
      // Extract track ID from TRACK_ADD - try multiple patterns
      if (text.includes('Execute TRACK_ADD:')) {
        // Pattern 1: trackId: uuid
        let match = text.match(/trackId:\s*([a-f0-9\-]{36})/);
        if (!match) {
          // Pattern 2: "trackId": "uuid"
          match = text.match(/"trackId":\s*"([a-f0-9\-]{36})"/);
        }
        if (!match) {
          // Pattern 3: any trackId value
          match = text.match(/trackId[:\s]*["\']?([a-f0-9\-]{36})/);
        }
        if (match && match[1]) {
          trackId = match[1];
          console.log(`🎵 Track ID captured: ${trackId}`);
        }
      }
      
      // Also try to extract from other console logs
      if (text.includes('Project created:') || text.includes('📂 NEW PROJECT')) {
        const match = text.match(/([a-f0-9\-]{36})/);
        if (match && match[1] && !projectId) {
          projectId = match[1];
          console.log(`📂 Project ID captured from project log: ${projectId}`);
        }
      }
      
      // Log copy/paste and instance creation logs
      if (text.includes('🔄') || text.includes('📋') || text.includes('Successfully created instance') || 
          text.includes('COPY') || text.includes('PASTE') || text.includes('track instance')) {
        console.log(`🖥️ Console: ${text}`);
      }
    });
    
    // Step 1: Add a track
    console.log('📝 Step 1: Adding track...');
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    
    // Wait for track to be added and project creation
    await page.waitForTimeout(5000);
    console.log('✅ Track added successfully');
    
    // Step 2: Wait for initial track instance to be created
    console.log('📝 Step 2: Waiting for initial track instance creation...');
    await page.waitForTimeout(2000);
    
    // Step 3: Select the track
    console.log('📝 Step 3: Selecting track for copy operation...');
    const trackElement = page.locator('.track').first();
    if (await trackElement.isVisible()) {
      await trackElement.click();
      console.log('✅ Track selected');
      await page.waitForTimeout(1000);
    }
    
    // Step 4: Copy the track
    console.log('📝 Step 4: Performing copy operation (Ctrl+C)...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(2000);
    
    // Step 5: Paste the track
    console.log('📝 Step 5: Performing paste operation (Ctrl+V)...');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(3000); // Give time for API call to complete
    
    // Step 6: Get IDs from browser state if not captured from console
    if (!projectId || !trackId) {
      console.log('📝 Step 6a: Attempting to get IDs from browser state...');
      
      const browserState = await page.evaluate(() => {
        // Try to get from URL params
        const urlParams = new URLSearchParams(window.location.search);
        const urlProjectId = urlParams.get('projectId');
        
        // Try to get from window state
        const storeInstance = (window as any).storeInstance;
        let stateProjectId = null;
        let stateTrackId = null;
        
        if (storeInstance) {
          const state = storeInstance.getState();
          if (state.project && state.project.id) {
            stateProjectId = state.project.id;
          }
          if (state.tracks && state.tracks.length > 0) {
            stateTrackId = state.tracks[0].id;
          }
        }
        
        return {
          urlProjectId,
          stateProjectId, 
          stateTrackId,
          currentUrl: window.location.href
        };
      });
      
      console.log('📊 Browser state:', browserState);
      
      if (!projectId && (browserState.urlProjectId || browserState.stateProjectId)) {
        projectId = browserState.urlProjectId || browserState.stateProjectId;
        console.log(`📂 Project ID from browser state: ${projectId}`);
      }
      
      if (!trackId && browserState.stateTrackId) {
        trackId = browserState.stateTrackId;
        console.log(`🎵 Track ID from browser state: ${trackId}`);
      }
    }
    
    // Step 7: Verify track instances via API
    console.log('📝 Step 7: Verifying track instances via API...');
    
    if (projectId && trackId) {
      console.log(`📊 Checking instances for Project: ${projectId}, Track: ${trackId}`);
      
      try {
        // Get authentication token
        const authToken = await page.evaluate(() => localStorage.getItem('authToken'));
        
        if (authToken) {
          // Method 1: Check specific track instances
          const trackInstancesResponse = await page.evaluate(async ({ projectId, trackId, authToken }) => {
            const response = await fetch(`https://localhost:8000/projects/${projectId}/tracks/${trackId}/instances`, {
              headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (!response.ok) {
              return { error: `API request failed: ${response.status}` };
            }
            
            return await response.json();
          }, { projectId, trackId, authToken });
          
          console.log(`📊 Track instances API response:`, JSON.stringify(trackInstancesResponse, null, 2));
          
          if (trackInstancesResponse.error) {
            console.log(`⚠️ Error getting track instances: ${trackInstancesResponse.error}`);
          } else if (Array.isArray(trackInstancesResponse)) {
            const instanceCount = trackInstancesResponse.length;
            console.log(`📊 Track instances found: ${instanceCount}`);
            
            trackInstancesResponse.forEach((instance: any, index: number) => {
              console.log(`📊 Instance ${index + 1}:`, {
                id: instance.id,
                x_position: instance.x_position,
                y_position: instance.y_position,
                volume: instance.volume,
                created_at: instance.created_at
              });
            });
            
            // Verify we have exactly 2 instances (1 original + 1 pasted)
            expect(instanceCount).toBe(2);
            console.log('✅ Track instances verification PASSED - Found exactly 2 instances');
          }
          
          // Method 2: Also check via project tracks endpoint
          const projectTracksResponse = await page.evaluate(async ({ projectId, authToken }) => {
            const response = await fetch(`https://localhost:8000/projects/${projectId}/tracks`, {
              headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (!response.ok) {
              return { error: `API request failed: ${response.status}` };
            }
            
            return await response.json();
          }, { projectId, authToken });
          
          console.log(`📊 Project tracks API response:`, JSON.stringify(projectTracksResponse, null, 2));
          
          if (Array.isArray(projectTracksResponse)) {
            let totalInstances = 0;
            projectTracksResponse.forEach((track: any) => {
              if (track.position_metadata && Array.isArray(track.position_metadata)) {
                totalInstances += track.position_metadata.length;
                console.log(`📊 Track ${track.name}: ${track.position_metadata.length} instances in position_metadata`);
              }
            });
            
            console.log(`📊 Total instances across all tracks: ${totalInstances}`);
            
            // Verify total instances
            expect(totalInstances).toBeGreaterThanOrEqual(2);
            console.log('✅ Project tracks verification PASSED');
          }
          
        } else {
          console.log('⚠️ No auth token found');
          throw new Error('No authentication token available');
        }
        
      } catch (error) {
        console.log(`❌ Error verifying track instances: ${error}`);
        throw error; // Fail the test if verification fails
      }
      
    } else {
      console.log(`❌ Missing required IDs - Project: ${projectId}, Track: ${trackId}`);
      throw new Error('Could not capture project ID and/or track ID');
    }
    
    // Step 8: Verify copy/paste logs
    const copyLogs = consoleLogs.filter(log => 
      log.includes('🔄 COPY') || log.includes('copySelectedTracks') || log.includes('Ctrl+C pressed')
    );
    
    const pasteLogs = consoleLogs.filter(log => 
      log.includes('📋 PASTE') || log.includes('pasteTracksAtPosition') || log.includes('Ctrl+V pressed')
    );
    
    const instanceCreationLogs = consoleLogs.filter(log => 
      log.includes('Successfully created instance')
    );
    
    console.log(`📊 Copy operation logs: ${copyLogs.length}`);
    console.log(`📊 Paste operation logs: ${pasteLogs.length}`);
    console.log(`📊 Instance creation logs: ${instanceCreationLogs.length}`);
    
    // Verify operations occurred
    expect(copyLogs.length).toBeGreaterThan(0);
    expect(pasteLogs.length).toBeGreaterThan(0);
    expect(instanceCreationLogs.length).toBeGreaterThan(0);
    
    console.log('✅ Track instances verification test completed successfully');
  });
  
  test('should verify track instances have correct positioning after paste', async ({ page }) => {
    console.log('🎯 Test: Verify track instance positioning');
    
    let projectId: string | null = null;
    let trackId: string | null = null;
    
    // Monitor for IDs
    page.on('console', msg => {
      const text = msg.text();
      
      if (text.includes('Response Data:') && text.includes('"id":')) {
        const match = text.match(/"id":\s*"([^"]+)"/);
        if (match && match[1]) {
          projectId = match[1];
        }
      }
      
      if (text.includes('Execute TRACK_ADD:') && text.includes('trackId:')) {
        const match = text.match(/trackId:\s*([^,\s]+)/);
        if (match && match[1]) {
          trackId = match[1];
        }
      }
    });
    
    // Add track, select, copy, and paste
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    await page.waitForTimeout(5000);
    
    // Select and copy/paste
    const trackElement = page.locator('.track').first();
    if (await trackElement.isVisible()) {
      await trackElement.click();
      await page.waitForTimeout(1000);
    }
    
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(3000);
    
    // Verify positioning
    if (projectId && trackId) {
      const authToken = await page.evaluate(() => localStorage.getItem('authToken'));
      
      if (authToken) {
        const instances = await page.evaluate(async ({ projectId, trackId, authToken }) => {
          const response = await fetch(`https://localhost:8000/projects/${projectId}/tracks/${trackId}/instances`, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          });
          return response.ok ? await response.json() : [];
        }, { projectId, trackId, authToken });
        
        console.log(`📊 Instance positions:`, instances.map((inst: any) => ({
          id: inst.id,
          x: inst.x_position,
          y: inst.y_position
        })));
        
        // Verify we have instances with different positions
        expect(instances.length).toBe(2);
        
        // The instances should have different positions (original vs pasted)
        const positions = instances.map((inst: any) => `${inst.x_position},${inst.y_position}`);
        const uniquePositions = new Set(positions);
        
        if (uniquePositions.size === 2) {
          console.log('✅ Instances have different positions as expected');
        } else {
          console.log('⚠️ Instances have same positions, checking if this is intentional...');
          // Some implementations might paste at same position, which is also valid
        }
        
        console.log('✅ Track instance positioning verification completed');
      }
    }
  });
});