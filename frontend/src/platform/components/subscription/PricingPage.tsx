import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../auth/auth-context';
import { SUBSCRIPTION_PLANS, getMonthlyPlans, getYearlyPlans } from '../../config/subscription-plans';

export const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription } = useUser();
  const currentPlan = subscription?.plan || null;
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const handleSelectPlan = (priceId: string) => {
    if (!user) {
      // Redirect to login if not authenticated
      navigate({ to: '/login', search: { redirect: '/pricing' } as any });
      return;
    }

    // Navigate to checkout page with the selected plan
    navigate({ 
      to: '/checkout',
      search: { price_id: priceId } as any
    });
  };

  const displayedPlans = billingPeriod === 'monthly' ? getMonthlyPlans() : getYearlyPlans();
  
  // Group plans by tier for display
  const groupedPlans = displayedPlans.reduce((acc, plan) => {
    if (!acc[plan.tier]) {
      acc[plan.tier] = plan;
    }
    return acc;
  }, {} as Record<string, typeof displayedPlans[0]>);

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Choose Your Plan
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Unlock the full potential of BeatGen with our premium features
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <Tabs value={billingPeriod} onValueChange={(value) => setBillingPeriod(value as 'monthly' | 'yearly')}>
            <TabsList className="grid w-[200px] grid-cols-2">
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {['starter', 'creator', 'pro'].map((tierName) => {
            const plan = groupedPlans[tierName];
            if (!plan) return null;
            
            const isCurrentPlan = currentPlan?.tier === plan.tier && currentPlan?.billing_period === plan.billingPeriod;
            const features = plan.features;

            return (
              <Card key={plan.id} className={plan.tier === 'pro' ? 'border-primary' : ''}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    {plan.tier === 'pro' && <Badge>Most Popular</Badge>}
                    {isCurrentPlan && <Badge variant="secondary">Current Plan</Badge>}
                  </div>
                  <CardDescription>
                    <span className="text-3xl font-bold">
                      ${plan.priceCents / 100}
                    </span>
                    <span className="text-muted-foreground">/{plan.billingPeriod}</span>
                    {plan.billingPeriod === 'yearly' && (
                      <p className="text-sm text-green-600 mt-1">
                        Save {Math.round((1 - (plan.priceCents / 12) / (getMonthlyPlans().find(p => p.tier === plan.tier)?.priceCents || 1)) * 100)}%
                      </p>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 shrink-0 text-green-500" />
                      <span className="text-sm">
                        {features.credits === 'unlimited' ? 'Unlimited credits' : `${features.credits} credits per month`}
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      {features.diffusionModels ? (
                        <Check className="h-5 w-5 shrink-0 text-green-500" />
                      ) : (
                        <X className="h-5 w-5 shrink-0 text-red-500" />
                      )}
                      <span className="text-sm">Access to diffusion models</span>
                    </li>
                    <li className="flex items-start gap-3">
                      {features.commercialRights ? (
                        <Check className="h-5 w-5 shrink-0 text-green-500" />
                      ) : (
                        <X className="h-5 w-5 shrink-0 text-red-500" />
                      )}
                      <span className="text-sm">Commercial rights to music</span>
                    </li>
                    <li className="flex items-start gap-3">
                      {features.privateMode ? (
                        <Check className="h-5 w-5 shrink-0 text-green-500" />
                      ) : (
                        <X className="h-5 w-5 shrink-0 text-red-500" />
                      )}
                      <span className="text-sm">Access to private mode</span>
                    </li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={plan.tier === 'pro' ? 'default' : 'outline'}
                    onClick={() => handleSelectPlan(plan.priceId)}
                    disabled={isCurrentPlan || !plan.priceId}
                  >
                    {isCurrentPlan ? 'Current Plan' : !plan.priceId ? 'Not Available' : 'Select Plan'}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};