import React, { useEffect, useState } from 'react';
import { creditsApi, CreditsStatus } from '../../api/credits';
import { Coins, Infinity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export const CreditsDisplay: React.FC = () => {
  const [credits, setCredits] = useState<CreditsStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const status = await creditsApi.getStatus();
        setCredits(status);
      } catch (error) {
        console.error('Failed to fetch credits:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCredits();
    
    // Refetch credits every 30 seconds
    const interval = setInterval(fetchCredits, 30000);
    
    return () => clearInterval(interval);
  }, []);

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