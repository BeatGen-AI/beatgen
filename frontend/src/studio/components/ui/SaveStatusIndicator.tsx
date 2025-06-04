/**
 * Save Status Indicator Component
 * 
 * Displays the current auto-save status with appropriate icons and styling.
 * Shows saving progress, success states, and error conditions.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  IconCheck, 
  IconAlertTriangle, 
  IconCloudUpload,
  IconLoader2
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  message?: string;
  size?: 'small' | 'medium';
  onRetryClick?: () => void;
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  status,
  message,
  size = 'small',
  onRetryClick
}) => {

  const getStatusConfig = () => {
    switch (status) {
      case 'saving':
        return {
          label: 'Saving...',
          variant: 'secondary' as const,
          icon: <IconLoader2 size={14} className="animate-spin" />,
          tooltip: message || 'Auto-saving changes...',
          className: 'bg-blue-50 text-blue-700 border-blue-200'
        };
      
      case 'saved':
        return {
          label: 'Saved',
          variant: 'secondary' as const,
          icon: <IconCheck size={14} />,
          tooltip: message || 'All changes saved',
          className: 'bg-green-50 text-green-700 border-green-200'
        };
      
      case 'error':
        const isAuthError = message?.toLowerCase().includes('authentication');
        const isNetworkError = message?.toLowerCase().includes('network');
        
        return {
          label: isAuthError ? 'Auth Required' : isNetworkError ? 'Offline' : 'Error',
          variant: 'destructive' as const,
          icon: <IconAlertTriangle size={14} />,
          tooltip: message || 'Auto-save failed. Click to retry.',
          className: 'bg-red-50 text-red-700 border-red-200'
        };
      
      case 'idle':
      default:
        return {
          label: '',
          variant: 'secondary' as const,
          icon: <IconCloudUpload size={14} />,
          tooltip: 'Auto-save enabled',
          className: 'bg-gray-50 text-gray-600 border-gray-200'
        };
    }
  };

  const config = getStatusConfig();

  // Don't render anything for idle state
  if (status === 'idle') {
    return null;
  }

  const badgeElement = (
    <Badge
      variant={config.variant}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium',
        size === 'small' ? 'h-6 text-xs' : 'h-8 text-sm',
        config.className,
        status === 'error' && onRetryClick && 'cursor-pointer hover:opacity-80'
      )}
      onClick={status === 'error' && onRetryClick ? onRetryClick : undefined}
    >
      {config.icon}
      <span>{config.label}</span>
    </Badge>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeElement}
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};