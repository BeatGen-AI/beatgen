import React from 'react';
import { Badge } from '../../../components/ui/badge';

interface PlanBadgeProps {
  tier?: string;
  className?: string;
}

const PLAN_CONFIG = {
  FREE: {
    label: 'FREE',
    variant: 'secondary' as const,
    className: 'bg-gray-100 text-gray-800 hover:bg-gray-200'
  },
  STARTER: {
    label: 'STARTER',
    variant: 'default' as const,
    className: 'bg-blue-100 text-blue-800 hover:bg-blue-200'
  },
  CREATOR: {
    label: 'CREATOR',
    variant: 'default' as const,
    className: 'bg-purple-100 text-purple-800 hover:bg-purple-200'
  },
  PRO: {
    label: 'PRO',
    variant: 'default' as const,
    className: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
  }
};

export const PlanBadge: React.FC<PlanBadgeProps> = ({ tier, className = '' }) => {
  const planTier = tier?.toUpperCase() || 'FREE';
  const config = PLAN_CONFIG[planTier as keyof typeof PLAN_CONFIG] || PLAN_CONFIG.FREE;

  return (
    <Badge 
      variant={config.variant}
      className={`${config.className} ${className} font-semibold text-xs`}
    >
      {config.label}
    </Badge>
  );
};