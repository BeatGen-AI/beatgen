import React, { useEffect, useState } from 'react';
import { useSubscriptionStore, selectIsSubscribed, selectCurrentPlan } from '../../stores/subscriptionStore';
import { subscriptionApi } from '../../api/subscriptions';
import { creditsApi, CreditsStatus } from '../../api/credits';
import { Loader2, Crown, AlertCircle, ExternalLink, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';

export const SubscriptionStatus: React.FC = () => {
  const { status, isLoading, error, fetchStatus, cancelSubscription } = useSubscriptionStore();
  const isSubscribed = useSubscriptionStore(selectIsSubscribed);
  const currentPlan = useSubscriptionStore(selectCurrentPlan);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditsStatus | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const creditStatus = await creditsApi.getStatus();
        setCredits(creditStatus);
      } catch (error) {
        console.error('Failed to fetch credits:', error);
      }
    };

    if (status) {
      fetchCredits();
    }
  }, [status]);

  const handleManageSubscription = async () => {
    try {
      const { portal_url } = await subscriptionApi.createPortalSession();
      window.location.href = portal_url;
    } catch (error) {
      console.error('Error opening customer portal:', error);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      setIsCanceling(true);
      setCancelError(null);
      
      await cancelSubscription(true); // Cancel at period end
      
      setShowCancelDialog(false);
    } catch (error) {
      console.error('Error canceling subscription:', error);
      setCancelError(error instanceof Error ? error.message : 'Failed to cancel subscription');
    } finally {
      setIsCanceling(false);
    }
  };

  const handleReactivateSubscription = async () => {
    try {
      setIsCanceling(true);
      setCancelError(null);
      
      // Reactivate the subscription
      await subscriptionApi.reactivateSubscription();
      await fetchStatus(); // Refresh the subscription status
      
      // Clear any error state
      setCancelError(null);
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      // If reactivation fails, fall back to portal
      if (error instanceof Error && error.message.includes('No configuration provided')) {
        // Stripe portal not configured, show helpful message
        setCancelError('Please configure your billing settings first. Contact support for assistance.');
      } else {
        setCancelError(error instanceof Error ? error.message : 'Failed to reactivate subscription');
      }
    } finally {
      setIsCanceling(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!status || status.status === 'inactive') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Active Subscription</CardTitle>
          <CardDescription>
            Upgrade to a paid plan to unlock premium features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.href = '/pricing'}>
            View Plans
          </Button>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = () => {
    switch (status.status) {
      case 'active':
        return <Badge className="bg-green-500">Active</Badge>;
      case 'trialing':
        return <Badge className="bg-blue-500">Trial</Badge>;
      case 'past_due':
        return <Badge className="bg-yellow-500">Past Due</Badge>;
      case 'canceled':
        return <Badge className="bg-gray-500">Canceled</Badge>;
      default:
        return <Badge>{status.status}</Badge>;
    }
  };

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            <CardTitle>{currentPlan?.name || 'Subscription'}</CardTitle>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription>
          {currentPlan?.tier && `${currentPlan.tier.charAt(0).toUpperCase() + currentPlan.tier.slice(1)} Plan`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Price</span>
            <span className="font-medium">
              ${(currentPlan?.price_cents || 0) / 100}/{currentPlan?.billing_period || 'month'}
            </span>
          </div>
          
          {status.current_period_end && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Next billing date</span>
              <span className="font-medium">
                {format(new Date(status.current_period_end), 'MMM d, yyyy')}
              </span>
            </div>
          )}

          {status.trial_end && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Trial ends</span>
              <span className="font-medium">
                {format(new Date(status.trial_end), 'MMM d, yyyy')}
              </span>
            </div>
          )}

          {status.cancel_at_period_end && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your subscription will be canceled at the end of the current billing period.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {credits && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Coins className="h-4 w-4" />
                Credits
              </h4>
              <Button
                variant="link"
                size="sm"
                onClick={() => navigate({ to: '/credits' })}
                className="h-auto p-0"
              >
                View Details
              </Button>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-medium">
                {credits.is_unlimited ? 'Unlimited' : `${credits.balance} credits`}
              </span>
            </div>
            {!credits.is_unlimited && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monthly allocation</span>
                <span className="font-medium">{credits.monthly_allocation} credits</span>
              </div>
            )}
          </div>
        )}

        {currentPlan?.features && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Features</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {Object.entries(currentPlan.features).map(([key, value]) => {
                if (typeof value === 'boolean' && value) {
                  return (
                    <li key={key} className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </li>
                  );
                } else if (typeof value === 'number' && value > 0) {
                  return (
                    <li key={key} className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      {value === -1 ? 'Unlimited' : value} {key.replace(/_/g, ' ')}
                    </li>
                  );
                }
                return null;
              })}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {status.cancel_at_period_end ? (
            <Button 
              onClick={handleReactivateSubscription} 
              className="w-full"
              variant="default"
              disabled={isCanceling}
            >
              {isCanceling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Reactivate Subscription
            </Button>
          ) : (
            <>
              <Button 
                onClick={() => setShowCancelDialog(true)} 
                className="w-full"
                variant="destructive"
                disabled={status.status === 'canceled'}
              >
                Cancel Subscription
              </Button>
              <Button 
                onClick={handleManageSubscription} 
                className="w-full"
                variant="outline"
              >
                Manage Billing
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {cancelError && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{cancelError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>

    <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to cancel your subscription? You'll continue to have access
            until {status.current_period_end ? format(new Date(status.current_period_end), 'MMMM d, yyyy') : 'the end of your billing period'}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCanceling}>Keep Subscription</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleCancelSubscription}
            disabled={isCanceling}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isCanceling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Canceling...
              </>
            ) : (
              'Cancel Subscription'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};