import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '../platform/auth/auth-context'
import { isAdminUser } from '../utils/adminUtils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/admin/upgrade-user')({
  component: UpgradeUserPage,
})

function UpgradeUserPage() {
  const { user, loading } = useAuth()

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

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Admin Dashboard
        </Link>
        <h1 className="text-3xl font-bold mb-2">Upgrade User</h1>
        <p className="text-gray-600">Manage user account upgrades and permissions</p>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>User Upgrade Tool</CardTitle>
            <CardDescription>
              This page will contain user upgrade functionality
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              User upgrade functionality will be implemented here.
            </p>
            {/* TODO: Add user search, upgrade forms, etc. */}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}