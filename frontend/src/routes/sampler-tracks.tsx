import { createFileRoute } from '@tanstack/react-router'
import React from 'react'
import SamplerLibrary from '../platform/components/SamplerLibrary'
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

export const Route = createFileRoute('/sampler-tracks')({
  component: SamplerTracksPage,
  // Use requireAuth to protect this route
  ...requireAuth('/login'),
})

function SamplerTracksPage() {
  const samplerTracksColor = logoColors[4]

  return (
    <div className="p-8">
      <div className="container mx-auto max-w-5xl">
        {/* Sampler Library Component */}
        <FadeCard>
          <FadeCardHeader>
            <FadeCardTitle style={{ color: samplerTracksColor }}>
              Sampler Tracks
            </FadeCardTitle>
            <FadeCardDescription>
              Manage your sampler tracks and instruments. Create new sampler instruments or use existing ones.
            </FadeCardDescription>
          </FadeCardHeader>
          <FadeCardContent>
            <SamplerLibrary sectionColor={samplerTracksColor} />
          </FadeCardContent>
        </FadeCard>
      </div>
    </div>
  )
}
