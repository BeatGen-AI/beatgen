import { createFileRoute } from '@tanstack/react-router'
import React from 'react'
import SoundLibrary from '../platform/components/SoundLibrary'
import { requireAuth } from '../platform/auth/auth-utils'

const logoColors = [
  '#e539a9', // Bright Pink
  '#c63ba6', // Magenta
  '#a93fbf', // Dark Violet
  '#8247d8', // Purple
  '#6050e0', // Indigo
  '#4160e2', // Blue
];

export const Route = createFileRoute('/audio-tracks')({
  component: AudioTracksPage,
  // Use requireAuth to protect this route
  ...requireAuth('/login'),
})

function AudioTracksPage() {
  const audioTracksColor = logoColors[2]

  return (
    <div className="p-8">
      <div className="container mx-auto max-w-5xl">
        <h1 
          className="text-3xl font-bold mb-6"
          style={{ 
            color: audioTracksColor, 
          }}
        >
          Audio Tracks
        </h1>
        <p className="text-muted-foreground mb-6">
          Manage your audio tracks and samples. Upload new audio files or use existing tracks in your projects.
        </p>
        
        {/* Sound Library Component */}
        <div className="bg-card rounded-lg p-4 shadow-md">
          <SoundLibrary sectionColor={audioTracksColor} />
        </div>
      </div>
    </div>
  )
}
