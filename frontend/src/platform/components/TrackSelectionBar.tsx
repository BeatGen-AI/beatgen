import React from 'react';
import { Button } from '../../components/ui/button';
import { FolderOpen, X } from 'lucide-react';
import { useTrackSelection } from '../context/TrackSelectionContext';
import { cn } from '../../lib/utils';

interface TrackSelectionBarProps {
  onOpenProject: () => void;
  className?: string;
}

export const TrackSelectionBar: React.FC<TrackSelectionBarProps> = ({ onOpenProject, className }) => {
  const { getSelectedTrackCount, clearSelection } = useTrackSelection();
  const selectedCount = getSelectedTrackCount();

  if (selectedCount === 0) return null;

  return (
    <div className={cn(
      "fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50",
      "bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-4",
      "flex items-center gap-4",
      className
    )}>
      <span className="text-sm font-medium">
        {selectedCount} track{selectedCount > 1 ? 's' : ''} selected
      </span>
      
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={onOpenProject}
          className="flex items-center gap-2"
        >
          <FolderOpen className="w-4 h-4" />
          Open Project with Tracks
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={clearSelection}
          className="flex items-center gap-2"
        >
          <X className="w-4 h-4" />
          Clear
        </Button>
      </div>
    </div>
  );
};