import { createFileRoute, Outlet, useRouter, useSearch } from '@tanstack/react-router'
import React from 'react'
// Removed ThemeProvider and createTheme imports
// Import Studio component with a different name to avoid any potential naming conflicts
import StudioComponent from '../studio/Studio'
import { requireAuth, AuthErrorComponent } from '../platform/auth/auth-utils.tsx'

// Type definition for our search parameters
interface StudioSearchParams {
  projectId?: string;
  trackId?: string;
  trackType?: 'audio' | 'midi' | 'sampler' | 'drum';
}

// Removed darkTheme definition

// Studio route - this will render at the path '/studio'
export const Route = createFileRoute('/studio')({
  // Type-safe search parameters
  validateSearch: (search: { projectId?: string; trackId?: string; trackType?: string }): StudioSearchParams => {
    return {
      projectId: search.projectId,
      trackId: search.trackId,
      trackType: search.trackType as 'audio' | 'midi' | 'sampler' | 'drum' | undefined,
    };
  },
  
  // Use requireAuth utility to protect this route
  ...requireAuth('/login'),
  
  // Custom loader behavior when authentication is successful
  loader: async ({ /* context, params, */ location }) => { // Access location instead of search
    console.log('Studio loader running with location:', location);
    
    // Safely access search params from location.search
    const searchParams = new URLSearchParams(location.search);
    const projectId = searchParams.get('projectId');
    const trackId = searchParams.get('trackId');
    const trackType = searchParams.get('trackType');
    
    if (projectId) {
      console.log(`Loading project data for: ${projectId}`);
      // Return the projectId to the component
      return { 
        projectId,
        projectLoaded: true
      };
    } else if (trackId && trackType) {
      console.log(`Creating new project with track: ${trackId} (${trackType})`);
      return { 
        trackId,
        trackType: trackType as 'audio' | 'midi' | 'sampler' | 'drum',
        projectLoaded: true
      };
    } else {
      console.log('No project ID or track provided - creating new project');
      return { projectLoaded: true };
    }
  },
  
  // Component to render
  component: StudioPage,
  
  // Use shared error component for authentication failures
  errorComponent: AuthErrorComponent,
})

function StudioPage() {
  // Get search params for this route
  const searchParams = useSearch({ from: Route.id }) as StudioSearchParams;
  const projectId = searchParams?.projectId;
  const trackId = searchParams?.trackId;
  const trackType = searchParams?.trackType;

  console.log("StudioPage rendering with:", { projectId, trackId, trackType });

  // Render StudioComponent directly - theme is handled by AppThemeProvider
  return (
    <StudioComponent 
      projectId={projectId} 
      initialTrackId={trackId}
      initialTrackType={trackType}
    />
  );
}