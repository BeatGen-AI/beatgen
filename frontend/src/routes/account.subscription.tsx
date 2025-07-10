import { createFileRoute } from '@tanstack/react-router';
import { SubscriptionStatus } from '../platform/components/subscription';

export const Route = createFileRoute('/account/subscription')({
  component: AccountSubscriptionPage,
});

function AccountSubscriptionPage() {
  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Subscription Management</h1>
      <SubscriptionStatus />
    </div>
  );
}