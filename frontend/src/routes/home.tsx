import { createFileRoute } from '@tanstack/react-router'
import React from 'react'
import HomePage from '../platform/pages/HomePage'
import AuthModal from '../components/AuthModal'
import { useAuth } from '../platform/auth/auth-context'

// Home route - shows HomePage with auth modal overlay for unauthenticated users
export const Route = createFileRoute('/home')({
  component: HomePageWithAuth,
})

function HomePageWithAuth() {
  const { user, loading } = useAuth();
  
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
      {!user && <AuthModal />}
    </>
  );
}