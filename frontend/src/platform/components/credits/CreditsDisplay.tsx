import React from 'react';
import { Coins, Infinity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '../../context/UserContext';

interface CreditsDisplayProps {
  isExpanded?: boolean;
}

export const CreditsDisplay: React.FC<CreditsDisplayProps> = ({ isExpanded = true }) => {
  const { credits, creditsLoading: isLoading } = useUser();

  if (isLoading) {
    return (
      <div className={`flex items-center ${isExpanded ? 'gap-2' : 'justify-center'} px-3 py-2`}>
        <Coins className="h-4 w-4 text-muted-foreground" />
        {isExpanded && <Skeleton className="h-4 w-16" />}
      </div>
    );
  }

  if (!credits) {
    return null;
  }

  // When collapsed, show only icon and number
  if (!isExpanded) {
    return (
      <div className="flex items-center justify-center px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors">
        <Coins className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium ml-1">
          {credits.is_unlimited ? '∞' : credits.balance}
        </span>
      </div>
    );
  }

  // When expanded, show full display
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