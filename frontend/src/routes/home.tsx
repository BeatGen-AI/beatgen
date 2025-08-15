import { createFileRoute, useNavigate } from '@tanstack/react-router'
import React, { useEffect } from 'react'
import HomePage from '../platform/pages/HomePage'
import AuthModal from '../components/AuthModal'
import { useAuth } from '../platform/auth/auth-context'

// Define search params schema
interface HomeSearchParams {
  tab?: 'login' | 'signup'
}

// Home route - shows HomePage with auth modal overlay for unauthenticated users
export const Route = createFileRoute('/home')({
  component: HomePageWithAuth,
  validateSearch: (search: Record<string, unknown>): HomeSearchParams => {
    return {
      tab: search.tab as 'login' | 'signup' | undefined
    }
  }
})

function HomePageWithAuth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  
  // If user is logged in and there are query params, redirect to clean /home
  useEffect(() => {
    if (user && !loading && tab) {
      navigate({ to: '/home', replace: true });
    }
  }, [user, loading, tab, navigate]);
  
  // Lock body scroll when auth modal is shown
  useEffect(() => {
    if (!user && !loading) {
      // Add overflow hidden to body to prevent scrolling
      document.body.style.overflow = 'hidden';
      return () => {
        // Cleanup: restore scroll when component unmounts or user logs in
        document.body.style.overflow = '';
      };
    }
  }, [user, loading]);
  
  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>Loading...</p>
      </div>
    );
  }
  
  return (
    <>
      <HomePage />
      {/* Show auth modal if not authenticated */}
      {!user && <AuthModal initialTab={tab === 'signup' ? 'register' : 'login'} />}
    </>
  );
}