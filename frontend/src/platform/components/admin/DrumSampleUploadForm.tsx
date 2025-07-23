import React, { useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { Upload, Loader2, CheckCircle } from 'lucide-react'
import { adminApi, DrumSampleUploadData } from '../../api/admin'

// Genre and category options based on the backend enums
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

interface DrumSampleUploadFormProps {
  onUploadSuccess?: (sampleId: string) => void
  onCancel?: () => void
}

export function DrumSampleUploadForm({ onUploadSuccess, onCancel }: DrumSampleUploadFormProps) {
  const [formData, setFormData] = useState({
    display_name: '',
    kit_name: '',
    genre: '',
    category: '',
    description: ''
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      // Auto-populate display name from file name if empty
      if (!formData.display_name) {
        const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, '')
        setFormData(prev => ({ ...prev, display_name: nameWithoutExtension }))
      }
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedFile || !formData.display_name || !formData.kit_name || !formData.genre || !formData.category) {
      setError('Please fill in all required fields and select a file')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const uploadData: DrumSampleUploadData = {
        file: selectedFile,
        display_name: formData.display_name,
        kit_name: formData.kit_name,
        genre: formData.genre,
        category: formData.category,
        description: formData.description || undefined
      }

      const result = await adminApi.uploadDrumSample(uploadData)
      setSuccess(true)
      
      // Reset form after successful upload
      setFormData({
        display_name: '',
        kit_name: '',
        genre: '',
        category: '',
        description: ''
      })
      setSelectedFile(null)
      
      if (onUploadSuccess) {
        onUploadSuccess(result.id)
      }

    } catch (err: any) {
      console.error('Upload failed:', err)
      setError(err.response?.data?.detail || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      display_name: '',
      kit_name: '',
      genre: '',
      category: '',
      description: ''
    })
    setSelectedFile(null)
    setError(null)
    setSuccess(false)
  }

  if (success) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle className="h-12 w-12 text-green-600" />
            <h3 className="text-lg font-semibold">Upload Successful!</h3>
            <p className="text-gray-600">The drum sample has been added to the library.</p>
            <div className="flex gap-2">
              <Button onClick={resetForm}>Upload Another</Button>
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
        <CardTitle>Upload Drum Sample</CardTitle>
        <CardDescription>
          Add a new drum sample to the public library
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="file">Audio File *</Label>
            <Input
              id="file"
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              required
            />
            {selectedFile && (
              <p className="text-sm text-gray-600 mt-1">
                Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="display_name">Display Name *</Label>
            <Input
              id="display_name"
              value={formData.display_name}
              onChange={(e) => handleInputChange('display_name', e.target.value)}
              placeholder="e.g., Heavy Kick"
              required
            />
          </div>

          <div>
            <Label htmlFor="kit_name">Kit Name *</Label>
            <Input
              id="kit_name"
              value={formData.kit_name}
              onChange={(e) => handleInputChange('kit_name', e.target.value)}
              placeholder="e.g., Metro Boomin Kit"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="genre">Genre *</Label>
              <Select value={formData.genre} onValueChange={(value) => handleInputChange('genre', value)}>
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

            <div>
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
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
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Optional description..."
              rows={3}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Sample
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}