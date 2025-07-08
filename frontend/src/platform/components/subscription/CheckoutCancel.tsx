import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const CheckoutCancel: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="rounded-full bg-red-100 p-3 mx-auto w-fit">
          <XCircle className="h-16 w-16 text-red-600" />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">Checkout Cancelled</h1>
          <p className="text-muted-foreground">
            Your payment was cancelled and you have not been charged.
          </p>
          <p className="text-sm text-muted-foreground">
            You can always subscribe later when you're ready.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={() => navigate({ to: '/pricing' })}
            size="lg"
            className="w-full"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Pricing
          </Button>
          
          <Button
            onClick={() => navigate({ to: '/studio' })}
            variant="outline"
            size="lg"
            className="w-full"
          >
            Continue with Free Plan
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Need help? <a href="/support" className="underline hover:no-underline">Contact support</a>
        </p>
      </div>
    </div>
  );
};