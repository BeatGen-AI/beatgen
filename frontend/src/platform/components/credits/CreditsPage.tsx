import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeCard, FadeCardContent, FadeCardDescription, FadeCardHeader, FadeCardTitle } from '@/components/ui/fade-card';
import { Progress } from '@/components/ui/progress';
import { Coins, Calendar, RefreshCcw, Infinity } from 'lucide-react';
import { format } from 'date-fns';
import { CreditsHistory } from './CreditsHistory';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUser } from '../../context/UserContext';

export const CreditsPage: React.FC = () => {
  const { credits, creditsLoading: isLoading, subscription, refreshCredits } = useUser();
  const currentPlan = subscription?.plan || null;

  // Fetch credits when the page loads (since we don't auto-fetch anymore)
  useEffect(() => {
    if (!credits && !isLoading) {
      console.log('Credits page: fetching credits data...');
      refreshCredits();
    }
  }, [credits, isLoading, refreshCredits]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-8 max-w-4xl">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!credits) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-8 max-w-4xl">
        <Alert variant="destructive">
          <AlertDescription>Failed to load credits information</AlertDescription>
        </Alert>
      </div>
    );
  }

  const progressPercentage = credits.is_unlimited 
    ? 100 
    : Math.min((Number(credits.balance) / credits.monthly_allocation) * 100, 100);

  return (
    <div className="container mx-auto py-8 px-4 md:px-8 max-w-4xl space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Credits</h1>
        <p className="text-muted-foreground mt-2">
          Manage and track your credit usage
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Current Balance Card */}
        <FadeCard>
          <FadeCardHeader>
            <FadeCardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Current Balance
            </FadeCardTitle>
            <FadeCardDescription>
              {credits.subscription_tier ? 
                `${credits.subscription_tier.charAt(0).toUpperCase() + credits.subscription_tier.slice(1)} Plan` :
                'Loading...'
              }
            </FadeCardDescription>
          </FadeCardHeader>
          <FadeCardContent>
            <div className="space-y-4">
              <div className="text-center">
                {credits.is_unlimited ? (
                  <div className="flex items-center justify-center gap-2">
                    <Infinity className="h-12 w-12 text-primary" />
                    <p className="text-4xl font-bold">Unlimited</p>
                  </div>
                ) : (
                  <>
                    <p className="text-4xl font-bold">{credits.balance}</p>
                    <p className="text-sm text-muted-foreground">
                      of {credits.monthly_allocation} credits
                    </p>
                  </>
                )}
              </div>
              
              {!credits.is_unlimited && (
                <Progress value={progressPercentage} className="h-2" />
              )}

              <div className="space-y-2 text-sm">
                {credits.has_rollover && (
                  <div className="flex items-center gap-2 text-green-600">
                    <RefreshCcw className="h-4 w-4" />
                    <span>Unused credits roll over</span>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total used</span>
                  <span className="font-medium">{credits.total_used} credits</span>
                </div>
              </div>
            </div>
          </FadeCardContent>
        </FadeCard>

        {/* Next Allocation Card */}
        <FadeCard>
          <FadeCardHeader>
            <FadeCardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Next Allocation
            </FadeCardTitle>
            <FadeCardDescription>
              Monthly credit refresh
            </FadeCardDescription>
          </FadeCardHeader>
          <FadeCardContent>
            <div className="space-y-4">
              {credits.is_unlimited ? (
                <div className="text-center py-8">
                  <p className="text-lg text-muted-foreground">
                    No allocation needed - you have unlimited credits!
                  </p>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <p className="text-2xl font-bold">
                      +{credits.monthly_allocation} credits
                    </p>
                    {credits.next_allocation_date && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {format(new Date(credits.next_allocation_date), 'MMMM d, yyyy')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Last allocation</span>
                      <span className="font-medium">
                        {format(new Date(credits.last_allocation_date), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </FadeCardContent>
        </FadeCard>
      </div>

      {/* Plan Information */}
      {credits.subscription_tier === 'free' && (
        <Alert>
          <AlertDescription>
            You're on the Free plan with {credits.monthly_allocation} credits per month that don't roll over. 
            Upgrade to a paid plan for more credits and rollover benefits.
          </AlertDescription>
        </Alert>
      )}

      {/* Transaction History */}
      <CreditsHistory />
    </div>
  );
};