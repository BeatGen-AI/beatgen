import { createFileRoute } from '@tanstack/react-router';
import { PricingPage } from '../platform/components/subscription';

export const Route = createFileRoute('/pricing')({
  component: PricingPage,
});