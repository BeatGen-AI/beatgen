import React from 'react';
import { CircularProgress } from '@mui/material';
import { 
  CloudDownload as DownloadingIcon,
  CloudDone as CachedIcon,
  Cloud as NotCachedIcon,
  CloudOff as ErrorIcon
} from '@mui/icons-material';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { PrefetchStatus as PrefetchStatusType } from '../hooks/useProjectPrefetch';

interface PrefetchStatusProps {
  projectId: string;
  getPrefetchStatus?: (projectId: string) => PrefetchStatusType | undefined;
}

export const PrefetchStatus: React.FC<PrefetchStatusProps> = ({ projectId, getPrefetchStatus }) => {
  if (!getPrefetchStatus) return null;
  
  const status = getPrefetchStatus(projectId);
  if (!status) return null;

  // Determine overall status
  const isLoading = status.metadataStatus === 'loading' || status.audioStatus === 'loading';
  const isComplete = status.metadataStatus === 'success' && status.audioStatus === 'success';
  const hasError = status.metadataStatus === 'error' || status.audioStatus === 'error';
  const isPartial = status.metadataStatus === 'success' && status.audioStatus !== 'success' && status.audioStatus !== 'error';

  // Tooltip content
  let tooltipContent = '';
  if (isComplete) {
    tooltipContent = 'Project cached - will load instantly';
  } else if (isLoading) {
    if (status.audioStatus === 'loading') {
      tooltipContent = `Caching audio files... ${status.cachedTracks}/${status.totalTracks} tracks (${status.audioProgress}%)`;
    } else {
      tooltipContent = 'Loading project data...';
    }
  } else if (hasError) {
    tooltipContent = 'Failed to cache project';
  } else if (isPartial) {
    tooltipContent = 'Project data cached, audio files pending';
  }

  // Icon and color based on status
  let icon: React.ReactNode;
  let className = 'w-4 h-4 ';
  
  if (isComplete) {
    icon = <CachedIcon className={className + 'text-green-500'} />;
  } else if (isLoading) {
    if (status.audioStatus === 'loading') {
      // Show progress for audio loading
      icon = (
        <div className="relative inline-flex items-center justify-center">
          <CircularProgress 
            size={16} 
            variant="determinate" 
            value={status.audioProgress} 
            className="text-blue-500"
            thickness={6}
          />
          <DownloadingIcon className="absolute w-2 h-2 text-blue-500" />
        </div>
      );
    } else {
      icon = <CircularProgress size={16} className="text-blue-500" />;
    }
  } else if (hasError) {
    icon = <ErrorIcon className={className + 'text-red-500'} />;
  } else if (isPartial) {
    icon = <DownloadingIcon className={className + 'text-yellow-500'} />;
  } else {
    return null; // Don't show anything if not started
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center justify-center p-1 rounded bg-background/80 backdrop-blur-sm cursor-help">
            {icon}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{tooltipContent}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default PrefetchStatus;