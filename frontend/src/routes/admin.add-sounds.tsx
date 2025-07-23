import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '../platform/auth/auth-context'
import { isAdminUser } from '../utils/adminUtils'
import { Button } from '../components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { ArrowLeft, Upload, Library, FolderOpen } from 'lucide-react'
import { DrumSampleUploadForm } from '../platform/components/admin/DrumSampleUploadForm'
import { DrumSampleManager } from '../platform/components/admin/DrumSampleManager'
import { BulkDrumSampleUpload } from '../platform/components/admin/BulkDrumSampleUpload'

export const Route = createFileRoute('/admin/add-sounds')({
  component: AddSoundsPage,
})

function AddSoundsPage() {
  const { user, loading } = useAuth()
  const [activeTab, setActiveTab] = useState('upload')
  const [refreshKey, setRefreshKey] = useState(0)

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

  const handleUploadSuccess = (sampleId: string) => {
    console.log('Upload successful:', sampleId)
    // Trigger refresh of the library tab
    setRefreshKey(prev => prev + 1)
    // Optionally switch to library tab to see the new sample
    setActiveTab('library')
  }

  const handleBulkUploadSuccess = (sampleIds: string[]) => {
    console.log('Bulk upload successful:', sampleIds)
    // Trigger refresh of the library tab
    setRefreshKey(prev => prev + 1)
    // Switch to library tab to see the new samples
    setActiveTab('library')
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Admin Dashboard
        </Link>
        <h1 className="text-3xl font-bold mb-2">Sound Management</h1>
        <p className="text-gray-600">Upload and manage sounds in the library</p>
      </div>

      <div className="max-w-6xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Single Upload
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Bulk Upload
            </TabsTrigger>
            <TabsTrigger value="library" className="flex items-center gap-2">
              <Library className="h-4 w-4" />
              Manage Library
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-6">
            <DrumSampleUploadForm 
              onUploadSuccess={handleUploadSuccess}
            />
          </TabsContent>

          <TabsContent value="bulk" className="mt-6">
            <BulkDrumSampleUpload 
              onUploadSuccess={handleBulkUploadSuccess}
            />
          </TabsContent>

          <TabsContent value="library" className="mt-6">
            <DrumSampleManager 
              key={refreshKey}
              onRefresh={() => setRefreshKey(prev => prev + 1)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}