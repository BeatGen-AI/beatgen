import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { EmbeddedCheckoutForm } from './EmbeddedCheckout';
import { PricingDialog } from './PricingDialog';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface CheckoutPageProps {
  priceId?: string;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ priceId }) => {
  const navigate = useNavigate();
  const [showPricing, setShowPricing] = useState(false);

  if (!priceId) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-2xl">
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No plan selected</AlertTitle>
            <AlertDescription>
              Please select a subscription plan to continue with checkout.
            </AlertDescription>
          </Alert>
          
          <div className="text-center">
            <Button 
              onClick={() => setShowPricing(true)}
              className="mr-4"
            >
              View Plans
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate({ to: '/dashboard' })}
            >
              Back to Dashboard
            </Button>
          </div>
          
          <PricingDialog 
            open={showPricing} 
            onOpenChange={setShowPricing} 
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => setShowPricing(true)}
          className="mb-8"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Change Plan
        </Button>

        <div className="rounded-lg border bg-card shadow-sm">
          <EmbeddedCheckoutForm priceId={priceId} />
        </div>
        
        <PricingDialog 
          open={showPricing} 
          onOpenChange={setShowPricing} 
        />
      </div>
    </div>
  );
};