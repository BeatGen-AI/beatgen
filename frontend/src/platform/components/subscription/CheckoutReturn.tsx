import React, { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '../../context/UserContext';

export const CheckoutReturn: React.FC = () => {
  const navigate = useNavigate();
  const searchParams = useSearch({ from: '/checkout/return' });
  const sessionId = searchParams.session_id;
  const { refreshSubscription } = useUser();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'canceled' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID found');
      setStatus('error');
      return;
    }

    checkSessionStatus();
  }, [sessionId]);

  const checkSessionStatus = async () => {
    try {
      // In a real implementation, you would verify the session status with your backend
      // For now, we'll assume success if we have a session ID
      // The backend should verify the session with Stripe and update the user's subscription
      
      // Give the webhook a moment to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Refresh subscription status from UserContext
      const subscriptionStatus = await refreshSubscription();
      
      if (subscriptionStatus && (subscriptionStatus.status === 'active' || subscriptionStatus.status === 'trialing')) {
        setStatus('success');
      } else {
        setStatus('canceled');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify payment');
      setStatus('error');
    }
  };

  const handleContinue = () => {
    if (status === 'success') {
      navigate({ to: '/dashboard' });
    } else {
      navigate({ to: '/dashboard' });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-muted-foreground" />
              <CardTitle className="mt-4">Processing your payment...</CardTitle>
              <CardDescription>Please wait while we confirm your subscription</CardDescription>
            </>
          )}
          
          {status === 'success' && (
            <>
              <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
              <CardTitle className="mt-4">Payment successful!</CardTitle>
              <CardDescription>Your subscription is now active</CardDescription>
            </>
          )}
          
          {status === 'canceled' && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-yellow-500" />
              <CardTitle className="mt-4">Payment canceled</CardTitle>
              <CardDescription>Your payment was not completed</CardDescription>
            </>
          )}
          
          {status === 'error' && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-red-500" />
              <CardTitle className="mt-4">Something went wrong</CardTitle>
              <CardDescription>{error || 'Please try again or contact support'}</CardDescription>
            </>
          )}
        </CardHeader>
        
        {status !== 'loading' && (
          <CardContent>
            <Button
              onClick={handleContinue}
              className="w-full"
              variant={status === 'success' ? 'default' : 'outline'}
            >
              {status === 'success' ? 'Continue to Dashboard' : 'Back to Pricing'}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
};