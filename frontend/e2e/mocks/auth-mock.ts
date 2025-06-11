import { Page } from '@playwright/test';

export async function setupAuthMock(page: Page) {
  // Mock the auth API endpoints
  await page.route('**/auth/**', async route => {
    const url = route.request().url();
    
    if (url.includes('/auth/login')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock_token_12345',
          token_type: 'bearer',
          user_id: 'b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff'
        })
      });
      return;
    }
    
    // Continue with original request for other auth endpoints
    await route.continue();
  });

  // Mock project API endpoints
  await page.route('**/projects**', async route => {
    const method = route.request().method();
    const url = route.request().url();
    
    if (method === 'GET' && url.endsWith('/projects')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          total: 0,
          page: 1,
          size: 50,
          pages: 1
        })
      });
      return;
    }
    
    if (method === 'POST' && url.endsWith('/projects')) {
      const projectData = await route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: projectData.title || 'Test Project',
          description: projectData.description || '',
          bpm: projectData.bpm || 120,
          key: projectData.key || 'C',
          time_signature: projectData.time_signature || '4/4',
          tracks: [],
          user_id: 'b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });
      return;
    }
    
    // Continue with original request for other project endpoints
    await route.continue();
  });

  // Mock track-related endpoints
  await page.route('**/projects/*/tracks**', async route => {
    const method = route.request().method();
    
    if (method === 'POST') {
      const trackData = await route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'track-' + Math.random().toString(36).substr(2, 9),
          ...trackData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });
      return;
    }
    
    await route.continue();
  });
}