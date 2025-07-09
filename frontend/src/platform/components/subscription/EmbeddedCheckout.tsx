import React, { useCallback, useEffect, useState } from 'react';
import { 
  EmbeddedCheckoutProvider,
  EmbeddedCheckout 
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { subscriptionApi } from '../../api/subscriptions';
import { Loader2 } from 'lucide-react';

// Initialize Stripe with publishable key from environment
const isProdEnv = import.meta.env.VITE_APP_ENV !== 'dev';
const stripePublishableKey = isProdEnv 
  ? import.meta.env.PROD_VITE_STRIPE_PUBLISHABLE_KEY
  : import.meta.env.DEV_VITE_STRIPE_PUBLISHABLE_KEY;
if (!stripePublishableKey || stripePublishableKey === 'pk_test_YOUR_PUBLISHABLE_KEY_HERE') {
  const envPrefix = isProdEnv ? 'PROD_VITE' : 'DEV_VITE';
  console.error(`Stripe publishable key is not configured. Please add ${envPrefix}_STRIPE_PUBLISHABLE_KEY to your .env file`);
}

const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

interface EmbeddedCheckoutFormProps {
  priceId: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

export const EmbeddedCheckoutForm: React.FC<EmbeddedCheckoutFormProps> = ({
  priceId,
  onComplete,
  onCancel,
}) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Create checkout session in embedded mode
      // For embedded checkout, we use a single return URL
      const session = await subscriptionApi.createCheckoutSession(
        priceId,
        `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
        `${window.location.origin}/checkout/return`, // Cancel URL not used in embedded mode but required by API
        'embedded' // Use embedded mode
      );

      if (!session.client_secret) {
        throw new Error('No client secret returned from server');
      }

      setClientSecret(session.client_secret);
    } catch (err) {
      console.error('Error creating checkout session:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize checkout');
    } finally {
      setLoading(false);
    }
  }, [priceId]);

  useEffect(() => {
    fetchClientSecret();
  }, [fetchClientSecret]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading checkout...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={fetchClientSecret}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!clientSecret) {
    return null;
  }

  if (!stripePromise) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          Stripe is not configured. Please add your Stripe publishable key to the environment variables.
        </p>
      </div>
    );
  }

  return (
    <EmbeddedCheckoutProvider
      stripe={stripePromise}
      options={{ clientSecret }}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
};

// Wrapper component for the checkout page
interface CheckoutPageProps {
  priceId: string;
  planName: string;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ priceId, planName }) => {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Subscribe to {planName}</h1>
          <p className="mt-2 text-muted-foreground">
            Complete your subscription to unlock all features
          </p>
        </div>
        
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <EmbeddedCheckoutForm priceId={priceId} />
        </div>
      </div>
    </div>
  );
};