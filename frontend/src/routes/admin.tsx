import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router'
import { useAuth } from '../platform/auth/auth-context'
import { isAdminUser } from '../utils/adminUtils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Users, Music } from 'lucide-react'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
  beforeLoad: ({ context }) => {
    // This will be handled in the component since we need useAuth hook
  }
})

function AdminPage() {
  const { user, loading } = useAuth()
  const location = useLocation()
  
  // Check if we're on the main admin page (not a subpage)
  const isMainAdminPage = location.pathname === '/admin'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading...</p>
      </div>
    )
  }

  if (!user || !isAdminUser(user.id)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
          <Link to="/" className="mt-4 inline-block text-blue-600 hover:text-blue-800">
            Return to Home
          </Link>
        </div>
      </div>
    )
  }

  // If we're on a subpage, render the child route
  if (!isMainAdminPage) {
    return <Outlet />
  }

  // Otherwise render the main admin dashboard
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-gray-600">Manage users and sounds</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>
            <CardDescription>
              Upgrade user accounts and manage user permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/admin/upgrade-user">
              <Button className="w-full">
                Manage Users
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Sound Management
            </CardTitle>
            <CardDescription>
              Add new sounds and manage the sound library
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/admin/add-sounds">
              <Button className="w-full">
                Manage Sounds
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}