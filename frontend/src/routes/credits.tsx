import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '../platform/auth/auth-utils'
import { CreditsPage } from '../platform/components/credits'

export const Route = createFileRoute('/credits')({
  component: CreditsPage,
  ...requireAuth(),
})