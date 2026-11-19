import { getModelCreditCost } from '@/studio/constants/assistantModels';
import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Coins } from 'lucide-react';
import { useAppTheme } from '../../../lib/theme-provider';

interface ChatModelMenuProps {
  triggerLabel: string; // Label for the trigger
  onSelect: (model: string) => void;
  models: string[];
  selectedModel?: string;
  disabled?: boolean;
}

const ChatModelMenu: React.FC<ChatModelMenuProps> = ({ triggerLabel, onSelect, models, selectedModel, disabled }) => {
  const { studioMode } = useAppTheme();
  
  const handleSelect = (model: string) => {
    onSelect(model);
  };

  const getCreditCost = (model: string): number => {
    return getModelCreditCost(model);
  };

  const getTextColor = () => {
    return studioMode === 'dark' ? 'text-gray-400' : 'text-gray-600';
  };

  const getDropdownClassName = () => {
    if (studioMode === 'dark') {
      // Match Material-UI menu styling for dark mode
      return "w-52 z-[9999] p-1 bg-[rgb(48,48,48)] border-0 shadow-lg rounded-lg focus:outline-none";
    }
    // Light mode styling
    return "w-52 z-[9999] p-1 bg-white border border-gray-200 shadow-lg rounded-lg focus:outline-none";
  };

  const getItemClassName = (isSelected: boolean) => {
    const baseClasses = "flex items-center justify-between cursor-pointer min-h-0 transition-colors text-xs rounded";
    const paddingClasses = "px-2 py-1";
    
    if (studioMode === 'dark') {
      // Dark mode: Match Material-UI MenuItem styling
      const textColor = 'text-white';
      const selectedClass = isSelected ? 'bg-[rgba(255,255,255,0.1)]' : '';
      const hoverClass = 'hover:bg-[rgba(255,255,255,0.08)]';
      return `${baseClasses} ${paddingClasses} ${textColor} ${selectedClass} ${hoverClass}`;
    } else {
      // Light mode styling
      const textColor = 'text-gray-900';
      const selectedClass = isSelected ? 'bg-gray-100' : '';
      const hoverClass = 'hover:bg-gray-50';
      return `${baseClasses} ${paddingClasses} ${textColor} ${selectedClass} ${hoverClass}`;
    }
  };


  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Badge 
          variant="secondary"
          className={`cursor-pointer h-5 text-xs border-0 ${
            studioMode === 'dark' 
              ? 'bg-[rgba(60,60,60,0.8)] text-white hover:bg-[rgba(60,60,60,0.9)]'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
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
        className={getDropdownClassName()}
        sideOffset={4}
      >
        {models
          .sort((a, b) => getCreditCost(b) - getCreditCost(a)) // Sort by cost descending
          .map((model) => {
          const cost = getCreditCost(model);
          const isSelected = selectedModel === model;
          
          return (
            <DropdownMenuItem
              key={model}
              onClick={() => handleSelect(model)}
              className={getItemClassName(isSelected)}
            >
              <span className="text-xs font-medium truncate">{model}</span>
              <div className={`text-[10px] font-medium ml-2 shrink-0 flex items-center gap-0.5 ${getTextColor()}`}>
                {cost}
                <Coins/>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ChatModelMenu;