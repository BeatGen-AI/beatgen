import { createFileRoute } from '@tanstack/react-router';
import { CheckoutReturn } from '../../platform/components/subscription/CheckoutReturn';

export const Route = createFileRoute('/checkout/return')({
  component: CheckoutReturn,
});