import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AssistantActionChipProps {
  action: string;
  onClick: () => void;
}

const AssistantActionChip: React.FC<AssistantActionChipProps> = ({ action, onClick }) => {
  const [isClicked, setIsClicked] = useState(false);
  
  // Create a user-friendly label based on the action type
  const getActionLabel = (actionType: string): string => {
    switch (actionType) {
      case 'add_generated_track':
        return '➕ Add generated track';
      case 'add_track':
        return '➕ Add track';
      case 'adjust_volume':
        return '🔊 Adjust volume';
      case 'toggle_mute':
        return '🔇 Toggle mute';
      case 'change_bpm':
        return '⏱️ Change BPM';
      case 'change_time_signature':
        return '🎵 Change time signature';
      case 'move_track':
        return '↔️ Move track';
      default:
        // Convert snake_case to Title Case with spaces
        return actionType
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
    }
  };

  return (
    <Badge 
      variant="outline"
      className={cn(
        "w-fit rounded-md h-6 px-3 text-xs cursor-pointer transition-colors",
        "border border-blue-500/50 bg-slate-900/90 text-blue-400/90",
        "hover:bg-slate-800/90 hover:border-blue-400/80",
        isClicked && "opacity-70 bg-slate-900/60 border-blue-500/30 text-blue-400/50 cursor-not-allowed",
        !isClicked && "hover:bg-slate-800/90"
      )}
      onClick={!isClicked ? () => {
        onClick();
        setIsClicked(true);
      } : undefined}
    >
      {getActionLabel(action)}
    </Badge>
  );
};

export default AssistantActionChip;
