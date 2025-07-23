import React, { useState, useEffect } from 'react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Loader2, Trash2, RefreshCw, Music } from 'lucide-react'
import { adminApi, DrumSample } from '../../api/admin'

interface DrumSampleManagerProps {
  onRefresh?: () => void
}

export function DrumSampleManager({ onRefresh }: DrumSampleManagerProps) {
  const [samples, setSamples] = useState<DrumSample[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSamples = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.getAllDrumSamples()
      setSamples(data)
    } catch (err: any) {
      console.error('Failed to load samples:', err)
      setError('Failed to load drum samples')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (sampleId: string, displayName: string) => {
    if (!confirm(`Are you sure you want to delete "${displayName}"? This action cannot be undone.`)) {
      return
    }

    setDeleting(sampleId)
    try {
      await adminApi.deleteDrumSample(sampleId)
      setSamples(prev => prev.filter(sample => sample.id !== sampleId))
      if (onRefresh) {
        onRefresh()
      }
    } catch (err: any) {
      console.error('Failed to delete sample:', err)
      setError(`Failed to delete "${displayName}": ${err.response?.data?.detail || err.message}`)
    } finally {
      setDeleting(null)
    }
  }

  useEffect(() => {
    loadSamples()
  }, [])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDuration = (duration?: number) => {
    if (!duration) return 'Unknown'
    if (duration < 60) return `${duration.toFixed(1)}s`
    const minutes = Math.floor(duration / 60)
    const seconds = (duration % 60).toFixed(1)
    return `${minutes}:${seconds.padStart(4, '0')}`
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading drum samples...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Drum Sample Library
          </span>
          <Button variant="outline" size="sm" onClick={loadSamples}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardTitle>
        <CardDescription>
          Manage drum samples in the public library ({samples.length} samples)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {samples.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No drum samples found in the library.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {samples.map((sample) => (
              <Card key={sample.id} className="border-l-4 border-l-blue-500">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{sample.display_name}</h4>
                        <Badge variant="secondary">{sample.category}</Badge>
                        <Badge variant="outline">{sample.genre}</Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-2">
                        <div>
                          <strong>Kit:</strong> {sample.kit_name}
                        </div>
                        <div>
                          <strong>File:</strong> {sample.file_name}
                        </div>
                        <div>
                          <strong>Format:</strong> {sample.file_format.toUpperCase()}
                        </div>
                        <div>
                          <strong>Size:</strong> {formatFileSize(sample.file_size)}
                        </div>
                        {sample.duration && (
                          <div>
                            <strong>Duration:</strong> {formatDuration(sample.duration)}
                          </div>
                        )}
                        <div>
                          <strong>Created:</strong> {new Date(sample.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      {sample.description && (
                        <p className="text-sm text-gray-700 mt-2">
                          {sample.description}
                        </p>
                      )}
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(sample.id, sample.display_name)}
                      disabled={deleting === sample.id}
                    >
                      {deleting === sample.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}