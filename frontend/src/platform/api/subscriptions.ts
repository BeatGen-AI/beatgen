import { apiClient } from './client';

export interface SubscriptionStatus {
  subscription_id?: string;
  stripe_subscription_id?: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';
  plan?: {
    id: string;
    name: string;
    tier: string;
    price_cents: number;
    billing_period: string;
    features: Record<string, any>;
  };
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  trial_end?: string | null;
  message?: string;
}

export interface CheckoutSession {
  checkout_url: string;
  session_id: string;
  client_secret?: string;
}

export const subscriptionApi = {
  async getStatus(): Promise<SubscriptionStatus> {
    const response = await apiClient.get('/subscriptions/status');
    return response.data;
  },

  async createCheckoutSession(
    priceId: string,
    successUrl?: string,
    cancelUrl?: string,
    uiMode: 'hosted' | 'embedded' = 'hosted'
  ): Promise<CheckoutSession> {
    const response = await apiClient.post('/subscriptions/checkout-session', {
      price_id: priceId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      ui_mode: uiMode,
    });
    return response.data;
  },

  async cancelSubscription(atPeriodEnd: boolean = true): Promise<{
    status: string;
    cancel_at?: number | null;
  }> {
    const response = await apiClient.post('/subscriptions/cancel', {
      at_period_end: atPeriodEnd,
    });
    return response.data;
  },

  async createPortalSession(returnUrl?: string): Promise<{ portal_url: string }> {
    const response = await apiClient.post('/subscriptions/portal-session', null, {
      params: returnUrl ? { return_url: returnUrl } : undefined,
    });
    return response.data;
  },
};