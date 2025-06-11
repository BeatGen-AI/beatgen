import { test, expect } from '@playwright/test';
import { loginAndNavigateToStudio } from './helpers/auth-helper';

test.describe('Drag and Drop Movement Test', () => {
  test('should move track exactly 50px right and 100px down', async ({ page }) => {
    console.log('🖱️ DRAG TEST: Testing precise track movement - 50px right, 100px down');
    
    await loginAndNavigateToStudio(page);
    await page.waitForTimeout(3000);
    
    // Step 1: Create a track and get its initial position
    console.log('🖱️ STEP 1: Creating track and recording initial position');
    
    const initialSetup = await page.evaluate(async () => {
      const store = window.useStudioStore.getState();
      
      try {
        // Create a track using the actual store method
        await store.handleAddTrack('AUDIO', { name: 'Drag Test Track' });
        
        if (store.tracks && store.tracks.length > 0) {
          const track = store.tracks[0];
          
          return {
            success: true,
            trackId: track.id,
            trackName: track.name,
            initialPosition: {
              x_ticks: track.x_position, // Position in ticks (storage format)
              y_pixels: track.y_position  // Position in pixels
            }
          };
        }
        return { success: false, reason: 'No tracks created' };
      } catch (error) {
        return { success: false, error: error.toString() };
      }
    });
    
    console.log('🖱️ Initial setup result:', initialSetup);
    
    if (!initialSetup.success) {
      console.log('🖱️ Track creation failed, skipping drag test');
      expect(initialSetup.success).toBe(true);
      return;
    }
    
    // Step 2: Find the track element and get its DOM position
    const trackElement = page.locator(`[data-track-id="${initialSetup.trackId}"]`).first();
    await expect(trackElement).toBeVisible();
    
    // Get initial DOM position
    const initialDOMPosition = await trackElement.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      return {
        boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        cssLeft: parseInt(styles.left || '0'),
        cssTop: parseInt(styles.top || '0'),
        offsetLeft: el.offsetLeft,
        offsetTop: el.offsetTop
      };
    });
    
    console.log('🖱️ Initial DOM position:', initialDOMPosition);
    
    // Step 3: Drag the track 50px to the right
    console.log('🖱️ STEP 3: Dragging track 50px to the right');
    
    const centerX = initialDOMPosition.boundingRect.x + initialDOMPosition.boundingRect.width / 2;
    const centerY = initialDOMPosition.boundingRect.y + initialDOMPosition.boundingRect.height / 2;
    
    // Drag 50px to the right
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 50, centerY, { steps: 10 });
    await page.mouse.up();
    
    await page.waitForTimeout(1000); // Wait for any animations/updates
    
    // Check position after horizontal drag
    const afterHorizontalDrag = await trackElement.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      return {
        boundingRect: { x: rect.x, y: rect.y },
        cssLeft: parseInt(styles.left || '0'),
        cssTop: parseInt(styles.top || '0')
      };
    });
    
    console.log('🖱️ Position after 50px right drag:', afterHorizontalDrag);
    
    const horizontalMovement = {
      boundingRectDelta: afterHorizontalDrag.boundingRect.x - initialDOMPosition.boundingRect.x,
      cssLeftDelta: afterHorizontalDrag.cssLeft - initialDOMPosition.cssLeft
    };
    
    console.log('🖱️ Horizontal movement delta:', horizontalMovement);
    
    // Step 4: Drag the track 100px down
    console.log('🖱️ STEP 4: Dragging track 100px down');
    
    const newCenterX = afterHorizontalDrag.boundingRect.x + initialDOMPosition.boundingRect.width / 2;
    const newCenterY = afterHorizontalDrag.boundingRect.y + initialDOMPosition.boundingRect.height / 2;
    
    // Drag 100px down
    await page.mouse.move(newCenterX, newCenterY);
    await page.mouse.down();
    await page.mouse.move(newCenterX, newCenterY + 100, { steps: 10 });
    await page.mouse.up();
    
    await page.waitForTimeout(1000); // Wait for any animations/updates
    
    // Check final position
    const finalPosition = await trackElement.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      return {
        boundingRect: { x: rect.x, y: rect.y },
        cssLeft: parseInt(styles.left || '0'),
        cssTop: parseInt(styles.top || '0')
      };
    });
    
    console.log('🖱️ Final position after 100px down drag:', finalPosition);
    
    const verticalMovement = {
      boundingRectDelta: finalPosition.boundingRect.y - afterHorizontalDrag.boundingRect.y,
      cssTopDelta: finalPosition.cssTop - afterHorizontalDrag.cssTop
    };
    
    console.log('🖱️ Vertical movement delta:', verticalMovement);
    
    // Step 5: Check the store state to see what actually changed
    const finalStoreState = await page.evaluate(() => {
      const store = window.useStudioStore.getState();
      const track = store.tracks?.find(t => t.id === store.tracks[0]?.id);
      
      if (!track) return { success: false, reason: 'Track not found in store' };
      
      return {
        success: true,
        finalTrackPosition: {
          x_ticks: track.x_position,
          y_pixels: track.y_position
        }
      };
    });
    
    console.log('🖱️ Final store state:', finalStoreState);
    
    // Step 6: Calculate total movement and analyze accuracy
    const totalMovement = {
      horizontal: {
        expected: 50,
        actualBoundingRect: finalPosition.boundingRect.x - initialDOMPosition.boundingRect.x,
        actualCSS: finalPosition.cssLeft - initialDOMPosition.cssLeft,
        accuracy: Math.abs((finalPosition.cssLeft - initialDOMPosition.cssLeft) - 50)
      },
      vertical: {
        expected: 100,
        actualBoundingRect: finalPosition.boundingRect.y - initialDOMPosition.boundingRect.y,
        actualCSS: finalPosition.cssTop - initialDOMPosition.cssTop,
        accuracy: Math.abs((finalPosition.cssTop - initialDOMPosition.cssTop) - 100)
      }
    };
    
    console.log('🖱️ MOVEMENT ANALYSIS:');
    console.log('📊 Horizontal (50px expected):');
    console.log(`   - BoundingRect delta: ${totalMovement.horizontal.actualBoundingRect}px`);
    console.log(`   - CSS left delta: ${totalMovement.horizontal.actualCSS}px`);
    console.log(`   - Accuracy error: ${totalMovement.horizontal.accuracy}px`);
    
    console.log('📊 Vertical (100px expected):');
    console.log(`   - BoundingRect delta: ${totalMovement.vertical.actualBoundingRect}px`);
    console.log(`   - CSS top delta: ${totalMovement.vertical.actualCSS}px`);
    console.log(`   - Accuracy error: ${totalMovement.vertical.accuracy}px`);
    
    // Step 7: Assertions
    
    // Allow some tolerance for rounding and snapping (within 10px is reasonable)
    const tolerance = 10;
    
    console.log('🖱️ ASSERTIONS:');
    
    // Horizontal movement should be close to 50px
    console.log(`Checking horizontal movement: ${totalMovement.horizontal.actualCSS}px vs expected 50px`);
    expect(totalMovement.horizontal.accuracy).toBeLessThan(tolerance);
    
    // Vertical movement should be close to 100px
    console.log(`Checking vertical movement: ${totalMovement.vertical.actualCSS}px vs expected 100px`);
    expect(totalMovement.vertical.accuracy).toBeLessThan(tolerance);
    
    // The movement should not be drastically amplified
    expect(Math.abs(totalMovement.horizontal.actualCSS)).toBeLessThan(200); // Should not be more than 4x amplified
    expect(Math.abs(totalMovement.vertical.actualCSS)).toBeLessThan(400); // Should not be more than 4x amplified
    
    console.log('✅ Drag and drop movement test completed!');
    
    if (totalMovement.horizontal.accuracy < tolerance && totalMovement.vertical.accuracy < tolerance) {
      console.log('🎉 SUCCESS: Movement is accurate within tolerance!');
    } else {
      console.log('❌ FAILURE: Movement is not accurate - coordinate conversion issue detected');
    }
  });
});