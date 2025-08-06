/* tslint:disable */
/* eslint-disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

export type BillingPeriod = "monthly" | "yearly";

/**
 * Stripe webhook events for audit trail
 */
export interface PaymentEvent {
  id?: string;
  user_id: string;
  stripe_event_id: string;
  stripe_invoice_id?: string | null;
  stripe_payment_intent_id?: string | null;
  event_type: string;
  amount_cents?: number | null;
  currency?: string | null;
  status?: string | null;
  event_data: {
    [k: string]: unknown;
  };
  created_at?: string;
}
export interface SQLModel {}
/**
 * Maps BeatGen users to Stripe customers
 */
export interface StripeCustomer {
  id?: string;
  user_id: string;
  stripe_customer_id: string;
  created_at?: string;
  updated_at?: string;
}
/**
 * Active user subscriptions
 */
export interface Subscription {
  id?: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  trial_end?: string | null;
  created_at?: string;
  updated_at?: string;
}
/**
 * Available subscription plans
 */
export interface SubscriptionPlan {
  id?: string;
  stripe_product_id: string;
  stripe_price_id: string;
  name: string;
  tier: string;
  price_cents: number;
  currency?: string;
  billing_period: BillingPeriod;
  features?: {
    [k: string]: unknown;
  } | null;
  is_active?: boolean;
  created_at?: string;
}
