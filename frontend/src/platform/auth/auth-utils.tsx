import React from 'react';
import { useAuth } from './auth-context';

/**
 * Hook to check if the user is authenticated using auth context
 * @returns {boolean} True if the user is authenticated, false otherwise
 */
export const useIsAuthenticated = (): boolean => {
  const { user, loading } = useAuth();
  const isAuth = !loading && !!user;
  console.log(`Auth check: ${isAuth ? 'Authenticated' : 'Not authenticated'}`);
  return isAuth;
};

/**
 * DEPRECATED: Use useIsAuthenticated hook instead
 * Fallback function that checks localStorage (may have race condition issues)
 */
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem('access_token');
  const isAuth = !!token;
  console.log(`Auth check (deprecated): ${isAuth ? 'Authenticated' : 'Not authenticated'}`);
  return isAuth;
};

/**
 * Utility to safely redirect to a route (works outside Router context)
 */
export const safeRedirect = (path: string) => {
  window.location.href = path;
};

/**
 * Route guard for protected routes
 * @param redirectTo - Path to redirect to if not authenticated
 * @returns An object with beforeLoad function for route config
 */
export const requireAuth = (redirectTo: string = '/login') => {
  return {
    beforeLoad: async ({ navigate, location }: { navigate: any, location: any }) => {
      console.group('Protected Route Check');
      console.log('Current URL:', location.href);
      console.log('Redirect target if unauthorized:', redirectTo); 
      
      // Check for OAuth tokens in URL hash - allow access during OAuth flow
      if (window.location.hash.includes('access_token=')) {
        console.log('OAuth callback detected in route guard, allowing access');
        console.groupEnd();
        return {};
      }
      
      if (!isAuthenticated()) {
        console.log('User is NOT authenticated, redirecting to', redirectTo);
        // Prevent the auth error component from showing on initial load
        // We need to delay slightly to ensure the redirect works properly
        setTimeout(() => {
          navigate({ to: redirectTo, replace: true });
        }, 10);
        
        // Return false to prevent the route from loading
        console.groupEnd();
        return false;
      }
      
      console.log('User is authenticated, allowing access to protected route');
      console.groupEnd();
      return {};
    }
  };
};

/**
 * Route guard for public routes that should redirect if already authenticated
 * @param redirectTo - Path to redirect to if already authenticated
 * @returns An object with beforeLoad function for route config
 */
export const publicRoute = (redirectTo: string = '/home') => {
  return {
    beforeLoad: async ({ navigate, location }: { navigate: any, location: any }) => {
      console.group('Public Route Check');
      console.log('Current URL:', location.href);
      console.log('Redirect target:', redirectTo);
      
      if (isAuthenticated()) {
        console.log('User is authenticated, redirecting to', redirectTo);
        // Redirect to home page
        navigate({ to: redirectTo, replace: true });
        // We still want to load the route in case navigation fails
        // so we don't return false here
      } else {
        console.log('User is not authenticated, allowing access to public route');
      }
      
      console.groupEnd();
      return {};
    }
  };
};

/**
 * Default error component for authentication failures
 */
export const AuthErrorComponent = ({ error }: { error: Error }) => {
  console.error('Authentication error:', error);
  
  return (
    <div style={{ padding: '2rem', color: 'white', textAlign: 'center' }}>
      <h2>Authentication Required</h2>
      <p>Please log in to access this page.</p>
      <button 
        onClick={() => safeRedirect('/login')}
        style={{ 
          background: '#3f51b5', 
          color: 'white', 
          border: 'none', 
          padding: '8px 16px', 
          borderRadius: '4px',
          cursor: 'pointer',
          marginTop: '16px'
        }}
      >
        Go to Login
      </button>
    </div>
  );
};