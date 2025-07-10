import React from 'react';
import { Coins, Infinity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCredits } from '../../hooks/useCredits';

export const CreditsDisplay: React.FC = () => {
  const { credits, isLoading } = useCredits();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Coins className="h-4 w-4 text-muted-foreground" />
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  if (!credits) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors">
      <Coins className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium">
        {credits.is_unlimited ? (
          <span className="flex items-center gap-1">
            <Infinity className="h-3 w-3" />
            <span>Unlimited</span>
          </span>
        ) : (
          <span>{credits.balance} credits</span>
        )}
      </span>
    </div>
  );
};