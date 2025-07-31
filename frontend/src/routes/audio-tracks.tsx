import { createFileRoute } from '@tanstack/react-router'
import React from 'react'
import SoundLibrary from '../platform/components/SoundLibrary'
import { requireAuth } from '../platform/auth/auth-utils'
import { FadeCard, FadeCardHeader, FadeCardTitle, FadeCardDescription, FadeCardContent } from '../components/ui/fade-card'

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
        {/* Sound Library Component */}
        <FadeCard>
          <FadeCardHeader>
            <FadeCardTitle style={{ color: audioTracksColor }}>
              Audio Tracks
            </FadeCardTitle>
            <FadeCardDescription>
              Manage your audio tracks and samples. Upload new audio files or use existing tracks in your projects.
            </FadeCardDescription>
          </FadeCardHeader>
          <FadeCardContent>
            <SoundLibrary sectionColor={audioTracksColor} />
          </FadeCardContent>
        </FadeCard>
      </div>
    </div>
  )
}
