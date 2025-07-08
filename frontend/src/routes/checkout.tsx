import { createFileRoute } from '@tanstack/react-router';
import { CheckoutPage as CheckoutPageComponent } from '../platform/components/subscription';

export const Route = createFileRoute('/checkout')({
  component: CheckoutWrapper,
});

function CheckoutWrapper() {
  // Access search params through the route
  const { price_id } = Route.useSearch<{ price_id?: string }>() || {};
  
  if (!price_id) {
    return <CheckoutPageComponent />;
  }
  
  return <CheckoutPageComponent priceId={price_id} />;
}