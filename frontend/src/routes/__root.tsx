import { createRootRoute, Outlet, useRouter, useLocation } from '@tanstack/react-router'
import React, { useEffect, useState } from 'react'
// import Navbar from '../platform/components/Navbar'
import { useAuth } from '../platform/auth/auth-context'
import { handleOAuthCallback } from '../platform/api/auth'
import { useTheme } from '../lib/theme-provider'
import SimpleSidebar from '../platform/components/SimpleSidebar'
import MobileTopNav from '../platform/components/MobileTopNav'
import MobileBottomNav from '../platform/components/MobileBottomNav'
import { cn } from '../lib/utils'

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
  const { homepageTheme, studioTheme } = useTheme();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  
  // Simple studio route detection using router location
  const isStudioRoute = location.pathname === '/studio';
  
  // Handle OAuth callbacks and password reset tokens
  useEffect(() => {
    const handleAuthCallbacks = async () => {
      // Check if this is an OAuth callback
      if (typeof window !== 'undefined') {
        // Check for password reset token in hash
        const hash = window.location.hash;
        if (hash && hash.includes('type=recovery') && location.pathname !== '/reset-password') {
          // Redirect to reset-password page with the hash intact
          window.location.href = `/reset-password${hash}`;
          return;
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const isGoogleCallback = window.location.pathname.includes('/api/auth/callback/google');
        
        if (code && isGoogleCallback) {
          try {
            console.log('Processing Google OAuth callback');
            const result = await handleOAuthCallback('google', code);
            
            if (result.access_token) {
              // Store the token
              localStorage.setItem('access_token', result.access_token);
              console.log('OAuth authentication successful, token stored');
              
              // Redirect to home or requested page
              const redirectTo = localStorage.getItem('auth_redirect') || '/';
              localStorage.removeItem('auth_redirect'); // Clear redirect
              window.location.href = redirectTo;
            }
          } catch (error) {
            console.error('OAuth callback processing failed:', error);
            // Redirect to login page on error
            window.location.href = '/login?error=oauth_failed';
          }
        }
      }
    };
    
    handleAuthCallbacks();
  }, [location.pathname]);
  
  // Define themes inline or import them if preferred
  const lightTheme = { background: '#ffffff', text: '#000000' }; // Simplified for example
  const darkTheme = { background: '#000000', text: '#ffffff' };
  
  // Only homepage theme matters for root layout
  // Studio routes handle their own theming via StudioThemeWrapper
  const resolvedTheme = homepageTheme === 'system' 
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? 'dark' : 'light')
    : homepageTheme;
  const currentThemePalette = resolvedTheme === 'light' ? lightTheme : darkTheme;
  
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: currentThemePalette.background,
        color: currentThemePalette.text
      }}>
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
      className="min-h-screen"
      style={{ 
        background: currentThemePalette.background, 
        color: currentThemePalette.text
      }}
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