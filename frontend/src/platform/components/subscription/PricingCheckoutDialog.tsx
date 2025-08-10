import React, { useState } from 'react';
import { Check, X, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../auth/auth-context';
import { SUBSCRIPTION_PLANS, getMonthlyPlans, getYearlyPlans } from '../../config/subscription-plans';
import { EmbeddedCheckoutForm } from './EmbeddedCheckout';
import { PlanBadge } from './PlanBadge';

interface PricingCheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PricingCheckoutDialog: React.FC<PricingCheckoutDialogProps> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const { subscription } = useUser();
  const currentPlan = subscription?.plan || null;
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);

  const handleSelectPlan = (priceId: string) => {
    if (!user) {
      // You might want to redirect to login here
      return;
    }
    setSelectedPriceId(priceId);
  };

  const handleBack = () => {
    setSelectedPriceId(null);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] h-[60vh] !max-w-none sm:!max-w-none max-h-none p-0 flex flex-col">
        {!selectedPriceId ? (
          <div className="flex flex-col h-full overflow-hidden">
            <DialogHeader className="px-6 py-4 border-b shrink-0">
              <DialogTitle className="text-2xl">Choose Your Plan</DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                <span>Unlock the full potential of BeatGen with our premium features</span>
                {currentPlan && (
                  <>
                    <span>•</span>
                    <span>Current plan:</span>
                    <PlanBadge tier={currentPlan.tier} />
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-6 min-h-0">
              <div className="flex justify-center mb-8">
                <Tabs value={billingPeriod} onValueChange={(value) => setBillingPeriod(value as 'monthly' | 'yearly')}>
                  <TabsList className="grid w-[200px] grid-cols-2">
                    <TabsTrigger value="monthly">Monthly</TabsTrigger>
                    <TabsTrigger value="yearly">Yearly</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                {['starter', 'creator', 'pro'].map((tierName) => {
                  const plan = groupedPlans[tierName];
                  if (!plan) return null;
                  
                  // Check if this is the user's current plan (regardless of billing period)
                  const isCurrentPlanTier = currentPlan?.tier?.toLowerCase() === plan.tier;
                  const isExactCurrentPlan = isCurrentPlanTier && currentPlan?.billing_period?.toLowerCase() === plan.billingPeriod;
                  const features = plan.features;

                  return (
                    <Card 
                      key={plan.id} 
                      className={`flex flex-col h-full ${plan.tier === 'pro' ? 'border-primary' : ''} ${isCurrentPlanTier ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    >
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xl">{plan.name}</CardTitle>
                          <div className="flex items-center gap-2">
                            {plan.tier === 'pro' && !isCurrentPlanTier && <Badge>Most Popular</Badge>}
                            {isCurrentPlanTier && <PlanBadge tier={plan.tier.toUpperCase()} />}
                          </div>
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
                      <CardContent className="flex-1">
                        <ul className="space-y-2">
                          <li className="flex items-start gap-2">
                            <Check className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                            <span className="text-sm">
                              {features.credits === 'unlimited' ? 'Unlimited credits' : `${features.credits} credits per month`}
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            {features.diffusionModels ? (
                              <Check className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                            ) : (
                              <X className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                            )}
                            <span className="text-sm">Access to diffusion models</span>
                          </li>
                          <li className="flex items-start gap-2">
                            {features.commercialRights ? (
                              <Check className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                            ) : (
                              <X className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                            )}
                            <span className="text-sm">Commercial rights to music</span>
                          </li>
                          <li className="flex items-start gap-2">
                            {features.privateMode ? (
                              <Check className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                            ) : (
                              <X className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                            )}
                            <span className="text-sm">Access to private mode</span>
                          </li>
                        </ul>
                      </CardContent>
                      <CardFooter className="flex flex-col gap-2">
                        <Button
                          className="w-full"
                          variant={isCurrentPlanTier ? 'secondary' : plan.tier === 'pro' ? 'default' : 'outline'}
                          onClick={() => handleSelectPlan(plan.priceId)}
                          disabled={isExactCurrentPlan || !plan.priceId}
                        >
                          {isExactCurrentPlan 
                            ? 'Your Current Plan' 
                            : isCurrentPlanTier 
                              ? `Switch to ${plan.billingPeriod === 'monthly' ? 'Monthly' : 'Yearly'} Billing`
                              : !plan.priceId 
                                ? 'Not Available' 
                                : 'Select Plan'}
                        </Button>
                        {isCurrentPlanTier && !isExactCurrentPlan && (
                          <p className="text-xs text-muted-foreground text-center">
                            You're on the {currentPlan?.billing_period} plan
                          </p>
                        )}
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="px-6 py-4 border-b shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="mb-2"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Plans
              </Button>
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              <EmbeddedCheckoutForm priceId={selectedPriceId} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};