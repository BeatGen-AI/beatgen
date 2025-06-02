import { createFileRoute } from '@tanstack/react-router'
import React, { useEffect } from 'react'
import Projects from '../platform/pages/Projects'
import HomePage from '../platform/pages/HomePage'
import { requireAuth, AuthErrorComponent, isAuthenticated } from '../platform/auth/auth-utils.tsx'

// Home/Projects route - this will render at the path '/home'
// Allow guest access but redirect to login if they try to access without auth and have no generation intent
export const Route = createFileRoute('/home')({
  // Remove auth requirement to allow guest access
  component: HomePage,
})

function HomePageDemo() {
  // For demonstration, log that we've accessed this protected route
  useEffect(() => {
    console.log('Accessing protected home/projects page')
  }, [])

  // Render the Navbar and Projects component
  return (
    <>
      <HomePage />
    </>
  )
}