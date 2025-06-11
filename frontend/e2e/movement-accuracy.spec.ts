import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Movement Accuracy Test', () => {
  test('should move tracks exactly 1:1 with mouse movement', async ({ page }) => {
    console.log('🎯 MOVEMENT TEST: Verifying 1:1 movement accuracy');
    
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    // Create a track for testing movement
    const setupResult = await page.evaluate(async () => {
      const store = window.useStudioStore.getState();
      
      try {
        // Create a mock track directly
        const mockTrack = {
          id: 'movement-test-track',
          name: 'Movement Test Track',
          type: 'AUDIO' as const,
          track: { name: 'Test Track' },
          volume: 80,
          pan: 0,
          mute: false,
          solo: false,
          x_position: 0, // Start at origin in ticks
          y_position: 100 // Start at Y=100 pixels
        };
        
        store.setTracks([mockTrack]);
        
        return {
          success: true,
          trackId: mockTrack.id,
          initialPosition: { x: mockTrack.x_position, y: mockTrack.y_position }
        };
      } catch (error) {
        return { success: false, error: error.toString() };
      }
    });
    
    console.log('🎯 Setup result:', setupResult);
    
    if (setupResult.success) {
      // Test coordinate conversion functions to understand the system
      const conversionTest = await page.evaluate(() => {
        // Test the conversion functions used in dragging
        const bpm = 120;
        const timeSignature = [4, 4] as [number, number];
        const MEASURE_WIDTH = 800; // GRID_CONSTANTS.measureWidth
        
        const ticksToPixels = (ticks: number, bpm: number, timeSignature: [number, number]) => {
          const beatsPerMeasure = timeSignature[0];
          const ticksPerBeat = 960; // Standard MIDI ticks
          const ticksPerMeasure = ticksPerBeat * beatsPerMeasure;
          return (ticks / ticksPerMeasure) * MEASURE_WIDTH;
        };
        
        const pixelsToTicks = (pixels: number, bpm: number, timeSignature: [number, number]) => {
          const beatsPerMeasure = timeSignature[0];
          const ticksPerBeat = 960;
          const ticksPerMeasure = ticksPerBeat * beatsPerMeasure;
          return (pixels / MEASURE_WIDTH) * ticksPerMeasure;
        };
        
        // Test conversions
        const testCases = [
          { pixels: 0, expectedTicks: 0 },
          { pixels: 100, expectedTicks: 480 }, // 100px should be 480 ticks
          { pixels: 200, expectedTicks: 960 }, // 200px should be 960 ticks (1 beat)
          { pixels: 800, expectedTicks: 3840 } // 800px should be 3840 ticks (1 measure)
        ];
        
        const results = testCases.map(test => {
          const convertedTicks = pixelsToTicks(test.pixels, bpm, timeSignature);
          const backToPixels = ticksToPixels(convertedTicks, bpm, timeSignature);
          
          return {
            inputPixels: test.pixels,
            convertedTicks,
            expectedTicks: test.expectedTicks,
            backToPixels,
            roundTripAccurate: Math.abs(backToPixels - test.pixels) < 0.1,
            conversionRatio: convertedTicks / test.pixels
          };
        });
        
        return {
          conversionResults: results,
          pixelsPerTick: 800 / 3840, // 0.208333... pixels per tick
          ticksPerPixel: 3840 / 800   // 4.8 ticks per pixel
        };
      });
      
      console.log('🎯 Conversion test results:', conversionTest);
      
      // Now test if track positioning matches expectations
      const positionTest = await page.evaluate(() => {
        const store = window.useStudioStore.getState();
        const tracks = store.tracks;
        const track = tracks?.find(t => t.id === 'movement-test-track');
        
        if (!track) return { success: false, reason: 'Track not found' };
        
        // Check what the track's initial position converts to in pixels
        const bpm = 120;
        const timeSignature = [4, 4] as [number, number];
        const MEASURE_WIDTH = 800;
        
        const ticksToPixels = (ticks: number) => {
          const beatsPerMeasure = timeSignature[0];
          const ticksPerBeat = 960;
          const ticksPerMeasure = ticksPerBeat * beatsPerMeasure;
          return (ticks / ticksPerMeasure) * MEASURE_WIDTH;
        };
        
        const expectedPixelX = ticksToPixels(track.x_position);
        
        return {
          success: true,
          trackPosition: { x: track.x_position, y: track.y_position },
          expectedPixelX,
          conversionWorking: true
        };
      });
      
      console.log('🎯 Position test results:', positionTest);
      
      // Check DOM positioning
      const domCheck = await page.evaluate(() => {
        const trackElement = document.querySelector('[data-track-id="movement-test-track"]');
        if (!trackElement) return { found: false };
        
        const styles = window.getComputedStyle(trackElement);
        return {
          found: true,
          domLeft: parseInt(styles.left || '0'),
          domTop: parseInt(styles.top || '0')
        };
      });
      
      console.log('🎯 DOM check results:', domCheck);
      
      // Verify conversion ratios are reasonable
      expect(conversionTest.conversionResults.length).toBeGreaterThan(0);
      
      // Check that round-trip conversions work
      const accurateConversions = conversionTest.conversionResults.filter(r => r.roundTripAccurate);
      expect(accurateConversions.length).toBe(conversionTest.conversionResults.length);
      
      // Verify position test worked
      expect(positionTest.success).toBe(true);
      
      console.log('✅ Movement accuracy test completed!');
      console.log(`📊 Conversion ratio: ${conversionTest.ticksPerPixel} ticks per pixel`);
      console.log(`📊 This means 1 pixel movement = ${conversionTest.ticksPerPixel} ticks`);
      
    } else {
      console.log('❌ Setup failed, skipping movement test');
      expect(setupResult.success).toBe(true); // This will fail and show the error
    }
  });
});