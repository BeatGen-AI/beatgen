export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: 'starter' | 'creator' | 'pro';
  priceId: string;
  priceCents: number;
  billingPeriod: 'monthly' | 'yearly';
  features: {
    projects: number | 'unlimited';
    storage: string;
    exports: number | 'unlimited';
    collaboration?: boolean;
    prioritySupport?: boolean;
    advancedFeatures?: boolean;
  };
}

// Get price IDs from environment variables based on environment
const isProdEnv = import.meta.env.VITE_APP_ENV !== 'dev';

const STARTER_MONTHLY_PRICE_ID = isProdEnv 
  ? import.meta.env.PROD_VITE_STRIPE_STARTER_MONTHLY_PRICE_ID || ''
  : import.meta.env.DEV_VITE_STRIPE_STARTER_MONTHLY_PRICE_ID || '';

const STARTER_YEARLY_PRICE_ID = isProdEnv 
  ? import.meta.env.PROD_VITE_STRIPE_STARTER_YEARLY_PRICE_ID || ''
  : import.meta.env.DEV_VITE_STRIPE_STARTER_YEARLY_PRICE_ID || '';

const CREATOR_MONTHLY_PRICE_ID = isProdEnv 
  ? import.meta.env.PROD_VITE_STRIPE_CREATOR_MONTHLY_PRICE_ID || ''
  : import.meta.env.DEV_VITE_STRIPE_CREATOR_MONTHLY_PRICE_ID || '';

const CREATOR_YEARLY_PRICE_ID = isProdEnv 
  ? import.meta.env.PROD_VITE_STRIPE_CREATOR_YEARLY_PRICE_ID || ''
  : import.meta.env.DEV_VITE_STRIPE_CREATOR_YEARLY_PRICE_ID || '';

const PRO_MONTHLY_PRICE_ID = isProdEnv 
  ? import.meta.env.PROD_VITE_STRIPE_PRO_MONTHLY_PRICE_ID || ''
  : import.meta.env.DEV_VITE_STRIPE_PRO_MONTHLY_PRICE_ID || '';

const PRO_YEARLY_PRICE_ID = isProdEnv 
  ? import.meta.env.PROD_VITE_STRIPE_PRO_YEARLY_PRICE_ID || ''
  : import.meta.env.DEV_VITE_STRIPE_PRO_YEARLY_PRICE_ID || '';

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  // Starter plans
  {
    id: 'starter-monthly',
    name: 'Starter Plan',
    tier: 'starter',
    priceId: STARTER_MONTHLY_PRICE_ID,
    priceCents: 500, // $5.00
    billingPeriod: 'monthly',
    features: {
      projects: 5,
      storage: '1GB',
      exports: 10,
    },
  },
  {
    id: 'starter-yearly',
    name: 'Starter Plan',
    tier: 'starter',
    priceId: STARTER_YEARLY_PRICE_ID,
    priceCents: 5000, // $50.00
    billingPeriod: 'yearly',
    features: {
      projects: 5,
      storage: '1GB',
      exports: 10,
    },
  },
  // Creator plans
  {
    id: 'creator-monthly',
    name: 'Creator Plan',
    tier: 'creator',
    priceId: CREATOR_MONTHLY_PRICE_ID,
    priceCents: 1000, // $10.00
    billingPeriod: 'monthly',
    features: {
      projects: 20,
      storage: '10GB',
      exports: 50,
      collaboration: true,
    },
  },
  {
    id: 'creator-yearly',
    name: 'Creator Plan',
    tier: 'creator',
    priceId: CREATOR_YEARLY_PRICE_ID,
    priceCents: 10000, // $100.00
    billingPeriod: 'yearly',
    features: {
      projects: 20,
      storage: '10GB',
      exports: 50,
      collaboration: true,
    },
  },
  // Pro plans
  {
    id: 'pro-monthly',
    name: 'Pro Plan',
    tier: 'pro',
    priceId: PRO_MONTHLY_PRICE_ID,
    priceCents: 3000, // $30.00
    billingPeriod: 'monthly',
    features: {
      projects: 'unlimited',
      storage: '100GB',
      exports: 'unlimited',
      collaboration: true,
      prioritySupport: true,
      advancedFeatures: true,
    },
  },
  {
    id: 'pro-yearly',
    name: 'Pro Plan',
    tier: 'pro',
    priceId: PRO_YEARLY_PRICE_ID,
    priceCents: 30000, // $300.00
    billingPeriod: 'yearly',
    features: {
      projects: 'unlimited',
      storage: '100GB',
      exports: 'unlimited',
      collaboration: true,
      prioritySupport: true,
      advancedFeatures: true,
    },
  },
];

// Helper functions
export const getPlansByTier = (tier: 'starter' | 'creator' | 'pro') => {
  return SUBSCRIPTION_PLANS.filter(plan => plan.tier === tier);
};

export const getPlanByPriceId = (priceId: string) => {
  return SUBSCRIPTION_PLANS.find(plan => plan.priceId === priceId);
};

export const getMonthlyPlans = () => {
  return SUBSCRIPTION_PLANS.filter(plan => plan.billingPeriod === 'monthly');
};

export const getYearlyPlans = () => {
  return SUBSCRIPTION_PLANS.filter(plan => plan.billingPeriod === 'yearly');
};