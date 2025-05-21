import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import ProfilePage from '../platform/pages/Profile'
import { requireAuth } from '../platform/auth/auth-utils'

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
  ...requireAuth(),
})

function RouteComponent() {
  return <div>Hello "/profile"!</div>
}
