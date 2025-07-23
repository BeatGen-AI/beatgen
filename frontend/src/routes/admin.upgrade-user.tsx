import React, { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '../platform/auth/auth-context'
import { isAdminUser } from '../utils/adminUtils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { ArrowLeft } from 'lucide-react'
import { UserSearch } from '../platform/components/admin/UserSearch'
import { AddCreditsForm } from '../platform/components/admin/AddCreditsForm'
import { ChangePlanForm } from '../platform/components/admin/ChangePlanForm'
import { AdminUserSearch } from '../platform/api/admin'

export const Route = createFileRoute('/admin/upgrade-user')({
  component: UpgradeUserPage,
})

function UpgradeUserPage() {
  const { user, loading } = useAuth()
  const [selectedUser, setSelectedUser] = useState<AdminUserSearch | null>(null)

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

  const handleUserSelect = (user: AdminUserSearch) => {
    setSelectedUser(user)
  }

  const handleSuccess = (updatedCredits: any) => {
    // Update the selected user's credits with the new data
    if (selectedUser && selectedUser.credits) {
      setSelectedUser({
        ...selectedUser,
        credits: updatedCredits
      })
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Admin Dashboard
        </Link>
        <h1 className="text-3xl font-bold mb-2">User Management</h1>
        <p className="text-gray-600">Add credits and change subscription plans for users</p>
      </div>

      <div className="space-y-8">
        {/* User Search - Always visible at the top */}
        <div>
          <UserSearch 
            onUserSelect={handleUserSelect} 
            selectedUser={selectedUser}
          />
        </div>

        {/* Action Forms - Tabbed interface */}
        <div>
          <Tabs defaultValue="credits" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="credits">Add Credits</TabsTrigger>
              <TabsTrigger value="plan">Change Plan</TabsTrigger>
            </TabsList>
            
            <TabsContent value="credits" className="space-y-4">
              <AddCreditsForm 
                selectedUser={selectedUser}
                onSuccess={handleSuccess}
              />
            </TabsContent>
            
            <TabsContent value="plan" className="space-y-4">
              <ChangePlanForm 
                selectedUser={selectedUser}
                onSuccess={handleSuccess}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}