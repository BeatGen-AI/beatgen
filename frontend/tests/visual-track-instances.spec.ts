import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth-helper';

test.describe('Visual Track Instances - DAW-like Copy/Paste', () => {
  test.beforeEach(async ({ page }) => {
    // Login as user
    await loginAsUser(page);
    
    // Navigate to studio
    await page.goto('/studio');
    await expect(page.locator('h1')).toContainText('Studio');
    
    // Wait for studio to load
    await page.waitForTimeout(2000);
  });

  test('should create visual track instances that are separate from original track', async ({ page }) => {
    console.log('🧪 TEST: Visual Track Instances - Starting test');
    
    // 1. Count initial tracks and instances
    const initialTrackCount = await page.locator('[data-track-id]').count();
    const initialInstanceCount = await page.locator('[data-track-instance-id]').count();
    
    console.log(`🧪 Initial state: ${initialTrackCount} tracks, ${initialInstanceCount} instances`);
    
    // 2. Select all tracks
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(500);
    
    const selectedTracks = await page.locator('[data-selected="true"]').count();
    console.log(`🧪 Selected ${selectedTracks} tracks`);
    expect(selectedTracks).toBeGreaterThan(0);
    
    // 3. Copy tracks
    console.log('🧪 Copying tracks...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);
    
    // 4. Click at a different position to paste
    const timeline = page.locator('.timeline-container');
    await timeline.click({ position: { x: 300, y: 200 } });
    await page.waitForTimeout(500);
    
    // 5. Paste tracks to create instances
    console.log('🧪 Pasting tracks to create instances...');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(2000); // Wait for instances to be created
    
    // 6. Check that track instances were created
    const finalTrackCount = await page.locator('[data-track-id]').count();
    const finalInstanceCount = await page.locator('[data-track-instance-id]').count();
    
    console.log(`🧪 Final state: ${finalTrackCount} tracks, ${finalInstanceCount} instances`);
    
    // Verify instances were created
    expect(finalInstanceCount).toBeGreaterThan(initialInstanceCount);
    expect(finalInstanceCount).toBeGreaterThan(0);
    
    // 7. Verify instances are visually distinct from original tracks
    const trackInstances = page.locator('[data-track-instance-id]');
    const instanceCount = await trackInstances.count();
    
    console.log(`🧪 Found ${instanceCount} track instances`);
    
    // Check each instance has proper positioning
    for (let i = 0; i < Math.min(instanceCount, 3); i++) { // Check first 3 instances
      const instance = trackInstances.nth(i);
      const boundingBox = await instance.boundingBox();
      
      if (boundingBox) {
        console.log(`🧪 Instance ${i} position: x=${boundingBox.x}, y=${boundingBox.y}`);
        expect(boundingBox.x).toBeGreaterThan(0);
        expect(boundingBox.y).toBeGreaterThan(0);
      }
    }
    
    // 8. Verify instances are clickable and selectable
    if (instanceCount > 0) {
      const firstInstance = trackInstances.first();
      await firstInstance.click();
      await page.waitForTimeout(500);
      
      // Check if clicking instance selects the track
      const selectedAfterClick = await page.locator('[data-selected="true"]').count();
      console.log(`🧪 Selected tracks after clicking instance: ${selectedAfterClick}`);
      expect(selectedAfterClick).toBeGreaterThan(0);
    }
    
    // 9. Log browser console for debugging
    const logs = await page.evaluate(() => {
      return window.console['logs'] || [];
    });
    
    console.log('🧪 Browser console logs:');
    page.on('console', msg => {
      if (msg.text().includes('TIMELINE RENDER') || 
          msg.text().includes('Creating visual instance') || 
          msg.text().includes('TrackInstance:')) {
        console.log(`🌐 ${msg.text()}`);
      }
    });
  });

  test('should show multiple instances of the same track content', async ({ page }) => {
    console.log('🧪 TEST: Multiple Instances - Starting test');
    
    // 1. Select first track only
    const firstTrack = page.locator('[data-track-id]').first();
    await firstTrack.click();
    await page.waitForTimeout(500);
    
    // 2. Copy track
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);
    
    // 3. Paste multiple times at different positions
    const timeline = page.locator('.timeline-container');
    
    // First paste
    await timeline.click({ position: { x: 400, y: 100 } });
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    // Second paste
    await timeline.click({ position: { x: 600, y: 150 } });
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    // Third paste
    await timeline.click({ position: { x: 800, y: 200 } });
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1000);
    
    // 4. Verify multiple instances exist
    const instanceCount = await page.locator('[data-track-instance-id]').count();
    console.log(`🧪 Created ${instanceCount} track instances`);
    expect(instanceCount).toBeGreaterThanOrEqual(3);
    
    // 5. Verify instances are at different positions
    const instances = page.locator('[data-track-instance-id]');
    const positions: { x: number; y: number }[] = [];
    
    for (let i = 0; i < Math.min(instanceCount, 3); i++) {
      const instance = instances.nth(i);
      const boundingBox = await instance.boundingBox();
      
      if (boundingBox) {
        positions.push({ x: boundingBox.x, y: boundingBox.y });
        console.log(`🧪 Instance ${i} at position: x=${boundingBox.x}, y=${boundingBox.y}`);
      }
    }
    
    // Verify positions are different
    const uniquePositions = new Set(positions.map(p => `${p.x},${p.y}`));
    expect(uniquePositions.size).toBeGreaterThan(1);
    
    console.log('🧪 TEST: Multiple Instances - Completed successfully');
  });

  test('should maintain track content while showing multiple visual instances', async ({ page }) => {
    console.log('🧪 TEST: Content Consistency - Starting test');
    
    // This test verifies that track instances show the same content
    // but can be positioned independently
    
    // 1. Get original track info
    const originalTrack = page.locator('[data-track-id]').first();
    const originalTrackId = await originalTrack.getAttribute('data-track-id');
    const originalTrackType = await originalTrack.getAttribute('data-track-type');
    
    console.log(`🧪 Original track: ${originalTrackId} (${originalTrackType})`);
    
    // 2. Create an instance via copy/paste
    await originalTrack.click();
    await page.keyboard.press('Control+c');
    
    const timeline = page.locator('.timeline-container');
    await timeline.click({ position: { x: 500, y: 150 } });
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1500);
    
    // 3. Verify instance exists and references same track
    const instances = page.locator('[data-track-instance-id]');
    const instanceCount = await instances.count();
    
    if (instanceCount > 0) {
      const firstInstance = instances.first();
      const instanceTrackId = await firstInstance.getAttribute('data-track-id');
      const instanceTrackType = await firstInstance.getAttribute('data-track-type');
      
      console.log(`🧪 Instance track: ${instanceTrackId} (${instanceTrackType})`);
      
      // Verify instance references the same track
      expect(instanceTrackId).toBe(originalTrackId);
      expect(instanceTrackType).toBe(originalTrackType);
      
      console.log('🧪 ✅ Instance correctly references original track content');
    } else {
      throw new Error('No track instances were created');
    }
    
    console.log('🧪 TEST: Content Consistency - Completed successfully');
  });
});