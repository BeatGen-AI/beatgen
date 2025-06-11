import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Track Instances Final Verification', () => {
  test('should successfully create 2 track instances after copy/paste', async ({ page }) => {
    console.log('🚀 Setting up final track instances verification');
    await loginAndNavigateToStudio(page);
    
    console.log('🎯 Test: Final verification of track instances creation');
    
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
    
    // Step 2: Select track
    console.log('📝 Step 2: Selecting track...');
    const trackElement = page.locator('.track').first();
    if (await trackElement.isVisible()) {
      await trackElement.click();
      console.log('✅ Track selected');
      await page.waitForTimeout(1000);
    }
    
    // Step 3: Copy the track
    console.log('📝 Step 3: Performing copy operation...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(2000);
    
    // Step 4: Paste the track
    console.log('📝 Step 4: Performing paste operation...');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(3000); // Give time for API call
    
    // Step 5: Verify success through UI and API
    console.log('📝 Step 5: Verifying track instances creation...');
    
    // Get project and track IDs from the browser
    const { projectId, trackId } = await page.evaluate(() => {
      const storeInstance = (window as any).storeInstance;
      let projectId = null;
      let trackId = null;
      
      if (storeInstance) {
        const state = storeInstance.getState();
        if (state.project && state.project.id) {
          projectId = state.project.id;
        }
        if (state.tracks && state.tracks.length > 0) {
          trackId = state.tracks[0].id;
        }
      }
      
      // Also try URL params
      const urlParams = new URLSearchParams(window.location.search);
      const urlProjectId = urlParams.get('projectId');
      
      return {
        projectId: projectId || urlProjectId,
        trackId: trackId
      };
    });
    
    console.log(`📊 Retrieved IDs - Project: ${projectId}, Track: ${trackId}`);
    
    if (projectId && trackId) {
      console.log('✅ Successfully retrieved project and track IDs');
      
      // Get auth token and make API call
      const authToken = await page.evaluate(() => localStorage.getItem('authToken'));
      
      if (authToken) {
        console.log('✅ Auth token found, making API request...');
        
        // Make API request to check track instances
        const response = await page.evaluate(async ({ projectId, trackId, authToken }) => {
          try {
            const res = await fetch(`https://localhost:8000/projects/${projectId}/tracks/${trackId}/instances`, {
              headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (!res.ok) {
              const errorText = await res.text();
              return { success: false, error: `${res.status}: ${errorText}` };
            }
            
            const data = await res.json();
            return { success: true, data: data };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }, { projectId, trackId, authToken });
        
        console.log('📊 API Response:', JSON.stringify(response, null, 2));
        
        if (response.success) {
          const instances = response.data;
          console.log(`📊 Found ${instances.length} track instances`);
          
          if (Array.isArray(instances) && instances.length >= 2) {
            console.log('✅ SUCCESS: Found 2 or more track instances!');
            
            instances.forEach((instance, index) => {
              console.log(`📊 Instance ${index + 1}:`, {
                id: instance.id,
                x_position: instance.x_position,
                y_position: instance.y_position,
                volume: instance.volume,
                created_at: instance.created_at
              });
            });
            
            // Verify we have exactly 2 instances (original + pasted)
            expect(instances.length).toBe(2);
            
            // Verify instances have proper structure
            instances.forEach(instance => {
              expect(instance).toHaveProperty('id');
              expect(instance).toHaveProperty('x_position');
              expect(instance).toHaveProperty('y_position');
              expect(instance).toHaveProperty('volume');
              expect(typeof instance.x_position).toBe('number');
              expect(typeof instance.y_position).toBe('number');
              expect(typeof instance.volume).toBe('number');
            });
            
            console.log('✅ All track instance validations passed!');
            
          } else {
            console.log(`❌ Expected 2 instances, found ${instances.length}`);
            expect(instances.length).toBe(2); // This will fail and show the actual count
          }
        } else {
          console.log(`❌ API request failed: ${response.error}`);
          throw new Error(`Failed to fetch track instances: ${response.error}`);
        }
      } else {
        console.log('❌ No auth token found');
        throw new Error('No authentication token available');
      }
    } else {
      console.log('❌ Could not retrieve project ID and/or track ID');
      throw new Error(`Missing IDs - Project: ${projectId}, Track: ${trackId}`);
    }
    
    console.log('🎉 Track instances verification test completed successfully!');
  });
  
  test('should verify copy/paste operations are logged correctly', async ({ page }) => {
    console.log('🚀 Setting up copy/paste logging verification');
    await loginAndNavigateToStudio(page);
    
    const consoleLogs: string[] = [];
    
    // Monitor console for copy/paste logs
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
    });
    
    // Add track, select, copy, paste
    await page.locator('button:has-text("Add Track")').first().click();
    await page.waitForSelector('text=Virtual Instrument', { timeout: 5000 });
    await page.locator('text=Virtual Instrument').click();
    await page.waitForSelector('text=Grand Piano', { timeout: 5000 });
    await page.locator('text=Grand Piano').first().click();
    await page.waitForTimeout(5000);
    
    const trackElement = page.locator('.track').first();
    if (await trackElement.isVisible()) {
      await trackElement.click();
      await page.waitForTimeout(1000);
    }
    
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(3000);
    
    // Verify copy/paste operations were logged
    const copyLogs = consoleLogs.filter(log => 
      log.includes('🔄 COPY') || log.includes('copySelectedTracks') || 
      log.includes('Ctrl+C pressed') || log.includes('⌨️ KEYBOARD - Ctrl+C pressed')
    );
    
    const pasteLogs = consoleLogs.filter(log => 
      log.includes('📋 PASTE') || log.includes('pasteTracksAtPosition') || 
      log.includes('Ctrl+V pressed') || log.includes('⌨️ KEYBOARD - Ctrl+V pressed')
    );
    
    const instanceCreationLogs = consoleLogs.filter(log => 
      log.includes('Successfully created instance') || log.includes('created instance for track')
    );
    
    console.log(`📊 Copy operation logs: ${copyLogs.length}`);
    console.log(`📊 Paste operation logs: ${pasteLogs.length}`);
    console.log(`📊 Instance creation logs: ${instanceCreationLogs.length}`);
    
    // Verify operations were detected
    expect(copyLogs.length).toBeGreaterThan(0);
    expect(pasteLogs.length).toBeGreaterThan(0);
    
    console.log('✅ Copy/paste logging verification completed!');
  });
});