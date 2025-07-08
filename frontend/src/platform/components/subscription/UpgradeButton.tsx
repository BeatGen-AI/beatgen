import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PricingDialog } from './PricingDialog';
import { Sparkles } from 'lucide-react';

interface UpgradeButtonProps {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  showIcon?: boolean;
}

export const UpgradeButton: React.FC<UpgradeButtonProps> = ({ 
  variant = 'default', 
  size = 'default',
  className,
  showIcon = true
}) => {
  const [showPricing, setShowPricing] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setShowPricing(true)}
        className={className}
      >
        {showIcon && <Sparkles className="mr-2 h-4 w-4" />}
        Upgrade
      </Button>
      
      <PricingDialog 
        open={showPricing} 
        onOpenChange={setShowPricing} 
      />
    </>
  );
};