import React from 'react';
import { PricingCheckoutDialog } from './PricingCheckoutDialog';

interface PricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// This is now just a wrapper around PricingCheckoutDialog for backward compatibility
export const PricingDialog: React.FC<PricingDialogProps> = ({ open, onOpenChange }) => {
  return <PricingCheckoutDialog open={open} onOpenChange={onOpenChange} />;
};