import React, { useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Upload, Loader2, CheckCircle, X, FolderOpen } from 'lucide-react'
import { adminApi, DrumSampleUploadData } from '../../api/admin'

// Genre and category options
const GENRES = [
  'Hip-Hop',
  'Trap',
  'Electronic',
  'Pop',
  'Rock',
  'Jazz',
  'Funk',
  'Classical',
  'Other'
]

const CATEGORIES = [
  'Kick',
  'Snare',
  'Hi-Hat',
  'Cymbal',
  'Tom',
  'Percussion',
  'Other'
]

interface FileUploadData {
  file: File
  display_name: string
  category: string
  description: string
}

interface BulkDrumSampleUploadProps {
  onUploadSuccess?: (sampleIds: string[]) => void
  onCancel?: () => void
}

export function BulkDrumSampleUpload({ onUploadSuccess, onCancel }: BulkDrumSampleUploadProps) {
  // Shared fields for all files
  const [sharedData, setSharedData] = useState({
    kit_name: '',
    genre: ''
  })
  
  // Individual file data
  const [files, setFiles] = useState<FileUploadData[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 })
  const [success, setSuccess] = useState(false)
  const [uploadedIds, setUploadedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const audioFiles = selectedFiles.filter(file => file.type.startsWith('audio/'))
    
    if (audioFiles.length === 0) {
      setError('No audio files found in the selected folder')
      return
    }

    if (audioFiles.length !== selectedFiles.length) {
      setError(`Selected ${selectedFiles.length} files, but only ${audioFiles.length} are audio files. Non-audio files will be ignored.`)
    }

    // Create file upload data with default values
    const fileData: FileUploadData[] = audioFiles.map(file => ({
      file,
      display_name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      category: 'Other', // Default category
      description: ''
    }))

    setFiles(fileData)
    setError(null)
  }

  const updateFileData = (index: number, field: keyof Omit<FileUploadData, 'file'>, value: string) => {
    setFiles(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ))
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSharedDataChange = (field: string, value: string) => {
    setSharedData(prev => ({ ...prev, [field]: value }))
  }

  const validateForm = () => {
    if (!sharedData.kit_name.trim()) {
      setError('Kit name is required')
      return false
    }
    if (!sharedData.genre) {
      setError('Genre is required')
      return false
    }
    if (files.length === 0) {
      setError('No files selected')
      return false
    }
    
    // Check each file has required fields
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.display_name.trim()) {
        setError(`Display name is required for file: ${file.file.name}`)
        return false
      }
      if (!file.category) {
        setError(`Category is required for file: ${file.file.name}`)
        return false
      }
    }
    
    return true
  }

  const handleBulkUpload = async () => {
    if (!validateForm()) return

    setUploading(true)
    setError(null)
    setUploadProgress({ completed: 0, total: files.length })
    
    const uploadedSampleIds: string[] = []
    
    try {
      // Upload files one by one to show progress
      for (let i = 0; i < files.length; i++) {
        const fileData = files[i]
        
        const uploadData: DrumSampleUploadData = {
          file: fileData.file,
          display_name: fileData.display_name,
          kit_name: sharedData.kit_name,
          genre: sharedData.genre,
          category: fileData.category,
          description: fileData.description || undefined
        }

        try {
          const result = await adminApi.uploadDrumSample(uploadData)
          uploadedSampleIds.push(result.id)
          setUploadProgress({ completed: i + 1, total: files.length })
        } catch (err: any) {
          console.error(`Failed to upload ${fileData.file.name}:`, err)
          setError(`Failed to upload ${fileData.file.name}: ${err.response?.data?.detail || err.message}`)
          break
        }
      }

      if (uploadedSampleIds.length === files.length) {
        // All uploads successful
        setSuccess(true)
        setUploadedIds(uploadedSampleIds)
        
        if (onUploadSuccess) {
          onUploadSuccess(uploadedSampleIds)
        }
      }
      
    } catch (err: any) {
      console.error('Bulk upload failed:', err)
      setError(`Bulk upload failed: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const resetForm = () => {
    setSharedData({ kit_name: '', genre: '' })
    setFiles([])
    setError(null)
    setSuccess(false)
    setUploadProgress({ completed: 0, total: 0 })
    setUploadedIds([])
  }

  if (success) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle className="h-12 w-12 text-green-600" />
            <h3 className="text-lg font-semibold">Bulk Upload Successful!</h3>
            <p className="text-gray-600">
              Successfully uploaded {uploadedIds.length} drum samples to the library.
            </p>
            <div className="flex gap-2">
              <Button onClick={resetForm}>Upload More</Button>
              {onCancel && (
                <Button variant="outline" onClick={onCancel}>Close</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Bulk Upload Drum Samples
        </CardTitle>
        <CardDescription>
          Upload multiple drum samples from a folder with shared kit name and genre
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* File Selection */}
          <div>
            <Label htmlFor="folder">Select Folder *</Label>
            <Input
              id="folder"
              type="file"
              webkitdirectory=""
              multiple
              accept="audio/*"
              onChange={handleFolderSelect}
              disabled={uploading}
            />
            <p className="text-sm text-gray-600 mt-1">
              Select a folder containing audio files. Only audio files will be processed.
            </p>
          </div>

          {files.length > 0 && (
            <>
              {/* Shared Fields */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-semibold mb-4">Shared Settings ({files.length} files selected)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="kit_name">Kit Name *</Label>
                    <Input
                      id="kit_name"
                      value={sharedData.kit_name}
                      onChange={(e) => handleSharedDataChange('kit_name', e.target.value)}
                      placeholder="e.g., Metro Boomin Kit"
                      disabled={uploading}
                    />
                  </div>
                  <div>
                    <Label htmlFor="genre">Genre *</Label>
                    <Select 
                      value={sharedData.genre} 
                      onValueChange={(value) => handleSharedDataChange('genre', value)}
                      disabled={uploading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select genre" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENRES.map((genre) => (
                          <SelectItem key={genre} value={genre}>
                            {genre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Individual File Settings */}
              <div>
                <h3 className="font-semibold mb-4">Individual File Settings</h3>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {files.map((fileData, index) => (
                    <Card key={index} className="border-l-4 border-l-blue-500">
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <Label htmlFor={`display_name_${index}`}>Display Name *</Label>
                              <Input
                                id={`display_name_${index}`}
                                value={fileData.display_name}
                                onChange={(e) => updateFileData(index, 'display_name', e.target.value)}
                                disabled={uploading}
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                File: {fileData.file.name}
                              </p>
                            </div>
                            
                            <div>
                              <Label htmlFor={`category_${index}`}>Category *</Label>
                              <Select 
                                value={fileData.category}
                                onValueChange={(value) => updateFileData(index, 'category', value)}
                                disabled={uploading}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CATEGORIES.map((category) => (
                                    <SelectItem key={category} value={category}>
                                      {category}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div>
                              <Label htmlFor={`description_${index}`}>Description</Label>
                              <Textarea
                                id={`description_${index}`}
                                value={fileData.description}
                                onChange={(e) => updateFileData(index, 'description', e.target.value)}
                                rows={2}
                                disabled={uploading}
                              />
                            </div>
                          </div>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            disabled={uploading}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading files... ({uploadProgress.completed}/{uploadProgress.total})</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel} disabled={uploading}>
                Cancel
              </Button>
            )}
            <Button 
              onClick={handleBulkUpload} 
              disabled={uploading || files.length === 0 || !sharedData.kit_name || !sharedData.genre}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading ({uploadProgress.completed}/{uploadProgress.total})...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload {files.length} Samples
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}