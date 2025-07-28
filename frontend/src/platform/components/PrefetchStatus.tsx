import React from 'react';
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