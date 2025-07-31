import { createFileRoute } from '@tanstack/react-router'
import React from 'react'
import DrumLibrary from '../platform/components/DrumLibrary'
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

export const Route = createFileRoute('/drum-tracks')({
  component: DrumTracksPage,
  // Use requireAuth to protect this route
  ...requireAuth('/login'),
})

function DrumTracksPage() {
  const drumTracksColor = logoColors[5]

  return (
    <div className="p-8">
      <div className="container mx-auto max-w-5xl">
        {/* Drum Library Component */}
        <FadeCard>
          <FadeCardHeader>
            <FadeCardTitle style={{ color: drumTracksColor }}>
              Drum Tracks
            </FadeCardTitle>
            <FadeCardDescription>
              Manage your drum tracks and kits. Create new drum patterns or use existing drum kits.
            </FadeCardDescription>
          </FadeCardHeader>
          <FadeCardContent>
            <DrumLibrary sectionColor={drumTracksColor} />
          </FadeCardContent>
        </FadeCard>
      </div>
    </div>
  )
}
