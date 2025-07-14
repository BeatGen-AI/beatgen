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
  const isLoading = status.metadataStatus === 'loading' || status.audioStatus === 'loading' || status.soundfontStatus === 'loading';
  const isComplete = status.metadataStatus === 'success' && status.audioStatus === 'success' && status.soundfontStatus === 'success';
  const hasError = status.metadataStatus === 'error' || status.audioStatus === 'error' || status.soundfontStatus === 'error';
  const isPartial = status.metadataStatus === 'success' && 
                   (status.audioStatus !== 'success' || status.soundfontStatus !== 'success') && 
                   status.audioStatus !== 'error' && status.soundfontStatus !== 'error';

  // Tooltip content
  let tooltipContent = '';
  if (isComplete) {
    tooltipContent = 'Project cached - will load instantly';
  } else if (isLoading) {
    if (status.audioStatus === 'loading' && status.soundfontStatus === 'loading') {
      tooltipContent = `Caching: ${status.cachedTracks}/${status.totalTracks} audio, ${status.cachedSoundfonts}/${status.totalSoundfonts} soundfonts`;
    } else if (status.audioStatus === 'loading') {
      tooltipContent = `Caching audio files... ${status.cachedTracks}/${status.totalTracks} tracks (${status.audioProgress}%)`;
    } else if (status.soundfontStatus === 'loading') {
      tooltipContent = `Caching soundfonts... ${status.cachedSoundfonts}/${status.totalSoundfonts} (${status.soundfontProgress}%)`;
    } else {
      tooltipContent = 'Loading project data...';
    }
  } else if (hasError) {
    tooltipContent = 'Failed to cache project';
  } else if (isPartial) {
    const pendingItems = [];
    if (status.audioStatus !== 'success') pendingItems.push('audio files');
    if (status.soundfontStatus !== 'success') pendingItems.push('soundfonts');
    tooltipContent = `Project data cached, ${pendingItems.join(' and ')} pending`;
  }

  // Icon and color based on status
  let icon: React.ReactNode;
  let className = 'w-4 h-4 ';
  
  if (isComplete) {
    icon = <CachedIcon className={className + 'text-green-500'} />;
  } else if (isLoading) {
    if (status.audioStatus === 'loading' || status.soundfontStatus === 'loading') {
      // Calculate combined progress
      const audioWeight = status.totalTracks > 0 ? 0.7 : 0; // Audio files are typically larger
      const soundfontWeight = status.totalSoundfonts > 0 ? 0.3 : 0;
      const totalWeight = audioWeight + soundfontWeight || 1;
      
      const audioProgress = status.audioStatus === 'loading' ? status.audioProgress : 100;
      const soundfontProgress = status.soundfontStatus === 'loading' ? status.soundfontProgress : 100;
      
      const combinedProgress = Math.round(
        ((audioProgress * audioWeight) + (soundfontProgress * soundfontWeight)) / totalWeight
      );
      
      // Show progress for combined loading
      icon = (
        <div className="relative inline-flex items-center justify-center">
          <CircularProgress 
            size={16} 
            variant="determinate" 
            value={combinedProgress} 
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