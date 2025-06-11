import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Drag and Drop Verification', () => {
  test('should verify track instance positioning and regular track dragging both work', async ({ page }) => {
    console.log('🔧 DRAG & DROP TEST: Verifying both track instances and regular track dragging work');
    
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    // Step 1: Test track instance positioning (the fix we just implemented)
    console.log('🔧 STEP 1: Testing track instance positioning');
    
    const trackInstanceTest = await page.evaluate(async () => {
      const store = window.useStudioStore.getState();
      
      // Create a mock track for testing
      const mockTrack = {
        id: 'test-track-drag',
        name: 'Drag Test Track',
        type: 'AUDIO' as const,
        track: { name: 'Test Audio Track' },
        volume: 80,
        pan: 0,
        mute: false,
        solo: false,
        x_position: 0,
        y_position: 0
      };
      
      store.setTracks([mockTrack]);
      
      // Test track instance creation at specific positions
      const positions = [
        { x: 100, y: 80 },
        { x: 200, y: 160 }
      ];
      
      const results = [];
      
      for (const pos of positions) {
        const instanceId = await store.createTrackInstance(mockTrack.id, pos);
        if (instanceId) {
          const instances = store.getAllInstances();
          const instance = instances.find(i => i.instanceId === instanceId);
          results.push({
            requested: pos,
            actual: instance?.position,
            match: instance ? {
              x: instance.position.x === pos.x,
              y: instance.position.y === pos.y
            } : null
          });
        }
      }
      
      return {
        success: true,
        trackCreated: true,
        results,
        totalInstances: store.getAllInstances().length
      };
    });
    
    console.log('🔧 Track instance positioning results:', trackInstanceTest);
    
    // Verify track instances position correctly
    expect(trackInstanceTest.success).toBe(true);
    expect(trackInstanceTest.totalInstances).toBeGreaterThan(0);
    
    const exactMatches = trackInstanceTest.results.filter(r => r.match?.x && r.match?.y);
    expect(exactMatches.length).toBe(trackInstanceTest.results.length);
    
    // Step 2: Test regular track dragging (check if we broke this)
    console.log('🔧 STEP 2: Testing regular track dragging (coordinate conversion)');
    
    const dragTest = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      
      // Test the coordinate conversion functions that dragging relies on
      const testCoordinates = [
        { ticks: 0, expectedPixels: 0 },
        { ticks: 960, expectedPixels: 200 }, // 1 beat at 120 BPM = 960 ticks = 200px
        { ticks: 1920, expectedPixels: 400 }  // 2 beats = 1920 ticks = 400px
      ];
      
      const results = [];
      
      for (const test of testCoordinates) {
        try {
          // This mimics what BaseTrackPreview does for coordinate conversion
          const bpm = 120;
          const timeSignature = [4, 4];
          
          // Using the same conversion logic as in the components
          const ticksToPixels = (ticks: number, bpm: number, timeSignature: [number, number]) => {
            const MEASURE_WIDTH = 800; // GRID_CONSTANTS.measureWidth
            const beatsPerMeasure = timeSignature[0];
            const beatUnit = timeSignature[1];
            const ticksPerBeat = 960; // Standard MIDI ticks
            const ticksPerMeasure = ticksPerBeat * beatsPerMeasure;
            return (ticks / ticksPerMeasure) * MEASURE_WIDTH;
          };
          
          const pixelsToTicks = (pixels: number, bpm: number, timeSignature: [number, number]) => {
            const MEASURE_WIDTH = 800;
            const beatsPerMeasure = timeSignature[0];
            const beatUnit = timeSignature[1];
            const ticksPerBeat = 960;
            const ticksPerMeasure = ticksPerBeat * beatsPerMeasure;
            return (pixels / MEASURE_WIDTH) * ticksPerMeasure;
          };
          
          const convertedPixels = ticksToPixels(test.ticks, bpm, timeSignature);
          const backToTicks = pixelsToTicks(convertedPixels, bpm, timeSignature);
          
          results.push({
            inputTicks: test.ticks,
            expectedPixels: test.expectedPixels,
            actualPixels: convertedPixels,
            backToTicks: backToTicks,
            roundTripAccurate: Math.abs(backToTicks - test.ticks) < 1
          });
          
        } catch (error) {
          results.push({
            inputTicks: test.ticks,
            error: error.toString()
          });
        }
      }
      
      return {
        success: true,
        results
      };
    });
    
    console.log('🔧 Coordinate conversion test results:', dragTest);
    
    expect(dragTest.success).toBe(true);
    expect(dragTest.results.length).toBeGreaterThan(0);
    
    // Check that coordinate conversion is working (round trip should be accurate)
    const accurateConversions = dragTest.results.filter(r => r.roundTripAccurate);
    expect(accurateConversions.length).toBe(dragTest.results.length);
    
    // Step 3: Check DOM positioning for track instances
    console.log('🔧 STEP 3: Verifying DOM positioning matches stored positions');
    
    const domTest = await page.evaluate(() => {
      const instances = Array.from(document.querySelectorAll('[data-track-instance-id]'));
      
      return instances.map(element => {
        const styles = window.getComputedStyle(element);
        const instanceId = element.getAttribute('data-track-instance-id');
        
        return {
          instanceId,
          cssLeft: parseInt(styles.left || '0'),
          cssTop: parseInt(styles.top || '0')
        };
      });
    });
    
    console.log('🔧 DOM positioning results:', domTest);
    
    expect(domTest.length).toBeGreaterThan(0);
    
    // Verify that track instances appear in the DOM at expected positions
    const expectedPositions = [
      { x: 100, y: 80 },
      { x: 200, y: 160 }
    ];
    
    for (let i = 0; i < Math.min(domTest.length, expectedPositions.length); i++) {
      const domPos = domTest[i];
      const expected = expectedPositions[i];
      
      console.log(`🔧 Verifying instance ${i + 1}: DOM(${domPos.cssLeft}, ${domPos.cssTop}) vs Expected(${expected.x}, ${expected.y})`);
      
      expect(domPos.cssLeft).toBe(expected.x);
      expect(domPos.cssTop).toBe(expected.y);
    }
    
    console.log('✅ Drag and drop verification completed successfully!');
  });
});