import React, { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '../../context/UserContext';

export const CheckoutSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const { refreshSubscription } = useUser();
  
  // Get session_id from URL search params
  const searchParams = new URLSearchParams(window.location.search);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    // Fetch updated subscription status
    const updateStatus = async () => {
      try {
        await refreshSubscription();
      } catch (error) {
        console.error('Error fetching subscription status:', error);
      } finally {
        setLoading(false);
      }
    };

    updateStatus();
  }, [refreshSubscription]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-lg">Confirming your subscription...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="rounded-full bg-green-100 p-3 mx-auto w-fit">
          <CheckCircle2 className="h-16 w-16 text-green-600" />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">Payment Successful!</h1>
          <p className="text-muted-foreground">
            Your subscription has been activated. Welcome to BeatGen Pro!
          </p>
          
          {sessionId && (
            <p className="text-sm text-muted-foreground">
              Session ID: {sessionId}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <Button
            onClick={() => navigate({ to: '/studio' })}
            size="lg"
            className="w-full"
          >
            Go to Studio
          </Button>
          
          <Button
            onClick={() => navigate({ to: '/account/subscription' })}
            variant="outline"
            size="lg"
            className="w-full"
          >
            View Subscription Details
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          A confirmation email has been sent to your registered email address.
        </p>
      </div>
    </div>
  );
};