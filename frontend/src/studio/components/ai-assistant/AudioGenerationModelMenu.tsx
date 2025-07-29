import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { useAppTheme } from '../../../lib/theme-provider';
import { getAudioModelInfo } from '../../config/audioModels';
import { 
  getBadgeClassName, 
  getDropdownClassName, 
  getMenuItemClassName, 
  getTextColor 
} from '../../utils/menuStyles';

interface AudioGenerationModelMenuProps {
  triggerLabel: string; // Label for the trigger
  onSelect: (model: string) => void;
  models: string[];
  selectedModel?: string;
  disabled?: boolean;
}

const AudioGenerationModelMenu: React.FC<AudioGenerationModelMenuProps> = ({ 
  triggerLabel, 
  onSelect, 
  models, 
  selectedModel, 
  disabled = false
}) => {
  const { studioMode } = useAppTheme();
  
  const handleSelect = (model: string) => {
    onSelect(model);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Badge 
          variant="secondary"
          className={getBadgeClassName(studioMode, disabled)}
          style={{
            borderRadius: '5px',
            fontSize: '0.7rem'
          }}
        >
          {triggerLabel}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className={getDropdownClassName(studioMode, 'w-52')}
        sideOffset={4}
      >
        {models.map((model) => {
          const modelInfo = getAudioModelInfo(model);
          const isSelected = selectedModel === model;
          
          return (
            <DropdownMenuItem
              key={model}
              onClick={() => handleSelect(model)}
              className={getMenuItemClassName(studioMode, isSelected, 'sm')}
            >
              <span className="text-xs font-medium truncate">{modelInfo.description}</span>
              <div className={`text-[10px] font-medium ml-2 shrink-0 flex items-center gap-0.5 ${getTextColor(studioMode, 'muted')}`}>
                {modelInfo.duration}
                <Clock className="w-3 h-3" />
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AudioGenerationModelMenu;