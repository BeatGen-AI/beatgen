import { createFileRoute } from '@tanstack/react-router'
import React from 'react'
import MidiLibrary from '../platform/components/MidiLibrary'
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

export const Route = createFileRoute('/midi-tracks')({
  component: MidiTracksPage,
  // Use requireAuth to protect this route
  ...requireAuth('/home'),
})

function MidiTracksPage() {
  const midiTracksColor = logoColors[3]

  return (
    <div className="p-8">
      <div className="container mx-auto max-w-5xl">
        {/* MIDI Library Component */}
        <FadeCard>
          <FadeCardHeader>
            <FadeCardTitle style={{ color: midiTracksColor }}>
              MIDI Tracks
            </FadeCardTitle>
            <FadeCardDescription>
              Manage your MIDI tracks. Upload new MIDI files or use existing tracks in your projects.
            </FadeCardDescription>
          </FadeCardHeader>
          <FadeCardContent>
            <MidiLibrary sectionColor={midiTracksColor} />
          </FadeCardContent>
        </FadeCard>
      </div>
    </div>
  )
}
