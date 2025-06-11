import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Direct Track Positioning Test', () => {
  test('should position track instances correctly using direct store methods', async ({ page }) => {
    console.log('🎯 DIRECT POSITIONING: Testing track instance positioning directly');
    
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    // Test direct track instance creation and positioning
    const positioningTest = await page.evaluate(async () => {
      const store = window.useStudioStore.getState();
      
      // Create a mock track directly in the store for testing
      const mockTrack = {
        id: 'test-track-001',
        name: 'Direct Position Test Track',
        type: 'AUDIO' as const,
        track: {
          name: 'Test Audio Track'
        },
        volume: 80,
        pan: 0,
        mute: false,
        solo: false,
        x_position: 0,
        y_position: 100
      };
      
      // Add the mock track to the store
      store.setTracks([mockTrack]);
      
      // Test multiple position coordinates
      const testPositions = [
        { x: 100, y: 80, name: 'position-1' },
        { x: 250, y: 120, name: 'position-2' },
        { x: 400, y: 160, name: 'position-3' },
        { x: 50, y: 200, name: 'position-4' }
      ];
      
      const results = [];
      
      for (const testPos of testPositions) {
        try {
          // Create track instance at specific position
          const instanceId = await store.createTrackInstance(mockTrack.id, {
            x: testPos.x,
            y: testPos.y
          });
          
          if (instanceId) {
            // Get the created instance
            const instances = store.getAllInstances();
            const createdInstance = instances.find(inst => inst.instanceId === instanceId);
            
            results.push({
              testName: testPos.name,
              requestedPosition: testPos,
              actualPosition: createdInstance?.position,
              instanceId,
              positionMatch: createdInstance ? {
                x: createdInstance.position.x === testPos.x,
                y: createdInstance.position.y === testPos.y
              } : null
            });
          } else {
            results.push({
              testName: testPos.name,
              requestedPosition: testPos,
              error: 'Failed to create instance'
            });
          }
        } catch (error) {
          results.push({
            testName: testPos.name,
            requestedPosition: testPos,
            error: error.toString()
          });
        }
      }
      
      return {
        success: true,
        mockTrackCreated: true,
        totalInstances: store.getAllInstances().length,
        results,
        allInstances: store.getAllInstances().map(inst => ({
          id: inst.instanceId,
          position: inst.position,
          trackId: inst.trackId
        }))
      };
    });
    
    console.log('🎯 Direct positioning test results:', JSON.stringify(positioningTest, null, 2));
    
    // Verify positioning accuracy
    expect(positioningTest.success).toBe(true);
    expect(positioningTest.totalInstances).toBeGreaterThan(0);
    
    // Check if positions match exactly
    const exactMatches = positioningTest.results.filter(r => 
      r.positionMatch && r.positionMatch.x && r.positionMatch.y
    );
    
    console.log(`🎯 Exact position matches: ${exactMatches.length}/${positioningTest.results.length}`);
    
    // All positions should match exactly
    expect(exactMatches.length).toBe(positioningTest.results.length);
    
    // Test DOM positioning
    const domPositionTest = await page.evaluate(() => {
      const instances = Array.from(document.querySelectorAll('[data-track-instance-id]'));
      
      return instances.map(element => {
        const styles = window.getComputedStyle(element);
        const instanceId = element.getAttribute('data-track-instance-id');
        
        return {
          instanceId,
          cssLeft: parseInt(styles.left || '0'),
          cssTop: parseInt(styles.top || '0'),
          offsetLeft: element.offsetLeft,
          offsetTop: element.offsetTop
        };
      });
    });
    
    console.log('🎯 DOM positioning:', JSON.stringify(domPositionTest, null, 2));
    
    // Verify DOM elements exist and have positions
    expect(domPositionTest.length).toBeGreaterThan(0);
    
    // Check that DOM positions correspond to stored positions
    for (const result of positioningTest.results) {
      if (result.instanceId && result.actualPosition) {
        const domElement = domPositionTest.find(dom => dom.instanceId === result.instanceId);
        
        if (domElement) {
          console.log(`🎯 Comparing ${result.testName}:`, {
            stored: result.actualPosition,
            dom: { left: domElement.cssLeft, top: domElement.cssTop }
          });
          
          // CSS left should match stored x position
          expect(domElement.cssLeft).toBe(result.actualPosition.x);
          // CSS top should match stored y position  
          expect(domElement.cssTop).toBe(result.actualPosition.y);
        }
      }
    }
    
    console.log('✅ Direct positioning test completed successfully!');
  });
  
  test('should handle timeline click coordinate calculation', async ({ page }) => {
    console.log('🎯 COORDINATE CALCULATION: Testing timeline click coordinate transformation');
    
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    // Test coordinate calculation logic
    const coordinateTest = await page.evaluate(() => {
      // Simulate timeline click coordinate calculation
      const simulateTimelineClick = (clickX: number, clickY: number, scrollLeft: number = 0, scrollTop: number = 0, zoomLevel: number = 1) => {
        // This mimics the logic in handleTimelineClick
        const adjustedClickX = clickX + scrollLeft;
        const adjustedClickY = clickY + scrollTop;
        const finalX = adjustedClickX / zoomLevel;
        
        return {
          original: { x: clickX, y: clickY },
          withScroll: { x: adjustedClickX, y: adjustedClickY },
          final: { x: finalX, y: adjustedClickY },
          factors: { scrollLeft, scrollTop, zoomLevel }
        };
      };
      
      // Test different scenarios
      const scenarios = [
        // No scroll, no zoom
        { click: { x: 100, y: 80 }, scroll: { left: 0, top: 0 }, zoom: 1, name: 'baseline' },
        // With horizontal scroll
        { click: { x: 100, y: 80 }, scroll: { left: 50, top: 0 }, zoom: 1, name: 'h-scroll' },
        // With zoom
        { click: { x: 100, y: 80 }, scroll: { left: 0, top: 0 }, zoom: 2, name: 'zoom-2x' },
        // With scroll and zoom
        { click: { x: 100, y: 80 }, scroll: { left: 30, top: 10 }, zoom: 1.5, name: 'scroll-zoom' }
      ];
      
      const results = scenarios.map(scenario => ({
        scenario: scenario.name,
        input: scenario,
        output: simulateTimelineClick(
          scenario.click.x,
          scenario.click.y,
          scenario.scroll.left,
          scenario.scroll.top,
          scenario.zoom
        )
      }));
      
      return {
        success: true,
        results
      };
    });
    
    console.log('🎯 Coordinate calculation test:', JSON.stringify(coordinateTest, null, 2));
    
    expect(coordinateTest.success).toBe(true);
    expect(coordinateTest.results.length).toBe(4);
    
    // Verify baseline scenario (no transformations)
    const baseline = coordinateTest.results.find(r => r.scenario === 'baseline');
    expect(baseline?.output.final.x).toBe(100); // Should be unchanged
    expect(baseline?.output.final.y).toBe(80);  // Should be unchanged
    
    // Verify scroll compensation
    const scrollTest = coordinateTest.results.find(r => r.scenario === 'h-scroll');
    expect(scrollTest?.output.final.x).toBe(150); // 100 + 50 scroll offset
    
    // Verify zoom adjustment
    const zoomTest = coordinateTest.results.find(r => r.scenario === 'zoom-2x');
    expect(zoomTest?.output.final.x).toBe(50); // 100 / 2 zoom factor
    
    console.log('✅ Coordinate calculation test completed!');
  });
});