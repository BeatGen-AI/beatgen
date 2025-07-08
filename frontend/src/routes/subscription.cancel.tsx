import { createFileRoute } from '@tanstack/react-router';
import { CheckoutCancel } from '../platform/components/subscription';

export const Route = createFileRoute('/subscription/cancel')({
  component: CheckoutCancel,
});