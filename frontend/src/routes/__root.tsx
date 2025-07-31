import { createRootRoute, Outlet, useRouter, useLocation } from '@tanstack/react-router'
import React, { useEffect, useState } from 'react'
// import Navbar from '../platform/components/Navbar'
import { useAuth } from '../platform/auth/auth-context'
// OAuth callback now handled automatically by Supabase
import SimpleSidebar from '../platform/components/SimpleSidebar'
import MobileTopNav from '../platform/components/MobileTopNav'
import MobileBottomNav from '../platform/components/MobileBottomNav'
import { cn } from '../lib/utils'
import { useAppTheme } from '../lib/theme-provider'

// Root Layout Component - this wraps all routes
export const Route = createRootRoute({
  component: RootLayout,
  // Add a global error component to handle any unhandled errors or redirects
  errorComponent: ({ error }) => {
    console.error('Root error boundary caught:', error);
    
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        color: 'white',
        background: '#111',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <h1>Something went wrong</h1>
        <p>The application encountered an unexpected error.</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#3f51b5',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer',
            marginTop: '1rem'
          }}
        >
          Reload page
        </button>
      </div>
    )
  }
})

// Root Layout Component implementation
function RootLayout() {
  const { loading, user } = useAuth();
  const router = useRouter();
  const location = useLocation();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const { studioMode } = useAppTheme();
  
  // Simple studio route detection using router location
  const isStudioRoute = location.pathname === '/studio';
  
  // Force remove global theme classes when on studio route
  useEffect(() => {
    if (isStudioRoute) {
      // Remove any global theme classes from document element
      document.documentElement.classList.remove('light', 'dark');
      document.body.classList.remove('light', 'dark');
      // Force override background on body for studio
      document.body.style.backgroundColor = studioMode === 'dark' ? '#000000' : '#ffffff';
      document.body.style.color = studioMode === 'dark' ? '#ffffff' : '#000000';
    } else {
      // Reset body styles for non-studio routes
      document.body.style.backgroundColor = '';
      document.body.style.color = '';
    }
    
    return () => {
      // Cleanup when component unmounts
      if (isStudioRoute) {
        document.body.style.backgroundColor = '';
        document.body.style.color = '';
      }
    };
  }, [isStudioRoute, studioMode]);
  
  // Handle password reset tokens (OAuth is now handled by Supabase automatically)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check for password reset token in hash
      const hash = window.location.hash;
      if (hash && hash.includes('type=recovery') && location.pathname !== '/reset-password') {
        // Redirect to reset-password page with the hash intact
        window.location.href = `/reset-password${hash}`;
      }
    }
  }, [location.pathname]);
  
  if (loading) {
    return (
      <div 
        className={cn(
          "flex justify-center items-center h-screen",
          isStudioRoute 
            ? (studioMode === 'dark' ? 'studio-dark-theme' : 'studio-light-theme')
            : "bg-background text-foreground"
        )}
      >
        <p>Loading...</p>
      </div>
    );
  }
  
  // Determine if the sidebar should be shown based on the route and authentication
  // Hide navigation on studio, login, register routes and when user is not authenticated
  const noSidebarRoutes = ['/studio', '/login', '/register', '/complete-profile', '/reset-password', '/oauth-callback'];
  const isPublicRoute = location.pathname === '/' || noSidebarRoutes.includes(location.pathname);
  const shouldShowSidebar = !isPublicRoute && !loading && user;

  // No navbar in the root layout - each route will add its own navbar if needed
  return (
    <div 
      id="root-layout" 
      className={cn(
        "min-h-screen",
        isStudioRoute 
          ? (studioMode === 'dark' ? 'studio-dark-theme' : 'studio-light-theme')
          : "bg-background text-foreground"
      )}
    >
      {/* Desktop Sidebar */}
      {shouldShowSidebar && (
        <SimpleSidebar 
          isExpanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
        />
      )}
      
      {/* Mobile Navigation */}
      {shouldShowSidebar && (
        <>
          <MobileTopNav />
          <MobileBottomNav />
        </>
      )}
      
      <main
        className={cn(
          "overflow-x-hidden",
          // Only apply transitions when not in studio
          !isStudioRoute && "transition-all duration-300",
          // Desktop margins for sidebar
          shouldShowSidebar 
            ? (sidebarExpanded ? 'md:ml-64' : 'md:ml-16')
            : '',
          // Mobile margins for top and bottom nav
          shouldShowSidebar ? 'pt-12 pb-12 md:pt-0 md:pb-0' : ''
        )}
        style={{ minWidth: 0 }}
      >
        <Outlet />
      </main>
    </div>
  );
}