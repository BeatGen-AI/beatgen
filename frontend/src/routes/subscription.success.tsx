import { createFileRoute } from '@tanstack/react-router';
import { CheckoutSuccess } from '../platform/components/subscription';

export const Route = createFileRoute('/subscription/success')({
  component: CheckoutSuccess,
});