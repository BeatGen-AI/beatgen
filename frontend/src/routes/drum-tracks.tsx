import { createFileRoute } from '@tanstack/react-router'
import React from 'react'
import DrumLibrary from '../platform/components/DrumLibrary'
import { requireAuth } from '../platform/auth/auth-utils'
import { Container } from '@mui/material'

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
      <Container maxWidth="lg" sx={{ pt: 0, mt: 0 }}>
        <h1 
          className="text-3xl font-bold mb-6"
          style={{ 
            color: drumTracksColor, 
          }}
        >
          Drum Tracks
        </h1>
        <p className="text-muted-foreground mb-6">
          Manage your drum tracks and kits. Create new drum patterns or use existing drum kits.
        </p>
        
        {/* Drum Library Component */}
        <div className="bg-card rounded-lg p-4 shadow-md">
          <DrumLibrary sectionColor={drumTracksColor} />
        </div>
      </Container>
    </div>
  )
}
