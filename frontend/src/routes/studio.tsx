import { createFileRoute, Outlet, useRouter, useSearch } from '@tanstack/react-router'
import React from 'react'
// Removed ThemeProvider and createTheme imports
// Import Studio component with a different name to avoid any potential naming conflicts
import StudioComponent from '../studio/Studio'
import { requireAuth, AuthErrorComponent } from '../platform/auth/auth-utils.tsx'

// Type definition for our search parameters
interface StudioSearchParams {
  projectId?: string;
  selectedTracks?: string;
  trackTypes?: string;
}

// Removed darkTheme definition

// Studio route - this will render at the path '/studio'
export const Route = createFileRoute('/studio')({
  // Type-safe search parameters
  validateSearch: (search: { projectId?: string, selectedTracks?: string, trackTypes?: string }): StudioSearchParams => {
    return {
      projectId: search.projectId,
      selectedTracks: search.selectedTracks,
      trackTypes: search.trackTypes,
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
    const selectedTracks = searchParams.get('selectedTracks');
    const trackTypes = searchParams.get('trackTypes');
    
    if (projectId) {
      console.log(`Loading project data for: ${projectId}`);
      if (selectedTracks && trackTypes) {
        console.log(`With selected tracks: ${selectedTracks}`);
        console.log(`Track types: ${trackTypes}`);
      }
      // Return the projectId to the component
      return { 
        projectId,
        selectedTracks,
        trackTypes,
        projectLoaded: true
      };
    } else {
      console.log('No project ID provided - creating new project');
      return { projectLoaded: true };
    }
  },
  
  // Component to render
  component: StudioPage,
  
  // Use shared error component for authentication failures
  errorComponent: AuthErrorComponent,
})

function StudioPage() {
  // Get all search params for this route
  const searchParams = useSearch({ from: Route.id }) as StudioSearchParams;
  const { projectId, selectedTracks, trackTypes } = searchParams;

  console.log("StudioPage rendering with:", { projectId, selectedTracks, trackTypes });

  // Render StudioComponent directly - theme is handled by AppThemeProvider
  return <StudioComponent 
    projectId={projectId} 
    selectedTracks={selectedTracks}
    trackTypes={trackTypes}
  />;
}