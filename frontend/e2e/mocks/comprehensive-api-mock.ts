import { Page } from '@playwright/test';

export async function setupComprehensiveApiMock(page: Page) {
  console.log('🔧 Setting up comprehensive API mocking...');

  // Mock authentication endpoints
  await page.route('**/auth/**', async route => {
    const url = route.request().url();
    const method = route.request().method();
    
    console.log(`🔑 Auth API Mock: ${method} ${url}`);
    
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
    
    if (url.includes('/auth/signup')) {
      await route.fulfill({
        status: 201,
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

  // Mock user endpoints
  await page.route('**/users/**', async route => {
    const method = route.request().method();
    const url = route.request().url();
    
    console.log(`👤 User API Mock: ${method} ${url}`);
    
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff',
          email: 'test@example.com',
          username: 'testuser',
          display_name: 'Test User',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });
      return;
    }
    
    await route.continue();
  });

  // Mock project endpoints
  await page.route('**/projects**', async route => {
    const method = route.request().method();
    const url = route.request().url();
    
    console.log(`📂 Project API Mock: ${method} ${url}`);
    
    // Handle project listing
    if (method === 'GET' && url.endsWith('/projects')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'existing-project-1',
              title: 'Existing Project 1',
              description: 'A test project',
              bpm: 120,
              key: 'C',
              time_signature: '4/4',
              user_id: 'b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff',
              created_at: new Date(Date.now() - 86400000).toISOString(),
              updated_at: new Date(Date.now() - 86400000).toISOString()
            }
          ],
          total: 1,
          page: 1,
          size: 50,
          pages: 1
        })
      });
      return;
    }
    
    // Handle project creation
    if (method === 'POST' && url.endsWith('/projects')) {
      const projectData = await route.request().postDataJSON();
      const newProject = {
        id: 'project-' + Math.random().toString(36).substr(2, 9),
        title: projectData.title || 'Untitled Project',
        description: projectData.description || '',
        bpm: projectData.bpm || 120,
        key: projectData.key || 'C',
        time_signature: projectData.time_signature || '4/4',
        tracks: [],
        user_id: 'b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      console.log(`📂 Created mock project: ${newProject.id}`);
      
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newProject)
      });
      return;
    }
    
    // Handle project updates (PATCH)
    if (method === 'PATCH' && url.includes('/projects/')) {
      const projectData = await route.request().postDataJSON();
      const projectId = url.split('/projects/')[1].split('/')[0];
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: projectId,
          ...projectData,
          updated_at: new Date().toISOString()
        })
      });
      return;
    }
    
    // Handle single project retrieval
    if (method === 'GET' && url.includes('/projects/') && !url.includes('/tracks')) {
      const projectId = url.split('/projects/')[1].split('/')[0];
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: projectId,
          title: 'Test Project',
          description: 'A test project',
          bpm: 120,
          key: 'C',
          time_signature: '4/4',
          tracks: [],
          user_id: 'b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });
      return;
    }
    
    await route.continue();
  });

  // Mock track-related endpoints
  await page.route('**/projects/*/tracks**', async route => {
    const method = route.request().method();
    const url = route.request().url();
    
    console.log(`🎵 Track API Mock: ${method} ${url}`);
    
    if (method === 'POST' && url.includes('/tracks') && !url.includes('/instances')) {
      const trackData = await route.request().postDataJSON();
      const trackId = 'track-' + Math.random().toString(36).substr(2, 9);
      
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: trackId,
          name: trackData.name || 'New Track',
          type: trackData.type || 'midi',
          volume: trackData.volume || 1.0,
          pan: trackData.pan || 0.0,
          mute: trackData.mute || false,
          solo: trackData.solo || false,
          position: trackData.position || 0,
          ...trackData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });
      return;
    }
    
    // Handle track instances
    if (url.includes('/instances')) {
      if (method === 'POST') {
        const instanceData = await route.request().postDataJSON();
        
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: Math.floor(Math.random() * 1000),
            start_time: instanceData.start_time || 0,
            end_time: instanceData.end_time || 4,
            volume: instanceData.volume || 1.0,
            ...instanceData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        });
        return;
      }
      
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
        return;
      }
    }
    
    // Handle copy/paste operations
    if (url.includes('/copy-instances')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clipboard_id: 'clipboard-' + Math.random().toString(36).substr(2, 9),
          instances_count: 1,
          message: 'Instances copied successfully'
        })
      });
      return;
    }
    
    if (url.includes('/paste-instances')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: Math.floor(Math.random() * 1000),
            start_time: 0,
            end_time: 4,
            volume: 1.0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
      });
      return;
    }
    
    await route.continue();
  });

  // Mock soundfont/sound endpoints
  await page.route('**/soundfonts**', async route => {
    console.log(`🎹 Soundfont API Mock: ${route.request().method()} ${route.request().url()}`);
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'piano-1',
          name: 'Grand Piano',
          category: 'piano',
          file_url: '/mock/piano.sf2'
        }
      ])
    });
  });

  await page.route('**/sounds**', async route => {
    console.log(`🔊 Sound API Mock: ${route.request().method()} ${route.request().url()}`);
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  // Mock drum samples
  await page.route('**/drum-samples**', async route => {
    console.log(`🥁 Drum Sample API Mock: ${route.request().method()} ${route.request().url()}`);
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'kick-1',
          name: 'Kick Drum',
          category: 'kick',
          file_url: '/mock/kick.wav'
        }
      ])
    });
  });

  // Mock assistant endpoints
  await page.route('**/assistant**', async route => {
    console.log(`🤖 Assistant API Mock: ${route.request().method()} ${route.request().url()}`);
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Assistant endpoint mocked'
      })
    });
  });

  console.log('✅ Comprehensive API mocking setup complete');
}