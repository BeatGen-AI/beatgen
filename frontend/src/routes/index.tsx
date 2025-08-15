import { createFileRoute, Navigate } from '@tanstack/react-router'
import React from 'react'

// Root route - redirects to /home
export const Route = createFileRoute('/')({
  component: () => <Navigate to="/home" replace />
})